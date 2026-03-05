const STORAGE_KEY = "wb-dashboard-v2";
const AUTH_FETCH_TIMEOUT_MS = 9000;
const AUTH_LOGIN_FETCH_TIMEOUT_MS = 35000;
const AUTH_ENDPOINTS = Object.freeze({
  login: "/api/auth/login",
  me: "/api/auth/me",
  logout: "/api/auth/logout",
});
const BASKET_START = 1;
const BASKET_END = 80;
const BULK_CONCURRENCY = 2;
const RECOMMENDATION_ITEMS_LIMIT = 20;
const RECOMMENDATION_SLIDES_PER_ITEM = 4;
const RECOMMENDATION_IDS_LIST_LIMIT = 200;
const FETCH_RETRY_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 12000;
const FETCH_RETRY_BASE_DELAY_MS = 450;
const FETCH_RETRY_MAX_DELAY_MS = 8000;
const HOST_PROBE_PAUSE_MS = 25;
const FAST_CARD_FETCH_TIMEOUT_MS = 5200;
const FAST_RICH_FETCH_TIMEOUT_MS = 3400;
const FAST_HOST_PROBE_TIMEOUT_MS = 1800;
const FAST_HOST_PROBE_ATTEMPTS = 1;
const HOVER_ZOOM_MARGIN = 12;
const HOVER_ZOOM_FIXED_WIDTH = 280;
const HOVER_ZOOM_FIXED_HEIGHT = 380;
const BREAK_TOOLTIP_OFFSET_X = 14;
const BREAK_TOOLTIP_OFFSET_Y = 16;
const LISTING_GRID_COLUMNS = 10;
const LISTING_GRID_ROWS = 3;
const LISTING_MAX_SLIDES = LISTING_GRID_COLUMNS * LISTING_GRID_ROWS;
const ROWS_LIMIT_DEFAULT = 50;
const ROWS_LIMIT_MAX = 300;
const AUTOPLAY_LIMIT_DEFAULT = 50;
const TAGS_LIMIT_DEFAULT = 60;
const AUTOPLAY_LIMIT_MIN = 1;
const AUTOPLAY_LIMIT_MAX = 500;
const SELLER_SETTINGS_LIMIT = 80;
const COLOR_VARIANT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const TABLE_COLUMNS = 8;
const DUPLICATE_CHECK_TIMEOUT_MS = 9000;
const ICON_HINT_DELAY_MS = 450;
const UPDATE_LOG_LIMIT = 240;
const CLOUD_SAVE_LOGS_PER_ROW = 100;
const PROBLEM_SNAPSHOT_LIMIT = 4000;
const BULK_TOAST_HIDE_DELAY_MS = 1400;
const BULK_ACTION_LABELS = {
  all: "Обновить",
  scheduled: "Фоновое обновление",
};

const DEFAULT_SELLER_SETTINGS = [
  {
    supplierId: "233776",
    cabinet: "Паша 1",
    url: "https://www.wildberries.ru/seller/233776",
  },
  {
    supplierId: "372556",
    cabinet: "Стас 1",
    url: "https://www.wildberries.ru/seller/372556",
  },
  {
    supplierId: "250027557",
    cabinet: "Паша 2",
    url: "https://www.wildberries.ru/seller/250027557",
  },
  {
    supplierId: "250067050",
    cabinet: "Стас 2",
    url: "https://www.wildberries.ru/seller/250067050",
  },
];

const FILTER_DEFAULTS = {
  quickSearch: "",
  nmId: "",
  cardCode: "",
  stockFrom: "",
  stockTo: "",
  cabinet: "all",
  categoryGroup: "all",
  name: "",
  category: "",
  video: "all",
  recommendations: "all",
  rich: "all",
  autoplay: "all",
  tags: "all",
  coverDuplicate: "all",
};

const PRESET_FILTERS = [
  { id: "problemRows", label: "Только ошибки выгрузки" },
  { id: "notLoaded", label: "Не загруженные" },
  { id: "stockPositive", label: "Товары с остатками" },
  { id: "recommendationsNo", label: "Рекомендации: нет" },
  { id: "richNo", label: "Рич: нет" },
  { id: "videoNo", label: "Видео: нет" },
  { id: "autoplayNo", label: "Автоплей: нет" },
  { id: "tagsNo", label: "Тэги: нет" },
  { id: "coverDuplicate", label: "Дубль обложки: да" },
];

const ICON_LIBRARY = {
  refresh: {
    paths: [
      "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
      "M21 3v5h-5",
      "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
      "M3 21v-5h5",
    ],
  },
  trash: {
    paths: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6", "M10 11v6", "M14 11v6"],
  },
  check: {
    paths: ["M20 6 9 17 4 12"],
  },
  alert: {
    paths: ["M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0", "M12 9v4", "M12 17h.01"],
  },
  loader: {
    paths: ["M12 2v4", "M12 18v4", "M4.93 4.93l2.83 2.83", "M16.24 16.24l2.83 2.83", "M2 12h4", "M18 12h4", "M4.93 19.07l2.83-2.83", "M16.24 7.76l2.83-2.83"],
  },
  clock: {
    paths: ["M12 6v6l4 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"],
  },
  settings: {
    paths: ["M4 6h6", "M14 6h6", "M10 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0", "M4 18h10", "M18 18h2", "M18 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0"],
  },
  externalLink: {
    paths: ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"],
  },
  chevronLeft: {
    paths: ["m15 18-6-6 6-6"],
  },
  chevronRight: {
    paths: ["m9 18 6-6-6-6"],
  },
  chevronDown: {
    paths: ["m6 9 6 6 6-6"],
  },
  chevronUp: {
    paths: ["m18 15-6-6-6 6"],
  },
  x: {
    paths: ["M18 6 6 18", "M6 6l12 12"],
  },
  filter: {
    paths: ["M22 3H2l8 9v6l4 3v-9z"],
  },
  dashboard: {
    paths: ["M3 3h8v8H3z", "M13 3h8v5h-8z", "M13 10h8v11h-8z", "M3 13h8v8H3z"],
  },
  clipboardCheck: {
    paths: ["M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2", "M9 3h6v4H9z", "m9 14 2 2 4-4"],
  },
  chartLine: {
    paths: ["M3 3v18h18", "m7 14 4-4 3 3 4-6"],
  },
  download: {
    paths: ["M12 3v12", "m7 10 5 5 5-5", "M5 21h14"],
  },
  eye: {
    paths: [
      "M2.05 12a10.95 10.95 0 0 1 19.9 0 10.95 10.95 0 0 1-19.9 0",
      "M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0",
    ],
  },
  eyeOff: {
    paths: [
      "M4.5 4.5 19.5 19.5",
      "M9.9 5.2A10.7 10.7 0 0 1 21.95 12a10.95 10.95 0 0 1-3.02 3.96",
      "M14.1 18.8A10.7 10.7 0 0 1 2.05 12a10.95 10.95 0 0 1 3.02-3.96",
      "M10.6 10.6a2 2 0 0 0 2.8 2.8",
    ],
  },
  logOut: {
    paths: [
      "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",
      "M16 17l5-5-5-5",
      "M21 12H9",
      "M16 12h-1",
    ],
  },
};

