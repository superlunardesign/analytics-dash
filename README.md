# Analytics Dashboard

Pulls your Instagram post performance (views, likes, comments, saves, shares,
watch time, profile visits, and bio-link taps attributed to each post) into
one sortable, filterable dashboard. Built to grow into TikTok and website
(GA4) traffic correlation later -- the database schema already has room for
both (see `backend/app/db/models.py` and `backend/app/integrations/`), but
only Instagram is wired up right now.

```
backend/    FastAPI API + sync worker (Python)
frontend/   React + Vite dashboard (TypeScript)
render.yaml Render Blueprint: Postgres + API + cron sync job + static site
```

## How it fits together

- **`analytics-dash-api`** (Render Web Service) serves the REST API the
  dashboard calls, and handles the Instagram OAuth redirect.
- **`analytics-dash-sync`** (Render Cron Job) runs every few hours, pulls
  fresh data for every connected account, and stores a new metrics
  *snapshot* per post (Instagram only gives current totals, not history, so
  this is what lets the dashboard show trends later instead of just current
  values).
- **`analytics-dash-frontend`** (Render Static Site) is the dashboard UI.
- **`analytics-dash-db`** (Render Postgres) holds everything.

## 1. Create a Meta developer app (one-time)

Instagram's API only allows a Business or Creator account to authorize
access, and it goes through Meta's developer platform even for a single
personal account.

1. Convert your Instagram account to a **Business** or **Creator** account
   if it isn't already (Instagram app → Settings → Account type).
2. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps)
   and create a new app using the **Business** use case.
3. In the app dashboard, add the **Instagram** product ("Add Product" →
   Instagram → Set Up), using the newer **Instagram API with Instagram
   Login** flow (it doesn't require linking a Facebook Page).
4. Under the Instagram product's settings, add yourself as a **tester**
   (your own Instagram account) and accept the invite from the Instagram
   app on your phone (Settings → Apps and Websites → Tester Invites). This
   is what lets you authorize the app **without needing Meta's App Review**
   -- App Review is only required to onboard other people's accounts.
5. Note your **App ID** and **App Secret** (App Dashboard → App Settings →
   Basic) -- these become `META_APP_ID` / `META_APP_SECRET`.
6. Add a **Valid OAuth Redirect URI**. Locally this is
   `http://localhost:8000/api/instagram/oauth/callback`; on Render it'll be
   `https://<your-api-service>.onrender.com/api/instagram/oauth/callback`
   (you'll get the real Render URL after the first deploy -- add it here
   once you have it).

## 2. Deploy to Render

1. Push this repo to GitHub/GitLab and create a new **Blueprint** in Render
   pointing at it -- Render will read `render.yaml` and provision the
   database, API, cron job, and static site.
2. Generate an encryption key locally:
   `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
3. On **both** the `analytics-dash-api` service and the `analytics-dash-sync`
   cron job (Environment tab on each), set the same three values:
   - `TOKEN_ENCRYPTION_KEY` -- the key from step 2
   - `META_APP_ID` / `META_APP_SECRET` -- from step 1

   These have to match exactly on both services, since they encrypt and
   decrypt the same stored OAuth tokens. (Render blueprints can't predefine
   a shared group with values you fill in after creation, so it's two
   copy-pastes instead of one.)
4. On the `analytics-dash-api` service, also set:
   - `INSTAGRAM_REDIRECT_URI` = `https://<api-service>.onrender.com/api/instagram/oauth/callback`
     (and add this same URL to the Meta app's Valid OAuth Redirect URIs)
   - `FRONTEND_BASE_URL` = `https://<frontend-service>.onrender.com`
5. On the `analytics-dash-frontend` service, set:
   - `VITE_API_BASE_URL` = `https://<api-service>.onrender.com`
6. Redeploy the API and frontend services so the new env vars take effect,
   then open the frontend URL and click **Connect Instagram**.

Note: Render has no free tier for cron jobs (~$1/month minimum on the
cheapest paid plan); the API and static site do run on the free plan.

## 3. Local development

Backend:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in META_APP_ID / META_APP_SECRET / TOKEN_ENCRYPTION_KEY
alembic upgrade head
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env.local   # VITE_API_BASE_URL=http://localhost:8000
npm run dev
```

Visit `http://localhost:5173`, click **Connect Instagram**, and authorize.
Then click **Sync now** to pull your posts, or run the same sync manually
with `python sync_cron.py` from `backend/`.

## Notes on what's actually available from Instagram

- **Views, reach, likes, comments, saves, shares, total interactions**:
  available per post.
- **Profile visits and bio-link taps per post**: available via Instagram's
  `profile_activity` breakdown metric on feed/reel posts -- this is separate
  from the account-level `profile_views`/`website_clicks` metrics Meta
  deprecated in Jan 2025, and survived that deprecation.
- **Watch time**: Reels expose an average watch-time metric; total watch
  time is stored too where the API provides it.
- **Topic detection**: not an Instagram feature. The `posts.topic` column
  and the dashboard's topic badge exist but are left `null` for now -- you
  chose to skip this for the first version. When you want it, the natural
  approach is a Claude API call per post caption (see
  `backend/app/services/instagram_sync.py` for where to hook it in).
- Meta has changed which metrics are valid multiple times over the last two
  years. If a sync run starts failing with "Invalid metric" errors, check
  `backend/app/integrations/instagram/client.py` against
  [Meta's current Instagram Media Insights docs](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/).

## What's scaffolded but not built yet

- **TikTok**: `backend/app/integrations/tiktok/client.py` documents the
  intended shape. The `posts` / `post_metric_snapshots` tables are already
  platform-agnostic (a `platform` column distinguishes Instagram from
  TikTok rows), so no schema changes should be needed to add it.
- **Website traffic correlation**: `backend/app/integrations/website/ga4_client.py`
  documents pulling GA4 traffic-acquisition data into the `website_sessions`
  table and correlating it to posts by UTM tagging or time-window
  heuristics.
