/* ============================================================
   AirDropNexus — Professional Frontend
   Integrates with Express/PostgreSQL backend APIs
   ============================================================ */

const API = '/api';
let currentUser = null;
let charts = {};
let scene, camera, renderer, particles;

// ---------- Core API ----------
async function api(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  let d;
  try { d = await r.json(); } catch { d = {}; }
  if (!r.ok) throw Error(d.error || `Request failed (${r.status})`);
  return d;
}

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, type = 'emerald') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'fixed bottom-6 right-6 z-50 glass px-4 py-3 rounded-xl border border-white/10 text-sm font-semibold shadow-2xl ' +
    (type === 'emerald' ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-rose-300 border-rose-500/30 bg-rose-500/10');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ---------- Auth ----------
function switchTab(m) {
  document.getElementById('loginTab').classList.toggle('active', m === 'login');
  document.getElementById('registerTab').classList.toggle('active', m === 'register');
  document.getElementById('registerFields').classList.toggle('hidden', m !== 'register');
  document.getElementById('password').minLength = m === 'register' ? 12 : 1;
  document.getElementById('authSubmit').textContent = m === 'login' ? 'Sign in' : 'Create account';
  document.getElementById('authMessage').classList.add('hidden');
  document.getElementById('authMode').value = m;
}
document.getElementById('loginTab').onclick = () => switchTab('login');
document.getElementById('registerTab').onclick = () => switchTab('register');

document.getElementById('authForm').onsubmit = async (e) => {
  e.preventDefault();
  const mode = document.getElementById('authMode').value;
  const b = {
    email: document.getElementById('email').value.toLowerCase(),
    password: document.getElementById('password').value
  };
  if (mode === 'register') b.displayName = document.getElementById('displayName').value;
  const submit = document.getElementById('authSubmit');
  submit.disabled = true;
  try {
    const d = await api('/auth/' + (mode === 'login' ? 'login' : 'register'), { method: 'POST', body: JSON.stringify(b) });
    currentUser = d.user;
    showApp();
  } catch (err) {
    const m = document.getElementById('authMessage');
    m.textContent = err.message;
    m.classList.remove('hidden');
  } finally {
    submit.disabled = false;
  }
};

async function showApp() {
  document.getElementById('authView').classList.add('hidden');
  document.getElementById('appView').classList.remove('hidden');
  await loadDashboard();
}

document.getElementById('btnLogout').onclick = async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch {}
  currentUser = null;
  document.getElementById('appView').classList.add('hidden');
  document.getElementById('authView').classList.remove('hidden');
  document.getElementById('authForm').reset();
  switchTab('login');
};

// ---------- View Switching ----------
function switchView(view) {
  document.querySelectorAll('.nav-btn').forEach(b => {
    const isActive = b.textContent.trim().toLowerCase() === view;
    b.classList.toggle('active', isActive);
    b.classList.toggle('text-emerald-400', isActive);
    b.classList.toggle('text-slate-400', !isActive);
  });
  document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
  document.getElementById('view-' + view).classList.remove('hidden');

  if (view === 'dashboard') loadDashboard();
  if (view === 'wallets') loadWallets();
  if (view === 'campaigns') loadCampaigns();
  if (view === 'activity') loadActivityFull();
  if (view === 'x') { loadXStatus(); loadAgentConfig(); loadAgentTargets(); loadAgentLogs(); }
}

// Chain chip toggle
document.querySelectorAll('.agent-chain-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    chip.classList.toggle('active');
  });
});

// Save config on any settings change
['agentEnabled','agentAutoLike','agentAutoRepost','agentAutoReply','agentMinDelay','agentMaxDelay','agentMaxHour'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', saveAgentConfig);
});

// Attach nav button click handlers
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.textContent.trim().toLowerCase();
    switchView(view);
  });
});

// ---------- Dashboard ----------
async function loadDashboard() {
  try {
    const d = await api('/dashboard');
    document.getElementById('kpiWallets').textContent = d.walletCount;
    document.getElementById('kpiCampaigns').textContent = d.campaignCount;
    document.getElementById('kpiActivity').textContent = d.activity.length;

    renderActivityList(d.activity);
    initCharts(d.activity);
    init3DActivity(d.activity);
  } catch (e) {
    console.error('Dashboard load error:', e);
    toast('Failed to load dashboard: ' + e.message, 'rose');
  }
}

