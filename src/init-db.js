require('dotenv').config();
const fs = require('fs'); const path = require('path'); const { pool } = require('./db');
(async()=>{ try { await pool.query(fs.readFileSync(path.join(__dirname,'../db/schema.sql'),'utf8')); console.log('Database schema initialized.'); } catch(e){ console.error(e.message); process.exitCode=1; } finally { await pool.end(); } })();
