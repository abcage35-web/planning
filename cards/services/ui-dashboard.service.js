function renderAgreementDashboard(problemStats, meta = {}) {
  renderAgreementDashboardTo(el.agreementDashboardMain, problemStats, meta);
}

function renderAgreementDashboardTo(targetEl, problemStats, meta = {}) {
  if (!targetEl) {
    return;
  }

  const totalRows = Number(meta.total) || 0;
  const loadedRows = Number(meta.loaded) || 0;
  const errors = Number(meta.errors) || 0;
  const dashboardRows = Array.isArray(meta.dashboardRows)
    ? meta.dashboardRows
    : getDashboardScopeRows(state.rows);

  if (totalRows <= 0) {
    targetEl.innerHTML =
      '<div class="agreement-empty">Нет данных для дашборда. Добавьте артикулы и обновите карточки.</div>';
    return;
  }

  const scopeCabinets = getAllCabinets(dashboardRows, false);
  const autoplayUsageTotals = getAutoplayUsageByCabinet(dashboardRows, scopeCabinets);
  const tagsUsageTotals = getTagsUsageByCabinet(dashboardRows, scopeCabinets);
  const autoplayUsedTotal = autoplayUsageTotals.reduce((sum, item) => sum + Number(item.autoplayUsed || 0), 0);
  const autoplayLimitTotal = autoplayUsageTotals.reduce((sum, item) => sum + Number(item.limit || 0), 0);
  const tagsUsedTotal = tagsUsageTotals.reduce((sum, item) => sum + Number(item.tagsUsed || 0), 0);
  const tagsLimitTotal = tagsUsageTotals.reduce((sum, item) => sum + Number(item.limit || 0), 0);

  const cards = [
    {
      key: "recommendationsNo",
      label: "Рекомендации",
      shortLabel: "Рек.",
      count: problemStats.recommendationsNo,
      presetId: "recommendationsNo",
      segmentColor: "#F97360",
      bucket: "main",
    },
    {
      key: "richNo",
      label: "Рич",
      shortLabel: "Рич",
      count: problemStats.richNo,
      presetId: "richNo",
      segmentColor: "#F59E0B",
      bucket: "main",
    },
    {
      key: "videoNo",
      label: "Видео",
      shortLabel: "Видео",
      count: problemStats.videoNo,
      presetId: "videoNo",
      segmentColor: "#06B6D4",
      bucket: "main",
    },
    {
      key: "coverDuplicate",
      label: "Дубль обложки",
      shortLabel: "Дубль",
      count: problemStats.coverDuplicate,
      presetId: "coverDuplicate",
      segmentColor: "#8B5CF6",
      bucket: "main",
    },
    {
      key: "autoplayNo",
      label: "Автоплей",
      shortLabel: "Автоплей",
      count: problemStats.autoplayNo,
      presetId: "autoplayNo",
      segmentColor: "#10B981",
      bucket: "limits",
      usageSummary:
        autoplayUsageTotals.length > 0 ? `${autoplayUsedTotal} / ${autoplayLimitTotal}` : "",
    },
    {
      key: "tagsNo",
      label: "Тэги",
      shortLabel: "Тэги",
      count: problemStats.tagsNo,
      presetId: "tagsNo",
      segmentColor: "#3B82F6",
      bucket: "limits",
      usageSummary: tagsUsageTotals.length > 0 ? `${tagsUsedTotal} / ${tagsLimitTotal}` : "",
    },
  ];

  const totalProblems = cards.reduce((sum, item) => sum + item.count, 0);
  const mainToneClass =
    totalProblems > 0 || problemStats.autoplayOver > 0 || problemStats.tagsOver > 0
      ? "agreement-total-alert"
      : "agreement-total-ok";

  const breakdownSegments = cards
    .map((item) => {
      if (item.count <= 0 || totalProblems <= 0) {
        return "";
      }

      const width = ((item.count / totalProblems) * 100).toFixed(2);
      const shareOfRows = totalRows > 0 ? ((item.count / totalRows) * 100).toFixed(1) : "0.0";
      const shareOfProblems = totalProblems > 0 ? ((item.count / totalProblems) * 100).toFixed(1) : "0.0";

      return `<button
        class="agreement-break-segment"
        type="button"
        style="width:${width}%; --segment-color:${item.segmentColor}"
        data-action="toggle-preset"
        data-preset-id="${item.presetId}"
        data-tooltip-title="${escapeAttr(item.label)}"
        data-tooltip-problems="${escapeAttr(String(item.count))}"
        data-tooltip-rows="${escapeAttr(shareOfRows)}"
        data-tooltip-share="${escapeAttr(shareOfProblems)}"
        data-tooltip-color="${escapeAttr(item.segmentColor)}"
        aria-label="${escapeAttr(`${item.label}: ${item.count}`)}"
      ></button>`;
    })
    .join("");

  const cardsHtml = cards
    .map((item) => {
      const percent = totalRows > 0 ? (item.count / totalRows) * 100 : 0;
      const barWidth = Math.max(0, Math.min(100, percent));
      const hasProblem =
        item.count > 0 ||
        (item.key === "tagsNo" && Number(problemStats.tagsOver) > 0) ||
        (item.key === "autoplayNo" && Number(problemStats.autoplayOver) > 0);
      const hasProblemClass = hasProblem ? "agreement-card-has-problem" : "agreement-card-clean";
      const active = isPresetActive(item.presetId);
      const filterLabel = active ? "Сбросить фильтр" : "Показать строки";
      const filterClass = active ? " is-active" : "";
      const cabinetBreakdownHtml = renderProblemCabinetBreakdown(item.key, dashboardRows);
      const hintText =
        item.key === "autoplayNo" && Number(problemStats.autoplayOver) > 0
          ? `Перелимит +${problemStats.autoplayOver}`
          : item.key === "tagsNo" && Number(problemStats.tagsOver) > 0
            ? `Перелимит +${problemStats.tagsOver}`
            : item.count > 0
              ? "Есть проблемы"
              : "Проблем нет";
      const showSettings = item.key === "autoplayNo" || item.key === "tagsNo";
      const settingsKind = item.key === "tagsNo" ? "tags" : "autoplay";
      const usageSummaryHtml = item.usageSummary
        ? `<span class="agreement-card-count-subtle">(${escapeHtml(item.usageSummary)})</span>`
        : "";
      const settingsButtonHtml = showSettings
        ? `<button
            class="agreement-icon-btn"
            type="button"
            data-action="open-limit-settings"
            data-limit-kind="${settingsKind}"
            aria-label="Изменить лимиты"
            data-hint="Изменить лимиты"
          >
            ${renderIcon("settings")}
          </button>`
        : "";

      const cardExtraClass = item.bucket === "limits" ? " agreement-card-limits" : "";
      return `<article class="agreement-card ${hasProblemClass}${cardExtraClass}">
        <div class="agreement-card-top">
          <span class="agreement-card-title">${item.label}</span>
          <span class="agreement-card-percent">${barWidth.toFixed(1)}%</span>
        </div>
        <div class="agreement-card-count-wrap">
          <span class="agreement-card-count">${item.count}</span>
          ${usageSummaryHtml}
        </div>
        <div class="agreement-card-hint">${hintText}</div>
        <div class="agreement-card-bar"><span style="width:${barWidth.toFixed(2)}%"></span></div>
        ${cabinetBreakdownHtml}
        <div class="agreement-card-actions">
          <button class="agreement-card-filter${filterClass}" type="button" data-action="toggle-preset" data-preset-id="${item.presetId}">
            ${filterLabel}
          </button>
          ${settingsButtonHtml}
        </div>
      </article>`;
    })
    .join("");

  const summaryLegendHtml = cards
    .map(
      (item) => `<span class="agreement-breakdown-item">
        <span class="agreement-breakdown-dot" style="background:${escapeAttr(item.segmentColor)}"></span>
        <span class="agreement-breakdown-name">${escapeHtml(item.label)}</span>
        <strong class="agreement-breakdown-count">${item.count}</strong>
      </span>`,
    )
    .join("");
  const totalMetaMainParts = [`${totalRows} товаров`, `${loadedRows} загружено`, `${errors} ошибок`];
  const totalMetaExtraParts = [];
  if (problemStats.autoplayOver > 0) {
    totalMetaExtraParts.push(`автоплей перелимит +${problemStats.autoplayOver}`);
  }
  if (problemStats.tagsOver > 0) {
    totalMetaExtraParts.push(`тэги перелимит +${problemStats.tagsOver}`);
  }
  const totalMetaMainHtml = totalMetaMainParts
    .map((part) => `<span class="agreement-total-meta-pill">${escapeHtml(part)}</span>`)
    .join("");
  const totalMetaExtraHtml = totalMetaExtraParts
    .map((part) => `<span class="agreement-total-meta-pill agreement-total-meta-pill-extra">${escapeHtml(part)}</span>`)
    .join("");
  const sellerSettingsHtml = buildSellerSettingsHtml();
  const stockPositiveActive = isPresetActive("stockPositive");

  targetEl.innerHTML = `<div class="agreement-block">
    <div class="agreement-block-head">
      <div class="agreement-head-main">
        <h2>Дашборд карточек</h2>
        <p class="subtle">Обновлено: ${escapeHtml(
          state.lastSyncAt ? formatDateTime(state.lastSyncAt) : "-",
        )}</p>
      </div>
      <div class="seller-settings agreement-seller-settings">${sellerSettingsHtml}</div>
    </div>

    <div class="agreement-topline">
      <article class="agreement-total ${mainToneClass}">
        <div class="agreement-total-main">
          <p class="agreement-total-label">Всего проблем</p>
          <p class="agreement-total-value">${totalProblems}</p>
        </div>
        <div class="agreement-total-meta-stack">
          <div class="agreement-total-meta-list agreement-total-meta-list-main">${totalMetaMainHtml}</div>
          ${totalMetaExtraHtml ? `<div class="agreement-total-meta-list agreement-total-meta-list-extra">${totalMetaExtraHtml}</div>` : ""}
        </div>
      </article>
      <article class="agreement-breakdown">
        <div class="agreement-breakdown-head">
          <p class="agreement-breakdown-title">Структура проблем</p>
          <div class="agreement-breakdown-meta">${summaryLegendHtml}</div>
        </div>
        <div class="agreement-break-rail">
          ${
            breakdownSegments ||
            '<span class="agreement-break-segment agreement-break-segment-empty" style="width:100%"></span>'
          }
        </div>
        <div class="agreement-breakdown-actions">
          <button
            class="agreement-head-chart-btn"
            type="button"
            data-action="open-problems-chart"
            data-hint="График динамики проблем"
            aria-label="График динамики проблем"
          >
            ${renderIcon("chartLine")}
            <span>График</span>
          </button>
          <button
            class="agreement-stock-toggle${stockPositiveActive ? " is-active" : ""}"
            type="button"
            data-action="toggle-preset"
            data-preset-id="stockPositive"
            data-hint="Показывать только товары с остатками"
            aria-label="Показывать только товары с остатками"
            aria-pressed="${stockPositiveActive ? "true" : "false"}"
          >
            <span class="agreement-stock-toggle-label">Товары с остатками</span>
            <span class="agreement-stock-toggle-switch" aria-hidden="true"></span>
          </button>
        </div>
      </article>
    </div>

    <div class="agreement-cards">${cardsHtml}</div>
  </div>`;
}

