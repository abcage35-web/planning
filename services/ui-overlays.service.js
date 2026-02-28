function renderRecommendationsCell(row, options = {}) {
  const compact = options.compact === true;
  const value = getRecommendationValue(row?.data);
  const refsCount = Number.isInteger(row?.data?.recommendationKnownCount)
    ? row.data.recommendationKnownCount
    : Array.isArray(row?.data?.recommendationRefs)
      ? row.data.recommendationRefs.length
      : 0;

  if (value === true) {
    const refsLabel = refsCount > 0 ? `товаров: ${refsCount}` : "детали";
    if (compact) {
      return `<button class="pill pill-ok pill-compact rec-pill rec-pill-compact" data-action="recommendations" data-id="${row.id}" type="button" title="Открыть детали рекомендаций (${refsLabel})">
      <span class="rec-pill-mark" aria-hidden="true"></span>
      <span>Да</span>
      <span class="rec-pill-mini">${refsCount > 0 ? refsCount : "i"}</span>
    </button>`;
    }

    return `<button class="pill pill-ok rec-pill" data-action="recommendations" data-id="${row.id}" type="button" title="Открыть детали рекомендаций">
      <span class="rec-pill-mark" aria-hidden="true"></span>
      <span>Да</span>
      <span class="rec-pill-hint">клик · ${refsLabel}</span>
    </button>`;
  }

  if (value === false) {
    return compact ? '<span class="pill pill-no pill-compact">Нет</span>' : '<span class="pill pill-no">Нет</span>';
  }

  return compact ? '<span class="pill pill-na pill-compact">Н/Д</span>' : '<span class="pill pill-na">Н/Д</span>';
}

function renderNullableCount(value, options = {}) {
  const compact = options.compact === true;
  if (value === null || value === undefined || value === "") {
    return compact ? '<span class="pill pill-na pill-compact">Н/Д</span>' : '<span class="pill pill-na">Н/Д</span>';
  }
  return `<span class="mono${compact ? " mono-compact" : ""}">${escapeHtml(String(value))}</span>`;
}

function renderRichCell(row, options = {}) {
  const data = row?.data || null;
  const compact = options.compact === true;
  if (!data) {
    return compact ? '<span class="pill pill-na pill-compact">Н/Д</span>' : '<span class="pill pill-na">Н/Д</span>';
  }

  if (data.hasRich === true) {
    const detailsCount = Number.isInteger(data.richBlockCount) ? data.richBlockCount : data.richDetails?.blockCount;
    const countText =
      detailsCount === null || detailsCount === undefined ? "" : ` ${escapeHtml(String(detailsCount))}`;
    if (compact) {
      return `<button
        class="pill pill-ok pill-compact rec-pill rec-pill-compact"
        data-action="rich-content"
        data-id="${row.id}"
        type="button"
        title="Открыть рич-контент"
      >
        <span class="rec-pill-mark" aria-hidden="true"></span>
        <span>Да${countText}</span>
      </button>`;
    }
    return `<button class="pill pill-ok rec-pill" data-action="rich-content" data-id="${row.id}" type="button" title="Открыть рич-контент">
      <span class="rec-pill-mark" aria-hidden="true"></span>
      <span>Да${countText}</span>
      <span class="rec-pill-hint">клик · рич-блок</span>
    </button>`;
  }

  if (data.hasRich === false) {
    return compact ? '<span class="pill pill-no pill-compact">Нет</span>' : '<span class="pill pill-no">Нет</span>';
  }

  return compact ? '<span class="pill pill-na pill-compact">Н/Д</span>' : '<span class="pill pill-na">Н/Д</span>';
}

function renderChecksGroupCell(row) {
  const data = row?.data || null;
  const videoValue = getVideoValue(data);
  const tagsValue = getTagsValue(data);

  const checks = [
    { label: "Видео", valueHtml: renderBoolPill(videoValue === null ? false : videoValue, { compact: true }) },
    { label: "Рек.", valueHtml: renderRecommendationsCell(row, { compact: true }) },
    { label: "Рич", valueHtml: renderRichCell(row, { compact: true }) },
    { label: "Авто", valueHtml: renderBoolPill(getAutoplayValue(data), { compact: true }) },
    { label: "Тэги", valueHtml: renderBoolPill(tagsValue === null ? false : tagsValue, { compact: true }) },
    { label: "Дубль", valueHtml: renderCoverDuplicatePill(getCoverDuplicateValue(data), { compact: true }) },
  ];

  return `<div class="checks-grid">
    ${checks
      .map(
        (item) => `<div class="check-item">
      <span class="check-label">${escapeHtml(item.label)}</span>
      <span class="check-value">${item.valueHtml}</span>
    </div>`,
      )
      .join("")}
  </div>`;
}

function renderSlidesCell(slides, rowId = "") {
  const allSlides = Array.isArray(slides) ? slides.filter(Boolean) : [];
  const visibleSlides = allSlides.slice(0, LISTING_MAX_SLIDES);
  const placeholdersCount = Math.max(0, LISTING_MAX_SLIDES - visibleSlides.length);

  const items = visibleSlides
    .map((url, index) => {
      const label = index === 0 ? "Обложка" : `Слайд ${index}`;
      const caption = `${label}`;
      const thumbUrl = toSlideThumbUrl(url);
      const previewUrl = toSlidePreviewUrl(url);

      return `<div class="slide-item">
        <span class="slide-label">${label}</span>
        <a
          href="${previewUrl}"
          class="slide-thumb"
          data-action="preview"
          data-row-id="${escapeAttr(rowId)}"
          data-slide-index="${index}"
          data-url="${previewUrl}"
          data-caption="${escapeAttr(caption)}"
          title="${escapeAttr(caption)}"
        >
          <img src="${thumbUrl}" alt="${escapeAttr(caption)}" loading="lazy" decoding="async" />
        </a>
      </div>`;
    })
    .join("");

  const placeholders = Array.from(
    { length: placeholdersCount },
    () => '<div class="slide-item slide-item-placeholder" aria-hidden="true"></div>',
  ).join("");

  const totalText =
    allSlides.length > LISTING_MAX_SLIDES
      ? `Всего слайдов: ${allSlides.length} (показаны первые ${LISTING_MAX_SLIDES})`
      : `Всего слайдов: ${allSlides.length}`;

  return `<div class="slides-wrap">
    <div class="slides-grid">${items}${placeholders}</div>
    <div class="mono slides-total">${escapeHtml(totalText)}</div>
  </div>`;
}

function buildPreviewItemsFromRow(row) {
  const slides = Array.isArray(row?.data?.slides) ? row.data.slides.filter(Boolean) : [];
  if (slides.length === 0) {
    return [];
  }

  return slides.map((url, index) => ({
    url: toSlidePreviewUrl(url),
    thumb: toSlideThumbUrl(url),
    caption: index === 0 ? "Обложка" : `Слайд ${index}`,
  }));
}

function openPreviewForRow(rowId, startIndex = 0) {
  const row = getRowById(rowId);
  const items = buildPreviewItemsFromRow(row);
  if (items.length === 0) {
    return;
  }

  const index = Math.max(0, Math.min(items.length - 1, Number(startIndex) || 0));
  const titlePrefix = row?.nmId ? `Артикул ${row.nmId}` : "";
  openPreviewGallery(items, index, titlePrefix, rowId);
}

function openPreview(url, caption) {
  const normalizedUrl = toSlidePreviewUrl(url);
  if (!normalizedUrl) {
    return;
  }

  openPreviewGallery(
    [
      {
        url: normalizedUrl,
        thumb: toSlideThumbUrl(normalizedUrl),
        caption: caption || "Слайд",
      },
    ],
    0,
    "",
    "",
  );
}

function openPreviewGallery(items, startIndex = 0, titlePrefix = "", rowId = "") {
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  previewGallery.items = items.filter((item) => item && item.url).map((item) => ({
    url: String(item.url),
    thumb: String(item.thumb || toSlideThumbUrl(item.url)),
    caption: String(item.caption || "Слайд"),
  }));
  if (previewGallery.items.length === 0) {
    return;
  }

  previewGallery.currentIndex = Math.max(0, Math.min(previewGallery.items.length - 1, Number(startIndex) || 0));
  previewGallery.titlePrefix = String(titlePrefix || "");
  previewGallery.rowId = String(rowId || "");
  el.previewModal.hidden = false;
  renderPreviewGallery();
  requestAnimationFrame(() => {
    syncPreviewThumbStripPosition("auto");
  });
}

function closePreview() {
  el.previewModal.hidden = true;
  previewGallery.items = [];
  previewGallery.currentIndex = 0;
  previewGallery.titlePrefix = "";
  previewGallery.rowId = "";
  el.previewImage.src = "";
  el.previewCaption.textContent = "";
  if (el.previewThumbs) {
    el.previewThumbs.innerHTML = "";
  }
  updatePreviewRefreshButtonState();
}

function setPreviewIndex(nextIndex) {
  if (!Array.isArray(previewGallery.items) || previewGallery.items.length === 0) {
    return;
  }

  const clamped = Math.max(0, Math.min(previewGallery.items.length - 1, Number(nextIndex) || 0));
  if (clamped === previewGallery.currentIndex) {
    return;
  }

  previewGallery.currentIndex = clamped;
  renderPreviewGallery();
}

function stepPreview(direction) {
  if (!Array.isArray(previewGallery.items) || previewGallery.items.length <= 1) {
    return;
  }

  const next = previewGallery.currentIndex + Number(direction || 0);
  if (next < 0 || next >= previewGallery.items.length) {
    return;
  }

  previewGallery.currentIndex = next;
  renderPreviewGallery();
}

