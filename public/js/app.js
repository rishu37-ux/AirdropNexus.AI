/* =============================================================================
   AirdropNexus AI — Frontend Application
   Handles theme, navigation, API calls, and rendering all dashboard sections.
   ============================================================================= */

const API_BASE = '/api';
const STATE = {
  theme: 'system',
  authenticated: false,
  sections: {
    overview: 'section-overview',
    'agent-center': 'section-agent-center',
    campaigns: 'section-campaigns',
    'x-integration': 'section-x-integration',
    wallets: 'section-wallets',
    'ai-models': 'section-ai-models',
    scheduler: 'section-scheduler',
    logs: 'section-logs',
    reports: 'section-reports',
    settings: 'section-settings',
    health: 'section-health',
  },
};

// ---------- Theme ----------
function applyTheme(theme) {
  const root = document.documentElement;
  let effective = theme;
  if (theme === 'system') {
    effective = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  root.setAttribute('data-theme', effective);
  STATE.theme = theme;
  try { localStorage.setItem('airdropnexus_theme', theme); } catch (e) {}
}

function initTheme() {
  try { STATE.theme = localStorage.getItem('airdropnexus_theme') || 'system'; } catch (e) {}
  const toggle = document.getElementById('themeToggle');
  applyTheme(STATE.theme);
  if (toggle) {
    toggle.addEventListener('click', () => {
      const order = ['system', 'dark', 'light'];
      const idx = order.indexOf(STATE.theme);
      const next = order[(idx + 1) % order.length];
      applyTheme(next);
    });
  }
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (STATE.theme === 'system') applyTheme('system');
  });
}

// ---------- Navigation ----------
function initNavigation() {
  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('hidden');
    });
  }

  document.querySelectorAll('.nav-item[data-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = btn.getAttribute('data-section');
      showSection(section);
      // Update active state
      document.querySelectorAll('.nav-item[data-section]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      // Close sidebar on mobile
      if (sidebar) sidebar.classList.add('hidden');
    });
  });
}

function showSection(section) {
  // Hide all panels
  document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
  const target = document.getElementById(STATE.sections[section]);
  if (target) target.classList.remove('hidden');

  // Update page title
  const titles = {
    overview: 'Overview Dashboard',
    'agent-center': 'Agent Center',
    campaigns: 'Campaign Explorer',
    'x-integration': 'X (Twitter) Integration',
    wallets: 'Wallet Manager',
    'ai-models': 'AI Model Manager',
    scheduler: 'Run Engine / Scheduler',
    logs: 'Activity Logs',
    reports: 'Daily Reports',
    settings: 'Settings / Security',
    health: 'Deployment Health',
  };
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');
  if (pageTitle) pageTitle.textContent = titles[section] || 'Dashboard';
  if (pageSubtitle) pageSubtitle.textContent = 'Control center for crypto airdrop intelligence';

  // Load section data
  if (section === 'overview') loadOverview();
  else if (section === 'agent-center') loadAgents();
  else if (section === 'campaigns') loadCampaigns();
  else if (section === 'x-integration') loadXStatus();
  else if (section === 'wallets') loadWallets();
  else if (section === 'ai-models') loadAICatalog();
  else if (section === 'scheduler') loadWorkerStatus();
  else if (section === 'logs') loadLogs();
  else if (section === 'reports') loadReports();
  else if (section === 'settings') loadSettings();
  else if (section === 'health') loadHealth();
}