function buildErrorReport(rows) {
  const groups = new Map();

  for (const row of rows) {
    const rawMessage = row?.error ? String(row.error).trim() : "";
    if (!rawMessage) {
      continue;
    }

    const bucket = classifyErrorMessage(rawMessage);
    if (!groups.has(bucket.key)) {
      groups.set(bucket.key, {
        key: bucket.key,
        label: bucket.label,
        count: 0,
        nmIds: [],
        moreNmIds: 0,
        example: rawMessage,
      });
    }

    const group = groups.get(bucket.key);
    group.count += 1;
    if (group.nmIds.length < 12) {
      group.nmIds.push(String(row.nmId || "").trim());
    } else {
      group.moreNmIds += 1;
    }
  }

  const sorted = Array.from(groups.values()).sort((a, b) => b.count - a.count);
  const total = sorted.reduce((acc, item) => acc + item.count, 0);
  return {
    total,
    groups: sorted,
  };
}

function classifyErrorMessage(messageRaw) {
  const message = String(messageRaw || "");
  const normalized = message.toLowerCase();

  if (normalized.includes("429")) {
    return {
      key: "rate-limit",
      label: "HTTP 429 / лимит WB",
    };
  }

  if (
    normalized.includes("x-pow") ||
    normalized.includes("ответ источника не похож на json") ||
    normalized.includes("html вместо json")
  ) {
    return {
      key: "antibot",
      label: "Антибот WB (x-pow / HTML вместо JSON)",
    };
  }

  if (normalized.includes("failed to fetch") || normalized.includes("превышено время ожидания")) {
    return {
      key: "network",
      label: "Сетевая ошибка (Failed to fetch / timeout)",
    };
  }

  if (normalized.includes("не удалось определить basket-хост")) {
    return {
      key: "basket-host",
      label: "Не найден basket-хост",
    };
  }

  if (normalized.includes("403") || normalized.includes("405")) {
    return {
      key: "forbidden",
      label: "Источник недоступен (HTTP 403/405)",
    };
  }

  if (normalized.includes("http 5") || normalized.includes("временно недоступен")) {
    return {
      key: "server-error",
      label: "Сервер WB временно недоступен (5xx)",
    };
  }

  if (normalized.includes("некорректный артикул")) {
    return {
      key: "bad-id",
      label: "Некорректный артикул",
    };
  }

  return {
    key: "other",
    label: "Прочие ошибки",
  };
}

