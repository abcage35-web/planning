function renderIcon(name, className = "") {
  const cls = className ? ` class="${className}"` : "";
  switch (name) {
    case "refresh":
      return `<svg${cls} viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>`;
    case "search":
      return `<svg${cls} viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
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
    second: "2-digit",
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

function bindAbPageEvents() {
  const refreshBtn = document.getElementById("abTestsRefreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      if (typeof refreshAbDashboardData === "function") {
        refreshAbDashboardData();
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  applyStaticIcons();
  bindAbPageEvents();
  if (typeof ensureAbDashboardLoaded === "function") {
    ensureAbDashboardLoaded();
  }
});
