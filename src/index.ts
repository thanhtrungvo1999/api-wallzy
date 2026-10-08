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

async function supabase(env: Env, path: string) {
  const response = await fetch(env.SUPABASE_URL + path, {
    headers: {
      apikey: env.SUPABASE_KEY,
      Authorization: "Bearer " + env.SUPABASE_KEY,
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

      if (url.pathname.startsWith("/wallpapers/")) {
        const id = decodeURIComponent(url.pathname.slice("/wallpapers/".length));

        if (!id) return json({ error: "Missing wallpaper id" }, 400);

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
