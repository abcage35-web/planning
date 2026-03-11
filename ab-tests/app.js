function renderIcon(name, className = "") {
  const cls = className ? ` class="${className}"` : "";
  switch (name) {
    case "refresh":
      return `<svg${cls} viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>`;
    case "search":
      return `<svg${cls} viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
    case "info":
      return `<svg${cls} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><path d="M12 7.5h.01"/></svg>`;
    case "barChart":
      return `<svg${cls} viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20v-12"/></svg>`;
    case "externalLink":
      return `<svg${cls} viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"/><path d="M10 14 20 4"/><path d="M20 14v5a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1h5"/></svg>`;
    default:
      return `<svg${cls} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>`;
  }
}

function formatDateTime(valueRaw) {
  const value = String(valueRaw || "").trim();
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function applyStaticIcons() {
  const refreshBtn = document.getElementById("abTestsRefreshBtn");
  if (!refreshBtn) {
    return;
  }
  const label = String(refreshBtn.textContent || "Обновить данные").trim() || "Обновить данные";
  refreshBtn.innerHTML = `${renderIcon("refresh", "ui-icon")}<span class="btn-label">${label}</span>`;
}

const abCoverHoverPreview = {
  root: null,
  image: null,
  activeLink: null,
};

const abXwayOverlayState = {
  root: null,
  body: null,
  title: null,
  meta: null,
};

const abXwaySummaryState = {
  cache: new Map(),
  inflight: new Map(),
  summaryRunId: 0,
  funnelRunId: 0,
  concurrency: 3,
};

function ensureAbCoverHoverPreview() {
  if (abCoverHoverPreview.root && abCoverHoverPreview.image) {
    return abCoverHoverPreview;
  }
  const root = document.createElement("div");
  root.className = "ab-cover-hover-preview";
  root.setAttribute("aria-hidden", "true");
  const image = document.createElement("img");
  image.alt = "";
  root.appendChild(image);
  document.body.appendChild(root);
  abCoverHoverPreview.root = root;
  abCoverHoverPreview.image = image;
  return abCoverHoverPreview;
}

function hideAbCoverHoverPreview() {
  if (!abCoverHoverPreview.root) {
    return;
  }
  abCoverHoverPreview.root.classList.remove("is-visible");
  abCoverHoverPreview.root.style.removeProperty("--preview-left");
  abCoverHoverPreview.root.style.removeProperty("--preview-top");
  abCoverHoverPreview.root.style.removeProperty("--preview-width");
  abCoverHoverPreview.activeLink = null;
}

function positionAbCoverHoverPreview(link) {
  const preview = ensureAbCoverHoverPreview();
  const rect = link.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width * 2.4, 180), 260);
  const estimatedHeight = width * (4 / 3);
  const margin = 16;
  const centerX = Math.min(
    window.innerWidth - margin - width / 2,
    Math.max(margin + width / 2, rect.left + rect.width / 2),
  );
  const centerY = Math.min(
    window.innerHeight - margin - estimatedHeight / 2,
    Math.max(margin + estimatedHeight / 2, rect.top + rect.height / 2),
  );
  preview.root.style.setProperty("--preview-left", `${centerX}px`);
  preview.root.style.setProperty("--preview-top", `${centerY}px`);
  preview.root.style.setProperty("--preview-width", `${width}px`);
}

function showAbCoverHoverPreview(link) {
  if (!(link instanceof HTMLAnchorElement)) {
    return;
  }
  const imageNode = link.querySelector("img");
  const imageSrc = imageNode?.currentSrc || imageNode?.src || link.href || "";
  if (!imageSrc) {
    hideAbCoverHoverPreview();
    return;
  }
  const preview = ensureAbCoverHoverPreview();
  preview.image.src = imageSrc;
  preview.activeLink = link;
  positionAbCoverHoverPreview(link);
  preview.root.classList.add("is-visible");
}

