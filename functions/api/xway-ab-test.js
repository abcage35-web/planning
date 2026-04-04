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
  const rawSumPrice = campaign?.stat?.sum_price;
  const normalizedSumPrice = Number(
    typeof rawSumPrice === "string"
      ? rawSumPrice.replace(/[^\d,.-]/g, "").replace(",", ".")
      : rawSumPrice,
  );
  const rawBid =
    campaign?.bid
    ?? campaign?.cpm
    ?? campaign?.CPM
    ?? campaign?.bet
    ?? campaign?.rate
    ?? campaign?.bid_price
    ?? campaign?.stat?.bid
    ?? campaign?.stat?.cpm
    ?? campaign?.stat?.CPM;
  const normalizedBid = Number(
    typeof rawBid === "string"
      ? rawBid.replace(/[^\d,.-]/g, "").replace(",", ".")
      : rawBid,
  );

  return {
    id: Number(campaign?.id) || 0,
    externalId: String(campaign?.external_id || "").trim(),
    name: String(campaign?.name || "").trim(),
    query: String(campaign?.query || "").trim(),
    typeId: String(campaign?.type || "").trim(),
    bid: Number.isFinite(normalizedBid) ? normalizedBid : null,
    stat: {
      views: Number(campaign?.stat?.views) || 0,
      clicks: Number(campaign?.stat?.clicks) || 0,
      atbs: Number(campaign?.stat?.atbs) || 0,
      orders: Number(campaign?.stat?.orders) || 0,
      sumPrice: Number.isFinite(normalizedSumPrice) ? normalizedSumPrice : 0,
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

function buildMetricsRows(beforeMetrics, duringMetrics, afterMetrics) {
  const rows = [
    { key: "views", label: "Показы", percent: false },
    { key: "bid", label: "Ставка", percent: false },
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
    before: beforeMetrics?.[row.key] ?? null,
    during: duringMetrics?.[row.key] ?? null,
    after: afterMetrics?.[row.key] ?? null,
    delta: xwayBuildDiff(afterMetrics?.[row.key] ?? null, beforeMetrics?.[row.key] ?? null),
  }));
}

function buildAveragePrice(totalsRaw) {
  const totals = totalsRaw || {};
  const sumPrice = Number(totals.sumPrice);
  const orders = Number(totals.orders);
  if (!Number.isFinite(sumPrice) || !Number.isFinite(orders) || orders <= 0) {
    return null;
  }
  return sumPrice / orders;
}

