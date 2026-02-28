function handleToggleControls() {
  state.controlsCollapsed = !state.controlsCollapsed;
  applyControlsState();
  persistState();
}

function applyControlsState() {
  if (state.controlsCollapsed) {
    el.controlsPanel.classList.add("controls-collapsed");
    if (typeof setStaticButtonIcon === "function") {
      setStaticButtonIcon(el.toggleControlsBtn, "chevronDown", "Показать блок заполнения");
    } else {
      el.toggleControlsBtn.textContent = "Показать блок заполнения";
    }
  } else {
    el.controlsPanel.classList.remove("controls-collapsed");
    if (typeof setStaticButtonIcon === "function") {
      setStaticButtonIcon(el.toggleControlsBtn, "chevronUp", "Скрыть блок заполнения");
    } else {
      el.toggleControlsBtn.textContent = "Скрыть блок заполнения";
    }
  }
}

function handleToggleGlobalFilters() {
  state.globalFiltersCollapsed = !state.globalFiltersCollapsed;
  applyGlobalFiltersState();
  syncGlobalFilterOffset();
  persistState();
}

function handleToggleGlobalCategories() {
  state.globalCategoriesOpen = !state.globalCategoriesOpen;
  applyGlobalCategoriesState();
  syncGlobalFilterOffset();
  persistState();
}

function handleToggleGlobalColumns() {
  state.globalColumnsOpen = !state.globalColumnsOpen;
  applyGlobalColumnsState();
  syncGlobalFilterOffset();
  persistState();
}

function normalizeFilterCountMode(valueRaw) {
  const value = String(valueRaw || "problems")
    .trim()
    .toLowerCase();
  return value === "rows" ? "rows" : "problems";
}

function handleFilterCountModeToggle(event) {
  const mode = event?.target?.checked ? "rows" : "problems";
  const normalized = normalizeFilterCountMode(mode);
  if (state.filterCountMode === normalized) {
    return;
  }
  state.filterCountMode = normalized;
  render();
}

function getActiveGlobalFiltersCount() {
  let active = 0;
  for (const key of Object.keys(FILTER_DEFAULTS)) {
    if (key === "categoryGroup") {
      if (buildCategoryGroupFilterValue(getCategoryGroupSelection(state.filters.categoryGroup)) !== "all") {
        active += 1;
      }
      continue;
    }
    const current = String(state.filters[key] ?? "");
    const initial = String(FILTER_DEFAULTS[key] ?? "");
    if (current !== initial) {
      active += 1;
    }
  }
  if (state.onlyErrors) {
    active += 1;
  }
  if (state.notLoadedOnly) {
    active += 1;
  }
  if (state.autoplayProblemOnly) {
    active += 1;
  }
  if (state.tagsProblemOnly) {
    active += 1;
  }
  if (state.stockPositiveOnly) {
    active += 1;
  }
  return active;
}

function getActiveColumnFiltersCount() {
  const keys = [
    "nmId",
    "cardCode",
    "stockFrom",
    "stockTo",
    "cabinet",
    "name",
    "category",
    "video",
    "recommendations",
    "rich",
    "autoplay",
    "tags",
    "coverDuplicate",
  ];

  let active = 0;
  for (const key of keys) {
    const current = String(state.filters[key] ?? "");
    const initial = String(FILTER_DEFAULTS[key] ?? "");
    if (current !== initial) {
      active += 1;
    }
  }
  return active;
}

function applyGlobalFiltersState() {
  if (!el.globalFiltersFrame || !el.globalFiltersBody) {
    return;
  }

  const collapsed = state.globalFiltersCollapsed === true;
  el.globalFiltersFrame.classList.toggle("is-collapsed", collapsed);
  el.globalFiltersBody.hidden = collapsed;

  if (el.globalFiltersToggleBtn) {
    const label = "Фильтры";
    el.globalFiltersToggleBtn.innerHTML = `${renderIcon(collapsed ? "chevronDown" : "chevronUp", "btn-icon-xs")}<span class="btn-label">${label}</span>`;
  }

  if (el.resetAllFiltersBtn) {
    el.resetAllFiltersBtn.innerHTML = `${renderIcon("x", "btn-icon-xs")}<span class="btn-label">Сбросить</span>`;
  }

  if (el.globalFiltersSummary) {
    const activeCount = getActiveGlobalFiltersCount();
    const filtered = Number(state.pagination.filtered) || 0;
    const total = state.rows.length;
    el.globalFiltersSummary.innerHTML = `<span class="global-filters-summary-chip">Активные фильтры: <span class="global-filters-summary-value">${activeCount}</span></span><span class="global-filters-summary-chip">Показано: <span class="global-filters-summary-value">${filtered} / ${total}</span></span>`;
  }

  state.filterCountMode = normalizeFilterCountMode(state.filterCountMode);
  const isRowsMode = state.filterCountMode === "rows";
  if (el.filterCountModeToggle) {
    el.filterCountModeToggle.checked = isRowsMode;
  }
  if (el.filterCountModeErrorsLabel) {
    el.filterCountModeErrorsLabel.classList.toggle("is-active", !isRowsMode);
  }
  if (el.filterCountModeRowsLabel) {
    el.filterCountModeRowsLabel.classList.toggle("is-active", isRowsMode);
  }

  applyGlobalCategoriesState();
  applyGlobalColumnsState();
}