function bindAbPageEvents() {
  const refreshBtn = document.getElementById("abTestsRefreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      if (typeof refreshAbDashboardData === "function") {
        refreshAbDashboardData();
      }
    });
  }

  document.addEventListener("mouseover", (event) => {
    const link = event.target instanceof Element ? event.target.closest(".ab-cover-link") : null;
    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }
    if (event.relatedTarget instanceof Node && link.contains(event.relatedTarget)) {
      return;
    }
    showAbCoverHoverPreview(link);
  });

  document.addEventListener("mouseout", (event) => {
    const link = event.target instanceof Element ? event.target.closest(".ab-cover-link") : null;
    if (!(link instanceof HTMLAnchorElement) || link !== abCoverHoverPreview.activeLink) {
      return;
    }
    const nextLink = event.relatedTarget instanceof Element ? event.relatedTarget.closest(".ab-cover-link") : null;
    if (nextLink === link) {
      return;
    }
    hideAbCoverHoverPreview();
  });

  window.addEventListener("scroll", () => {
    if (abCoverHoverPreview.activeLink instanceof HTMLAnchorElement) {
      positionAbCoverHoverPreview(abCoverHoverPreview.activeLink);
    }
  }, { passive: true });

  window.addEventListener("resize", () => {
    if (abCoverHoverPreview.activeLink instanceof HTMLAnchorElement) {
      positionAbCoverHoverPreview(abCoverHoverPreview.activeLink);
    }
  });

  document.addEventListener("ab:content-render", () => {
    hideAbCoverHoverPreview();
    hydrateVisibleAbXwaySummaries();
    hydrateAbXwayFunnelDashboard();
  });

  document.addEventListener("click", async (event) => {
    const actionButton = event.target instanceof Element ? event.target.closest("[data-ab-action='open-xway-metrics']") : null;
    if (!(actionButton instanceof HTMLButtonElement)) {
      const closeButton = event.target instanceof Element ? event.target.closest("[data-ab-action='close-xway-overlay']") : null;
      if (closeButton instanceof HTMLButtonElement) {
        closeAbXwayOverlay();
      }
      return;
    }

    await openAbXwayOverlay(actionButton);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAbXwayOverlay();
    }
  });
}

function getAbXwayRequestMeta(source) {
  const dataset = source?.dataset || {};
  return {
    testId: String(dataset.abTestId || "").trim(),
    campaignType: String(dataset.abCampaignType || "").trim(),
    campaignExternalId: String(dataset.abCampaignExternalId || "").trim(),
    startedAt: String(dataset.abStartedAt || "").trim(),
    endedAt: String(dataset.abEndedAt || "").trim(),
  };
}

function buildAbXwayRequestKey(meta) {
  return [
    String(meta?.testId || "").trim(),
    String(meta?.campaignType || "").trim(),
    String(meta?.campaignExternalId || "").trim(),
    String(meta?.startedAt || "").trim(),
    String(meta?.endedAt || "").trim(),
  ].join("|");
}

async function requestAbXwayPayload(meta) {
  const params = new URLSearchParams({
    testId: String(meta?.testId || "").trim(),
    campaignType: String(meta?.campaignType || "").trim(),
    campaignExternalId: String(meta?.campaignExternalId || "").trim(),
    startedAt: String(meta?.startedAt || "").trim(),
    endedAt: String(meta?.endedAt || "").trim(),
  });

  const response = await fetch(`/api/xway-ab-test?${params.toString()}`, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });
  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Не удалось получить данные XWAY.");
  }
  return payload;
}

function renderAbXwaySummaryPending(container, message = "Считаю XWAY…") {
  const flowNode = container?.querySelector("[data-ab-xway-summary-flow]");
  if (!flowNode) {
    return;
  }
  flowNode.innerHTML = `<span class="ab-xway-inline-state is-loading">${escapeHtml(message)}</span>`;
}

function renderAbXwaySummaryError(container, message = "Нет данных XWAY") {
  const flowNode = container?.querySelector("[data-ab-xway-summary-flow]");
  if (!flowNode) {
    return;
  }
  flowNode.innerHTML = `<span class="ab-xway-inline-state is-error" title="${escapeHtml(message)}">${escapeHtml(
    "XWAY недоступен",
  )}</span>`;
}

function renderAbXwaySummaryReady(container, checks) {
  const flowNode = container?.querySelector("[data-ab-xway-summary-flow]");
  if (!flowNode) {
    return;
  }
  flowNode.innerHTML = renderAbSummaryFlow(checks);
}

