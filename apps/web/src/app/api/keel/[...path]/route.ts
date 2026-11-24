// Backend-for-frontend proxy to the keel api. The browser only ever talks to
// /api/keel/*, so the session cookie is first party and api keys stay server side.
//
// Who the api sees:
//   - a signed in person: their keel_session cookie is passed through
//   - otherwise, in single org dev mode: KEEL_API_KEY (or KEEL_DEV_API_KEY)

const API = process.env.KEEL_API_URL;
const DEV_KEY = process.env.KEEL_API_KEY || process.env.KEEL_DEV_API_KEY;
const PASS_UP = ["content-type", "accept", "last-event-id"];
const PASS_DOWN = ["content-type", "cache-control", "location"];

async function forward(request: Request, path: string[]): Promise<Response> {
  if (!API) {
    return Response.json({ configured: false, error: "Set KEEL_API_URL to use the live api." }, { status: 503 });
  }
  // only the versioned api is reachable through here
  if (path[0] !== "v1" || path.some((p) => p === ".." || p.includes("/"))) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const url = new URL(`${API.replace(/\/$/, "")}/${path.map(encodeURIComponent).join("/")}`);
  url.search = new URL(request.url).search;

  const headers = new Headers();
  for (const h of PASS_UP) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  const cookie = request.headers.get("cookie");
  const session = cookie?.match(/(?:^|;\s*)keel_session=([^;]+)/)?.[1];
  const state = cookie?.match(/(?:^|;\s*)keel_oauth_state=([^;]+)/)?.[1];
  const jar = [session && `keel_session=${session}`, state && `keel_oauth_state=${state}`].filter(Boolean).join("; ");
  if (jar) headers.set("cookie", jar);
  else if (DEV_KEY) headers.set("authorization", `Bearer ${DEV_KEY}`);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      signal: request.signal,
      cache: "no-store",
      redirect: "manual", // oauth and sign in redirects go to the browser as they are
    });
  } catch {
    return Response.json({ error: "The keel api isn't reachable." }, { status: 502 });
  }

  const out = new Headers();
  for (const h of PASS_DOWN) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  for (const c of upstream.headers.getSetCookie()) out.append("set-cookie", c);
  // a 204 must not carry a body; streams (sse) pass straight through
  const body = upstream.status === 204 || upstream.status === 304 ? null : upstream.body;
  return new Response(body, { status: upstream.status, headers: out });
}

type Ctx = RouteContext<"/api/keel/[...path]">;

export async function GET(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}

export async function POST(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}

export async function PATCH(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}

export async function DELETE(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