function renderPreviewGallery() {
  if (!Array.isArray(previewGallery.items) || previewGallery.items.length === 0) {
    return;
  }

  const current = previewGallery.items[previewGallery.currentIndex];
  if (!current) {
    return;
  }

  el.previewImage.src = current.url;
  const total = previewGallery.items.length;
  const baseCaption = current.caption || "Слайд";
  const prefix = previewGallery.titlePrefix ? `${previewGallery.titlePrefix} · ` : "";
  const position = total > 1 ? ` (${previewGallery.currentIndex + 1}/${total})` : "";
  el.previewCaption.textContent = `${prefix}${baseCaption}${position}`;
  updatePreviewRefreshButtonState();

  if (el.previewPrevBtn) {
    el.previewPrevBtn.disabled = total <= 1 || previewGallery.currentIndex <= 0;
    el.previewPrevBtn.hidden = total <= 1;
  }
  if (el.previewNextBtn) {
    el.previewNextBtn.disabled = total <= 1 || previewGallery.currentIndex >= total - 1;
    el.previewNextBtn.hidden = total <= 1;
  }

  if (el.previewThumbs) {
    if (total <= 1) {
      el.previewThumbs.innerHTML = "";
      return;
    }

    el.previewThumbs.innerHTML = previewGallery.items
      .map((item, index) => {
        const activeClass = index === previewGallery.currentIndex ? " is-active" : "";
        return `<button class="preview-thumb${activeClass}" type="button" data-preview-index="${index}" title="${escapeAttr(
          item.caption || `Слайд ${index + 1}`,
        )}">
          <img src="${item.thumb}" alt="${escapeAttr(item.caption || `Слайд ${index + 1}`)}" loading="lazy" decoding="async" />
        </button>`;
      })
      .join("");

    syncPreviewThumbStripPosition("smooth");
  }
}

function updatePreviewRefreshButtonState() {
  if (!el.previewRefreshBtn) {
    return;
  }

  const rowId = String(previewGallery.rowId || "").trim();
  const row = rowId ? getRowById(rowId) : null;
  const hasRowContext = Boolean(rowId && row);
  el.previewRefreshBtn.hidden = !hasRowContext;
  if (!hasRowContext) {
    el.previewRefreshBtn.disabled = true;
    el.previewRefreshBtn.textContent = "Обновить";
    return;
  }

  el.previewRefreshBtn.disabled = row.loading === true || state.isBulkLoading === true;
  el.previewRefreshBtn.textContent = row.loading ? "Обновляю..." : "Обновить";
}

async function refreshPreviewOverlay() {
  const rowId = String(previewGallery.rowId || "").trim();
  if (!rowId) {
    return;
  }

  const row = getRowById(rowId);
  if (!row || row.loading || state.isBulkLoading) {
    return;
  }

  const currentIndex = Number(previewGallery.currentIndex) || 0;
  updatePreviewRefreshButtonState();
  await loadSingleRowWithProgress(rowId, {
    mode: "content-only",
    forceHostProbe: true,
    source: "manual",
    actionKey: "preview-refresh",
    loadingText: "Обновляю листинг",
  });
  const freshRow = getRowById(rowId);
  const freshItems = buildPreviewItemsFromRow(freshRow);
  if (freshItems.length <= 0) {
    closePreview();
    return;
  }

  const nextIndex = Math.max(0, Math.min(freshItems.length - 1, currentIndex));
  const titlePrefix = freshRow?.nmId ? `Артикул ${freshRow.nmId}` : previewGallery.titlePrefix || "";
  openPreviewGallery(freshItems, nextIndex, titlePrefix, rowId);
}

function syncPreviewThumbStripPosition(behavior = "smooth") {
  if (!el.previewThumbs) {
    return;
  }

  const activeThumb = el.previewThumbs.querySelector(".preview-thumb.is-active");
  if (!activeThumb) {
    return;
  }

  const strip = el.previewThumbs;
  const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
  if (maxScrollLeft <= 0) {
    return;
  }

  const rightGap = 10;
  const targetLeft = activeThumb.offsetLeft - (strip.clientWidth - activeThumb.offsetWidth - rightGap);
  const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, targetLeft));
  const delta = Math.abs(strip.scrollLeft - nextScrollLeft);
  if (delta < 1) {
    return;
  }

  strip.scrollTo({
    left: nextScrollLeft,
    behavior: behavior === "auto" ? "auto" : "smooth",
  });
}

function openLimitsModal(preferredKind = "autoplay") {
  if (!el.limitsModal) {
    return;
  }
  el.limitsModal.dataset.preferredKind = preferredKind;
  renderLimitsModalContent(preferredKind);
  el.limitsModal.hidden = false;
}

function closeLimitsModal() {
  if (!el.limitsModal) {
    return;
  }
  el.limitsModal.hidden = true;
  delete el.limitsModal.dataset.preferredKind;
}

function renderLimitsModalContent(preferredKind = "") {
  if (!el.limitsContent) {
    return;
  }

  const kind = String(preferredKind || el.limitsModal?.dataset?.preferredKind || "").trim();
  const autoplayUsage = getAutoplayUsageByCabinet();
  const tagsUsage = getTagsUsageByCabinet();
  const controlsDisabled = state.isBulkLoading;

  const sectionHtml = (sectionKey, title, globalValue, globalAttr, cabinetAttr, usage, usedLabel) => {
    const isPreferred = kind === sectionKey ? " is-preferred" : "";
    return `<section class="limits-section${isPreferred}">
      <div class="limits-section-head">
        <h4>${escapeHtml(title)}</h4>
        <label class="limits-global-field">
          <span>Общий лимит</span>
          <input
            type="number"
            min="${AUTOPLAY_LIMIT_MIN}"
            max="${AUTOPLAY_LIMIT_MAX}"
            step="1"
            ${globalAttr}
            value="${escapeAttr(String(globalValue))}"
            ${controlsDisabled ? "disabled" : ""}
          />
        </label>
      </div>
      <div class="limits-cabinet-list">
        ${usage
          .map((item) => {
            const localValue = item.hasOverride ? String(item.limit) : "";
            return `<div class="limits-cabinet-row${item.over > 0 ? " is-over" : ""}">
              <span class="limits-cabinet-name">${escapeHtml(item.cabinet)}</span>
              <span class="limits-cabinet-usage">${escapeHtml(`${usedLabel}: ${item.used}/${item.limit}`)}</span>
              <span class="limits-cabinet-fill">${escapeHtml(`Заполнено: ${item.used}/${item.totalRows}`)}</span>
              <input
                type="number"
                min="${AUTOPLAY_LIMIT_MIN}"
                max="${AUTOPLAY_LIMIT_MAX}"
                step="1"
                ${cabinetAttr}="${escapeAttr(item.cabinet)}"
                value="${escapeAttr(localValue)}"
                placeholder="${escapeAttr(String(globalValue))}"
                ${controlsDisabled ? "disabled" : ""}
              />
            </div>`;
          })
          .join("")}
      </div>
    </section>`;
  };

  const autoplayNormalized = autoplayUsage.map((item) => ({
    ...item,
    used: item.autoplayUsed,
  }));
  const tagsNormalized = tagsUsage.map((item) => ({
    ...item,
    used: item.tagsUsed,
  }));

  el.limitsContent.innerHTML = `
    ${sectionHtml(
      "autoplay",
      "Автоплей по кабинетам",
      normalizeAutoplayLimit(state.autoplayLimitPerCabinet),
      'data-autoplay-global-limit="1"',
      "data-cabinet-limit",
      autoplayNormalized,
      "Использовано",
    )}
    ${sectionHtml(
      "tags",
      "Тэги по кабинетам",
      normalizeTagsLimit(state.tagsLimitPerCabinet),
      'data-tags-global-limit="1"',
      "data-tags-cabinet-limit",
      tagsNormalized,
      "Использовано",
    )}
  `;
}

function buildRichPreviewItems(details) {
  const media = Array.isArray(details?.media) ? details.media : [];
  return media
    .map((url, index) => {
      const normalized = toSlidePreviewUrl(url);
      if (!normalized) {
        return null;
      }
      return {
        url: normalized,
        thumb: toSlideThumbUrl(normalized),
        caption: `Рич-медиа ${index + 1}`,
      };
    })
    .filter(Boolean);
}

function setRichModalIndex(nextIndex, options = {}) {
  if (!el.richContent || !Array.isArray(richGallery.items) || richGallery.items.length === 0) {
    return;
  }
  const scrollThumb = options.scrollThumb !== false;
  const scrollStream = options.scrollStream !== false;
  const behavior = options.behavior === "auto" ? "auto" : "smooth";
  const clamped = Math.max(0, Math.min(richGallery.items.length - 1, Number(nextIndex) || 0));
  richGallery.currentIndex = clamped;
  const current = richGallery.items[clamped];
  if (!current) {
    return;
  }

  const total = richGallery.items.length;
  if (el.richCaption) {
    el.richCaption.textContent = `${richGallery.titlePrefix || "Рич-контент"} · Слайд ${clamped + 1} (${clamped + 1}/${total})`;
  }

  const buttons = el.richContent.querySelectorAll("[data-action='rich-select']");
  buttons.forEach((button, index) => {
    button.classList.toggle("is-active", index === clamped);
    button.setAttribute("aria-current", index === clamped ? "true" : "false");
  });

  if (scrollThumb) {
    const strip = el.richContent.querySelector("[data-rich-strip]");
    const activeThumb = el.richContent.querySelector(`[data-action='rich-select'][data-rich-index='${clamped}']`);
    if (strip && activeThumb) {
      const thumbTop = activeThumb.offsetTop;
      const thumbBottom = thumbTop + activeThumb.offsetHeight;
      const viewTop = strip.scrollTop;
      const viewBottom = viewTop + strip.clientHeight;
      if (thumbTop < viewTop + 8) {
        strip.scrollTop = Math.max(0, thumbTop - 8);
      } else if (thumbBottom > viewBottom - 8) {
        strip.scrollTop = thumbBottom - strip.clientHeight + 8;
      }
    }
  }

  if (!scrollStream) {
    return;
  }
  const stream = el.richContent.querySelector("[data-rich-stage-stream]");
  const stageItem = stream?.querySelector(`[data-rich-stage-index='${clamped}']`);
  if (!stream || !stageItem) {
    return;
  }
  stream.scrollTo({
    top: stageItem.offsetTop,
    behavior,
  });
}

function stepRichModal(direction) {
  if (!Array.isArray(richGallery.items) || richGallery.items.length <= 1) {
    return;
  }
  const next = richGallery.currentIndex + Number(direction || 0);
  if (next < 0 || next >= richGallery.items.length) {
    return;
  }
  setRichModalIndex(next);
}

function syncRichModalIndexFromStream(stream) {
  if (!(stream instanceof HTMLElement) || !Array.isArray(richGallery.items) || richGallery.items.length === 0) {
    return;
  }
  const stageItems = Array.from(stream.querySelectorAll("[data-rich-stage-index]"));
  if (stageItems.length === 0) {
    return;
  }

  const topEdge = stream.scrollTop + 14;
  let nextIndex = 0;
  for (const item of stageItems) {
    const index = Number(item.dataset.richStageIndex);
    if (!Number.isInteger(index)) {
      continue;
    }
    if (item.offsetTop <= topEdge) {
      nextIndex = index;
    } else {
      break;
    }
  }

  if (nextIndex === richGallery.currentIndex) {
    return;
  }
  setRichModalIndex(nextIndex, { scrollStream: false, scrollThumb: true, behavior: "auto" });
}

