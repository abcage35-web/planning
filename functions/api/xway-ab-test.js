import { json } from "./_lib/auth.js";
import {
  XWAY_REFERERS,
  buildXwayCookieHeader,
  getXwayStorageState,
  xwayAggregateCampaignStats,
  xwayBuildAbTestPageReferer,
  xwayBuildConversionMetrics,
  xwayBuildDiff,
  xwayFetchJson,
  xwayIsoDateFromDateLike,
  xwayMatchCampaignType,
  xwayNormalizeCampaignType,
  xwayShiftIsoDate,
} from "./_lib/xway-client.js";

function parseCampaignTypeFallback(testNameRaw) {
  const name = String(testNameRaw || "").trim();
  if (!name) {
    return "";
  }
  const parts = name.split("/").map((part) => part.trim());
  return parts.length >= 2 ? parts[1].toUpperCase() : "";
}

function parseCampaignExternalIdFallback(testNameRaw) {
  const name = String(testNameRaw || "").trim();
  if (!name) {
    return "";
  }
  const parts = name.split("/").map((part) => part.trim());
  return parts.length >= 3 ? String(parts[2] || "").trim() : "";
}

function buildProductPageReferer(shopIdRaw, productIdRaw) {
  const shopId = String(shopIdRaw || "").trim();
  const productId = String(productIdRaw || "").trim();
  if (!shopId || !productId) {
    return XWAY_REFERERS.abTests;
  }
  return `https://am.xway.ru/wb/shop/${shopId}/product/${productId}`;
}

function normalizeCampaignRecord(campaign) {
  return {
    id: Number(campaign?.id) || 0,
    externalId: String(campaign?.external_id || "").trim(),
    name: String(campaign?.name || "").trim(),
    query: String(campaign?.query || "").trim(),
    typeId: String(campaign?.type || "").trim(),
    stat: {
      views: Number(campaign?.stat?.views) || 0,
      clicks: Number(campaign?.stat?.clicks) || 0,
      atbs: Number(campaign?.stat?.atbs) || 0,
      orders: Number(campaign?.stat?.orders) || 0,
    },
  };
}

function matchCampaignRecord(campaign, campaignTypeRaw, campaignExternalIdRaw) {
  const campaignExternalId = String(campaignExternalIdRaw || "").trim();
  if (campaignExternalId) {
    return String(campaign?.externalId || "").trim() === campaignExternalId;
  }
  return xwayMatchCampaignType(campaign, campaignTypeRaw);
}