function renderBoolPill(value, options = {}) {
  const compact = options.compact === true;
  const compactClass = compact ? " pill-compact" : "";

  if (value === true) {
    return `<span class="pill pill-ok${compactClass}">Да</span>`;
  }
  if (value === false) {
    return `<span class="pill pill-no${compactClass}">Нет</span>`;
  }
  return `<span class="pill pill-na${compactClass}">Н/Д</span>`;
}

function getRecommendationValue(data) {
  if (!data || typeof data !== "object") {
    return null;
  }
  return data.hasSellerRecommendations === true;
}

function getVideoValue(data) {
  if (!data || typeof data !== "object") {
    return null;
  }
  return data.hasVideo === true;
}

function getAutoplayValue(data) {
  if (!data || typeof data !== "object") {
    return null;
  }
  return data.hasAutoplay === true;
}

function getTagsValue(data) {
  if (!data || typeof data !== "object") {
    return null;
  }
  return data.hasTags === true;
}

function getCoverDuplicateValue(data) {
  if (!data || typeof data !== "object") {
    return null;
  }
  if (data.coverSlideDuplicate === true) {
    return true;
  }
  if (data.coverSlideDuplicate === false) {
    return false;
  }
  const slides = Array.isArray(data.slides) ? data.slides : [];
  if (slides.length === 1) {
    return false;
  }
  return null;
}

