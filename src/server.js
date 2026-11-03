require('dotenv').config();
const express=require('express'), session=require('express-session'), PgSession=require('connect-pg-simple')(session), helmet=require('helmet'), rateLimit=require('express-rate-limit'), bcrypt=require('bcryptjs'), crypto=require('crypto'), cookieParser=require('cookie-parser'), {z}=require('zod');
const {pool,query}=require('./db');
const app=express();
if(!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length<32) console.warn('WARNING: Set SESSION_SECRET to a random secret of 32+ chars.');
app.set('trust proxy',process.env.TRUST_PROXY==='true' ? 1 : false); app.use(helmet({contentSecurityPolicy:false})); app.use(express.json({limit:'100kb'})); app.use(cookieParser());
app.use(session({store:new PgSession({pool,tableName:'session'}),secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE==='true',maxAge:7*24*60*60*1000}}));
app.use(express.static(require('path').join(__dirname,'../public')));
const limiter=rateLimit({windowMs:15*60*1000,max:100,standardHeaders:true,legacyHeaders:false}); app.use('/api',limiter);
const authLimiter=rateLimit({windowMs:15*60*1000,max:10,standardHeaders:true,legacyHeaders:false});
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
function requireAuth(req,res,next){if(!req.session.user)return res.status(401).json({error:'Authentication required'});next();}
function logActivity(uid,event,metadata={}){return query('INSERT INTO activity(user_id,event,metadata) VALUES($1,$2,$3)',[uid,event,JSON.stringify(metadata)]);}
app.get('/api/health',(req,res)=>res.json({status:'ok',service:'AirDropNexus',timestamp:new Date().toISOString()}));
app.post('/api/auth/register',authLimiter,asyncRoute(async(req,res)=>{
 const body=z.object({email:z.string().email().max(254),password:z.string().min(12).max(128),displayName:z.string().min(2).max(80)}).parse(req.body);
 const exists=await query('SELECT id FROM users WHERE email=$1',[body.email.toLowerCase()]); if(exists.rowCount)return res.status(409).json({error:'Email already registered'});
 const hash=await bcrypt.hash(body.password,12); const r=await query('INSERT INTO users(email,password_hash,display_name) VALUES($1,$2,$3) RETURNING id,email,display_name,role',[body.email.toLowerCase(),hash,body.displayName]);
 req.session.regenerate(async(err)=>{if(err)throw err;req.session.user=r.rows[0];req.session.save(async(saveErr)=>{if(saveErr)throw saveErr;await logActivity(r.rows[0].id,'account_created');res.status(201).json({user:req.session.user});});});
}));
app.post('/api/auth/login',authLimiter,asyncRoute(async(req,res)=>{
 const body=z.object({email:z.string().email(),password:z.string().min(1).max(128)}).parse(req.body); const r=await query('SELECT id,email,password_hash,display_name,role FROM users WHERE email=$1',[body.email.toLowerCase()]);
 if(!r.rowCount||!await bcrypt.compare(body.password,r.rows[0].password_hash))return res.status(401).json({error:'Invalid email or password'});
 const u=r.rows[0];req.session.regenerate(async(err)=>{if(err)throw err;req.session.user={id:u.id,email:u.email,display_name:u.display_name,role:u.role};req.session.save(async(saveErr)=>{if(saveErr)throw saveErr;await logActivity(u.id,'login');res.json({user:req.session.user});});});
}));
app.post('/api/auth/logout',requireAuth,(req,res)=>req.session.destroy((err)=>{if(err)return res.status(500).json({error:'Logout failed'});res.clearCookie('connect.sid',{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE==='true'});res.json({ok:true});}));
app.get('/api/auth/me',(req,res)=>res.json({user:req.session.user||null}));
app.get('/api/dashboard',requireAuth,asyncRoute(async(req,res)=>{
 const uid=req.session.user.id; const [w,c,a]=await Promise.all([query('SELECT count(*)::int n FROM wallets WHERE user_id=$1',[uid]),query('SELECT count(*)::int n FROM campaigns WHERE user_id=$1',[uid]),query('SELECT id,event,metadata,created_at FROM activity WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10',[uid])]);
 res.json({walletCount:w.rows[0].n,campaignCount:c.rows[0].n,activity:a.rows});
}));
app.get('/api/wallets',requireAuth,asyncRoute(async(req,res)=>{const r=await query('SELECT id,address,chain,label,created_at FROM wallets WHERE user_id=$1 ORDER BY created_at DESC',[req.session.user.id]);res.json({wallets:r.rows});}));
app.post('/api/wallets',requireAuth,asyncRoute(async(req,res)=>{const b=z.object({address:z.string().min(8).max(120),chain:z.string().min(2).max(40),label:z.string().max(80).optional()}).parse(req.body);const r=await query('INSERT INTO wallets(user_id,address,chain,label) VALUES($1,$2,$3,$4) RETURNING id,address,chain,label',[req.session.user.id,b.address,b.chain,b.label||'']);await logActivity(req.session.user.id,'wallet_added',{chain:b.chain});res.status(201).json({wallet:r.rows[0]});}));
app.delete('/api/wallets/:id',requireAuth,asyncRoute(async(req,res)=>{const r=await query('DELETE FROM wallets WHERE id=$1 AND user_id=$2',[req.params.id,req.session.user.id]);if(!r.rowCount)return res.status(404).json({error:'Wallet not found'});await logActivity(req.session.user.id,'wallet_removed');res.json({ok:true});}));
app.get('/api/campaigns',requireAuth,asyncRoute(async(req,res)=>{const r=await query('SELECT * FROM campaigns WHERE user_id=$1 ORDER BY updated_at DESC',[req.session.user.id]);res.json({campaigns:r.rows});}));
app.post('/api/campaigns',requireAuth,asyncRoute(async(req,res)=>{const b=z.object({title:z.string().min(2).max(160),projectUrl:z.string().url().optional().or(z.literal('')),status:z.enum(['watching','researching','eligible','claimed','not_eligible','archived']).optional(),notes:z.string().max(5000).optional(),deadline:z.string().datetime().optional()}).parse(req.body);const r=await query('INSERT INTO campaigns(user_id,title,project_url,status,notes,deadline) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.session.user.id,b.title,b.projectUrl||null,b.status||'watching',b.notes||'',b.deadline||null]);await logActivity(req.session.user.id,'campaign_created',{title:b.title});res.status(201).json({campaign:r.rows[0]});}));
app.patch('/api/campaigns/:id',requireAuth,asyncRoute(async(req,res)=>{const b=z.object({title:z.string().min(2).max(160).optional(),projectUrl:z.string().url().optional().or(z.literal('')),status:z.enum(['watching','researching','eligible','claimed','not_eligible','archived']).optional(),notes:z.string().max(5000).optional(),deadline:z.string().datetime().nullable().optional()}).parse(req.body);const r=await query('UPDATE campaigns SET title=COALESCE($3,title),project_url=COALESCE($4,project_url),status=COALESCE($5,status),notes=COALESCE($6,notes),deadline=COALESCE($7,deadline),updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',[req.params.id,req.session.user.id,b.title,b.projectUrl,b.status,b.notes,b.deadline]);if(!r.rowCount)return res.status(404).json({error:'Campaign not found'});res.json({campaign:r.rows[0]});}));
app.delete('/api/campaigns/:id',requireAuth,asyncRoute(async(req,res)=>{const r=await query('DELETE FROM campaigns WHERE id=$1 AND user_id=$2',[req.params.id,req.session.user.id]);if(!r.rowCount)return res.status(404).json({error:'Campaign not found'});res.json({ok:true});}));
app.get('/api/activity',requireAuth,asyncRoute(async(req,res)=>{const r=await query('SELECT id,event,metadata,created_at FROM activity WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.session.user.id]);res.json({activity:r.rows});}));
// Refresh OAuth access tokens safely. X rotates refresh tokens; serialize refreshes per user with a PostgreSQL advisory lock.
async function getValidXAccessToken(userId){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[String(userId)]);
  const r=await client.query('SELECT access_token,refresh_token,expires_at FROM x_oauth_tokens WHERE user_id=$1 FOR UPDATE',[userId]);
  if(!r.rowCount) throw Object.assign(new Error('Connect your X account first'),{status:409});
  const row=r.rows[0], expires=row.expires_at?new Date(row.expires_at).getTime():0;
  if(expires>Date.now()+120000){await client.query('COMMIT');return row.access_token;}
  if(!row.refresh_token) throw Object.assign(new Error('X session expired. Reconnect your X account.'),{status:409,code:'X_RECONNECT'});
  const form=new URLSearchParams({grant_type:'refresh_token',refresh_token:row.refresh_token,client_id:process.env.X_CLIENT_ID});
  const headers={'Content-Type':'application/x-www-form-urlencoded'};
  if(process.env.X_CLIENT_SECRET) headers.Authorization='Basic '+Buffer.from(process.env.X_CLIENT_ID+':'+process.env.X_CLIENT_SECRET).toString('base64');
  const response=await fetch('https://api.twitter.com/2/oauth2/token',{method:'POST',headers,body:form});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token){
   await client.query('ROLLBACK');
   throw Object.assign(new Error('X token refresh failed. Reconnect your X account.'),{status:409,code:'X_RECONNECT'});
  }
  const expiresAt=new Date(Date.now()+(Number(data.expires_in)||7200)*1000);
  await client.query('UPDATE x_oauth_tokens SET access_token=$2,refresh_token=COALESCE($3,refresh_token),expires_at=$4,updated_at=now() WHERE user_id=$1',[userId,data.access_token,data.refresh_token||null,expiresAt]);
  await client.query('COMMIT');
  return data.access_token;
 }catch(e){try{await client.query('ROLLBACK');}catch(rollbackError){} throw e;} finally {client.release();}
}

// X OAuth 2.0 PKCE: requires credentials configured in .env and matching developer portal callback.
app.get('/api/x/connect',requireAuth,(req,res)=>{if(!process.env.X_CLIENT_ID||!process.env.X_CALLBACK_URL)return res.status(503).send('X OAuth credentials are not configured.');const verifier=crypto.randomBytes(32).toString('base64url'),challenge=crypto.createHash('sha256').update(verifier).digest('base64url'),state=crypto.randomBytes(24).toString('hex');req.session.xpkce={verifier,state};const u=new URL('https://twitter.com/i/oauth2/authorize');u.search=new URLSearchParams({response_type:'code',client_id:process.env.X_CLIENT_ID,redirect_uri:process.env.X_CALLBACK_URL,scope:'users.read tweet.read tweet.write like.write offline.access',state,code_challenge:challenge,code_challenge_method:'S256'});res.redirect(u.toString());});
app.get('/api/x/callback',requireAuth,asyncRoute(async(req,res)=>{const {code,state,error}=req.query,stored=req.session.xpkce;if(error||!code||!stored||state!==stored.state)return res.redirect('/?x=connect_failed');const body=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:process.env.X_CALLBACK_URL,code_verifier:stored.verifier});const tokenHeaders={'Content-Type':'application/x-www-form-urlencoded'};if(process.env.X_CLIENT_SECRET)tokenHeaders.Authorization='Basic '+Buffer.from(process.env.X_CLIENT_ID+':'+process.env.X_CLIENT_SECRET).toString('base64');else body.set('client_id',process.env.X_CLIENT_ID);const token=await fetch('https://api.twitter.com/2/oauth2/token',{method:'POST',headers:tokenHeaders,body});const td=await token.json();if(!token.ok)return res.status(502).send('X token exchange failed: '+JSON.stringify(td));const me=await fetch('https://api.twitter.com/2/users/me',{headers:{Authorization:`Bearer ${td.access_token}`}});const md=await me.json();const expiry=new Date(Date.now()+(td.expires_in||7200)*1000);await query('INSERT INTO x_oauth_tokens(user_id,access_token,refresh_token,expires_at,x_user_id,x_username) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET access_token=$2,refresh_token=COALESCE($3,x_oauth_tokens.refresh_token),expires_at=$4,x_user_id=$5,x_username=$6,updated_at=now()',[req.session.user.id,td.access_token,td.refresh_token||null,expiry,md.data?.id||null,md.data?.username||null]);delete req.session.xpkce;await logActivity(req.session.user.id,'x_account_connected',{username:md.data?.username});res.redirect('/?x=connected');}));
app.get('/api/x/status',requireAuth,asyncRoute(async(req,res)=>{const r=await query('SELECT x_username,expires_at FROM x_oauth_tokens WHERE user_id=$1',[req.session.user.id]);res.json({connected:!!r.rowCount,username:r.rows[0]?.x_username||null,expiresAt:r.rows[0]?.expires_at||null});}));
app.post('/api/x/post',requireAuth,asyncRoute(async(req,res)=>{const b=z.object({text:z.string().min(1).max(280)}).parse(req.body);let accessToken;try{accessToken=await getValidXAccessToken(req.session.user.id);}catch(e){return res.status(e.status||502).json({error:e.message,code:e.code||'X_TOKEN_ERROR'});}const api=await fetch('https://api.twitter.com/2/tweets',{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({text:b.text})});const data=await api.json();if(!api.ok)return res.status(api.status).json({error:'X API rejected the post',details:data});await logActivity(req.session.user.id,'x_post_created',{tweetId:data.data?.id});res.status(201).json({tweet:data.data});}));
// X API transient-failure handling: bounded retries for 429 and 5xx responses.
async function fetchXWithRetry(url,options={},maxRetries=2){
 let lastResponse;
 for(let attempt=0;attempt<=maxRetries;attempt++){
  const response=await fetch(url,options);
  if(response.status!==429&&response.status<500)return response;
  lastResponse=response;
  if(attempt===maxRetries)break;
  const retryHeader=Number(response.headers.get('retry-after'));
  const exponential=Math.min(15000,1000*Math(2**attempt));
  const waitMs=response.status===429&&Number.isFinite(retryHeader)&&retryHeader>0
    ?Math.min(30000,retryHeader*1000):exponential;
  await new Promise(resolve=>setTimeout(resolve,waitMs));
 }
 return lastResponse;
}
// ---------- Agent chain detection ----------
const CHAIN_KEYWORDS = {
  Solana: ['solana', '$sol', 'sol ', ' jupiter', 'phantom', 'solan'],
  Bitcoin: ['bitcoin', '$btc', 'btc ', 'taproot', 'satoshi'],
  Polygon: ['polygon', '$pol', ' pol ', '0xpolygon', 'matic'],
  Ethereum: ['ethereum', '$eth', ' eth ', 'erc20', 'eth '],
  'BNB Chain': ['bnb chain', '$bnb', 'bsc', 'binance'],
  Sui: ['sui ', '$sui'],
  TON: ['ton ', '$ton', 'the open network'],
  Base: ['base ', '$base'],
  Arbitrum: ['arbitrum', '$arb'],
  Optimism: ['optimism', '$op'],
  Avalanche: ['avalanche', '$avax'],
  Cosmos: ['cosmos', '$atom'],
  Near: ['near ', '$near'],
  Monad: ['monad', '$mon'],
  Berachain: ['berachain', '$bera'],
  'XRP Ledger': ['xrp', '$xrp', 'ripple'],
};
function detectChain(text){
  const t = text.toLowerCase();
  for(const [chain, keys] of Object.entries(CHAIN_KEYWORDS)){
    if(keys.some(k => t.includes(k))) return chain;
  }
  return null;
}

// ---------- Agent Routes ----------
app.get('/api/agents/config',requireAuth,asyncRoute(async(req,res)=>{
  let r=await query('SELECT * FROM agent_configs WHERE user_id=$1',[req.session.user.id]);
  if(!r.rowCount){
    r=await query('INSERT INTO agent_configs(user_id) VALUES($1) RETURNING *',[req.session.user.id]);
  }
  res.json({config:r.rows[0]});
}));
app.post('/api/agents/config',requireAuth,asyncRoute(async(req,res)=>{
  const b=z.object({enabled:z.boolean().optional(),auto_like:z.boolean().optional(),auto_repost:z.boolean().optional(),auto_reply:z.boolean().optional(),min_delay_sec:z.number().min(1).max(3600).optional(),max_delay_sec:z.number().min(1).max(3600).optional(),max_per_hour:z.number().min(1).max(1000).optional(),chains:z.array(z.string()).optional()}).parse(req.body);
  let r=await query('SELECT id FROM agent_configs WHERE user_id=$1',[req.session.user.id]);
  if(!r.rowCount){
    r=await query('INSERT INTO agent_configs(user_id,enabled,auto_like,auto_repost,auto_reply,min_delay_sec,max_delay_sec,max_per_hour,chains) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[req.session.user.id,b.enabled||false,b.auto_like===true,b.auto_repost===true,b.auto_reply||false,b.min_delay_sec||25,b.max_delay_sec||65,b.max_per_hour||20,JSON.stringify(b.chains||['Solana','Ethereum','BNB Chain','Polygon','Bitcoin','Sui','TON'])]);
  } else {
    const cur=await query('SELECT * FROM agent_configs WHERE user_id=$1',[req.session.user.id]);
    r=await query('UPDATE agent_configs SET enabled=COALESCE($2,enabled),auto_like=COALESCE($3,auto_like),auto_repost=COALESCE($4,auto_repost),auto_reply=COALESCE($5,auto_reply),min_delay_sec=COALESCE($6,min_delay_sec),max_delay_sec=COALESCE($7,max_delay_sec),max_per_hour=COALESCE($8,max_per_hour),chains=COALESCE($9,chains),updated_at=now() WHERE user_id=$1 RETURNING *',[req.session.user.id,b.enabled,b.auto_like,b.auto_repost,b.auto_reply,b.min_delay_sec,b.max_delay_sec,b.max_per_hour,b.chains?JSON.stringify(b.chains):null]);
  }
  res.json({config:r.rows[0]});
}));
app.post('/api/agents/toggle',requireAuth,asyncRoute(async(req,res)=>{
  const r=await query('UPDATE agent_configs SET enabled=NOT enabled,updated_at=now() WHERE user_id=$1 RETURNING enabled',[req.session.user.id]);
  if(!r.rowCount)return res.status(404).json({error:'Config not found'});
  res.json({enabled:r.rows[0].enabled});
}));
app.get('/api/agents/targets',requireAuth,asyncRoute(async(req,res)=>{
  const r=await query('SELECT * FROM agent_targets WHERE user_id=$1 ORDER BY created_at DESC',[req.session.user.id]);
  res.json({targets:r.rows});
}));
app.post('/api/agents/targets',requireAuth,asyncRoute(async(req,res)=>{
  const b=z.object({target_type:z.enum(['account','hashtag']),target_value:z.string().min(1).max(200)}).parse(req.body);
  const r=await query('INSERT INTO agent_targets(user_id,target_type,target_value) VALUES($1,$2,$3) RETURNING *',[req.session.user.id,b.target_type,b.target_value]);
  res.status(201).json({target:r.rows[0]});
}));
app.delete('/api/agents/targets/:id',requireAuth,asyncRoute(async(req,res)=>{
  const r=await query('DELETE FROM agent_targets WHERE id=$1 AND user_id=$2',[req.params.id,req.session.user.id]);
  if(!r.rowCount)return res.status(404).json({error:'Target not found'});
  res.json({ok:true});
}));
app.get('/api/agents/monitoring',requireAuth,asyncRoute(async(req,res)=>{
 const uid=req.session.user.id;
 const [cfg,totals,recent]=await Promise.all([
  query('SELECT enabled,auto_like,auto_repost,auto_reply,max_per_hour FROM agent_configs WHERE user_id=$1',[uid]),
  query("SELECT count(*) FILTER(WHERE status='success')::int AS succeeded,count(*) FILTER(WHERE status='failed')::int AS failed,count(*) FILTER(WHERE status='discovered')::int AS discovered,count(*) FILTER(WHERE created_at>now()-interval '24 hours' AND status='success' AND action IN ('like','repost'))::int AS actions_24h,max(created_at) AS last_activity FROM agent_executions WHERE user_id=$1",[uid]),
  query('SELECT action,status,message,created_at,target_post_id FROM agent_executions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 8',[uid])
 ]);
 const c=cfg.rows[0]||{},t=totals.rows[0];
 res.json({enabled:!!c.enabled,actions:{like:!!c.auto_like,repost:!!c.auto_repost,reply:!!c.auto_reply},maxPerHour:Number(c.max_per_hour||20),metrics:{succeeded:t.succeeded,failed:t.failed,discovered:t.discovered,actions24h:Number(t.actions_24h),lastActivity:t.last_activity},recent:recent.rows});
}));
app.post('/api/agents/control',requireAuth,asyncRoute(async(req,res)=>{
 const b=z.object({enabled:z.boolean()}).parse(req.body);
 const r=await query('INSERT INTO agent_configs(user_id,enabled) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET enabled=$2,updated_at=now() RETURNING enabled',[req.session.user.id,b.enabled]);
 await logActivity(req.session.user.id,b.enabled?'agents_resumed':'agents_paused');
 res.json({enabled:r.rows[0].enabled});
}));
app.get('/api/agents/logs',requireAuth,asyncRoute(async(req,res)=>{
  const page=Math.max(1,parseInt(req.query.page,10)||1);
  const limit=Math.min(50,Math.max(5,parseInt(req.query.limit,10)||20));
  const offset=(page-1)*limit;
  const status=['success','failed','discovered'].includes(req.query.status)?req.query.status:null;
  const action=['like','repost','reply','discover'].includes(req.query.action)?req.query.action:null;
  const params=[req.session.user.id];let where='user_id=$1';
  if(status){params.push(status);where+=' AND status=
async function runAgentsForUserUnlocked(uid){

 const cfgR=await query('SELECT * FROM agent_configs WHERE user_id=$1',[uid]);
 if(!cfgR.rowCount||!cfgR.rows[0].enabled)return {status:400,error:'Enable and save agent settings first.'};
 const cfg=cfgR.rows[0];
 if(!cfg.auto_like&&!cfg.auto_repost&&!cfg.auto_reply)return {status:400,error:'Enable at least one action in Agent settings.'};
 if(cfg.auto_reply)return {status:400,error:'Auto-reply unavailable; turn it off to run Like/Repost.'};
 const targets=(await query('SELECT id,target_type,target_value FROM agent_targets WHERE user_id=$1 AND enabled=true',[uid])).rows;
 if(!targets.length)return {status:400,error:'Add enabled targets first.'};
 const xAccount=await query('SELECT x_user_id,x_username FROM x_oauth_tokens WHERE user_id=$1',[uid]);
 if(!xAccount.rowCount||!xAccount.rows[0].x_user_id)return {status:409,error:'Connect your X account first.'};
 let accessToken;try{accessToken=await getValidXAccessToken(uid);}catch(e){return {status:e.status||502,error:e.message,code:e.code||'X_TOKEN_ERROR'};}
 const selfId=xAccount.rows[0].x_user_id, queries=[];
 for(const t of targets){
  let q='';
  if(t.target_type==='hashtag'){const tag=t.target_value.replace(/^#/,'').trim();if(!/^[A-Za-z0-9_]{1,100}$/.test(tag))continue;q='#'+tag;}
  else {const handle=t.target_value.replace(/^@/,'').trim();if(!/^[A-Za-z0-9_]{1,15}$/.test(handle))continue;q='from:'+handle;}
  queries.push({target:t,query:q});
 }
 if(!queries.length)return {status:400,error:'Targets need valid X handles or hashtags.'};
 const discovered=[],errors=[];
 for(const item of queries.slice(0,8)){
  try{
   const url=new URL('https://api.x.com/2/tweets/search/recent');
   url.searchParams.set('query',item.query+' -is:retweet -is:reply');
   url.searchParams.set('max_results','10');
   url.searchParams.set('tweet.fields','created_at,author_id,public_metrics');
   const api=await fetchXWithRetry(url,{headers:{Authorization:'Bearer '+accessToken}},2);
   const data=await api.json().catch(()=>({}));
   if(!api.ok){errors.push({target:item.query,status:api.status,message:data.detail||data.title||'X search failed'});continue;}
   for(const tweet of (data.data||[]))if(tweet.author_id!==selfId)discovered.push({id:tweet.id,text:tweet.text,authorId:tweet.author_id,createdAt:tweet.created_at,metrics:tweet.public_metrics||{},target:item.query});
  }catch{errors.push({target:item.query,message:'Network error querying X'});}
 }
 const unique=[...new Map(discovered.map(t=>[t.id,t])).values()].slice(0,50);
 let hourly=await query("SELECT count(*)::int n FROM agent_executions WHERE user_id=$1 AND status='success' AND action IN ('like','repost') AND created_at>now()-interval '1 hour'",[uid]);
 let remaining=Math.max(0,Number(cfg.max_per_hour)-hourly.rows[0].n),executed=[],skipped=0;
 for(const tweet of unique){
  if(remaining<=0){skipped++;continue;}
  for(const action of ['like','repost']){
   if(action==='like'&&!cfg.auto_like||action==='repost'&&!cfg.auto_repost)continue;
   if(remaining<=0){skipped++;break;}
   const exists=await query("SELECT id FROM agent_executions WHERE user_id=$1 AND action=$2 AND target_post_id=$3 AND status='success'",[uid,action,tweet.id]);
   if(exists.rowCount)continue;
   const min=Math.max(1,Number(cfg.min_delay_sec)||1),max=Math.max(min,Number(cfg.max_delay_sec)||min);
   if(executed.length)await new Promise(resolve=>setTimeout(resolve,(min+Math.floor(Math.random()*(max-min+1)))*1000));
   let endpoint,body;
   if(action==='like'){endpoint='https://api.x.com/2/users/'+encodeURIComponent(selfId)+'/likes';body={tweet_id:tweet.id};}
   else{endpoint='https://api.x.com/2/users/'+encodeURIComponent(selfId)+'/retweets';body={tweet_id:tweet.id};}
   try{
    const api=await fetchXWithRetry(endpoint,{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify(body)},2);
    const data=await api.json().catch(()=>({}));
    if(api.ok){
     await query("INSERT INTO agent_executions(user_id,action,target_post_id,target_account,chain,status,message) VALUES($1,$2,$3,$4,$5,'success',$6)",[uid,action,tweet.id,String(tweet.authorId),detectChain(tweet.text),tweet.target,'Confirmed by X API']);
     executed.push({action,tweetId:tweet.id,target:tweet.target});remaining--;
    }else{
     const msg=data.detail||data.title||'X API rejected action';
     await query("INSERT INTO agent_executions(user_id,action,target_post_id,target_account,chain,status,message) VALUES($1,$2,$3,$4,$5,'failed',$6)",[uid,action,tweet.id,String(tweet.authorId),detectChain(tweet.text),tweet.target,String(msg).slice(0,500)]);
     errors.push({action,tweetId:tweet.id,status:api.status,message:msg});
     if(api.status===401||api.status===403||api.status===429)break;
    }
   }catch(err){
    const msg='Network error calling X action endpoint';
    try{
     await query("INSERT INTO agent_executions(user_id,action,target_post_id,target_account,chain,status,message) VALUES($1,$2,$3,$4,$5,'failed',$6)",[uid,action,tweet.id,String(tweet.authorId),detectChain(tweet.text),tweet.target,msg]);
    }catch(logErr){console.error('Could not persist failed agent execution',logErr);}
    errors.push({action,tweetId:tweet.id,code:'NETWORK_ERROR',message:msg});
   }
  }
 }
 await logActivity(uid,'agent_run_completed',{discovered:unique.length,executed:executed.length,skipped});
 return {ok:true,mode:'live_api',discovered:unique.length,executed,executedCount:executed.length,remainingHourly:remaining,skipped,errors,message:'Only actions confirmed by X are marked successful. Auto-replies remain disabled.'};

}
// Per-user session advisory lock: manual and scheduled runs cannot overlap for one account.
async function runAgentsForUser(uid){
 const lockClient=await pool.connect();
 let locked=false;
 try{
  const lock=await lockClient.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',['airdropnexus:user-agent:'+String(uid)]);
  locked=lock.rows[0].locked;
  if(!locked)return {status:409,error:'An agent cycle is already running for this account.',retryAfterSeconds:30};
  return await runAgentsForUserUnlocked(uid);
 }finally{
  if(locked){try{await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))',['airdropnexus:user-agent:'+String(uid)]);}catch(e){console.error('User agent lock release failed',e);}}
  lockClient.release();
 }
}
app.post('/api/agents/run',requireAuth,asyncRoute(async(req,res)=>{const result=await runAgentsForUser(req.session.user.id);if(result.status)return res.status(result.status).json(result);res.json(result);}));
// GitHub Actions scheduler ingress. Configure SCHEDULER_SECRET (32+ chars) on the server.
app.post('/api/internal/scheduler/run',asyncRoute(async(req,res)=>{
 const expected=process.env.SCHEDULER_SECRET||'';
 const supplied=(req.get('authorization')||'').replace(/^Bearer\\s+/i,'');
 if(expected.length<32||supplied.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return res.status(401).json({error:'Unauthorized scheduler'});
 // A session-level advisory lock prevents overlapping cron/manual dispatches.
 const lockClient=await pool.connect();
 let locked=false;
 try{
  const lock=await lockClient.query("SELECT pg_try_advisory_lock(hashtext('airdropnexus:global-agent-scheduler')) AS locked");
  locked=lock.rows[0].locked;
  if(!locked)return res.status(409).json({error:'Scheduler is already running',retryAfterSeconds:60});
  const users=(await query('SELECT user_id FROM agent_configs WHERE enabled=true ORDER BY updated_at ASC LIMIT 100')).rows;
  const results=[];
  for(const row of users){
   try{const result=await runAgentsForUser(row.user_id);results.push({userId:row.user_id,ok:!!result.ok,discovered:result.discovered||0,executedCount:result.executedCount||0,error:result.error||null});}
   catch{results.push({userId:row.user_id,ok:false,error:'Agent run failed'});}
  }
  res.json({ok:true,scheduler:'completed',usersProcessed:results.length,executed:results.reduce((n,r)=>n+r.executedCount,0)});
 }finally{
  if(locked){try{await lockClient.query("SELECT pg_advisory_unlock(hashtext('airdropnexus:global-agent-scheduler'))");}catch(e){console.error('Scheduler lock release failed',e);}}
  lockClient.release();
 }
}));
app.use((err,req,res,next)=>{console.error(err);if(err.name==='ZodError')return res.status(400).json({error:'Invalid request',details:err.errors});res.status(500).json({error:process.env.NODE_ENV==='production'?'Internal server error':err.message});});
const port=process.env.PORT||3000;app.listen(port,()=>console.log(`AirDropNexus listening on ${port}`));
+params.length;}
  if(action){params.push(action);where+=' AND action=
async function runAgentsForUserUnlocked(uid){

 const cfgR=await query('SELECT * FROM agent_configs WHERE user_id=$1',[uid]);
 if(!cfgR.rowCount||!cfgR.rows[0].enabled)return {status:400,error:'Enable and save agent settings first.'};
 const cfg=cfgR.rows[0];
 if(!cfg.auto_like&&!cfg.auto_repost&&!cfg.auto_reply)return {status:400,error:'Enable at least one action in Agent settings.'};
 if(cfg.auto_reply)return {status:400,error:'Auto-reply unavailable; turn it off to run Like/Repost.'};
 const targets=(await query('SELECT id,target_type,target_value FROM agent_targets WHERE user_id=$1 AND enabled=true',[uid])).rows;
 if(!targets.length)return {status:400,error:'Add enabled targets first.'};
 const xAccount=await query('SELECT x_user_id,x_username FROM x_oauth_tokens WHERE user_id=$1',[uid]);
 if(!xAccount.rowCount||!xAccount.rows[0].x_user_id)return {status:409,error:'Connect your X account first.'};
 let accessToken;try{accessToken=await getValidXAccessToken(uid);}catch(e){return {status:e.status||502,error:e.message,code:e.code||'X_TOKEN_ERROR'};}
 const selfId=xAccount.rows[0].x_user_id, queries=[];
 for(const t of targets){
  let q='';
  if(t.target_type==='hashtag'){const tag=t.target_value.replace(/^#/,'').trim();if(!/^[A-Za-z0-9_]{1,100}$/.test(tag))continue;q='#'+tag;}
  else {const handle=t.target_value.replace(/^@/,'').trim();if(!/^[A-Za-z0-9_]{1,15}$/.test(handle))continue;q='from:'+handle;}
  queries.push({target:t,query:q});
 }
 if(!queries.length)return {status:400,error:'Targets need valid X handles or hashtags.'};
 const discovered=[],errors=[];
 for(const item of queries.slice(0,8)){
  try{
   const url=new URL('https://api.x.com/2/tweets/search/recent');
   url.searchParams.set('query',item.query+' -is:retweet -is:reply');
   url.searchParams.set('max_results','10');
   url.searchParams.set('tweet.fields','created_at,author_id,public_metrics');
   const api=await fetchXWithRetry(url,{headers:{Authorization:'Bearer '+accessToken}},2);
   const data=await api.json().catch(()=>({}));
   if(!api.ok){errors.push({target:item.query,status:api.status,message:data.detail||data.title||'X search failed'});continue;}
   for(const tweet of (data.data||[]))if(tweet.author_id!==selfId)discovered.push({id:tweet.id,text:tweet.text,authorId:tweet.author_id,createdAt:tweet.created_at,metrics:tweet.public_metrics||{},target:item.query});
  }catch{errors.push({target:item.query,message:'Network error querying X'});}
 }
 const unique=[...new Map(discovered.map(t=>[t.id,t])).values()].slice(0,50);
 let hourly=await query("SELECT count(*)::int n FROM agent_executions WHERE user_id=$1 AND status='success' AND action IN ('like','repost') AND created_at>now()-interval '1 hour'",[uid]);
 let remaining=Math.max(0,Number(cfg.max_per_hour)-hourly.rows[0].n),executed=[],skipped=0;
 for(const tweet of unique){
  if(remaining<=0){skipped++;continue;}
  for(const action of ['like','repost']){
   if(action==='like'&&!cfg.auto_like||action==='repost'&&!cfg.auto_repost)continue;
   if(remaining<=0){skipped++;break;}
   const exists=await query("SELECT id FROM agent_executions WHERE user_id=$1 AND action=$2 AND target_post_id=$3 AND status='success'",[uid,action,tweet.id]);
   if(exists.rowCount)continue;
   const min=Math.max(1,Number(cfg.min_delay_sec)||1),max=Math.max(min,Number(cfg.max_delay_sec)||min);
   if(executed.length)await new Promise(resolve=>setTimeout(resolve,(min+Math.floor(Math.random()*(max-min+1)))*1000));
   let endpoint,body;
   if(action==='like'){endpoint='https://api.x.com/2/users/'+encodeURIComponent(selfId)+'/likes';body={tweet_id:tweet.id};}
   else{endpoint='https://api.x.com/2/users/'+encodeURIComponent(selfId)+'/retweets';body={tweet_id:tweet.id};}
   try{
    const api=await fetchXWithRetry(endpoint,{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify(body)},2);
    const data=await api.json().catch(()=>({}));
    if(api.ok){
     await query("INSERT INTO agent_executions(user_id,action,target_post_id,target_account,chain,status,message) VALUES($1,$2,$3,$4,$5,'success',$6)",[uid,action,tweet.id,String(tweet.authorId),detectChain(tweet.text),tweet.target,'Confirmed by X API']);
     executed.push({action,tweetId:tweet.id,target:tweet.target});remaining--;
    }else{
     const msg=data.detail||data.title||'X API rejected action';
     await query("INSERT INTO agent_executions(user_id,action,target_post_id,target_account,chain,status,message) VALUES($1,$2,$3,$4,$5,'failed',$6)",[uid,action,tweet.id,String(tweet.authorId),detectChain(tweet.text),tweet.target,String(msg).slice(0,500)]);
     errors.push({action,tweetId:tweet.id,status:api.status,message:msg});
     if(api.status===401||api.status===403||api.status===429)break;
    }
   }catch(err){
    const msg='Network error calling X action endpoint';
    try{
     await query("INSERT INTO agent_executions(user_id,action,target_post_id,target_account,chain,status,message) VALUES($1,$2,$3,$4,$5,'failed',$6)",[uid,action,tweet.id,String(tweet.authorId),detectChain(tweet.text),tweet.target,msg]);
    }catch(logErr){console.error('Could not persist failed agent execution',logErr);}
    errors.push({action,tweetId:tweet.id,code:'NETWORK_ERROR',message:msg});
   }
  }
 }
 await logActivity(uid,'agent_run_completed',{discovered:unique.length,executed:executed.length,skipped});
 return {ok:true,mode:'live_api',discovered:unique.length,executed,executedCount:executed.length,remainingHourly:remaining,skipped,errors,message:'Only actions confirmed by X are marked successful. Auto-replies remain disabled.'};

}
// Per-user session advisory lock: manual and scheduled runs cannot overlap for one account.
async function runAgentsForUser(uid){
 const lockClient=await pool.connect();
 let locked=false;
 try{
  const lock=await lockClient.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',['airdropnexus:user-agent:'+String(uid)]);
  locked=lock.rows[0].locked;
  if(!locked)return {status:409,error:'An agent cycle is already running for this account.',retryAfterSeconds:30};
  return await runAgentsForUserUnlocked(uid);
 }finally{
  if(locked){try{await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))',['airdropnexus:user-agent:'+String(uid)]);}catch(e){console.error('User agent lock release failed',e);}}
  lockClient.release();
 }
}
app.post('/api/agents/run',requireAuth,asyncRoute(async(req,res)=>{const result=await runAgentsForUser(req.session.user.id);if(result.status)return res.status(result.status).json(result);res.json(result);}));
// GitHub Actions scheduler ingress. Configure SCHEDULER_SECRET (32+ chars) on the server.
app.post('/api/internal/scheduler/run',asyncRoute(async(req,res)=>{
 const expected=process.env.SCHEDULER_SECRET||'';
 const supplied=(req.get('authorization')||'').replace(/^Bearer\\s+/i,'');
 if(expected.length<32||supplied.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return res.status(401).json({error:'Unauthorized scheduler'});
 // A session-level advisory lock prevents overlapping cron/manual dispatches.
 const lockClient=await pool.connect();
 let locked=false;
 try{
  const lock=await lockClient.query("SELECT pg_try_advisory_lock(hashtext('airdropnexus:global-agent-scheduler')) AS locked");
  locked=lock.rows[0].locked;
  if(!locked)return res.status(409).json({error:'Scheduler is already running',retryAfterSeconds:60});
  const users=(await query('SELECT user_id FROM agent_configs WHERE enabled=true ORDER BY updated_at ASC LIMIT 100')).rows;
  const results=[];
  for(const row of users){
   try{const result=await runAgentsForUser(row.user_id);results.push({userId:row.user_id,ok:!!result.ok,discovered:result.discovered||0,executedCount:result.executedCount||0,error:result.error||null});}
   catch{results.push({userId:row.user_id,ok:false,error:'Agent run failed'});}
  }
  res.json({ok:true,scheduler:'completed',usersProcessed:results.length,executed:results.reduce((n,r)=>n+r.executedCount,0)});
 }finally{
  if(locked){try{await lockClient.query("SELECT pg_advisory_unlock(hashtext('airdropnexus:global-agent-scheduler'))");}catch(e){console.error('Scheduler lock release failed',e);}}
  lockClient.release();
 }
}));
app.use((err,req,res,next)=>{console.error(err);if(err.name==='ZodError')return res.status(400).json({error:'Invalid request',details:err.errors});res.status(500).json({error:process.env.NODE_ENV==='production'?'Internal server error':err.message});});
const port=process.env.PORT||3000;app.listen(port,()=>console.log(`AirDropNexus listening on ${port}`));
+params.length;}
  const count=await query('SELECT count(*)::int total FROM agent_executions WHERE '+where,params);
  params.push(limit,offset);
  const rows=await query('SELECT id,action,status,message,created_at,target_post_id,target_account,chain,wallet_address FROM agent_executions WHERE '+where+' ORDER BY created_at DESC LIMIT 
async function runAgentsForUserUnlocked(uid){

 const cfgR=await query('SELECT * FROM agent_configs WHERE user_id=$1',[uid]);
 if(!cfgR.rowCount||!cfgR.rows[0].enabled)return {status:400,error:'Enable and save agent settings first.'};
 const cfg=cfgR.rows[0];
 if(!cfg.auto_like&&!cfg.auto_repost&&!cfg.auto_reply)return {status:400,error:'Enable at least one action in Agent settings.'};
 if(cfg.auto_reply)return {status:400,error:'Auto-reply unavailable; turn it off to run Like/Repost.'};
 const targets=(await query('SELECT id,target_type,target_value FROM agent_targets WHERE user_id=$1 AND enabled=true',[uid])).rows;
 if(!targets.length)return {status:400,error:'Add enabled targets first.'};
 const xAccount=await query('SELECT x_user_id,x_username FROM x_oauth_tokens WHERE user_id=$1',[uid]);
 if(!xAccount.rowCount||!xAccount.rows[0].x_user_id)return {status:409,error:'Connect your X account first.'};
 let accessToken;try{accessToken=await getValidXAccessToken(uid);}catch(e){return {status:e.status||502,error:e.message,code:e.code||'X_TOKEN_ERROR'};}
 const selfId=xAccount.rows[0].x_user_id, queries=[];
 for(const t of targets){
  let q='';
  if(t.target_type==='hashtag'){const tag=t.target_value.replace(/^#/,'').trim();if(!/^[A-Za-z0-9_]{1,100}$/.test(tag))continue;q='#'+tag;}
  else {const handle=t.target_value.replace(/^@/,'').trim();if(!/^[A-Za-z0-9_]{1,15}$/.test(handle))continue;q='from:'+handle;}
  queries.push({target:t,query:q});
 }
 if(!queries.length)return {status:400,error:'Targets need valid X handles or hashtags.'};
 const discovered=[],errors=[];
 for(const item of queries.slice(0,8)){
  try{
   const url=new URL('https://api.x.com/2/tweets/search/recent');
   url.searchParams.set('query',item.query+' -is:retweet -is:reply');
   url.searchParams.set('max_results','10');
   url.searchParams.set('tweet.fields','created_at,author_id,public_metrics');
   const api=await fetchXWithRetry(url,{headers:{Authorization:'Bearer '+accessToken}},2);
   const data=await api.json().catch(()=>({}));
   if(!api.ok){errors.push({target:item.query,status:api.status,message:data.detail||data.title||'X search failed'});continue;}
   for(const tweet of (data.data||[]))if(tweet.author_id!==selfId)discovered.push({id:tweet.id,text:tweet.text,authorId:tweet.author_id,createdAt:tweet.created_at,metrics:tweet.public_metrics||{},target:item.query});
  }catch{errors.push({target:item.query,message:'Network error querying X'});}
 }
 const unique=[...new Map(discovered.map(t=>[t.id,t])).values()].slice(0,50);
 let hourly=await query("SELECT count(*)::int n FROM agent_executions WHERE user_id=$1 AND status='success' AND action IN ('like','repost') AND created_at>now()-interval '1 hour'",[uid]);
 let remaining=Math.max(0,Number(cfg.max_per_hour)-hourly.rows[0].n),executed=[],skipped=0;
 for(const tweet of unique){
  if(remaining<=0){skipped++;continue;}
  for(const action of ['like','repost']){
   if(action==='like'&&!cfg.auto_like||action==='repost'&&!cfg.auto_repost)continue;
   if(remaining<=0){skipped++;break;}
   const exists=await query("SELECT id FROM agent_executions WHERE user_id=$1 AND action=$2 AND target_post_id=$3 AND status='success'",[uid,action,tweet.id]);
   if(exists.rowCount)continue;
   const min=Math.max(1,Number(cfg.min_delay_sec)||1),max=Math.max(min,Number(cfg.max_delay_sec)||min);
   if(executed.length)await new Promise(resolve=>setTimeout(resolve,(min+Math.floor(Math.random()*(max-min+1)))*1000));
   let endpoint,body;
   if(action==='like'){endpoint='https://api.x.com/2/users/'+encodeURIComponent(selfId)+'/likes';body={tweet_id:tweet.id};}
   else{endpoint='https://api.x.com/2/users/'+encodeURIComponent(selfId)+'/retweets';body={tweet_id:tweet.id};}
   try{
    const api=await fetchXWithRetry(endpoint,{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify(body)},2);
    const data=await api.json().catch(()=>({}));
    if(api.ok){
     await query("INSERT INTO agent_executions(user_id,action,target_post_id,target_account,chain,status,message) VALUES($1,$2,$3,$4,$5,'success',$6)",[uid,action,tweet.id,String(tweet.authorId),detectChain(tweet.text),tweet.target,'Confirmed by X API']);
     executed.push({action,tweetId:tweet.id,target:tweet.target});remaining--;
    }else{
     const msg=data.detail||data.title||'X API rejected action';
     await query("INSERT INTO agent_executions(user_id,action,target_post_id,target_account,chain,status,message) VALUES($1,$2,$3,$4,$5,'failed',$6)",[uid,action,tweet.id,String(tweet.authorId),detectChain(tweet.text),tweet.target,String(msg).slice(0,500)]);
     errors.push({action,tweetId:tweet.id,status:api.status,message:msg});
     if(api.status===401||api.status===403||api.status===429)break;
    }
   }catch(err){
    const msg='Network error calling X action endpoint';
    try{
     await query("INSERT INTO agent_executions(user_id,action,target_post_id,target_account,chain,status,message) VALUES($1,$2,$3,$4,$5,'failed',$6)",[uid,action,tweet.id,String(tweet.authorId),detectChain(tweet.text),tweet.target,msg]);
    }catch(logErr){console.error('Could not persist failed agent execution',logErr);}
    errors.push({action,tweetId:tweet.id,code:'NETWORK_ERROR',message:msg});
   }
  }
 }
 await logActivity(uid,'agent_run_completed',{discovered:unique.length,executed:executed.length,skipped});
 return {ok:true,mode:'live_api',discovered:unique.length,executed,executedCount:executed.length,remainingHourly:remaining,skipped,errors,message:'Only actions confirmed by X are marked successful. Auto-replies remain disabled.'};

}
// Per-user session advisory lock: manual and scheduled runs cannot overlap for one account.
async function runAgentsForUser(uid){
 const lockClient=await pool.connect();
 let locked=false;
 try{
  const lock=await lockClient.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',['airdropnexus:user-agent:'+String(uid)]);
  locked=lock.rows[0].locked;
  if(!locked)return {status:409,error:'An agent cycle is already running for this account.',retryAfterSeconds:30};
  return await runAgentsForUserUnlocked(uid);
 }finally{
  if(locked){try{await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))',['airdropnexus:user-agent:'+String(uid)]);}catch(e){console.error('User agent lock release failed',e);}}
  lockClient.release();
 }
}
app.post('/api/agents/run',requireAuth,asyncRoute(async(req,res)=>{const result=await runAgentsForUser(req.session.user.id);if(result.status)return res.status(result.status).json(result);res.json(result);}));
// GitHub Actions scheduler ingress. Configure SCHEDULER_SECRET (32+ chars) on the server.
app.post('/api/internal/scheduler/run',asyncRoute(async(req,res)=>{
 const expected=process.env.SCHEDULER_SECRET||'';
 const supplied=(req.get('authorization')||'').replace(/^Bearer\\s+/i,'');
 if(expected.length<32||supplied.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return res.status(401).json({error:'Unauthorized scheduler'});
 // A session-level advisory lock prevents overlapping cron/manual dispatches.
 const lockClient=await pool.connect();
 let locked=false;
 try{
  const lock=await lockClient.query("SELECT pg_try_advisory_lock(hashtext('airdropnexus:global-agent-scheduler')) AS locked");
  locked=lock.rows[0].locked;
  if(!locked)return res.status(409).json({error:'Scheduler is already running',retryAfterSeconds:60});
  const users=(await query('SELECT user_id FROM agent_configs WHERE enabled=true ORDER BY updated_at ASC LIMIT 100')).rows;
  const results=[];
  for(const row of users){
   try{const result=await runAgentsForUser(row.user_id);results.push({userId:row.user_id,ok:!!result.ok,discovered:result.discovered||0,executedCount:result.executedCount||0,error:result.error||null});}
   catch{results.push({userId:row.user_id,ok:false,error:'Agent run failed'});}
  }
  res.json({ok:true,scheduler:'completed',usersProcessed:results.length,executed:results.reduce((n,r)=>n+r.executedCount,0)});
 }finally{
  if(locked){try{await lockClient.query("SELECT pg_advisory_unlock(hashtext('airdropnexus:global-agent-scheduler'))");}catch(e){console.error('Scheduler lock release failed',e);}}
  lockClient.release();
 }
}));
app.use((err,req,res,next)=>{console.error(err);if(err.name==='ZodError')return res.status(400).json({error:'Invalid request',details:err.errors});res.status(500).json({error:process.env.NODE_ENV==='production'?'Internal server error':err.message});});
const port=process.env.PORT||3000;app.listen(port,()=>console.log(`AirDropNexus listening on ${port}`));
+(params.length-1)+' OFFSET 
async function runAgentsForUserUnlocked(uid){

 const cfgR=await query('SELECT * FROM agent_configs WHERE user_id=$1',[uid]);
 if(!cfgR.rowCount||!cfgR.rows[0].enabled)return {status:400,error:'Enable and save agent settings first.'};
 const cfg=cfgR.rows[0];
 if(!cfg.auto_like&&!cfg.auto_repost&&!cfg.auto_reply)return {status:400,error:'Enable at least one action in Agent settings.'};
 if(cfg.auto_reply)return {status:400,error:'Auto-reply unavailable; turn it off to run Like/Repost.'};
 const targets=(await query('SELECT id,target_type,target_value FROM agent_targets WHERE user_id=$1 AND enabled=true',[uid])).rows;
 if(!targets.length)return {status:400,error:'Add enabled targets first.'};
 const xAccount=await query('SELECT x_user_id,x_username FROM x_oauth_tokens WHERE user_id=$1',[uid]);
 if(!xAccount.rowCount||!xAccount.rows[0].x_user_id)return {status:409,error:'Connect your X account first.'};
 let accessToken;try{accessToken=await getValidXAccessToken(uid);}catch(e){return {status:e.status||502,error:e.message,code:e.code||'X_TOKEN_ERROR'};}
 const selfId=xAccount.rows[0].x_user_id, queries=[];
 for(const t of targets){
  let q='';
  if(t.target_type==='hashtag'){const tag=t.target_value.replace(/^#/,'').trim();if(!/^[A-Za-z0-9_]{1,100}$/.test(tag))continue;q='#'+tag;}
  else {const handle=t.target_value.replace(/^@/,'').trim();if(!/^[A-Za-z0-9_]{1,15}$/.test(handle))continue;q='from:'+handle;}
  queries.push({target:t,query:q});
 }
 if(!queries.length)return {status:400,error:'Targets need valid X handles or hashtags.'};
 const discovered=[],errors=[];
 for(const item of queries.slice(0,8)){
  try{
   const url=new URL('https://api.x.com/2/tweets/search/recent');
   url.searchParams.set('query',item.query+' -is:retweet -is:reply');
   url.searchParams.set('max_results','10');
   url.searchParams.set('tweet.fields','created_at,author_id,public_metrics');
   const api=await fetchXWithRetry(url,{headers:{Authorization:'Bearer '+accessToken}},2);
   const data=await api.json().catch(()=>({}));
   if(!api.ok){errors.push({target:item.query,status:api.status,message:data.detail||data.title||'X search failed'});continue;}
   for(const tweet of (data.data||[]))if(tweet.author_id!==selfId)discovered.push({id:tweet.id,text:tweet.text,authorId:tweet.author_id,createdAt:tweet.created_at,metrics:tweet.public_metrics||{},target:item.query});
  }catch{errors.push({target:item.query,message:'Network error querying X'});}
 }
 const unique=[...new Map(discovered.map(t=>[t.id,t])).values()].slice(0,50);
 let hourly=await query("SELECT count(*)::int n FROM agent_executions WHERE user_id=$1 AND status='success' AND action IN ('like','repost') AND created_at>now()-interval '1 hour'",[uid]);
 let remaining=Math.max(0,Number(cfg.max_per_hour)-hourly.rows[0].n),executed=[],skipped=0;
 for(const tweet of unique){
  if(remaining<=0){skipped++;continue;}
  for(const action of ['like','repost']){
   if(action==='like'&&!cfg.auto_like||action==='repost'&&!cfg.auto_repost)continue;
   if(remaining<=0){skipped++;break;}
   const exists=await query("SELECT id FROM agent_executions WHERE user_id=$1 AND action=$2 AND target_post_id=$3 AND status='success'",[uid,action,tweet.id]);
   if(exists.rowCount)continue;
   const min=Math.max(1,Number(cfg.min_delay_sec)||1),max=Math.max(min,Number(cfg.max_delay_sec)||min);
   if(executed.length)await new Promise(resolve=>setTimeout(resolve,(min+Math.floor(Math.random()*(max-min+1)))*1000));
   let endpoint,body;
   if(action==='like'){endpoint='https://api.x.com/2/users/'+encodeURIComponent(selfId)+'/likes';body={tweet_id:tweet.id};}
   else{endpoint='https://api.x.com/2/users/'+encodeURIComponent(selfId)+'/retweets';body={tweet_id:tweet.id};}
   try{
    const api=await fetchXWithRetry(endpoint,{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify(body)},2);
    const data=await api.json().catch(()=>({}));
    if(api.ok){
     await query("INSERT INTO agent_executions(user_id,action,target_post_id,target_account,chain,status,message) VALUES($1,$2,$3,$4,$5,'success',$6)",[uid,action,tweet.id,String(tweet.authorId),detectChain(tweet.text),tweet.target,'Confirmed by X API']);
     executed.push({action,tweetId:tweet.id,target:tweet.target});remaining--;
    }else{
     const msg=data.detail||data.title||'X API rejected action';
     await query("INSERT INTO agent_executions(user_id,action,target_post_id,target_account,chain,status,message) VALUES($1,$2,$3,$4,$5,'failed',$6)",[uid,action,tweet.id,String(tweet.authorId),detectChain(tweet.text),tweet.target,String(msg).slice(0,500)]);
     errors.push({action,tweetId:tweet.id,status:api.status,message:msg});
     if(api.status===401||api.status===403||api.status===429)break;
    }
   }catch(err){
    const msg='Network error calling X action endpoint';
    try{
     await query("INSERT INTO agent_executions(user_id,action,target_post_id,target_account,chain,status,message) VALUES($1,$2,$3,$4,$5,'failed',$6)",[uid,action,tweet.id,String(tweet.authorId),detectChain(tweet.text),tweet.target,msg]);
    }catch(logErr){console.error('Could not persist failed agent execution',logErr);}
    errors.push({action,tweetId:tweet.id,code:'NETWORK_ERROR',message:msg});
   }
  }
 }
 await logActivity(uid,'agent_run_completed',{discovered:unique.length,executed:executed.length,skipped});
 return {ok:true,mode:'live_api',discovered:unique.length,executed,executedCount:executed.length,remainingHourly:remaining,skipped,errors,message:'Only actions confirmed by X are marked successful. Auto-replies remain disabled.'};

}
// Per-user session advisory lock: manual and scheduled runs cannot overlap for one account.
async function runAgentsForUser(uid){
 const lockClient=await pool.connect();
 let locked=false;
 try{
  const lock=await lockClient.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',['airdropnexus:user-agent:'+String(uid)]);
  locked=lock.rows[0].locked;
  if(!locked)return {status:409,error:'An agent cycle is already running for this account.',retryAfterSeconds:30};
  return await runAgentsForUserUnlocked(uid);
 }finally{
  if(locked){try{await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))',['airdropnexus:user-agent:'+String(uid)]);}catch(e){console.error('User agent lock release failed',e);}}
  lockClient.release();
 }
}
app.post('/api/agents/run',requireAuth,asyncRoute(async(req,res)=>{const result=await runAgentsForUser(req.session.user.id);if(result.status)return res.status(result.status).json(result);res.json(result);}));
// GitHub Actions scheduler ingress. Configure SCHEDULER_SECRET (32+ chars) on the server.
app.post('/api/internal/scheduler/run',asyncRoute(async(req,res)=>{
 const expected=process.env.SCHEDULER_SECRET||'';
 const supplied=(req.get('authorization')||'').replace(/^Bearer\\s+/i,'');
 if(expected.length<32||supplied.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return res.status(401).json({error:'Unauthorized scheduler'});
 // A session-level advisory lock prevents overlapping cron/manual dispatches.
 const lockClient=await pool.connect();
 let locked=false;
 try{
  const lock=await lockClient.query("SELECT pg_try_advisory_lock(hashtext('airdropnexus:global-agent-scheduler')) AS locked");
  locked=lock.rows[0].locked;
  if(!locked)return res.status(409).json({error:'Scheduler is already running',retryAfterSeconds:60});
  const users=(await query('SELECT user_id FROM agent_configs WHERE enabled=true ORDER BY updated_at ASC LIMIT 100')).rows;
  const results=[];
  for(const row of users){
   try{const result=await runAgentsForUser(row.user_id);results.push({userId:row.user_id,ok:!!result.ok,discovered:result.discovered||0,executedCount:result.executedCount||0,error:result.error||null});}
   catch{results.push({userId:row.user_id,ok:false,error:'Agent run failed'});}
  }
  res.json({ok:true,scheduler:'completed',usersProcessed:results.length,executed:results.reduce((n,r)=>n+r.executedCount,0)});
 }finally{
  if(locked){try{await lockClient.query("SELECT pg_advisory_unlock(hashtext('airdropnexus:global-agent-scheduler'))");}catch(e){console.error('Scheduler lock release failed',e);}}
  lockClient.release();
 }
}));
app.use((err,req,res,next)=>{console.error(err);if(err.name==='ZodError')return res.status(400).json({error:'Invalid request',details:err.errors});res.status(500).json({error:process.env.NODE_ENV==='production'?'Internal server error':err.message});});
const port=process.env.PORT||3000;app.listen(port,()=>console.log(`AirDropNexus listening on ${port}`));
+params.length,params);
  res.json({logs:rows.rows,total:count.rows[0].total,page,limit,totalPages:Math.max(1,Math.ceil(count.rows[0].total/limit))});
}));
async function runAgentsForUserUnlocked(uid){

 const cfgR=await query('SELECT * FROM agent_configs WHERE user_id=$1',[uid]);
 if(!cfgR.rowCount||!cfgR.rows[0].enabled)return {status:400,error:'Enable and save agent settings first.'};
 const cfg=cfgR.rows[0];
 if(!cfg.auto_like&&!cfg.auto_repost&&!cfg.auto_reply)return {status:400,error:'Enable at least one action in Agent settings.'};
 if(cfg.auto_reply)return {status:400,error:'Auto-reply unavailable; turn it off to run Like/Repost.'};
 const targets=(await query('SELECT id,target_type,target_value FROM agent_targets WHERE user_id=$1 AND enabled=true',[uid])).rows;
 if(!targets.length)return {status:400,error:'Add enabled targets first.'};
 const xAccount=await query('SELECT x_user_id,x_username FROM x_oauth_tokens WHERE user_id=$1',[uid]);
 if(!xAccount.rowCount||!xAccount.rows[0].x_user_id)return {status:409,error:'Connect your X account first.'};
 let accessToken;try{accessToken=await getValidXAccessToken(uid);}catch(e){return {status:e.status||502,error:e.message,code:e.code||'X_TOKEN_ERROR'};}
 const selfId=xAccount.rows[0].x_user_id, queries=[];
 for(const t of targets){
  let q='';
  if(t.target_type==='hashtag'){const tag=t.target_value.replace(/^#/,'').trim();if(!/^[A-Za-z0-9_]{1,100}$/.test(tag))continue;q='#'+tag;}
  else {const handle=t.target_value.replace(/^@/,'').trim();if(!/^[A-Za-z0-9_]{1,15}$/.test(handle))continue;q='from:'+handle;}
  queries.push({target:t,query:q});
 }
 if(!queries.length)return {status:400,error:'Targets need valid X handles or hashtags.'};
 const discovered=[],errors=[];
 for(const item of queries.slice(0,8)){
  try{
   const url=new URL('https://api.x.com/2/tweets/search/recent');
   url.searchParams.set('query',item.query+' -is:retweet -is:reply');
   url.searchParams.set('max_results','10');
   url.searchParams.set('tweet.fields','created_at,author_id,public_metrics');
   const api=await fetchXWithRetry(url,{headers:{Authorization:'Bearer '+accessToken}},2);
   const data=await api.json().catch(()=>({}));
   if(!api.ok){errors.push({target:item.query,status:api.status,message:data.detail||data.title||'X search failed'});continue;}
   for(const tweet of (data.data||[]))if(tweet.author_id!==selfId)discovered.push({id:tweet.id,text:tweet.text,authorId:tweet.author_id,createdAt:tweet.created_at,metrics:tweet.public_metrics||{},target:item.query});
  }catch{errors.push({target:item.query,message:'Network error querying X'});}
 }
 const unique=[...new Map(discovered.map(t=>[t.id,t])).values()].slice(0,50);
 let hourly=await query("SELECT count(*)::int n FROM agent_executions WHERE user_id=$1 AND status='success' AND action IN ('like','repost') AND created_at>now()-interval '1 hour'",[uid]);
 let remaining=Math.max(0,Number(cfg.max_per_hour)-hourly.rows[0].n),executed=[],skipped=0;
 for(const tweet of unique){
  if(remaining<=0){skipped++;continue;}
  for(const action of ['like','repost']){
   if(action==='like'&&!cfg.auto_like||action==='repost'&&!cfg.auto_repost)continue;
   if(remaining<=0){skipped++;break;}
   const exists=await query("SELECT id FROM agent_executions WHERE user_id=$1 AND action=$2 AND target_post_id=$3 AND status='success'",[uid,action,tweet.id]);
   if(exists.rowCount)continue;
   const min=Math.max(1,Number(cfg.min_delay_sec)||1),max=Math.max(min,Number(cfg.max_delay_sec)||min);
   if(executed.length)await new Promise(resolve=>setTimeout(resolve,(min+Math.floor(Math.random()*(max-min+1)))*1000));
   let endpoint,body;
   if(action==='like'){endpoint='https://api.x.com/2/users/'+encodeURIComponent(selfId)+'/likes';body={tweet_id:tweet.id};}
   else{endpoint='https://api.x.com/2/users/'+encodeURIComponent(selfId)+'/retweets';body={tweet_id:tweet.id};}
   try{
    const api=await fetchXWithRetry(endpoint,{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify(body)},2);
    const data=await api.json().catch(()=>({}));
    if(api.ok){
     await query("INSERT INTO agent_executions(user_id,action,target_post_id,target_account,chain,status,message) VALUES($1,$2,$3,$4,$5,'success',$6)",[uid,action,tweet.id,String(tweet.authorId),detectChain(tweet.text),tweet.target,'Confirmed by X API']);
     executed.push({action,tweetId:tweet.id,target:tweet.target});remaining--;
    }else{
     const msg=data.detail||data.title||'X API rejected action';
     await query("INSERT INTO agent_executions(user_id,action,target_post_id,target_account,chain,status,message) VALUES($1,$2,$3,$4,$5,'failed',$6)",[uid,action,tweet.id,String(tweet.authorId),detectChain(tweet.text),tweet.target,String(msg).slice(0,500)]);
     errors.push({action,tweetId:tweet.id,status:api.status,message:msg});
     if(api.status===401||api.status===403||api.status===429)break;
    }
   }catch(err){
    const msg='Network error calling X action endpoint';
    try{
     await query("INSERT INTO agent_executions(user_id,action,target_post_id,target_account,chain,status,message) VALUES($1,$2,$3,$4,$5,'failed',$6)",[uid,action,tweet.id,String(tweet.authorId),detectChain(tweet.text),tweet.target,msg]);
    }catch(logErr){console.error('Could not persist failed agent execution',logErr);}
    errors.push({action,tweetId:tweet.id,code:'NETWORK_ERROR',message:msg});
   }
  }
 }
 await logActivity(uid,'agent_run_completed',{discovered:unique.length,executed:executed.length,skipped});
 return {ok:true,mode:'live_api',discovered:unique.length,executed,executedCount:executed.length,remainingHourly:remaining,skipped,errors,message:'Only actions confirmed by X are marked successful. Auto-replies remain disabled.'};

}
// Per-user session advisory lock: manual and scheduled runs cannot overlap for one account.
async function runAgentsForUser(uid){
 const lockClient=await pool.connect();
 let locked=false;
 try{
  const lock=await lockClient.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',['airdropnexus:user-agent:'+String(uid)]);
  locked=lock.rows[0].locked;
  if(!locked)return {status:409,error:'An agent cycle is already running for this account.',retryAfterSeconds:30};
  return await runAgentsForUserUnlocked(uid);
 }finally{
  if(locked){try{await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))',['airdropnexus:user-agent:'+String(uid)]);}catch(e){console.error('User agent lock release failed',e);}}
  lockClient.release();
 }
}
app.post('/api/agents/run',requireAuth,asyncRoute(async(req,res)=>{const result=await runAgentsForUser(req.session.user.id);if(result.status)return res.status(result.status).json(result);res.json(result);}));
// GitHub Actions scheduler ingress. Configure SCHEDULER_SECRET (32+ chars) on the server.
app.post('/api/internal/scheduler/run',asyncRoute(async(req,res)=>{
 const expected=process.env.SCHEDULER_SECRET||'';
 const supplied=(req.get('authorization')||'').replace(/^Bearer\\s+/i,'');
 if(expected.length<32||supplied.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return res.status(401).json({error:'Unauthorized scheduler'});
 // A session-level advisory lock prevents overlapping cron/manual dispatches.
 const lockClient=await pool.connect();
 let locked=false;
 try{
  const lock=await lockClient.query("SELECT pg_try_advisory_lock(hashtext('airdropnexus:global-agent-scheduler')) AS locked");
  locked=lock.rows[0].locked;
  if(!locked)return res.status(409).json({error:'Scheduler is already running',retryAfterSeconds:60});
  const users=(await query('SELECT user_id FROM agent_configs WHERE enabled=true ORDER BY updated_at ASC LIMIT 100')).rows;
  const results=[];
  for(const row of users){
   try{const result=await runAgentsForUser(row.user_id);results.push({userId:row.user_id,ok:!!result.ok,discovered:result.discovered||0,executedCount:result.executedCount||0,error:result.error||null});}
   catch{results.push({userId:row.user_id,ok:false,error:'Agent run failed'});}
  }
  res.json({ok:true,scheduler:'completed',usersProcessed:results.length,executed:results.reduce((n,r)=>n+r.executedCount,0)});
 }finally{
  if(locked){try{await lockClient.query("SELECT pg_advisory_unlock(hashtext('airdropnexus:global-agent-scheduler'))");}catch(e){console.error('Scheduler lock release failed',e);}}
  lockClient.release();
 }
}));
app.use((err,req,res,next)=>{console.error(err);if(err.name==='ZodError')return res.status(400).json({error:'Invalid request',details:err.errors});res.status(500).json({error:process.env.NODE_ENV==='production'?'Internal server error':err.message});});
const port=process.env.PORT||3000;app.listen(port,()=>console.log(`AirDropNexus listening on ${port}`));