function buildMetricsRows(beforeMetrics, afterMetrics) {
  const rows = [
    { key: "ctr", label: "CTR", percent: true },
    { key: "cr1", label: "CR1", percent: true },
    { key: "cr2", label: "CR2", percent: true },
    { key: "ctrCr1", label: "CTR*CR1", percent: true },
    { key: "crf100", label: "CRF x 100", percent: true },
  ];

  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    kind: row.percent ? "percent" : "number",
    before: beforeMetrics[row.key],
    after: afterMetrics[row.key],
    delta: xwayBuildDiff(afterMetrics[row.key], beforeMetrics[row.key]),
  }));
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const url = new URL(request.url);
  const testId = String(url.searchParams.get("testId") || "").trim();
  const explicitCampaignType = xwayNormalizeCampaignType(url.searchParams.get("campaignType"));
  const explicitCampaignExternalId = String(url.searchParams.get("campaignExternalId") || "").trim();
  const explicitStartedAt = String(url.searchParams.get("startedAt") || "").trim();
  const explicitEndedAt = String(url.searchParams.get("endedAt") || "").trim();
  if (!testId) {
    return json({ ok: false, error: "missing_test_id" }, { status: 400 });
  }

  const storageState = getXwayStorageState(env);
  if (!storageState || !buildXwayCookieHeader(storageState)) {
    return json(
      {
        ok: false,
        error: "xway_not_configured",
        message:
          "На сервере не настроена XWAY-сессия. Нужен secret XWAY_STORAGE_STATE_JSON или XWAY_STORAGE_STATE_BASE64.",
      },
      { status: 503 },
    );
  }

  try {
    const pathInfo = await xwayFetchJson(env, `/api/ab-test/main-image/${encodeURIComponent(testId)}/path-info`, {
      referer: XWAY_REFERERS.abTests,
    });
    const shopId = Number(pathInfo?.shop_id) || 0;
    const productId = Number(pathInfo?.product_id) || 0;
    const testPageReferer = xwayBuildAbTestPageReferer(shopId, productId, testId);
    const productPageReferer = buildProductPageReferer(shopId, productId);

    const [testInfo, productInfo] = await Promise.all([
      xwayFetchJson(env, `/api/ab-test/main-image/${encodeURIComponent(testId)}/info`, {
        referer: testPageReferer,
      }),
      xwayFetchJson(env, `/api/adv/shop/${shopId}/product/${productId}/info`, {
        referer: productPageReferer,
      }),
    ]);

    const startedAtIso = explicitStartedAt || String(testInfo?.started_at || "").trim();
    const endedAtIso = explicitEndedAt || String(testInfo?.finished_at || "").trim();
    const startedDate = xwayIsoDateFromDateLike(startedAtIso);
    const endedDate = xwayIsoDateFromDateLike(endedAtIso);
    const beforeDate = xwayShiftIsoDate(startedDate, -1);
    const afterDate = xwayShiftIsoDate(endedDate, 1);
    if (!beforeDate || !afterDate) {
      return json(
        {
          ok: false,
          error: "invalid_test_dates",
          message: "Не удалось определить даты теста для расчета метрик до/после.",
        },
        { status: 422 },
      );
    }

    const campaignType = explicitCampaignType || parseCampaignTypeFallback(testInfo?.name);
    const campaignExternalId = explicitCampaignExternalId || parseCampaignExternalIdFallback(testInfo?.name);

    const [beforeStata, afterStata] = await Promise.all([
      xwayFetchJson(
        env,
        `/api/adv/shop/${shopId}/product/${productId}/stata?is_active=0&start=${beforeDate}&end=${beforeDate}&tags&active_camps=1`,
        { referer: productPageReferer },
      ),
      xwayFetchJson(
        env,
        `/api/adv/shop/${shopId}/product/${productId}/stata?is_active=0&start=${afterDate}&end=${afterDate}&tags&active_camps=1`,
        { referer: productPageReferer },
      ),
    ]);

    const beforeCampaignsAll = (Array.isArray(beforeStata?.campaign_wb) ? beforeStata.campaign_wb : []).map(normalizeCampaignRecord);
    const afterCampaignsAll = (Array.isArray(afterStata?.campaign_wb) ? afterStata.campaign_wb : []).map(normalizeCampaignRecord);

    const beforeCampaigns = beforeCampaignsAll.filter((campaign) =>
      matchCampaignRecord(campaign, campaignType, campaignExternalId),
    );
    const afterCampaigns = afterCampaignsAll.filter((campaign) =>
      matchCampaignRecord(campaign, campaignType, campaignExternalId),
    );

    const beforeTotals = xwayAggregateCampaignStats(beforeCampaigns);
    const afterTotals = xwayAggregateCampaignStats(afterCampaigns);
    const beforeMetrics = xwayBuildConversionMetrics(beforeTotals);
    const afterMetrics = xwayBuildConversionMetrics(afterTotals);

    return json({
      ok: true,
      source: "xway",
      testId,
      campaignType,
      campaignExternalId,
      range: {
        before: beforeDate,
        after: afterDate,
      },
      product: {
        shopId,
        productId,
        article: String(testInfo?.product_wb_id || productInfo?.external_id || "").trim(),
        name: String(testInfo?.product_name || productInfo?.name || "").trim(),
      },
      test: {
        id: Number(testInfo?.id) || 0,
        name: String(testInfo?.name || "").trim(),
        startedAt: startedAtIso,
        endedAt: endedAtIso,
      },
      matchedCampaigns: {
        before: beforeCampaigns.map((campaign) => ({
          id: campaign.id,
          externalId: campaign.externalId,
          name: campaign.name || campaign.query,
        })),
        after: afterCampaigns.map((campaign) => ({
          id: campaign.id,
          externalId: campaign.externalId,
          name: campaign.name || campaign.query,
        })),
      },
      totals: {
        before: beforeTotals,
        after: afterTotals,
      },
      metrics: buildMetricsRows(beforeMetrics, afterMetrics),
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: "xway_request_failed",
        message: error instanceof Error ? error.message : "XWAY request failed",
      },
      { status: 502 },
    );
  }
}
