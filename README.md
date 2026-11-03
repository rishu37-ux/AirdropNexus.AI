# AirDropNexus — Server-backed project package

This package is a real server-backed application foundation, not a localStorage demo. It includes server-side registration/login, PostgreSQL persistence, wallet and campaign CRUD, activity history, and an X OAuth 2.0 PKCE connection + post endpoint.

## Requirements
- Node.js 20+
- PostgreSQL 14+
- An HTTPS deployment URL for production cookies and OAuth callbacks
- X Developer account / application configured for OAuth 2.0 (required only for X features)

## Install and run locally
1. Install Node.js and PostgreSQL.
2. Create a PostgreSQL database named `airdropnexus`.
3. Copy `.env.example` to `.env` and set `DATABASE_URL` and a strong `SESSION_SECRET` (32+ random characters).
4. Install dependencies: `npm install`
5. Initialize tables: `npm run db:init`
6. Start: `npm start`
7. Open `http://localhost:3000`

## Production deployment checklist
- Deploy behind HTTPS; set `NODE_ENV=production` and `COOKIE_SECURE=true`.
- Set a unique random `SESSION_SECRET`; do not commit `.env`.
- Use a managed PostgreSQL database, TLS, automated backups, and least-privilege database credentials.
- Configure reverse proxy `trust proxy` appropriately for your host.
- Set strict CSP after choosing/locking any external assets.
- Add email verification, password reset, MFA, audit/retention policy, and monitoring before opening public registration at scale.
- Run dependency audit and security testing before public launch.

## X integration
In the X Developer Portal, configure OAuth 2.0 Authorization Code with PKCE and add the exact callback URL from `X_CALLBACK_URL`. Set `X_CLIENT_ID`, `X_CLIENT_SECRET` (confidential client), and `X_CALLBACK_URL` in `.env`. Scopes requested: `users.read tweet.read tweet.write like.write offline.access`. Existing X connections must reconnect to grant the added `like.write` scope. API access tiers, quotas, and policy are controlled by X. The app stores access/refresh tokens in PostgreSQL and refreshes near-expiry access tokens using the rotating refresh token (serialized per user); for production, encrypt tokens at rest with a managed KMS or application-level envelope encryption.

## Current functional modules
- Account registration/sign-in/sign-out with bcrypt password hashes and server sessions (PostgreSQL session store)
- Dashboard counts and recent activity
- Wallet address book (create/list/delete, per-user data isolation)
- Campaign tracker (create/list/update status/delete)
- Activity log
- X OAuth PKCE connect/status, refresh-token renewal, and real post endpoint (requires configured X app and granted access)\n- Agent manual run performs real read-only X recent-search discovery for enabled account/hashtag targets, deduplicates results, and records discovery logs; it does not simulate success

## Not yet included / requires additional product decisions and credentials
- On-chain wallet signature verification (SIWE / chain-specific nonce verification) and transaction execution
- Automatic airdrop eligibility discovery, scraping, or claim automation (must be implemented per project using official APIs/contracts; no universal safe API)
- Automatic likes, reposts, and replies (discovery is read-only; each action needs a separate consent-aware implementation, endpoint checks, limits, and audit trail)\n- Scheduled agent discovery execution (GitHub Actions currently reaches the scheduler heartbeat; it does not yet run discovery for users in the background)
- AI agent orchestration (requires provider API keys, model choices, limits, and task definitions)
- Email delivery provider, password reset, email verification, MFA
- Admin console / RBAC management and billing

No credentials are embedded. Features that require external access are intentionally unavailable until the corresponding secrets, scopes, APIs, and provider configuration are supplied.

## Security notes
- Passwords are bcrypt-hashed (cost 12); sessions are server-side and stored in PostgreSQL.
- API routes validate payloads and apply basic rate limiting.
- The app is not a substitute for a security review. Do not use production wallets or tokens until HTTPS, token encryption, backup, monitoring, refresh handling, and security review are completed.

## Free scheduled agent heartbeat
A GitHub Actions workflow `.github/workflows/agent-scheduler.yml` runs every 15 minutes (UTC) and can also be started manually. To connect it to a deployed server:
1. Set server environment variable `SCHEDULER_SECRET` to a cryptographically random value of at least 32 characters.
2. In GitHub repository **Settings → Secrets and variables → Actions**, add:
   - `AIRDROPNEXUS_APP_URL`: your deployed HTTPS base URL (no trailing slash required)
   - `AIRDROPNEXUS_SCHEDULER_SECRET`: the same value as server `SCHEDULER_SECRET`
3. Run **Actions → Agent Scheduler → Run workflow** to verify connectivity.

The endpoint `POST /api/internal/scheduler/run` is protected by a constant-time bearer-secret check. Currently it is a heartbeat/eligibility endpoint only and explicitly executes zero actions. The scheduler currently remains a heartbeat and does not launch user agent discovery. Manual discovery is available through `/api/agents/run`; it is read-only and does not execute likes, reposts, or replies. GitHub Actions free-tier limits and schedule delays apply; this is not guaranteed 24/7 hosting.