function renderActivityList(activity) {
  const el = document.getElementById('activityList');
  if (!activity || !activity.length) {
    el.innerHTML = '<div class="text-center py-8 text-slate-500 text-sm">No recent activity</div>';
    return;
  }
  el.innerHTML = activity.map(a => `
    <div class="activity-item">
      <div class="activity-dot"></div>
      <div class="activity-event">${esc(a.event.replace(/_/g, ' '))}</div>
      <div class="activity-time">${new Date(a.created_at).toLocaleString()}</div>
      ${a.metadata && Object.keys(a.metadata).length ? `<div class="activity-meta">${esc(JSON.stringify(a.metadata))}</div>` : ''}
    </div>
  `).join('');
}

async function loadActivityFull() {
  try {
    const d = await api('/activity');
    document.getElementById('activityFullList').innerHTML = d.activity.map(a => `
      <div class="activity-item">
        <div class="activity-dot"></div>
        <div class="activity-event">${esc(a.event.replace(/_/g, ' '))}</div>
        <div class="activity-time">${new Date(a.created_at).toLocaleString()}</div>
        ${a.metadata && Object.keys(a.metadata).length ? `<div class="activity-meta">${esc(JSON.stringify(a.metadata))}</div>` : ''}
      </div>
    `).join('');
  } catch (e) { toast('Failed to load activity: ' + e.message, 'rose'); }
}

// ---------- Charts (defensive) ----------
function initCharts(activity) {
  if (typeof Chart === 'undefined') return;

  // Campaign status donut
  try {
    const cEl = document.getElementById('campaignChart');
    if (cEl) {
      if (charts.campaign) charts.campaign.destroy();
      charts.campaign = new Chart(cEl.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Watching', 'Researching', 'Eligible', 'Claimed', 'Not Eligible', 'Archived'],
          datasets: [{
            data: [3, 2, 1, 1, 0, 0],
            backgroundColor: ['#22d3ee', '#fbbf24', '#6ee7b7', '#4ade80', '#f87171', '#94a3b8'],
            borderWidth: 0,
            hoverOffset: 20
          }]
        },
        options: {
          cutout: '70%',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, padding: 20 } } }
        }
      });
    }
  } catch (e) { console.warn('Campaign chart failed:', e); }

  // Activity line chart
  try {
    const aEl = document.getElementById('activityChart3d');
    if (aEl) {
      if (charts.activity) charts.activity.destroy();
      const counts = activity.slice().reverse().reduce((acc, _, i, arr) => {
        const d = new Date(arr[i].created_at).toDateString();
        const existing = acc.find(x => x.label === d);
        if (existing) existing.count++; else acc.push({ label: d, count: 1 });
        return acc;
      }, []);
      charts.activity = new Chart(aEl.getContext('2d'), {
        type: 'line',
        data: {
          labels: counts.map(c => c.label),
          datasets: [{
            label: 'Events',
            data: counts.map(c => c.count),
            borderColor: '#14b8a6',
            backgroundColor: 'rgba(20, 184, 166, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#14b8a6',
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b', font: { size: 10 } } },
            y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b', font: { size: 10 }, stepSize: 1, beginAtZero: true } }
          }
        }
      });
    }
  } catch (e) { console.warn('Activity chart failed:', e); }
}

// ---------- Three.js 3D Activity (defensive) ----------
function init3DActivity(activity) {
  try {
    const canvas = document.getElementById('activityChart3d');
    if (!canvas || typeof THREE === 'undefined') return;

    const container = canvas.parentElement;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 12);
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const pl = new THREE.PointLight(0x14b8a6, 1.5, 20);
    pl.position.set(5, 5, 5);
    scene.add(pl);

    const count = Math.max(activity.length, 20);
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14;
      const hue = i / count;
      colors[i * 3] = 0.1 + hue * 0.4;
      colors[i * 3 + 1] = 0.7 + hue * 0.3;
      colors[i * 3 + 2] = 0.6 + hue * 0.3;
      sizes[i] = Math.random() * 0.15 + 0.05;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true, opacity: 0.85 });
    particles = new THREE.Points(geometry, material);
    scene.add(particles);

    animate3D();
  } catch (e) { console.warn('3D activity failed:', e); }
}

