import { getSessionFromRequest, json } from "../_lib/auth.js";

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env?.DB) {
    return json({ ok: false, error: "D1 binding DB is not configured" }, { status: 500 });
  }

  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return json({
    ok: true,
    user: {
      login: session.user.login,
      role: session.user.role,
    },
    expiresAt: session.expiresAt,
  });
}
