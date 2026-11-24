// Backend-for-frontend proxy to the keel api. The api key stays on the server;
// the browser only ever talks to /api/keel/*.

const API = process.env.KEEL_API_URL;
const KEY = process.env.KEEL_API_KEY;

async function forward(request: Request, path: string[]): Promise<Response> {
  if (!API || !KEY) {
    return Response.json({ configured: false, error: "Set KEEL_API_URL and KEEL_API_KEY to use the live api." }, { status: 503 });
  }
  // only the versioned api is reachable through here
  if (path[0] !== "v1" || path.some((p) => p === ".." || p.includes("/"))) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const url = new URL(`${API.replace(/\/$/, "")}/${path.map(encodeURIComponent).join("/")}`);
  url.search = new URL(request.url).search;

  const headers = new Headers({ Authorization: `Bearer ${KEY}` });
  for (const h of ["content-type", "accept", "last-event-id"]) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      signal: request.signal,
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "The keel api isn't reachable." }, { status: 502 });
  }

  const out = new Headers();
  for (const h of ["content-type", "cache-control"]) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  // streams (sse) pass straight through
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

type Ctx = RouteContext<"/api/keel/[...path]">;

export async function GET(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}

export async function POST(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