function updateRichRefreshButtonState() {
  if (!el.richRefreshBtn || !el.richContent) {
    return;
  }

  const rowId = String(el.richContent.dataset.rowId || "").trim();
  const row = rowId ? getRowById(rowId) : null;
  const hasRowContext = Boolean(rowId && row);
  el.richRefreshBtn.hidden = !hasRowContext;
  if (!hasRowContext) {
    el.richRefreshBtn.disabled = true;
    el.richRefreshBtn.textContent = "Обновить";
    return;
  }

  el.richRefreshBtn.disabled = row.loading === true || state.isBulkLoading === true;
  el.richRefreshBtn.textContent = row.loading ? "Обновляю..." : "Обновить";
}

async function refreshRichOverlay() {
  if (!el.richContent) {
    return;
  }
  const rowId = String(el.richContent.dataset.rowId || "").trim();
  if (!rowId) {
    return;
  }
  const row = getRowById(rowId);
  if (!row || row.loading || state.isBulkLoading) {
    return;
  }

  const currentIndex = Number(richGallery.currentIndex) || 0;
  updateRichRefreshButtonState();
  await loadSingleRowWithProgress(rowId, {
    mode: "content-only",
    forceHostProbe: true,
    source: "manual",
    actionKey: "rich-refresh",
    loadingText: "Обновляю рич-контент",
  });
  await openRichContent(rowId, { startIndex: currentIndex });
}

async function openRichContent(rowId, options = {}) {
  const row = getRowById(rowId);
  if (!row || !el.richModal || !el.richContent || !el.richCaption) {
    return;
  }
  const startIndex = Number(options.startIndex) || 0;
  richGallery.items = [];
  richGallery.currentIndex = 0;
  richGallery.titlePrefix = `Артикул ${row.nmId} · Рич-контент`;
  el.richCaption.textContent = richGallery.titlePrefix;
  el.richContent.dataset.rowId = row.id;
  el.richModal.hidden = false;
  updateRichRefreshButtonState();

  if (!row.data) {
    el.richContent.innerHTML = '<div class="recommendation-empty">Строка еще не загружена. Нажмите "Обновить".</div>';
    return;
  }

  if (row.data.hasRich !== true) {
    el.richContent.innerHTML = '<div class="recommendation-empty">Рич-контент в карточке не обнаружен.</div>';
    return;
  }

  const details = normalizeRichDetails(row.data.richDetails) || { blockCount: 0, media: [], links: [], snippets: [] };
  const richItems = buildRichPreviewItems(details);
  richGallery.items = richItems;
  richGallery.currentIndex = 0;

  const mediaHtml =
    richItems.length > 0
      ? `<div class="rich-viewer-wrap">
        <div class="rich-viewer">
          <div class="rich-strip" data-rich-strip>
            ${richItems
              .map(
                (item, index) => `<button
                  class="rich-strip-item${index === 0 ? " is-active" : ""}"
                  type="button"
                  data-action="rich-select"
                  data-rich-index="${index}"
                  aria-label="Рич-медиа ${index + 1}"
                  aria-current="${index === 0 ? "true" : "false"}"
                >
                  <img src="${escapeAttr(item.thumb || item.url)}" alt="Рич медиа ${index + 1}" loading="lazy" decoding="async" />
                  <span class="rich-strip-index">${index + 1}</span>
                </button>`,
              )
              .join("")}
          </div>
          <div class="rich-stage-pane">
            <div class="rich-stage-stream" data-rich-stage-stream>
              ${richItems
                .map(
                  (item, index) => `<figure class="rich-stage-item" data-rich-stage-index="${index}">
                    <img src="${escapeAttr(item.url)}" alt="${escapeAttr(item.caption)}" loading="lazy" decoding="async" />
                  </figure>`,
                )
                .join("")}
            </div>
          </div>
        </div>
      </div>`
      : '<div class="recommendation-empty">В rich-данных не найдено медиа для предпросмотра.</div>';

  el.richContent.innerHTML = mediaHtml;
  if (richItems.length > 0) {
    const initialIndex = Math.max(0, Math.min(richItems.length - 1, startIndex));
    setRichModalIndex(initialIndex, { scrollThumb: false, scrollStream: false, behavior: "auto" });
  }
}

function closeRichContent() {
  if (!el.richModal) {
    return;
  }
  if (richGallery.scrollRaf) {
    cancelAnimationFrame(richGallery.scrollRaf);
    richGallery.scrollRaf = 0;
  }
  richGallery.items = [];
  richGallery.currentIndex = 0;
  richGallery.titlePrefix = "";
  el.richModal.hidden = true;
  if (el.richCaption) {
    el.richCaption.textContent = "Рич-контент";
  }
  if (el.richContent) {
    el.richContent.innerHTML = "";
    delete el.richContent.dataset.rowId;
  }
  updateRichRefreshButtonState();
}

const COLOR_VARIANT_FETCH_CONCURRENCY = 3;
const colorVariantFetchInflight = new Map();
let colorVariantCachePersistTimer = 0;

function normalizeColorVariantSummary(summaryRaw, nmIdHint = "") {
  const fallbackNmId = String(nmIdHint || "").trim();
  const nmId = String(summaryRaw?.nmId || fallbackNmId).trim();
  const numericNmId = Number(nmId);
  return {
    nmId,
    link: String(summaryRaw?.link || `https://www.wildberries.ru/catalog/${nmId}/detail.aspx`),
    name: String(summaryRaw?.name || ""),
    category: String(summaryRaw?.category || ""),
    brand: String(summaryRaw?.brand || ""),
    cover: String(summaryRaw?.cover || ""),
    stockValue: Number.isFinite(summaryRaw?.stockValue) ? Math.max(0, Math.round(summaryRaw.stockValue)) : null,
    inStock: typeof summaryRaw?.inStock === "boolean" ? summaryRaw.inStock : null,
    currentPrice: Number.isFinite(summaryRaw?.currentPrice) ? Math.max(0, Math.round(summaryRaw.currentPrice)) : null,
    rating: Number.isFinite(summaryRaw?.rating) ? Math.round(Number(summaryRaw.rating) * 10) / 10 : null,
    _numericNmId: Number.isInteger(numericNmId) && numericNmId > 0 ? numericNmId : null,
  };
}

function getColorVariantCacheEntry(nmIdRaw) {
  const nmId = String(nmIdRaw || "").trim();
  if (!nmId || !state.colorVariantsCache || typeof state.colorVariantsCache !== "object") {
    return null;
  }
  const entry = state.colorVariantsCache[nmId];
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const updatedAt = Number(entry.updatedAt);
  const data = entry.data && typeof entry.data === "object" ? entry.data : null;
  if (!Number.isFinite(updatedAt) || updatedAt <= 0 || !data) {
    return null;
  }
  return {
    updatedAt,
    data: normalizeColorVariantSummary(data, nmId),
  };
}

function getColorVariantSummaryFromCache(nmIdRaw, options = {}) {
  const allowStale = options.allowStale === true;
  const entry = getColorVariantCacheEntry(nmIdRaw);
  if (!entry) {
    return null;
  }
  if (!allowStale && Date.now() - entry.updatedAt > COLOR_VARIANT_CACHE_TTL_MS) {
    return null;
  }
  return { ...entry.data };
}

function setColorVariantSummaryCache(summaryRaw, options = {}) {
  const persist = options.persist !== false;
  const normalized = normalizeColorVariantSummary(summaryRaw, summaryRaw?.nmId);
  const nmId = String(normalized.nmId || "").trim();
  if (!/^\d{6,}$/.test(nmId)) {
    return normalized;
  }

  const entry = {
    updatedAt: Date.now(),
    data: {
      nmId: normalized.nmId,
      link: normalized.link,
      name: normalized.name,
      category: normalized.category,
      brand: normalized.brand,
      cover: normalized.cover,
      stockValue: normalized.stockValue,
      inStock: normalized.inStock,
      currentPrice: normalized.currentPrice,
      rating: normalized.rating,
    },
  };

  if (!state.colorVariantsCache || typeof state.colorVariantsCache !== "object") {
    state.colorVariantsCache = {};
  }
  state.colorVariantsCache[nmId] = entry;

  if (persist) {
    scheduleColorVariantCachePersist();
  }

  return normalizeColorVariantSummary(entry.data, nmId);
}

function scheduleColorVariantCachePersist() {
  if (colorVariantCachePersistTimer) {
    return;
  }
  colorVariantCachePersistTimer = window.setTimeout(() => {
    colorVariantCachePersistTimer = 0;
    persistState();
  }, 220);
}

function buildEmptyColorVariantSummary(nmIdRaw) {
  const nmId = String(nmIdRaw || "").trim();
  return normalizeColorVariantSummary(
    {
      nmId,
      link: `https://www.wildberries.ru/catalog/${nmId || nmIdRaw}/detail.aspx`,
      name: "",
      category: "",
      brand: "",
      cover: "",
      stockValue: null,
      inStock: null,
      currentPrice: null,
      rating: null,
    },
    nmId,
  );
}

function mergeColorVariantSummaryWithFallback(primaryRaw, fallbackRaw, nmIdHint = "") {
  const primary = normalizeColorVariantSummary(primaryRaw || {}, nmIdHint);
  const fallback = fallbackRaw ? normalizeColorVariantSummary(fallbackRaw, nmIdHint) : null;
  if (!fallback) {
    return primary;
  }

  return normalizeColorVariantSummary(
    {
      nmId: primary.nmId || fallback.nmId || String(nmIdHint || "").trim(),
      link: primary.link || fallback.link,
      name: primary.name || fallback.name,
      category: primary.category || fallback.category,
      brand: primary.brand || fallback.brand,
      cover: primary.cover || fallback.cover,
      stockValue: Number.isFinite(primary.stockValue) ? primary.stockValue : fallback.stockValue,
      inStock: typeof primary.inStock === "boolean" ? primary.inStock : fallback.inStock,
      currentPrice: Number.isFinite(primary.currentPrice) ? primary.currentPrice : fallback.currentPrice,
      rating: Number.isFinite(primary.rating) ? primary.rating : fallback.rating,
    },
    nmIdHint || primary.nmId || fallback.nmId,
  );
}

