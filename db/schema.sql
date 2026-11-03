CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 display_name TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wallets (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 address TEXT NOT NULL, chain TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,address,chain)
);
CREATE TABLE IF NOT EXISTS campaigns (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL, project_url TEXT, status TEXT NOT NULL DEFAULT 'watching' CHECK (status IN ('watching','researching','eligible','claimed','not_eligible','archived')),
 notes TEXT NOT NULL DEFAULT '', deadline TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS activity (
 id BIGSERIAL PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS x_oauth_tokens (
 user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 access_token TEXT NOT NULL, refresh_token TEXT, expires_at TIMESTAMPTZ,
 x_user_id TEXT, x_username TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_user_date ON activity(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS index_session_on_expire ON session(expire);

CREATE TABLE IF NOT EXISTS agent_configs (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  auto_like BOOLEAN NOT NULL DEFAULT true,
  auto_repost BOOLEAN NOT NULL DEFAULT true,
  auto_reply BOOLEAN NOT NULL DEFAULT false,
  min_delay_sec INTEGER NOT NULL DEFAULT 25,
  max_delay_sec INTEGER NOT NULL DEFAULT 65,
  max_per_hour INTEGER NOT NULL DEFAULT 20,
  chains JSONB NOT NULL DEFAULT '["Solana","Ethereum","BNB Chain","Polygon","Bitcoin","Sui","TON"]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('account','hashtag')),
  target_value TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_post_id TEXT,
  target_account TEXT,
  chain TEXT,
  wallet_address TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_configs_user ON agent_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_targets_user ON agent_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_user ON agent_executions(user_id,created_at DESC);
