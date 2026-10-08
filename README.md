# api-wallzy

Cloudflare Worker API for Wallzy wallpaper data.

## Endpoints

- GET /health
- GET /wallpapers?page=1&limit=20
- GET /wallpapers/:id
- GET /wallpapers/category/:slug?page=1&limit=20

## Secrets / variables

Set these in the Cloudflare Worker settings:

- `SUPABASE_URL` — Supabase project URL (Worker variable)
- `SUPABASE_KEY` — Supabase publishable/anon key (Worker secret)

Do not put either value in `wrangler.jsonc` or commit the Supabase key.

## Deploy

```bash
npm install
npx wrangler secret put SUPABASE_KEY
npx wrangler deploy
```


<!-- Trigger deployment check -->

<!-- Cloudflare deployment trigger -->
