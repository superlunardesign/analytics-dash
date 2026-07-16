# Analytics Dashboard

Pulls your Instagram post performance (views, likes, comments, saves, shares,
watch time, profile visits, and bio-link taps attributed to each post) into
one sortable, filterable dashboard, and correlates it with your Wix site's
traffic and form submissions (project applications) -- click a point on the
traffic chart to filter your posts to whatever you published around that
date. Built to grow into TikTok later -- the database schema already has
room for it (see `backend/app/db/models.py` and
`backend/app/integrations/tiktok/`), but only Instagram and Wix are wired up
right now.

```
backend/    FastAPI API + sync worker (Python)
frontend/   React + Vite dashboard (TypeScript)
render.yaml Render Blueprint: Postgres + API + cron sync job + static site
```

## How it fits together

- **`analytics-dash-api`** (Render Web Service) serves the REST API the
  dashboard calls, handles the Instagram OAuth redirect, and receives the
  Wix "App Instance Installed" webhook.
- **`analytics-dash-sync`** (Render Cron Job) runs every few hours, pulls
  fresh data for every connected Instagram account and Wix site. For
  Instagram it stores a new metrics *snapshot* per post (Instagram only
  gives current totals, not history, so this is what lets the dashboard
  show trends later instead of just current values). For Wix it re-syncs a
  rolling window of recent traffic/form-submission data (older days don't
  change, so it doesn't re-fetch everything every time).
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

## 2. Create a Wix custom app (one-time, optional -- website traffic correlation)

Skip this section if you only want the Instagram side.

Wix's newer app auth model has no redirect handshake to build -- the site
owner installs the app through Wix's own UI, and the backend learns the
result purely via a webhook.

1. Go to [manage.wix.com/account/custom-apps](https://manage.wix.com/account/custom-apps)
   and create a new app.
2. Under **Permissions**, add:
   - **Read Site Analytics** (`SCOPE.DC-ANALYTICS-AND-REPORTS.READ-SITE-ANALYTICS`)
   - Whatever forms-related read permission the app dashboard surfaces when
     you search "forms" (needed for the `forms-actions` analytics model --
     the project-application data).
3. Under **OAuth**, note the **App ID** and **App Secret** -- these become
   `WIX_APP_ID` / `WIX_APP_SECRET`.
4. Under **Webhooks**, add a webhook:
   - API Category: **App Management**
   - Event: **App Instance Installed**
   - Callback URL: `https://<your-api-service>.onrender.com/api/wix/webhooks/app-instance-installed`
     (you'll only have this URL after the API's first deploy -- add it once
     you do)
   - Click **Get Public Key** and save it -- this becomes `WIX_WEBHOOK_PUBLIC_KEY`.
5. Once the API is deployed and the webhook URL is set, install the app on
   your own site: from the app's dashboard, use **Test Your App** (or the
   install link Wix provides) and select your site. You'll be prompted to
   grant the permissions from step 2 -- approve them.
6. The dashboard's **Connect Wix** button (under "Show website traffic
   correlation") also links to the same install flow, if you'd rather start
   from there. It doesn't redirect you back to the dashboard afterward --
   `/installer/install` rejects a `redirectUrl` param unless that exact URL
   is pre-registered somewhere Wix doesn't expose for a self-managed app
   with no dashboard-page extension, so the app just omits it. You'll land
   on Wix's own generic confirmation page after approving; go back to the
   dashboard tab and refresh to see the connected status (the backend
   already has it via the webhook regardless of where the browser ends up).

## 3. Deploy to Render

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
   - If using Wix: `WIX_APP_ID`, `WIX_APP_SECRET`, `WIX_WEBHOOK_PUBLIC_KEY`
     from step 2 above
5. If using Wix: on the `analytics-dash-sync` cron job, also set
   `WIX_APP_ID` / `WIX_APP_SECRET` (must match the API service exactly).
6. On the `analytics-dash-frontend` service, set:
   - `VITE_API_BASE_URL` = `https://<api-service>.onrender.com`
7. Redeploy the API and frontend services so the new env vars take effect,
   then open the frontend URL and click **Connect Instagram** (and, if
   using Wix, install the Wix app on your site per step 2.5 above).

Note: Render has no free tier for cron jobs (~$1/month minimum on the
cheapest paid plan); the API and static site do run on the free plan.

## 4. Local development

Backend:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in META_APP_ID / META_APP_SECRET / TOKEN_ENCRYPTION_KEY / WIX_*
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

Testing the Wix webhook locally requires a public URL (Wix can't reach
`localhost`) -- use a tunnel tool (e.g. ngrok) and point the app's webhook
Callback URL at the tunnel's address while developing.

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

## Notes on what's actually available from Wix

- **Sessions, views, unique visitors, per-page breakdown**: from the
  `traffic` semantic model, bucketed daily. This is what feeds the traffic
  chart and the top-pages list.
- **Form submissions** (e.g. project applications), with submitter name and
  email: from the `forms-actions` semantic model. Wix's model returns every
  form on the site together (newsletter signups, contact forms, etc.), so
  every submission is still synced into the database, but the dashboard's
  "Applications" stat/list only counts one form: set `WIX_APPLICATION_FORM_NAME`
  to its exact name to narrow it down. Leave it unset and every form counts
  (the default, and almost certainly not what you want). To find the exact
  name, check `GET /api/website/form-names` once some submissions have
  synced, or look at the "Recent applications" list in the dashboard, which
  shows each submission's form name underneath the submitter.
- Both models' field names were confirmed live against a real Wix Studio
  site, but Wix doesn't publicly document the full field list the way Meta
  does -- if a sync starts failing, check
  `backend/app/integrations/wix/client.py`'s field lists against
  `GET /analytics/semantic-model/v3/semantic-models/{id}` for the
  `traffic`/`forms-actions` model IDs.
- Wix's install model has no refresh token to rotate -- the backend mints a
  new short-lived (4h) access token on every sync run using just
  `WIX_APP_ID`/`WIX_APP_SECRET`/the stored `instance_id`.

## What's scaffolded but not built yet

- **TikTok**: `backend/app/integrations/tiktok/client.py` documents the
  intended shape. The `posts` / `post_metric_snapshots` tables are already
  platform-agnostic (a `platform` column distinguishes Instagram from
  TikTok rows), so no schema changes should be needed to add it.
