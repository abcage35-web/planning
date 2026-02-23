function render() {
  hideBreakSegmentTooltip();
  hideIconHintTooltip();
  renderCabinetFilterOptions();
  renderGlobalCabinetFilters();
  renderGlobalCategoryFilters();
  applyChecksFilterPopoverState();
  renderRows();
  renderSummary();
  renderPresetFilters();
  applyGlobalFiltersState();
  if (el.limitsModal && !el.limitsModal.hidden) {
    renderLimitsModalContent();
  }
  if (el.rowHistoryModal && !el.rowHistoryModal.hidden && el.rowHistoryContent) {
    const rowId = String(el.rowHistoryContent.dataset.rowId || "").trim();
    const row = rowId ? getRowById(rowId) : null;
    if (row) {
      renderRowHistoryContent(row);
    }
  }
  if (el.problemsChartModal && !el.problemsChartModal.hidden) {
    renderProblemsChartCabinetFilter();
    renderProblemsChartContent();
  }
  if (typeof applyRoleAccessState === "function") {
    applyRoleAccessState();
  }
  syncButtonState();
  syncGlobalFilterOffset();
  persistState();
}

function renderRows() {
  hideHoverZoom();
  const filteredRows = applyFilters(state.rows);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / state.rowsLimit));
  state.rowsPage = Math.max(1, Math.min(totalPages, state.rowsPage));
  const startIndex = (state.rowsPage - 1) * state.rowsLimit;
  const visibleRows = filteredRows.slice(startIndex, startIndex + state.rowsLimit);

  state.pagination.filtered = filteredRows.length;
  state.pagination.visible = visibleRows.length;
  state.pagination.totalPages = filteredRows.length > 0 ? totalPages : 0;
  renderRowsPagination();

  if (filteredRows.length === 0) {
    el.rowsBody.innerHTML =
      `<tr><td class="empty-cell" colspan="${TABLE_COLUMNS}">Нет строк для отображения. Проверьте фильтры или добавьте артикулы.</td></tr>`;
    return;
  }

  const rowsHtml = visibleRows
    .map((row, index) => {
      const canDeleteRows = typeof hasAdminAccess === "function" ? hasAdminAccess() : true;
      const updatedAtCompact = formatRowUpdatedAtCompact(row.updatedAt);
      const updatedAtTitle = row.updatedAt ? `Последнее обновление: ${formatDateTime(row.updatedAt)}` : "";
      const data = row.data;
      const wbLink = `https://www.wildberries.ru/catalog/${row.nmId}/detail.aspx`;
      const status = buildStatus(row);
      const nameText = data?.name || "-";
      const categoryText = data?.category || "-";
      const brandText = data?.brand || "-";
      const cardCode = getCardCodeValue(data);

      return `<tr data-id="${row.id}">
        <td class="actions-cell">
          <div class="cell-actions">
            ${renderStatusIcon(row, status)}
            <button
              class="icon-btn icon-btn-history"
              data-action="row-history"
              data-id="${row.id}"
              type="button"
              aria-label="История обновлений"
              data-hint="История обновлений"
            >
              ${renderIcon("clock")}
            </button>
            <span class="actions-divider" aria-hidden="true"></span>
            <button
              class="icon-btn icon-btn-refresh"
              data-action="reload"
              data-id="${row.id}"
              type="button"
              aria-label="Обновить"
              data-hint="Обновить строку"
            >
              ${renderIcon("refresh")}
            </button>
            ${
              canDeleteRows
                ? `<button
              class="icon-btn icon-btn-remove"
              data-action="remove"
              data-id="${row.id}"
              type="button"
              aria-label="Удалить"
              data-hint="Удалить строку"
            >
              ${renderIcon("trash")}
            </button>`
                : ""
            }
            <span class="actions-updated-at${updatedAtCompact ? "" : " actions-updated-at-empty"}"${
              updatedAtTitle ? ` title="${escapeAttr(updatedAtTitle)}"` : ""
            }>
              ${
                updatedAtCompact
                  ? `<span class="actions-updated-date">${escapeHtml(updatedAtCompact.date)}</span><span class="actions-updated-time">${escapeHtml(updatedAtCompact.time)}</span>`
                  : '<span class="actions-updated-date">--.--.--</span><span class="actions-updated-time">--:--</span>'
              }
            </span>
          </div>
        </td>
        <td>${startIndex + index + 1}</td>
        <td>
          <div class="mono">${escapeHtml(row.nmId)}</div>
          ${cardCode ? `<div class="article-code-wrap"><span class="product-meta-chip article-code-chip">${escapeHtml(cardCode)}</span></div>` : ""}
          <a
            class="wb-link wb-link-icon"
            href="${wbLink}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Открыть карточку на WB"
            data-hint="Открыть карточку на WB"
            title="Открыть карточку на WB"
          >${renderIcon("externalLink")}</a>
        </td>
        <td>${escapeHtml(row.cabinet || "-")}</td>
        <td class="cell-text product-meta-cell">
          <div class="product-meta-content">
            <div class="cell-clip product-name-clip" title="${escapeAttr(nameText)}">${escapeHtml(nameText)}</div>
            <div class="product-meta-line">
              <span class="product-meta-chip" title="${escapeAttr(categoryText)}">${escapeHtml(categoryText)}</span>
            </div>
            <div class="product-meta-line">
              <span class="product-meta-chip product-meta-chip-brand" title="${escapeAttr(brandText)}">${escapeHtml(brandText)}</span>
            </div>
          </div>
        </td>
        <td class="product-info-cell">${renderProductInfoCell(row)}</td>
        <td class="checks-cell">${renderChecksGroupCell(row)}</td>
        <td class="listing-cell">${renderSlidesCell(data?.slides || [], row.id)}</td>
      </tr>`;
    })
    .join("");

  const limitNote =
    filteredRows.length > visibleRows.length
      ? `<tr><td class="empty-cell" colspan="${TABLE_COLUMNS}">Показано ${visibleRows.length} строк на странице ${state.rowsPage} из ${state.pagination.totalPages} (всего ${filteredRows.length}).</td></tr>`
      : "";

  el.rowsBody.innerHTML = rowsHtml + limitNote;
}