function applyGlobalCategoriesState() {
  const selected = getCategoryGroupSelection(state.filters.categoryGroup);
  if (el.globalCategoryFilters) {
    el.globalCategoryFilters.hidden = false;
  }
  if (el.globalCategorySummary) {
    if (selected.length === 0) {
      el.globalCategorySummary.textContent = "Все категории";
    } else {
      const labels = selected.map((item) => (item === "__empty__" ? "Без категории" : item));
      const preview = labels.slice(0, 2).join(", ");
      const extra = selected.length > 2 ? ` +${selected.length - 2}` : "";
      el.globalCategorySummary.textContent = `Выбрано: ${preview}${extra}`;
    }
  }
}

function applyGlobalColumnsState() {
  if (el.filtersRow) {
    el.filtersRow.hidden = false;
  }
}

function syncGlobalFilterOffset() {
  const root = document.documentElement;
  if (!root) {
    return;
  }
  if (!el.globalFiltersFrame || !el.globalFiltersFrame.offsetHeight) {
    root.style.setProperty("--global-filter-offset", "0px");
    return;
  }

  const frameRect = el.globalFiltersFrame.getBoundingClientRect();
  const stickyTop = 8;
  const isPinned = frameRect.top <= stickyTop + 1 && frameRect.bottom > stickyTop;
  if (!isPinned) {
    root.style.setProperty("--global-filter-offset", "0px");
    return;
  }

  const offset = Math.max(0, Math.ceil(frameRect.bottom + 8));
  root.style.setProperty("--global-filter-offset", `${offset}px`);
}

function buildSellerSettingsHtml() {
  const settings = getSellerSettings();
  const canManageSellerSettings = typeof hasAdminAccess === "function" ? hasAdminAccess() : true;
  const chips = settings
    .map(
      (seller) => `<div class="seller-chip">
      <span>${escapeHtml(seller.cabinet)}</span>
      <span class="mono">${escapeHtml(seller.supplierId)}</span>
      <a href="${seller.url}" target="_blank" rel="noopener noreferrer">ссылка</a>
    </div>`,
    )
    .join("");

  const addButtonHtml = canManageSellerSettings
    ? `<button
      class="seller-chip seller-chip-action seller-settings-manage-btn"
      type="button"
      data-action="open-sellers-settings"
      data-hint="Добавить кабинет"
      aria-label="Добавить кабинет"
      title="Добавить кабинет"
    >
      <span class="seller-chip-plus" aria-hidden="true">+</span>
    </button>`
    : "";

  return `${chips}
    ${addButtonHtml}`;
}

function getAllCabinets(rows = state.rows, includeSellerSettings = true) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const sellerCabinets = includeSellerSettings
    ? getSellerSettings().map((item) => String(item.cabinet || "").trim())
    : [];
  return Array.from(
    new Set(
      [
        ...sellerCabinets,
        ...sourceRows.map((row) => String(row.cabinet || "").trim()),
      ].filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "ru"));
}

function getAllCategories(rows = state.rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  return Array.from(new Set(sourceRows.map((row) => getRowCategoryLabel(row)).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "ru"),
  );
}

function getRowsByCabinet(rows, cabinetRaw) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const cabinet = String(cabinetRaw || "").trim();
  if (!cabinet || cabinet === "all") {
    return sourceRows;
  }
  if (cabinet === "__empty__") {
    return sourceRows.filter((row) => !String(row?.cabinet || "").trim());
  }
  return sourceRows.filter((row) => String(row.cabinet || "").trim() === cabinet);
}

function getRowCategoryLabel(row) {
  return String(row?.data?.category || "").trim();
}