const state = {
  auth: {
    isAuthenticated: false,
    role: "guest",
    login: "",
  },
  rows: [],
  basketByVol: {},
  filters: { ...FILTER_DEFAULTS },
  isBulkLoading: false,
  lastSyncAt: null,
  activePage: "cards",
  controlsCollapsed: false,
  rowsLimit: ROWS_LIMIT_DEFAULT,
  rowsPage: 1,
  onlyErrors: false,
  notLoadedOnly: false,
  checksFiltersOpen: false,
  globalFiltersCollapsed: true,
  globalCategoriesOpen: false,
  categorySearchQuery: "",
  globalColumnsOpen: false,
  autoplayProblemOnly: false,
  tagsProblemOnly: false,
  stockPositiveOnly: false,
  tableSortMetric: "default",
  tableSortDirection: "asc",
  autoplayLimitPerCabinet: AUTOPLAY_LIMIT_DEFAULT,
  autoplayLimitByCabinet: {},
  tagsLimitPerCabinet: TAGS_LIMIT_DEFAULT,
  tagsLimitByCabinet: {},
  sellerSettings: [],
  colorVariantsCache: {},
  updateSnapshots: [],
  chartCabinetFilter: "all",
  filterCountMode: "problems",
  bulkCancelRequested: false,
  singleRowAbortController: null,
  rowHistoryHideNoChanges: false,
  bulkProgress: {
    active: false,
    actionKey: "all",
    loadingText: "",
    total: 0,
    completed: 0,
    startedAt: 0,
    hideTimer: 0,
    tickTimer: 0,
    singleEstimateMs: 10000,
    lastSingleDurationMs: 0,
    etaAnchorAt: 0,
    etaAnchorMs: NaN,
    etaCheckpointCompleted: 0,
    finalState: "idle",
    cancelRequested: false,
  },
  pagination: {
    filtered: 0,
    visible: 0,
    totalPages: 1,
  },
};

const hoverZoom = {
  root: null,
  image: null,
  activeThumb: null,
};

const breakTooltip = {
  root: null,
  text: null,
  activeSegment: null,
};

const iconHintTooltip = {
  root: null,
  text: null,
  target: null,
  timer: 0,
};

const previewGallery = {
  items: [],
  currentIndex: 0,
  titlePrefix: "",
  rowId: "",
};

const richGallery = {
  items: [],
  currentIndex: 0,
  scrollRaf: 0,
  titlePrefix: "",
};