// ---------- API helpers ----------
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function shortAddress(addr) {
  if (!addr) return '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ---------- Overview ----------
async function loadOverview() {
  try {
    const [health, wallets, campaigns] = await Promise.all([
      apiFetch('/health'),
      apiFetch('/wallets?limit=1'),
      apiFetch('/campaigns?limit=1'),
    ]);

    setText('metricAgentStatus', health.workerEnabled ? 'active' : 'idle');
    setText('metricXStatus', health.integrations.x.connected ? 'connected' : 'not configured');
    setText('metricAIStatus', health.integrations.ai.providersConfigured ? 'configured' : 'rule-based');
    setText('metricWallets', wallets.total || 0);
    setText('metricCampaigns', campaigns ? campaigns.campaigns.length : 0);
    setText('metricAwaiting', 0);
    setText('metricPosts', 0);
    setText('metricHeartbeat', health.lastHeartbeat || '—');

    const chip = document.getElementById('workerStatus');
    if (chip) {
      chip.textContent = health.workerEnabled ? '● active' : '● idle';
      chip.style.borderColor = health.workerEnabled ? 'var(--success)' : 'var(--border)';
    }

    // Activity feed
    const feed = document.getElementById('activityFeed');
    if (feed) {
      feed.innerHTML = '<div class="empty-state"><p>No recent activity. Start the worker or run an agent manually.</p></div>';
    }
  } catch (e) {
    toast(`Failed to load overview: ${e.message}`, 'error');
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// ---------- Agents ----------
async function loadAgents() {
  const tbody = document.getElementById('agentsTableBody');
  if (!tbody) return;
  try {
    const { agents = [] } = await apiFetch('/agents');
    tbody.innerHTML = '';
    if (agents.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No agents configured.</td></tr>';
      return;
    }
    agents.forEach((a) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(a.name)}</strong></td>
        <td class="muted small">${escapeHtml(a.role || '—')}</td>
        <td class="small">${escapeHtml(a.provider_name || '—')} / ${escapeHtml(a.model || 'rule-based')}</td>
        <td class="small">${a.schedule_type}</td>
        <td><span class="status-chip" style="font-size:0.75rem;padding:0.2rem 0.5rem">${a.enabled ? 'enabled' : 'disabled'}</span></td>
        <td class="small">${a.last_run_at || '—'}</td>
        <td class="small">${a.next_run_at || '—'}</td>
        <td class="small">${a.success_count || 0}</td>
        <td class="small">${a.failure_count || 0}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="runAgent(${a.id})">Run Now</button>
          <button class="btn btn-sm btn-outline" onclick="toggleAgent(${a.id}, ${a.enabled})">${a.enabled ? 'Pause' : 'Resume'}</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state" style="color:var(--danger)">Error: ${escapeHtml(e.message)}</td></tr>`;
    toast(`Failed to load agents: ${e.message}`, 'error');
  }
}

window.runAgent = async (id) => {
  try {
    const res = await apiFetch(`/agents/${id}/run`, { method: 'POST' });
    toast(`Agent run queued (job #${res.jobId})`, 'success');
    loadAgents();
    loadOverview();
  } catch (e) {
    toast(`Run failed: ${e.message}`, 'error');
  }
};

window.toggleAgent = async (id, enabled) => {
  try {
    const res = await apiFetch(`/agents/${id}/toggle`, { method: 'POST' });
    toast(`Agent ${res.enabled ? 'enabled' : 'disabled'}`, 'success');
    loadAgents();
  } catch (e) {
    toast(`Toggle failed: ${e.message}`, 'error');
  }
};

// ---------- Campaigns ----------
async function loadCampaigns() {
  const tbody = document.getElementById('campaignsTableBody');
  if (!tbody) return;
  try {
    const { campaigns = [] } = await apiFetch('/campaigns?limit=50');
    tbody.innerHTML = '';
    if (campaigns.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No campaigns yet. Run agents to discover opportunities.</td></tr>';
      return;
    }
    campaigns.forEach((c) => {
      const tr = document.createElement('tr');
      const chains = Array.isArray(c.chains) ? c.chains : [];
      const risk = Array.isArray(c.risk_indicators) ? c.risk_indicators : [];
      tr.innerHTML = `
        <td><strong>${escapeHtml(c.text_snippet || c.source || 'Campaign')}</strong></td>
        <td class="small muted">${escapeHtml(c.author_handle || '—')}</td>
        <td class="small muted">${chains.length ? chains.join(', ') : '—'}</td>
        <td class="small">${(c.confidence * 100).toFixed(0)}%</td>
        <td><span class="status-chip" style="font-size:0.75rem;padding:0.2rem 0.5rem">${escapeHtml(c.status)}</span></td>
        <td class="small muted">${risk.length ? risk.length : 0}</td>
        <td class="small muted">${escapeHtml(c.source)}</td>
        <td class="small">${c.created_at ? c.created_at.slice(0, 16) : '—'}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="viewCampaign(${c.id})">View</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state" style="color:var(--danger)">Error: ${escapeHtml(e.message)}</td></tr>`;
  }
}

window.viewCampaign = (id) => {
  toast(`Campaign detail view for #${id} — open the detail panel to review`, 'info');
};

// ---------- Wallets ----------
async function loadWallets() {
  const tbody = document.getElementById('walletsTableBody');
  if (!tbody) return;
  try {
    const { wallets = [], total } = await apiFetch('/wallets?limit=100');
    tbody.innerHTML = '';
    if (wallets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No wallets. Add your public addresses.</td></tr>';
      return;
    }
    wallets.forEach((w) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(w.label)}</strong></td>
        <td class="small muted">${escapeHtml(w.network)}</td>
        <td class="small muted">${escapeHtml(w.ticker || '—')}</td>
        <td>
          <span class="small" id="addr-${w.id}">${shortAddress(w.public_address)}</span>
          <button class="btn btn-sm" onclick="revealAddress(${w.id}, '${escapeHtml(w.public_address)}')" title="Reveal">👁️</button>
          <button class="btn btn-sm" onclick="copyAddress('${escapeHtml(w.public_address)}')" title="Copy">📋</button>
        </td>
        <td><span class="status-chip" style="font-size:0.75rem;padding:0.2rem 0.5rem">${w.enabled ? 'on' : 'off'}</span></td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="editWallet(${w.id})">Edit</button>
          <button class="btn btn-sm btn-outline" onclick="deleteWallet(${w.id})">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:var(--danger)">Error: ${escapeHtml(e.message)}</td></tr>`;
    toast(`Failed to load wallets: ${e.message}`, 'error');
  }
}

window.revealAddress = (id, addr) => {
  const el = document.getElementById(`addr-${id}`);
  if (el) {
    el.textContent = addr;
    setTimeout(() => { el.textContent = shortAddress(addr); }, 4000);
  }
  toast('Address revealed temporarily', 'info');
};

window.copyAddress = async (addr) => {
  try {
    await navigator.clipboard.writeText(addr);
    toast('Address copied to clipboard', 'success');
  } catch (e) {
    toast('Copy failed', 'error');
  }
};

window.editWallet = (id) => {
  toast(`Edit wallet #${id} — use the API to update`, 'info');
};

window.deleteWallet = async (id) => {
  if (!confirm('Delete this wallet?')) return;
  try {
    await apiFetch(`/wallets/${id}`, { method: 'DELETE' });
    toast('Wallet deleted', 'success');
    loadWallets();
    loadOverview();
  } catch (e) {
    toast(`Delete failed: ${e.message}`, 'error');
  }
};

// Add wallet form
const walletForm = document.getElementById('walletForm');
const addWalletBtn = document.getElementById('addWalletBtn');
const addWalletCard = document.getElementById('addWalletCard');
const cancelWalletBtn = document.getElementById('cancelWalletBtn');

if (addWalletBtn && addWalletCard) {
  addWalletBtn.addEventListener('click', () => {
    addWalletCard.classList.toggle('hidden');
  });
}
if (cancelWalletBtn && addWalletCard) {
  cancelWalletBtn.addEventListener('click', () => {
    addWalletCard.classList.add('hidden');
  });
}
if (walletForm) {
  walletForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(walletForm);
    const body = {
      label: formData.get('label'),
      network: formData.get('network'),
      ticker: formData.get('ticker'),
      public_address: formData.get('public_address'),
      notes: formData.get('notes'),
      enabled: true,
    };
    try {
      const res = await apiFetch('/wallets', { method: 'POST', body: JSON.stringify(body) });
      toast('Wallet added', 'success');
      walletForm.reset();
      addWalletCard.classList.add('hidden');
      loadWallets();
      loadOverview();
      if (res.validation && res.validation.warnings && res.validation.warnings.length) {
        toast(`Validation: ${res.validation.warnings.join('; ')}`, 'warning');
      }
    } catch (err) {
      toast(`Add failed: ${err.message}`, 'error');
    }
  });
}

// ---------- X Integration ----------
async function loadXStatus() {
  const body = document.getElementById('xConnectionBody');
  const connectBtn = document.getElementById('connectXBtn');
  const disconnectBtn = document.getElementById('disconnectXBtn');
  const cbUrl = document.getElementById('xCallbackUrl');
  if (cbUrl) cbUrl.textContent = `${window.location.origin}/auth/x/callback`;
  try {
    const status = await apiFetch('/x/status');
    if (body) {
      body.innerHTML = `
        <div class="stat-row"><span>Configured</span><span>${status.configured ? 'yes' : 'no'}</span></div>
        <div class="stat-row"><span>Connected</span><span style="color:${status.connected ? 'var(--success)' : 'var(--text-muted)'}">${status.connected ? 'yes' : 'no'}</span></div>
        <div class="stat-row"><span>Scopes</span><span class="small muted">${status.scopes.join(', ')}</span></div>
        ${status.account ? `<div class="stat-row"><span>Account</span><span>@${escapeHtml(status.account.username)}</span></div>` : ''}
        ${status.note ? `<div class="muted small" style="margin-top:1rem">${escapeHtml(status.note)}</div>` : ''}
      `;
    }
    if (connectBtn) {
      connectBtn.disabled = !status.configured;
      connectBtn.style.display = status.connected ? 'none' : 'inline-flex';
    }
    if (disconnectBtn) {
      disconnectBtn.style.display = status.connected ? 'inline-flex' : 'none';
      disconnectBtn.onclick = async () => {
        try {
          await apiFetch('/x/disconnect', { method: 'GET' });
          toast('X disconnected', 'success');
          loadXStatus();
        } catch (e) { toast(`Disconnect failed: ${e.message}`, 'error'); }
      };
    }
    if (connectBtn && !disconnectBtn) {
      connectBtn.onclick = () => {
        if (!status.configured) {
          toast('Configure X_CLIENT_ID, X_CLIENT_SECRET, X_CALLBACK_URL in .env first', 'warning');
          return;
        }
        // Redirect to OAuth start (handled by backend /auth/x/connect route once implemented)
        window.location.href = '/auth/x/connect';
      };
    }
  } catch (e) {
    if (body) body.innerHTML = `<div class="empty-state" style="color:var(--danger)">Error: ${escapeHtml(e.message)}</div>`;
  }
}

// ---------- AI Models ----------
async function loadAICatalog() {
  const body = document.getElementById('aiCatalogBody');
  const select = document.getElementById('aiProviderSelect');
  if (!body) return;
  try {
    const catalog = await apiFetch('/ai/catalog');
    body.innerHTML = '';
    catalog.forEach((p) => {
      const el = document.createElement('div');
      el.className = 'card';
      el.style.padding = '1rem';
      el.style.marginBottom = '0.75rem';
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:600">${escapeHtml(p.name)}</div>
            <div class="small muted">${escapeHtml(p.notes)}</div>
          </div>
          <div class="small" style="color:${p.configured ? 'var(--success)' : 'var(--text-muted)'}">
            ${p.configured ? 'configured' : 'not configured'}
          </div>
        </div>
        <div class="muted small" style="margin-top:0.4rem">Free tier: ${escapeHtml(p.freeTier)}</div>
      `;
      body.appendChild(el);
    });
    if (select) {
      select.innerHTML = catalog.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
    }
  } catch (e) {
    body.innerHTML = `<div class="empty-state" style="color:var(--danger)">Error: ${escapeHtml(e.message)}</div>`;
  }
}

// ---------- Worker / Scheduler ----------
async function loadWorkerStatus() {
  try {
    const health = await apiFetch('/health');
    setText('workerModeVal', health.workerMode);
    setText('workerEnabledVal', health.workerEnabled ? 'yes' : 'no');
    setText('workerIntervalVal', health.workerIntervalMinutes);
    setText('workerHeartbeatVal', health.lastHeartbeat || '—');
    setText('workerNextRunVal', health.nextScheduledRun || '—');
  } catch (e) {
    toast(`Failed to load worker status: ${e.message}`, 'error');
  }
}

async function loadLogs() {
  const body = document.getElementById('logsBody');
  if (!body) return;
  try {
    // Use jobs as proxy for logs
    const { jobs = [] } = await apiFetch('/jobs?limit=20');
    body.innerHTML = '';
    if (jobs.length === 0) {
      body.innerHTML = '<div class="empty-state">No activity logs yet.</div>';
      return;
    }
    jobs.forEach((j) => {
      const el = document.createElement('div');
      el.style.padding = '0.75rem 1rem';
      el.style.borderBottom = '1px solid var(--border)';
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between">
          <div><strong>${escapeHtml(j.job_type || 'job')}</strong> <span class="small muted">#${j.id}</span></div>
          <div class="small muted">${j.created_at ? j.created_at.slice(0, 16) : '—'}</div>
        </div>
        <div class="small muted">${escapeHtml(j.status)}</div>
      `;
      body.appendChild(el);
    });
  } catch (e) {
    body.innerHTML = `<div class="empty-state" style="color:var(--danger)">Error: ${escapeHtml(e.message)}</div>`;
  }
}

// ---------- Reports ----------
async function loadReports() {
  const body = document.getElementById('reportsBody');
  if (!body) return;
  try {
    const { reports = [] } = await apiFetch('/reports');
    body.innerHTML = '';
    if (reports.length === 0) {
      body.innerHTML = '<div class="empty-state">No reports yet. Generate today\'s report.</div>';
      return;
    }
    reports.forEach((r) => {
      const s = r.summary ? JSON.parse(r.summary) : {};
      const el = document.createElement('div');
      el.className = 'card';
      el.style.padding = '1rem';
      el.style.marginBottom = '0.75rem';
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
          <div><strong>Report — ${escapeHtml(r.report_date)}</strong></div>
          <span class="small muted">${r.email_sent ? 'email sent' : 'dashboard only'}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.5rem;font-size:0.85rem">
          <div>Scanned: <span class="muted">${s.postsScanned ?? r.posts_scanned}</span></div>
          <div>Processed: <span class="muted">${s.postsProcessed ?? r.posts_processed}</span></div>
          <div>New: <span class="muted">${s.newCampaigns ?? r.new_campaigns}</span></div>
          <div>Failed: <span class="muted">${s.failedJobs ?? r.failed_jobs}</span></div>
        </div>
      `;
      body.appendChild(el);
    });
  } catch (e) {
    body.innerHTML = `<div class="empty-state" style="color:var(--danger)">Error: ${escapeHtml(e.message)}</div>`;
  }
}

const genReportBtn = document.getElementById('generateReportBtn');
if (genReportBtn) {
  genReportBtn.addEventListener('click', async () => {
    try {
      const res = await apiFetch('/reports/generate', { method: 'POST' });
      toast('Daily report generated', 'success');
      loadReports();
      loadOverview();
    } catch (e) {
      toast(`Generate failed: ${e.message}`, 'error');
    }
  });
}

// ---------- Settings ----------
async function loadSettings() {
  try {
    const settings = await apiFetch('/settings');
    const themeSel = document.getElementById('settingTheme');
    const tzSel = document.getElementById('settingTimezone');
    const timeSel = document.getElementById('settingReportTime');
    const dailyCb = document.getElementById('settingDailyReport');
    if (themeSel) themeSel.value = settings.theme || 'system';
    if (tzSel) tzSel.value = settings.timezone || 'Asia/Kolkata';
    if (timeSel) timeSel.value = settings.daily_report_time || '09:00';
    if (dailyCb) dailyCb.checked = settings.daily_report_enabled === 1;
  } catch (e) {
    toast(`Failed to load settings: ${e.message}`, 'error');
  }
}

const saveSettingsBtn = document.getElementById('saveSettingsBtn');
if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener('click', async () => {
    const body = {
      theme: document.getElementById('settingTheme').value,
      timezone: document.getElementById('settingTimezone').value,
      daily_report_enabled: document.getElementById('settingDailyReport').checked ? 1 : 0,
      daily_report_time: document.getElementById('settingReportTime').value,
      data_retention_days: 90,
      log_retention_days: 30,
      worker_mode: 'local',
    };
    try {
      await apiFetch('/settings', { method: 'PUT', body: JSON.stringify(body) });
      toast('Settings saved', 'success');
      applyTheme(body.theme);
    } catch (e) {
      toast(`Save failed: ${e.message}`, 'error');
    }
  });
}

const exportDataBtn = document.getElementById('exportDataBtn');
if (exportDataBtn) {
  exportDataBtn.addEventListener('click', async () => {
    try {
      const data = await apiFetch('/settings/export', { method: 'POST' });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `airdropnexus-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      toast('Backup exported', 'success');
    } catch (e) {
      toast(`Export failed: ${e.message}`, 'error');
    }
  });
}

// ---------- Health ----------
async function loadHealth() {
  const body = document.getElementById('healthBody');
  if (!body) return;
  try {
    const h = await apiFetch('/health');
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem">
        <div class="card" style="padding:1rem">
          <div class="small muted">Service</div><div style="font-weight:600">${escapeHtml(h.service)}</div>
        </div>
        <div class="card" style="padding:1rem">
          <div class="small muted">Environment</div><div style="font-weight:600">${escapeHtml(h.env)}</div>
        </div>
        <div class="card" style="padding:1rem">
          <div class="small muted">Worker Mode</div><div style="font-weight:600">${escapeHtml(h.workerMode)}</div>
        </div>
        <div class="card" style="padding:1rem">
          <div class="small muted">Worker Enabled</div><div style="font-weight:600">${h.workerEnabled ? 'yes' : 'no'}</div>
        </div>
        <div class="card" style="padding:1rem">
          <div class="small muted">Last Heartbeat</div><div style="font-weight:600;font-family:var(--font-mono);font-size:0.85rem">${h.lastHeartbeat || '—'}</div>
        </div>
        <div class="card" style="padding:1rem">
          <div class="small muted">Next Run</div><div style="font-weight:600;font-family:var(--font-mono);font-size:0.85rem">${h.nextScheduledRun || '—'}</div>
        </div>
      </div>
      <div style="margin-top:1rem">
        <div class="card" style="padding:1rem">
          <div class="small muted">Integrations</div>
          <div style="margin-top:0.5rem">
            <div>X (Twitter): <span style="color:${h.integrations.x.connected ? 'var(--success)' : 'var(--text-muted)'}">${h.integrations.x.connected ? 'connected' : 'not configured'}</span></div>
            <div>AI providers: <span style="color:${h.integrations.ai.providersConfigured ? 'var(--success)' : 'var(--text-muted)'}">${h.integrations.ai.providersConfigured ? 'configured' : 'none'}</span></div>
            <div>SMTP: <span style="color:${h.integrations.smtp.configured ? 'var(--success)' : 'var(--text-muted)'}">${h.integrations.smtp.configured ? 'configured' : 'not configured'}</span></div>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    body.innerHTML = `<div class="empty-state" style="color:var(--danger)">Error: ${escapeHtml(e.message)}</div>`;
  }
}

// ---------- Auth ----------
const demoLoginBtn = document.getElementById('demoLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');
if (demoLoginBtn) {
  demoLoginBtn.addEventListener('click', async () => {
    try {
      await apiFetch('/auth/demo-login', { method: 'POST' });
      STATE.authenticated = true;
      demoLoginBtn.style.display = 'none';
      toast('Demo login established', 'success');
      loadOverview();
    } catch (e) {
      toast(`Login failed: ${e.message}`, 'error');
    }
  });
}
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
      STATE.authenticated = false;
      if (demoLoginBtn) demoLoginBtn.style.display = 'inline-flex';
      toast('Logged out', 'info');
    } catch (e) { toast(`Logout failed: ${e.message}`, 'error'); }
  });
}

// ---------- Worker controls ----------
const startWorkerBtn = document.getElementById('startWorkerBtn');
const stopWorkerBtn = document.getElementById('stopWorkerBtn');
const pauseWorkerBtn = document.getElementById('pauseWorkerBtn');
const resumeWorkerBtn = document.getElementById('resumeWorkerBtn');

// Note: worker start/stop/pause/resume are controlled via settings + background worker (backend).
// These buttons reflect the current desired state and refresh status.
function refreshWorkerUI() {
  loadWorkerStatus();
  loadOverview();
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNavigation();
  showSection('overview');

  // Periodic refresh of overview heartbeat
  setInterval(refreshWorkerUI, 30000);
});
