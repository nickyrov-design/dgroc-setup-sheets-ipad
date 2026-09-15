/**
 * Full-screen photo viewer. Swipe (or use the arrows) to move between photos,
 * swipe down to close, and pinch or double-tap to zoom — the app turns off
 * browser zoom, so zooming is handled here. The bars label, export and delete
 * the photo on screen.
 *
 * The viewer works on the gallery's own `photos` array, so a photo deleted
 * through `onDelete` disappears here too without copying state around.
 */

import Router from "./router.js";

const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;
const SWIPE_DISTANCE = 60;
const CLOSE_DISTANCE = 120;

const CHEVRON_LEFT = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
const CHEVRON_RIGHT = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

let _closeActive = null;

export function closePhotoViewer() {
  if (_closeActive) _closeActive();
}

function preventDefault(e) { e.preventDefault(); }

/**
 * photos:   array of photo metadata rows (shared with the caller)
 * index:    photo to open at
 * thumbUrl: photo => object URL of its thumbnail (shown while the full image loads)
 * loadFull: photo => Promise<Blob> of the full-size JPEG
 * onLabel:  photo => Promise, edits the label (photo.label is updated in place)
 * onDelete: photo => Promise<boolean>, true if it was deleted
 * onExport: (photo, index, blob) => void, or null to hide Export
 */
