import { getSessionFromRequest, json } from "./_lib/auth.js";
import {
  DEFAULT_STATE_KEY,
  buildDashboardExportCsv,
  ensureStateTables,
  errorJson,
  getDashboardExportRows,
  getClientIp,
  migrateLegacyStateToNormalizedIfNeeded,
} from "./_lib/state-store.js";

function getStateKey(request) {
  const url = new URL(request.url);
  const key = String(url.searchParams.get("key") || "").trim();
  return key || DEFAULT_STATE_KEY;
}

function buildFilename(prefix = "wb-dashboard-export") {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(
    date.getHours(),
  )}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `${prefix}_${stamp}.csv`;
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
    const key = getStateKey(request);
    await migrateLegacyStateToNormalizedIfNeeded(env.DB, {
      stateKey: key,
      actorUserId: session?.user?.id,
      actorLogin: session?.user?.login,
      actorRole: session?.user?.role,
      actorIp: getClientIp(request),
    });
    const rows = await getDashboardExportRows(env.DB, key);
    const csv = buildDashboardExportCsv(rows);

    const headers = new Headers();
    headers.set("content-type", "text/csv; charset=utf-8");
    headers.set("content-disposition", `attachment; filename="${buildFilename()}"`);
    headers.set("cache-control", "no-store");

    return new Response(csv, {
      status: 200,
      headers,
    });
  } catch (error) {
    return errorJson(error, "Не удалось выгрузить таблицу");
  }
}
