/**
 * Photos section of a set-up sheet: Take photo / Choose existing, a thumbnail
 * grid with labels, and the full-screen viewer.
 *
 * Photos are saved the moment they're added, independently of the sheet's
 * Save / Complete. `owner` says where they belong: a draft's photos live
 * under its sheet type and move onto the record when the sheet is completed
 * (see Storage.records.save).
 *
 * Photos taken with "Take photo" come straight into the app and are never
 * written to the iPad's Photos library.
 */

import Router from "./router.js";
import Storage from "./storage.js";
import { processPhotoFile } from "./photos.js";
import { openPhotoViewer, closePhotoViewer } from "./photoViewer.js";
import { photoFilename } from "./exportFiles.js";
import { shareFiles } from "./share.js";

const CAMERA_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
const IMAGE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---- Label picker dialog ---- */

/**
 * Resolves to the chosen label, "" to remove the label, or null if cancelled.
 * Sits above the photo viewer, so it gets its own overlay rather than #dialog-root.
 */
function pickPhotoLabel({ title, current, presets }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "dialog-backdrop photo-label-dialog";
    overlay.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="photo-label-title">
        <h3 class="dialog__title" id="photo-label-title">${escapeHtml(title)}</h3>
        <p class="dialog__desc">Tap a label or type your own. It's added to the photo's filename when exported.</p>
        ${presets.length ? `
          <div class="label-chips">
            ${presets.map((name, i) => `
              <button type="button" class="label-chip${name === current ? " is-active" : ""}" data-chip="${i}">${escapeHtml(name)}</button>
            `).join("")}
          </div>` : ""}
        <div class="dialog__field">
          <label for="photo-label-input">Custom label</label>
          <input type="text" id="photo-label-input" maxlength="40" autocomplete="off" value="${escapeHtml(current)}" />
        </div>
        <div class="dialog__actions">
          ${current ? `<button type="button" class="btn btn--ghost" data-act="clear">Remove label</button>` : ""}
          <button type="button" class="btn btn--ghost" data-act="cancel">Cancel</button>
          <button type="button" class="btn btn--primary" data-act="save">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector("#photo-label-input");
    const done = (value) => { overlay.remove(); resolve(value); };

    overlay.querySelectorAll("[data-chip]").forEach((chip) => {
      chip.addEventListener("click", () => done(presets[Number(chip.dataset.chip)]));
    });
    overlay.querySelector('[data-act="cancel"]').addEventListener("click", () => done(null));
    overlay.querySelector('[data-act="save"]').addEventListener("click", () => done(input.value.trim()));
    overlay.querySelector('[data-act="clear"]')?.addEventListener("click", () => done(""));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); done(input.value.trim()); }
      else if (e.key === "Escape") done(null);
    });
  });
}

/* ---- Gallery ---- */

/**
 * Renders the Photos section into `host` and keeps it in sync with storage.
 *
 * owner:          Storage.photos.owner.draft(sheetId) or .record(recordId)
 * exportBaseName: filename base for exporting single photos, or null to hide
 *                 Export (drafts: photos are exported with the filed sheet)
 * onChange:       called with the photo count after loading and every change
 *
 * Returns { whenIdle(), unmount() }.
 */
