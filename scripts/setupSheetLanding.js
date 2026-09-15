/**
 * Landing: three cards for Extremity / Head and Neck / Omniboard, plus a
 * "resume unfinished sheet" banner when a draft with entered data or photos
 * exists (e.g. after the app was closed with the home button mid-sheet).
 */

import SETUP_SHEET_CONFIGS, { SETUP_SHEET_ORDER } from "./setupSheetConfigs/index.js";
import Storage from "./storage.js";
import { readDraft, clearDraft, draftHasData } from "./draft.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatWhen(iso) {
  if (!iso) return "";
  return iso.slice(0, 16).replace("T", " ");
}

const SetupSheetLanding = {
  mount(container) {
    this._container = container;
    this._render();
  },

  async _render() {
    const hash = location.hash;
    let photoCounts = new Map();
    try {
      photoCounts = await Storage.photos.countByOwner();
    } catch (err) {
      console.error(err);
    }
    /* The user moved on while photo counts were loading. */
    if (location.hash !== hash) return;

    const unfinished = SETUP_SHEET_ORDER
      .map((id) => {
        const cfg = SETUP_SHEET_CONFIGS[id];
        const draft = readDraft(id);
        const photoCount = photoCounts.get(Storage.photos.owner.draft(id)) || 0;
        const hasEntries = !!draft && draftHasData(draft.data, cfg);
        if (!hasEntries && photoCount === 0) return null;
        return { id, cfg, savedAt: draft?.savedAt || null, photoCount };
      })
      .filter(Boolean);

    const resumeHtml = unfinished.length === 0 ? "" : `
      <div class="resume-banner" role="status">
        <div class="resume-banner__head">
          <span class="resume-banner__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"/>
              <polyline points="12 7 12 12 15 14"/>
            </svg>
          </span>
          <div>
            <div class="resume-banner__title">Unfinished set-up sheet${unfinished.length > 1 ? "s" : ""}</div>
            <div class="resume-banner__sub">Pick up where you left off &mdash; your entries were saved on this iPad.</div>
          </div>
        </div>
        <ul class="resume-list">
          ${unfinished.map((u) => {
            const details = [
              u.savedAt ? `Saved ${escapeHtml(formatWhen(u.savedAt))}` : "",
              u.photoCount ? `${u.photoCount} photo${u.photoCount === 1 ? "" : "s"}` : "",
            ].filter(Boolean).join(" &middot; ");
            return `
            <li class="resume-item">
              <div class="resume-item__info">
                <span class="resume-item__label">${escapeHtml(u.cfg.label)}</span>
                ${details ? `<span class="resume-item__when">${details}</span>` : ""}
              </div>
              <div class="resume-item__actions">
                <button type="button" class="btn btn--ghost btn--sm" data-resume-discard="${escapeHtml(u.id)}" data-photo-count="${u.photoCount}">Discard</button>
                <a class="btn btn--primary btn--sm" href="#/form/${encodeURIComponent(u.id)}">Resume</a>
              </div>
            </li>
          `;
          }).join("")}
        </ul>
      </div>
    `;

    const cards = SETUP_SHEET_ORDER.map((id) => {
      const cfg = SETUP_SHEET_CONFIGS[id];
      return `
        <a class="tool-card" href="#/form/${id}">
          <div class="tool-card__icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <span class="tool-card__label">${cfg.label}</span>
          <span class="tool-card__desc">${cfg.desc}</span>
        </a>
      `;
    }).join("");

    this._container.innerHTML = `
      <h1 class="page-title">Set-Up Sheets</h1>
      <p class="page-sub">Select a sheet to begin.</p>
      ${resumeHtml}
      <div class="tool-grid">${cards}</div>
    `;

    this._bind();
  },

  _bind() {
    this._container.querySelectorAll("[data-resume-discard]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const id = btn.dataset.resumeDiscard;
        const cfg = SETUP_SHEET_CONFIGS[id];
        const photoCount = Number(btn.dataset.photoCount) || 0;
        const what = photoCount > 0
          ? `, its entries and ${photoCount} photo${photoCount === 1 ? "" : "s"}`
          : " and its entries";
        if (!confirm(`Discard the unfinished ${cfg?.label || ""} sheet${what}?`)) return;
        clearDraft(id);
        try {
          await Storage.photos.removeByOwner(Storage.photos.owner.draft(id));
        } catch (err) {
          console.error(err);
          alert("Could not delete the draft's photos: " + (err.message || err));
        }
        this._render();
      });
    });
  },
};

export default SetupSheetLanding;
