interface Env {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

const publicHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Authorization, Content-Type",
  "access-control-allow-methods": "GET, PUT, DELETE, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...publicHeaders,
      "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
    },
  });

const privateJson = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...publicHeaders,
      "cache-control": "private, no-store",
      Vary: "Authorization",
    },
  });

const SUPABASE_PROJECT_URL = "https://ifxyedycsnmepnrszvcn.supabase.co";

async function supabase(env: Env, path: string) {
  const key = String(env.SUPABASE_KEY || "").trim();

  if (!key) {
    throw new Error("SUPABASE_KEY secret is missing from the Cloudflare Worker.");
  }

  const response = await fetch(SUPABASE_PROJECT_URL + path, {
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase request failed: ${response.status} ${body}`);
  }

  return response.json();
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function getUserIdFromToken(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = atob(padded);
    const claims = JSON.parse(decoded);
    return typeof claims?.sub === "string" ? claims.sub : "";
  } catch {
    return "";
  }
}

async function supabaseUser(
  env: Env,
  token: string,
  path: string,
  options: { method?: string; body?: unknown } = {},
) {
  const key = String(env.SUPABASE_KEY || "").trim();
  if (!key) {
    throw new Error("SUPABASE_KEY secret is missing from the Cloudflare Worker.");
  }

  const headers: Record<string, string> = {
    apikey: key,
    Authorization: "Bearer " + token,
  };

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    headers.Prefer = "resolution=merge-duplicates,return=minimal";
  }

  const response = await fetch(SUPABASE_PROJECT_URL + path, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase user request failed: ${response.status} ${body}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function requireUser(request: Request) {
  const token = getBearerToken(request);
  const userId = token ? getUserIdFromToken(token) : "";
  if (!token || !userId) return null;
  return { token, userId };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: publicHeaders });
    }

    if (request.method !== "GET" && request.method !== "PUT" && request.method !== "DELETE") {
      return json({ error: "Method not allowed" }, 405);
    }

    try {
      if (url.pathname === "/health") {
        return json({ ok: true });
      }

      if (url.pathname === "/favorites") {
        const auth = requireUser(request);
        if (!auth) return privateJson({ error: "Unauthorized" }, 401);

        if (request.method === "GET") {
          const rows = await supabaseUser(
            env,
            auth.token,
            "/rest/v1/favorites?select=items&user_id=eq." + encodeURIComponent(auth.userId) + "&limit=1",
          );
          const row = Array.isArray(rows) ? rows[0] : null;
          return privateJson({ items: Array.isArray(row?.items) ? row.items : [] });
        }

        if (request.method === "PUT") {
          const body = await request.json().catch(() => null);
          const items = Array.isArray(body?.items) ? body.items : [];
          await supabaseUser(
            env,
            auth.token,
            "/rest/v1/favorites?on_conflict=user_id",
            { method: "POST", body: { user_id: auth.userId, items } },
          );
          return privateJson({ items });
        }
      }

      if (url.pathname === "/gradients") {
        const auth = requireUser(request);
        if (!auth) return privateJson({ error: "Unauthorized" }, 401);

        if (request.method === "GET") {
          const rows = await supabaseUser(
            env,
            auth.token,
            "/rest/v1/gradients?select=items&user_id=eq." + encodeURIComponent(auth.userId) + "&limit=1",
          );
          const row = Array.isArray(rows) ? rows[0] : null;
          return privateJson({ items: Array.isArray(row?.items) ? row.items : [] });
        }

        if (request.method === "PUT") {
          const body = await request.json().catch(() => null);
          const items = Array.isArray(body?.items) ? body.items : [];
          await supabaseUser(
            env,
            auth.token,
            "/rest/v1/gradients?on_conflict=user_id",
            { method: "POST", body: { user_id: auth.userId, items } },
          );
          return privateJson({ items });
        }
      }

      if (url.pathname.startsWith("/gradients/") && request.method === "DELETE") {
        const auth = requireUser(request);
        if (!auth) return privateJson({ error: "Unauthorized" }, 401);

        const id = decodeURIComponent(url.pathname.slice("/gradients/".length));
        if (!id) return privateJson({ error: "Missing gradient id" }, 400);

        const rows = await supabaseUser(
          env,
          auth.token,
          "/rest/v1/gradients?select=items&user_id=eq." + encodeURIComponent(auth.userId) + "&limit=1",
        );
        const row = Array.isArray(rows) ? rows[0] : null;
        const current = Array.isArray(row?.items) ? row.items : [];
        const items = current.filter((item: any) => String(item?.id) !== String(id));

        await supabaseUser(
          env,
          auth.token,
          "/rest/v1/gradients?on_conflict=user_id",
          { method: "POST", body: { user_id: auth.userId, items } },
        );

        return privateJson({ items });
      }

      if (url.pathname === "/wallpapers") {
        const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
        const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") || "20")));
        const offset = (page - 1) * limit;

        const data = await supabase(
          env,
          "/rest/v1/wallpapers?select=id,category,keywords,storage_path,public_url,created_at" +
            "&order=created_at.desc,id.desc" +
            "&offset=" + offset +
            "&limit=" + limit
        );

        return json({ data, page, limit });
      }

      if (url.pathname === "/categories") {
        const data = await supabase(env, "/rest/v1/categories?select=*");
        return json({ data });
      }

      if (url.pathname.startsWith("/wallpapers/category/")) {
        const category = decodeURIComponent(url.pathname.slice("/wallpapers/category/".length));
        if (!category) return json({ error: "Missing category" }, 400);

        const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
        const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") || "20")));
        const offset = (page - 1) * limit;

        const data = await supabase(
          env,
          "/rest/v1/wallpapers?select=id,category,keywords,storage_path,public_url,created_at" +
            "&category=eq." + encodeURIComponent(category) +
            "&order=created_at.desc,id.desc" +
            "&offset=" + offset +
            "&limit=" + limit
        );

        return json({ data, page, limit, category });
      }

      if (url.pathname === "/wallpapers/search") {
        const query = String(url.searchParams.get("q") || "").trim().toLowerCase().replace(/^#+/, "");
        const offset = Math.max(0, Number(url.searchParams.get("offset") || "0"));
        const limit = Math.min(21, Math.max(1, Number(url.searchParams.get("limit") || "21")));

        if (!query) return json({ data: [], offset, limit, hasMore: false });

        const data = await supabase(
          env,
          "/rest/v1/rpc/search_wallpapers?search_query=" + encodeURIComponent(query) +
            "&search_offset=" + offset +
            "&search_limit=" + limit
        );

        const rows = Array.isArray(data) ? data : [];
        return json({ data: rows.slice(0, 20), offset, limit, hasMore: rows.length > 20 });
      }

      if (url.pathname.startsWith("/wallpapers/")) {
        const id = decodeURIComponent(url.pathname.slice("/wallpapers/".length));
        if (!id) return json({ error: "Missing wallpaper id" }, 400);

        if (id.endsWith("/adjacent")) {
          const wallpaperId = id.slice(0, -"/adjacent".length);
          const currentRows = await supabase(
            env,
            "/rest/v1/wallpapers?select=id,category,keywords,storage_path,public_url,created_at" +
              "&id=eq." + encodeURIComponent(wallpaperId) + "&limit=1"
          );

          const current = Array.isArray(currentRows) ? currentRows[0] : null;
          if (!current) return json({ error: "Wallpaper not found" }, 404);

          const categoryFilter = current.category
            ? "&category=eq." + encodeURIComponent(String(current.category))
            : "";

          const newerPath =
            "/rest/v1/wallpapers?select=id,category,keywords,storage_path,public_url,created_at" +
            categoryFilter +
            "&or=" + encodeURIComponent(
              "(created_at.gt." + String(current.created_at) +
              ",and(created_at.eq." + String(current.created_at) +
              ",id.gt." + String(current.id) + "))"
            ) +
            "&order=created_at.asc,id.asc&limit=1";

          const olderPath =
            "/rest/v1/wallpapers?select=id,category,keywords,storage_path,public_url,created_at" +
            categoryFilter +
            "&or=" + encodeURIComponent(
              "(created_at.lt." + String(current.created_at) +
              ",and(created_at.eq." + String(current.created_at) +
              ",id.lt." + String(current.id) + "))"
            ) +
            "&order=created_at.desc,id.desc&limit=1";

          const [newerRows, olderRows] = await Promise.all([
            supabase(env, newerPath),
            supabase(env, olderPath),
          ]);

          return json({
            previous: Array.isArray(newerRows) ? newerRows[0] || null : null,
            next: Array.isArray(olderRows) ? olderRows[0] || null : null,
          });
        }

        const data = await supabase(
          env,
          "/rest/v1/wallpapers?select=id,category,keywords,storage_path,public_url,created_at" +
            "&id=eq." + encodeURIComponent(id) + "&limit=1"
        );

        if (!Array.isArray(data) || data.length === 0) return json({ error: "Wallpaper not found" }, 404);
        return json(data[0]);
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error(error);
      return json(
        { error: "Internal server error", detail: error instanceof Error ? error.message : String(error) },
        500
      );
    }
  },
};