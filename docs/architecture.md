# AirdropNexus AI — Architecture

## Overview

AirdropNexus AI is a personal Crypto Airdrop Opportunity Intelligence and X (Twitter) Campaign Monitoring dashboard. It is designed for single-owner personal use with a modular architecture that can be extended to multi-user/SaaS in the future.

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | HTML5, CSS3, JavaScript (vanilla) | Lightweight, no build step, works everywhere |
| Backend | Node.js + Express | Familiar, fast development, rich ecosystem |
| Database | SQLite (via sql.js) | Zero-configuration, file-based, works on all platforms |
| Background Worker | Node.js (node-cron) | Separate process for scheduled jobs |
| AI Providers | Modular adapters (OpenAI, Google, Anthropic, Ollama, etc.) | Pluggable, supports local models |
| Session | express-session | Server-side sessions, HttpOnly cookies |
| Encryption | AES-256-GCM | At-rest encryption for provider secrets |

## Directory Structure

```
AirdropNexus.AI/
├── .env                      # Runtime secrets (NOT committed)
├── .env.example              # Template with placeholder values
├── .gitignore                # Git ignore rules
├── package.json              # Dependencies and scripts
├── README.md                 # Project documentation
├── data/                     # SQLite database file (runtime)
├── public/                   # Frontend static files
│   ├── index.html            # SPA entry point
│   ├── css/style.css         # Stylesheet
│   └── js/app.js             # Frontend application logic
├── src/
│   ├── app.js                # Express application entry point
│   ├── config/
│   │   ├── env.js            # Environment configuration
│   │   ├── encryption.js     # AES-256-GCM encryption at rest
│   │   └── logger.js         # Redacted structured logger
│   ├── database/
│   │   ├── db.js             # Database abstraction (sql.js)
│   │   ├── migrate.js        # Schema migration runner
│   │   ├── schema.sql        # Database schema
│   │   └── seed.js           # Default demo data
│   ├── routes/               # API route handlers
│   │   ├── auth.js           # Auth + X OAuth 2.0 PKCE
│   │   ├── users.js          # User profile
│   │   ├── settings.js       # User settings + export
│   │   ├── wallets.js        # Wallet manager (CRUD, CSV)
│   │   ├── searchProfiles.js # Search profile config
│   │   ├── agents.js         # Agent configuration + manual run
│   │   ├── jobs.js           # Job queue + run history
│   │   ├── campaigns.js      # Campaign explorer (CRUD, CSV)
│   │   ├── x.js              # X integration status
│   │   ├── ai.js             # AI provider catalog + config
│   │   ├── reports.js        # Daily reports + SMTP
│   │   └── health.js         # Deployment health
│   └── workers/              # Background job processor (planned)
├── tests/                    # Unit and integration tests
└── docs/                     # Documentation
    ├── architecture.md       # This file
    ├── deployment.md         # Deployment instructions
    ├── security.md           # Security model
    └── x-api-setup.md        # X API setup guide
```

## Data Flow

1. **Frontend** makes API calls to Express backend
2. **Express** validates input, queries SQLite via abstraction layer
3. **Database layer** (`sql.js`) executes SQL, returns objects with named properties
4. **Background worker** (planned) runs scheduled agent jobs independently
5. **AI adapters** call external providers (or Ollama locally) for analysis
6. **X OAuth 2.0** uses PKCE flow for secure token exchange

## Security Model

- All secrets stored server-side, encrypted at rest with AES-256-GCM
- Master encryption key only in environment variable (`ENCRYPTION_MASTER_KEY`)
- API keys never returned to frontend
- Session cookies: HttpOnly, Secure (production), SameSite=Lax
- Logger redacts authorization headers, tokens, keys, secrets
- Rate limiting on API and auth endpoints
- Helmet security headers
- No private keys, seed phrases, or signing secrets stored

## Execution Modes

### Local Mode (default)
- Backend runs on owner's machine
- Agents stop when machine is off
- API-cost-free when using Ollama local models
- SQLite database is durable (stored on disk)

### Cloud Mode (planned)
- Background worker runs independently in cloud
- Requires persistent worker hosting (not GitHub Pages/static)
- SQLite on ephemeral storage is NOT durable — use external database

## Limitations

- Single-user design (no public signup/billing in initial build)
- X integration is read-only (no automated Likes, replies via draft only)
- Background worker requires separate process hosting
- Free-tier cloud hosting may have sleep/cold-start limitations
