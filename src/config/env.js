'use strict';

/**
 * AirdropNexus AI — Configuration (env-based, validated)
 * All secrets are read only on the server. Nothing is leaked to the frontend.
 */

require('dotenv').config();

const required = [
  'SESSION_SECRET',
  'ENCRYPTION_MASTER_KEY',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.warn(
    `[CONFIG] Warning: missing environment variables: ${missing.join(', ')}. ` +
    'Copy .env.example to .env and fill in your values.'
  );
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  appName: process.env.APP_NAME || 'AirdropNexus AI',

  session: {
    secret: process.env.SESSION_SECRET,
  },

  encryption: {
    masterKey: process.env.ENCRYPTION_MASTER_KEY,
  },

  db: {
    dialect: process.env.DB_DIALECT || 'sqlite',
    path: process.env.DB_PATH || './data/airdropnexus.sqlite',
  },

  x: {
    clientId: process.env.X_CLIENT_ID || '',
    clientSecret: process.env.X_CLIENT_SECRET || '',
    callbackUrl: process.env.X_CALLBACK_URL || '',
    scopes: (process.env.X_SCOPES || 'tweet.read,users.read,offline.access')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    googleAiApiKey: process.env.GOOGLE_AI_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    xaiApiKey: process.env.XAI_API_KEY || '',
    groqApiKey: process.env.GROQ_API_KEY || '',
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
    mistralApiKey: process.env.MISTRAL_API_KEY || '',
    customBaseUrl: process.env.CUSTOM_AI_BASE_URL || '',
    customApiKey: process.env.CUSTOM_AI_API_KEY || '',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@localhost',
    to: process.env.SMTP_TO || '',
  },

  worker: {
    mode: process.env.WORKER_MODE || 'local',
    intervalMinutes: parseInt(process.env.WORKER_INTERVAL_MINUTES, 10) || 60,
    enabled: process.env.ENABLE_BACKGROUND_WORKER !== 'false',
  },

  timezone: process.env.TZ || 'Asia/Kolkata',

  // Default search profiles (seeded into DB on first run)
  defaultSearchTerms: [
    'airdrop', 'claim', 'drop wallet', 'wallet address',
    'community rewards', 'testnet rewards', 'snapshot', 'claim soon',
  ],
  defaultNetworks: [
    'Solana', 'Ethereum', 'Bitcoin', 'Polygon', 'TON', 'Monad',
    'Base', 'Arbitrum', 'Optimism', 'BNB Chain', 'Custom',
  ],
  defaultNegativeKeywords: [
    'giveaway scam', 'send eth', 'send sol', 'double your',
    'verify your wallet', 'click here to claim',
  ],
};

module.exports = config;
