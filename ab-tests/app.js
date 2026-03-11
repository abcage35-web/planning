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
  overlay.title.textContent = `XWAY • Тест ${testId}`;
  overlay.meta.textContent = "Не удалось получить данные XWAY.";
  overlay.body.innerHTML = `<div class="ab-xway-state-card is-error">${escapeHtml(message || "Ошибка загрузки XWAY-данных.")}</div>`;
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
      const deltaHtml =
        deltaText !== "—"
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

  const params = new URLSearchParams({
    testId: String(button.dataset.abTestId || "").trim(),
    campaignType: String(button.dataset.abCampaignType || "").trim(),
    campaignExternalId: String(button.dataset.abCampaignExternalId || "").trim(),
    startedAt: String(button.dataset.abStartedAt || "").trim(),
    endedAt: String(button.dataset.abEndedAt || "").trim(),
  });

  try {
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