const CABINET_MULTI_PREFIX = "multi:";

function encodeCabinetFilterToken(valueRaw) {
  return encodeURIComponent(String(valueRaw || "").trim());
}

function decodeCabinetFilterToken(valueRaw) {
  try {
    return decodeURIComponent(String(valueRaw || ""));
  } catch {
    return String(valueRaw || "");
  }
}

function getCabinetFilterSelection(valueRaw) {
  const value = String(valueRaw ?? "all").trim();
  if (!value || value === "all") {
    return [];
  }

  if (value.startsWith(CABINET_MULTI_PREFIX)) {
    const rawItems = value.slice(CABINET_MULTI_PREFIX.length);
    if (!rawItems) {
      return [];
    }
    const decoded = rawItems
      .split(",")
      .map((token) => decodeCabinetFilterToken(token).trim())
      .filter(Boolean);
    return Array.from(new Set(decoded));
  }

  return [value];
}

function buildCabinetFilterValue(valuesRaw) {
  const values = Array.isArray(valuesRaw) ? valuesRaw : [];
  const normalized = Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
  if (normalized.length <= 0) {
    return "all";
  }
  if (normalized.length === 1) {
    return normalized[0];
  }
  const encoded = normalized.map((value) => encodeCabinetFilterToken(value)).join(",");
  return `${CABINET_MULTI_PREFIX}${encoded}`;
}

function normalizeDashboardCabinet(valueRaw, rows = state.rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const selected = getCabinetFilterSelection(valueRaw);
  if (selected.length <= 0) {
    return "all";
  }
  const knownCabinets = new Set(getAllCabinets(sourceRows));
  const normalized = selected.filter((cabinet) => cabinet === "__empty__" || knownCabinets.has(cabinet));
  return buildCabinetFilterValue(normalized);
}

function toggleDashboardCabinetFilter(currentValueRaw, cabinetRaw, rows = state.rows) {
  const cabinet = String(cabinetRaw || "").trim();
  if (!cabinet || cabinet === "all") {
    return "all";
  }

  const normalizedCurrent = normalizeDashboardCabinet(currentValueRaw, rows);
  const selected = new Set(getCabinetFilterSelection(normalizedCurrent));
  if (selected.has(cabinet)) {
    selected.delete(cabinet);
  } else {
    selected.add(cabinet);
  }
  return buildCabinetFilterValue(Array.from(selected));
}

function setDashboardCabinetFilter(valueRaw, options = {}) {
  const toggle = options && options.toggle === true;
  const target = toggle
    ? toggleDashboardCabinetFilter(state.filters.cabinet, valueRaw, state.rows)
    : normalizeDashboardCabinet(valueRaw, state.rows);
  if (target === state.filters.cabinet) {
    return;
  }
  state.filters.cabinet = target;
  state.rowsPage = 1;
  renderFilterInputs();
  render();
}

const CATEGORY_MULTI_PREFIX = "multi:";

function encodeCategoryFilterToken(valueRaw) {
  return encodeURIComponent(String(valueRaw || "").trim());
}

function decodeCategoryFilterToken(valueRaw) {
  try {
    return decodeURIComponent(String(valueRaw || ""));
  } catch {
    return String(valueRaw || "");
  }
}

function getCategoryGroupSelection(valueRaw) {
  const value = String(valueRaw ?? "all").trim();
  if (!value || value === "all") {
    return [];
  }

  if (value.startsWith(CATEGORY_MULTI_PREFIX)) {
    const rawItems = value.slice(CATEGORY_MULTI_PREFIX.length);
    if (!rawItems) {
      return [];
    }
    const decoded = rawItems
      .split(",")
      .map((token) => decodeCategoryFilterToken(token).trim())
      .filter(Boolean);
    return Array.from(new Set(decoded));
  }

  return [value];
}

function buildCategoryGroupFilterValue(valuesRaw) {
  const values = Array.isArray(valuesRaw) ? valuesRaw : [];
  const normalized = Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
  if (normalized.length <= 0) {
    return "all";
  }
  if (normalized.length === 1) {
    return normalized[0];
  }
  const encoded = normalized.map((value) => encodeCategoryFilterToken(value)).join(",");
  return `${CATEGORY_MULTI_PREFIX}${encoded}`;
}

