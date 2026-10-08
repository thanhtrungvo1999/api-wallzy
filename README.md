# api-wallzy

Cloudflare Worker API for Wallzy wallpaper data.

## Endpoints

- GET /health
- GET /wallpapers?page=1&limit=20
- GET /wallpapers/:id
- GET /wallpapers/category/:slug?page=1&limit=20

## Secrets

Set these Worker secrets:

- SUPABASE_KEY — Supabase publishable/anon key
- SUPABASE_URL — Supabase project URL

Do not commit the Supabase key.

## Deploy

```bash
npm install
npx wrangler secret put SUPABASE_KEY
npx wrangler deploy
```


<!-- Trigger deployment check -->
