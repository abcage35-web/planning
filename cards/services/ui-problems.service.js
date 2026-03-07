function renderSummary() {
  const dashboardRows = getDashboardScopeRows(state.rows);

  const total = state.rows.length;
  const filtered = Number(state.pagination.filtered) || applyFilters(state.rows).length;
  const visible = Number(state.pagination.visible) || Math.min(filtered, state.rowsLimit);
  const dashboardTotal = dashboardRows.length;
  const dashboardLoaded = dashboardRows.filter((row) => row.data && !row.error).length;
  const dashboardErrors = dashboardRows.filter((row) => row.error).length;
  const loaded = dashboardLoaded;
  const errors = dashboardErrors;

  if (el.summaryLine) {
    el.summaryLine.textContent = `Товаров: ${total} | Показано: ${visible}/${filtered} | ${loaded} загружено | ${errors} ошибок`;
  }
  if (el.lastSyncLine) {
    el.lastSyncLine.textContent = state.lastSyncAt
      ? `Последнее обновление: ${formatDateTime(state.lastSyncAt)}`
      : "Последнее обновление: -";
  }
  if (el.errorDetailsBtn) {
    if (errors > 0) {
      el.errorDetailsBtn.hidden = false;
      el.errorDetailsBtn.textContent = `Показать ошибки (${errors})`;
      el.errorDetailsBtn.title = "Показать расшифровку ошибок загрузки по артикулам";
    } else {
      el.errorDetailsBtn.hidden = true;
    }
  }
  const problemStats = getProblemStats(dashboardRows);

  const totalProblems =
    problemStats.recommendationsNo +
    problemStats.richNo +
    problemStats.videoNo +
    problemStats.autoplayNo +
    problemStats.tagsNo +
    problemStats.coverDuplicate;

  if (el.problemLine) {
    if (dashboardTotal === 0) {
      el.problemLine.textContent = "Проблемы: -";
      el.problemLine.classList.remove("problem-alert");
    } else {
      el.problemLine.textContent =
        `Проблемы: Рекомендации нет ${problemStats.recommendationsNo}, ` +
        `Рич нет ${problemStats.richNo}, ` +
        `Видео нет ${problemStats.videoNo}, ` +
        `Автоплей нет ${problemStats.autoplayNo}, ` +
        `Тэги нет ${problemStats.tagsNo}, ` +
        `Дубль обложки ${problemStats.coverDuplicate}` +
        (problemStats.autoplayOver > 0 ? `, Перелимит автоплея +${problemStats.autoplayOver}` : "") +
        (problemStats.tagsOver > 0 ? `, Перелимит тэгов +${problemStats.tagsOver}` : "");

      el.problemLine.classList.toggle(
        "problem-alert",
        totalProblems > 0 || problemStats.autoplayOver > 0 || problemStats.tagsOver > 0,
      );
    }
  }

  renderAgreementDashboard(problemStats, {
    total: dashboardTotal,
    loaded: dashboardLoaded,
    errors: dashboardErrors,
    dashboardRows,
  });
}

function getProblemStats(rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const problemStats = {
    recommendationsNo: 0,
    richNo: 0,
    videoNo: 0,
    autoplayNo: 0,
    autoplayOver: 0,
    tagsNo: 0,
    tagsOver: 0,
    coverDuplicate: 0,
  };

  for (const row of sourceRows) {
    if (!row.data || row.error) {
      continue;
    }

    if (getRecommendationValue(row.data) === false) {
      problemStats.recommendationsNo += 1;
    }
    if (row.data.hasRich === false) {
      problemStats.richNo += 1;
    }
    if (getVideoValue(row.data) === false) {
      problemStats.videoNo += 1;
    }
    if (getCoverDuplicateValue(row.data) === true) {
      problemStats.coverDuplicate += 1;
    }
  }

  const scopeCabinets = getAllCabinets(sourceRows, false);
  const autoplayUsage = getAutoplayUsageByCabinet(sourceRows, scopeCabinets);
  problemStats.autoplayNo = autoplayUsage.reduce((sum, item) => sum + item.missing, 0);
  problemStats.autoplayOver = autoplayUsage.reduce((sum, item) => sum + item.over, 0);

  const tagsUsage = getTagsUsageByCabinet(sourceRows, scopeCabinets);
  problemStats.tagsNo = tagsUsage.reduce((sum, item) => sum + item.missing, 0);
  problemStats.tagsOver = tagsUsage.reduce((sum, item) => sum + item.over, 0);

  return problemStats;
}