function renderCoverDuplicatePill(value, options = {}) {
  const compact = options.compact === true;
  const compactClass = compact ? " pill-compact" : "";

  if (value === true) {
    return `<span class="pill pill-no${compactClass}" title="Обложка и слайд 1 совпадают">Да</span>`;
  }
  if (value === false) {
    return `<span class="pill pill-ok${compactClass}" title="Обложка и слайд 1 разные">Нет</span>`;
  }
  return `<span class="pill pill-na${compactClass}" title="Недостаточно данных для проверки">Н/Д</span>`;
}

function isPresetActive(presetId) {
  switch (presetId) {
    case "problemRows":
      return state.onlyErrors;
    case "notLoaded":
      return state.notLoadedOnly;
    case "stockPositive":
      return state.stockPositiveOnly;
    case "recommendationsNo":
      return state.filters.recommendations === "no";
    case "richNo":
      return state.filters.rich === "no";
    case "videoNo":
      return state.filters.video === "no";
    case "autoplayNo":
      return state.autoplayProblemOnly;
    case "tagsNo":
      return state.tagsProblemOnly;
    case "coverDuplicate":
      return state.filters.coverDuplicate === "yes";
    default:
      return false;
  }
}

function togglePresetFilter(presetId) {
  const active = isPresetActive(presetId);
  setPresetActive(presetId, !active);
}

