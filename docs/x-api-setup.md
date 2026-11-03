# AirdropNexus AI — X (Twitter) API Setup

## Overview

AirdropNexus AI integrates with X (Twitter) using the official OAuth 2.0 Authorization Code flow with PKCE. The integration is read-only — no automated Likes, reposts, or replies are sent without explicit user action.

## Step 1: Create a X Developer App

1. Go to [https://developer.x.com/](https://developer.x.com/)
2. Sign in with your X account
3. Navigate to "Projects & Apps" → "Create App"
4. Fill in:
   - **App name**: AirdropNexus AI
   - **Description**: Personal crypto airdrop monitoring dashboard
   - **Website**: `http://localhost:3000` (or your production URL)
   - **Callback URI**: `http://localhost:3000/auth/x/callback` (must match `X_CALLBACK_URL` in .env)

## Step 2: Configure OAuth 2.0 Settings

In your X Developer App settings:

1. Enable **OAuth 2.0** (it's enabled by default for new apps)
2. Set **Callback URI** to: `http://localhost:3000/auth/x/callback`
3. Set **Type of App** to: `Web App` or `Automated App` (depending on your use case)
4. Copy **Client ID** and **Client Secret**

## Step 3: Configure Environment Variables

Add to your `.env` file:

```env
X_CLIENT_ID=your_client_id_here
X_CLIENT_SECRET=your_client_secret_here
X_CALLBACK_URL=http://localhost:3000/auth/x/callback
X_SCOPES=tweet.read,users.read,offline.access
```

## Step 4: Connect X in the App

1. Start the application: `npm start`
2. Open `http://localhost:3000`
3. Navigate to **X (Twitter)** in the sidebar
4. Click **Connect X**
5. Authorize the app on X
6. You'll be redirected back to the dashboard with connection status

## Scopes Explained

| Scope | Purpose |
|-------|---------|
| `tweet.read` | Read tweets (needed for monitoring airdrop posts) |
| `users.read` | Read user profile info |
| `offline.access` | Enable token refresh (long-lived access) |

## Rate Limits

X API rate limits depend on your access tier:

| Endpoint | Free Tier | Paid Tiers |
|----------|-----------|------------|
| GET /2/tweets/search/recent | 50 requests/month* | Higher limits |
| GET /2/users/me | 50 requests/month* | Higher limits |

*\*Subject to change. Check X Developer Portal for current limits.*

The app respects `x-rate-limit` headers and implements exponential backoff on rate limit errors.

## Important Policy Compliance

1. **No automated Likes**: The app does not implement automated Like functionality
2. **No automated replies/reposts**: Only draft creation is supported; user must manually post
3. **No evasion of rate limits**: The app respects all API rate limits
4. **No scraping**: Only official API endpoints are used
5. **No private data access**: Only public posts are accessed

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `X_CLIENT_ID` not set | Add to .env and restart |
| Redirect URI mismatch | Ensure callback URL in X Developer App matches `.env` exactly |
| Invalid client | Verify Client ID and Client Secret are correct |
| Token expired | The app handles refresh automatically; reconnect if needed |
| 403 Forbidden | Check your X API access tier and scopes |

## Disconnecting X

1. Navigate to **X (Twitter)** in the sidebar
2. Click **Disconnect X**
3. All stored tokens are removed from the database