function getColorVariantSummaryFromRows(nmIdRaw) {
  const nmId = String(nmIdRaw || "").trim();
  if (!/^\d{6,}$/.test(nmId)) {
    return null;
  }

  const row = getRowByNmId(nmId);
  if (!row || row.error) {
    return null;
  }

  const hasUsefulRowData =
    Boolean(row.data) ||
    Number.isFinite(row.stockValue) ||
    Number.isFinite(row.currentPrice) ||
    typeof row.inStock === "boolean";
  if (!hasUsefulRowData) {
    return null;
  }

  return buildColorVariantSummaryFromRow(row);
}

async function openColorVariants(rowId, options = {}) {
  const forceRefresh = options.forceRefresh === true;
  const skipBackgroundFetch = options.skipBackgroundFetch === true;
  const row = getRowById(rowId);
  if (!row) {
    return;
  }

  const data = row.data;
  el.recommendationsTitle.textContent = `Склейка ${row.nmId} (0)`;
  el.recommendationsSubtle.textContent = "";
  if (el.recommendationsSubtle) {
    el.recommendationsSubtle.hidden = true;
  }
  if (el.recommendationsContent) {
    el.recommendationsContent.dataset.rowId = row.id;
    el.recommendationsContent.dataset.mode = "color-variants";
  }
  el.recommendationsModal.hidden = false;
  updateRecommendationsRefreshButtonState();

  if (!data) {
    el.recommendationsContent.innerHTML =
      '<div class="recommendation-empty">Строка еще не загружена. Нажмите "Обновить".</div>';
    return;
  }

  const ids = normalizeRecommendationRefs(
    Array.isArray(data.colorNmIds) ? data.colorNmIds : [],
    row.nmId,
  );
  const count = ids.length;
  el.recommendationsTitle.textContent = `Склейка ${row.nmId} (${count})`;

  if (count <= 0) {
    el.recommendationsContent.innerHTML =
      '<div class="recommendation-empty">Склейки (colors) в публичных данных WB не найдены.</div>';
    return;
  }

  let touchedCache = false;
  const variantsByNmId = new Map();
  for (const nmId of ids) {
    if (forceRefresh) {
      const cachedStale = getColorVariantSummaryFromCache(nmId, { allowStale: true });
      if (cachedStale) {
        variantsByNmId.set(nmId, cachedStale);
      }
      continue;
    }

    const fromRows = getColorVariantSummaryFromRows(nmId);
    const cached = getColorVariantSummaryFromCache(nmId, { allowStale: true });
    if (fromRows) {
      const merged = mergeColorVariantSummaryWithFallback(fromRows, cached, nmId);
      setColorVariantSummaryCache(merged, { persist: false });
      variantsByNmId.set(nmId, merged);
      touchedCache = true;
      continue;
    }

    if (cached) {
      variantsByNmId.set(nmId, cached);
      continue;
    }

    const placeholder = buildEmptyColorVariantSummary(nmId);
    setColorVariantSummaryCache(placeholder, { persist: false });
    variantsByNmId.set(nmId, placeholder);
    touchedCache = true;
  }

  const variantsForRender = ids.map((nmId) => variantsByNmId.get(nmId) || buildEmptyColorVariantSummary(nmId));
  el.recommendationsContent.innerHTML = renderColorVariantsOverlayContent(ids, variantsForRender);
  if (touchedCache) {
    scheduleColorVariantCachePersist();
  }

  if (skipBackgroundFetch) {
    return;
  }

  const queue = ids.filter((nmId) => {
    const inLocalRows = Boolean(getRowByNmId(nmId));
    if (!inLocalRows) {
      return false;
    }
    if (forceRefresh) {
      return true;
    }
    const summary = variantsByNmId.get(nmId);
    if (!summary) {
      return true;
    }
    const hasUseful =
      Boolean(String(summary.name || "").trim()) ||
      Boolean(String(summary.category || "").trim()) ||
      Boolean(String(summary.brand || "").trim()) ||
      Number.isFinite(summary.currentPrice) ||
      Number.isFinite(summary.stockValue) ||
      typeof summary.inStock === "boolean" ||
      Number.isFinite(summary.rating) ||
      Boolean(String(summary.cover || "").trim());
    return !hasUseful;
  });

  if (queue.length <= 0) {
    return;
  }

  const refreshRowId = row.id;
  Promise.resolve()
    .then(async () => {
      await runWithConcurrency(queue, COLOR_VARIANT_FETCH_CONCURRENCY, async (nmId) => {
        try {
          await resolveColorVariantSummary(nmId, { forceRefresh });
        } catch {
          return;
        }
      });
    })
    .then(() => {
      const isActive =
        !el.recommendationsModal.hidden &&
        el.recommendationsContent &&
        String(el.recommendationsContent.dataset.mode || "") === "color-variants" &&
        String(el.recommendationsContent.dataset.rowId || "") === String(refreshRowId);
      if (!isActive) {
        return;
      }
      openColorVariants(refreshRowId, { forceRefresh: false, skipBackgroundFetch: true }).catch(() => {});
    })
    .catch(() => {});
}

function renderColorVariantsOverlayContent(ids, variants) {
  const count = Array.isArray(ids) ? ids.length : 0;
  const list = Array.isArray(variants) ? variants : [];
  const canManageRows = typeof hasAdminAccess === "function" ? hasAdminAccess() : true;

  const cardsHtml = list
    .map((item) => {
      const fallbackName = `Артикул ${item.nmId}`;
      const title = item.name || fallbackName;
      const stockText = formatVariantStock(item.stockValue, item.inStock);
      const priceText = formatVariantPrice(item.currentPrice);
      const ratingText = formatVariantRating(item.rating);
      const category = item.category || "-";
      const brand = item.brand || "-";
      const coverThumb = toSlideThumbUrl(item.cover || "");
      const existsInBase = Boolean(getRowByNmId(item.nmId));
      const canAddToBase = canManageRows && !existsInBase && /^\d{6,}$/.test(String(item.nmId || ""));

      const coverHtml =
        coverThumb || item.cover
          ? `<div class="color-variant-cover" aria-hidden="true">
          <img src="${escapeAttr(coverThumb || item.cover || "")}" alt="${escapeAttr(title)}" loading="lazy" decoding="async" />
        </div>`
          : '<div class="color-variant-cover color-variant-cover-empty">Нет обложки</div>';

      return `<article class="color-variant-card">
        ${coverHtml}
        <div class="color-variant-main">
          <a class="wb-link color-variant-title" href="${item.link}" target="_blank" rel="noopener noreferrer">${escapeHtml(
            title,
          )}</a>
          <div class="color-variant-id mono">${escapeHtml(item.nmId)}</div>
          <div class="recommendation-meta color-variant-meta">${escapeHtml(category)} · ${escapeHtml(brand)}</div>
          <div class="color-variant-stats">
            <span class="color-variant-stat">Остаток: ${escapeHtml(stockText)}</span>
            <span class="color-variant-stat">Цена: ${escapeHtml(priceText)}</span>
            <span class="color-variant-stat">Рейтинг: ${escapeHtml(ratingText)}</span>
          </div>
          ${
            canAddToBase
              ? `<button class="color-variant-add-btn" type="button" data-action="color-variant-add" data-nm-id="${escapeAttr(
                  item.nmId,
                )}">Добавить в базу</button>`
              : ""
          }
        </div>
      </article>`;
    })
    .join("");

  return `
    <div class="recommendation-summary recommendation-summary-ids overlay-note">
      <strong>Артикулы склейки:</strong> <span class="mono">${escapeHtml((ids || []).join(", "))}</span>
    </div>
    <div class="color-variants-grid">${cardsHtml}</div>
  `;
}

async function prefetchColorVariantsForRow(rowId, options = {}) {
  const row = getRowById(rowId);
  if (!row?.data) {
    return;
  }
  const requestSignal = options.requestSignal || null;
  const localOnly = options.localOnly === true;
  if (requestSignal && requestSignal.aborted) {
    return;
  }

  const ids = normalizeRecommendationRefs(Array.isArray(row.data.colorNmIds) ? row.data.colorNmIds : [], row.nmId);
  if (ids.length <= 0) {
    return;
  }

  const forceRefresh = options.forceRefresh === true;
  if (localOnly) {
    let touched = false;
    for (const nmId of ids) {
      const fromRows = getColorVariantSummaryFromRows(nmId);
      if (fromRows) {
        const cached = getColorVariantSummaryFromCache(nmId, { allowStale: true });
        const merged = mergeColorVariantSummaryWithFallback(fromRows, cached, nmId);
        setColorVariantSummaryCache(merged, { persist: false });
        touched = true;
        continue;
      }

      const cached = getColorVariantSummaryFromCache(nmId, { allowStale: true });
      if (!cached) {
        setColorVariantSummaryCache(buildEmptyColorVariantSummary(nmId), { persist: false });
        touched = true;
      }
    }
    if (touched) {
      scheduleColorVariantCachePersist();
    }
    return;
  }

  let usedRowsSnapshot = false;
  const queue = forceRefresh
    ? ids
    : ids.filter((nmId) => {
        const fromRows = getColorVariantSummaryFromRows(nmId);
        if (fromRows) {
          const cached = getColorVariantSummaryFromCache(nmId, { allowStale: true });
          const merged = mergeColorVariantSummaryWithFallback(fromRows, cached, nmId);
          setColorVariantSummaryCache(merged, { persist: false });
          usedRowsSnapshot = true;
          return false;
        }
        return !getColorVariantSummaryFromCache(nmId, { allowStale: false });
      });
  if (queue.length <= 0) {
    if (usedRowsSnapshot) {
      scheduleColorVariantCachePersist();
    }
    return;
  }

  await runWithConcurrency(queue, 2, async (nmId) => {
    if (requestSignal && requestSignal.aborted) {
      return;
    }
    try {
      await resolveColorVariantSummary(nmId, { forceRefresh, requestSignal });
    } catch {
      return;
    }
  });
  if (usedRowsSnapshot) {
    scheduleColorVariantCachePersist();
  }
}

async function resolveColorVariantSummary(nmIdRaw, options = {}) {
  const forceRefresh = options.forceRefresh === true;
  const requestSignal = options.requestSignal || null;
  const nmId = String(nmIdRaw || "").trim();
  if (!/^\d{6,}$/.test(nmId)) {
    return buildEmptyColorVariantSummary(nmIdRaw);
  }
  if (requestSignal && requestSignal.aborted) {
    return buildEmptyColorVariantSummary(nmIdRaw);
  }

  if (!forceRefresh) {
    const fromRows = getColorVariantSummaryFromRows(nmId);
    if (fromRows) {
      const cached = getColorVariantSummaryFromCache(nmId, { allowStale: true });
      const merged = mergeColorVariantSummaryWithFallback(fromRows, cached, nmId);
      const normalized = setColorVariantSummaryCache(merged, { persist: false });
      if (!Number.isFinite(normalized.rating)) {
        normalized.rating = await fetchCardRating(nmId, { requestSignal });
        setColorVariantSummaryCache(normalized);
      } else {
        scheduleColorVariantCachePersist();
      }
      return normalized;
    }

    const cached = getColorVariantSummaryFromCache(nmId, { allowStale: false });
    if (cached) {
      return cached;
    }
  }

  const inflight = colorVariantFetchInflight.get(nmId);
  if (inflight) {
    return normalizeColorVariantSummary(await inflight, nmId);
  }

  const task = (async () => {
    const fetched = await fetchColorVariantSummary(nmId, { requestSignal });
    return setColorVariantSummaryCache(fetched);
  })();
  colorVariantFetchInflight.set(nmId, task);

  try {
    return normalizeColorVariantSummary(await task, nmId);
  } finally {
    if (colorVariantFetchInflight.get(nmId) === task) {
      colorVariantFetchInflight.delete(nmId);
    }
  }
}

function buildColorVariantSummaryFromRow(row) {
  const data = row?.data || {};
  const nmId = String(row?.nmId || "").trim();
  const cover = Array.isArray(data.slides) && data.slides.length > 0 ? String(data.slides[0]) : "";
  return normalizeColorVariantSummary({
    nmId,
    link: `https://www.wildberries.ru/catalog/${nmId}/detail.aspx`,
    name: String(data.name || "").trim(),
    category: String(data.category || "").trim(),
    brand: String(data.brand || "").trim(),
    cover,
    stockValue: Number.isFinite(row.stockValue) ? Math.max(0, Math.round(row.stockValue)) : null,
    inStock: typeof row.inStock === "boolean" ? row.inStock : null,
    currentPrice: Number.isFinite(row.currentPrice) ? Math.max(0, Math.round(row.currentPrice)) : null,
    rating: Number.isFinite(data.rating) ? Number(data.rating) : null,
  });
}

