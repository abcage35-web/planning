import { getSessionFromRequest, json } from "./_lib/auth.js";
import {
  DEFAULT_STATE_KEY,
  ensureStateTables,
  errorJson,
  getClientIp,
  getStateKeyFromUrl,
  getStateRowsCount,
  loadDashboardState,
  migrateLegacyStateToNormalizedIfNeeded,
  saveDashboardState,
} from "./_lib/state-store.js";

function getStateKeyFromBody(bodyRaw) {
  const body = bodyRaw && typeof bodyRaw === "object" ? bodyRaw : {};
  const key = String(body.key || "").trim();
  return key || DEFAULT_STATE_KEY;
}

function getPayloadFromBody(bodyRaw) {
  const body = bodyRaw && typeof bodyRaw === "object" ? bodyRaw : null;
  if (!body || typeof body !== "object") {
    return null;
  }
  const payload = body.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload;
}

function getRowsCount(payloadRaw) {
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : null;
  if (!payload) {
    return 0;
  }
  return Array.isArray(payload.rows) ? payload.rows.length : 0;
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

  try {
    await ensureStateTables(env.DB);
    const url = new URL(request.url);
    const key = getStateKeyFromUrl(url);
    await migrateLegacyStateToNormalizedIfNeeded(env.DB, {
      stateKey: key,
      actorUserId: session?.user?.id,
      actorLogin: session?.user?.login,
      actorRole: session?.user?.role,
      actorIp: getClientIp(request),
    });
    const state = await loadDashboardState(env.DB, key);

    return json({
      ok: true,
      key,
      payload: state.payload,
      savedAt: state.savedAt,
      updatedAt: state.updatedAt,
    });
  } catch (error) {
    return errorJson(error, "Не удалось загрузить состояние");
  }
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

  const key = getStateKeyFromBody(body);
  const payload = getPayloadFromBody(body);
  if (!payload) {
    return json({ ok: false, error: "payload must be an object" }, { status: 400 });
  }

  try {
    await ensureStateTables(env.DB);

    const currentRowsCount = await getStateRowsCount(env.DB, key);
    const nextRowsCount = getRowsCount(payload);
    const role = String(session?.user?.role || "").trim().toLowerCase();
    const isAdmin = role === "admin";

    if (nextRowsCount !== currentRowsCount && !isAdmin) {
      return json(
        { ok: false, error: "Only admin can add or remove products." },
        { status: 403 },
      );
    }

    if (currentRowsCount > 1 && nextRowsCount === 0) {
      return json(
        {
          ok: false,
          error: "Full clear is blocked. Delete products one by one.",
        },
        { status: 409 },
      );
    }

    const saved = await saveDashboardState(env.DB, {
      stateKey: key,
      payload,
      actorUserId: session?.user?.id,
      actorLogin: session?.user?.login,
      actorRole: session?.user?.role,
      actorIp: getClientIp(request),
    });

    return json({
      ok: true,
      key: saved.key,
      savedAt: saved.savedAt,
      updatedAt: saved.updatedAt,
      stats: {
        rowsTotal: saved.rowsTotal,
        rowsChanged: saved.rowsChanged,
        rowsDeleted: saved.rowsDeleted,
        logsUpserted: saved.logsUpserted,
        payloadBytes: saved.payloadBytes,
      },
    });
  } catch (error) {
    return errorJson(error, "Не удалось сохранить состояние");
  }
}