async function resolveAbXwaySummaryForMeta(meta) {
  const key = buildAbXwayRequestKey(meta);
  const cached = abXwaySummaryState.cache.get(key);
  if (cached) {
    if (cached.status === "ready") {
      return cached;
    }
    if (cached.status === "error" && Date.now() - cached.savedAt < 60_000) {
      return cached;
    }
  }

  if (abXwaySummaryState.inflight.has(key)) {
    return abXwaySummaryState.inflight.get(key);
  }

  const task = requestAbXwayPayload(meta)
    .then((payload) => {
      const result = {
        status: "ready",
        payload,
        checks: getAbXwaySummaryChecks(meta.testId, payload),
        savedAt: Date.now(),
      };
      abXwaySummaryState.cache.set(key, result);
      return result;
    })
    .catch((error) => {
      const result = {
        status: "error",
        error: error instanceof Error ? error.message : "Не удалось получить данные XWAY.",
        savedAt: Date.now(),
      };
      abXwaySummaryState.cache.set(key, result);
      return result;
    })
    .finally(() => {
      abXwaySummaryState.inflight.delete(key);
    });

  abXwaySummaryState.inflight.set(key, task);
  return task;
}

async function hydrateVisibleAbXwaySummaries() {
  const runId = ++abXwaySummaryState.summaryRunId;
  const containers = Array.from(document.querySelectorAll("[data-ab-xway-summary-card]"));
  if (!containers.length) {
    return;
  }

  const queue = containers.slice();
  queue.forEach((container) => renderAbXwaySummaryPending(container));

  const worker = async () => {
    while (queue.length) {
      const container = queue.shift();
      if (!(container instanceof HTMLElement) || !container.isConnected || runId !== abXwaySummaryState.summaryRunId) {
        continue;
      }

      const meta = getAbXwayRequestMeta(container);
      if (!meta.testId) {
        renderAbXwaySummaryError(container, "Не найден testId.");
        continue;
      }

      const result = await resolveAbXwaySummaryForMeta(meta);
      if (!container.isConnected || runId !== abXwaySummaryState.summaryRunId) {
        continue;
      }

      if (result?.status === "ready") {
        renderAbXwaySummaryReady(container, result.checks);
      } else {
        renderAbXwaySummaryError(container, result?.error || "Не удалось получить данные XWAY.");
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(abXwaySummaryState.concurrency, containers.length) }, () => worker()),
  );
}

function setAbXwayChecksOnTest(testIdRaw, checks) {
  const test = typeof getAbDashboardTestById === "function" ? getAbDashboardTestById(testIdRaw) : null;
  if (!test) {
    return;
  }
  test.xwaySummaryChecks = checks || null;
}

function renderAbXwayFunnelStatus(statusNode, text) {
  if (!(statusNode instanceof HTMLElement)) {
    return;
  }
  statusNode.textContent = String(text || "");
}

async function hydrateAbXwayFunnelDashboard() {
  const grid = document.querySelector("[data-ab-xway-funnel-grid]");
  const statusNode = document.querySelector("[data-ab-xway-funnel-status]");
  if (!(grid instanceof HTMLElement) || !(statusNode instanceof HTMLElement)) {
    return;
  }

  if (!abDashboardStore?.data || typeof abFilterTests !== "function" || typeof abBuildCabinetFunnelCards !== "function") {
    renderAbXwayFunnelStatus(statusNode, "Нет данных");
    return;
  }

  const filteredTests = abFilterTests(abDashboardStore.data);
  if (!filteredTests.length) {
    grid.innerHTML = "";
    renderAbXwayFunnelStatus(statusNode, "Нет тестов");
    return;
  }

  const cabinetOrder = Array.from(new Set(filteredTests.map((item) => item?.cabinet).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "ru"),
  );
  const runId = ++abXwaySummaryState.funnelRunId;
  let done = 0;
  let ready = 0;
  let errors = 0;

  renderAbXwayFunnelStatus(statusNode, `Считаю XWAY… 0 / ${filteredTests.length}`);

  const queue = filteredTests
    .map((test) => ({
      test,
      meta: {
        testId: String(test?.testId || "").trim(),
        campaignType: String(test?.type || "").trim(),
        campaignExternalId: String(test?.campaignExternalId || "").trim(),
        startedAt: String(test?.startedAtIso || "").trim(),
        endedAt: String(test?.endedAtIso || "").trim(),
      },
    }))
    .filter((item) => item.meta.testId);
  const total = queue.length;

  const repaint = () => {
    if (runId !== abXwaySummaryState.funnelRunId || typeof renderAbFunnelCardsHtml !== "function") {
      return;
    }
    const cards = abBuildCabinetFunnelCards(filteredTests, cabinetOrder, "xway");
    grid.innerHTML = renderAbFunnelCardsHtml(cards, "xway");
    if (done < total) {
      renderAbXwayFunnelStatus(statusNode, `Считаю XWAY… ${done} / ${total}`);
      return;
    }
    if (errors && !ready) {
      renderAbXwayFunnelStatus(statusNode, "XWAY недоступен");
      return;
    }
    if (errors) {
      renderAbXwayFunnelStatus(statusNode, `Готово: ${ready} · ошибки: ${errors}`);
      return;
    }
    renderAbXwayFunnelStatus(statusNode, `Готово: ${ready}`);
  };

  const worker = async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item || runId !== abXwaySummaryState.funnelRunId) {
        continue;
      }
      const result = await resolveAbXwaySummaryForMeta(item.meta);
      if (runId !== abXwaySummaryState.funnelRunId) {
        continue;
      }

      done += 1;
      if (result?.status === "ready") {
        ready += 1;
        setAbXwayChecksOnTest(item.meta.testId, result.checks);
      } else {
        errors += 1;
      }
      repaint();
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(abXwaySummaryState.concurrency, queue.length || 1) }, () => worker()),
  );
}