function getCardCodeValue(data) {
  if (!data || typeof data !== "object") {
    return "";
  }
  const value = String(data.cardCode ?? data.vendorCode ?? data.vendor_code ?? "").trim();
  if (!value) {
    return "";
  }
  return value.replace(/\s+/g, "").slice(0, 36).toUpperCase();
}

function formatRowUpdatedAtCompact(valueRaw) {
  if (!valueRaw) {
    return null;
  }

  const date = new Date(valueRaw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const pad = (value) => String(value).padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = String(date.getFullYear()).slice(-2);
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return {
    date: `${day}.${month}.${year}`,
    time: `${hours}:${minutes}`,
  };
}

function renderRowsPagination() {
  if (!el.pageInfo || !el.pagePrevBtn || !el.pageNextBtn) {
    return;
  }

  const filtered = Number(state.pagination.filtered) || 0;
  const totalPages = Number(state.pagination.totalPages) || 0;
  const page = filtered > 0 ? state.rowsPage : 0;
  el.pageInfo.textContent = `Страница ${page} / ${totalPages}`;

  const disabledByLoading = state.isBulkLoading;
  el.pagePrevBtn.disabled = disabledByLoading || page <= 1 || filtered === 0;
  el.pageNextBtn.disabled = disabledByLoading || page >= totalPages || filtered === 0;
}

function applyFilters(rows, filterOverrides = null) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const activeFilters =
    filterOverrides && typeof filterOverrides === "object"
      ? { ...state.filters, ...filterOverrides }
      : state.filters;
  let filteredRows = rows.filter((row) => {
    if (state.onlyErrors && !row.error) {
      return false;
    }
    if (state.notLoadedOnly && row?.data) {
      return false;
    }

    const data = row.data;

    if (!matchQuickSearchFilter(row, data, activeFilters.quickSearch)) {
      return false;
    }

    if (!matchTextFilter(row.nmId, activeFilters.nmId)) {
      return false;
    }

    if (!matchTextFilter(getCardCodeValue(data), activeFilters.cardCode)) {
      return false;
    }

    if (!matchCabinetFilter(row.cabinet, activeFilters.cabinet)) {
      return false;
    }

    if (!matchCategoryGroupFilter(data?.category || "", activeFilters.categoryGroup)) {
      return false;
    }

    if (!matchTextFilter(data?.name || "", activeFilters.name)) {
      return false;
    }

    if (!matchTextFilter(data?.category || "", activeFilters.category)) {
      return false;
    }

    if (!matchBoolFilter(getVideoValue(data), activeFilters.video)) {
      return false;
    }

    if (!matchBoolFilter(getRecommendationValue(data), activeFilters.recommendations)) {
      return false;
    }

    if (!matchBoolFilter(data?.hasRich, activeFilters.rich)) {
      return false;
    }

    if (!matchBoolFilter(getAutoplayValue(data), activeFilters.autoplay)) {
      return false;
    }

    if (!matchBoolFilter(getTagsValue(data), activeFilters.tags)) {
      return false;
    }

    if (!matchBoolFilter(getCoverDuplicateValue(data), activeFilters.coverDuplicate)) {
      return false;
    }

    return true;
  });

  if (state.autoplayProblemOnly) {
    const autoplayProblemRowIds = getAutoplayProblemCandidateRowIds(filteredRows);
    filteredRows = filteredRows.filter((row) => autoplayProblemRowIds.has(row.id));
  }

  if (state.tagsProblemOnly) {
    const tagsProblemRowIds = getTagsProblemCandidateRowIds(filteredRows);
    filteredRows = filteredRows.filter((row) => tagsProblemRowIds.has(row.id));
  }

  return filteredRows;
}

