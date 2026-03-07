function ensureBreakTooltipRoot() {
  if (breakTooltip.root && breakTooltip.text) {
    return;
  }

  const root = document.createElement("div");
  root.className = "agreement-break-tooltip";
  root.hidden = true;
  root.setAttribute("role", "status");

  const text = document.createElement("div");
  text.className = "agreement-break-tooltip-text";
  root.append(text);

  document.body.append(root);
  breakTooltip.root = root;
  breakTooltip.text = text;
}

function getBreakSegmentTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest(
    ".agreement-break-segment[data-tooltip-title], .problems-chart-point[data-tooltip-title]",
  );
}

function handleBreakSegmentPointerOver(event) {
  if (event.pointerType && event.pointerType !== "mouse") {
    return;
  }

  const segment = getBreakSegmentTarget(event.target);
  if (!segment) {
    return;
  }

  const previous = getBreakSegmentTarget(event.relatedTarget);
  if (previous === segment) {
    return;
  }

  showBreakSegmentTooltip(segment, event.clientX, event.clientY);
}

function handleBreakSegmentPointerMove(event) {
  if (!breakTooltip.activeSegment) {
    return;
  }
  if (event.pointerType && event.pointerType !== "mouse") {
    return;
  }

  moveBreakSegmentTooltip(event.clientX, event.clientY);
}

function handleBreakSegmentPointerOut(event) {
  if (!breakTooltip.activeSegment) {
    return;
  }

  const segment = getBreakSegmentTarget(event.target);
  if (!segment || segment !== breakTooltip.activeSegment) {
    return;
  }

  const next = getBreakSegmentTarget(event.relatedTarget);
  if (next && next === segment) {
    return;
  }

  hideBreakSegmentTooltip();
}

function showBreakSegmentTooltip(segment, clientX, clientY) {
  const title = String(segment.dataset.tooltipTitle || "").trim();
  if (!title) {
    return;
  }

  ensureBreakTooltipRoot();
  breakTooltip.activeSegment = segment;

  const problems = String(segment.dataset.tooltipProblems || "").trim();
  const rows = String(segment.dataset.tooltipRows || "").trim();
  const share = String(segment.dataset.tooltipShare || "").trim();
  const colorRaw = String(segment.dataset.tooltipColor || "").trim();
  const color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorRaw) ? colorRaw : "#d5644a";
  const tooltipKind = String(segment.dataset.tooltipKind || "").trim();
  if (tooltipKind === "chart") {
    const value = String(segment.dataset.tooltipValue || "").trim();
    const valueLabel = String(segment.dataset.tooltipValueLabel || "Значение").trim();
    const total = String(segment.dataset.tooltipTotal || "").trim();
    const at = String(segment.dataset.tooltipAt || "").trim();
    const meta = String(segment.dataset.tooltipMeta || "").trim();
    const cabinet = String(segment.dataset.tooltipCabinet || "").trim();
    const atLine = at ? `<li><span>Дата:</span> <strong>${escapeHtml(at)}</strong></li>` : "";
    const valueLine = value ? `<li><span>${escapeHtml(valueLabel)}:</span> <strong>${escapeHtml(value)}</strong></li>` : "";
    const totalLine = total ? `<li><span>Всего проблем:</span> <strong>${escapeHtml(total)}</strong></li>` : "";
    const cabinetLine = cabinet ? `<li><span>Кабинет:</span> <strong>${escapeHtml(cabinet)}</strong></li>` : "";
    const metaLine = meta ? `<li><span>Обновление:</span> <strong>${escapeHtml(meta)}</strong></li>` : "";

    breakTooltip.text.innerHTML = `<div class="agreement-break-tooltip-title">
      <span class="agreement-break-tooltip-dot" style="background:${color}"></span>
      <span>${escapeHtml(title)}</span>
    </div>
    <ul class="agreement-break-tooltip-list">
      ${atLine}
      ${valueLine}
      ${totalLine}
      ${cabinetLine}
      ${metaLine}
    </ul>`;
  } else {
    const rowsLine = rows ? `<li><span>Доля от всех строк:</span> <strong>${escapeHtml(rows)}%</strong></li>` : "";
    const shareLine = share ? `<li><span>Доля в структуре проблем:</span> <strong>${escapeHtml(share)}%</strong></li>` : "";

    breakTooltip.text.innerHTML = `<div class="agreement-break-tooltip-title">
      <span class="agreement-break-tooltip-dot" style="background:${color}"></span>
      <span>${escapeHtml(title)}</span>
    </div>
    <ul class="agreement-break-tooltip-list">
      <li><span>Проблем:</span> <strong>${escapeHtml(problems)}</strong></li>
      ${rowsLine}
      ${shareLine}
      <li><span>Клик:</span> <strong>показать такие строки</strong></li>
    </ul>`;
  }
  breakTooltip.root.hidden = false;
  breakTooltip.root.classList.add("is-visible");
  moveBreakSegmentTooltip(clientX, clientY);
}

