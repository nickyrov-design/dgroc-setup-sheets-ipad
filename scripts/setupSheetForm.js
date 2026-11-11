/**
 * Set-Up Sheet Form (shared across Extremity, Head & Neck, Omniboard).
 * iPad PWA port of the desktop component.
 *
 * Modes:
 *   "new"   — fresh form, draft auto-saved per sheetId in localStorage
 *   "view"  — completed sheet, fields disabled, export/edit actions shown
 *   "edit"  — re-editing an existing sheet; appended to its editHistory on save
 *
 * Unsaved-work protection:
 *   - "new" drafts auto-save on every keystroke and whenever the app is
 *     backgrounded (home button), and reload when the sheet is reopened.
 *   - Leaving a form with unsaved entries (History / Settings / logo) prompts
 *     the user to complete & file, keep the draft, or stay.
 *
 * Photos (photoGallery.js) are saved as soon as they're added, in every mode.
 * A draft's photos count as unsaved work and move onto the record when the
 * sheet is completed.
 *
 * Scan checklist (checklistSection.js): a second tab, on by default for every
 * new sheet. Its state travels with the draft / record as `checklist`, and it
 * is printed on its own page(s) after the set-up sheet (checklistPdf.js).
 * Sheets completed before checklists existed have no `checklist` and no tab.
 */

import Router from "./router.js";
import SETUP_SHEET_CONFIGS from "./setupSheetConfigs/index.js";
import Storage from "./storage.js";
import { readDraft, writeDraft, clearDraft, draftHasData } from "./draft.js";
import { mountPhotoGallery } from "./photoGallery.js";
import { buildExportBaseName, exportSheet } from "./exportFiles.js";
import { mountChecklist, confirmIncompleteChecklist } from "./checklistSection.js";
import {
  newChecklistState, readChecklistState, checklistModel, checklistProgress,
  checklistIssues, toRecordChecklist, checklistFingerprint,
} from "./checklistState.js";
import { appendChecklistPages } from "./checklistPdf.js";
import { fillListSelects, listSelectValue, ADD_NEW } from "./nameLists.js";

const NA = "N/A";

/* Text fields shown as a dropdown of an editable name list (with "+ Add
   new…"). They stay "text" in the configs, which match the desktop tool's,
   so their values, drafts and PDF output are unchanged. */
const LIST_FIELDS = {
  radiotherapist: "therapists",
  diagnosis: "diagnoses",
};

/* List fields that can hold several names. The first dropdown is always
   shown and is the field itself (e.g. `radiotherapist`, which the scan
   checklist's "Person performing scan" uses); "+ Add" adds more, up to
   `max` in all, saved in order as `extraKey`. On the PDF every name prints
   on the field's line, shrinking to fit `pdfMaxWidth` points. */
const MULTI_FIELDS = {
  radiotherapist: {
    extraKey: "extraRadiotherapists",
    max: 5,
    addLabel: "+ Add therapist",
    hint: "Up to 5 therapists or students.",
    pdfMaxWidth: 174,
  },
};

