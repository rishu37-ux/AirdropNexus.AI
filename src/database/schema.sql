-- AirdropNexus AI — Database Schema (SQLite)
-- Abstracted data layer; PostgreSQL can be adopted later by adapting types.

PRAGMA foreign_keys = ON;

-- Users (only if local authentication is enabled)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'owner',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- OAuth connections (X / Twitter)
CREATE TABLE IF NOT EXISTS oauth_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  provider TEXT NOT NULL DEFAULT 'x',
  provider_user_id TEXT,
  username TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TEXT,
  scope TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_provider_user ON oauth_connections(provider, provider_user_id);

-- Provider configs (encrypted secrets; never plain API keys)
CREATE TABLE IF NOT EXISTS provider_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  provider TEXT NOT NULL,
  model TEXT,
  base_url TEXT,
  api_key_encrypted TEXT,
  is_default INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_configs_default ON provider_configs(is_default) WHERE is_default = 1;
CREATE INDEX IF NOT EXISTS idx_provider_configs_provider ON provider_configs(provider);

-- Agents
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  role TEXT,
  provider_config_id INTEGER,
  model TEXT,
  enabled INTEGER DEFAULT 1,
  schedule_type TEXT DEFAULT 'manual', -- manual, hourly, every_n_minutes, daily
  schedule_value INTEGER,
  keywords TEXT, -- JSON array
  networks TEXT, -- JSON array
  rate_limit INTEGER DEFAULT 60,
  volume_limit INTEGER DEFAULT 100,
  retry_count INTEGER DEFAULT 3,
  retry_backoff_base INTEGER DEFAULT 2,
  status TEXT DEFAULT 'idle', -- idle, active, paused, error
  last_run_at TEXT,
  next_run_at TEXT,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (provider_config_id) REFERENCES provider_configs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_next_run ON agents(next_run_at);

-- Agent assignments / orchestration order
CREATE TABLE IF NOT EXISTS agent_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  depends_on_agent_id INTEGER,
  execution_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_assignments_agent ON agent_assignments(agent_id);

-- Search profiles
CREATE TABLE IF NOT EXISTS search_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  name TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  networks TEXT, -- JSON array
  project_names TEXT, -- JSON array
  token_symbols TEXT, -- JSON array
  keywords TEXT, -- JSON array
  phrases TEXT, -- JSON array
  negative_keywords TEXT, -- JSON array
  interval_minutes INTEGER DEFAULT 60,
  last_query_at TEXT,
  result_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_search_profiles_enabled ON search_profiles(enabled);

-- Wallets
CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  label TEXT NOT NULL,
  network TEXT NOT NULL,
  ticker TEXT,
  public_address TEXT NOT NULL,
  address_format TEXT,
  notes TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wallets_network ON wallets(network);
CREATE INDEX IF NOT EXISTS idx_wallets_enabled ON wallets(enabled);

-- Campaigns / opportunities
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  source TEXT NOT NULL, -- x, manual, etc.
  source_post_id TEXT,
  author_handle TEXT,
  text_snippet TEXT,
  post_url TEXT,
  chains TEXT, -- JSON array
  tickers TEXT, -- JSON array
  detected_address_request INTEGER DEFAULT 0,
  candidate_wallet TEXT,
  matching_profile_id INTEGER,
  confidence REAL DEFAULT 0,
  confidence_explanation TEXT,
  timestamp TEXT,
  duplicate_flag INTEGER DEFAULT 0,
  risk_indicators TEXT, -- JSON array
  ai_summary TEXT,
  status TEXT DEFAULT 'New', -- New, Relevant, Ignored, Watchlist, Completed, Scam/Suspicious
  tags TEXT, -- JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (matching_profile_id) REFERENCES search_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_source_post ON campaigns(source, source_post_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_confidence ON campaigns(confidence);

-- X posts (ingested posts, for dedup)
CREATE TABLE IF NOT EXISTS x_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT UNIQUE NOT NULL,
  author_handle TEXT,
  text TEXT,
  post_url TEXT,
  created_at_post TEXT,
  ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
  search_profile_id INTEGER,
  processed INTEGER DEFAULT 0,
  FOREIGN KEY (search_profile_id) REFERENCES search_profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_x_posts_post_id ON x_posts(post_id);
CREATE INDEX IF NOT EXISTS idx_x_posts_ingested_at ON x_posts(ingested_at);

-- Detected matches (detailed detection results)
CREATE TABLE IF NOT EXISTS detected_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER,
  match_type TEXT, -- token, network, wallet, phrase
  match_value TEXT,
  confidence REAL,
  context TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_detected_matches_campaign ON detected_matches(campaign_id);

-- Engagement drafts
CREATE TABLE IF NOT EXISTS engagement_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER,
  draft_text TEXT,
  wallet_address TEXT,
  network TEXT,
  status TEXT DEFAULT 'draft', -- draft, ready, sent, skipped
  action_type TEXT, -- reply, repost, none
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_engagement_drafts_campaign ON engagement_drafts(campaign_id);

-- Job queue
CREATE TABLE IF NOT EXISTS job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER,
  job_type TEXT NOT NULL,
  status TEXT DEFAULT 'queued', -- queued, running, succeeded, failed, canceled, skipped
  input_summary TEXT,
  output_summary TEXT,
  duration_ms INTEGER,
  provider TEXT,
  model TEXT,
  cost_estimate REAL,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  locked_at TEXT,
  locked_by TEXT,
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);
CREATE INDEX IF NOT EXISTS idx_job_queue_agent ON job_queue(agent_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_scheduled_at ON job_queue(scheduled_at);

-- Job runs (execution history)
CREATE TABLE IF NOT EXISTS job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,
  agent_id INTEGER,
  status TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (job_id) REFERENCES job_queue(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_job_runs_job ON job_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_runs_agent ON job_runs(agent_id);

-- Activity logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  agent_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);

-- Daily reports
CREATE TABLE IF NOT EXISTS daily_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL,
  summary TEXT,
  posts_scanned INTEGER DEFAULT 0,
  posts_processed INTEGER DEFAULT 0,
  new_campaigns INTEGER DEFAULT 0,
  relevant_matches INTEGER DEFAULT 0,
  suspicious_items INTEGER DEFAULT 0,
  failed_jobs INTEGER DEFAULT 0,
  email_sent INTEGER DEFAULT 0,
  email_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);

-- User settings
CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE,
  theme TEXT DEFAULT 'system', -- dark, light, system
  timezone TEXT DEFAULT 'Asia/Kolkata',
  daily_report_enabled INTEGER DEFAULT 0,
  daily_report_time TEXT DEFAULT '09:00',
  daily_report_recipient TEXT,
  data_retention_days INTEGER DEFAULT 90,
  log_retention_days INTEGER DEFAULT 30,
  worker_mode TEXT DEFAULT 'local',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Schema migrations tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration_name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