function ensureAbXwayOverlay() {
  if (abXwayOverlayState.root) {
    return abXwayOverlayState;
  }

  const root = document.createElement("div");
  root.className = "ab-xway-overlay";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="ab-xway-overlay-backdrop" data-ab-action="close-xway-overlay"></div>
    <div class="ab-xway-overlay-dialog" role="dialog" aria-modal="true" aria-labelledby="abXwayOverlayTitle">
      <header class="ab-xway-overlay-head">
        <div>
          <h3 id="abXwayOverlayTitle">XWAY конверсии по типу РК</h3>
          <p class="ab-xway-overlay-meta"></p>
        </div>
        <button type="button" class="ab-head-action-btn ab-xway-close-btn" data-ab-action="close-xway-overlay">Закрыть</button>
      </header>
      <div class="ab-xway-overlay-body"></div>
    </div>
  `;
  document.body.appendChild(root);
  abXwayOverlayState.root = root;
  abXwayOverlayState.body = root.querySelector(".ab-xway-overlay-body");
  abXwayOverlayState.title = root.querySelector("#abXwayOverlayTitle");
  abXwayOverlayState.meta = root.querySelector(".ab-xway-overlay-meta");
  return abXwayOverlayState;
}

function closeAbXwayOverlay() {
  if (!abXwayOverlayState.root) {
    return;
  }
  abXwayOverlayState.root.classList.remove("is-visible");
  abXwayOverlayState.root.setAttribute("aria-hidden", "true");
}

function formatAbXwayIsoDate(isoDateRaw) {
  const value = String(isoDateRaw || "").trim();
  if (!value) {
    return "—";
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function formatAbXwayMetricValue(valueRaw, kind) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (kind === "percent") {
    return `${(value * 100).toFixed(2).replace(".", ",")}%`;
  }
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatAbXwayDelta(valueRaw) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) {
    return "—";
  }
  const percent = value * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(0).replace(".", ",")}%`;
}

function getAbXwayDeltaKind(valueRaw) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) {
    return "neutral";
  }
  if (value > 0) {
    return "good";
  }
  if (value < 0) {
    return "bad";
  }
  return "neutral";
}

function renderAbXwayOverlayLoading(button) {
  const overlay = ensureAbXwayOverlay();
  const testId = String(button.dataset.abTestId || "").trim();
  const campaignType = String(button.dataset.abCampaignType || "").trim() || "—";
  overlay.title.textContent = `XWAY • Тест ${testId}`;
  overlay.meta.textContent = `Тип РК: ${campaignType}`;
  overlay.body.innerHTML = `<div class="ab-xway-state-card is-loading">Загружаю XWAY-метрики по выбранному типу РК…</div>`;
  overlay.root.classList.add("is-visible");
  overlay.root.setAttribute("aria-hidden", "false");
}