function normalizeCategoryGroupValue(valueRaw, rows = state.rows) {
  const value = String(valueRaw || "all");
  if (value === "all") {
    return "all";
  }

  const categories = getAllCategories(rows);
  const allowed = new Set(categories);
  const hasEmpty = rows.some((row) => !getRowCategoryLabel(row));
  if (hasEmpty) {
    allowed.add("__empty__");
  }

  const selected = getCategoryGroupSelection(value).filter((item) => allowed.has(item));
  return buildCategoryGroupFilterValue(selected);
}

function toggleCategoryGroupFilter(currentValueRaw, categoryRaw, rows = state.rows) {
  const category = String(categoryRaw || "").trim();
  if (!category || category === "all") {
    return "all";
  }

  const normalizedCurrent = normalizeCategoryGroupValue(currentValueRaw, rows);
  const selected = new Set(getCategoryGroupSelection(normalizedCurrent));
  if (selected.has(category)) {
    selected.delete(category);
  } else {
    selected.add(category);
  }
  return buildCategoryGroupFilterValue(Array.from(selected));
}

function setCategoryGroupFilter(valueRaw) {
  const next = normalizeCategoryGroupValue(valueRaw, state.rows);
  if (next === state.filters.categoryGroup) {
    return;
  }
  state.filters.categoryGroup = next;
  state.rowsPage = 1;
  renderFilterInputs();
  render();
}

function getAutoplayLimitForCabinet(cabinetRaw) {
  const cabinet = String(cabinetRaw || "").trim();
  if (!cabinet) {
    return normalizeAutoplayLimit(state.autoplayLimitPerCabinet);
  }

  if (
    state.autoplayLimitByCabinet &&
    Object.prototype.hasOwnProperty.call(state.autoplayLimitByCabinet, cabinet)
  ) {
    return normalizeAutoplayLimit(state.autoplayLimitByCabinet[cabinet]);
  }

  return normalizeAutoplayLimit(state.autoplayLimitPerCabinet);
}

function getTagsLimitForCabinet(cabinetRaw) {
  const cabinet = String(cabinetRaw || "").trim();
  if (!cabinet) {
    return normalizeTagsLimit(state.tagsLimitPerCabinet);
  }

  if (state.tagsLimitByCabinet && Object.prototype.hasOwnProperty.call(state.tagsLimitByCabinet, cabinet)) {
    return normalizeTagsLimit(state.tagsLimitByCabinet[cabinet]);
  }

  return normalizeTagsLimit(state.tagsLimitPerCabinet);
}

function getAutoplayUsageByCabinet(rows = state.rows, cabinetsOverride = null) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const hasOverrides = Array.isArray(cabinetsOverride);
  const normalizedOverrides = hasOverrides
    ? cabinetsOverride
        .map((cabinet) => String(cabinet || "").trim())
        .filter(Boolean)
    : [];
  const cabinets = hasOverrides
    ? Array.from(new Set(normalizedOverrides)).sort((a, b) => a.localeCompare(b, "ru"))
    : getAllCabinets(sourceRows);

  return cabinets.map((cabinet) => {
    const cabinetRows = getRowsByCabinet(sourceRows, cabinet);
    const loadedRows = cabinetRows.filter((row) => row.data && !row.error);
    const autoplayUsed = loadedRows.filter((row) => getAutoplayValue(row.data) === true).length;
    const limit = getAutoplayLimitForCabinet(cabinet);
    const percent = limit > 0 ? (autoplayUsed / limit) * 100 : 0;
    const over = Math.max(0, autoplayUsed - limit);
    const unused = Math.max(0, limit - autoplayUsed);
    const coverageTarget = Math.max(0, Math.min(limit, cabinetRows.length));
    const missingSigned = coverageTarget - autoplayUsed;
    const missing = Math.max(0, missingSigned);

    return {
      cabinet,
      limit,
      hasOverride:
        state.autoplayLimitByCabinet &&
        Object.prototype.hasOwnProperty.call(state.autoplayLimitByCabinet, cabinet),
      totalRows: cabinetRows.length,
      loadedRows: loadedRows.length,
      autoplayUsed,
      percent,
      over,
      unused,
      coverageTarget,
      missingSigned,
      missing,
    };
  });
}