function resolveVariantImageUrl(item) {
  const candidates = [
    item?.url,
    item?.image_url,
    item?.imageUrl,
    item?.img,
    item?.image,
    item?.src,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function normalizeVariantStats(statsRaw, imagesRaw) {
  const stats = Array.isArray(statsRaw) ? statsRaw : [];
  const images = Array.isArray(imagesRaw) ? imagesRaw : [];
  const variants = [];
  const indexByKey = new Map();
  let blankCounter = 0;

  const ensureVariant = (source, fallback = {}) => {
    const url = resolveVariantImageUrl(source) || resolveVariantImageUrl(fallback);
    const key = url || `blank-${blankCounter += 1}`;
    let index = indexByKey.get(key);

    if (index === undefined) {
      index = variants.length;
      indexByKey.set(key, index);
      variants.push({
        url,
        views: null,
        clicks: null,
        spend: null,
        ctr: null,
        ctrToAvg: null,
        ctrToMax: null,
        avgCtr: null,
        status: "",
        dateStart: "",
        main: false,
      });
    }

    const target = variants[index];
    const views = Number(source?.views);
    const clicks = Number(source?.clicks);
    const spend = Number(source?.sum);
    const ctr = Number(source?.CTR);
    const ctrToAvg = Number(source?.CTR_to_avg);
    const ctrToMax = Number(source?.CTR_to_max);
    const avgCtr = Number(source?.avg_ctr);
    const status = String(source?.status || fallback?.status || target.status || "").trim();
    const dateStart = String(source?.date_start || fallback?.date_start || target.dateStart || "").trim();

    target.url = url || target.url;
    target.views = Number.isFinite(views) ? views : target.views;
    target.clicks = Number.isFinite(clicks) ? clicks : target.clicks;
    target.spend = Number.isFinite(spend) ? spend : target.spend;
    target.ctr = Number.isFinite(ctr) ? ctr / 100 : target.ctr;
    target.ctrToAvg = Number.isFinite(ctrToAvg) ? ctrToAvg / 100 : target.ctrToAvg;
    target.ctrToMax = Number.isFinite(ctrToMax) ? ctrToMax / 100 : target.ctrToMax;
    target.avgCtr = Number.isFinite(avgCtr) ? avgCtr / 100 : target.avgCtr;
    target.status = status;
    target.dateStart = dateStart;
    target.main = Boolean(source?.main || fallback?.main || target.main);
  };

  for (const item of images) {
    ensureVariant(item);
  }

  for (const item of stats) {
    ensureVariant(item);
  }

  return variants;
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
    const todayDate = xwayIsoDateFromDateLike(new Date().toISOString());
    const duringEndDate = endedDate || xwayIsoDateFromDateLike(new Date().toISOString());
    const beforeDate = xwayShiftIsoDate(startedDate, -1);
    const afterDateCandidate = endedDate ? xwayShiftIsoDate(endedDate, 1) : "";
    const hasAfterWindow = Boolean(afterDateCandidate && todayDate && afterDateCandidate <= todayDate);
    const afterDate = hasAfterWindow ? afterDateCandidate : "";
    if (!beforeDate || !duringEndDate) {
      return json(
        {
          ok: false,
          error: "invalid_test_dates",
          message: "Не удалось определить даты теста для расчета метрик.",
        },
        { status: 422 },
      );
    }

    const campaignType = explicitCampaignType || parseCampaignTypeFallback(testInfo?.name);
    const campaignExternalId = explicitCampaignExternalId || parseCampaignExternalIdFallback(testInfo?.name);

    const [beforeStata, duringStata, afterStata] = await Promise.all([
      xwayFetchJson(
        env,
        `/api/adv/shop/${shopId}/product/${productId}/stata?is_active=0&start=${beforeDate}&end=${beforeDate}&tags&active_camps=1`,
        { referer: productPageReferer },
      ),
      xwayFetchJson(
        env,
        `/api/adv/shop/${shopId}/product/${productId}/stata?is_active=0&start=${startedDate}&end=${duringEndDate}&tags&active_camps=1`,
        { referer: productPageReferer },
      ),
      afterDate
        ? xwayFetchJson(
            env,
            `/api/adv/shop/${shopId}/product/${productId}/stata?is_active=0&start=${afterDate}&end=${afterDate}&tags&active_camps=1`,
            { referer: productPageReferer },
          )
        : Promise.resolve(null),
    ]);

    const beforeCampaignsAll = (Array.isArray(beforeStata?.campaign_wb) ? beforeStata.campaign_wb : []).map(normalizeCampaignRecord);
    const duringCampaignsAll = (Array.isArray(duringStata?.campaign_wb) ? duringStata.campaign_wb : []).map(normalizeCampaignRecord);
    const afterCampaignsAll = (Array.isArray(afterStata?.campaign_wb) ? afterStata.campaign_wb : []).map(normalizeCampaignRecord);

    const beforeCampaigns = beforeCampaignsAll.filter((campaign) =>
      matchCampaignRecord(campaign, campaignType, campaignExternalId),
    );
    const duringCampaigns = duringCampaignsAll.filter((campaign) =>
      matchCampaignRecord(campaign, campaignType, campaignExternalId),
    );
    const afterCampaigns = hasAfterWindow
      ? afterCampaignsAll.filter((campaign) => matchCampaignRecord(campaign, campaignType, campaignExternalId))
      : [];

    const beforeTotals = xwayAggregateCampaignStats(beforeCampaigns);
    const duringTotals = xwayAggregateCampaignStats(duringCampaigns);
    const afterTotals = hasAfterWindow ? xwayAggregateCampaignStats(afterCampaigns) : null;
    const beforeMetrics = {
      ...xwayBuildConversionMetrics(beforeTotals),
      views: Number(beforeTotals?.views) || 0,
      bid: Number.isFinite(Number(beforeTotals?.bid)) ? Number(beforeTotals.bid) : null,
    };
    const duringMetrics = {
      ...xwayBuildConversionMetrics(duringTotals),
      views: Number(duringTotals?.views) || 0,
      bid: Number.isFinite(Number(duringTotals?.bid)) ? Number(duringTotals.bid) : null,
    };
    const afterMetrics = hasAfterWindow && afterTotals
      ? {
          ...xwayBuildConversionMetrics(afterTotals),
          views: Number(afterTotals?.views) || 0,
          bid: Number.isFinite(Number(afterTotals?.bid)) ? Number(afterTotals.bid) : null,
        }
      : null;

    return json({
      ok: true,
      source: "xway",
      testId,
      campaignType,
      campaignExternalId,
      range: {
        before: beforeDate,
        during: {
          from: startedDate,
          to: duringEndDate,
        },
        after: afterDate,
        afterAvailable: hasAfterWindow,
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
        avgCtr: Number.isFinite(Number(testInfo?.avg_ctr)) ? Number(testInfo.avg_ctr) / 100 : null,
        progress: Number(testInfo?.progress) || 0,
        launchStatus: String(testInfo?.launch_status || "").trim(),
        status: String(testInfo?.status || "").trim(),
      },
      variantStats: normalizeVariantStats(testInfo?.images_stats, testInfo?.images),
      matchedCampaigns: {
        before: beforeCampaigns.map((campaign) => ({
          id: campaign.id,
          externalId: campaign.externalId,
          name: campaign.name || campaign.query,
        })),
        during: duringCampaigns.map((campaign) => ({
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
        during: duringTotals,
        after: afterTotals || undefined,
      },
      priceTimeline: {
        before: buildAveragePrice(beforeTotals),
        during: buildAveragePrice(duringTotals),
        after: hasAfterWindow && afterTotals ? buildAveragePrice(afterTotals) : null,
      },
      metrics: buildMetricsRows(beforeMetrics, duringMetrics, afterMetrics),
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
