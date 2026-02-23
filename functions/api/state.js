import { getSessionFromRequest, json } from "./_lib/auth.js";

const DEFAULT_STATE_KEY = "wb-dashboard-v2";
const MAX_PAYLOAD_BYTES = 1024 * 1024;

function getStateKeyFromUrl(url) {
  const key = String(url.searchParams.get("key") || "").trim();
  return key || DEFAULT_STATE_KEY;
}

function parsePayloadSize(payload) {
  try {
    const encoded = new TextEncoder().encode(JSON.stringify(payload));
    return encoded.byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env?.DB) {
    return json({ ok: false, error: "D1 binding DB is not configured" }, { status: 500 });
  }
  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const key = getStateKeyFromUrl(url);

  const row = await env.DB.prepare(
    `SELECT state_key, payload_json, saved_at, updated_at
     FROM dashboard_state
     WHERE state_key = ?1
     LIMIT 1`,
  )
    .bind(key)
    .first();

  if (!row) {
    return json({ ok: true, key, payload: null, savedAt: null, updatedAt: null });
  }

  let payload = null;
  try {
    payload = JSON.parse(String(row.payload_json || "null"));
  } catch {
    payload = null;
  }

  return json({
    ok: true,
    key,
    payload,
    savedAt: String(row.saved_at || "") || null,
    updatedAt: String(row.updated_at || "") || null,
  });
}

export async function onRequestPut(context) {
  const { env, request } = context;
  if (!env?.DB) {
    return json({ ok: false, error: "D1 binding DB is not configured" }, { status: 500 });
  }
  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const keyRaw = body && typeof body === "object" ? body.key : "";
  const key = String(keyRaw || "").trim() || DEFAULT_STATE_KEY;
  const payload = body && typeof body === "object" ? body.payload : null;

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json({ ok: false, error: "payload must be an object" }, { status: 400 });
  }

  const payloadBytes = parsePayloadSize(payload);
  if (!Number.isFinite(payloadBytes) || payloadBytes > MAX_PAYLOAD_BYTES) {
    return json({ ok: false, error: "payload is too large" }, { status: 413 });
  }

  const nowIso = new Date().toISOString();
  const savedAt = String(payload.savedAt || "").trim() || nowIso;
  const payloadJson = JSON.stringify(payload);

  await env.DB.prepare(
    `INSERT INTO dashboard_state (state_key, payload_json, saved_at, updated_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(state_key) DO UPDATE SET
       payload_json = excluded.payload_json,
       saved_at = excluded.saved_at,
       updated_at = excluded.updated_at`,
  )
    .bind(key, payloadJson, savedAt, nowIso)
    .run();

  return json({ ok: true, key, savedAt, updatedAt: nowIso });
}
