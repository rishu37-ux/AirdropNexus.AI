# AirdropNexus AI — Security

## Security Principles

1. **Secrets never leave the server**: API keys, OAuth tokens, and SMTP credentials are stored encrypted at rest and never transmitted to the frontend.
2. **Encryption at rest**: Provider secrets use AES-256-GCM encryption with a master key supplied via `ENCRYPTION_MASTER_KEY` environment variable.
3. **Minimal data collection**: No private keys, seed phrases, passwords, or signing secrets are collected or stored.
4. **Least privilege**: X OAuth requests minimum necessary scopes only.
5. **Redacted logging**: Authorization headers, tokens, API keys, and secrets are redacted from all logs.

## Session Security

- Session cookie: `HttpOnly`, `Secure` (production), `SameSite=Lax`
- Session name: `an_session` (non-default to avoid targeting)
- Session timeout: 7 days, rolling
- Session secret from `SESSION_SECRET` environment variable

## API Security

- Rate limiting: 100 requests per 15 minutes per IP (API), 20 per 15 minutes (auth)
- CORS: Enabled with credentials
- Helmet: Security headers (CSP disabled for inline styles, can be customized)
- Input validation: express-validator on all mutating endpoints
- Output escaping: XSS prevention in templates

## OAuth 2.0 Security (X / Twitter)

- Uses OAuth 2.0 Authorization Code with PKCE
- Code verifier and state stored in session (temporary)
- State parameter validated on callback to prevent CSRF
- No X password ever collected
- No session cookies or browser credentials collected
- Token refresh handled server-side
- Revocation supported via disconnect

## Data Protection

### Encrypted Fields

| Field | Table | Encryption |
|-------|-------|------------|
| `access_token_encrypted` | oauth_connections | AES-256-GCM |
| `refresh_token_encrypted` | oauth_connections | AES-256-GCM |
| `api_key_encrypted` | provider_configs | AES-256-GCM |

### Key Management

- Master key: `ENCRYPTION_MASTER_KEY` (32 bytes, hex-encoded)
- Key must be provided via environment variable only
- Key is never stored in database or logs
- Key rotation requires re-encrypting all secrets

## Wallet Security

- Only public wallet addresses stored (never private keys)
- Addresses shown in shortened form by default (e.g., `0x1234…5678`)
- Explicit reveal/copy action required to see full address
- Warning displayed: public addresses are public information, but association with user account may be sensitive

## Security Checklist

- [ ] `.env` is in `.gitignore` and never committed
- [ ] `SESSION_SECRET` is strong and unique
- [ ] `ENCRYPTION_MASTER_KEY` is 32 bytes (64 hex chars)
- [ ] `NODE_ENV=production` in production
- [ ] HTTPS/TLS enabled in production
- [ ] Database file permissions restrict access
- [ ] Backup encryption for exported data

## Reporting Security Issues

Please report security concerns via GitHub Issues or contact the repository owner.