function matchQuickSearchFilter(row, data, filterRaw) {
  const filter = String(filterRaw || "").trim();
  if (!filter) {
    return true;
  }

  return (
    matchTextFilter(row?.nmId ?? "", filter) ||
    matchTextFilter(data?.name || "", filter) ||
    matchTextFilter(getCardCodeValue(data), filter)
  );
}

function getDashboardScopeRows(rows = state.rows, options = {}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const filterOverrides =
    options && typeof options === "object" && options.filters && typeof options.filters === "object"
      ? options.filters
      : {};
  const activeFilters = {
    cabinet: state.filters.cabinet,
    categoryGroup: state.filters.categoryGroup,
    ...filterOverrides,
  };

  return sourceRows.filter((row) => {
    if (!matchCabinetFilter(row?.cabinet, activeFilters.cabinet)) {
      return false;
    }
    if (!matchCategoryGroupFilter(row?.data?.category || "", activeFilters.categoryGroup)) {
      return false;
    }
    return true;
  });
}

function getAutoplayProblemCandidateRowIds(rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const scopeCabinets = getAllCabinets(sourceRows, false);
  const usage = getAutoplayUsageByCabinet(sourceRows, scopeCabinets);
  const remainingByCabinet = new Map(
    usage.map((item) => [String(item.cabinet || "").trim(), Math.max(0, Number(item.missing) || 0)]),
  );
  const selectedByCabinet = new Map();
  const selectedRowIds = new Set();

  for (const row of sourceRows) {
    if (!row || !row.data || row.error) {
      continue;
    }

    if (getAutoplayValue(row.data) !== false) {
      continue;
    }

    const cabinet = String(row.cabinet || "").trim();
    if (!cabinet) {
      continue;
    }

    const remaining = Number(remainingByCabinet.get(cabinet) || 0);
    if (remaining <= 0) {
      continue;
    }

    const selectedCount = Number(selectedByCabinet.get(cabinet) || 0);
    if (selectedCount >= remaining) {
      continue;
    }

    selectedByCabinet.set(cabinet, selectedCount + 1);
    selectedRowIds.add(row.id);
  }

  return selectedRowIds;
}

function getTagsProblemCandidateRowIds(rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const scopeCabinets = getAllCabinets(sourceRows, false);
  const usage = getTagsUsageByCabinet(sourceRows, scopeCabinets);
  const remainingByCabinet = new Map(
    usage.map((item) => [String(item.cabinet || "").trim(), Math.max(0, Number(item.missing) || 0)]),
  );
  const selectedByCabinet = new Map();
  const selectedRowIds = new Set();

  for (const row of sourceRows) {
    if (!row || !row.data || row.error) {
      continue;
    }

    if (getTagsValue(row.data) !== false) {
      continue;
    }

    const cabinet = String(row.cabinet || "").trim();
    if (!cabinet) {
      continue;
    }

    const remaining = Number(remainingByCabinet.get(cabinet) || 0);
    if (remaining <= 0) {
      continue;
    }

    const selectedCount = Number(selectedByCabinet.get(cabinet) || 0);
    if (selectedCount >= remaining) {
      continue;
    }

    selectedByCabinet.set(cabinet, selectedCount + 1);
    selectedRowIds.add(row.id);
  }

  return selectedRowIds;
}

function matchTextFilter(valueRaw, filterRaw) {
  const filter = String(filterRaw || "").trim().toLowerCase();
  if (!filter) {
    return true;
  }

  const value = String(valueRaw || "").toLowerCase();
  return value.includes(filter);
}

function matchCabinetFilter(cabinetRaw, filterRaw) {
  const selected = getCabinetFilterSelection(filterRaw);
  if (selected.length <= 0) {
    return true;
  }

  const cabinet = String(cabinetRaw || "").trim();
  if (!cabinet) {
    return selected.includes("__empty__");
  }

  return selected.includes(cabinet);
}