function getProblemBreakdownByCabinets(problemKey, rows = state.rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const scopeCabinets = getAllCabinets(sourceRows, false);
  const autoplayUsage = getAutoplayUsageByCabinet(sourceRows, scopeCabinets);
  const tagsUsage = getTagsUsageByCabinet(sourceRows, scopeCabinets);
  const autoplayMap = new Map(autoplayUsage.map((item) => [item.cabinet, item]));
  const tagsMap = new Map(tagsUsage.map((item) => [item.cabinet, item]));
  const cabinets = getAllCabinets(sourceRows, false);

  const isFilled = (row, key) => {
    if (!row || !row.data || row.error) {
      return false;
    }
    if (key === "recommendationsNo") {
      return getRecommendationValue(row.data) === true;
    }
    if (key === "richNo") {
      return row.data.hasRich === true;
    }
    if (key === "videoNo") {
      return getVideoValue(row.data) === true;
    }
    if (key === "autoplayNo") {
      return getAutoplayValue(row.data) === true;
    }
    if (key === "tagsNo") {
      return getTagsValue(row.data) === true;
    }
    if (key === "coverDuplicate") {
      return getCoverDuplicateValue(row.data) === false;
    }
    return false;
  };

  if (problemKey === "autoplayNo") {
    return autoplayUsage.map((item) => {
      const cabinetRows = getRowsByCabinet(sourceRows, item.cabinet);
      return {
        cabinet: item.cabinet,
        count: Number.isFinite(item.missingSigned) ? item.missingSigned : item.missing,
        over: item.over,
        filled: cabinetRows.filter((row) => isFilled(row, problemKey)).length,
        total: cabinetRows.length,
        loadedRows: item.loadedRows,
        totalRows: item.totalRows,
        used: item.autoplayUsed,
        limit: item.limit,
        hasOverride: item.hasOverride === true,
      };
    });
  }

  if (problemKey === "tagsNo") {
    return tagsUsage.map((item) => {
      const cabinetRows = getRowsByCabinet(sourceRows, item.cabinet);
      return {
        cabinet: item.cabinet,
        count: Number.isFinite(item.missingSigned) ? item.missingSigned : item.missing,
        over: item.over,
        filled: cabinetRows.filter((row) => isFilled(row, problemKey)).length,
        total: cabinetRows.length,
        loadedRows: item.loadedRows,
        totalRows: item.totalRows,
        used: item.tagsUsed,
        limit: item.limit,
        hasOverride: item.hasOverride === true,
      };
    });
  }

  return cabinets.map((cabinet) => {
    const autoplayItem = autoplayMap.get(cabinet);
    const tagsItem = tagsMap.get(cabinet);
    const cabinetRows = sourceRows.filter(
      (row) => String(row.cabinet || "").trim() === cabinet && row.data && !row.error,
    );
    const total = sourceRows.filter((row) => String(row.cabinet || "").trim() === cabinet).length;
    let count = 0;

    for (const row of cabinetRows) {
      if (problemKey === "recommendationsNo" && getRecommendationValue(row.data) === false) {
        count += 1;
      } else if (problemKey === "richNo" && row.data.hasRich === false) {
        count += 1;
      } else if (problemKey === "videoNo" && getVideoValue(row.data) === false) {
        count += 1;
      } else if (problemKey === "coverDuplicate" && getCoverDuplicateValue(row.data) === true) {
        count += 1;
      }
    }

    return {
      cabinet,
      count,
      over: 0,
      filled: cabinetRows.filter((row) => isFilled(row, problemKey)).length,
      total,
      loadedRows: autoplayItem?.loadedRows ?? tagsItem?.loadedRows ?? cabinetRows.length,
      totalRows: autoplayItem?.totalRows ?? tagsItem?.totalRows ?? total,
    };
  });
}