function renderAbXwayOverlayError(button, message) {
  const overlay = ensureAbXwayOverlay();
  const testId = String(button.dataset.abTestId || "").trim();
  const campaignType = String(button.dataset.abCampaignType || "").trim() || "—";
  const exportRows = getAbExportComparisonRows(testId);
  const exportChecks = getAbExportSummaryChecks(testId);
  overlay.title.textContent = `XWAY • Тест ${testId}`;
  overlay.meta.textContent = "Не удалось получить данные XWAY. Ниже показан результат по выгрузке.";
  overlay.body.innerHTML = `
    <div class="ab-xway-state-card is-error">${escapeHtml(message || "Ошибка загрузки XWAY-данных.")}</div>
    <div class="ab-xway-summary-compare-grid">
      <div class="ab-xway-summary-compare-card">
        <div class="ab-xway-table-head">
          <h4>Результат по выгрузке</h4>
        </div>
        <div class="ab-test-summary-row is-inline-flow">${renderAbSummaryFlow(exportChecks)}</div>
      </div>
      <div class="ab-xway-summary-compare-card">
        <div class="ab-xway-table-head">
          <h4>Результат по XWAY</h4>
        </div>
        <div class="ab-xway-summary-note">Тип РК: ${escapeHtml(campaignType)}. XWAY сейчас недоступен, поэтому сравнение не построено.</div>
      </div>
    </div>
    <div class="ab-xway-metrics-compare-grid">
      <div class="ab-xway-table-wrap">
        <div class="ab-xway-table-head">
          <h4>Из выгрузки</h4>
        </div>
        <table class="ab-mini-table is-tight">
          <thead>
            <tr><th>Метрика</th><th>До</th><th>После</th><th>Прирост</th></tr>
          </thead>
          <tbody>${renderAbOverlayMetricTableRows(exportRows, { useRawText: true, emptyMessage: "Нет метрик в выгрузке." })}</tbody>
        </table>
      </div>
      <div class="ab-xway-table-wrap">
        <div class="ab-xway-table-head">
          <h4>Из XWAY</h4>
        </div>
        <div class="ab-xway-summary-note">После восстановления ответа XWAY здесь появятся метрики до/после и итоговый расчет.</div>
      </div>
    </div>`;
  overlay.root.classList.add("is-visible");
  overlay.root.setAttribute("aria-hidden", "false");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getAbExportComparisonRows(testIdRaw) {
  if (typeof getAbDashboardTestById !== "function") {
    return [];
  }
  const test = getAbDashboardTestById(testIdRaw);
  const rows = Array.isArray(test?.comparisonRows) ? test.comparisonRows : [];
  return rows.filter((row) => {
    const label = String(row?.label || "").trim().toUpperCase();
    return label && label !== "ЦЕНА" && label !== "ОТКЛ. ЦЕНЫ";
  });
}

function getAbExportSummaryChecks(testIdRaw) {
  if (typeof getAbDashboardTestById !== "function") {
    return null;
  }
  const test = getAbDashboardTestById(testIdRaw);
  if (!test?.summaryChecks) {
    return null;
  }
  return {
    ctr: String(test.summaryChecks.testCtr || "").trim(),
    price: String(test.summaryChecks.testPrice || "").trim(),
    ctrCr1: String(test.summaryChecks.testCtrCr1 || "").trim(),
    overall: String(test.summaryChecks.overall || "").trim(),
  };
}

function getAbXwaySummaryChecks(testIdRaw, payload) {
  const exportChecks = getAbExportSummaryChecks(testIdRaw);
  const exportCtrRaw = String(exportChecks?.ctr || "").trim();
  const priceRaw = String(exportChecks?.price || "").trim();
  const rows = Array.isArray(payload?.metrics) ? payload.metrics : [];
  const ctrCr1Row = rows.find((row) => String(row?.label || "").trim().toUpperCase() === "CTR*CR1");

  const ctrCr1Raw =
    typeof abResolveCtrCr1DecisionRaw === "function" ? abResolveCtrCr1DecisionRaw(Number(ctrCr1Row?.delta)) : "";
  const overallRaw =
    typeof abResolveOverallDecisionRaw === "function"
      ? abResolveOverallDecisionRaw([exportCtrRaw, priceRaw, ctrCr1Raw])
      : "";

  return {
    ctr: exportCtrRaw,
    price: priceRaw,
    ctrCr1: String(ctrCr1Raw || "").trim(),
    overall: String(overallRaw || "").trim(),
  };
}

function renderAbSummaryFlow(checks) {
  const items = [
    { label: "CTR", raw: checks?.ctr },
    { label: "Цена", raw: checks?.price },
    { label: "CTR x CR1", raw: checks?.ctrCr1 },
    { label: "Итог", raw: checks?.overall },
  ];
  return items
    .map((item, index, list) => {
      const stepHtml = `<div class="ab-eval-step">${typeof abStatusPill === "function" ? abStatusPill(item.raw, true, item.label) : `<span>${escapeHtml(item.label)}</span>`}</div>`;
      if (index === list.length - 1) {
        return stepHtml;
      }
      return `${stepHtml}<span class="ab-eval-step-separator" aria-hidden="true">→</span>`;
    })
    .join("");
}

function renderAbOverlayMetricTableRows(rows, options = {}) {
  const {
    useRawText = false,
    emptyMessage = "Нет данных.",
  } = options;
  if (!Array.isArray(rows) || !rows.length) {
    return `<tr><td colspan="4">${escapeHtml(emptyMessage)}</td></tr>`;
  }
  return rows
    .map((row) => {
      const beforeText = useRawText ? String(row?.before || "—") : formatAbXwayMetricValue(row?.before, row?.kind);
      const afterText = useRawText ? String(row?.after || "—") : formatAbXwayMetricValue(row?.after, row?.kind);
      const deltaValue = useRawText ? null : Number(row?.delta);
      const deltaText = useRawText ? String(row?.deltaText || "—") : formatAbXwayDelta(deltaValue);
      const deltaKind = useRawText ? String(row?.deltaKind || "unknown") : getAbXwayDeltaKind(deltaValue);
      const deltaHtml = deltaText !== "—"
        ? `<span class="ab-delta-pill is-${escapeHtml(deltaKind)}">${escapeHtml(deltaText)}</span>`
        : "—";
      return `
        <tr>
          <td>${escapeHtml(row?.label || "—")}</td>
          <td>${escapeHtml(beforeText)}</td>
          <td>${escapeHtml(afterText)}</td>
          <td>${deltaHtml}</td>
        </tr>
      `;
    })
    .join("");
}

function renderAbXwayOverlayData(button, payload) {
  const overlay = ensureAbXwayOverlay();
  const testId = String(payload?.testId || button.dataset.abTestId || "").trim();
  const campaignType = String(payload?.campaignType || button.dataset.abCampaignType || "").trim() || "—";
  const campaignExternalId = String(
    payload?.campaignExternalId || button.dataset.abCampaignExternalId || "",
  ).trim();
  const beforeDate = formatAbXwayIsoDate(payload?.range?.before);
  const afterDate = formatAbXwayIsoDate(payload?.range?.after);
  const exportRows = getAbExportComparisonRows(testId);
  const exportChecks = getAbExportSummaryChecks(testId);
  const xwayChecks = getAbXwaySummaryChecks(testId, payload);
  overlay.title.textContent = `XWAY • Тест ${testId}`;
  overlay.meta.textContent = `Тип РК: ${campaignType}${campaignExternalId ? ` · ID РК: ${campaignExternalId}` : ""} · До: ${beforeDate} - ${beforeDate} · После: ${afterDate} - ${afterDate}`;

  const rows = Array.isArray(payload?.metrics) ? payload.metrics : [];
  const campaignsBefore = Array.isArray(payload?.matchedCampaigns?.before) ? payload.matchedCampaigns.before : [];
  const campaignsAfter = Array.isArray(payload?.matchedCampaigns?.after) ? payload.matchedCampaigns.after : [];
  const totalsBefore = payload?.totals?.before || {};
  const totalsAfter = payload?.totals?.after || {};

  overlay.body.innerHTML = `
    <div class="ab-xway-summary-grid">
      <div class="ab-xway-summary-card">
        <h4>До</h4>
        <div class="ab-xway-summary-line">Кампаний: <strong>${new Intl.NumberFormat("ru-RU").format(Number(totalsBefore.matchedCount) || 0)}</strong></div>
        <div class="ab-xway-summary-line">Показы: <strong>${new Intl.NumberFormat("ru-RU").format(Number(totalsBefore.views) || 0)}</strong></div>
        <div class="ab-xway-summary-line">Клики: <strong>${new Intl.NumberFormat("ru-RU").format(Number(totalsBefore.clicks) || 0)}</strong></div>
        <div class="ab-xway-summary-line">ATB: <strong>${new Intl.NumberFormat("ru-RU").format(Number(totalsBefore.atbs) || 0)}</strong></div>
        <div class="ab-xway-summary-line">Заказы: <strong>${new Intl.NumberFormat("ru-RU").format(Number(totalsBefore.orders) || 0)}</strong></div>
      </div>
      <div class="ab-xway-summary-card">
        <h4>После</h4>
        <div class="ab-xway-summary-line">Кампаний: <strong>${new Intl.NumberFormat("ru-RU").format(Number(totalsAfter.matchedCount) || 0)}</strong></div>
        <div class="ab-xway-summary-line">Показы: <strong>${new Intl.NumberFormat("ru-RU").format(Number(totalsAfter.views) || 0)}</strong></div>
        <div class="ab-xway-summary-line">Клики: <strong>${new Intl.NumberFormat("ru-RU").format(Number(totalsAfter.clicks) || 0)}</strong></div>
        <div class="ab-xway-summary-line">ATB: <strong>${new Intl.NumberFormat("ru-RU").format(Number(totalsAfter.atbs) || 0)}</strong></div>
        <div class="ab-xway-summary-line">Заказы: <strong>${new Intl.NumberFormat("ru-RU").format(Number(totalsAfter.orders) || 0)}</strong></div>
      </div>
    </div>
    <div class="ab-xway-summary-compare-grid">
      <div class="ab-xway-summary-compare-card">
        <div class="ab-xway-table-head">
          <h4>Результат по выгрузке</h4>
        </div>
        <div class="ab-test-summary-row is-inline-flow">${renderAbSummaryFlow(exportChecks)}</div>
      </div>
      <div class="ab-xway-summary-compare-card">
        <div class="ab-xway-table-head">
          <h4>Результат по XWAY</h4>
        </div>
        <div class="ab-test-summary-row is-inline-flow">${renderAbSummaryFlow(xwayChecks)}</div>
        <div class="ab-xway-summary-note">Этап «Цена» для XWAY берется из выгрузки, потому что XWAY не отдает ценовые изменения.</div>
      </div>
    </div>
    <div class="ab-xway-metrics-compare-grid">
      <div class="ab-xway-table-wrap">
        <div class="ab-xway-table-head">
          <h4>Из выгрузки</h4>
        </div>
        <table class="ab-mini-table is-tight">
          <thead>
            <tr><th>Метрика</th><th>До</th><th>После</th><th>Прирост</th></tr>
          </thead>
          <tbody>${renderAbOverlayMetricTableRows(exportRows, { useRawText: true, emptyMessage: "Нет метрик в выгрузке." })}</tbody>
        </table>
      </div>
      <div class="ab-xway-table-wrap">
        <div class="ab-xway-table-head">
          <h4>Из XWAY</h4>
        </div>
        <table class="ab-mini-table is-tight">
          <thead>
            <tr><th>Метрика</th><th>До</th><th>После</th><th>Прирост</th></tr>
          </thead>
          <tbody>${renderAbOverlayMetricTableRows(rows, { useRawText: false, emptyMessage: "Нет метрик для выбранного типа РК." })}</tbody>
        </table>
      </div>
    </div>
    <div class="ab-xway-campaigns-grid">
      <div class="ab-xway-campaigns-card">
        <h4>Кампании до</h4>
        ${campaignsBefore.length ? `<ul>${campaignsBefore.map((item) => `<li>${escapeHtml(item.name || String(item.id || "—"))}</li>`).join("")}</ul>` : '<div class="ab-xway-campaigns-empty">Нет кампаний этого типа.</div>'}
      </div>
      <div class="ab-xway-campaigns-card">
        <h4>Кампании после</h4>
        ${campaignsAfter.length ? `<ul>${campaignsAfter.map((item) => `<li>${escapeHtml(item.name || String(item.id || "—"))}</li>`).join("")}</ul>` : '<div class="ab-xway-campaigns-empty">Нет кампаний этого типа.</div>'}
      </div>
    </div>
  `;
  overlay.root.classList.add("is-visible");
  overlay.root.setAttribute("aria-hidden", "false");
}

async function openAbXwayOverlay(button) {
  renderAbXwayOverlayLoading(button);

  try {
    const payload = await requestAbXwayPayload(getAbXwayRequestMeta(button));
    renderAbXwayOverlayData(button, payload);
  } catch (error) {
    renderAbXwayOverlayError(button, error instanceof Error ? error.message : "Не удалось получить данные XWAY.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  applyStaticIcons();
  bindAbPageEvents();
  if (typeof ensureAbDashboardLoaded === "function") {
    ensureAbDashboardLoaded();
  }
});