function matchCategoryGroupFilter(categoryRaw, filterRaw) {
  const selected = getCategoryGroupSelection(filterRaw);
  if (selected.length <= 0) {
    return true;
  }
  const category = String(categoryRaw || "").trim();
  if (!category) {
    return selected.includes("__empty__");
  }
  return selected.includes(category);
}

function matchBoolFilter(value, filterRaw) {
  const filter = String(filterRaw || "all");
  if (filter === "all") {
    return true;
  }

  if (filter === "yes") {
    return value === true;
  }

  if (filter === "no") {
    return value === false;
  }

  if (filter === "na") {
    return value !== true && value !== false;
  }

  return true;
}

function getStockState(row) {
  if (Number.isFinite(row.stockValue)) {
    return row.stockValue > 0 ? "yes" : "no";
  }

  if (typeof row.inStock === "boolean") {
    return row.inStock ? "yes" : "no";
  }

  return "na";
}

function matchStockFilter(row, filterRaw) {
  const filter = String(filterRaw || "all");
  if (filter === "all") {
    return true;
  }

  const stockState = getStockState(row);
  return stockState === filter;
}

function formatRub(valueRaw) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) {
    return "";
  }
  const rounded = Math.max(0, Math.round(value));
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F");
}

function renderProductInfoCell(row) {
  return `<div class="product-info-grid">
    ${renderProductInfoItem("Остаток", renderProductStockValue(row))}
    ${renderProductInfoItem("Цена", renderProductPriceValue(row))}
    ${renderProductInfoItem("Рейтинг", renderProductRatingValue(row))}
    ${renderProductInfoItem("Отзывы", renderProductReviewCountValue(row))}
    ${renderProductInfoItem("Склейки", renderProductColorVariantsValue(row))}
  </div>`;
}

function renderProductInfoItem(label, valueHtml) {
  return `<div class="product-info-item">
    <span class="product-info-label">${escapeHtml(label)}</span>
    <span class="product-info-value">${valueHtml}</span>
  </div>`;
}

function renderProductStockValue(row) {
  if (Number.isFinite(row.stockValue)) {
    return `<span class="pill pill-info pill-compact"><span class="mono">${escapeHtml(String(row.stockValue))}</span><span class="stock-note">&nbsp;шт.</span></span>`;
  }

  if (row.inStock === true) {
    return '<span class="pill pill-ok pill-compact">Есть</span>';
  }

  if (row.inStock === false) {
    return '<span class="pill pill-no pill-compact">Нет</span>';
  }

  return '<span class="pill pill-na pill-compact">Н/Д</span>';
}

function renderProductPriceValue(row) {
  if (!Number.isFinite(row.currentPrice)) {
    return '<span class="pill pill-na pill-compact">Н/Д</span>';
  }

  const current = formatRub(row.currentPrice);
  const trend = getProductPriceTrend(row);
  const trendHtml = trend
    ? `<span class="product-price-trend product-price-trend-${escapeAttr(trend.direction)}" title="${escapeAttr(trend.title)}" aria-hidden="true">${
        trend.direction === "up" ? "▲" : "▼"
      }</span>`
    : "";

  return `<span class="price-info-wrap">
    <span class="pill pill-info pill-compact"><span class="mono">${escapeHtml(current)}</span><span class="stock-note">&nbsp;р</span></span>
    ${trendHtml}
  </span>`;
}

function parsePriceFromLogText(valueRaw) {
  const value = String(valueRaw || "").trim();
  if (!value || /^н\/д$/i.test(value) || value === "—" || value === "-") {
    return null;
  }
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return null;
  }
  const price = Number(digits);
  return Number.isFinite(price) ? Math.max(0, Math.round(price)) : null;
}

function getLatestCurrentPriceChange(row) {
  const logs = Array.isArray(row?.updateLogs) ? row.updateLogs : [];
  for (let logIndex = logs.length - 1; logIndex >= 0; logIndex -= 1) {
    const entry = logs[logIndex];
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (let changeIndex = changes.length - 1; changeIndex >= 0; changeIndex -= 1) {
      const change = changes[changeIndex];
      if (String(change?.field || "").trim() !== "currentPrice") {
        continue;
      }
      return {
        before: parsePriceFromLogText(change?.beforeText),
        after: parsePriceFromLogText(change?.afterText),
      };
    }
  }
  return null;
}