function setPresetActive(presetId, isActive) {
  const enabled = Boolean(isActive);
  switch (presetId) {
    case "problemRows":
      state.onlyErrors = enabled;
      break;
    case "notLoaded":
      state.notLoadedOnly = enabled;
      break;
    case "stockPositive":
      state.stockPositiveOnly = enabled;
      break;
    case "recommendationsNo":
      state.filters.recommendations = enabled ? "no" : "all";
      break;
    case "richNo":
      state.filters.rich = enabled ? "no" : "all";
      break;
    case "videoNo":
      state.filters.video = enabled ? "no" : "all";
      break;
    case "autoplayNo":
      state.autoplayProblemOnly = enabled;
      break;
    case "tagsNo":
      state.tagsProblemOnly = enabled;
      break;
    case "coverDuplicate":
      state.filters.coverDuplicate = enabled ? "yes" : "all";
      break;
    default:
      return;
  }

  state.rowsPage = 1;
  renderFilterInputs();
  render();
}

function getPresetRowsCount(presetId) {
  switch (presetId) {
    case "problemRows":
      return state.rows.filter((row) => Boolean(row.error)).length;
    case "notLoaded":
      return state.rows.filter((row) => !row?.data).length;
    case "stockPositive":
      return state.rows.filter((row) => row?.data && !row?.error && Number.isFinite(row.stockValue) && row.stockValue > 0)
        .length;
    case "recommendationsNo":
      return state.rows.filter((row) => row.data && !row.error && getRecommendationValue(row.data) === false).length;
    case "richNo":
      return state.rows.filter((row) => row.data && !row.error && row.data.hasRich === false).length;
    case "videoNo":
      return state.rows.filter((row) => row.data && !row.error && getVideoValue(row.data) === false).length;
    case "autoplayNo":
      return getProblemStats(state.rows).autoplayNo;
    case "tagsNo":
      return getProblemStats(state.rows).tagsNo;
    case "coverDuplicate":
      return state.rows.filter((row) => row.data && !row.error && getCoverDuplicateValue(row.data) === true).length;
    default:
      return 0;
  }
}

function renderPresetFilters() {
  if (!el.presetFilters) {
    return;
  }

  el.presetFilters.innerHTML = PRESET_FILTERS.map((preset) => {
    const activeClass = isPresetActive(preset.id) ? " is-active" : "";
    const count = getPresetRowsCount(preset.id);
    return `<button class="preset-chip global-filter-chip${activeClass}" type="button" data-action="toggle-preset" data-preset-id="${preset.id}">
      <span class="global-filter-chip-name">${escapeHtml(preset.label)}</span>
      <span class="preset-chip-count global-filter-chip-count is-problems">${count}</span>
    </button>`;
  }).join("");
}
