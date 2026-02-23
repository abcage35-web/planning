import {
  buildSessionCookie,
  createSession,
  json,
  sanitizeLogin,
  verifyPassword,
} from "../_lib/auth.js";

const MAX_PASSWORD_LENGTH = 200;

function unauthorizedResponse() {
  return json({ ok: false, error: "Invalid login or password" }, { status: 401 });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env?.DB) {
    return json({ ok: false, error: "D1 binding DB is not configured" }, { status: 500 });
  }

  let body = null;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const login = sanitizeLogin(body?.login);
  const password = String(body?.password || "");
  if (!login || !password || password.length > MAX_PASSWORD_LENGTH) {
    return unauthorizedResponse();
  }

  const user = await env.DB.prepare(
    `SELECT id, login, role, password_hash, is_active
     FROM users
     WHERE login = ?1
     LIMIT 1`,
  )
    .bind(login)
    .first();

  if (!user || Number(user.is_active) !== 1) {
    return unauthorizedResponse();
  }

  const isValidPassword = await verifyPassword(password, user.password_hash);
  if (!isValidPassword) {
    return unauthorizedResponse();
  }

  const role = String(user.role || "").trim().toLowerCase();
  if (role !== "admin" && role !== "user") {
    return unauthorizedResponse();
  }

  const session = await createSession(env.DB, env, user.id);
  const headers = new Headers();
  headers.append("set-cookie", buildSessionCookie(request, env, session.sid, session.ttlSeconds));

  return json(
    {
      ok: true,
      user: {
        login: String(user.login || "").trim().toLowerCase(),
        role,
      },
      expiresAt: session.expiresAt,
    },
    { headers },
  );
}