async function fetchColorVariantSummary(nmIdRaw, options = {}) {
  const requestSignal = options.requestSignal || null;
  const normalized = normalizeColorVariantSummary({ nmId: nmIdRaw }, nmIdRaw);
  const nmId = normalized._numericNmId;
  if (!Number.isInteger(nmId) || nmId <= 0) {
    return buildEmptyColorVariantSummary(nmIdRaw);
  }
  if (requestSignal && requestSignal.aborted) {
    return buildEmptyColorVariantSummary(nmIdRaw);
  }

  const vol = Math.floor(nmId / 100000);
  const part = Math.floor(nmId / 1000);
  const hostSuffix = await resolveBasketHost({ nmId, vol, part, requestSignal });
  const base = `https://basket-${hostSuffix}.wbbasket.ru/vol${vol}/part${part}/${nmId}`;
  const card = await fetchJson(`${base}/info/ru/card.json`, { signal: requestSignal });
  const market = await fetchCardMarketSnapshot(nmId, { basketBase: base, requestSignal });
  const rating = await fetchCardRating(nmId, { requestSignal });

  return normalizeColorVariantSummary({
    nmId: String(nmId),
    link: `https://www.wildberries.ru/catalog/${nmId}/detail.aspx`,
    name: String(card?.imt_name || card?.slug || "").trim(),
    category: String(card?.subj_name || "").trim(),
    brand: String(card?.selling?.brand_name || "").trim(),
    cover: `${base}/images/c246x328/1.webp`,
    stockValue: Number.isFinite(market.stockValue) ? Math.max(0, Math.round(market.stockValue)) : null,
    inStock: typeof market.inStock === "boolean" ? market.inStock : null,
    currentPrice: Number.isFinite(market.currentPrice) ? Math.max(0, Math.round(market.currentPrice)) : null,
    rating,
  });
}

async function fetchCardRating(nmIdRaw, options = {}) {
  const nmId = Number(nmIdRaw);
  const requestSignal = options.requestSignal || null;
  if (!Number.isInteger(nmId) || nmId <= 0) {
    return null;
  }

  const endpoint = `https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${nmId}`;
  const response = await fetchJsonMaybe(endpoint, { signal: requestSignal });
  if (!response.ok || !response.data) {
    return null;
  }

  const products = Array.isArray(response.data.products) ? response.data.products : [];
  const product =
    products.find((item) => String(item?.id || item?.nmId || item?.nm_id || "") === String(nmId)) || products[0];
  if (!product || typeof product !== "object") {
    return null;
  }

  const ratingRaw = product.nmReviewRating ?? product.reviewRating ?? product.rating;
  const rating = Number(ratingRaw);
  if (!Number.isFinite(rating)) {
    return null;
  }
  return Math.round(rating * 10) / 10;
}

function formatVariantStock(stockValue, inStock) {
  if (Number.isFinite(stockValue)) {
    return `${Math.max(0, Math.round(stockValue))} шт.`;
  }
  if (inStock === true) {
    return "есть";
  }
  if (inStock === false) {
    return "нет";
  }
  return "Н/Д";
}

function formatVariantPrice(priceRaw) {
  const price = Number(priceRaw);
  if (!Number.isFinite(price)) {
    return "Н/Д";
  }
  return `${formatRub(price)} ₽`;
}

function formatVariantRating(ratingRaw) {
  const rating = Number(ratingRaw);
  if (!Number.isFinite(rating)) {
    return "Н/Д";
  }
  return rating.toFixed(1).replace(".", ",");
}

async function openRecommendations(rowId) {
  const row = getRowById(rowId);
  if (!row) {
    return;
  }

  const data = row.data;
  el.recommendationsTitle.textContent = `Рекомендации продавца · ${row.nmId}`;
  if (el.recommendationsSubtle) {
    el.recommendationsSubtle.hidden = false;
  }
  el.recommendationsSubtle.textContent =
    "Показываем рекомендации из zero-блока (rich.json) и публичного API WB.";
  if (el.recommendationsContent) {
    el.recommendationsContent.dataset.rowId = row.id;
    el.recommendationsContent.dataset.mode = "recommendations";
  }
  el.recommendationsModal.hidden = false;
  updateRecommendationsRefreshButtonState();

  if (!data) {
    el.recommendationsContent.innerHTML =
      '<div class="recommendation-empty">Строка еще не загружена. Нажмите "Обновить".</div>';
    return;
  }

  if (data.hasSellerRecommendations !== true) {
    el.recommendationsContent.innerHTML =
      '<div class="recommendation-empty">Для этой карточки блок рекомендаций не обнаружен.</div>';
    return;
  }

  const hasResolved =
    data.recommendationsResolvedAt ||
    data.recommendationDetailsError ||
    (Array.isArray(data.recommendationDetails) && data.recommendationDetails.length >= 0);

  if (!hasResolved) {
    el.recommendationsContent.innerHTML =
      '<div class="recommendation-empty">Загружаем список рекомендаций...</div>';
    await loadRecommendationDetails(rowId);
  }

  const freshRow = getRowById(rowId);
  if (!freshRow) {
    return;
  }

  renderRecommendationsOverlay(freshRow);
}

function closeRecommendations() {
  el.recommendationsModal.hidden = true;
  el.recommendationsTitle.textContent = "Рекомендации продавца";
  el.recommendationsSubtle.textContent = "";
  if (el.recommendationsSubtle) {
    el.recommendationsSubtle.hidden = true;
  }
  el.recommendationsContent.innerHTML = "";
  if (el.recommendationsContent) {
    delete el.recommendationsContent.dataset.rowId;
    delete el.recommendationsContent.dataset.mode;
  }
  updateRecommendationsRefreshButtonState();
}

function updateRecommendationsRefreshButtonState() {
  if (!el.recommendationsRefreshBtn || !el.recommendationsContent) {
    return;
  }

  const rowId = String(el.recommendationsContent.dataset.rowId || "").trim();
  const mode = String(el.recommendationsContent.dataset.mode || "").trim();
  const row = rowId ? getRowById(rowId) : null;
  const isColorVariants = mode === "color-variants";
  const hasRowContext = Boolean(rowId && row && isColorVariants);
  el.recommendationsRefreshBtn.hidden = !hasRowContext;
  if (!hasRowContext) {
    el.recommendationsRefreshBtn.disabled = true;
    el.recommendationsRefreshBtn.textContent = "Обновить";
    return;
  }

  el.recommendationsRefreshBtn.disabled = row.loading === true || state.isBulkLoading === true;
  el.recommendationsRefreshBtn.textContent = row.loading
    ? `Обновляю ${isColorVariants ? "склейки" : "данные"}...`
    : "Обновить";
}

async function refreshRecommendationsOverlay() {
  if (!el.recommendationsContent) {
    return;
  }

  const rowId = String(el.recommendationsContent.dataset.rowId || "").trim();
  const mode = String(el.recommendationsContent.dataset.mode || "").trim();
  if (!rowId || mode !== "color-variants") {
    return;
  }

  const row = getRowById(rowId);
  if (!row || row.loading || state.isBulkLoading) {
    return;
  }

  updateRecommendationsRefreshButtonState();
  await loadSingleRowWithProgress(rowId, {
    mode: "content-only",
    forceHostProbe: true,
    source: "manual",
    actionKey: "variants-refresh",
    loadingText: "Обновляю склейки",
  });
  await openColorVariants(rowId);
}

