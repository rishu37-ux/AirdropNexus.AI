# AirdropNexus AI — Deployment

## Local Development

### Prerequisites
- Node.js >= 18 (tested with v24)
- npm >= 9

### Installation

```bash
# Clone the repository
git clone https://github.com/rishu37-ux/AirdropNexus.AI.git
cd AirdropNexus.AI

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your values (at minimum SESSION_SECRET and ENCRYPTION_MASTER_KEY)
# Generate secrets:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Initialize database
node src/database/migrate.js
node src/database/seed.js

# Start the server
npm start

# Or with auto-reload for development
npm run dev
```

The app will be available at `http://localhost:3000`.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION_SECRET` | Yes | Session signing secret (32+ random hex chars) |
| `ENCRYPTION_MASTER_KEY` | Yes | 32-byte hex key for encrypting provider secrets |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `development` or `production` (default: development) |
| `APP_URL` | No | Public URL of the app |
| `DB_PATH` | No | SQLite database file path |
| `X_CLIENT_ID` | No | X (Twitter) OAuth 2.0 client ID |
| `X_CLIENT_SECRET` | No | X OAuth 2.0 client secret |
| `X_CALLBACK_URL` | No | OAuth callback URL |
| `OPENAI_API_KEY` | No | OpenAI API key (optional) |
| `GOOGLE_AI_API_KEY` | No | Google AI Studio API key (optional) |
| `ANTHROPIC_API_KEY` | No | Anthropic API key (optional) |
| `OLLAMA_BASE_URL` | No | Ollama server URL (default: http://localhost:11434) |
| `OLLAMA_MODEL` | No | Ollama model name (default: llama3.2) |
| `SMTP_HOST` | No | SMTP server for email reports |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `SMTP_FROM` | No | From address for emails |
| `SMTP_TO` | No | Recipient for daily reports |
| `WORKER_MODE` | No | `local` or `cloud` (default: local) |
| `TZ` | No | Timezone (default: Asia/Kolkata) |

## Production Deployment

### Option 1: Self-hosted (VPS, dedicated server)

```bash
# Set production environment
export NODE_ENV=production
export SESSION_SECRET=<strong-secret>
export ENCRYPTION_MASTER_KEY=<32-byte-hex>

# Start with process manager (pm2 recommended)
npm install -g pm2
pm2 start src/app.js --name airdropnexus
pm2 save
pm2 startup
```

### Option 2: Docker

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/app.js"]
```

### Option 3: PaaS (Render, Railway, Fly.io)

Connect your GitHub repository and deploy. Set environment variables in the platform dashboard.

**Important:** PaaS platforms with ephemeral filesystems will lose SQLite data on restart. Use persistent disk storage or migrate to PostgreSQL for production.

## Background Worker

The background worker runs scheduled agent jobs. In local mode, it runs as part of the main process. For cloud deployment, you may want to run a separate worker process.

Worker settings are controlled via `WORKER_MODE`, `WORKER_INTERVAL_MINUTES`, and `ENABLE_BACKGROUND_WORKER` environment variables.

## Database Migration

The schema is versioned. To apply migrations:

```bash
node src/database/migrate.js
```

To rollback:

```bash
node src/database/migrate.js --rollback
```

## Backup & Restore

### Backup
```bash
# Export all data
curl -X POST http://localhost:3000/api/settings/export > backup.json

# Or copy the SQLite database file directly
cp data/airdropnexus.sqlite backup.sqlite
```

### Restore
```bash
# Import data via API (to be implemented)
# Or replace the SQLite database file
cp backup.sqlite data/airdropnexus.sqlite
```

## Free-Tier Limitations

- **GitHub Pages / Static hosting**: Cannot run backend or background workers
- **Render free tier**: Spins down after inactivity, cold start ~30s
- **Railway free trial**: Limited hours, requires credit card for continued use
- **Fly.io free tier**: Limited shared CPU, 256MB RAM, ephemeral storage
- **Ollama**: Local only, limited by hardware (RAM, CPU/GPU)
- **X API**: Rate limits apply, depends on access tier

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ENCRYPTION_MASTER_KEY` must be 64 hex chars | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Port 3000 already in use | Change `PORT` in .env or kill existing process |
| Database locked | Ensure only one instance is running |
| X OAuth fails | Verify `X_CALLBACK_URL` matches your X Developer App settings |
| AI provider test fails | Verify API key and endpoint in .env |
