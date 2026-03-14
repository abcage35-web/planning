import React, { useEffect, useMemo, useRef, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(React.createElement);
const Fragment = React.Fragment;

function getApi() {
  return globalThis.AbDashboardApi || null;
}

function sanitizeId(valueRaw) {
  const value = String(valueRaw || "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return value || "id";
}

function getStatusKind(api, rawValue) {
  if (!api || typeof api.normalizeStatus !== "function") {
    return "unknown";
  }
  return api.normalizeStatus(String(rawValue || "").trim());
}

function getStatusLabel(kind) {
  switch (kind) {
    case "good":
      return "Хорошо";
    case "bad":
      return "Плохо";
    case "neutral":
      return "Норм";
    default:
      return "—";
  }
}

function IconHtml({ name, className = "" }) {
  const api = getApi();
  const iconHtml = api?.renderIconHtml ? api.renderIconHtml(name, className) : "";
  return html`<span aria-hidden="true" dangerouslySetInnerHTML=${{ __html: iconHtml }} />`;
}

function StatusPill({ rawValue, compact = false, labelOverride = "" }) {
  const api = getApi();
  const raw = String(rawValue || "").trim();
  const kind = getStatusKind(api, raw);
  const label = String(labelOverride || "").trim() || getStatusLabel(kind);
  return html`<span
    className=${`ab-status-pill is-${kind}${compact ? " is-compact" : ""}`}
    title=${raw || label}
  >
    ${!raw && label === "—" ? "—" : label}
  </span>`;
}

function SummaryFlow({ checks, placeholder = "Считаю XWAY…", xway = false }) {
  const items = [
    { key: "ctr", label: "CTR", raw: checks?.testCtr || checks?.ctr },
    { key: "price", label: "Цена", raw: checks?.testPrice || checks?.price },
    { key: "ctrcr1", label: "CTR x CR1", raw: checks?.testCtrCr1 || checks?.ctrCr1 },
    { key: "overall", label: "Итог", raw: checks?.overall },
  ];

  if (!checks) {
    return html`<div className="ab-test-summary-row is-inline-flow" data-ab-xway-summary-flow=${xway ? true : undefined}>
      <span className="ab-xway-inline-state is-loading">${placeholder}</span>
    </div>`;
  }

  return html`<div className="ab-test-summary-row is-inline-flow" data-ab-xway-summary-flow=${xway ? true : undefined}>
    ${items.map(
      (item, index) => html`<${Fragment} key=${item.key}>
        <div className="ab-eval-step">
          <${StatusPill} rawValue=${item.raw} compact=${true} labelOverride=${item.label} />
        </div>
        ${index < items.length - 1 ? html`<span className="ab-eval-step-separator" aria-hidden="true">→</span>` : null}
      </${Fragment}>`,
    )}
  </div>`;
}

function SafeLink({ url, label }) {
  const href = String(url || "").trim();
  if (!href) {
    return html`<span className="ab-link-empty">—</span>`;
  }
  return html`<a className="ab-link ab-head-action-btn" href=${href} target="_blank" rel="noopener noreferrer">
    <${IconHtml} name="externalLink" className="ab-link-icon" />
    <span>${label}</span>
  </a>`;
}

function ToolbarSelect({ value, onChange, options, minWidth = 100, ariaLabel = "" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedLabel = options.find((item) => item.value === value)?.label || value;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  return html`<div className="ab-toolbar-select" ref=${rootRef} style=${{ minWidth: `${minWidth}px` }}>
    <button
      type="button"
      className="ab-toolbar-select-trigger"
      onClick=${() => setOpen((valueCurrent) => !valueCurrent)}
      aria-label=${ariaLabel}
      aria-expanded=${open ? "true" : "false"}
    >
      <span className="ab-toolbar-select-value">${selectedLabel}</span>
      <${IconHtml} name="chevronDown" className=${`ab-toolbar-select-chevron${open ? " is-open" : ""}`} />
    </button>
    ${open
      ? html`<div className="ab-toolbar-select-menu">
          ${options.map(
            (option) => html`<button
              key=${option.value}
              type="button"
              className=${`ab-toolbar-select-option${option.value === value ? " is-active" : ""}`}
              onClick=${() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              ${option.label}
            </button>`,
          )}
        </div>`
      : null}
  </div>`;
}

function MonthsDropdown({ availableMonthKeys, selectedMonthKeys, selectedMonthsLabel, onToggle }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  return html`<div className="ab-toolbar-select ab-toolbar-months-picker" ref=${rootRef} style=${{ minWidth: "140px" }}>
    <button
      type="button"
      className="ab-toolbar-select-trigger"
      onClick=${() => setOpen((valueCurrent) => !valueCurrent)}
      aria-label="Выбрать месяцы"
      aria-expanded=${open ? "true" : "false"}
    >
      <span className="ab-toolbar-select-value">${selectedMonthsLabel}</span>
      <${IconHtml} name="chevronDown" className=${`ab-toolbar-select-chevron${open ? " is-open" : ""}`} />
    </button>
    ${open
              ? html`<div className="ab-toolbar-select-menu ab-toolbar-select-menu-months">
          ${availableMonthKeys.map((monthKey) => {
            const checked = selectedMonthKeys.includes(monthKey);
            const api = getApi();
            const label = api?.formatMonthLabel ? api.formatMonthLabel(monthKey) : monthKey;
            return html`<label key=${monthKey} className="ab-month-option">
              <span className=${`ab-month-option-check${checked ? " is-checked" : ""}`}>
                ${checked ? html`<${IconHtml} name="check" className="ab-month-option-check-icon" />` : null}
              </span>
              <input
                type="checkbox"
                checked=${checked}
                onChange=${(event) => onToggle(monthKey, event.target.checked)}
              />
              <span>${label}</span>
            </label>`;
          })}
        </div>`
      : null}
  </div>`;
}

function StatChip({ label, value, tone = "" }) {
  return html`<span className=${`ab-stat-chip${tone ? ` is-${tone}` : ""}`}>
    ${label}: <strong>${value}</strong>
  </span>`;
}

function FilterToolbar({ model, filteredTests, store, collapsed, onToggleCollapse }) {
  const api = getApi();
  const filters = store.filters || {};
  const cabinets = Array.isArray(model?.cabinets) ? model.cabinets : [];
  const availableMonthKeys = api?.getAvailableMonthKeys ? api.getAvailableMonthKeys(model) : [];
  const selectedMonthKeys = Array.isArray(filters.monthKeys)
    ? Array.from(new Set(filters.monthKeys.map((value) => String(value || "").trim()).filter(Boolean))).sort((a, b) =>
        b.localeCompare(a),
      )
    : [];
  const selectedMonthsLabel = api?.getMonthSelectionLabel ? api.getMonthSelectionLabel(selectedMonthKeys) : "Месяцы";
  const totalTests = Array.isArray(model?.tests) ? model.tests.length : 0;
  const visibleTests = Array.isArray(filteredTests) ? filteredTests.length : 0;
  const limitValue = Math.max(1, Number(filters.limit) || (api?.limitOptions || [50])[0]);
  const shownTests = Math.min(visibleTests, limitValue);
  const filteredGood = filteredTests.filter((test) => test?.finalStatusKind === "good").length;
  const filteredBad = filteredTests.filter((test) => test?.finalStatusKind === "bad").length;
  const activeStageLabelMap = {
    ctr: "CTR",
    price: "Цена",
    ctrcr1: "CTR x CR1",
    overall: "Итог",
  };
  const activeStageSourceMap = {
    export: "Выгрузка",
    xway: "XWAY",
  };
  const activeStageLabel =
    filters.stage && filters.stage !== "all"
      ? `${activeStageSourceMap[filters.stageSource || "export"] || "Выгрузка"} · ${
          activeStageLabelMap[filters.stage] || filters.stage
        }`
      : "";

  const cabinetOptions = [{ value: "all", label: "Все кабинеты" }].concat(
    cabinets.map((cabinet) => ({ value: cabinet, label: cabinet })),
  );
  const verdictOptions = [
    { value: "all", label: "Все исходы" },
    { value: "good", label: "Хорошо" },
    { value: "bad", label: "Плохо" },
    { value: "unknown", label: "Нет данных" },
  ];
  const limitOptions = (api?.limitOptions || []).map((value) => ({ value: String(value), label: String(value) }));

  const updateFilters = (partial) => {
    if (api?.setFilters) {
      api.setFilters(partial);
    }
  };

  if (collapsed) {
    return html`<div className="ab-toolbar-collapsed">
      <button type="button" className="ab-toolbar-collapsed-btn" onClick=${onToggleCollapse}>
        <${IconHtml} name="filter" className="ab-card-help-icon" />
        <span>Фильтры</span>
        <${IconHtml} name="chevronDown" className="ab-card-help-icon" />
      </button>
    </div>`;
  }

  return html`<section className="ab-toolbar-card">
    <div className="ab-toolbar-main">
      <label className="ab-toolbar-search">
        <${IconHtml} name="search" className="ab-toolbar-search-icon" />
        <input
          type="search"
          value=${String(filters.search || "")}
          placeholder="Поиск: test id, артикул, название"
          onInput=${(event) => updateFilters({ search: event.target.value || "" })}
        />
      </label>

      <${ToolbarSelect}
        value=${String(filters.cabinet || "all")}
        onChange=${(value) => updateFilters({ cabinet: value })}
        options=${cabinetOptions}
        minWidth=${130}
        ariaLabel="Выбрать кабинет"
      />

      <${ToolbarSelect}
        value=${String(filters.verdict || "all")}
        onChange=${(value) => updateFilters({ verdict: value })}
        options=${verdictOptions}
        minWidth=${120}
        ariaLabel="Выбрать итог"
      />

      <label className="ab-toolbar-field is-date">
        <input
          type="date"
          value=${String(filters.dateFrom || "")}
          onChange=${(event) => updateFilters({ dateFrom: event.target.value || "", monthKeys: [] })}
        />
      </label>

      <label className="ab-toolbar-field is-date">
        <input
          type="date"
          value=${String(filters.dateTo || "")}
          onChange=${(event) => updateFilters({ dateTo: event.target.value || "", monthKeys: [] })}
        />
      </label>

      <${MonthsDropdown}
        availableMonthKeys=${availableMonthKeys}
        selectedMonthKeys=${selectedMonthKeys}
        selectedMonthsLabel=${selectedMonthsLabel}
        onToggle=${(monthKey, checked) => {
          const next = new Set(selectedMonthKeys);
          if (checked) {
            next.add(monthKey);
          } else {
            next.delete(monthKey);
          }
          const nextMonthKeys = Array.from(next).sort();
          const range = api?.buildDateRangeFromMonthKeys ? api.buildDateRangeFromMonthKeys(nextMonthKeys) : { from: "", to: "" };
          updateFilters({
            monthKeys: nextMonthKeys,
            dateFrom: range.from || "",
            dateTo: range.to || "",
          });
        }}
      />

      <${ToolbarSelect}
        value=${String(filters.limit || "")}
        onChange=${(value) => updateFilters({ limit: value })}
        options=${limitOptions}
        minWidth=${64}
        ariaLabel="Выбрать лимит"
      />

      <button type="button" className="ab-toolbar-collapse-btn" onClick=${onToggleCollapse} title="Скрыть фильтры">
        <${IconHtml} name="chevronUp" className="ab-card-help-icon" />
      </button>

      <div className="ab-toolbar-actions">
        <div className="ab-view-switch" role="tablist" aria-label="Режим просмотра AB">
          <button
            type="button"
            className=${`ab-view-btn${filters.view === "tests" ? " is-active" : ""}`}
            onClick=${() => updateFilters({ view: "tests" })}
          >
            По тестам
          </button>
          <button
            type="button"
            className=${`ab-view-btn${filters.view === "products" ? " is-active" : ""}`}
            onClick=${() => updateFilters({ view: "products" })}
          >
            По товарам
          </button>
          <button
            type="button"
            className=${`ab-view-btn${filters.view === "both" ? " is-active" : ""}`}
            onClick=${() => updateFilters({ view: "both" })}
          >
            Оба вида
          </button>
        </div>
        <button type="button" className="btn" onClick=${() => api?.resetFilters?.()}>
          <${IconHtml} name="refresh" className="ab-card-help-icon" />
          <span>Сбросить</span>
        </button>
      </div>
    </div>

    <div className="ab-toolbar-stats">
      <${StatChip}
        label="Показано"
        value=${`${api?.formatInt ? api.formatInt(shownTests) : shownTests} / ${api?.formatInt ? api.formatInt(visibleTests) : visibleTests}`}
      />
      <${StatChip} label="Всего тестов" value=${api?.formatInt ? api.formatInt(totalTests) : totalTests} />
      <${StatChip} label="Хорошо" value=${api?.formatInt ? api.formatInt(filteredGood) : filteredGood} tone="good" />
      <${StatChip} label="Плохо" value=${api?.formatInt ? api.formatInt(filteredBad) : filteredBad} tone="bad" />
      ${activeStageLabel
        ? html`<${StatChip} label="Этап" value=${activeStageLabel} tone="sky" />`
        : null}
    </div>
  </section>`;
}

function FunnelPieStage({ card, stage, sourceKey, filters, style }) {
  const api = getApi();
  const percent = card.total > 0 ? Math.round((stage.count / card.total) * 100) : 0;
  const isActive =
    filters.cabinet === card.cabinet &&
    filters.stage === stage.key &&
    String(filters.stageSource || "export") === sourceKey;
  const size = 74;
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const gradientId = sanitizeId(`donut-${card.cabinet}-${sourceKey}-${stage.key}`);

  return html`<button
    type="button"
    className=${`ab-funnel-pie-btn${isActive ? " is-active" : ""}`}
    data-ab-action="cabinet-stage-filter"
    data-ab-cabinet=${card.cabinet}
    data-ab-stage=${stage.key}
    data-ab-source=${sourceKey}
  >
    <div className="ab-funnel-donut">
      <svg viewBox="0 0 74 74" aria-hidden="true">
        <defs>
          <linearGradient id=${gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor=${style.colorFrom}></stop>
            <stop offset="100%" stopColor=${style.colorTo}></stop>
          </linearGradient>
        </defs>
        <circle className="ab-funnel-donut-track" cx="37" cy="37" r=${radius}></circle>
        <circle
          className="ab-funnel-donut-fill"
          cx="37"
          cy="37"
          r=${radius}
          stroke=${`url(#${gradientId})`}
          strokeDasharray=${circumference}
          strokeDashoffset=${offset}
          transform="rotate(-90 37 37)"
        ></circle>
      </svg>
      <span className="ab-funnel-donut-value">${percent}%</span>
    </div>
    <span className="ab-funnel-donut-label">${stage.label}</span>
    <span className="ab-funnel-donut-meta">${api?.formatInt ? api.formatInt(stage.count) : stage.count} из ${api?.formatInt
      ? api.formatInt(card.total)
      : card.total}</span>
  </button>`;
}

function FunnelBarStage({ card, stage, sourceKey, filters, style }) {
  const api = getApi();
  const percent = card.total > 0 ? Math.round((stage.count / card.total) * 100) : 0;
  const isActive =
    filters.cabinet === card.cabinet &&
    filters.stage === stage.key &&
    String(filters.stageSource || "export") === sourceKey;

  return html`<button
    type="button"
    className=${`ab-funnel-stage-row${isActive ? " is-active" : ""}`}
    data-ab-action="cabinet-stage-filter"
    data-ab-cabinet=${card.cabinet}
    data-ab-stage=${stage.key}
    data-ab-source=${sourceKey}
  >
    <div className="ab-funnel-stage-top">
      <span className="ab-funnel-stage-name">${stage.label}</span>
      <span className="ab-funnel-stage-percent">${percent}%</span>
      <span className="ab-funnel-stage-count">${api?.formatInt ? api.formatInt(stage.count) : stage.count} из ${api?.formatInt
        ? api.formatInt(card.total)
        : card.total}</span>
    </div>
    <div className="ab-funnel-stage-bar">
      <span
        className="ab-funnel-stage-bar-fill"
        style=${{
          "--stage-from": style.colorFrom,
          "--stage-to": style.colorTo,
          width: `${percent}%`,
        }}
      ></span>
    </div>
  </button>`;
}

function FunnelPendingCard({ card, pendingMessage = "Считаю XWAY…" }) {
  return html`<article className="ab-funnel-card is-pending" data-ab-xway-funnel-card data-ab-cabinet=${card.cabinet}>
    <div className="ab-funnel-card-head">
      <div>
        <h4>${card.cabinet}</h4>
        <div className="ab-funnel-card-subtle">${pendingMessage}</div>
      </div>
      <span className="ab-funnel-result-pill is-pending">—</span>
    </div>
    <div className="ab-funnel-pie-grid is-pending">
      ${["CTR", "Цена", "CTR x CR1", "Итог"].map(
        (label) => html`<div key=${label} className="ab-funnel-pie-btn is-pending">
          <div className="ab-funnel-donut is-pending"><span className="ab-funnel-donut-value">—</span></div>
          <span className="ab-funnel-donut-label">${label}</span>
          <span className="ab-funnel-donut-meta">—</span>
        </div>`,
      )}
    </div>
  </article>`;
}

function FunnelCard({ card, sourceKey, filters, mode }) {
  const api = getApi();
  const stages = Array.isArray(card?.stages) ? card.stages : [];
  const finalCount = stages[stages.length - 1]?.count || 0;
  const finalPercent = card.total > 0 ? Math.round((finalCount / card.total) * 100) : 0;
  const resultClass = finalPercent >= 50 ? "is-good" : finalPercent >= 25 ? "is-warm" : "is-neutral";
  return html`<article className="ab-funnel-card">
    <div className="ab-funnel-card-head">
      <div>
        <h4>${card.cabinet}</h4>
        <div className="ab-funnel-card-subtle">
          Успешных итоговых: ${api?.formatInt ? api.formatInt(finalCount) : finalCount} из ${api?.formatInt
            ? api.formatInt(card.total)
            : card.total}
        </div>
      </div>
      <span className=${`ab-funnel-result-pill ${resultClass}`}>${finalPercent}%</span>
    </div>
    ${mode === "pies"
      ? html`<div className="ab-funnel-pie-grid">
          ${stages.map((stage) => {
            const style = api?.funnelStageStyles?.[stage.key] || {
              colorFrom: "#94a3b8",
              colorTo: "#cbd5e1",
            };
            return html`<${FunnelPieStage}
              key=${`${card.cabinet}-${sourceKey}-${stage.key}`}
              card=${card}
              stage=${stage}
              sourceKey=${sourceKey}
              filters=${filters}
              style=${style}
            />`;
          })}
        </div>`
      : html`<div className="ab-funnel-stage-list">
          ${stages.map((stage) => {
            const style = api?.funnelStageStyles?.[stage.key] || {
              colorFrom: "#94a3b8",
              colorTo: "#cbd5e1",
            };
            return html`<${FunnelBarStage}
              key=${`${card.cabinet}-${sourceKey}-${stage.key}`}
              card=${card}
              stage=${stage}
              sourceKey=${sourceKey}
              filters=${filters}
              style=${style}
            />`;
          })}
        </div>`}
  </article>`;
}

function FunnelDashboard({ filteredTests, store }) {
  const api = getApi();
  const cabinetOrder = Array.isArray(store.data?.cabinets) ? store.data.cabinets : [];
  const funnelMode = String(store.funnelMode || "bars") === "pies" ? "pies" : "bars";
  const exportCards = api?.buildCabinetFunnelCards ? api.buildCabinetFunnelCards(filteredTests, cabinetOrder, "export") : [];
  const hasXwayChecks = filteredTests.some((test) => test?.xwaySummaryChecks);
  const xwayCards = hasXwayChecks && api?.buildCabinetFunnelCards
    ? api.buildCabinetFunnelCards(filteredTests, cabinetOrder, "xway")
    : [];

  return html`<section className="ab-funnel-dashboard">
    <div className="ab-funnel-dashboard-head">
      <div>
        <h3>Воронка удачных AB-тестов по кабинетам</h3>
        <p className="subtle">
          Текущая выборка по выбранным фильтрам. Отдельно показаны расчеты по выгрузке и по XWAY. Клик по этапу
          отфильтрует тесты.
        </p>
      </div>
      <div className="ab-funnel-dashboard-controls">
        <div className="ab-funnel-mode-switch" role="tablist" aria-label="Режим графика воронки">
          <button
            type="button"
            className=${`ab-funnel-mode-btn${funnelMode === "bars" ? " is-active" : ""}`}
            data-ab-action="set-funnel-mode"
            data-ab-funnel-mode="bars"
            title="Полосы"
            aria-label="Полосы"
          >
            <${IconHtml} name="barChart" className="ab-card-help-icon" />
          </button>
          <button
            type="button"
            className=${`ab-funnel-mode-btn${funnelMode === "pies" ? " is-active" : ""}`}
            data-ab-action="set-funnel-mode"
            data-ab-funnel-mode="pies"
            title="Кольца"
            aria-label="Кольца"
          >
            <${IconHtml} name="pieChart" className="ab-card-help-icon" />
          </button>
        </div>
        <span className="ab-stat-chip">Кабинетов: <strong>${api?.formatInt ? api.formatInt(exportCards.length) : exportCards.length}</strong></span>
      </div>
    </div>

    <div className="ab-funnel-source-grid">
      <section className="ab-funnel-source-section">
        <div className="ab-funnel-source-head">
          <h4>Из выгрузки</h4>
        </div>
        <div className="ab-funnel-grid">
          ${exportCards.map(
            (card) => html`<${FunnelCard}
              key=${`export-${card.cabinet}`}
              card=${card}
              sourceKey="export"
              filters=${store.filters}
              mode=${funnelMode}
            />`,
          )}
        </div>
      </section>

      <section className="ab-funnel-source-section is-xway" data-ab-xway-funnel-section=${true}>
        <div className="ab-funnel-source-head">
          <h4>Из XWAY</h4>
          <div className="ab-funnel-source-actions">
            <span className="ab-stat-chip" data-ab-xway-funnel-status>${hasXwayChecks ? "Готово" : "Считаю XWAY…"}</span>
            <button
              type="button"
              className="ab-head-action-btn ab-xway-refresh-all-btn"
              data-ab-action="refresh-xway-filtered"
              aria-label="Обновить XWAY по текущим фильтрам"
              title="Обновить XWAY по текущим фильтрам"
            >
              <${IconHtml} name="refresh" className="ab-card-help-icon" />
              <span>Обновить XWAY</span>
            </button>
          </div>
        </div>
        <div className="ab-funnel-grid" data-ab-xway-funnel-grid=${true}>
          ${hasXwayChecks
            ? xwayCards.map(
                (card) => html`<${FunnelCard}
                  key=${`xway-${card.cabinet}`}
                  card=${card}
                  sourceKey="xway"
                  filters=${store.filters}
                  mode=${funnelMode}
                />`,
              )
            : exportCards.map(
                (card) => html`<${FunnelPendingCard} key=${`pending-${card.cabinet}`} card=${card} />`,
              )}
        </div>
      </section>
    </div>
  </section>`;
}

function TestCard({ test, matrixMetricWidth, matrixVariantWidth }) {
  const api = getApi();
  const matrixWidthPx = matrixMetricWidth + test.variants.length * matrixVariantWidth;
  const testPeriodText = api?.formatCompactPeriodDateTime
    ? `${api.formatCompactPeriodDateTime(test.startedAtIso)} — ${api.formatCompactPeriodDateTime(test.endedAtIso)}`
    : `${test.startedAtIso || "—"} — ${test.endedAtIso || "—"}`;

  return html`<article className="ab-test-card" data-test-id=${test.testId}>
    <header className="ab-test-head">
      <div className="ab-test-head-main">
        <div className="ab-test-head-top">
          <h4>Тест ${test.testId}</h4>
          <div className="ab-test-meta-row">
            <span className="ab-test-chip">Артикул: <strong>${test.article || "—"}</strong></span>
            <span className="ab-test-chip">Тип РК: <strong>${test.type || "—"}</strong></span>
            <span className="ab-test-chip">Кабинет: <strong>${test.cabinet || "—"}</strong></span>
          </div>
        </div>
        <p className="ab-test-title" title=${test.title || ""}>${test.title || "—"}</p>
        <p className="ab-test-period">${testPeriodText}</p>
      </div>

      <div className="ab-test-head-side">
        <div className="ab-test-head-actions">
          <div className="ab-tooltip-anchor">
            <button type="button" className="ab-icon-btn ab-head-action-btn" aria-label="Показать отчет по расчетам">
              <${IconHtml} name="info" className="ab-card-help-icon" />
            </button>
            <div className="ab-hover-tooltip" role="tooltip">
              <div className="ab-hover-tooltip-title">Отчет по расчетам</div>
              ${test.reportLines.length
                ? html`<ul className="ab-tooltip-report-list">
                    ${test.reportLines.map((line, index) => html`<li key=${index}>${String(line || "").replace(/^[-•]\s*/, "")}</li>`)}
                  </ul>`
                : html`<div className="ab-tooltip-report-empty">Без текстового отчета.</div>`}
            </div>
          </div>

          <button
            type="button"
            className="ab-icon-btn ab-head-action-btn"
            data-ab-action="refresh-xway-summary"
            data-ab-test-id=${test.testId}
            data-ab-campaign-type=${test.type || ""}
            data-ab-campaign-external-id=${test.campaignExternalId || ""}
            data-ab-started-at=${test.startedAtIso || ""}
            data-ab-ended-at=${test.endedAtIso || ""}
            aria-label="Обновить результат XWAY для теста"
            title="Обновить результат XWAY для теста"
          >
            <${IconHtml} name="refresh" className="ab-card-help-icon" />
          </button>

          <button
            type="button"
            className="ab-icon-btn ab-head-action-btn"
            data-ab-action="open-xway-metrics"
            data-ab-test-id=${test.testId}
            data-ab-campaign-type=${test.type || ""}
            data-ab-campaign-external-id=${test.campaignExternalId || ""}
            data-ab-started-at=${test.startedAtIso || ""}
            data-ab-ended-at=${test.endedAtIso || ""}
            aria-label="Показать конверсии XWAY по типу РК"
            title="Показать конверсии XWAY по типу РК"
          >
            <${IconHtml} name="barChart" className="ab-card-help-icon" />
          </button>

          <${SafeLink} url=${test.xwayUrl} label="XWay" />
          <${SafeLink} url=${test.wbUrl} label="WB" />
        </div>

        <div className="ab-test-summary-compare">
          <div className="ab-test-summary-frame">
            <div className="ab-test-summary-frame-label">Выгрузка</div>
            <${SummaryFlow} checks=${test.summaryChecks} />
          </div>

          <div
            className="ab-test-summary-frame is-xway"
            data-ab-xway-summary-card=${true}
            data-ab-test-id=${test.testId}
            data-ab-campaign-type=${test.type || ""}
            data-ab-campaign-external-id=${test.campaignExternalId || ""}
            data-ab-started-at=${test.startedAtIso || ""}
            data-ab-ended-at=${test.endedAtIso || ""}
          >
            <div className="ab-test-summary-frame-label">XWAY</div>
            <${SummaryFlow} checks=${test.xwaySummaryChecks || null} xway=${true} />
          </div>
        </div>
      </div>
    </header>

    <div className="ab-test-layout">
      <section className="ab-test-center">
        <div className="ab-matrix-wrap">
          <table className="ab-variant-matrix" style=${{ width: `${matrixWidthPx}px`, minWidth: `${matrixWidthPx}px` }}>
            <colgroup>
              <col className="ab-matrix-col-metric" />
              ${test.variants.map((variant) => html`<col key=${variant.index} className="ab-matrix-col-variant" />`)}
            </colgroup>
            <thead>
              <tr>
                <th>Метрика</th>
                ${test.variants.map(
                  (variant) => html`<th key=${variant.index} className=${variant.isBest ? "is-best" : ""}>Вариант ${variant.index}</th>`,
                )}
              </tr>
            </thead>
            <tbody>
              <tr className="is-image">
                <th>Обложка</th>
                ${test.variants.map((variant) => {
                  if (!variant.imageUrl) {
                    return html`<td key=${variant.index}>
                      <div className="ab-image-cell">
                        <div className="ab-image-center">
                          <div className="ab-image-placeholder">нет обложки</div>
                        </div>
                      </div>
                    </td>`;
                  }
                  return html`<td key=${variant.index}>
                    <div className="ab-image-cell">
                      <div className="ab-image-center">
                        <div className=${`ab-cover-frame${variant.isBest ? " is-best" : ""}`}>
                          ${variant.isBest ? html`<span className="ab-variant-best-badge">Лучшая</span>` : null}
                          <a
                            className=${`ab-cover-link${variant.isBest ? " is-best" : ""}`}
                            href=${variant.imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img src=${variant.imageUrl} alt=${`Обложка ${variant.index}`} loading="lazy" decoding="async" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </td>`;
                })}
              </tr>

              <tr>
                <th>Показы</th>
                ${test.variants.map((variant) => html`<td key=${variant.index}>${variant.views}</td>`)}
              </tr>

              <tr>
                <th>Клики</th>
                ${test.variants.map((variant) => html`<td key=${variant.index}>${variant.clicks}</td>`)}
              </tr>

              <tr>
                <th>CTR</th>
                ${test.variants.map(
                  (variant) => html`<td key=${variant.index}>
                    <div className="ab-ctr-cell">
                      <span>${variant.ctr}</span>
                      ${variant.ctrBoostText && variant.ctrBoostKind
                        ? html`<span className=${`ab-ctr-boost-pill is-${variant.ctrBoostKind}`}>${variant.ctrBoostText}</span>`
                        : null}
                    </div>
                  </td>`,
                )}
              </tr>

              <tr>
                <th>Время установки</th>
                ${test.variants.map(
                  (variant) => html`<td key=${variant.index}>
                    <div className="ab-variant-install-time">
                      <span>${variant.installedAtDate}</span>
                      <span>${variant.installedAtTime || "—"}</span>
                    </div>
                  </td>`,
                )}
              </tr>

              <tr>
                <th>Время активности</th>
                ${test.variants.map((variant) => html`<td key=${variant.index}>${variant.hours}</td>`)}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="ab-test-right">
        <article className="ab-side-card">
          <div className="ab-card-head">
            <h5>Метрики ДО / ВО ВРЕМЯ / ПОСЛЕ</h5>
            <div className="ab-tooltip-anchor">
              <button
                type="button"
                className="ab-icon-btn ab-head-action-btn"
                aria-label="Показать информацию по отклонениям цены"
                title="Показать информацию по отклонениям цены"
              >
                <${IconHtml} name="info" className="ab-card-help-icon" />
              </button>
              <div className="ab-hover-tooltip" role="tooltip">
                <div className="ab-hover-tooltip-title">Отклонения цены</div>
                <div className="ab-tooltip-report-empty">Количество отклонений цены: ${test.priceDeviationCount || "—"}</div>
              </div>
            </div>
          </div>

          <table className="ab-mini-table is-tight">
            <thead>
              <tr>
                <th>Метрика</th>
                <th>До</th>
                <th>Во время</th>
                <th>После</th>
                <th>Прирост</th>
              </tr>
            </thead>
            <tbody>
              ${test.comparisonRows.length
                ? test.comparisonRows.map(
                    (row, index) => html`<tr key=${`${test.testId}-${index}`}>
                      <td>${row.label}</td>
                      <td>${row.before}</td>
                      <td>${row.during}</td>
                      <td>${row.after}</td>
                      <td>
                        ${row.deltaText !== "—"
                          ? html`<span className=${`ab-delta-pill is-${row.deltaKind}`}>${row.deltaText}</span>`
                          : "—"}
                      </td>
                    </tr>`,
                  )
                : html`<tr><td colSpan="5">—</td></tr>`}
            </tbody>
          </table>
        </article>
      </section>
    </div>
  </article>`;
}

function TestsSection({ tests }) {
  const api = getApi();
  if (!tests.length) {
    return html`<article className="ab-table-card"><p className="ab-table-empty-row">Нет тестов под выбранные фильтры.</p></article>`;
  }
  return html`<section className="ab-tests-list">
    ${tests.map(
      (test) => html`<${TestCard}
        key=${test.testId}
        test=${test}
        matrixMetricWidth=${api?.matrixMetricWidth || 136}
        matrixVariantWidth=${api?.matrixVariantWidth || 112}
      />`,
    )}
  </section>`;
}

function ProductsSection({ products }) {
  const api = getApi();
  if (!products.length) {
    return null;
  }

  return html`<article className="ab-table-card">
    <div className="ab-table-head">
      <h3>Товары и все проведенные AB‑тесты</h3>
      <span className="subtle">Группировка по артикулу</span>
    </div>
    <div className="ab-table-wrap">
      <table className="ab-table ab-products-table">
        <thead>
          <tr>
            <th>Артикул</th>
            <th>Название</th>
            <th>Кабинеты</th>
            <th>Тестов</th>
            <th>Хорошо</th>
            <th>Плохо</th>
            <th>Последний старт</th>
            <th>Тесты</th>
          </tr>
        </thead>
        <tbody>
          ${products.map(
            (item) => html`<tr key=${item.article}>
              <td className="ab-col-id">${item.article}</td>
              <td className="ab-col-name" title=${item.title || ""}>${item.title || "—"}</td>
              <td>${item.cabinets.join(", ") || "—"}</td>
              <td>${api?.formatInt ? api.formatInt(item.testsCount) : item.testsCount}</td>
              <td><span className="ab-inline-status good">${api?.formatInt ? api.formatInt(item.good) : item.good}</span></td>
              <td><span className="ab-inline-status bad">${api?.formatInt ? api.formatInt(item.bad) : item.bad}</span></td>
              <td>${item.latestAt || "—"}</td>
              <td className="ab-product-tests-cell">
                ${item.tests.slice(0, 12).map(
                  (test) => html`<a
                    key=${test.testId}
                    className="ab-product-test-link"
                    href=${test.xwayUrl || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    title=${test.title || ""}
                  >
                    #${test.testId}
                  </a>`,
                )}
              </td>
            </tr>`,
          )}
        </tbody>
      </table>
    </div>
  </article>`;
}

function StateCard({ loading, error }) {
  if (error) {
    return html`<div className="ab-tests-state-card is-error">
      <p>${error}</p>
      <p className="subtle">Проверьте доступ к Google Sheets и нажмите «Обновить данные».</p>
    </div>`;
  }

  return html`<div className="ab-tests-state-card">
    <span className="ab-tests-state-spinner" aria-hidden="true"></span>
    <span>${loading ? "Загружаю AB-выгрузки и пересчитываю тесты…" : "Нет данных для AB‑дашборда."}</span>
  </div>`;
}

function DashboardApp() {
  const [version, setVersion] = useState(0);
  const [filterCollapsed, setFilterCollapsed] = useState(false);
  const api = getApi();
  const store = api?.store || null;

  useEffect(() => {
    const handleUpdate = () => {
      setVersion((value) => value + 1);
    };

    document.addEventListener("ab:dashboard-update", handleUpdate);
    if (api?.ensureLoaded) {
      api.ensureLoaded();
    }
    handleUpdate();

    return () => {
      document.removeEventListener("ab:dashboard-update", handleUpdate);
    };
  }, [api]);

  useEffect(() => {
    if (!api || !store) {
      return;
    }
    const metaEl = document.getElementById("abTestsMetaLine");
    if (!metaEl) {
      return;
    }
    const fetchedLabel = store.fetchedAt && typeof globalThis.AbDashboardUi?.formatDateTime === "function"
      ? globalThis.AbDashboardUi.formatDateTime(store.fetchedAt)
      : "-";
    metaEl.textContent = api.buildSourceMetaText ? api.buildSourceMetaText(fetchedLabel) : metaEl.textContent;
  }, [api, store, version]);

  const derived = useMemo(() => {
    if (!api || !store || !store.data) {
      return {
        filteredTests: [],
        limitedTests: [],
        filteredProducts: [],
        sourceRowsLabel: "",
        showTests: true,
        showProducts: false,
      };
    }

    const filteredTests = api.filterTests(store.data);
    const limitValue = Math.max(1, Number(store.filters?.limit) || (api.limitOptions || [50])[0]);
    const limitedTests = filteredTests.slice(0, limitValue);
    const filteredProducts = api.buildProducts(filteredTests);
    const sourceRowsLabel = `Строк в подложке: ${api.formatInt(store.data.rowCounts.catalog)} · строк в техвыгрузке: ${api.formatInt(
      store.data.rowCounts.technical,
    )} · строк в результатах обложек: ${api.formatInt(store.data.rowCounts.results)}`;
    const showTests = store.filters?.view === "tests" || store.filters?.view === "both";
    const showProducts = store.filters?.view === "products" || store.filters?.view === "both";

    return {
      filteredTests,
      limitedTests,
      filteredProducts,
      sourceRowsLabel,
      showTests,
      showProducts,
    };
  }, [api, store, version]);

  useEffect(() => {
    const event = new CustomEvent("ab:content-render");
    document.dispatchEvent(event);
  }, [version, derived.filteredTests.length, derived.limitedTests.length, derived.filteredProducts.length]);

  if (!api || !store) {
    return html`<${StateCard} loading=${true} error="" />`;
  }

  if (store.loading || store.error || !store.data) {
    return html`<${StateCard} loading=${store.loading} error=${store.error} />`;
  }

  return html`<${Fragment}>
    <${FilterToolbar}
      model=${store.data}
      filteredTests=${derived.filteredTests}
      store=${store}
      collapsed=${filterCollapsed}
      onToggleCollapse=${() => setFilterCollapsed((valueCurrent) => !valueCurrent)}
    />
    <div className="ab-source-line">${derived.sourceRowsLabel}</div>
    <${FunnelDashboard} filteredTests=${derived.filteredTests} store=${store} />
    ${derived.showTests ? html`<${TestsSection} tests=${derived.limitedTests} />` : null}
    ${derived.showProducts ? html`<${ProductsSection} products=${derived.filteredProducts} />` : null}
  </${Fragment}>`;
}

const rootEl = document.getElementById("abTestsContent");
if (rootEl) {
  createRoot(rootEl).render(html`<${DashboardApp} />`);
}
