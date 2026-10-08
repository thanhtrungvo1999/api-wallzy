interface Env {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
      "access-control-allow-origin": "*",
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    try {
      if (url.pathname === "/health") {
        return json({ ok: true });
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
        const data = await supabase(
          env,
          "/rest/v1/categories?select=*"
        );
        return json({ data });
      }

      if (url.pathname.startsWith("/wallpapers/category/")) {
        const category = decodeURIComponent(
          url.pathname.slice("/wallpapers/category/".length)
        );

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
        return json({
          data: rows.slice(0, 20),
          offset,
          limit,
          hasMore: rows.length > 20,
        });
      }

      if (url.pathname.startsWith("/wallpapers/")) {
        const id = decodeURIComponent(url.pathname.slice("/wallpapers/".length));

        if (!id) return json({ error: "Missing wallpaper id" }, 400);

        if (id.endsWith("/adjacent")) {
          const wallpaperId = id.slice(0, -"/adjacent".length);
          const currentRows = await supabase(
            env,
            "/rest/v1/wallpapers?select=id,category,keywords,storage_path,public_url,created_at" +
              "&id=eq." + encodeURIComponent(wallpaperId) +
              "&limit=1"
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
            "&id=eq." + encodeURIComponent(id) +
            "&limit=1"
        );

        if (!Array.isArray(data) || data.length === 0) {
          return json({ error: "Wallpaper not found" }, 404);
        }

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