function getProductPriceTrend(row) {
  const latestPriceChange = getLatestCurrentPriceChange(row);
  if (!latestPriceChange) {
    return null;
  }

  const before = latestPriceChange.before;
  const after = latestPriceChange.after;
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === after) {
    return null;
  }

  if (after > before) {
    return {
      direction: "up",
      title: `Цена выросла: ${formatRub(before)} р → ${formatRub(after)} р`,
    };
  }
  return {
    direction: "down",
    title: `Цена снизилась: ${formatRub(before)} р → ${formatRub(after)} р`,
  };
}

function renderProductRatingValue(row) {
  const ratingRaw = row?.data?.rating;
  const rating = Number(ratingRaw);
  if (!Number.isFinite(rating)) {
    return '<span class="pill pill-na pill-compact">Н/Д</span>';
  }
  const ratingText = (Math.round(rating * 10) / 10).toFixed(1).replace(".", ",");
  return `<span class="pill pill-info pill-compact"><span class="mono">${escapeHtml(ratingText)}</span></span>`;
}

function renderProductReviewCountValue(row) {
  const reviewCountRaw = row?.data?.reviewCount;
  const reviewCount = Number(reviewCountRaw);
  if (!Number.isFinite(reviewCount)) {
    return '<span class="pill pill-na pill-compact">Н/Д</span>';
  }
  return `<span class="pill pill-info pill-compact"><span class="mono">${escapeHtml(formatRub(reviewCount))}</span></span>`;
}

function renderProductColorVariantsValue(row) {
  if (!row || !row.data || row.error) {
    return '<span class="pill pill-na pill-compact">Н/Д</span>';
  }

  const ids = Array.isArray(row.data.colorNmIds)
    ? row.data.colorNmIds
        .map((value) => String(value || "").trim())
        .filter((value) => Boolean(value) && value !== String(row.nmId))
    : [];
  const count = ids.length;
  const preview = ids.slice(0, 3).join(", ");
  const title = count > 0 ? `Склейки: ${count}${preview ? `. Артикулы: ${preview}${ids.length > 3 ? ", ..." : ""}` : ""}` : "Склейки не найдены";
  if (count <= 0) {
    return '<span class="pill pill-no pill-compact">Нет</span>';
  }

  return `<button
    class="pill pill-ok pill-compact rec-pill rec-pill-compact product-info-colors-btn"
    type="button"
    data-action="color-variants"
    data-id="${escapeAttr(row.id)}"
    title="${escapeAttr(title)}"
    data-hint="Показать склейки"
  >
    <span class="rec-pill-mark" aria-hidden="true"></span>
    <span>Да (${escapeHtml(String(count))})</span>
  </button>`;
}

function buildStatus(row) {
  if (row.loading) {
    return {
      key: "loading",
      text: "Загрузка",
      title: "Загрузка данных карточки",
    };
  }

  if (row.queuedForRefresh) {
    return {
      key: "queued",
      text: "Ожидает очереди",
      title: "Строка ожидает обновления в очереди",
    };
  }

  if (row.error) {
    return {
      key: "error",
      text: "Ошибка",
      title: row.error,
    };
  }

  if (!row.data) {
    return {
      key: "idle",
      text: "Не загружено",
      title: "Нажмите обновление карточек",
    };
  }

  const hostInfo = row.data.hostSuffix ? `basket-${row.data.hostSuffix}` : "basket";
  const at = row.updatedAt ? `, ${formatDateTime(row.updatedAt)}` : "";

  return {
    key: "ok",
    text: "OK",
    title: `Данные обновлены (${hostInfo}${at})`,
  };
}

function renderStatusIcon(row, status) {
  const title = `Статус: ${status.text}${status.title ? ` · ${status.title}` : ""}`;
  let svg = renderIcon("clock");
  if (status.key === "ok") {
    svg = renderIcon("check");
  } else if (status.key === "error") {
    svg = renderIcon("alert");
  } else if (status.key === "loading") {
    svg = renderIcon("loader", "status-icon-spin");
  } else if (status.key === "queued") {
    svg = renderIcon("clock");
  }

  if (status.key === "error") {
    return `<button class="status-icon status-icon-${status.key} status-icon-btn" data-action="show-error" data-id="${escapeAttr(
      row.id,
    )}" type="button" aria-label="${escapeAttr(title)}" data-hint="Показать ошибку строки">${svg}</button>`;
  }

  return `<span class="status-icon status-icon-${status.key}" aria-label="${escapeAttr(
    title,
  )}" role="img" data-hint="Статус: ${escapeAttr(status.text)}">${svg}</span>`;
}