function renderRecommendationsOverlay(row) {
  const data = row.data;
  if (!data || data.hasSellerRecommendations !== true) {
    el.recommendationsContent.innerHTML =
      '<div class="recommendation-empty">Для этой карточки блок рекомендаций не обнаружен.</div>';
    return;
  }

  const details = Array.isArray(data.recommendationDetails) ? data.recommendationDetails : [];
  const warning = data.recommendationDetailsError ? escapeHtml(data.recommendationDetailsError) : "";
  const sourceRefs = getRecommendationSourceRefs(data, row.nmId);
  const detailsRefs = details.map((item) => String(item?.nmId || "").trim()).filter(Boolean);
  const idsForListing =
    sourceRefs.mergedRefs.length > 0
      ? sourceRefs.mergedRefs
      : Array.from(new Set(detailsRefs));
  const knownCount = Number.isInteger(data.recommendationKnownCount)
    ? Math.max(data.recommendationKnownCount, idsForListing.length)
    : idsForListing.length;
  const summaryParts = [`Найдено артикулов: ${knownCount}`];
  if (details.length > 0) {
    summaryParts.push(
      knownCount > details.length ? `карточек загружено: ${details.length} из ${knownCount}` : `карточек загружено: ${details.length}`,
    );
  }
  if (knownCount > RECOMMENDATION_ITEMS_LIMIT) {
    summaryParts.push(`лимит детальной загрузки: ${RECOMMENDATION_ITEMS_LIMIT}`);
  }

  const summaryBlock = `<div class="recommendation-summary overlay-note">${summaryParts.join(" · ")}</div>`;
  const idsBlock =
    idsForListing.length > 0
      ? `<div class="recommendation-ids">
        <strong>Все найденные артикулы:</strong> <span class="mono">${escapeHtml(idsForListing.join(", "))}</span>
        ${data.recommendationRefsTruncated ? '<div class="recommendation-meta">Список в интерфейсе сокращен.</div>' : ""}
      </div>`
      : "";

  const sourceItems = [
    {
      label: "Zero-блок (rich.json)",
      ids: sourceRefs.richRefs,
      truncated: data.recommendationRefsFromRichTruncated === true,
      hint: "Ссылки/артикулы, найденные в rich-данных карточки",
    },
    {
      label: "API seller-recommendations",
      ids: sourceRefs.apiRefs,
      truncated: data.recommendationRefsFromApiTruncated === true,
      hint: "Ответ публичного endpoint рекомендаций WB",
    },
  ];

  if (sourceRefs.legacyRefs.length > 0) {
    sourceItems.push({
      label: "Ранее сохраненные (legacy)",
      ids: sourceRefs.legacyRefs,
      truncated: false,
      hint: "Старые данные без точной привязки к источнику",
    });
  }

  const sourcesBlock = `<div class="recommendation-sources">
    ${sourceItems
      .map((source) => {
        const count = source.ids.length;
        const idsText = count > 0 ? escapeHtml(source.ids.join(", ")) : "не найдено";
        return `<div class="recommendation-source">
          <div class="recommendation-source-head">
            <strong>${escapeHtml(source.label)}</strong>
            <span class="recommendation-source-count">${count}</span>
          </div>
          <div class="recommendation-source-ids mono">${idsText}</div>
          <div class="recommendation-meta">${escapeHtml(source.hint)}${
            source.truncated ? " · список сокращен" : ""
          }</div>
        </div>`;
      })
      .join("")}
  </div>`;

  el.recommendationsSubtle.textContent =
    knownCount > 0
      ? `Публичные данные WB. Найдено: ${knownCount}. Zero-блок: ${sourceRefs.richRefs.length}, API: ${sourceRefs.apiRefs.length}.`
      : "Публичные данные WB. WB может не раскрывать полный состав блока.";

  if (details.length === 0) {
    const extra = warning
      ? warning
      : "WB подтвердил наличие блока, но не раскрыл список/количество товаров в публичных данных.";
    el.recommendationsContent.innerHTML = `${summaryBlock}${sourcesBlock}${idsBlock}<div class="recommendation-empty">${extra}</div>`;
    return;
  }

  const warningBlock = warning ? `<div class="recommendation-empty">${warning}</div>` : "";
  const itemsHtml = details
    .map((item) => {
      const slidesHtml =
        Array.isArray(item.slides) && item.slides.length > 0
          ? `<div class="recommendation-slides">${item.slides
              .map(
                (url, index) =>
                  `<a href="${toSlidePreviewUrl(url)}" class="slide-thumb" data-action="preview" data-url="${toSlidePreviewUrl(
                    url,
                  )}" data-caption="${escapeAttr(
                    `${item.nmId} · слайд ${index + 1}`,
                  )}" title="Открыть слайд"><img src="${toSlideThumbUrl(url)}" alt="Слайд рекомендации" loading="lazy" decoding="async" /></a>`,
              )
              .join("")}</div>`
          : '<div class="recommendation-meta">Листинг недоступен в публичных данных.</div>';

      return `<article class="recommendation-item">
        <div class="recommendation-title">
          <a class="wb-link" href="${item.link}" target="_blank" rel="noopener noreferrer">${escapeHtml(
            item.name || `Артикул ${item.nmId}`,
          )}</a>
          <span class="mono">${escapeHtml(item.nmId)}</span>
        </div>
        <div class="recommendation-meta">${escapeHtml(item.category || "-")} · ${escapeHtml(item.brand || "-")}</div>
        ${slidesHtml}
      </article>`;
    })
    .join("");

  el.recommendationsContent.innerHTML = warningBlock + summaryBlock + sourcesBlock + idsBlock + itemsHtml;
}

async function loadRecommendationDetails(rowId) {
  const row = getRowById(rowId);
  if (!row || !row.data || row.data.hasSellerRecommendations !== true) {
    return;
  }

  const sourceBefore = getRecommendationSourceRefs(row.data, row.nmId);
  const richRefs = sourceBefore.richRefs;
  let apiRefs = [];
  try {
    apiRefs = normalizeRecommendationRefs(await fetchRecommendationRefsFromApi(row.nmId), row.nmId);
  } catch {
    apiRefs = [];
  }

  const uniqueRefsAll = normalizeRecommendationRefs([...apiRefs, ...richRefs], row.nmId);
  const uniqueRefs = uniqueRefsAll.slice(0, RECOMMENDATION_ITEMS_LIMIT);

  row.data.recommendationRefs = richRefs;
  row.data.recommendationRefsFromRich = richRefs.slice(0, RECOMMENDATION_IDS_LIST_LIMIT);
  row.data.recommendationRefsFromApi = apiRefs.slice(0, RECOMMENDATION_IDS_LIST_LIMIT);
  row.data.recommendationRefsFromRichTruncated = richRefs.length > RECOMMENDATION_IDS_LIST_LIMIT;
  row.data.recommendationRefsFromApiTruncated = apiRefs.length > RECOMMENDATION_IDS_LIST_LIMIT;
  row.data.recommendationKnownCount = uniqueRefsAll.length;
  row.data.recommendationResolvedRefs = uniqueRefsAll.slice(0, RECOMMENDATION_IDS_LIST_LIMIT);
  row.data.recommendationRefsTruncated = uniqueRefsAll.length > RECOMMENDATION_IDS_LIST_LIMIT;

  if (uniqueRefs.length === 0) {
    row.data.recommendationDetails = [];
    row.data.recommendationDetailsError =
      "Для этой карточки WB не раскрыл список/количество рекомендованных товаров в публичных источниках.";
    row.data.recommendationsResolvedAt = new Date().toISOString();
    persistState();
    return;
  }

  const queue = uniqueRefs.map((nmId, idx) => ({ nmId, idx }));
  const resolved = new Array(queue.length).fill(null);

  await runWithConcurrency(queue, 3, async (entry) => {
    try {
      resolved[entry.idx] = await fetchRecommendationSummary(entry.nmId);
    } catch {
      resolved[entry.idx] = {
        nmId: String(entry.nmId),
        link: `https://www.wildberries.ru/catalog/${entry.nmId}/detail.aspx`,
        name: "",
        category: "",
        brand: "",
        slides: [],
      };
    }
  });

  const target = getRowById(rowId);
  if (!target || !target.data) {
    return;
  }

  target.data.recommendationDetails = resolved.filter(Boolean);
  target.data.recommendationRefs = richRefs;
  target.data.recommendationRefsFromRich = richRefs.slice(0, RECOMMENDATION_IDS_LIST_LIMIT);
  target.data.recommendationRefsFromApi = apiRefs.slice(0, RECOMMENDATION_IDS_LIST_LIMIT);
  target.data.recommendationRefsFromRichTruncated = richRefs.length > RECOMMENDATION_IDS_LIST_LIMIT;
  target.data.recommendationRefsFromApiTruncated = apiRefs.length > RECOMMENDATION_IDS_LIST_LIMIT;
  target.data.recommendationKnownCount = uniqueRefsAll.length;
  target.data.recommendationResolvedRefs = uniqueRefsAll.slice(0, RECOMMENDATION_IDS_LIST_LIMIT);
  target.data.recommendationRefsTruncated = uniqueRefsAll.length > RECOMMENDATION_IDS_LIST_LIMIT;
  target.data.recommendationDetailsError =
    target.data.recommendationDetails.length === 0
      ? "Список/количество рекомендаций не найден в публичных источниках."
      : "";
  target.data.recommendationsResolvedAt = new Date().toISOString();
  persistState();
}

async function fetchRecommendationSummary(nmIdRaw) {
  const nmId = Number(nmIdRaw);
  if (!Number.isInteger(nmId) || nmId <= 0) {
    throw new Error("Некорректный артикул рекомендации");
  }

  const vol = Math.floor(nmId / 100000);
  const part = Math.floor(nmId / 1000);
  const hostSuffix = await resolveBasketHost({ nmId, vol, part });
  const base = `https://basket-${hostSuffix}.wbbasket.ru/vol${vol}/part${part}/${nmId}`;
  const card = await fetchJson(`${base}/info/ru/card.json`);

  const photoCount = Number(card?.media?.photo_count) || 0;
  const slides = [];
  for (let index = 1; index <= Math.min(photoCount, RECOMMENDATION_SLIDES_PER_ITEM); index += 1) {
    slides.push(`${base}/images/c246x328/${index}.webp`);
  }

  return {
    nmId: String(nmId),
    link: `https://www.wildberries.ru/catalog/${nmId}/detail.aspx`,
    name: card?.imt_name || "",
    category: card?.subj_name || "",
    brand: card?.selling?.brand_name || "",
    slides,
  };
}

async function fetchRecommendationRefsFromApi(nmIdRaw) {
  const nmId = Number(nmIdRaw);
  if (!Number.isInteger(nmId) || nmId <= 0) {
    return [];
  }

  const endpoint = `https://recom.wb.ru/personal/seller-recommendations?nm=${nmId}`;
  const payload = await fetchJson(endpoint);
  return extractRecommendationRefsFromPayload(payload, nmId);
}

