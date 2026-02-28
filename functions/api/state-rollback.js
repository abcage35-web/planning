import { getSessionFromRequest, json } from "./_lib/auth.js";
import {
  DEFAULT_STATE_KEY,
  ensureStateTables,
  errorJson,
  getClientIp,
  rollbackRowToVersion,
} from "./_lib/state-store.js";

function getKeyFromBody(bodyRaw) {
  const body = bodyRaw && typeof bodyRaw === "object" ? bodyRaw : {};
  const key = String(body.key || "").trim();
  return key || DEFAULT_STATE_KEY;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env?.DB) {
    return json({ ok: false, error: "D1 binding DB is not configured" }, { status: 500 });
  }

  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const role = String(session?.user?.role || "").trim().toLowerCase();
  if (role !== "admin") {
    return json({ ok: false, error: "Rollback is available only for admin." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const versionId = Number(body?.versionId);
  if (!Number.isInteger(versionId) || versionId <= 0) {
    return json({ ok: false, error: "versionId must be a positive integer" }, { status: 400 });
  }

  try {
    await ensureStateTables(env.DB);
    const response = await rollbackRowToVersion(env.DB, {
      stateKey: getKeyFromBody(body),
      versionId,
      actorUserId: session?.user?.id,
      actorLogin: session?.user?.login,
      actorRole: session?.user?.role,
      actorIp: getClientIp(request),
    });

    return json({ ok: true, ...response });
  } catch (error) {
    return errorJson(error, "Не удалось выполнить rollback");
  }
}
