# AirdropNexus AI

> Personal Crypto Airdrop Opportunity Intelligence and X (Twitter) Campaign Monitoring dashboard.

A professional, elegant control center for discovering crypto campaigns and airdrop opportunities, analyzing public X posts, detecting wallet-address requests, managing public wallet addresses, coordinating AI agents, and producing daily reports.

## Features

- **Overview Dashboard** — Truthful, database-backed metrics with agent status, X connection, AI provider status, wallet counts, and campaign discovery stats
- **Agent Center** — 9 configurable agents (Campaign Discovery, X Monitoring, Keyword Recognition, Wallet Detection, Verification, Scoring, Engagement Draft, Daily Report, Master Orchestrator) with individual enable/disable, scheduling, and manual run
- **Campaign Explorer** — Filterable, searchable list of discovered opportunities with confidence scores, risk indicators, status workflow (New → Relevant → Ignored → Watchlist → Completed → Scam/Suspicious), and CSV export
- **X (Twitter) Integration** — Official OAuth 2.0 with PKCE, connection status, scope display, token refresh, and revocation. Read-only — no automated Likes
- **Wallet Manager** — Public address management across 11+ networks (Solana, Ethereum, Bitcoin, Polygon, TON, Monad, Base, Arbitrum, Optimism, BNB Chain, Custom), with format validation, CSV import/export, and shortened display
- **AI Model Manager** — Configurable providers (Google Gemini, OpenAI, Anthropic Claude, xAI Grok, Groq, OpenRouter, Mistral, Ollama local, custom OpenAI-compatible) with encrypted key storage and test connection
- **Run Engine / Scheduler** — Background job queue with queued/running/succeeded/failed/canceled statuses, retries with exponential backoff, deduplication, and worker heartbeat
- **Activity Logs** — Job execution history and system activity
- **Daily Reports** — Auto-generated reports with post scans, campaign discoveries, failures, and optional SMTP email delivery
- **Settings** — Theme (dark/light/system), timezone (default Asia/Kolkata), report schedule, data retention, export/backup
- **Deployment Health** — Worker status, heartbeat, last run, next run, integration status

## Tech Stack

- **Frontend**: HTML5, CSS3, vanilla JavaScript (responsive, dark/light themes)
- **Backend**: Node.js + Express
- **Database**: SQLite (via sql.js, no native build tools required)
- **Authentication**: express-session with secure cookies
- **Encryption**: AES-256-GCM at rest for provider secrets

## Quick Start

```bash
# Clone
git clone https://github.com/rishu37-ux/AirdropNexus.AI.git
cd AirdropNexus.AI

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env and set SESSION_SECRET + ENCRYPTION_MASTER_KEY

# Initialize database
node src/database/migrate.js
node src/database/seed.js

# Start
npm start
# or for development with auto-reload:
npm run dev
```

Open `http://localhost:3000` in your browser.

## Project Structure

```
README.md
.env.example
.gitignore
package.json
src/
  app.js              # Express app entry point
  config/             # env, encryption, logger
  database/           # db, migrations, schema, seed
  routes/             # API routes (auth, wallets, agents, campaigns, etc.)
  workers/            # Background job processor
public/
  index.html          # SPA entry point
  css/style.css       # Styles
  js/app.js           # Frontend logic
tests/
  unit.test.js        # Unit tests
docs/
  architecture.md     # System architecture
  deployment.md       # Deployment guide
  security.md         # Security model
  x-api-setup.md      # X API setup guide
```

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start with auto-reload (development) |
| `npm run migrate` | Run database migrations |
| `npm run seed` | Seed default demo data |
| `npm test` | Run unit tests |

## Environment Variables

See `.env.example` for the full list. Required minimums:

```
SESSION_SECRET=<32-byte hex>
ENCRYPTION_MASTER_KEY=<32-byte hex>
```

Generate secrets with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Security

- All API keys and OAuth tokens encrypted at rest (AES-256-GCM)
- Master key only in environment variable
- Secrets never returned to frontend
- Session cookies: HttpOnly, Secure (production), SameSite
- No private keys, seed phrases, or signing secrets collected
- Rate limiting and security headers via Helmet

See `docs/security.md` for details.

## X (Twitter) API

Integration uses official OAuth 2.0 with PKCE. Read-only access — no automated Likes. Replies are draft-only unless explicitly authorized.

See `docs/x-api-setup.md` for setup instructions.

## Deployment

See `docs/deployment.md` for local, VPS, Docker, and PaaS deployment options.

## License

MIT

## Disclaimer

This tool is for personal use and educational purposes. Crypto airdrops carry financial risk. Always verify campaign legitimacy independently. The app does not guarantee the legitimacy of any campaign or opportunity.