function extractRecommendationRefsFromPayload(payload, sourceNmId) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const ids = new Set();
  const sourceId = String(sourceNmId || "");
  const stack = [payload];

  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }

    if (typeof current === "number" && Number.isInteger(current) && current >= 100000) {
      const id = String(current);
      if (id !== sourceId) {
        ids.add(id);
      }
      continue;
    }

    if (typeof current === "string") {
      const text = current.trim();
      const fromUrl = text.match(/wildberries\.ru\/catalog\/(\d{6,})/i);
      if (fromUrl?.[1] && String(fromUrl[1]) !== sourceId) {
        ids.add(String(fromUrl[1]));
      }

      if (/^\d{6,}$/.test(text) && text !== sourceId) {
        ids.add(text);
      }
      continue;
    }

    if (!current || typeof current !== "object") {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      const normalizedKey = key.toLowerCase();

      if (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 100000 &&
        /(^nm$|nmid|nm_id|wbid|productid|product_id|itemid|item_id)/i.test(normalizedKey)
      ) {
        if (String(value) !== String(sourceNmId)) {
          ids.add(String(value));
        }
      }

      if (
        typeof value === "string" &&
        /(^nm$|nmid|nm_id|wbid|productid|product_id|itemid|item_id|link|url)/i.test(normalizedKey)
      ) {
        const fromUrl = value.match(/wildberries\.ru\/catalog\/(\d{6,})/i);
        if (fromUrl?.[1] && String(fromUrl[1]) !== String(sourceNmId)) {
          ids.add(String(fromUrl[1]));
        }

        if (/^\d{6,}$/.test(value) && String(value) !== String(sourceNmId)) {
          ids.add(String(value));
        }
      }

      if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return Array.from(ids);
}

function openRowHistory(rowId) {
  const row = getRowById(rowId);
  if (!row || !el.rowHistoryModal || !el.rowHistoryContent || !el.rowHistoryTitle) {
    return;
  }

  const logs = normalizeRowUpdateLogs(row.updateLogs);
  el.rowHistoryTitle.textContent = `История обновлений · ${row.nmId}`;
  el.rowHistoryContent.dataset.rowId = row.id;
  el.rowHistoryModal.hidden = false;
  renderRowHistoryContent(row, logs);
}

function getRowHistoryVisibleChanges(entry) {
  return Array.isArray(entry?.changes)
    ? entry.changes.filter((change) => {
        const field = String(change?.field || "").trim();
        const label = String(change?.label || "").trim().toLowerCase();
        return field !== "basePrice" && label !== "базовая цена";
      })
    : [];
}

function renderRowHistoryFilterButtonState(totalLogs, logsWithChanges, visibleLogs) {
  if (!el.rowHistoryChangesFilterBtn) {
    return;
  }
  const active = state.rowHistoryHideNoChanges === true;
  el.rowHistoryChangesFilterBtn.classList.toggle("is-active", active);
  el.rowHistoryChangesFilterBtn.setAttribute("aria-pressed", active ? "true" : "false");
  el.rowHistoryChangesFilterBtn.textContent = active ? "Только изменения: вкл" : "Только изменения";
  el.rowHistoryChangesFilterBtn.disabled = totalLogs <= 0 || logsWithChanges <= 0;
  const title = active
    ? `Показаны только записи с изменениями (${visibleLogs}/${totalLogs})`
    : `Показать только записи с изменениями (${logsWithChanges}/${totalLogs})`;
  el.rowHistoryChangesFilterBtn.title = title;
}

function renderRowHistoryContent(row, logsRaw) {
  if (!el.rowHistoryContent) {
    return;
  }

  const rowId = String(row?.id || "").trim();
  const logs = (Array.isArray(logsRaw) ? logsRaw : normalizeRowUpdateLogs(row?.updateLogs))
    .slice()
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const preparedLogs = logs.map((entry) => ({
    entry,
    visibleChanges: getRowHistoryVisibleChanges(entry),
  }));
  const logsWithChanges = preparedLogs.filter((item) => item.visibleChanges.length > 0).length;
  const hideNoChanges = state.rowHistoryHideNoChanges === true;
  const visibleItems = hideNoChanges ? preparedLogs.filter((item) => item.visibleChanges.length > 0) : preparedLogs;
  const visibleLogs = visibleItems.length;

  if (el.rowHistorySubtle) {
    if (logs.length > 0) {
      const parts = [`Записей: ${logs.length}`];
      parts.push(`с изменениями: ${logsWithChanges}`);
      if (hideNoChanges) {
        parts.push(`показано: ${visibleLogs}`);
      }
      el.rowHistorySubtle.textContent = parts.join(" · ");
    } else {
      el.rowHistorySubtle.textContent = "По строке пока нет записей обновлений.";
    }
  }
  renderRowHistoryFilterButtonState(logs.length, logsWithChanges, visibleLogs);

  if (!rowId || logs.length <= 0) {
    el.rowHistoryContent.innerHTML =
      '<div class="recommendation-empty">История обновлений пока пустая. Выполните обновление строки.</div>';
    return;
  }

  if (visibleItems.length <= 0) {
    el.rowHistoryContent.innerHTML =
      '<div class="recommendation-empty">Нет записей с изменениями. Отключите фильтр "Только изменения".</div>';
    return;
  }

  const itemsHtml = visibleItems
    .map(({ entry, visibleChanges }) => {
      const statusClass = entry.status === "error" ? " is-error" : " is-ok";
      const statusLabel = entry.status === "error" ? "Ошибка" : "OK";
      const sourceLabel = entry.source === "system" ? "Системное" : "Ручное";
      const modeLabel = getModeLabel(entry.mode);
      const actionLabel = getActionLabel(entry.actionKey);
      const actorLogin = String(entry.actorLogin || "").trim();
      const actorIp = String(entry.actorIp || "").trim();
      const actorRole = String(entry.actorRole || "").trim();
      const actorParts = [];
      if (actorLogin) {
        actorParts.push(actorRole ? `${actorLogin} (${actorRole})` : actorLogin);
      }
      if (actorIp) {
        actorParts.push(`IP: ${actorIp}`);
      }
      const actorMeta = actorParts.length > 0 ? ` · ${actorParts.join(" · ")}` : "";
      const changesHtml =
        visibleChanges.length > 0
          ? `<ul class="row-history-changes">
              ${visibleChanges
                .map(
                  (change) =>
                    `<li><strong>${escapeHtml(change.label)}:</strong> ${escapeHtml(change.beforeText || "Н/Д")} → ${escapeHtml(change.afterText || "Н/Д")}</li>`,
                )
                .join("")}
            </ul>`
          : '<div class="row-history-no-changes">Без изменений</div>';
      const errorHtml =
        entry.status === "error" && entry.error
          ? `<div class="row-history-error">${escapeHtml(entry.error)}</div>`
          : "";

      return `<article class="row-history-item${statusClass}">
        <div class="row-history-head">
          <span class="row-history-time">${escapeHtml(formatDateTime(entry.at))}</span>
          <span class="row-history-meta">${escapeHtml(`${sourceLabel} · ${actionLabel} · ${modeLabel}${actorMeta}`)}</span>
          <span class="row-history-status">${escapeHtml(statusLabel)}</span>
        </div>
        ${changesHtml}
        ${errorHtml}
      </article>`;
    })
    .join("");

  el.rowHistoryContent.innerHTML = `<div class="row-history-list">${itemsHtml}</div>`;
}

function closeRowHistory() {
  if (!el.rowHistoryModal) {
    return;
  }
  el.rowHistoryModal.hidden = true;
  if (el.rowHistoryContent) {
    el.rowHistoryContent.innerHTML = "";
    delete el.rowHistoryContent.dataset.rowId;
  }
  if (el.rowHistoryTitle) {
    el.rowHistoryTitle.textContent = "История обновлений";
  }
  if (el.rowHistorySubtle) {
    el.rowHistorySubtle.textContent = "";
  }
  renderRowHistoryFilterButtonState(0, 0, 0);
}

function toggleRowHistoryChangesOnlyFilter() {
  state.rowHistoryHideNoChanges = !(state.rowHistoryHideNoChanges === true);
  const rowId = String(el.rowHistoryContent?.dataset?.rowId || "").trim();
  const row = rowId ? getRowById(rowId) : null;
  if (row) {
    renderRowHistoryContent(row);
  } else {
    renderRowHistoryFilterButtonState(0, 0, 0);
  }
}

function normalizeProblemsChartCabinetFilter(valueRaw, snapshots = state.updateSnapshots) {
  const value = String(valueRaw || "all").trim() || "all";
  if (value === "all") {
    return "all";
  }
  const known = getProblemsChartCabinets(snapshots);
  return known.includes(value) ? value : "all";
}

function getProblemsChartCabinets(snapshots = state.updateSnapshots) {
  const names = new Set();
  const source = Array.isArray(snapshots) ? snapshots : [];
  for (const snapshot of source) {
    const cabinets = Array.isArray(snapshot?.cabinets) ? snapshot.cabinets : [];
    for (const item of cabinets) {
      const cabinet = String(item?.cabinet || "").trim();
      if (cabinet) {
        names.add(cabinet);
      }
    }
  }

  for (const cabinet of getAllCabinets(state.rows, false)) {
    if (cabinet) {
      names.add(cabinet);
    }
  }

  return Array.from(names).sort((a, b) => {
    if (a === "__empty__") {
      return 1;
    }
    if (b === "__empty__") {
      return -1;
    }
    return a.localeCompare(b, "ru");
  });
}

function getProblemsChartSeriesConfig() {
  return [
    { key: "recommendationsNo", label: "Рекомендации", color: "#F97360" },
    { key: "richNo", label: "Рич", color: "#F59E0B" },
    { key: "videoNo", label: "Видео", color: "#06B6D4" },
    { key: "autoplayNo", label: "Автоплей", color: "#10B981" },
    { key: "tagsNo", label: "Тэги", color: "#3B82F6" },
    { key: "coverDuplicate", label: "Дубль обложки", color: "#8B5CF6" },
  ];
}

function getSnapshotProblemsByZone(snapshot, cabinetRaw = "all") {
  const cabinet = String(cabinetRaw || "all").trim() || "all";
  const series = getProblemsChartSeriesConfig();
  const result = Object.fromEntries(series.map((item) => [item.key, 0]));
  if (!snapshot || typeof snapshot !== "object") {
    return result;
  }
  let sourceProblems = snapshot?.problems;
  if (cabinet === "all") {
    sourceProblems = snapshot?.problems;
  } else {
    const items = Array.isArray(snapshot.cabinets) ? snapshot.cabinets : [];
    const target = items.find((item) => String(item?.cabinet || "").trim() === cabinet);
    sourceProblems = target?.problems;
  }

  if (!sourceProblems || typeof sourceProblems !== "object") {
    return result;
  }

  for (const item of series) {
    result[item.key] = Math.max(0, Number(sourceProblems[item.key]) || 0);
  }
  return result;
}