function moveBreakSegmentTooltip(clientX, clientY) {
  if (!breakTooltip.root || breakTooltip.root.hidden) {
    return;
  }

  const margin = 8;
  const tooltipRect = breakTooltip.root.getBoundingClientRect();

  let left = clientX + BREAK_TOOLTIP_OFFSET_X;
  let top = clientY + BREAK_TOOLTIP_OFFSET_Y;

  if (left + tooltipRect.width > window.innerWidth - margin) {
    left = clientX - tooltipRect.width - BREAK_TOOLTIP_OFFSET_X;
  }
  if (top + tooltipRect.height > window.innerHeight - margin) {
    top = clientY - tooltipRect.height - BREAK_TOOLTIP_OFFSET_Y;
  }

  left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));

  breakTooltip.root.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
}

function hideBreakSegmentTooltip() {
  if (!breakTooltip.root) {
    breakTooltip.activeSegment = null;
    return;
  }

  breakTooltip.activeSegment = null;
  breakTooltip.root.classList.remove("is-visible");
  breakTooltip.root.hidden = true;
  breakTooltip.root.style.transform = "translate3d(-9999px, -9999px, 0)";
}

function ensureIconHintTooltipRoot() {
  if (iconHintTooltip.root && iconHintTooltip.text) {
    return;
  }

  const root = document.createElement("div");
  root.className = "icon-hint-tooltip";
  root.hidden = true;
  root.setAttribute("role", "status");

  const text = document.createElement("div");
  text.className = "icon-hint-tooltip-text";
  root.append(text);

  document.body.append(root);
  iconHintTooltip.root = root;
  iconHintTooltip.text = text;
}

function getIconHintTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest("[data-hint]");
}

function handleIconHintPointerOver(event) {
  if (event.pointerType && event.pointerType !== "mouse") {
    return;
  }

  const target = getIconHintTarget(event.target);
  if (!target) {
    return;
  }

  const previous = getIconHintTarget(event.relatedTarget);
  if (previous === target) {
    return;
  }

  scheduleIconHintTooltip(target);
}

function handleIconHintPointerMove(event) {
  if (!iconHintTooltip.target || !iconHintTooltip.root || iconHintTooltip.root.hidden) {
    return;
  }
  if (event.pointerType && event.pointerType !== "mouse") {
    return;
  }
  moveIconHintTooltip(event.clientX, event.clientY);
}

function handleIconHintPointerOut(event) {
  const target = getIconHintTarget(event.target);
  if (!target) {
    return;
  }

  const next = getIconHintTarget(event.relatedTarget);
  if (next && next === target) {
    return;
  }

  hideIconHintTooltip();
}

function scheduleIconHintTooltip(target) {
  hideIconHintTooltip();
  const text = String(target.dataset.hint || "").trim();
  if (!text) {
    return;
  }

  iconHintTooltip.target = target;
  iconHintTooltip.timer = window.setTimeout(() => {
    showIconHintTooltip(text);
  }, ICON_HINT_DELAY_MS);
}

function showIconHintTooltip(text) {
  if (!iconHintTooltip.target) {
    return;
  }

  ensureIconHintTooltipRoot();
  iconHintTooltip.text.textContent = text;
  iconHintTooltip.root.hidden = false;
  iconHintTooltip.root.classList.add("is-visible");
  syncIconHintTooltipPosition();
}

function syncIconHintTooltipPosition() {
  if (!iconHintTooltip.target) {
    hideIconHintTooltip();
    return;
  }
  const rect = iconHintTooltip.target.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top;
  moveIconHintTooltip(x, y, { placeAbove: true });
}

function moveIconHintTooltip(clientX, clientY, options = {}) {
  if (!iconHintTooltip.root || iconHintTooltip.root.hidden) {
    return;
  }

  const placeAbove = options.placeAbove === true;
  const margin = 8;
  const tooltipRect = iconHintTooltip.root.getBoundingClientRect();
  let left = Math.round(clientX - tooltipRect.width / 2);
  let top = placeAbove
    ? Math.round(clientY - tooltipRect.height - 10)
    : Math.round(clientY + 12);

  left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));
  iconHintTooltip.root.style.transform = `translate3d(${left}px, ${top}px, 0)`;
}