function getTagsUsageByCabinet(rows = state.rows, cabinetsOverride = null) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const hasOverrides = Array.isArray(cabinetsOverride);
  const normalizedOverrides = hasOverrides
    ? cabinetsOverride
        .map((cabinet) => String(cabinet || "").trim())
        .filter(Boolean)
    : [];
  const cabinets = hasOverrides
    ? Array.from(new Set(normalizedOverrides)).sort((a, b) => a.localeCompare(b, "ru"))
    : getAllCabinets(sourceRows);

  return cabinets.map((cabinet) => {
    const cabinetRows = getRowsByCabinet(sourceRows, cabinet);
    const loadedRows = cabinetRows.filter((row) => row.data && !row.error);
    const tagsUsed = loadedRows.filter((row) => getTagsValue(row.data) === true).length;
    const limit = getTagsLimitForCabinet(cabinet);
    const percent = limit > 0 ? (tagsUsed / limit) * 100 : 0;
    const over = Math.max(0, tagsUsed - limit);
    const unused = Math.max(0, limit - tagsUsed);
    const coverageTarget = Math.max(0, Math.min(limit, cabinetRows.length));
    const missingSigned = coverageTarget - tagsUsed;
    const missing = Math.max(0, missingSigned);

    return {
      cabinet,
      limit,
      hasOverride:
        state.tagsLimitByCabinet &&
        Object.prototype.hasOwnProperty.call(state.tagsLimitByCabinet, cabinet),
      totalRows: cabinetRows.length,
      loadedRows: loadedRows.length,
      tagsUsed,
      percent,
      over,
      unused,
      coverageTarget,
      missingSigned,
      missing,
    };
  });
}

function renderAutoplayQuotaPanel() {
  if (!el.autoplayQuotaGrid) {
    return;
  }

  const usage = getAutoplayUsageByCabinet();
  const globalLimit = normalizeAutoplayLimit(state.autoplayLimitPerCabinet);
  const controlsDisabled = state.isBulkLoading;
  if (usage.length === 0) {
    el.autoplayQuotaGrid.innerHTML =
      '<div class="autoplay-quota-empty">Нет данных по кабинетам. Добавьте артикулы и обновите карточки.</div>';
    return;
  }

  const html = usage
    .map((item) => {
      const fill = Math.max(0, Math.min(100, item.percent));
      const toneClass = item.over > 0 ? " is-over" : item.percent >= 80 ? " is-warning" : " is-ok";
      const meta = item.over > 0 ? `Превышение: +${item.over}` : `Доступно: ${item.unused}`;
      const limitValue = item.hasOverride ? String(item.limit) : "";
      const overrideNote = item.hasOverride ? "индивид." : "общий";

      return `<article class="autoplay-quota-card${toneClass}">
        <div class="autoplay-quota-head">
          <span class="autoplay-quota-cabinet">${escapeHtml(item.cabinet)}</span>
          <span class="autoplay-quota-value">${item.autoplayUsed}/${item.limit}</span>
        </div>
        <div class="autoplay-quota-rail">
          <span style="width:${fill.toFixed(2)}%"></span>
        </div>
        <div class="autoplay-quota-footer">
          <p class="autoplay-quota-meta">
            Использовано ${item.percent.toFixed(1)}% · ${escapeHtml(meta)} · загружено ${item.loadedRows}/${item.totalRows}
          </p>
          <label class="autoplay-quota-limit-field">
            <span>Лимит (${overrideNote})</span>
            <input
              type="number"
              min="${AUTOPLAY_LIMIT_MIN}"
              max="${AUTOPLAY_LIMIT_MAX}"
              step="1"
              data-cabinet-limit="${escapeAttr(item.cabinet)}"
              value="${escapeAttr(limitValue)}"
              placeholder="${escapeAttr(String(globalLimit))}"
              ${controlsDisabled ? "disabled" : ""}
            />
          </label>
        </div>
      </article>`;
    })
    .join("");

  el.autoplayQuotaGrid.innerHTML = html;
}

function handleFilterInput(event) {
  const control = event.target.closest("[data-filter-key]");
  if (!control) {
    return;
  }

  const key = control.dataset.filterKey;
  if (!(key in state.filters)) {
    return;
  }

  if (key === "stockFrom" || key === "stockTo") {
    const normalizedStockBoundary = normalizeStockFilterBoundary(control.value);
    state.filters[key] = normalizedStockBoundary;
    if (control.value !== normalizedStockBoundary) {
      control.value = normalizedStockBoundary;
    }
  } else {
    state.filters[key] = String(control.value || "");
  }
  if (
    (key === "recommendations" || key === "autoplay" || key === "video" || key === "tags") &&
    state.filters[key] === "na"
  ) {
    state.filters[key] = "no";
  }

  state.rowsPage = 1;
  if (isChecksFilterKey(key)) {
    applyChecksFilterPopoverState();
  }
  render();
}