const el = {
  mainView: document.getElementById("mainView"),
  cardsPage: document.getElementById("cardsPage"),
  abTestsPage: document.getElementById("abTestsPage"),
  switchToCardsPageBtn: document.getElementById("switchToCardsPageBtn"),
  switchToAbPageBtn: document.getElementById("switchToAbPageBtn"),
  abTestsRefreshBtn: document.getElementById("abTestsRefreshBtn"),
  abTestsContent: document.getElementById("abTestsContent"),
  abTestsMetaLine: document.getElementById("abTestsMetaLine"),
  startupLoading: document.getElementById("startupLoading"),
  startupLoadingText: document.getElementById("startupLoadingText"),
  authGate: document.getElementById("authGate"),
  authForm: document.getElementById("authForm"),
  authLoginInput: document.getElementById("authLoginInput"),
  authPasswordInput: document.getElementById("authPasswordInput"),
  authPasswordToggleBtn: document.getElementById("authPasswordToggleBtn"),
  authStatus: document.getElementById("authStatus"),
  authRoleBadge: document.getElementById("authRoleBadge"),
  authUserLabel: document.getElementById("authUserLabel"),
  logoutBtn: document.getElementById("logoutBtn"),
  agreementDashboardMain: document.getElementById("agreementDashboardMain"),
  globalFiltersFrame: document.getElementById("globalFiltersFrame"),
  globalFiltersBody: document.getElementById("globalFiltersBody"),
  globalFiltersToggleBtn: document.getElementById("globalFiltersToggleBtn"),
  globalFiltersSummary: document.getElementById("globalFiltersSummary"),
  filterCountModeToggle: document.getElementById("filterCountModeToggle"),
  filterCountModeErrorsLabel: document.getElementById("filterCountModeErrorsLabel"),
  filterCountModeRowsLabel: document.getElementById("filterCountModeRowsLabel"),
  globalNmIdQuickInput: document.getElementById("globalNmIdQuickInput"),
  globalCategorySummary: document.getElementById("globalCategorySummary"),
  globalCategorySearchInput: document.getElementById("globalCategorySearchInput"),
  globalCabinetFilters: document.getElementById("globalCabinetFilters"),
  globalCategoryFilters: document.getElementById("globalCategoryFilters"),
  presetFilters: document.getElementById("presetFilters"),
  resetAllFiltersBtn: document.getElementById("resetAllFiltersBtn"),
  controlsPanel: document.getElementById("controlsPanel"),
  controlsBody: document.getElementById("controlsBody"),
  toggleControlsBtn: document.getElementById("toggleControlsBtn"),
  autoplayLimitInput: document.getElementById("autoplayLimitInput"),
  autoplayQuotaGrid: document.getElementById("autoplayQuotaGrid"),
  singleInput: document.getElementById("singleInput"),
  bulkInput: document.getElementById("bulkInput"),
  addSingleBtn: document.getElementById("addSingleBtn"),
  addBulkBtn: document.getElementById("addBulkBtn"),
  loadAllBtn: document.getElementById("loadAllBtn"),
  downloadExportBtn: document.getElementById("downloadExportBtn"),
  clearBtn: document.getElementById("clearBtn"),
  filtersRow: document.getElementById("filtersRow"),
  filterNmId: document.getElementById("filterNmId"),
  filterCabinet: document.getElementById("filterCabinet"),
  rowsLimitSelect: document.getElementById("rowsLimitSelect"),
  tableSortMetricSelect: document.getElementById("tableSortMetricSelect"),
  tableSortDirectionSelect: document.getElementById("tableSortDirectionSelect"),
  checksFiltersToggle: document.getElementById("checksFiltersToggle"),
  checksFiltersPanel: document.getElementById("checksFiltersPanel"),
  pagePrevBtn: document.getElementById("pagePrevBtn"),
  pageNextBtn: document.getElementById("pageNextBtn"),
  pageInfo: document.getElementById("pageInfo"),
  rowsBody: document.getElementById("rowsBody"),
  summaryLine: document.getElementById("summaryLine"),
  lastSyncLine: document.getElementById("lastSyncLine"),
  problemLine: document.getElementById("problemLine"),
  errorDetailsBtn: document.getElementById("errorDetailsBtn"),
  bulkProgressToast: document.getElementById("bulkProgressToast"),
  bulkProgressRing: document.getElementById("bulkProgressRing"),
  bulkProgressPercent: document.getElementById("bulkProgressPercent"),
  bulkProgressTitle: document.getElementById("bulkProgressTitle"),
  bulkProgressMeta: document.getElementById("bulkProgressMeta"),
  bulkCancelBtn: document.getElementById("bulkCancelBtn"),
  previewModal: document.getElementById("previewModal"),
  previewImage: document.getElementById("previewImage"),
  previewCaption: document.getElementById("previewCaption"),
  previewRefreshBtn: document.getElementById("previewRefreshBtn"),
  previewCloseBtn: document.getElementById("previewCloseBtn"),
  previewPrevBtn: document.getElementById("previewPrevBtn"),
  previewNextBtn: document.getElementById("previewNextBtn"),
  previewThumbs: document.getElementById("previewThumbs"),
  recommendationsModal: document.getElementById("recommendationsModal"),
  recommendationsTitle: document.getElementById("recommendationsTitle"),
  recommendationsSubtle: document.getElementById("recommendationsSubtle"),
  recommendationsContent: document.getElementById("recommendationsContent"),
  recommendationsRefreshBtn: document.getElementById("recommendationsRefreshBtn"),
  recommendationsCloseBtn: document.getElementById("recommendationsCloseBtn"),
  richModal: document.getElementById("richModal"),
  richCaption: document.getElementById("richCaption"),
  richContent: document.getElementById("richContent"),
  richRefreshBtn: document.getElementById("richRefreshBtn"),
  richCloseBtn: document.getElementById("richCloseBtn"),
  limitsModal: document.getElementById("limitsModal"),
  limitsCloseBtn: document.getElementById("limitsCloseBtn"),
  limitsContent: document.getElementById("limitsContent"),
  sellersModal: document.getElementById("sellersModal"),
  sellersCloseBtn: document.getElementById("sellersCloseBtn"),
  sellersContent: document.getElementById("sellersContent"),
  rowHistoryModal: document.getElementById("rowHistoryModal"),
  rowHistoryCloseBtn: document.getElementById("rowHistoryCloseBtn"),
  rowHistoryChangesFilterBtn: document.getElementById("rowHistoryChangesFilterBtn"),
  rowHistoryTitle: document.getElementById("rowHistoryTitle"),
  rowHistorySubtle: document.getElementById("rowHistorySubtle"),
  rowHistoryContent: document.getElementById("rowHistoryContent"),
  problemsChartModal: document.getElementById("problemsChartModal"),
  problemsChartCloseBtn: document.getElementById("problemsChartCloseBtn"),
  problemsChartCabinetFilter: document.getElementById("problemsChartCabinetFilter"),
  problemsChartContent: document.getElementById("problemsChartContent"),
};

init().catch(() => {
  setStartupLoading(false);
});

async function init() {
  setStartupLoading(true, "Проверяю доступ…");
  await restoreAuthState();
  setStartupLoading(true, "Загружаю данные…");
  await restoreState();
  state.sellerSettings = normalizeSellerSettings(state.sellerSettings);
  state.colorVariantsCache = normalizeColorVariantCache(state.colorVariantsCache);
  hydrateStaticIcons();
  bindEvents();
  applyAuthState();
  applyControlsState();
  renderCabinetFilterOptions();
  renderFilterInputs();
  applyAutoplayLimitControl();
  applyTagsLimitControl();
  applyRowsLimitControl();
  applyTableSortControls();
  applyActivePage({ ensureLoad: false });
  render();
  applyActivePage({ ensureLoad: true });
  if (typeof ensureProblemSnapshotsInitialized === "function") {
    ensureProblemSnapshotsInitialized();
  }
  if (typeof initShadowUpdateScheduler === "function") {
    initShadowUpdateScheduler();
  }
  registerServiceWorker();
  setStartupLoading(false);
}