export function mountPhotoGallery(host, { owner, exportBaseName = null, onChange = () => {} }) {
  const state = {
    photos: [],
    urls: new Map(),   /* photo id -> thumbnail object URL */
    loading: true,
    busy: null,        /* promise while an import is running */
    unmounted: false,
  };

  function revokeUrls() {
    for (const url of state.urls.values()) URL.revokeObjectURL(url);
    state.urls.clear();
  }

  function tileHtml(photo, i) {
    const url = URL.createObjectURL(new Blob([photo.thumb], { type: "image/jpeg" }));
    state.urls.set(photo.id, url);
    const label = photo.label || "";
    return `
      <figure class="photo-tile">
        <button type="button" class="photo-tile__open" data-photo-open="${i}" aria-label="View photo ${i + 1}${label ? `, ${escapeHtml(label)}` : ""}">
          <img src="${url}" alt="" draggable="false" />
          <span class="photo-tile__num">${i + 1}</span>
        </button>
        <button type="button" class="photo-tile__label${label ? "" : " is-empty"}" data-photo-label="${i}">${label ? escapeHtml(label) : "+ Add label"}</button>
      </figure>
    `;
  }

  function render() {
    revokeUrls();
    const count = state.photos.length;
    const disabled = state.loading || !!state.busy;
    const addClass = `photo-section__add${disabled ? " is-disabled" : ""}`;

    let body = "";
    if (!state.loading) {
      body = count
        ? `<div class="photo-grid">${state.photos.map(tileHtml).join("")}</div>`
        : `<p class="photo-section__empty">No photos yet. Take set-up photos here, or choose ones already on the iPad.</p>`;
    }

    host.innerHTML = `
      <div class="photo-section__head">
        <h3 class="setup-sheet__section-title">Photos${count ? ` (${count})` : ""}</h3>
        <div class="photo-section__actions">
          <label class="btn btn--primary btn--sm ${addClass}">
            <input type="file" accept="image/*" capture="environment" data-photo-input="camera"${disabled ? " disabled" : ""} />
            ${CAMERA_ICON}<span>Take photo</span>
          </label>
          <label class="btn btn--ghost btn--sm ${addClass}">
            <input type="file" accept="image/*" multiple data-photo-input="library"${disabled ? " disabled" : ""} />
            ${IMAGE_ICON}<span>Choose existing</span>
          </label>
        </div>
      </div>
      ${body}
      <p class="photo-section__hint">Photos taken with <strong>Take photo</strong> stay in this app &mdash; they aren't saved to the iPad's Photos library.</p>
      <p class="photo-section__status" data-photo-status aria-live="polite"></p>
    `;
    bind();
  }

  function bind() {
    host.querySelectorAll("[data-photo-input]").forEach((input) => {
      input.addEventListener("change", () => {
        const files = Array.from(input.files || []);
        const fromCamera = input.dataset.photoInput === "camera";
        input.value = "";
        if (files.length) importFiles(files, fromCamera);
      });
    });
    host.querySelectorAll("[data-photo-open]").forEach((btn) => {
      btn.addEventListener("click", () => openViewer(Number(btn.dataset.photoOpen)));
    });
    host.querySelectorAll("[data-photo-label]").forEach((btn) => {
      btn.addEventListener("click", () => editLabel(state.photos[Number(btn.dataset.photoLabel)]));
    });
  }

  function setStatus(text, isError = false) {
    const el = host.querySelector("[data-photo-status]");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("is-error", isError);
  }

  function setBusy(busy) {
    host.querySelectorAll(".photo-section__add").forEach((el) => el.classList.toggle("is-disabled", busy));
    host.querySelectorAll("[data-photo-input]").forEach((el) => { el.disabled = busy; });
  }

  /* Updates one tile's label in place, so thumbnails don't reload. */
  function refreshTile(photo) {
    const i = state.photos.indexOf(photo);
    const labelBtn = host.querySelector(`[data-photo-label="${i}"]`);
    if (labelBtn) {
      labelBtn.textContent = photo.label || "+ Add label";
      labelBtn.classList.toggle("is-empty", !photo.label);
    }
    const openBtn = host.querySelector(`[data-photo-open="${i}"]`);
    if (openBtn) openBtn.setAttribute("aria-label", `View photo ${i + 1}${photo.label ? `, ${photo.label}` : ""}`);
  }

  /* ---- Actions ---- */

  async function importFiles(files, fromCamera) {
    if (state.busy || state.loading) return;
    let finish;
    state.busy = new Promise((resolve) => { finish = resolve; });
    setBusy(true);

    const unreadable = [];
    let outOfSpace = false;
    let lastAdded = null;
    try {
      for (let i = 0; i < files.length; i++) {
        if (!state.unmounted) {
          setStatus(files.length > 1 ? `Adding photo ${i + 1} of ${files.length}…` : "Adding photo…");
        }
        try {
          const image = await processPhotoFile(files[i]);
          const res = await Storage.photos.add(owner, image);
          state.photos.push(res.photo);
          lastAdded = res.photo;
        } catch (err) {
          console.error(err);
          if (err?.name === "QuotaExceededError") { outOfSpace = true; break; }
          unreadable.push(files[i].name || `photo ${i + 1}`);
        }
      }
    } finally {
      state.busy = null;
      finish();
    }

    if (state.unmounted) return;
    render();
    onChange(state.photos.length);

    if (outOfSpace) {
      setStatus("The iPad is out of storage for this app, so not every photo was saved. Delete photos from archived sheets in Settings, then try again.", true);
    } else if (unreadable.length) {
      setStatus(`Couldn't add ${unreadable.join(", ")} — not a photo the iPad can read.`, true);
    }

    /* A single camera shot: offer to label it while the view is fresh in mind. */
    if (fromCamera && files.length === 1 && lastAdded) editLabel(lastAdded);
  }

  async function editLabel(photo) {
    if (!photo) return;
    let presets = [];
    try {
      presets = (await Storage.photoLabels.list()).map((l) => l.name);
    } catch (err) {
      console.error(err);
    }
    const number = state.photos.indexOf(photo) + 1;
    const next = await pickPhotoLabel({ title: `Label photo ${number}`, current: photo.label || "", presets });
    if (next === null || next === (photo.label || "")) return;
    try {
      const res = await Storage.photos.setLabel(photo.id, next);
      if (!res.ok) { alert(res.error || "Could not save the label."); return; }
      photo.label = res.photo.label;
      if (!state.unmounted) refreshTile(photo);
    } catch (err) {
      console.error(err);
      alert("Could not save the label: " + (err.message || err));
    }
  }

  async function deletePhoto(photo) {
    const i = state.photos.indexOf(photo);
    if (i < 0) return false;
    const name = `photo ${i + 1}${photo.label ? ` (${photo.label})` : ""}`;
    if (!confirm(`Delete ${name}? This can't be undone.`)) return false;
    try {
      await Storage.photos.remove(photo.id);
    } catch (err) {
      console.error(err);
      alert("Could not delete the photo: " + (err.message || err));
      return false;
    }
    state.photos.splice(state.photos.indexOf(photo), 1);
    if (!state.unmounted) render();
    onChange(state.photos.length);
    return true;
  }

  async function exportPhoto(photo, index, blob) {
    const file = new File([blob], photoFilename(exportBaseName, index, photo.label), { type: "image/jpeg" });
    const res = await shareFiles([file]);
    if (!res.ok && !res.canceled) alert(res.error || "Could not export the photo.");
  }

  function openViewer(index) {
    if (!state.photos[index]) return;
    openPhotoViewer({
      photos: state.photos,
      index,
      thumbUrl: (photo) => state.urls.get(photo.id),
      loadFull: async (photo) => (await Storage.photos.getBlobs([photo.id]))[0],
      onLabel: editLabel,
      onDelete: deletePhoto,
      onExport: exportBaseName ? exportPhoto : null,
    });
  }

  function unmount() {
    if (state.unmounted) return;
    state.unmounted = true;
    closePhotoViewer();
    revokeUrls();
  }

  /* ---- Mount ---- */

  render();
  Storage.photos.list(owner)
    .then((rows) => {
      if (state.unmounted) return;
      state.photos = rows;
      state.loading = false;
      render();
      onChange(rows.length);
    })
    .catch((err) => {
      console.error(err);
      if (state.unmounted) return;
      state.loading = false;
      render();
      setStatus("Could not load photos: " + (err.message || err), true);
    });
  Router.onLeave(unmount);

  return {
    /* Resolves once any import in progress has finished saving. */
    whenIdle: () => state.busy || Promise.resolve(),
    unmount,
  };
}