function animate3D() {
  if (!particles || !renderer) return;
  requestAnimationFrame(animate3D);
  particles.rotation.y += 0.004;
  particles.rotation.x += 0.002;
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  if (!renderer) return;
  const canvas = document.getElementById('activityChart3d');
  if (!canvas) return;
  const container = canvas.parentElement;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

// ---------- Wallets ----------
async function loadWallets() {
  try {
    const d = await api('/wallets');
    const el = document.getElementById('walletsList');
    if (!d.wallets.length) {
      el.innerHTML = '<div class="text-center py-12 text-slate-500 text-sm">No wallets saved yet. Add your first public wallet address.</div>';
      return;
    }
    el.innerHTML = d.wallets.map(w => `
      <div class="wallet-item">
        <div class="wallet-info">
          <div class="wallet-label">${esc(w.label || 'Wallet')}</div>
          <div class="wallet-meta">${esc(w.address)} · ${esc(w.chain)}</div>
        </div>
        <div class="wallet-actions">
          <button class="btn-icon" onclick="copyToClip('${esc(w.address)}')" title="Copy"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8z"/></svg></button>
          <button class="btn-icon" onclick="deleteWallet('${esc(w.id)}')" title="Remove"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
        </div>
      </div>
    `).join('');
  } catch (e) { toast('Failed to load wallets: ' + e.message, 'rose'); }
}

function openWalletModal() {
  document.getElementById('walletModal').classList.remove('hidden');
  document.getElementById('walletForm').reset();
  document.getElementById('walletMsg').classList.add('hidden');
}
function closeWalletModal() {
  document.getElementById('walletModal').classList.add('hidden');
}

document.getElementById('walletForm').onsubmit = async (e) => {
  e.preventDefault();
  const b = {
    address: document.getElementById('walletAddress').value,
    chain: document.getElementById('walletChain').value,
    label: document.getElementById('walletLabel').value || ''
  };
  const btn = e.target.querySelector('button[type="submit"]');
  const msg = document.getElementById('walletMsg');
  btn.disabled = true;
  try {
    await api('/wallets', { method: 'POST', body: JSON.stringify(b) });
    closeWalletModal();
    loadWallets();
    loadDashboard();
    toast('Wallet saved');
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
};

async function deleteWallet(id) {
  if (!confirm('Remove this wallet?')) return;
  try {
    await api('/wallets/' + id, { method: 'DELETE' });
    loadWallets();
    loadDashboard();
    toast('Wallet removed');
  } catch (e) { toast('Failed to remove wallet: ' + e.message, 'rose'); }
}

// ---------- Campaigns ----------
async function loadCampaigns() {
  try {
    const d = await api('/campaigns');
    const el = document.getElementById('campaignsList');
    if (!d.campaigns.length) {
      el.innerHTML = '<div class="text-center py-12 text-slate-500 text-sm">No campaigns tracked yet. Add your first campaign.</div>';
      return;
    }
    el.innerHTML = d.campaigns.map(c => `
      <div class="campaign-item">
        <div class="campaign-info">
          <div class="campaign-title">${esc(c.title)}</div>
          <div class="campaign-meta">${esc(c.project_url || 'No URL')} · ${esc(c.status)}</div>
          ${c.notes ? `<div class="campaign-meta">${esc(c.notes)}</div>` : ''}
        </div>
        <div class="flex items-center gap-2">
          <span class="status-badge status-${esc(c.status)}">${esc(c.status)}</span>
          <button class="btn-icon" onclick="deleteCampaign('${esc(c.id)}')" title="Delete"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
        </div>
      </div>
    `).join('');
  } catch (e) { toast('Failed to load campaigns: ' + e.message, 'rose'); }
}

function openCampaignModal() {
  document.getElementById('campaignModal').classList.remove('hidden');
  document.getElementById('campaignForm').reset();
  document.getElementById('campaignMsg').classList.add('hidden');
}
function closeCampaignModal() {
  document.getElementById('campaignModal').classList.add('hidden');
}

document.getElementById('campaignForm').onsubmit = async (e) => {
  e.preventDefault();
  const b = {
    title: document.getElementById('campaignTitle').value,
    projectUrl: document.getElementById('campaignUrl').value || null,
    status: document.getElementById('campaignStatus').value,
    notes: document.getElementById('campaignNotes').value || ''
  };
  const btn = e.target.querySelector('button[type="submit"]');
  const msg = document.getElementById('campaignMsg');
  btn.disabled = true;
  try {
    await api('/campaigns', { method: 'POST', body: JSON.stringify(b) });
    closeCampaignModal();
    loadCampaigns();
    loadDashboard();
    toast('Campaign saved');
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
};

async function deleteCampaign(id) {
  if (!confirm('Delete this campaign?')) return;
  try {
    await api('/campaigns/' + id, { method: 'DELETE' });
    loadCampaigns();
    loadDashboard();
    toast('Campaign deleted');
  } catch (e) { toast('Failed to delete campaign: ' + e.message, 'rose'); }
}

// ---------- X Integration ----------
async function loadXStatus() {
  try {
    const d = await api('/x/status');
    const el = document.getElementById('xStatus');
    const btn = document.getElementById('btnXConnect');
    if (d.connected) {
      el.innerHTML = `
        <div class="x-card">
          <div class="x-indicator connected"></div>
          <div class="x-info">
            <div class="x-handle">@${esc(d.username)}</div>
            <div class="x-sub">Connected · ${new Date(d.expiresAt).toLocaleDateString()} expiry</div>
          </div>
        </div>`;
      btn.innerHTML = '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> Reconnect X';
    } else {
      el.innerHTML = `
        <div class="x-card">
          <div class="x-indicator"></div>
          <div class="x-info">
            <div class="x-handle">Not connected</div>
            <div class="x-sub">OAuth 2.0 PKCE · tweet.write scope</div>
          </div>
        </div>`;
      btn.innerHTML = '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> Connect X Account';
    }
  } catch (e) { toast('Failed to load X status: ' + e.message, 'rose'); }
}

document.getElementById('btnXConnect').onclick = () => {
  window.location.href = '/api/x/connect';
};

document.getElementById('xPostText').oninput = (e) => {
  document.getElementById('xPostCount').textContent = e.target.value.length + ' / 280';
};

document.getElementById('xPostForm').onsubmit = async (e) => {
  e.preventDefault();
  const text = document.getElementById('xPostText').value;
  const btn = document.getElementById('btnXPost');
  const msg = document.getElementById('xPostMsg');
  btn.disabled = true;
  msg.textContent = '';
  try {
    const r = await api('/x/post', { method: 'POST', body: JSON.stringify({ text }) });
    msg.textContent = 'Published successfully. Tweet ID: ' + (r.tweet && r.tweet.id);
    msg.style.color = '#6ee7b7';
    document.getElementById('xPostText').value = '';
    document.getElementById('xPostCount').textContent = '0 / 280';
    loadDashboard();
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = '#f87171';
  } finally {
    btn.disabled = false;
  }
};

// ---------- Agents ----------
async function loadAgentConfig() {
  try {
    const d = await api('/agents/config');
    const c = d.config;
    document.getElementById('agentEnabled').checked = !!c.enabled;
    document.getElementById('agentAutoLike').checked = c.auto_like !== false;
    document.getElementById('agentAutoRepost').checked = c.auto_repost !== false;
    document.getElementById('agentAutoReply').checked = !!c.auto_reply;
    document.getElementById('agentMinDelay').value = c.min_delay_sec || 25;
    document.getElementById('agentMaxDelay').value = c.max_delay_sec || 65;
    document.getElementById('agentMaxHour').value = c.max_per_hour || 20;
    const chains = typeof c.chains === 'string' ? JSON.parse(c.chains) : c.chains;
    document.querySelectorAll('.agent-chain-chip').forEach(chip => {
      chip.classList.toggle('active', chains.includes(chip.dataset.chain));
    });
    document.getElementById('agentStatusBadge').textContent = c.enabled ? 'ACTIVE' : 'INACTIVE';
    document.getElementById('agentStatusBadge').className = c.enabled ? 'px-2 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'px-2 py-1 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-500 border border-white/10';
  } catch (e) { toast('Failed to load agent config: ' + e.message, 'rose'); }
}

async function saveAgentConfig() {
  const enabled = document.getElementById('agentEnabled').checked;
  const autoLike = document.getElementById('agentAutoLike').checked;
  const autoRepost = document.getElementById('agentAutoRepost').checked;
  const autoReply = document.getElementById('agentAutoReply').checked;
  const minDelay = document.getElementById('agentMinDelay').value;
  const maxDelay = document.getElementById('agentMaxDelay').value;
  const maxHour = document.getElementById('agentMaxHour').value;
  const chains = Array.from(document.querySelectorAll('.agent-chain-chip.active')).map(c => c.dataset.chain);
  try {
    await api('/agents/config', {
      method: 'POST',
      body: JSON.stringify({ enabled, auto_like: autoLike, auto_repost: autoRepost, auto_reply: autoReply, min_delay_sec: Number(minDelay), max_delay_sec: Number(maxDelay), max_per_hour: Number(maxHour), chains })
    });
    toast('Agent settings saved');
    loadAgentConfig();
  } catch (e) { toast('Failed to save config: ' + e.message, 'rose'); }
}

async function toggleAgent() {
  try {
    const d = await api('/agents/toggle', { method: 'POST' });
    document.getElementById('agentEnabled').checked = d.enabled;
    document.getElementById('agentStatusBadge').textContent = d.enabled ? 'ACTIVE' : 'INACTIVE';
    document.getElementById('agentStatusBadge').className = d.enabled ? 'px-2 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'px-2 py-1 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-500 border border-white/10';
    toast(d.enabled ? 'Agents activated' : 'Agents paused');
  } catch (e) { toast('Failed to toggle: ' + e.message, 'rose'); }
}

async function loadAgentTargets() {
  try {
    const d = await api('/agents/targets');
    const el = document.getElementById('agentTargetsList');
    if (!d.targets.length) {
      el.innerHTML = '<div class="text-center py-8 text-slate-500 text-sm">No targets added. Add X accounts or hashtags to monitor.</div>';
      return;
    }
    el.innerHTML = d.targets.map(t => `
      <div class="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
        <div class="flex items-center gap-3">
          <span class="w-2 h-2 rounded-full ${t.target_type === 'account' ? 'bg-emerald-500' : 'bg-cyan-500'}"></span>
          <div>
            <div class="text-xs font-bold text-white">${t.target_type === 'account' ? '@' : '#'}${esc(t.target_value)}</div>
            <div class="text-[10px] text-slate-500 font-mono">${t.target_type === 'account' ? 'X Account' : 'Hashtag'}</div>
          </div>
        </div>
        <button class="btn-icon" onclick="deleteAgentTarget('${esc(t.id)}')" title="Remove"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
      </div>
    `).join('');
  } catch (e) { toast('Failed to load targets: ' + e.message, 'rose'); }
}

async function addAgentTarget() {
  const type = document.getElementById('agentTargetType').value;
  const value = document.getElementById('agentTargetValue').value.trim();
  if (!value) return toast('Enter a target value', 'amber');
  try {
    await api('/agents/targets', { method: 'POST', body: JSON.stringify({ target_type: type, target_value: value }) });
    document.getElementById('agentTargetValue').value = '';
    loadAgentTargets();
    toast('Target added');
  } catch (e) { toast('Failed to add target: ' + e.message, 'rose'); }
}

async function deleteAgentTarget(id) {
  if (!confirm('Remove this target?')) return;
  try {
    await api('/agents/targets/' + id, { method: 'DELETE' });
    loadAgentTargets();
    toast('Target removed');
  } catch (e) { toast('Failed to remove target: ' + e.message, 'rose'); }
}

async function loadAgentLogs() {
  try {
    const d = await api('/agents/logs');
    const el = document.getElementById('agentLogsList');
    if (!d.logs.length) {
      el.innerHTML = '<div class="text-center py-8 text-slate-500 text-sm">No agent activity yet. Run a cycle to see logs.</div>';
      return;
    }
    el.innerHTML = d.logs.map(l => `
      <div class="activity-item">
        <div class="activity-dot" style="background:${l.status === 'success' ? '#14b8a6' : '#f87171'}"></div>
        <div class="activity-event">${esc(l.action.toUpperCase())} ${l.chain ? '<span class="text-xs font-mono text-slate-500 ml-2">[' + esc(l.chain) + ']</span>' : ''}</div>
        <div class="activity-time">${new Date(l.created_at).toLocaleString()}</div>
        ${l.wallet_address ? `<div class="activity-meta">${esc(l.wallet_address)}</div>` : ''}
      </div>
    `).join('');
  } catch (e) { toast('Failed to load logs: ' + e.message, 'rose'); }
}

async function runAgentCycle() {
  const btn = document.getElementById('btnRunAgentCycle');
  btn.disabled = true;
  btn.innerHTML = 'Running...';
  try {
    const d = await api('/agents/run', { method: 'POST' });
    toast(d.simulated ? `Agent cycle complete: ${d.actions} actions (simulated)` : `Agent cycle complete: ${d.actions} live actions`);
    loadAgentLogs();
    loadDashboard();
  } catch (e) { toast('Agent cycle failed: ' + e.message, 'rose'); } finally {
    btn.disabled = false;
    btn.innerHTML = 'Run Agent Cycle';
  }
}

// ---------- Utils ----------
async function copyToClip(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {}
}

// ---------- Init ----------
(async () => {
  try {
    const d = await api('/auth/me');
    if (d.user) {
      currentUser = d.user;
      showApp();
    }
  } catch (e) {
    console.log('Not authenticated, showing auth view');
  }
})();