function renderIcon(name, className = "") {
  const icon = ICON_LIBRARY[name] || ICON_LIBRARY.externalLink;
  const classAttr = className ? ` ${className}` : "";
  const paths = icon.paths.map((path) => `<path d="${path}"></path>`).join("");
  return `<svg class="ui-icon${classAttr}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function setStaticButtonIcon(button, iconName, label = null) {
  if (!button) {
    return;
  }

  const buttonLabel = typeof label === "string" ? label.trim() : "";
  button.innerHTML = `${renderIcon(iconName)}${buttonLabel ? `<span class="btn-label">${escapeHtml(buttonLabel)}</span>` : ""}`;
}

function hydrateStaticIcons() {
  setStaticButtonIcon(el.pagePrevBtn, "chevronLeft");
  setStaticButtonIcon(el.pageNextBtn, "chevronRight");
  setStaticButtonIcon(el.previewPrevBtn, "chevronLeft");
  setStaticButtonIcon(el.previewNextBtn, "chevronRight");
  setStaticButtonIcon(el.logoutBtn, "logOut");
  setStaticButtonIcon(el.loadAllBtn, "refresh", "Обновить");
  if (el.switchToCardsPageBtn) {
    setStaticButtonIcon(el.switchToCardsPageBtn, "dashboard", "Карточки");
  }
  if (el.switchToAbPageBtn) {
    setStaticButtonIcon(el.switchToAbPageBtn, "chartLine", "AB-тесты");
  }
  setStaticButtonIcon(
    el.toggleControlsBtn,
    state.controlsCollapsed ? "chevronDown" : "chevronUp",
    state.controlsCollapsed ? "Развернуть" : "Свернуть",
  );
  setStaticButtonIcon(el.downloadExportBtn, "download", "Скачать .xlsx");
  if (el.abTestsRefreshBtn) {
    setStaticButtonIcon(el.abTestsRefreshBtn, "refresh", "Обновить данные");
  }
  syncAuthPasswordToggleIcon();
}

function createGuestAuthState() {
  return {
    isAuthenticated: false,
    role: "guest",
    login: "",
  };
}

function normalizeAuthRole(roleRaw) {
  const role = String(roleRaw || "")
    .trim()
    .toLowerCase();
  if (role === "admin") {
    return "admin";
  }
  if (role === "user") {
    return "user";
  }
  return "guest";
}

function normalizeAuthLogin(loginRaw) {
  return String(loginRaw || "")
    .trim()
    .toLowerCase()
    .slice(0, 60);
}

function isAuthenticated() {
  return state.auth?.isAuthenticated === true && normalizeAuthRole(state.auth?.role) !== "guest";
}

function hasAdminAccess() {
  return isAuthenticated() && normalizeAuthRole(state.auth?.role) === "admin";
}

function ensureAdminAccess(actionName = "Это действие") {
  if (hasAdminAccess()) {
    return true;
  }
  window.alert(`${actionName} доступно только администратору.`);
  return false;
}

function normalizeAuthUser(userRaw) {
  if (!userRaw || typeof userRaw !== "object") {
    return null;
  }

  const login = normalizeAuthLogin(userRaw.login);
  const role = normalizeAuthRole(userRaw.role);
  if (!login || (role !== "admin" && role !== "user")) {
    return null;
  }

  return { login, role };
}

function getAuthEndpointUrl(pathRaw) {
  const path = String(pathRaw || "").trim();
  const fallbackPath = AUTH_ENDPOINTS.me;
  const endpoint = path || fallbackPath;
  return new URL(endpoint, window.location.origin).toString();
}

async function runAuthRequest(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const bodyPayload = options.body && typeof options.body === "object" ? options.body : null;
  const timeoutMs = Math.max(
    1000,
    Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : AUTH_FETCH_TIMEOUT_MS,
  );
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {};
    if (bodyPayload) {
      headers["content-type"] = "application/json";
    }

    const response = await fetch(getAuthEndpointUrl(path), {
      method,
      headers,
      body: bodyPayload ? JSON.stringify(bodyPayload) : null,
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  } catch (error) {
    const errorKind = error?.name === "AbortError" ? "timeout" : "network";
    return {
      ok: false,
      status: 0,
      data: null,
      errorKind,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function applyAuthenticatedUser(userRaw) {
  const user = normalizeAuthUser(userRaw);
  if (!user) {
    state.auth = createGuestAuthState();
    return false;
  }

  state.auth = {
    isAuthenticated: true,
    role: user.role,
    login: user.login,
  };
  return true;
}

async function restoreAuthState() {
  const response = await runAuthRequest(AUTH_ENDPOINTS.me, { method: "GET" });
  if (!response.ok) {
    state.auth = createGuestAuthState();
    return;
  }

  const payload = response.data && typeof response.data === "object" ? response.data : null;
  const user = payload?.user;
  if (!applyAuthenticatedUser(user)) {
    state.auth = createGuestAuthState();
  }
}

async function syncStateAfterAuth() {
  setStartupLoading(true, "Загружаю данные…");
  try {
    await restoreState({ preferRemote: true });
    state.sellerSettings = normalizeSellerSettings(state.sellerSettings);
    state.colorVariantsCache = normalizeColorVariantCache(state.colorVariantsCache);
    renderCabinetFilterOptions();
    renderFilterInputs();
    applyAutoplayLimitControl();
    applyTagsLimitControl();
    applyRowsLimitControl();
    applyTableSortControls();
    applyActivePage({ ensureLoad: false });
    render();
    applyActivePage({ ensureLoad: true });
  } finally {
    setStartupLoading(false);
  }
}

function setStartupLoading(isActive, text = "Загружаю данные…") {
  if (!el.startupLoading) {
    return;
  }
  if (el.startupLoadingText) {
    el.startupLoadingText.textContent = String(text || "Загружаю данные…").trim() || "Загружаю данные…";
  }
  el.startupLoading.hidden = isActive !== true;
  el.startupLoading.setAttribute("aria-busy", isActive === true ? "true" : "false");
}

function normalizeActivePage(valueRaw) {
  const value = String(valueRaw || "")
    .trim()
    .toLowerCase();
  return value === "ab" || value === "ab-tests" ? "ab-tests" : "cards";
}

function applyActivePage(options = {}) {
  const shouldEnsureLoad = options && options.ensureLoad === true;
  const activePage = normalizeActivePage(state.activePage);
  state.activePage = activePage;
  const isAbPage = activePage === "ab-tests";

  if (el.cardsPage) {
    el.cardsPage.hidden = isAbPage;
  }
  if (el.abTestsPage) {
    el.abTestsPage.hidden = !isAbPage;
  }

  if (el.switchToCardsPageBtn) {
    el.switchToCardsPageBtn.classList.toggle("is-active", !isAbPage);
    el.switchToCardsPageBtn.setAttribute("aria-selected", !isAbPage ? "true" : "false");
  }
  if (el.switchToAbPageBtn) {
    el.switchToAbPageBtn.classList.toggle("is-active", isAbPage);
    el.switchToAbPageBtn.setAttribute("aria-selected", isAbPage ? "true" : "false");
  }

  if (isAbPage && shouldEnsureLoad && typeof ensureAbDashboardLoaded === "function") {
    ensureAbDashboardLoaded();
  }

  if (typeof syncGlobalFilterOffset === "function") {
    requestAnimationFrame(syncGlobalFilterOffset);
  }
}

function setActivePage(pageRaw, options = {}) {
  const nextPage = normalizeActivePage(pageRaw);
  const changed = nextPage !== state.activePage;
  state.activePage = nextPage;
  applyActivePage({ ensureLoad: true });

  if (changed && options && options.persist === true) {
    persistState();
  }
}

function getAuthErrorMessage(response, fallback) {
  if (Number(response?.status) === 0) {
    if (response?.errorKind === "timeout") {
      return "Сервер долго отвечает. Попробуйте снова через 5–10 секунд.";
    }
    return "Ошибка сети при входе. Проверьте соединение и попробуйте снова.";
  }
  const payload = response?.data;
  const errorText = payload && typeof payload === "object" ? String(payload.error || "").trim() : "";
  return errorText || fallback;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const login = normalizeAuthLogin(el.authLoginInput?.value);
  const password = String(el.authPasswordInput?.value || "").trim();

  if (!login || !password) {
    window.alert("Введите логин и пароль.");
    return;
  }

  const response = await runAuthRequest(AUTH_ENDPOINTS.login, {
    method: "POST",
    body: { login, password },
    timeoutMs: AUTH_LOGIN_FETCH_TIMEOUT_MS,
  });

  if (!response.ok) {
    window.alert(getAuthErrorMessage(response, "Неверный логин или пароль."));
    if (el.authPasswordInput) {
      el.authPasswordInput.value = "";
      el.authPasswordInput.focus();
    }
    return;
  }

  const user = response.data && typeof response.data === "object" ? response.data.user : null;
  if (!applyAuthenticatedUser(user)) {
    window.alert("Не удалось определить пользователя после входа.");
    return;
  }

  if (el.authPasswordInput) {
    el.authPasswordInput.value = "";
  }
  applyAuthState({ focusLogin: false });
  await syncStateAfterAuth();
}

function getAuthRoleLabel() {
  return hasAdminAccess() ? "Админ" : "Пользователь";
}

function applyRoleAccessState() {
  const canManageRows = hasAdminAccess();
  const bulkField = el.bulkInput ? el.bulkInput.closest(".field") : null;
  const singleField = el.singleInput ? el.singleInput.closest(".field") : null;
  const controlsSubtle = el.controlsPanel ? el.controlsPanel.querySelector(".controls-subtle") : null;

  if (bulkField) {
    bulkField.hidden = !canManageRows;
  }
  if (singleField) {
    singleField.hidden = !canManageRows;
  }

  if (el.bulkInput) {
    el.bulkInput.disabled = !canManageRows;
  }
  if (el.singleInput) {
    el.singleInput.disabled = !canManageRows;
  }
  if (el.addSingleBtn) {
    el.addSingleBtn.hidden = !canManageRows;
    el.addSingleBtn.disabled = !canManageRows;
  }
  if (el.addBulkBtn) {
    el.addBulkBtn.hidden = !canManageRows;
    el.addBulkBtn.disabled = !canManageRows;
  }
  if (el.clearBtn) {
    el.clearBtn.hidden = !canManageRows;
    el.clearBtn.disabled = !canManageRows;
  }
  if (el.controlsBody) {
    el.controlsBody.hidden = !canManageRows;
  }
  if (el.toggleControlsBtn) {
    el.toggleControlsBtn.hidden = !canManageRows;
    el.toggleControlsBtn.disabled = !canManageRows;
  }
  if (controlsSubtle) {
    controlsSubtle.hidden = !canManageRows;
  }
}

function applyAuthState(options = {}) {
  const focusLogin = options.focusLogin !== false;
  const loggedIn = isAuthenticated();

  if (el.mainView) {
    el.mainView.hidden = !loggedIn;
  }
  if (el.authGate) {
    el.authGate.hidden = loggedIn;
  }
  if (el.authStatus) {
    el.authStatus.hidden = !loggedIn;
  }
  if (el.authRoleBadge) {
    el.authRoleBadge.textContent = getAuthRoleLabel();
    el.authRoleBadge.classList.toggle("is-admin", hasAdminAccess());
    el.authRoleBadge.classList.toggle("is-user", !hasAdminAccess());
  }
  if (el.authUserLabel) {
    el.authUserLabel.textContent = loggedIn ? normalizeAuthLogin(state.auth?.login) : "";
  }

  applyRoleAccessState();
  syncAuthPasswordToggleIcon();

  if (!loggedIn && focusLogin && el.authLoginInput) {
    el.authLoginInput.focus();
  }
}

function syncAuthPasswordToggleIcon() {
  if (!el.authPasswordToggleBtn || !el.authPasswordInput) {
    return;
  }
  const isVisible = el.authPasswordInput.type === "text";
  setStaticButtonIcon(el.authPasswordToggleBtn, isVisible ? "eyeOff" : "eye");
  el.authPasswordToggleBtn.setAttribute("aria-pressed", String(isVisible));
  el.authPasswordToggleBtn.setAttribute("aria-label", isVisible ? "Скрыть пароль" : "Показать пароль");
  el.authPasswordToggleBtn.setAttribute("title", isVisible ? "Скрыть пароль" : "Показать пароль");
}

function handleToggleAuthPasswordVisibility() {
  if (!el.authPasswordInput) {
    return;
  }
  const nextType = el.authPasswordInput.type === "text" ? "password" : "text";
  el.authPasswordInput.type = nextType;
  syncAuthPasswordToggleIcon();
  el.authPasswordInput.focus();
}

async function handleLogout() {
  await runAuthRequest(AUTH_ENDPOINTS.logout, { method: "POST" });
  state.auth = createGuestAuthState();
  applyAuthState({ focusLogin: true });
  render();
}

function handleAuthRequired() {
  if (!isAuthenticated()) {
    return;
  }
  state.auth = createGuestAuthState();
  applyAuthState({ focusLogin: true });
  render();
  window.alert("Сессия истекла. Выполните вход снова.");
}

function bindEvents() {
  if (el.authForm) {
    el.authForm.addEventListener("submit", handleAuthSubmit);
  }
  if (el.authPasswordToggleBtn) {
    el.authPasswordToggleBtn.addEventListener("click", handleToggleAuthPasswordVisibility);
  }
  if (el.switchToCardsPageBtn) {
    el.switchToCardsPageBtn.addEventListener("click", () => setActivePage("cards", { persist: true }));
  }
  if (el.switchToAbPageBtn) {
    el.switchToAbPageBtn.addEventListener("click", () => setActivePage("ab-tests", { persist: true }));
  }
  if (el.abTestsRefreshBtn) {
    el.abTestsRefreshBtn.addEventListener("click", () => {
      if (typeof refreshAbDashboardData === "function") {
        refreshAbDashboardData();
      }
    });
  }
  if (el.logoutBtn) {
    el.logoutBtn.addEventListener("click", handleLogout);
  }
  window.addEventListener("wb-auth-required", handleAuthRequired);

  if (el.addSingleBtn) {
    el.addSingleBtn.addEventListener("click", handleAddSingle);
  }
  el.addBulkBtn.addEventListener("click", handleAddBulk);
  el.loadAllBtn.addEventListener("click", handleLoadAll);
  if (el.downloadExportBtn) {
    el.downloadExportBtn.addEventListener("click", handleDownloadExport);
  }
  if (el.clearBtn) {
    el.clearBtn.addEventListener("click", handleClear);
  }
  el.toggleControlsBtn.addEventListener("click", handleToggleControls);
  if (el.errorDetailsBtn) {
    el.errorDetailsBtn.addEventListener("click", handleShowErrorsReport);
  }
  if (el.bulkCancelBtn) {
    el.bulkCancelBtn.addEventListener("click", handleBulkCancel);
  }

  if (el.singleInput) {
    el.singleInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleAddSingle();
      }
    });
  }

  el.filtersRow.addEventListener("input", handleFilterInput);
  el.filtersRow.addEventListener("change", handleFilterInput);
  if (el.globalNmIdQuickInput) {
    el.globalNmIdQuickInput.addEventListener("input", handleFilterInput);
    el.globalNmIdQuickInput.addEventListener("change", handleFilterInput);
  }
  if (el.filterCountModeToggle) {
    el.filterCountModeToggle.addEventListener("change", handleFilterCountModeToggle);
  }
  if (el.rowsLimitSelect) {
    el.rowsLimitSelect.addEventListener("change", handleRowsLimitChange);
  }
  if (el.tableSortMetricSelect) {
    el.tableSortMetricSelect.addEventListener("change", handleTableSortChange);
  }
  if (el.tableSortDirectionSelect) {
    el.tableSortDirectionSelect.addEventListener("change", handleTableSortChange);
  }
  document.addEventListener("change", handleAutoplayLimitChange);
  document.addEventListener("blur", handleAutoplayLimitChange, true);
  document.addEventListener("change", handleAutoplayCabinetLimitChange);
  document.addEventListener("blur", handleAutoplayCabinetLimitChange, true);
  document.addEventListener("change", handleTagsLimitChange);
  document.addEventListener("blur", handleTagsLimitChange, true);
  document.addEventListener("change", handleTagsCabinetLimitChange);
  document.addEventListener("blur", handleTagsCabinetLimitChange, true);
  if (el.pagePrevBtn) {
    el.pagePrevBtn.addEventListener("click", () => shiftRowsPage(-1));
  }
  if (el.pageNextBtn) {
    el.pageNextBtn.addEventListener("click", () => shiftRowsPage(1));
  }
  if (el.resetAllFiltersBtn) {
    el.resetAllFiltersBtn.addEventListener("click", handleResetAllFilters);
  }
  if (el.globalFiltersToggleBtn) {
    el.globalFiltersToggleBtn.addEventListener("click", handleToggleGlobalFilters);
  }
  if (el.globalCategorySearchInput) {
    el.globalCategorySearchInput.addEventListener("input", handleGlobalCategorySearchInput);
  }
  document.addEventListener("click", handlePresetActionsClick);
  if (el.checksFiltersToggle) {
    el.checksFiltersToggle.addEventListener("click", (event) => {
      event.preventDefault();
      toggleChecksFiltersPopover();
    });
  }
  document.addEventListener("click", (event) => {
    if (!state.checksFiltersOpen || !el.checksFiltersPanel || !el.checksFiltersToggle) {
      return;
    }

    if (event.target.closest("#checksFiltersPanel")) {
      return;
    }
    if (event.target.closest("#checksFiltersToggle")) {
      return;
    }

    toggleChecksFiltersPopover(false);
  });
  document.addEventListener("pointerover", handleBreakSegmentPointerOver);
  document.addEventListener("pointermove", handleBreakSegmentPointerMove);
  document.addEventListener("pointerout", handleBreakSegmentPointerOut);

  el.rowsBody.addEventListener("click", async (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    const action = actionTarget.dataset.action;
    const rowId = actionTarget.dataset.id || actionTarget.closest("tr")?.dataset.id;

    if (action === "remove" && rowId) {
      if (!ensureAdminAccess("Удаление товара")) {
        return;
      }
      const row = getRowById(rowId);
      const nmId = String(row?.nmId || "").trim();
      const confirmText = nmId
        ? `Удалить товар ${nmId} из списка?`
        : "Удалить товар из списка?";
      const accepted = window.confirm(confirmText);
      if (!accepted) {
        return;
      }
      removeRow(rowId);
      return;
    }

    if (action === "reload" && rowId) {
      enqueueSingleRowWithProgress(rowId, {
        source: "manual",
        actionKey: "row-refresh",
        mode: "full",
      });
      return;
    }

    if (action === "row-history" && rowId) {
      event.preventDefault();
      openRowHistory(rowId);
      return;
    }

    if (action === "show-error" && rowId) {
      showRowError(rowId);
      return;
    }

    if (action === "preview") {
      event.preventDefault();
      hideHoverZoom();
      const rowIdFromThumb = actionTarget.dataset.rowId;
      const slideIndex = Number(actionTarget.dataset.slideIndex);
      if (rowIdFromThumb && Number.isInteger(slideIndex) && slideIndex >= 0) {
        openPreviewForRow(rowIdFromThumb, slideIndex);
      } else {
        openPreview(actionTarget.dataset.url, actionTarget.dataset.caption || "");
      }
      return;
    }

    if (action === "recommendations" && rowId) {
      event.preventDefault();
      await openRecommendations(rowId);
      return;
    }

    if (action === "color-variants" && rowId) {
      event.preventDefault();
      await openColorVariants(rowId);
      return;
    }

    if (action === "rich-content" && rowId) {
      event.preventDefault();
      await openRichContent(rowId);
    }
  });
  el.rowsBody.addEventListener("pointerover", handleSlideThumbPointerOver);
  el.rowsBody.addEventListener("pointerout", handleSlideThumbPointerOut);

  if (el.previewRefreshBtn) {
    el.previewRefreshBtn.addEventListener("click", refreshPreviewOverlay);
  }
  el.previewCloseBtn.addEventListener("click", closePreview);
  if (el.previewPrevBtn) {
    el.previewPrevBtn.addEventListener("click", () => stepPreview(-1));
  }
  if (el.previewNextBtn) {
    el.previewNextBtn.addEventListener("click", () => stepPreview(1));
  }
  if (el.previewThumbs) {
    el.previewThumbs.addEventListener("click", (event) => {
      const thumbButton = event.target.closest("[data-preview-index]");
      if (!thumbButton) {
        return;
      }
      const index = Number(thumbButton.dataset.previewIndex);
      if (!Number.isInteger(index)) {
        return;
      }
      setPreviewIndex(index);
    });
  }
  el.previewModal.addEventListener("click", (event) => {
    if (event.target.dataset.previewClose === "1") {
      closePreview();
    }
  });

  if (el.recommendationsRefreshBtn) {
    el.recommendationsRefreshBtn.addEventListener("click", refreshRecommendationsOverlay);
  }
  el.recommendationsCloseBtn.addEventListener("click", closeRecommendations);
  el.recommendationsModal.addEventListener("click", (event) => {
    if (event.target.dataset.recClose === "1") {
      closeRecommendations();
    }
  });
  el.recommendationsContent.addEventListener("click", (event) => {
    const addToBaseBtn = event.target.closest("[data-action='color-variant-add']");
    if (addToBaseBtn) {
      event.preventDefault();
      if (!ensureAdminAccess("Добавление товара")) {
        return;
      }
      const nmId = String(addToBaseBtn.dataset.nmId || "").trim();
      if (/^\d{6,}$/.test(nmId)) {
        upsertRowsFromNmIds([nmId]);
        const activeRowId = String(el.recommendationsContent?.dataset?.rowId || "").trim();
        render();
        if (activeRowId) {
          openColorVariants(activeRowId, { skipBackgroundFetch: true }).catch(() => {});
        }
      }
      return;
    }

    const actionTarget = event.target.closest("[data-action='preview']");
    if (!actionTarget) {
      return;
    }
    event.preventDefault();
    openPreview(actionTarget.dataset.url, actionTarget.dataset.caption || "");
  });

  if (el.richCloseBtn) {
    el.richCloseBtn.addEventListener("click", closeRichContent);
  }
  if (el.richRefreshBtn) {
    el.richRefreshBtn.addEventListener("click", refreshRichOverlay);
  }
  if (el.richModal) {
    el.richModal.addEventListener("click", (event) => {
      if (event.target.dataset.richClose === "1") {
        closeRichContent();
      }
    });
  }
  if (el.richContent) {
    el.richContent.addEventListener("click", (event) => {
      const selectBtn = event.target.closest("[data-action='rich-select']");
      if (!selectBtn) {
        return;
      }
      const index = Number(selectBtn.dataset.richIndex);
      if (!Number.isInteger(index)) {
        return;
      }
      setRichModalIndex(index);
    });
    el.richContent.addEventListener(
      "scroll",
      (event) => {
        const stream = event.target;
        if (!(stream instanceof HTMLElement) || !stream.matches("[data-rich-stage-stream]")) {
          return;
        }
        if (richGallery.scrollRaf) {
          cancelAnimationFrame(richGallery.scrollRaf);
        }
        richGallery.scrollRaf = requestAnimationFrame(() => {
          richGallery.scrollRaf = 0;
          syncRichModalIndexFromStream(stream);
        });
      },
      true,
    );
  }

  if (el.limitsCloseBtn) {
    el.limitsCloseBtn.addEventListener("click", closeLimitsModal);
  }
  if (el.limitsModal) {
    el.limitsModal.addEventListener("click", (event) => {
      if (event.target.dataset.limitsClose === "1") {
        closeLimitsModal();
      }
    });
  }
  if (el.sellersCloseBtn) {
    el.sellersCloseBtn.addEventListener("click", closeSellersModal);
  }
  if (el.sellersModal) {
    el.sellersModal.addEventListener("click", (event) => {
      if (event.target.dataset.sellersClose === "1") {
        closeSellersModal();
      }
    });
  }
  if (el.rowHistoryCloseBtn) {
    el.rowHistoryCloseBtn.addEventListener("click", closeRowHistory);
  }
  if (el.rowHistoryChangesFilterBtn) {
    el.rowHistoryChangesFilterBtn.addEventListener("click", toggleRowHistoryChangesOnlyFilter);
  }
  if (el.rowHistoryModal) {
    el.rowHistoryModal.addEventListener("click", (event) => {
      if (event.target.dataset.rowHistoryClose === "1") {
        closeRowHistory();
      }
    });
  }
  if (el.problemsChartCloseBtn) {
    el.problemsChartCloseBtn.addEventListener("click", closeProblemsChart);
  }
  if (el.problemsChartModal) {
    el.problemsChartModal.addEventListener("click", (event) => {
      if (event.target.dataset.problemsChartClose === "1") {
        closeProblemsChart();
      }
    });
  }
  if (el.problemsChartCabinetFilter) {
    el.problemsChartCabinetFilter.addEventListener("change", handleProblemsChartCabinetFilterChange);
  }
  if (el.sellersContent) {
    el.sellersContent.addEventListener("click", handleSellerSettingsClick);
    el.sellersContent.addEventListener("submit", handleSellerSettingsSubmit);
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el.previewModal.hidden) {
      closePreview();
      return;
    }
    if (!el.previewModal.hidden && event.key === "ArrowLeft") {
      event.preventDefault();
      stepPreview(-1);
      return;
    }
    if (!el.previewModal.hidden && event.key === "ArrowRight") {
      event.preventDefault();
      stepPreview(1);
      return;
    }
    if (event.key === "Escape" && !el.recommendationsModal.hidden) {
      closeRecommendations();
      return;
    }
    if (event.key === "Escape" && el.richModal && !el.richModal.hidden) {
      closeRichContent();
      return;
    }
    if (el.richModal && !el.richModal.hidden && (event.key === "ArrowLeft" || event.key === "ArrowUp")) {
      event.preventDefault();
      stepRichModal(-1);
      return;
    }
    if (el.richModal && !el.richModal.hidden && (event.key === "ArrowRight" || event.key === "ArrowDown")) {
      event.preventDefault();
      stepRichModal(1);
      return;
    }
    if (event.key === "Escape" && el.limitsModal && !el.limitsModal.hidden) {
      closeLimitsModal();
      return;
    }
    if (event.key === "Escape" && el.sellersModal && !el.sellersModal.hidden) {
      closeSellersModal();
      return;
    }
    if (event.key === "Escape" && el.rowHistoryModal && !el.rowHistoryModal.hidden) {
      closeRowHistory();
      return;
    }
    if (event.key === "Escape" && el.problemsChartModal && !el.problemsChartModal.hidden) {
      closeProblemsChart();
      return;
    }
    if (event.key === "Escape" && state.checksFiltersOpen) {
      toggleChecksFiltersPopover(false);
    }
  });
  window.addEventListener("resize", syncHoverZoomPosition);
  window.addEventListener("resize", syncGlobalFilterOffset);
  window.addEventListener(
    "scroll",
    () => {
      syncGlobalFilterOffset();
      if (hoverZoom.activeThumb) {
        syncHoverZoomPosition();
      }
      if (breakTooltip.activeSegment) {
        hideBreakSegmentTooltip();
      }
      if (iconHintTooltip.target) {
        syncIconHintTooltipPosition();
      }
    },
    true,
  );
  window.addEventListener("blur", hideBreakSegmentTooltip);
  document.addEventListener("pointerover", handleIconHintPointerOver);
  document.addEventListener("pointermove", handleIconHintPointerMove);
  document.addEventListener("pointerout", handleIconHintPointerOut);
  window.addEventListener("blur", hideIconHintTooltip);
}


function handleClear() {
  if (!ensureAdminAccess("Очистка поля ввода")) {
    return;
  }

  if (el.bulkInput) {
    el.bulkInput.value = "";
    el.bulkInput.focus();
  }
  if (el.singleInput) {
    el.singleInput.value = "";
  }
}

function showRowError(rowId) {
  const row = getRowById(rowId);
  if (!row) {
    return;
  }

  const message = row.error ? String(row.error) : "Нет сохраненной ошибки для этой строки.";
  window.alert(`Артикул: ${row.nmId}\n\nОшибка:\n${message}`);
}

function isRetriableRowError(messageRaw) {
  const message = String(messageRaw || "").toLowerCase();
  return (
    message.includes("429") ||
    message.includes("failed to fetch") ||
    message.includes("превышено время ожидания") ||
    message.includes("html вместо json") ||
    message.includes("x-pow") ||
    message.includes("не удалось определить basket-хост") ||
    message.includes("http 5") ||
    message.includes("временно недоступен")
  );
}

function handleShowErrorsReport() {
  const report = buildErrorReport(state.rows);
  if (report.total === 0) {
    window.alert("Ошибок загрузки нет.");
    return;
  }

  const lines = [`Ошибок загрузки: ${report.total}`, ""];
  for (const [index, group] of report.groups.entries()) {
    lines.push(`${index + 1}. ${group.label}: ${group.count}`);
    if (group.nmIds.length > 0) {
      const idsText = group.nmIds.join(", ");
      lines.push(`   Артикулы: ${idsText}${group.moreNmIds > 0 ? ` ... +${group.moreNmIds}` : ""}`);
    }
    if (group.example) {
      lines.push(`   Пример: ${group.example}`);
    }
    lines.push("");
  }

  lines.push("Подсказка: ошибки 429/Failed to fetch обычно временные лимиты WB.");
  window.alert(lines.join("\n"));
}


// Stage 1 split: data loading/network helpers moved to services/wb-card-loader.service.js
