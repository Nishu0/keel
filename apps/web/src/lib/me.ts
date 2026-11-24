"use client";

import { useEffect, useState } from "react";
import { me as demoMe, org as demoOrg } from "./mock";

export type Me = {
  user: { id: string; email: string; name: string; avatar_url: string | null } | null;
  org: { id: string; name: string; plan: string };
  role: string;
  orgs: { id: string; name: string; plan: string; role: string }[];
  via: "session" | "api_key";
  demo?: boolean;
};

const DEMO: Me = {
  user: { id: "usr_demo", email: "owner · halyard.dev", name: demoMe.name, avatar_url: null },
  org: { id: demoOrg.id, name: demoOrg.name, plan: demoOrg.plan },
  role: "owner",
  orgs: [{ id: demoOrg.id, name: demoOrg.name, plan: demoOrg.plan, role: "owner" }],
  via: "session",
  demo: true,
};

let cache: Promise<Me> | null = null;

function load(): Promise<Me> {
  cache ??= fetch("/api/keel/v1/me", { cache: "no-store" })
    .then(async (r) => (r.ok ? ((await r.json()) as Me) : DEMO))
    .catch(() => DEMO);
  return cache;
}

/** The signed in person and org. Falls back to the demo identity without an api. */
export function useMe() {
  const [me, setMe] = useState<Me>(DEMO);
  useEffect(() => {
    let alive = true;
    load().then((m) => alive && setMe(m));
    return () => {
      alive = false;
    };
  }, []);
  return me;
}

export async function switchOrg(orgId: string) {
  const r = await fetch("/api/keel/v1/me/org", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ org_id: orgId }),
  });
  // a full reload on purpose: every cached piece of org data has to go
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (r.ok) window.location.assign("/app");
}

export async function signOut() {
  await fetch("/api/keel/v1/auth/logout", { method: "POST" }).catch(() => {});
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- drop all client state
  window.location.assign("/sign-in");
}