function normalizeStockFilterBoundary(valueRaw) {
  const raw = String(valueRaw ?? "").trim();
  if (!raw) {
    return "";
  }

  const parsed = Number(raw.replace(",", "."));
  if (!Number.isFinite(parsed)) {
    return "";
  }
  return String(Math.max(0, Math.floor(parsed)));
}

function renderFilterInputs() {
  for (const control of el.filtersRow.querySelectorAll("[data-filter-key]")) {
    const key = control.dataset.filterKey;
    if (key in state.filters) {
      if (key === "cabinet") {
        const selected = getCabinetFilterSelection(state.filters.cabinet);
        control.value = selected.length === 1 ? selected[0] : "all";
      } else {
        control.value = state.filters[key];
      }
    }
  }
  if (el.globalNmIdQuickInput) {
    const quickSearchValue = String(state.filters.quickSearch || "");
    if (el.globalNmIdQuickInput.value !== quickSearchValue) {
      el.globalNmIdQuickInput.value = quickSearchValue;
    }
  }
  applyChecksFilterPopoverState();
}

function isChecksFilterKey(key) {
  return (
    key === "video" ||
    key === "recommendations" ||
    key === "rich" ||
    key === "autoplay" ||
    key === "tags" ||
    key === "coverDuplicate"
  );
}

function getActiveChecksFiltersCount() {
  const keys = ["video", "recommendations", "rich", "autoplay", "tags", "coverDuplicate"];
  let active = 0;
  for (const key of keys) {
    const current = String(state.filters[key] ?? "");
    const initial = String(FILTER_DEFAULTS[key] ?? "");
    if (current !== initial) {
      active += 1;
    }
  }
  return active;
}

function applyChecksFilterPopoverState() {
  if (!el.checksFiltersToggle || !el.checksFiltersPanel) {
    return;
  }

  const activeCount = getActiveChecksFiltersCount();
  const expanded = state.checksFiltersOpen === true;
  const label = activeCount > 0 ? `Фильтр (${activeCount})` : "Фильтр";
  el.checksFiltersToggle.innerHTML = `<span class="checks-filter-toggle-main">${renderIcon(
    "filter",
    "checks-filter-main-icon",
  )}<span>${escapeHtml(label)}</span></span>${renderIcon(
    expanded ? "chevronUp" : "chevronDown",
    "checks-filter-toggle-icon",
  )}`;
  el.checksFiltersToggle.classList.toggle("is-active", expanded || activeCount > 0);
  el.checksFiltersToggle.setAttribute("aria-expanded", String(expanded));
  el.checksFiltersPanel.hidden = !expanded;
}

function toggleChecksFiltersPopover(forceOpen = null) {
  const next = forceOpen === null ? !state.checksFiltersOpen : Boolean(forceOpen);
  if (state.checksFiltersOpen === next) {
    return;
  }
  state.checksFiltersOpen = next;
  applyChecksFilterPopoverState();
  persistState();
}

function renderCabinetFilterOptions() {
  const currentValue = normalizeDashboardCabinet(state.filters.cabinet, state.rows);
  const selectedCabinets = getCabinetFilterSelection(currentValue);
  const cabinets = Array.from(
    new Set(
      [
        ...getSellerSettings().map((item) => item.cabinet),
        ...state.rows.map((row) => String(row.cabinet || "").trim()).filter(Boolean),
      ].filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "ru"));

  const options = [
    { value: "all", label: "Кабинет" },
    ...cabinets.map((cabinet) => ({ value: cabinet, label: cabinet })),
    { value: "__empty__", label: "Без кабинета" },
  ];

  el.filterCabinet.innerHTML = options
    .map((option) => `<option value="${escapeAttr(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");

  state.filters.cabinet = currentValue;
  const selectValue = selectedCabinets.length === 1 ? selectedCabinets[0] : "all";
  const hasSelectValue = options.some((option) => option.value === selectValue);
  el.filterCabinet.value = hasSelectValue ? selectValue : "all";
}

function handleAddSingle() {
  if (typeof hasAdminAccess === "function" && !hasAdminAccess()) {
    window.alert("Добавление товаров доступно только администратору.");
    return;
  }

  const raw = el.singleInput.value.trim();
  const nmId = extractNmId(raw);

  if (!nmId) {
    window.alert("Введите артикул WB или ссылку на карточку.");
    return;
  }

  upsertRowsFromNmIds([nmId]);
  el.singleInput.value = "";
  render();
}
