'use strict';

/**
 * AirdropNexus AI — Seed default data (sql.js).
 * Creates a default owner user, settings, search profiles, agents, and
 * labeled demo data so the dashboard is usable immediately in demo mode.
 */

const { initDb, all, get, run } = require('./db');
const logger = require('../config/logger');

function lastInsertId() {
  const row = get('SELECT last_insert_rowid() AS id');
  return row && row.id !== undefined ? row.id : 1;
}

async function seed() {
  await initDb();

  const insert = (sql, params) => run(sql, params);

  // 1. Default owner user (local auth disabled by default; placeholder)
  const existingUser = get(
    'SELECT id FROM users WHERE email = ?',
    ['owner@airdropnexus.local']
  );
  let userId = 1;
  if (!existingUser || Object.keys(existingUser).length === 0) {
    insert(
      `INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)`,
      ['owner@airdropnexus.local', '', 'owner']
    );
    userId = lastInsertId();
  } else {
    userId = existingUser.id;
  }

  // 2. User settings
  run(
    `INSERT OR IGNORE INTO user_settings (user_id, theme, timezone, daily_report_enabled, daily_report_time, worker_mode)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, 'system', 'Asia/Kolkata', 0, '09:00', 'local']
  );

  // 3. Default search profile
  const networks = JSON.stringify(['Solana', 'Ethereum', 'Bitcoin', 'Polygon', 'Base', 'Arbitrum', 'Optimism', 'TON', 'Monad', 'BNB Chain', 'Custom']);
  const keywords = JSON.stringify(['airdrop', 'claim', 'drop wallet', 'wallet address', 'community rewards', 'testnet rewards', 'snapshot']);
  const phrases = JSON.stringify(['reply with your wallet', 'drop your address', 'claim soon', 'points']);
  const negative = JSON.stringify(['giveaway scam', 'send eth', 'double your']);

  run(
    `INSERT OR IGNORE INTO search_profiles (user_id, name, enabled, networks, keywords, phrases, negative_keywords, interval_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, 'Default Crypto Airdrop Monitor', 1, networks, keywords, phrases, negative, 60]
  );

  // 4. Default wallets (public addresses only — labeled demo)
  run(
    `INSERT OR IGNORE INTO wallets (user_id, label, network, ticker, public_address, notes, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, 'Solana Demo Wallet', 'Solana', 'SOL', 'DemoSolanaAddress1234567890abcdef', 'Labeled demo address — replace with your own', 1]
  );
  run(
    `INSERT OR IGNORE INTO wallets (user_id, label, network, ticker, public_address, notes, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, 'Ethereum Demo Wallet', 'Ethereum', 'ETH', 'DemoEthAddress0xabcdef1234567890', 'Labeled demo address — replace with your own', 1]
  );

  // 5. Default agents
  const agentIds = [];
  const agentDefs = [
    {
      name: 'Campaign Discovery Agent',
      role: 'discovers publicly accessible campaign announcements and airdrop-related posts',
      keywords: JSON.stringify(['airdrop', 'claim', 'drop wallet']),
      networks: JSON.stringify(['Solana', 'Ethereum']),
    },
    {
      name: 'X Search/Monitoring Agent',
      role: 'queries permitted X API endpoints for matching posts',
      keywords: JSON.stringify(['airdrop', 'claim']),
      networks: JSON.stringify(['Solana', 'Ethereum', 'Base']),
    },
    {
      name: 'Keyword & Token Recognition Agent',
      role: 'identifies symbols, ticker variants, project names, chains',
      keywords: JSON.stringify(['SOL', 'ETH', 'BTC', 'TON', 'MONAD']),
      networks: JSON.stringify(['Solana', 'Ethereum', 'Bitcoin', 'TON', 'Monad']),
    },
    {
      name: 'Wallet Pattern Detection Agent',
      role: 'identifies wallet-address requests and candidate address strings',
      keywords: JSON.stringify(['wallet address', 'drop your address', 'reply with your wallet']),
      networks: JSON.stringify(['Solana', 'Ethereum']),
    },
    {
      name: 'Project Context/Verification Agent',
      role: 'checks source credibility, campaign context, duplicate posts, risk indicators',
      keywords: JSON.stringify([]),
      networks: JSON.stringify([]),
    },
    {
      name: 'Opportunity Scoring Agent',
      role: 'ranks relevance using transparent criteria',
      keywords: JSON.stringify([]),
      networks: JSON.stringify([]),
    },
    {
      name: 'Engagement Draft Agent',
      role: 'creates optional reply drafts using the user-selected public wallet address',
      keywords: JSON.stringify([]),
      networks: JSON.stringify([]),
    },
    {
      name: 'Daily Report Agent',
      role: 'compiles daily metrics and sends email when configured',
      keywords: JSON.stringify([]),
      networks: JSON.stringify([]),
    },
    {
      name: 'Master Orchestrator',
      role: 'manages scheduling, coordination, resource limits, retries, and run state',
      keywords: JSON.stringify([]),
      networks: JSON.stringify([]),
    },
  ];

  for (const def of agentDefs) {
    const existing = get(
      'SELECT id FROM agents WHERE name = ? AND user_id = ?',
      [def.name, userId]
    );
    if (existing && Object.keys(existing).length > 0) {
      agentIds.push(existing.id);
      continue;
    }
    run(
      `INSERT INTO agents (user_id, name, description, role, keywords, networks, status, schedule_type, schedule_value, retry_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', 60, 3)`,
      [userId, def.name, def.role, def.role, def.keywords, def.networks]
    );
    agentIds.push(lastInsertId());
  }

  // 6. Agent assignments (Master Orchestrator last)
  const orchestratorId = agentIds[agentIds.length - 1];
  for (let i = 0; i < agentIds.length - 1; i++) {
    run(
      `INSERT OR IGNORE INTO agent_assignments (agent_id, depends_on_agent_id, execution_order)
       VALUES (?, ?, ?)`,
      [agentIds[i], i > 0 ? agentIds[i - 1] : null, i + 1]
    );
  }

  logger.info('Seed data inserted successfully.');
  logger.info('Demo mode: labeled sample data is present. Replace wallets and configure integrations for live use.');
}

if (require.main === module) {
  seed().catch((err) => {
    logger.error('Seed failed', { message: err.message, stack: err.stack });
    process.exit(1);
  });
}

module.exports = { seed };