/* Every name in a multi-name field, first one first, without blanks or repeats. */
function multiNames(id, data) {
  const m = MULTI_FIELDS[id];
  const extras = Array.isArray(data?.[m.extraKey]) ? data[m.extraKey] : [];
  const out = [];
  for (const v of [data?.[id], ...extras]) {
    const s = String(v || "").trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapText(text, maxWidth, font, size) {
  const out = [];
  const paragraphs = String(text).split(/\r?\n/);
  for (const para of paragraphs) {
    if (!para.trim()) { out.push(""); continue; }
    const words = para.split(/\s+/);
    let line = "";
    for (const w of words) {
      const candidate = line ? line + " " + w : w;
      const width = font.widthOfTextAtSize(candidate, size);
      if (width > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function formatDatePdf(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* ---- Therapist picker dialog (replaces desktop name+password dialog) ---- */

async function pickTherapist({ title, confirmLabel }) {
  const therapists = await Storage.therapists.list();
  const defaultId = await Storage.settings.get("defaultTherapistId");
  const initial = therapists.some((t) => t.id === defaultId) ? defaultId : "";

  return new Promise((resolve) => {
    const root = document.getElementById("dialog-root");
    root.innerHTML = `
      <div class="dialog-backdrop" id="picker-backdrop">
        <div class="dialog" role="dialog" aria-modal="true">
          <h3 class="dialog__title">${escapeHtml(title)}</h3>
          <p class="dialog__desc">Select the therapist completing this sheet.</p>
          <div class="dialog__field">
            <label for="picker-select">Therapist</label>
            <select id="picker-select" data-list="therapists" data-list-value="id" data-value="${escapeHtml(initial)}"
              data-placeholder="${therapists.length ? "Select…" : "None yet — add a name"}"></select>
          </div>
          <div class="dialog__actions">
            <button type="button" class="btn btn--ghost" id="picker-cancel">Cancel</button>
            <button type="button" class="btn btn--primary" id="picker-ok" disabled>${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      </div>
    `;

    const select = document.getElementById("picker-select");
    const okBtn = document.getElementById("picker-ok");
    const syncOk = () => { okBtn.disabled = !listSelectValue(select); };
    select.addEventListener("change", syncOk);
    fillListSelects(root).then(syncOk);

    const cleanup = () => { root.innerHTML = ""; };
    document.getElementById("picker-cancel").addEventListener("click", () => { cleanup(); resolve(null); });
    okBtn.addEventListener("click", async () => {
      const id = listSelectValue(select);
      /* Re-read the list: a name may have been added from this dialog. */
      const t = (await Storage.therapists.list()).find((x) => x.id === id);
      if (!t) return;
      cleanup();
      resolve({ userId: t.id, name: t.name });
    });
  });
}

/* ---- Component ---- */

const SetupSheetForm = {
  _container: null,
  _config: null,
  _mode: "new",
  _record: null,
  _gallery: null,
  _photoCount: 0,
  _checklist: null,     /* checklist state (edited in place), null = no checklist */
  _checklistUi: null,
  _tab: "sheet",        /* "sheet" | "checklist" */

  async mountNew(container, sheetId) {
    this._container = container;
    const config = SETUP_SHEET_CONFIGS[sheetId];
    if (!config) {
      Router.clearGuard();
      container.innerHTML = `<div class="page-error">Unknown sheet type: ${escapeHtml(sheetId)}</div>`;
      return;
    }
    const hash = location.hash;
    this._config = config;
    this._mode = "new";
    this._record = null;
    this._tab = "sheet";
    const draft = readDraft(sheetId);
    const data = draft?.data || {};
    const checklist = await this._draftChecklist(sheetId, data);
    /* The user moved on while the draft's photos were being counted. */
    if (location.hash !== hash) return;
    this._checklist = checklist;
    this._render(data);
    this._bind();
    if (this._checklist.enabled && !this._checklist.siteId) {
      this._checklistUi?.openSitePicker({ first: true });
    }
  },

  /* The draft's checklist, or a fresh one. A site picked on a sheet that has
     nothing else on it belongs to an abandoned start, not to the next
     patient, so the site picker asks again. */
  async _draftChecklist(sheetId, data) {
    const saved = readChecklistState(data.checklist);
    if (!saved) return newChecklistState();
    if (draftHasData(data, this._config)) return saved;
    let photos = 0;
    try {
      photos = (await Storage.photos.countByOwner()).get(Storage.photos.owner.draft(sheetId)) || 0;
    } catch (err) {
      console.error(err);
    }
    return photos > 0 ? saved : newChecklistState();
  },

  async mountExisting(container, sheetId, recordId) {
    this._container = container;
    const config = SETUP_SHEET_CONFIGS[sheetId];
    if (!config) {
      Router.clearGuard();
      container.innerHTML = `<div class="page-error">Unknown sheet type.</div>`;
      return;
    }
    const record = await Storage.records.get(recordId);
    if (!record) {
      Router.clearGuard();
      container.innerHTML = `<div class="page-error">Sheet not found.</div>`;
      return;
    }
    this._config = config;
    this._mode = "view";
    this._record = record;
    this._tab = "sheet";
    this._checklist = readChecklistState(record.checklist);
    this._render(record);
    this._bind();
  },

  /* ---- Draft persistence ---- */

  _readDOM() {
    const data = {};
    for (const f of this._config.fields) {
      const el = document.getElementById(`ss-${f.id}`);
      if (!el) continue;
      if (f.type === "check") data[f.id] = !!el.checked;
      else if (f.type === "dropdown") data[f.id] = el.value || NA;
      else if (el.dataset.list) data[f.id] = listSelectValue(el);
      else data[f.id] = el.value;
    }
    /* Extra names of multi-name fields; if the first dropdown is blank, the
       next name moves up so the field itself is always the first name. */
    for (const [id, m] of Object.entries(MULTI_FIELDS)) {
      if (!(id in data)) continue;
      const extras = [...document.querySelectorAll(`select[data-multi-extra="${id}"]`)].map(listSelectValue);
      const names = multiNames(id, { [id]: data[id], [m.extraKey]: extras });
      data[id] = names[0] || "";
      data[m.extraKey] = names.slice(1, m.max);
    }
    if (this._checklist) data.checklist = JSON.parse(JSON.stringify(this._checklist));
    return data;
  },

  /* The set-up sheet values the checklist's patient and scan details use. */
  _sheetValues() {
    const val = (id) => {
      const el = document.getElementById(`ss-${id}`);
      if (!el) return "";
      return el.dataset.list ? listSelectValue(el) : el.value;
    };
    /* The first radiotherapist, as it will be saved (see _readDOM). */
    const extras = [...document.querySelectorAll('select[data-multi-extra="radiotherapist"]')].map(listSelectValue);
    const firstRt = multiNames("radiotherapist", { radiotherapist: val("radiotherapist"), extraRadiotherapists: extras })[0] || "";
    return {
      patientName: val("patientName"),
      patientId: val("patientId"),
      scanDate: val("scanDate"),
      radiotherapist: firstRt,
    };
  },

  _saveDraft() {
    if (this._mode !== "new") return;
    /* Only persist while the form is actually on screen — otherwise a
       backgrounding event fired on another page would read an empty DOM and
       clobber a good draft. */
    if (!document.getElementById("setup-sheet-form")) return;
    const data = this._readDOM();
    if (Object.keys(data).length === 0) return;
    writeDraft(this._config.id, data);
  },

  _clearDraft() {
    if (this._config) clearDraft(this._config.id);
  },

  /* ---- Unsaved-work detection ---- */

  _isDirty() {
    if (this._mode === "new") {
      return draftHasData(this._readDOM(), this._config) || this._photoCount > 0;
    }
    if (this._mode === "edit" && this._record) {
      const cur = this._readDOM();
      for (const f of this._config.fields) {
        const now = cur[f.id];
        const was = this._record[f.id];
        if (f.type === "check") {
          if (!!now !== !!was) return true;
        } else if (f.type === "dropdown") {
          const a = (now == null || now === "") ? NA : String(now);
          const b = (was == null || was === "") ? NA : String(was);
          if (a !== b) return true;
        } else if (String(now ?? "") !== String(was ?? "")) {
          return true;
        }
      }
      for (const m of Object.values(MULTI_FIELDS)) {
        const now = cur[m.extraKey] || [];
        const was = Array.isArray(this._record[m.extraKey]) ? this._record[m.extraKey] : [];
        if (JSON.stringify(now) !== JSON.stringify(was)) return true;
      }
      return checklistFingerprint(this._checklist)
        !== checklistFingerprint(readChecklistState(this._record.checklist));
    }
    return false;
  },

  /* Show the header Save button (next to History) while a fillable sheet is
     open, wired to the same file-and-save action as the footer button. */
  _syncHeaderSave() {
    const btn = document.getElementById("header-save-btn");
    if (!btn) return;
    const fillable = (this._mode === "new" || this._mode === "edit")
      && !!document.getElementById("setup-sheet-form");
    if (fillable) {
      btn.textContent = this._mode === "edit" ? "Save changes" : "Save";
      btn.hidden = false;
      btn.onclick = () => this._saveSheet(`/history/${this._config.id}`);
    } else {
      btn.hidden = true;
      btn.onclick = null;
    }
  },

  /* Mounts the Photos section for this sheet: the draft's photos while the
     sheet is new, the record's photos once it has been filed. */
  _mountPhotos() {
    if (this._gallery) this._gallery.unmount();
    this._gallery = null;
    this._photoCount = 0;
    const host = document.getElementById("ss-photos");
    if (!host) return;
    const owner = this._record
      ? Storage.photos.owner.record(this._record.id)
      : Storage.photos.owner.draft(this._config.id);
    this._gallery = mountPhotoGallery(host, {
      owner,
      exportBaseName: this._record ? buildExportBaseName(this._config, this._record) : null,
      onChange: (count) => {
        this._photoCount = count;
        const exportBtn = document.getElementById("ss-export-btn");
        if (exportBtn) exportBtn.textContent = count > 0 ? "Export…" : "Export PDF…";
      },
    });
  },

  /* Mounts the Scan checklist tab's content, if this sheet has a checklist. */
  _mountChecklist() {
    if (this._checklistUi) this._checklistUi.unmount();
    this._checklistUi = null;
    const host = document.getElementById("ss-checklist");
    if (!host || !this._checklist) return;
    this._checklistUi = mountChecklist(host, {
      state: this._checklist,
      readOnly: this._mode === "view",
      getSheet: () => this._sheetValues(),
      onChange: () => {
        this._saveDraft();
        this._syncChecklistBadge();
      },
    });
  },

  /* "12/35", "Choose site" or "Off", shown on the Scan checklist tab. */
  _checklistBadge() {
    const s = this._checklist;
    if (!s) return { text: "", complete: false };
    if (!s.enabled) return { text: "Off", complete: false };
    const model = checklistModel(s);
    if (!model.site) return { text: "Choose site", complete: false };
    const { answered, total } = checklistProgress(s, model);
    return { text: `${answered}/${total}`, complete: answered === total };
  },

  _syncChecklistBadge() {
    const el = document.getElementById("ss-checklist-badge");
    if (!el) return;
    const { text, complete } = this._checklistBadge();
    el.textContent = text;
    el.classList.toggle("is-complete", complete);
  },

  /* Shows a tab and scrolls to its top — or, with `firstOpen`, to the
     checklist's first unanswered item (after the "not finished" warning). */
  _showTab(tab, { firstOpen = false } = {}) {
    const panel = document.getElementById(`ss-panel-${tab}`);
    if (!panel) return;
    const switching = this._tab !== tab || panel.hidden;
    this._tab = tab;
    for (const t of ["sheet", "checklist"]) {
      const p = document.getElementById(`ss-panel-${t}`);
      if (p) p.hidden = t !== tab;
      const btn = document.getElementById(`ss-tab-${t}`);
      if (btn) btn.setAttribute("aria-selected", String(t === tab));
    }
    if (firstOpen) {
      const open = panel.querySelector("[data-item]:not(.is-done):not(.is-na)")
        || panel.querySelector(".checklist-choose")
        || panel;
      this._scrollBelowBars(open);
    } else if (switching) {
      this._scrollBelowBars(panel, { upOnly: true });
    }
  },

  /* Scrolls so `el` sits just below the sticky header and tab bar. With
     `upOnly`, only if it is above that point (so the page never jumps down). */
  _scrollBelowBars(el, { upOnly = false } = {}) {
    const header = document.querySelector(".app-header");
    const tabs = document.querySelector(".ss-tabs");
    const offset = (header?.offsetHeight || 0) + (tabs?.offsetHeight || 0) + 12;
    const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset);
    if (!upOnly || window.scrollY > top) window.scrollTo({ top });
  },

  /* Register (new/edit) or drop (view) the navigation guard for this screen. */
  _installGuard() {
    if (this._mode === "new" || this._mode === "edit") {
      Router.setGuard((target) => this._confirmLeave(target));
    } else {
      Router.clearGuard();
    }
  },

  /**
   * Consulted by the router when the user taps away from an unsaved sheet.
   * Resolves "proceed" (leave, draft kept), "stay", or "handled" (this method
   * completed & filed the sheet and navigated on its own).
   */
  _confirmLeave(targetHash) {
    if (!this._isDirty()) return Promise.resolve("proceed");

    const isEdit = this._mode === "edit";
    return new Promise((resolve) => {
      const root = document.getElementById("dialog-root");
      root.innerHTML = `
        <div class="dialog-backdrop">
          <div class="dialog" role="dialog" aria-modal="true">
            <h3 class="dialog__title">Save this set-up sheet?</h3>
            <p class="dialog__desc">
              ${isEdit
                ? "You have unsaved changes to this sheet. Save them before leaving?"
                : `This set-up sheet hasn&rsquo;t been filed yet. You can complete and file it now, or keep it as a draft and come back to it later.${this._photoCount > 0 ? " Its photos stay with the draft." : ""}`}
            </p>
            <div class="dialog__actions dialog__actions--stacked">
              <button type="button" class="btn btn--primary" id="leave-save">${isEdit ? "Save changes" : "Complete &amp; file"}</button>
              <button type="button" class="btn btn--ghost" id="leave-keep">${isEdit ? "Leave &amp; discard changes" : "Keep draft &amp; leave"}</button>
              <button type="button" class="btn btn--ghost" id="leave-cancel">Stay on this sheet</button>
            </div>
          </div>
        </div>
      `;
      const cleanup = () => { root.innerHTML = ""; };

      document.getElementById("leave-cancel").addEventListener("click", () => {
        cleanup();
        resolve("stay");
      });

      document.getElementById("leave-keep").addEventListener("click", () => {
        cleanup();
        /* "new": flush the latest keystrokes so the draft is complete.
           "edit": the filed record is untouched; in-progress edits are dropped. */
        if (this._mode === "new") this._saveDraft();
        resolve("proceed");
      });

      document.getElementById("leave-save").addEventListener("click", async () => {
        cleanup();
        const ok = await this._saveSheet(targetHash);
        resolve(ok ? "handled" : "stay");
      });
    });
  },

  /* ---- Rendering ---- */

  _render(d) {
    if (this._gallery) { this._gallery.unmount(); this._gallery = null; }
    if (this._checklistUi) { this._checklistUi.unmount(); this._checklistUi = null; }
    const readOnly = this._mode === "view";
    const header = this._renderHeader(d);

    const sections = new Map();
    for (const f of this._config.fields) {
      const key = f.section || "Fields";
      if (!sections.has(key)) sections.set(key, []);
      sections.get(key).push(f);
    }

    const sectionsHtml = Array.from(sections.entries()).map(([title, fields]) => `
      <section class="setup-sheet__section">
        <h3 class="setup-sheet__section-title">${escapeHtml(title)}</h3>
        <div class="setup-sheet__grid">
          ${fields.map((f) => this._renderField(f, d, readOnly)).join("")}
        </div>
      </section>
    `).join("");

    /* Sheets with a checklist get two tabs; older sheets keep the single page. */
    const hasChecklist = !!this._checklist;
    const tab = hasChecklist ? this._tab : "sheet";
    const badge = this._checklistBadge();
    const tabsHtml = !hasChecklist ? "" : `
      <div class="ss-tabs" role="tablist" aria-label="Sheet sections">
        <button type="button" role="tab" class="ss-tab" id="ss-tab-sheet" data-tab="sheet" aria-controls="ss-panel-sheet" aria-selected="${tab === "sheet"}">Set-up sheet</button>
        <button type="button" role="tab" class="ss-tab" id="ss-tab-checklist" data-tab="checklist" aria-controls="ss-panel-checklist" aria-selected="${tab === "checklist"}">
          Scan checklist
          <span class="ss-tab__badge${badge.complete ? " is-complete" : ""}" id="ss-checklist-badge">${escapeHtml(badge.text)}</span>
        </button>
      </div>`;

    this._container.innerHTML = `
      ${header}
      <form class="setup-sheet" id="setup-sheet-form" autocomplete="off" ${readOnly ? "data-readonly" : ""}>
        ${tabsHtml}
        <div class="ss-panel" id="ss-panel-sheet" role="tabpanel" aria-labelledby="ss-tab-sheet"${tab === "sheet" ? "" : " hidden"}>
          ${sectionsHtml}
        </div>
        ${hasChecklist ? `
          <div class="ss-panel" id="ss-panel-checklist" role="tabpanel" aria-labelledby="ss-tab-checklist"${tab === "checklist" ? "" : " hidden"}>
            <div id="ss-checklist"></div>
          </div>` : ""}
        <section class="setup-sheet__section photo-section" id="ss-photos" aria-label="Photos"></section>
        <div class="setup-sheet__footer">${this._renderFooter()}</div>
        <div class="setup-sheet__error" id="setup-sheet-error"></div>
      </form>
    `;
  },

  _renderHeader(d) {
    if (this._mode === "new") {
      return `
        <div class="setup-sheet__topbar">
          <div>
            Draft auto-saves on this iPad. Empty dropdowns render as &ldquo;N/A&rdquo;.
            Tap <strong>Complete Form</strong> when finished to save a locked copy.
          </div>
          <div class="setup-sheet__topbar-actions">
            <button type="button" class="btn btn--ghost" id="ss-clear-btn">Clear all</button>
          </div>
        </div>
      `;
    }
    if (this._mode === "view") {
      const editCount = Array.isArray(d.editHistory) ? d.editHistory.length : 0;
      const lastEdit = editCount ? d.editHistory[editCount - 1] : null;
      const editBlurb = lastEdit
        ? ` &middot; Last edited by <strong>${escapeHtml(lastEdit.name)}</strong> on <strong>${escapeHtml((lastEdit.at || "").slice(0, 16).replace("T", " "))}</strong>${editCount > 1 ? ` (${editCount} edits)` : ""}`
        : "";
      return `
        <div class="setup-sheet__topbar setup-sheet__topbar--locked">
          <div>
            <strong>Completed set-up sheet.</strong> Viewing only.
            Completed by <strong>${escapeHtml(d.completedBy || "?")}</strong>
            ${d.completedAt ? `on <strong>${escapeHtml(d.completedAt.slice(0, 16).replace("T", " "))}</strong>` : ""}${editBlurb}.
          </div>
          <div class="setup-sheet__topbar-actions">
            <button type="button" class="btn btn--ghost" id="ss-edit-btn">Edit &amp; re-save</button>
            <button type="button" class="btn btn--primary" id="ss-export-btn">Export PDF&hellip;</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="setup-sheet__topbar setup-sheet__topbar--editing">
        <div>
          <strong>Editing existing sheet.</strong> Saving will overwrite the PDF and log your edit.
        </div>
        <div class="setup-sheet__topbar-actions">
          <button type="button" class="btn btn--ghost" id="ss-cancel-edit-btn">Cancel edit</button>
        </div>
      </div>
    `;
  },

  _renderFooter() {
    if (this._mode === "view") return "";
    const label = this._mode === "edit" ? "Save changes" : "Complete Form";
    return `<button type="button" class="btn btn--primary setup-sheet__complete" id="ss-complete-btn">${label}</button>`;
  },

  _renderField(f, d, ro) {
    const v = d?.[f.id];
    const disabled = ro ? " disabled" : "";
    const labelHtml = `<span class="setup-sheet__label">${escapeHtml(f.label)}</span>`;

    switch (f.type) {
      case "check":
        return `
          <label class="setup-sheet__field setup-sheet__field--check">
            <input type="checkbox" id="ss-${f.id}"${v ? " checked" : ""}${disabled} />
            <span>${escapeHtml(f.label)}</span>
          </label>`;

      case "dropdown": {
        const opts = [NA, ...(f.options || [])];
        const current = (v == null || v === "") ? NA : String(v);
        const optsHtml = opts.map((o) =>
          `<option value="${escapeHtml(o)}"${o === current ? " selected" : ""}>${escapeHtml(o)}</option>`
        ).join("");
        return `
          <label class="setup-sheet__field">
            ${labelHtml}
            <select id="ss-${f.id}" class="setup-sheet__input"${disabled}>${optsHtml}</select>
          </label>`;
      }

      case "textarea":
        return `
          <label class="setup-sheet__field setup-sheet__field--full">
            ${labelHtml}
            <textarea id="ss-${f.id}" class="setup-sheet__textarea" rows="4"${disabled}>${escapeHtml(v || "")}</textarea>
          </label>`;

      case "date":
        return `
          <label class="setup-sheet__field">
            ${labelHtml}
            <input type="date" id="ss-${f.id}" class="setup-sheet__input" value="${escapeHtml(v || "")}"${disabled} />
          </label>`;

      case "weight":
        return `
          <label class="setup-sheet__field">
            <span class="setup-sheet__label">${escapeHtml(f.label)} (kg)</span>
            <input type="text" inputmode="decimal" id="ss-${f.id}" class="setup-sheet__input" value="${escapeHtml(v || "")}"${disabled} />
          </label>`;

      case "text":
      default:
        if (MULTI_FIELDS[f.id]) return this._renderMultiField(f, d, ro);
        if (LIST_FIELDS[f.id]) {
          /* Options are filled in by fillListSelects() once rendered. */
          const cur = String(v || "");
          return `
            <label class="setup-sheet__field">
              ${labelHtml}
              <select id="ss-${f.id}" class="setup-sheet__input" data-list="${LIST_FIELDS[f.id]}" data-value="${escapeHtml(cur)}"${disabled}>
                <option value="${escapeHtml(cur)}" selected>${escapeHtml(cur || "Select…")}</option>
              </select>
            </label>`;
        }
        return `
          <label class="setup-sheet__field">
            ${labelHtml}
            <input type="text" id="ss-${f.id}" class="setup-sheet__input" value="${escapeHtml(v || "")}"${disabled} />
          </label>`;
    }
  },

  /* ---- Multi-name fields (several radiotherapists) ---- */

  /* A name-list dropdown; options are filled in by fillListSelects(). */
  _multiSelectHtml(id, value, attrs, ro) {
    return `
      <select class="setup-sheet__input" data-list="${LIST_FIELDS[id]}" data-value="${escapeHtml(value)}" ${attrs}${ro ? " disabled" : ""}>
        <option value="${escapeHtml(value)}" selected>${escapeHtml(value || "Select…")}</option>
      </select>`;
  },

  /* An added dropdown, with its remove button. */
  _multiExtraRowHtml(id, value, ro, n) {
    const label = `${escapeHtml(this._config.fields.find((x) => x.id === id)?.label || "Name")} ${n}`;
    return `
      <div class="multi-field__row">
        ${this._multiSelectHtml(id, value, `data-multi-extra="${id}" aria-label="${label}"`, ro)}
        ${ro ? "" : `<button type="button" class="multi-field__remove" data-multi-remove aria-label="Remove ${label}">&times;</button>`}
      </div>`;
  },

  _renderMultiField(f, d, ro) {
    const m = MULTI_FIELDS[f.id];
    const names = multiNames(f.id, d);
    const first = names[0] || "";
    const extras = names.slice(1, m.max);
    return `
      <div class="setup-sheet__field setup-sheet__field--full multi-field" data-multi="${f.id}">
        <label class="setup-sheet__label" for="ss-${f.id}">${escapeHtml(f.label)}</label>
        <div class="multi-field__rows">
          <div class="multi-field__row">
            ${this._multiSelectHtml(f.id, first, `id="ss-${f.id}" data-multi-first="${f.id}"`, ro)}
            ${ro ? "" : `<span class="multi-field__spacer" aria-hidden="true"></span>`}
          </div>
          ${extras.map((v, i) => this._multiExtraRowHtml(f.id, v, ro, i + 2)).join("")}
        </div>
        ${ro ? "" : `
          <div class="multi-field__foot">
            <button type="button" class="btn btn--ghost btn--sm" data-multi-add="${f.id}">${escapeHtml(m.addLabel)}</button>
            <span class="multi-field__hint">${escapeHtml(m.hint)}</span>
          </div>`}
      </div>`;
  },

  _addMultiRow(id) {
    const m = MULTI_FIELDS[id];
    const rows = document.querySelector(`[data-multi="${id}"] .multi-field__rows`);
    if (!rows || rows.children.length >= m.max) return;
    rows.insertAdjacentHTML("beforeend", this._multiExtraRowHtml(id, "", false, rows.children.length + 1));
    fillListSelects(rows.lastElementChild).then(() => this._syncMultiFields());
    this._syncMultiFields();
  },

  /* Greys out names already picked in another dropdown of the same field,
     renumbers the added dropdowns, and hides "+ Add" once the field is full. */
  _syncMultiFields() {
    for (const [id, m] of Object.entries(MULTI_FIELDS)) {
      const field = document.querySelector(`[data-multi="${id}"]`);
      if (!field) continue;
      const selects = [...field.querySelectorAll("select[data-list]")];
      const chosen = selects.map(listSelectValue);
      selects.forEach((sel, i) => {
        for (const opt of sel.options) {
          if (!opt.value || opt.value === ADD_NEW) continue;
          opt.disabled = chosen.some((c, j) => j !== i && c === opt.value);
        }
      });
      const label = this._config.fields.find((x) => x.id === id)?.label || "Name";
      field.querySelectorAll("select[data-multi-extra]").forEach((sel, i) => {
        sel.setAttribute("aria-label", `${label} ${i + 2}`);
        sel.parentElement.querySelector("[data-multi-remove]")?.setAttribute("aria-label", `Remove ${label} ${i + 2}`);
      });
      const foot = field.querySelector(".multi-field__foot");
      if (foot) foot.hidden = selects.length >= m.max;
    }
  },

  /* ---- Event wiring ---- */

  _bind() {
    const form = document.getElementById("setup-sheet-form");
    if (!form) { this._installGuard(); this._syncHeaderSave(); return; }

    form.addEventListener("change", () => { this._saveDraft(); this._checklistUi?.refreshMirrors(); });
    form.addEventListener("input", () => { this._saveDraft(); this._checklistUi?.refreshMirrors(); });

    form.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => this._showTab(btn.dataset.tab));
    });

    /* Multi-name fields: add / remove dropdowns, and no name twice. */
    form.addEventListener("click", (e) => {
      const add = e.target.closest("[data-multi-add]");
      if (add) {
        this._addMultiRow(add.dataset.multiAdd);
        return;
      }
      const remove = e.target.closest("[data-multi-remove]");
      if (remove) {
        remove.closest(".multi-field__row").remove();
        this._syncMultiFields();
        this._saveDraft();
        this._checklistUi?.refreshMirrors();
      }
    });
    form.addEventListener("change", (e) => {
      const sel = e.target;
      if (!sel.matches?.("select[data-multi-first], select[data-multi-extra]")) return;
      const field = sel.closest("[data-multi]");
      const value = listSelectValue(sel);
      const taken = value && [...field.querySelectorAll("select[data-list]")]
        .some((other) => other !== sel && listSelectValue(other) === value);
      if (taken) {
        /* e.g. a name added with "+ Add new…" that is already picked above. */
        sel.value = "";
        sel.dataset.value = "";
        this._saveDraft();
      }
      this._syncMultiFields();
    });

    const clearBtn = document.getElementById("ss-clear-btn");
    if (clearBtn) {
      clearBtn.addEventListener("click", async () => {
        const photos = this._photoCount;
        const message = photos > 0
          ? `Clear all entered values on this draft and delete its ${photos} photo${photos === 1 ? "" : "s"}?`
          : "Clear all entered values on this draft?";
        if (!confirm(message)) return;
        if (this._gallery) await this._gallery.whenIdle();
        this._clearDraft();
        try {
          await Storage.photos.removeByOwner(Storage.photos.owner.draft(this._config.id));
        } catch (err) {
          console.error(err);
          alert("Could not delete the draft's photos: " + (err.message || err));
        }
        this.mountNew(this._container, this._config.id);
      });
    }

    const completeBtn = document.getElementById("ss-complete-btn");
    if (completeBtn) {
      completeBtn.addEventListener("click", () => this._saveSheet(`/history/${this._config.id}`));
    }

    const editBtn = document.getElementById("ss-edit-btn");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        this._mode = "edit";
        this._checklist = readChecklistState(this._record.checklist);
        this._render(this._record);
        this._bind();
      });
    }

    const cancelEditBtn = document.getElementById("ss-cancel-edit-btn");
    if (cancelEditBtn) {
      cancelEditBtn.addEventListener("click", () => {
        if (this._isDirty() && !confirm("Discard your changes to this sheet?")) return;
        this._mode = "view";
        this._checklist = readChecklistState(this._record.checklist);
        this._render(this._record);
        this._bind();
      });
    }

    const exportBtn = document.getElementById("ss-export-btn");
    if (exportBtn && this._record) {
      exportBtn.addEventListener("click", () => exportSheet(this._config, this._record));
    }

    fillListSelects(form).then(() => this._syncMultiFields());
    this._mountChecklist();
    this._mountPhotos();
    this._installGuard();
    this._syncHeaderSave();
    syncHeaderHeight();
  },

  /* ---- Complete / Save ---- */

  /**
   * Files the sheet (new: locked copy; edit: overwrite + log). On success the
   * draft and guard are cleared and the app navigates to `destinationHash`.
   * Returns true on success, false if cancelled or errored (caller stays put).
   */
  async _saveSheet(destinationHash) {
    const errorEl = document.getElementById("setup-sheet-error");
    if (errorEl) errorEl.textContent = "";

    /* Warn (don't block) when the scan checklist isn't finished. */
    if (this._checklist?.enabled) {
      const issues = checklistIssues(this._checklist, this._sheetValues());
      if (issues.length) {
        const choice = await confirmIncompleteChecklist(issues, { isEdit: this._mode === "edit" });
        if (choice !== "anyway") {
          this._showTab("checklist", { firstOpen: true });
          return false;
        }
      }
    }

    const signer = await pickTherapist({
      title: this._mode === "edit" ? "Save changes" : "Complete set-up sheet",
      confirmLabel: this._mode === "edit" ? "Save" : "Complete",
    });
    if (!signer) return false;

    const btn = document.getElementById("ss-complete-btn");
    const resetBtn = () => {
      if (btn) { btn.disabled = false; btn.textContent = this._mode === "edit" ? "Save changes" : "Complete Form"; }
    };
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

    try {
      /* Let a photo import that's still running finish, so its photos are
         filed with the sheet rather than left on the draft. */
      if (this._gallery) await this._gallery.whenIdle();
      const data = this._readDOM();
      /* Filed with a copy of its wording, so later wording changes never alter it. */
      if (this._checklist) data.checklist = toRecordChecklist(this._checklist);

      let result;
      if (this._mode === "edit" && this._record) {
        const editedAt = new Date().toISOString();
        const pdfBytes = await this._fillPdf(data, {
          completedBy: this._record.completedBy,
          completedAt: this._record.completedAt,
          editedBy: signer.name,
          editedAt,
        });
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        result = await Storage.records.update(
          this._record.id,
          data,
          blob,
          { name: signer.name, userId: signer.userId, at: editedAt },
        );
      } else {
        data.completedBy = signer.name;
        data.completedByUserId = signer.userId;
        data.completedAt = new Date().toISOString();
        const pdfBytes = await this._fillPdf(data, { completedBy: data.completedBy, completedAt: data.completedAt });
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        result = await Storage.records.save(this._config.id, data, blob);
      }

      if (!result.ok) {
        if (errorEl) errorEl.textContent = "Could not save sheet: " + (result.error || "unknown error");
        resetBtn();
        return false;
      }

      this._clearDraft();
      Router.clearGuard();
      Router.navigate(destinationHash || `/history/${this._config.id}`);
      return true;
    } catch (err) {
      console.error(err);
      if (errorEl) errorEl.textContent = "Could not save sheet: " + err.message;
      resetBtn();
      return false;
    }
  },

  /* ---- PDF generation (verbatim from desktop, except template fetch and the
     scan checklist page(s) appended at the end) ----
     `meta` = { completedBy, completedAt, editedBy?, editedAt? } for the
     checklist page footer. */

  async _fillPdf(data, meta = {}) {
    const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
    const templateUrl = `./assets/templates/${this._config.template}`;
    const templateBuf = await fetch(templateUrl).then((r) => r.arrayBuffer());
    const pdfDoc = await PDFDocument.load(templateBuf);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.getPages()[0];
    const fontSize = 10;
    const color = rgb(0, 0, 0);

    const drawText = (pos, value, opts = {}) => {
      if (!pos || value == null) return;
      const str = String(value).trim();
      if (!str) return;
      page.drawText(str, { x: pos.x, y: pos.y, size: opts.size || fontSize, font, color });
    };

    const drawX = (pos) => {
      if (!pos) return;
      const s = 4;
      page.drawLine({ start: { x: pos.x - s, y: pos.y - s }, end: { x: pos.x + s, y: pos.y + s }, thickness: 1.4, color });
      page.drawLine({ start: { x: pos.x - s, y: pos.y + s }, end: { x: pos.x + s, y: pos.y - s }, thickness: 1.4, color });
    };

    const drawWrapped = (box, text) => {
      if (!text) return;
      const lines = wrapText(String(text), box.maxWidth, font, fontSize).slice(0, box.maxLines);
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: box.x, y: box.yStart - (i * box.lineHeight),
          size: fontSize, font, color,
        });
      });
    };

    /* Several names on one line ("A, B, C"), shrinking to fit maxW. If they
       still don't fit at 7pt, they go on two smaller lines within the same
       row (split between names where possible), so no name is cut off. */
    const drawNames = (pos, names, maxW) => {
      const text = names.join(", ");
      if (!pos || !text) return;
      const width = (s, size) => font.widthOfTextAtSize(s, size);
      for (let size = fontSize; size >= 7; size -= 0.25) {
        if (width(text, size) <= maxW) {
          page.drawText(text, { x: pos.x, y: pos.y, size, font, color });
          return;
        }
      }
      /* Most even split: between names, or between words for a single name. */
      const parts = names.length > 1 ? names : text.split(/\s+/);
      const glue = names.length > 1 ? ", " : " ";
      let best = null;
      for (let i = 1; i < parts.length; i++) {
        const a = parts.slice(0, i).join(glue) + (names.length > 1 ? "," : "");
        const b = parts.slice(i).join(glue);
        const w = Math.max(width(a, 1), width(b, 1));
        if (!best || w < best.w) best = { a, b, w };
      }
      if (!best) best = { a: text, b: "", w: width(text, 1) };
      const size = Math.max(4.5, Math.min(6.5, maxW / best.w));
      const lead = size + 0.6;
      const lower = pos.y - 1.2; /* second line sits just above the underline */
      page.drawText(best.a, { x: pos.x, y: lower + lead, size, font, color });
      if (best.b) page.drawText(best.b, { x: pos.x, y: lower, size, font, color });
    };

    for (const f of this._config.fields) {
      const v = data[f.id];
      if (MULTI_FIELDS[f.id]) {
        drawNames(f.coord, multiNames(f.id, data), MULTI_FIELDS[f.id].pdfMaxWidth);
        continue;
      }
      switch (f.type) {
        case "check":
          if (v) drawX(f.coord);
          break;
        case "dropdown":
          drawText(f.coord, (v == null || v === "") ? NA : v);
          break;
        case "date":
          drawText(f.coord, formatDatePdf(v));
          break;
        case "weight": {
          const s = String(v || "").trim();
          if (s) drawText(f.coord, `${s} kg`);
          break;
        }
        case "textarea":
          drawWrapped(f.box, v);
          break;
        case "text":
        default:
          drawText(f.coord, v);
      }
    }

    if (data.checklist?.enabled) {
      await appendChecklistPages(pdfDoc, { checklist: data.checklist, sheet: data, meta });
    }

    return pdfDoc.save();
  },
};

/* ---- Auto-save on backgrounding ---------------------------------------------
   iOS fires these when the app is hidden (home button / app switcher) or torn
   down. Flushing the "new" draft here guarantees an accidental exit never loses
   entered data, even if the last keystroke's input event was missed. */

/* The sheet's tab bar sticks just below the header, whose height depends on
   the iPad's status bar and on the header Save button. */
function syncHeaderHeight() {
  const header = document.querySelector(".app-header");
  if (header) document.documentElement.style.setProperty("--app-header-h", `${header.offsetHeight}px`);
}
window.addEventListener("resize", syncHeaderHeight);

/* "+ Add new…" refreshes every name dropdown's options; re-apply the
   "already picked" greying on multi-name fields. */
document.addEventListener("namelists:refreshed", () => SetupSheetForm._syncMultiFields());

function flushDraftOnHide() {
  if (SetupSheetForm._mode === "new") SetupSheetForm._saveDraft();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushDraftOnHide();
});
window.addEventListener("pagehide", flushDraftOnHide);

export default SetupSheetForm;