function renderProblemCabinetBreakdown(problemKey, rows = state.rows) {
  const items = getProblemBreakdownByCabinets(problemKey, rows);
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }

  const itemsHtml = items
    .map((item) => {
      let toneClass = "";
      let usageTitle = "";

      if (problemKey === "autoplayNo") {
        toneClass = item.over > 0 ? " is-over" : item.count > 0 ? " is-warning" : "";
        usageTitle = `Использовано: ${item.used}/${item.limit}${item.over > 0 ? `, перелимит +${item.over}` : ""}`;
      } else if (problemKey === "tagsNo") {
        toneClass = item.over > 0 ? " is-over" : item.count > 0 ? " is-warning" : "";
        usageTitle = `Использовано: ${item.used}/${item.limit}${item.over > 0 ? `, перелимит +${item.over}` : ""}`;
      } else {
        toneClass = item.count > 0 ? " is-warning" : "";
      }
      const problemsText = String(item.count);
      const articlesText = String(item.total);
      const usageInCabinetText =
        (problemKey === "autoplayNo" || problemKey === "tagsNo") &&
        Number.isFinite(item.used) &&
        Number.isFinite(item.limit)
          ? `(${item.used} / ${item.limit})`
          : "";

      const titleAttr = usageTitle ? ` title="${escapeAttr(usageTitle)}"` : "";
      return `<li class="agreement-problem-cabinet-item${toneClass}"${titleAttr}>
        <span class="agreement-problem-cabinet-name">
          <span class="agreement-problem-cabinet-name-main">${escapeHtml(item.cabinet)}</span>
          ${
            usageInCabinetText
              ? `<span class="agreement-problem-cabinet-subtle"> ${escapeHtml(usageInCabinetText)}</span>`
              : ""
          }
        </span>
        <span class="agreement-problem-cabinet-problems">${escapeHtml(problemsText)}</span>
        <span class="agreement-problem-cabinet-slash">/</span>
        <span class="agreement-problem-cabinet-articles">${escapeHtml(articlesText)}</span>
      </li>`;
    })
    .join("");

  return `<div class="agreement-problem-cabinets-wrap">
    <div class="agreement-problem-cabinets-head">
      <span class="agreement-problem-cabinets-head-name">Кабинет</span>
      <span class="agreement-problem-cabinets-head-problems">Пробл.</span>
      <span class="agreement-problem-cabinets-head-slash">/</span>
      <span class="agreement-problem-cabinets-head-articles">Арт</span>
    </div>
    <ul class="agreement-problem-cabinets">${itemsHtml}</ul>
  </div>`;
}

function getTotalProblemsValue(problemStats) {
  if (!problemStats || typeof problemStats !== "object") {
    return 0;
  }
  return (
    Number(problemStats.recommendationsNo || 0) +
    Number(problemStats.richNo || 0) +
    Number(problemStats.videoNo || 0) +
    Number(problemStats.autoplayNo || 0) +
    Number(problemStats.tagsNo || 0) +
    Number(problemStats.coverDuplicate || 0)
  );
}

function getProblemCabinetsWithEmpty(rows = state.rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const cabinets = getAllCabinets(sourceRows, false);
  const hasEmpty = sourceRows.some((row) => !String(row?.cabinet || "").trim());
  if (hasEmpty) {
    cabinets.push("__empty__");
  }
  return cabinets;
}

function buildProblemSnapshot(rows = state.rows, options = {}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const stats = getProblemStats(sourceRows);
  const totalProblems = getTotalProblemsValue(stats);
  const cabinets = getProblemCabinetsWithEmpty(sourceRows);
  const cabinetItems = cabinets.map((cabinet) => {
    const cabinetRows = getRowsByCabinet(sourceRows, cabinet);
    const cabinetStats = getProblemStats(cabinetRows);
    return {
      cabinet,
      totalRows: cabinetRows.length,
      loadedRows: cabinetRows.filter((row) => row.data && !row.error).length,
      errorRows: cabinetRows.filter((row) => Boolean(row.error)).length,
      problems: {
        ...cabinetStats,
        total: getTotalProblemsValue(cabinetStats),
      },
    };
  });

  const source = String(options.source || "").trim().toLowerCase() === "system" ? "system" : "manual";
  const actionKey = String(options.actionKey || "").trim() || "all";
  const mode = String(options.mode || "").trim() || "full";
  const atRaw = String(options.at || "").trim();
  const atDate = atRaw ? new Date(atRaw) : null;
  const at = atDate && !Number.isNaN(atDate.getTime()) ? atDate.toISOString() : new Date().toISOString();

  return {
    id: `snap-${Math.floor(new Date(at).getTime())}-${Math.random().toString(16).slice(2, 8)}`,
    at,
    source,
    actionKey,
    mode,
    totalRows: sourceRows.length,
    loadedRows: sourceRows.filter((row) => row.data && !row.error).length,
    errorRows: sourceRows.filter((row) => Boolean(row.error)).length,
    problems: {
      ...stats,
      total: totalProblems,
    },
    cabinets: cabinetItems,
  };
}

function recordProblemSnapshot(options = {}) {
  if (!Array.isArray(state.updateSnapshots)) {
    state.updateSnapshots = [];
  }

  const snapshot = buildProblemSnapshot(state.rows, options);
  state.updateSnapshots.push(snapshot);
  if (state.updateSnapshots.length > PROBLEM_SNAPSHOT_LIMIT) {
    state.updateSnapshots.splice(0, state.updateSnapshots.length - PROBLEM_SNAPSHOT_LIMIT);
  }

  return snapshot;
}