function hideIconHintTooltip() {
  if (iconHintTooltip.timer) {
    clearTimeout(iconHintTooltip.timer);
    iconHintTooltip.timer = 0;
  }
  if (!iconHintTooltip.root) {
    iconHintTooltip.target = null;
    return;
  }

  iconHintTooltip.target = null;
  iconHintTooltip.root.classList.remove("is-visible");
  iconHintTooltip.root.hidden = true;
  iconHintTooltip.root.style.transform = "translate3d(-9999px, -9999px, 0)";
}

function ensureHoverZoomRoot() {
  if (hoverZoom.root && hoverZoom.image) {
    return;
  }

  const root = document.createElement("div");
  root.className = "slide-hover-zoom";
  root.hidden = true;

  const image = document.createElement("img");
  image.alt = "";
  root.append(image);

  document.body.append(root);
  hoverZoom.root = root;
  hoverZoom.image = image;
}

function getClosestSlideThumb(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest(".slide-thumb");
}

function handleSlideThumbPointerOver(event) {
  if (event.pointerType && event.pointerType !== "mouse") {
    return;
  }
  const thumb = getClosestSlideThumb(event.target);
  if (!thumb || !el.rowsBody.contains(thumb)) {
    return;
  }

  const previous = getClosestSlideThumb(event.relatedTarget);
  if (previous === thumb) {
    return;
  }

  showHoverZoom(thumb);
}

function handleSlideThumbPointerOut(event) {
  if (event.pointerType && event.pointerType !== "mouse") {
    return;
  }
  if (!hoverZoom.activeThumb) {
    return;
  }

  const thumb = getClosestSlideThumb(event.target);
  if (!thumb || thumb !== hoverZoom.activeThumb) {
    return;
  }

  const next = getClosestSlideThumb(event.relatedTarget);
  if (next && el.rowsBody.contains(next)) {
    showHoverZoom(next);
    return;
  }

  hideHoverZoom();
}

function showHoverZoom(thumb) {
  ensureHoverZoomRoot();
  const url = thumb.dataset.url || thumb.querySelector("img")?.currentSrc || thumb.querySelector("img")?.src;
  if (!url) {
    return;
  }

  hoverZoom.activeThumb = thumb;
  hoverZoom.image.src = url;
  hoverZoom.image.alt = thumb.dataset.caption || "Слайд";
  hoverZoom.root.hidden = false;
  hoverZoom.root.classList.add("is-visible");
  syncHoverZoomPosition();
}

function hideHoverZoom() {
  if (!hoverZoom.root) {
    hoverZoom.activeThumb = null;
    return;
  }
  hoverZoom.activeThumb = null;
  hoverZoom.root.classList.remove("is-visible");
  hoverZoom.root.hidden = true;
  hoverZoom.root.style.transform = "translate3d(-9999px, -9999px, 0)";
}

function syncHoverZoomPosition() {
  if (!hoverZoom.root || !hoverZoom.activeThumb) {
    return;
  }

  const rect = hoverZoom.activeThumb.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    hideHoverZoom();
    return;
  }

  const maxWidth = Math.max(120, window.innerWidth - HOVER_ZOOM_MARGIN * 2);
  const maxHeight = Math.max(120, window.innerHeight - HOVER_ZOOM_MARGIN * 2);
  const scale = Math.min(1, maxWidth / HOVER_ZOOM_FIXED_WIDTH, maxHeight / HOVER_ZOOM_FIXED_HEIGHT);
  const width = Math.round(HOVER_ZOOM_FIXED_WIDTH * scale);
  const height = Math.round(HOVER_ZOOM_FIXED_HEIGHT * scale);

  let left = rect.left;
  let top = rect.top;

  if (left + width > window.innerWidth - HOVER_ZOOM_MARGIN) {
    left = rect.right - width;
  }
  if (top + height > window.innerHeight - HOVER_ZOOM_MARGIN) {
    top = rect.bottom - height;
  }

  left = Math.max(HOVER_ZOOM_MARGIN, Math.min(left, window.innerWidth - width - HOVER_ZOOM_MARGIN));
  top = Math.max(HOVER_ZOOM_MARGIN, Math.min(top, window.innerHeight - height - HOVER_ZOOM_MARGIN));

  hoverZoom.root.style.width = `${width}px`;
  hoverZoom.root.style.height = `${height}px`;
  hoverZoom.root.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
}

function registerServiceWorker() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return;
  }

  if (!("serviceWorker" in navigator)) {
    return;
  }

  if (!window.isSecureContext) {
    return;
  }

  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}
