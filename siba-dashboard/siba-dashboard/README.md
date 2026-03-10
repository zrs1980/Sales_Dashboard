# SIBA Sales Command Center

Live HubSpot dashboard deployed on Vercel. Data fetches fresh on every page load from `/api/hubspot`.

## Quick Deploy

### 1. Get your HubSpot Private App Token
1. HubSpot → Settings → Integrations → Private Apps → Create a private app
2. Name it: `SIBA Dashboard`
3. Scopes tab — add:
   - `crm.objects.deals.read`
   - `crm.objects.contacts.read`
   - `crm.objects.owners.read`
4. Create app → copy the token (starts with `pat-na1-...`)

### 2. Install Vercel CLI
```bash
npm install -g vercel
```

### 3. Deploy
```bash
cd siba-dashboard
vercel
```
Follow the prompts (link to your account, create new project).

### 4. Set environment variable
In your Vercel dashboard → Project → Settings → Environment Variables:
- Name: `HUBSPOT_TOKEN`
- Value: `pat-na1-xxxxxxxxxxxx` (your token from Step 1)
- Environment: Production, Preview, Development (check all three)

### 5. Redeploy with env var active
```bash
vercel --prod
```

Your dashboard is now live at `https://your-project.vercel.app`

## How it works

- `public/index.html` — The dashboard UI (same design as v2)
- `api/hubspot.js` — Serverless function that calls HubSpot API server-side (token never exposed to browser)
- Data fetches on every page load (fresh from HubSpot)
- Also auto-refreshes every hour while the tab is open

## Updating deal insights

The `DEAL_INSIGHTS` object in `index.html` contains the hand-written deal context notes (keyed by HubSpot deal ID). Update these manually as deals progress — the rest of the data (amounts, stages, dates, notes count) is always live from HubSpot.

## Pipeline IDs
- Loop ERP: `default`
- CEBA: `96753255`

Update these in `api/hubspot.js` if your pipeline IDs differ.