function ensureProblemSnapshotsInitialized() {
  if (!Array.isArray(state.updateSnapshots)) {
    state.updateSnapshots = [];
  }
  if (state.updateSnapshots.length > 0) {
    return;
  }
  if (!Array.isArray(state.rows) || state.rows.length <= 0) {
    return;
  }
  recordProblemSnapshot({
    source: "manual",
    actionKey: "init",
    mode: "full",
  });
  persistState();
}

function renderGlobalCabinetFilters() {
  if (!el.globalCabinetFilters) {
    return;
  }

  const rowsWithoutCabinetFilter = getDashboardScopeRows(state.rows, { filters: { cabinet: "all" } });
  const activeCabinet = normalizeDashboardCabinet(state.filters.cabinet, rowsWithoutCabinetFilter);
  state.filters.cabinet = activeCabinet;
  el.globalCabinetFilters.innerHTML = renderDashboardCabinetQuickFilters(activeCabinet, rowsWithoutCabinetFilter);
}

function getFilterChipCountMode() {
  if (typeof normalizeFilterCountMode === "function") {
    return normalizeFilterCountMode(state.filterCountMode);
  }
  return "problems";
}

function getFilterChipCountToneClass(modeRaw = getFilterChipCountMode()) {
  return modeRaw === "rows" ? " is-rows" : " is-problems";
}

function getFilterChipDisplayCount(rowsScope = []) {
  const rows = Array.isArray(rowsScope) ? rowsScope : [];
  if (getFilterChipCountMode() === "rows") {
    return rows.length;
  }
  return getTotalProblemsValue(getProblemStats(rows));
}

function getFilterChipTitle(prefix, rowsScope = []) {
  const rows = Array.isArray(rowsScope) ? rowsScope : [];
  const problemCount = getTotalProblemsValue(getProblemStats(rows));
  const rowsCount = rows.length;
  return `${prefix}: ошибок ${problemCount}, артикулов ${rowsCount}`;
}

function renderDashboardCabinetQuickFilters(activeCabinet = "all", rowsScope = null) {
  const rowsWithoutCabinetFilter = Array.isArray(rowsScope)
    ? rowsScope
    : getDashboardScopeRows(state.rows, { filters: { cabinet: "all" } });
  const normalizedActive = normalizeDashboardCabinet(activeCabinet, rowsWithoutCabinetFilter);
  const activeSelection = new Set(getCabinetFilterSelection(normalizedActive));
  const isAllActive = activeSelection.size <= 0;
  const cabinets = getAllCabinets(state.rows);
  const hasEmptyCabinet = rowsWithoutCabinetFilter.some((row) => !String(row?.cabinet || "").trim());
  if (cabinets.length === 0 && !hasEmptyCabinet) {
    return "";
  }

  const allCount = getFilterChipDisplayCount(rowsWithoutCabinetFilter);
  const countToneClass = getFilterChipCountToneClass();

  const chips = [
    `<button
      class="global-filter-chip${isAllActive ? " is-active" : ""}"
      type="button"
      data-action="toggle-dashboard-cabinet"
      data-dashboard-cabinet="all"
      title="${escapeAttr(getFilterChipTitle("Все кабинеты", rowsWithoutCabinetFilter))}"
    >
      <span class="global-filter-chip-name">Все</span>
      <span class="global-filter-chip-count${countToneClass}">${allCount}</span>
    </button>`,
  ];

  for (const cabinet of cabinets) {
    const cabinetRows = getRowsByCabinet(rowsWithoutCabinetFilter, cabinet);
    const cabinetCount = getFilterChipDisplayCount(cabinetRows);
    chips.push(`<button
      class="global-filter-chip${activeSelection.has(cabinet) ? " is-active" : ""}"
      type="button"
      data-action="toggle-dashboard-cabinet"
      data-dashboard-cabinet="${escapeAttr(cabinet)}"
      title="${escapeAttr(getFilterChipTitle(cabinet, cabinetRows))}"
    >
      <span class="global-filter-chip-name">${escapeHtml(cabinet)}</span>
      <span class="global-filter-chip-count${countToneClass}">${cabinetCount}</span>
    </button>`);
  }

  if (hasEmptyCabinet) {
    const emptyRows = getRowsByCabinet(rowsWithoutCabinetFilter, "__empty__");
    const emptyCount = getFilterChipDisplayCount(emptyRows);
    chips.push(`<button
      class="global-filter-chip${activeSelection.has("__empty__") ? " is-active" : ""}"
      type="button"
      data-action="toggle-dashboard-cabinet"
      data-dashboard-cabinet="__empty__"
      title="${escapeAttr(getFilterChipTitle("Без кабинета", emptyRows))}"
    >
      <span class="global-filter-chip-name">Без кабинета</span>
      <span class="global-filter-chip-count${countToneClass}">${emptyCount}</span>
    </button>`);
  }

  return chips.join("");
}