function getSnapshotDayKey(atRaw) {
  const at = new Date(atRaw);
  if (Number.isNaN(at.getTime())) {
    return "";
  }

  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, "0");
  const day = String(at.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function collapseSnapshotsByDay(snapshotsRaw) {
  const snapshots = Array.isArray(snapshotsRaw) ? snapshotsRaw : [];
  const latestByDay = new Map();
  const dayOrder = [];

  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== "object" || !snapshot.at) {
      continue;
    }
    const dayKey = getSnapshotDayKey(snapshot.at);
    if (!dayKey) {
      continue;
    }
    if (!latestByDay.has(dayKey)) {
      dayOrder.push(dayKey);
    }
    latestByDay.set(dayKey, snapshot);
  }

  return dayOrder.map((dayKey) => latestByDay.get(dayKey)).filter(Boolean);
}

function renderProblemsChartCabinetFilter() {
  if (!el.problemsChartCabinetFilter) {
    return;
  }

  const cabinets = getProblemsChartCabinets(state.updateSnapshots);
  const normalized = normalizeProblemsChartCabinetFilter(state.chartCabinetFilter, state.updateSnapshots);
  state.chartCabinetFilter = normalized;
  const options = [
    '<option value="all">Все кабинеты</option>',
    ...cabinets.map((cabinet) => {
      const label = cabinet === "__empty__" ? "Без кабинета" : cabinet;
      return `<option value="${escapeAttr(cabinet)}">${escapeHtml(label)}</option>`;
    }),
  ];
  el.problemsChartCabinetFilter.innerHTML = options.join("");
  el.problemsChartCabinetFilter.value = normalized;
}

function openProblemsChart() {
  if (!el.problemsChartModal || !el.problemsChartContent) {
    return;
  }

  ensureProblemSnapshotsInitialized();
  renderProblemsChartCabinetFilter();
  renderProblemsChartContent();
  el.problemsChartModal.hidden = false;
}

function closeProblemsChart() {
  if (!el.problemsChartModal) {
    return;
  }
  el.problemsChartModal.hidden = true;
}

function handleProblemsChartCabinetFilterChange() {
  if (!el.problemsChartCabinetFilter) {
    return;
  }
  state.chartCabinetFilter = normalizeProblemsChartCabinetFilter(
    el.problemsChartCabinetFilter.value,
    state.updateSnapshots,
  );
  renderProblemsChartContent();
  persistState();
}

function renderProblemsChartContent() {
  if (!el.problemsChartContent) {
    return;
  }

  const snapshotsByTime = (Array.isArray(state.updateSnapshots) ? state.updateSnapshots : [])
    .slice()
    .filter((item) => item && typeof item === "object" && item.at)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const snapshots = collapseSnapshotsByDay(snapshotsByTime);
  const cabinet = normalizeProblemsChartCabinetFilter(state.chartCabinetFilter, snapshotsByTime);
  state.chartCabinetFilter = cabinet;

  if (snapshots.length <= 0) {
    el.problemsChartContent.innerHTML =
      '<div class="recommendation-empty">История по проблемам пока пустая. Сделайте хотя бы одно обновление.</div>';
    return;
  }

  const seriesConfig = getProblemsChartSeriesConfig();
  const points = snapshots.map((snapshot, index) => {
    const atDate = new Date(snapshot.at);
    const values = getSnapshotProblemsByZone(snapshot, cabinet);
    const total = seriesConfig.reduce((sum, item) => sum + Number(values[item.key] || 0), 0);
    return {
      index,
      at: atDate,
      atLabel: formatDateTime(snapshot.at),
      dateLabel: new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
      }).format(atDate),
      timeLabel: new Intl.DateTimeFormat("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(atDate),
      values,
      total,
      source: snapshot.source === "system" ? "Системное" : "Ручное",
      action: getActionLabel(snapshot.actionKey),
      mode: getModeLabel(snapshot.mode),
    };
  });

  const width = 1040;
  const height = 340;
  const padLeft = 54;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 58;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const times = points.map((item) => item.at.getTime()).filter(Number.isFinite);
  const minTime = times.length > 0 ? Math.min(...times) : Date.now();
  const maxTime = times.length > 0 ? Math.max(...times) : minTime;
  const values = points.flatMap((item) => seriesConfig.map((series) => Number(item.values[series.key]) || 0));
  const minValue = 0;
  const maxValue = Math.max(1, ...values);
  const valueRange = Math.max(1, maxValue - minValue);
  const timeRange = Math.max(1, maxTime - minTime);

  const mapped = points.map((point) => {
    const timeValue = point.at.getTime();
    const xByTime = Number.isFinite(timeValue) ? (timeValue - minTime) / timeRange : 0;
    const xByIndex = points.length > 1 ? point.index / (points.length - 1) : 0.5;
    const xRatio = Number.isFinite(timeValue) && maxTime !== minTime ? xByTime : xByIndex;
    const x = padLeft + xRatio * plotWidth;
    const yBySeries = {};
    for (const series of seriesConfig) {
      const value = Math.max(0, Number(point.values[series.key]) || 0);
      yBySeries[series.key] = padTop + (1 - (value - minValue) / valueRange) * plotHeight;
    }
    return { ...point, x, yBySeries };
  });

  const yTicks = 4;
  const yGrid = Array.from({ length: yTicks + 1 }, (_, index) => {
    const ratio = index / yTicks;
    const y = padTop + ratio * plotHeight;
    const value = Math.round(maxValue - ratio * (maxValue - minValue));
    return {
      y,
      value,
    };
  });

  const labelStep = mapped.length <= 8 ? 1 : Math.ceil(mapped.length / 8);
  const xLabels = mapped
    .filter((point, index) => index === 0 || index === mapped.length - 1 || index % labelStep === 0)
    .map((point) => ({
      x: point.x,
      dateLabel: point.dateLabel,
      timeLabel: point.timeLabel,
    }));

  const cabinetLabel = cabinet === "all" ? "Все кабинеты" : cabinet === "__empty__" ? "Без кабинета" : cabinet;
  const lastPoint = mapped[mapped.length - 1];
  const firstPoint = mapped[0];
  const delta = lastPoint ? lastPoint.total - (firstPoint?.total || 0) : 0;
  const deltaSign = delta > 0 ? "+" : "";
  const deltaText = `${deltaSign}${delta}`;

  const linesHtml = seriesConfig
    .map((series) => {
      const pathD = mapped
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${Number(point.yBySeries[series.key]).toFixed(2)}`,
        )
        .join(" ");
      if (!pathD) {
        return "";
      }

      const seriesPointsHtml = mapped
        .map(
          (point) => `<circle
              class="problems-chart-point"
              style="--series-color:${escapeAttr(series.color)}"
              data-tooltip-kind="chart"
              data-tooltip-title="${escapeAttr(series.label)}"
              data-tooltip-color="${escapeAttr(series.color)}"
              data-tooltip-value-label="${escapeAttr(series.label)}"
              data-tooltip-value="${escapeAttr(String(point.values[series.key]))}"
              data-tooltip-total="${escapeAttr(String(point.total))}"
              data-tooltip-at="${escapeAttr(point.atLabel)}"
              data-tooltip-meta="${escapeAttr(`${point.source} · ${point.action} · ${point.mode}`)}"
              data-tooltip-cabinet="${escapeAttr(cabinetLabel)}"
              cx="${point.x.toFixed(2)}"
              cy="${Number(point.yBySeries[series.key]).toFixed(2)}"
              r="5.2"
            ></circle>`,
        )
        .join("");

      return `<path
          class="problems-chart-line"
          style="--series-color:${escapeAttr(series.color)}"
          d="${pathD}"
        ></path>${seriesPointsHtml}`;
    })
    .join("");

  const gridHtml = yGrid
    .map(
      (tick) => `<g class="problems-chart-grid-row">
        <line x1="${padLeft}" y1="${tick.y.toFixed(2)}" x2="${(padLeft + plotWidth).toFixed(2)}" y2="${tick.y.toFixed(2)}"></line>
        <text x="${(padLeft - 8).toFixed(2)}" y="${(tick.y + 4).toFixed(2)}">${tick.value}</text>
      </g>`,
    )
    .join("");

  const xLabelsHtml = xLabels
    .map(
      (tick) => `<text class="problems-chart-axis-x" x="${tick.x.toFixed(2)}" y="${(padTop + plotHeight + 22).toFixed(
        2,
      )}">${escapeHtml(tick.dateLabel)}</text>
      <text class="problems-chart-axis-x-time" x="${tick.x.toFixed(2)}" y="${(padTop + plotHeight + 36).toFixed(
        2,
      )}">${escapeHtml(tick.timeLabel)}</text>`,
    )
    .join("");

  const latestSeriesHtml = seriesConfig
    .map((series) => {
      const current = Number(lastPoint?.values?.[series.key] || 0);
      const previous = Number(firstPoint?.values?.[series.key] || 0);
      const itemDelta = current - previous;
      const itemDeltaText = `${itemDelta > 0 ? "+" : ""}${itemDelta}`;
      return `<span class="problems-chart-legend-item">
        <span class="problems-chart-legend-dot" style="--series-color:${escapeAttr(series.color)}"></span>
        <span>${escapeHtml(series.label)}</span>
        <strong>${current}</strong>
        <span class="problems-chart-legend-delta">(${escapeHtml(itemDeltaText)})</span>
      </span>`;
    })
    .join("");

  el.problemsChartContent.innerHTML = `
    <div class="problems-chart-summary overlay-note">
      <span><strong>Кабинет:</strong> ${escapeHtml(cabinetLabel)}</span>
      <span><strong>Срезов (дней):</strong> ${mapped.length}</span>
      <span><strong>Последнее всего:</strong> ${lastPoint ? lastPoint.total : 0}</span>
      <span><strong>Дельта всего:</strong> ${escapeHtml(deltaText)}</span>
      <span><strong>Последнее обновление:</strong> ${escapeHtml(lastPoint?.atLabel || "-")}</span>
    </div>
    <div class="problems-chart-legend">${latestSeriesHtml}</div>
    <div class="problems-chart-stage">
      <svg viewBox="0 0 ${width} ${height}" class="problems-chart-svg" role="img" aria-label="График динамики проблем">
        ${gridHtml}
        ${linesHtml}
        ${xLabelsHtml}
      </svg>
    </div>
  `;
}