export function openPhotoViewer({ photos, index, thumbUrl, loadFull, onLabel, onDelete, onExport }) {
  closePhotoViewer();

  const overlay = document.createElement("div");
  overlay.className = "photo-viewer";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Photo viewer");
  overlay.innerHTML = `
    <div class="photo-viewer__bar">
      <button type="button" class="btn btn--ghost btn--sm" data-act="close">Close</button>
      <span class="photo-viewer__count" data-count></span>
      <button type="button" class="btn btn--danger btn--sm" data-act="delete">Delete</button>
    </div>
    <div class="photo-viewer__stage" data-stage>
      <img class="photo-viewer__img" data-img alt="" draggable="false" />
      <button type="button" class="photo-viewer__nav photo-viewer__nav--prev" data-act="prev" aria-label="Previous photo">${CHEVRON_LEFT}</button>
      <button type="button" class="photo-viewer__nav photo-viewer__nav--next" data-act="next" aria-label="Next photo">${CHEVRON_RIGHT}</button>
    </div>
    <div class="photo-viewer__bar">
      <button type="button" class="photo-viewer__label" data-act="label"></button>
      ${onExport ? `<button type="button" class="btn btn--primary btn--sm" data-act="export">Export photo&hellip;</button>` : ""}
    </div>
  `;
  document.body.appendChild(overlay);
  document.documentElement.classList.add("has-photo-viewer");

  const stage = overlay.querySelector("[data-stage]");
  const img = overlay.querySelector("[data-img]");
  const countEl = overlay.querySelector("[data-count]");
  const labelBtn = overlay.querySelector('[data-act="label"]');
  const prevBtn = overlay.querySelector('[data-act="prev"]');
  const nextBtn = overlay.querySelector('[data-act="next"]');
  const exportBtn = overlay.querySelector('[data-act="export"]');

  const view = { scale: 1, x: 0, y: 0 };
  const pointers = new Map();
  let gesture = null;
  let lastTap = { time: 0, x: 0, y: 0 };
  let current = null;
  let fullBlob = null;
  let fullUrl = null;
  let loadToken = 0;
  let closed = false;

  /* ---- Showing a photo ---- */

  function dropFull() {
    if (fullUrl) URL.revokeObjectURL(fullUrl);
    fullUrl = null;
    fullBlob = null;
  }

  function show(i) {
    index = Math.max(0, Math.min(i, photos.length - 1));
    current = photos[index];
    resetView();
    apply(false);
    dropFull();
    img.src = thumbUrl(current) || "";
    updateChrome();

    /* Swap in the full-size JPEG once it has loaded. */
    const photo = current;
    const token = ++loadToken;
    Promise.resolve(loadFull(photo))
      .then((blob) => {
        if (closed || token !== loadToken || !blob) return;
        fullBlob = blob;
        fullUrl = URL.createObjectURL(blob);
        const pre = new Image();
        pre.onload = () => { if (!closed && token === loadToken) img.src = fullUrl; };
        pre.src = fullUrl;
      })
      .catch((err) => console.error(err));
  }

  function updateChrome() {
    countEl.textContent = `Photo ${index + 1} of ${photos.length}`;
    labelBtn.textContent = current.label || "+ Add label";
    labelBtn.classList.toggle("is-empty", !current.label);
    prevBtn.hidden = index === 0;
    nextBtn.hidden = index >= photos.length - 1;
  }

  /* ---- Zoom / pan ---- */

  function resetView() {
    view.scale = 1;
    view.x = 0;
    view.y = 0;
  }

  function apply(animate) {
    img.style.transition = animate ? "transform 0.2s ease-out" : "none";
    img.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  }

  /* Size of the fitted image at scale 1, and of the stage. */
  function contentSize() {
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const nw = img.naturalWidth || sw;
    const nh = img.naturalHeight || sh;
    const fit = Math.min(sw / nw, sh / nh);
    return { w: nw * fit, h: nh * fit, sw, sh };
  }

  /* Keep the zoomed image covering the stage — no panning off into black. */
  function clamp() {
    const { w, h, sw, sh } = contentSize();
    const maxX = Math.max(0, (w * view.scale - sw) / 2);
    const maxY = Math.max(0, (h * view.scale - sh) / 2);
    view.x = Math.min(maxX, Math.max(-maxX, view.x));
    view.y = Math.min(maxY, Math.max(-maxY, view.y));
  }

  /* Zoom to `scale`, keeping the point under (clientX, clientY) in place. */
  function zoomAt(scale, clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    const fx = clientX - (rect.left + rect.width / 2);
    const fy = clientY - (rect.top + rect.height / 2);
    const next = Math.min(MAX_SCALE, Math.max(1, scale));
    view.x = fx - (next / view.scale) * (fx - view.x);
    view.y = fy - (next / view.scale) * (fy - view.y);
    view.scale = next;
    clamp();
  }

  /* ---- Gestures ---- */

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function onPointerDown(e) {
    if (e.target.closest("button")) return;
    try { stage.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      gesture = {
        type: view.scale > 1 ? "pan" : "swipe",
        startX: e.clientX, startY: e.clientY,
        lastX: e.clientX, lastY: e.clientY,
        startTime: performance.now(),
        moved: false,
      };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { type: "pinch", lastDist: distance(a, b), lastMid: midpoint(a, b) };
      clamp();
      apply(false);
    }
  }

  function onPointerMove(e) {
    if (!gesture || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (gesture.type === "pinch") {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const dist = distance(a, b);
      const mid = midpoint(a, b);
      if (gesture.lastDist > 0) zoomAt(view.scale * (dist / gesture.lastDist), mid.x, mid.y);
      view.x += mid.x - gesture.lastMid.x;
      view.y += mid.y - gesture.lastMid.y;
      clamp();
      apply(false);
      gesture.lastDist = dist;
      gesture.lastMid = mid;
      return;
    }

    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) gesture.moved = true;

    if (gesture.type === "pan") {
      view.x += e.clientX - gesture.lastX;
      view.y += e.clientY - gesture.lastY;
      clamp();
      apply(false);
    } else if (gesture.moved) {
      /* Swipe feedback: follow the finger sideways, or downwards to close. */
      img.style.transition = "none";
      img.style.transform = `translate(${dx}px, ${Math.max(0, dy)}px)`;
    }
    gesture.lastX = e.clientX;
    gesture.lastY = e.clientY;
  }

  function onPointerUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (!gesture) return;

    if (gesture.type === "pinch") {
      if (pointers.size === 1) {
        /* One finger lifted: carry on panning with the other, never swipe. */
        const [p] = [...pointers.values()];
        gesture = { type: "pan", startX: p.x, startY: p.y, lastX: p.x, lastY: p.y, startTime: 0, moved: true };
      } else if (pointers.size === 0) {
        gesture = null;
        if (view.scale < 1.05) { resetView(); apply(true); }
      }
      return;
    }
    if (pointers.size > 0) return;

    const g = gesture;
    gesture = null;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (!g.moved && performance.now() - g.startTime < 300) {
      handleTap(e.clientX, e.clientY);
      return;
    }
    if (g.type === "swipe") {
      if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0 && index < photos.length - 1) { show(index + 1); return; }
        if (dx > 0 && index > 0) { show(index - 1); return; }
      } else if (dy > CLOSE_DISTANCE && dy > Math.abs(dx)) {
        close();
        return;
      }
      apply(true); /* snap back */
    }
  }

  function onPointerCancel(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      gesture = null;
      clamp();
      apply(true);
    }
  }

  function handleTap(x, y) {
    const now = performance.now();
    if (now - lastTap.time < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 30) {
      lastTap.time = 0;
      if (view.scale > 1) resetView();
      else zoomAt(DOUBLE_TAP_SCALE, x, y);
      apply(true);
    } else {
      lastTap = { time: now, x, y };
    }
  }

  /* Trackpad pinch / mouse wheel — for desktop browsers during development. */
  function onWheel(e) {
    e.preventDefault();
    zoomAt(view.scale * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
    apply(false);
  }

  function onKey(e) {
    /* Leave keys alone while a dialog (e.g. the label picker) sits on top. */
    const modals = document.querySelectorAll('[aria-modal="true"]');
    if (modals[modals.length - 1] !== overlay) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft" && index > 0) show(index - 1);
    else if (e.key === "ArrowRight" && index < photos.length - 1) show(index + 1);
  }

  function onResize() {
    clamp();
    apply(false);
  }

  /* ---- Wiring ---- */

  function close() {
    if (closed) return;
    closed = true;
    dropFull();
    overlay.remove();
    document.documentElement.classList.remove("has-photo-viewer");
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("gesturestart", preventDefault);
    window.removeEventListener("resize", onResize);
    if (_closeActive === close) _closeActive = null;
  }

  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("pointercancel", onPointerCancel);
  stage.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("keydown", onKey);
  /* Safari's own pinch gesture events — stop them zooming the page underneath. */
  document.addEventListener("gesturestart", preventDefault);
  window.addEventListener("resize", onResize);

  overlay.querySelector('[data-act="close"]').addEventListener("click", close);
  prevBtn.addEventListener("click", () => show(index - 1));
  nextBtn.addEventListener("click", () => show(index + 1));

  labelBtn.addEventListener("click", async () => {
    const photo = current;
    await onLabel(photo);
    if (!closed && photo === current) updateChrome();
  });

  overlay.querySelector('[data-act="delete"]').addEventListener("click", async () => {
    const removed = await onDelete(current);
    if (closed || !removed) return;
    if (photos.length === 0) close();
    else show(index); /* the next photo moves into this position */
  });

  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      const photo = current;
      const blob = fullBlob || (await loadFull(photo));
      if (blob && !closed) onExport(photo, photos.indexOf(photo), blob);
    });
  }

  _closeActive = close;
  Router.onLeave(close);
  show(index);
}