function renderGlobalCategoryFilters() {
  if (!el.globalCategoryFilters) {
    return;
  }

  const rowsWithoutCategoryFilter = getDashboardScopeRows(state.rows, { filters: { categoryGroup: "all" } });
  const categories = getAllCategories(rowsWithoutCategoryFilter);
  const hasEmptyCategory = rowsWithoutCategoryFilter.some((row) => !getRowCategoryLabel(row));
  const normalizedValue = normalizeCategoryGroupValue(state.filters.categoryGroup, rowsWithoutCategoryFilter);
  const activeSelection = getCategoryGroupSelection(normalizedValue);
  const searchQuery = normalizeCategorySearchQuery(state.categorySearchQuery);

  if (normalizedValue !== state.filters.categoryGroup) {
    state.filters.categoryGroup = normalizedValue;
  }

  if (el.globalCategorySearchInput) {
    const normalizedInput = String(state.categorySearchQuery || "");
    if (el.globalCategorySearchInput.value !== normalizedInput) {
      el.globalCategorySearchInput.value = normalizedInput;
    }
  }

  if (categories.length === 0 && !hasEmptyCategory) {
    el.globalCategoryFilters.innerHTML = "";
    return;
  }

  const allCount = getFilterChipDisplayCount(rowsWithoutCategoryFilter);
  const countToneClass = getFilterChipCountToneClass();
  const chips = [
    `<button
      class="global-filter-chip${activeSelection.length <= 0 ? " is-active" : ""}"
      type="button"
      data-action="toggle-category-group"
      data-category-group="all"
      title="${escapeAttr(getFilterChipTitle("Все категории", rowsWithoutCategoryFilter))}"
    >
      <span class="global-filter-chip-name">Все</span>
      <span class="global-filter-chip-count${countToneClass}">${allCount}</span>
    </button>`,
  ];

  const matchedCategories = searchQuery
    ? categories.filter((category) => categoryMatchesSearch(category, searchQuery))
    : categories;

  for (const category of matchedCategories) {
    const categoryRows = rowsWithoutCategoryFilter.filter((row) => getRowCategoryLabel(row) === category);
    const categoryCount = getFilterChipDisplayCount(categoryRows);
    chips.push(`<button
      class="global-filter-chip${activeSelection.includes(category) ? " is-active" : ""}"
      type="button"
      data-action="toggle-category-group"
      data-category-group="${escapeAttr(category)}"
      title="${escapeAttr(getFilterChipTitle(category, categoryRows))}"
    >
      <span class="global-filter-chip-name">${escapeHtml(category)}</span>
      <span class="global-filter-chip-count${countToneClass}">${categoryCount}</span>
    </button>`);
  }

  const showEmptyCategoryChip = hasEmptyCategory && (!searchQuery || categoryMatchesSearch("Без категории", searchQuery));
  if (showEmptyCategoryChip) {
    const emptyRows = rowsWithoutCategoryFilter.filter((row) => !getRowCategoryLabel(row));
    const emptyCount = getFilterChipDisplayCount(emptyRows);
    chips.push(`<button
      class="global-filter-chip${activeSelection.includes("__empty__") ? " is-active" : ""}"
      type="button"
      data-action="toggle-category-group"
      data-category-group="__empty__"
      title="${escapeAttr(getFilterChipTitle("Без категории", emptyRows))}"
    >
      <span class="global-filter-chip-name">Без категории</span>
      <span class="global-filter-chip-count${countToneClass}">${emptyCount}</span>
    </button>`);
  }

  const hasVisibleCategoryButtons = matchedCategories.length > 0 || showEmptyCategoryChip;
  const emptySearchHtml =
    searchQuery && !hasVisibleCategoryButtons
      ? `<div class="global-category-search-empty">Категории не найдены</div>`
      : "";
  el.globalCategoryFilters.innerHTML = chips.join("") + emptySearchHtml;
}

function normalizeCategorySearchQuery(valueRaw) {
  return String(valueRaw || "")
    .trim()
    .toLowerCase()
    .replaceAll("ё", "е");
}

function categoryMatchesSearch(categoryRaw, queryRaw) {
  const query = normalizeCategorySearchQuery(queryRaw);
  if (!query) {
    return true;
  }
  const category = normalizeCategorySearchQuery(categoryRaw);
  return category.includes(query);
}
