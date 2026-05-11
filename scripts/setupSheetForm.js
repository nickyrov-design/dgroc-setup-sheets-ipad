/**
 * Set-Up Sheet Form (shared across Extremity, Head & Neck, Omniboard).
 * iPad PWA port of the desktop component.
 *
 * Modes:
 *   "new"   — fresh form, draft auto-saved per sheetId in localStorage
 *   "view"  — completed sheet, fields disabled, export/edit actions shown
 *   "edit"  — re-editing an existing sheet; appended to its editHistory on save
 */

import Router from "./router.js";
import SETUP_SHEET_CONFIGS from "./setupSheetConfigs/index.js";
import Storage from "./storage.js";
import { exportPdf } from "./share.js";

const NA = "N/A";

function getDraftKey(sheetId) { return `setup-sheet-draft-${sheetId}`; }

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

function buildExportFilename(config, record) {
  const patient = String(record?.patientName || "").trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  const date = String(record?.scanDate || "").trim() || (record?.id || "").slice(0, 8);
  const parts = [config.filenamePrefix];
  if (patient) parts.push(patient);
  if (date) parts.push(date);
  return parts.join("_") + ".pdf";
}

/* ---- Therapist picker dialog (replaces desktop name+password dialog) ---- */

async function pickTherapist({ title, confirmLabel }) {
  const therapists = await Storage.therapists.list();
  if (!therapists.length) {
    alert("No therapists configured. Open Settings → Therapists to add one.");
    return null;
  }
  const defaultId = await Storage.settings.get("defaultTherapistId");

  return new Promise((resolve) => {
    const root = document.getElementById("dialog-root");
    const opts = therapists.map((t) =>
      `<option value="${escapeHtml(t.id)}"${t.id === defaultId ? " selected" : ""}>${escapeHtml(t.name)}</option>`
    ).join("");

    root.innerHTML = `
      <div class="dialog-backdrop" id="picker-backdrop">
        <div class="dialog" role="dialog" aria-modal="true">
          <h3 class="dialog__title">${escapeHtml(title)}</h3>
          <p class="dialog__desc">Select the therapist completing this sheet.</p>
          <div class="dialog__field">
            <label for="picker-select">Therapist</label>
            <select id="picker-select">${opts}</select>
          </div>
          <div class="dialog__actions">
            <button type="button" class="btn btn--ghost" id="picker-cancel">Cancel</button>
            <button type="button" class="btn btn--primary" id="picker-ok">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      </div>
    `;

    const cleanup = () => { root.innerHTML = ""; };
    document.getElementById("picker-cancel").addEventListener("click", () => { cleanup(); resolve(null); });
    document.getElementById("picker-ok").addEventListener("click", () => {
      const id = document.getElementById("picker-select").value;
      const t = therapists.find((x) => x.id === id);
      cleanup();
      resolve(t ? { userId: t.id, name: t.name } : null);
    });
  });
}

/* ---- Component ---- */

const SetupSheetForm = {
  _container: null,
  _config: null,
  _mode: "new",
  _record: null,

  async mountNew(container, sheetId) {
    this._container = container;
    const config = SETUP_SHEET_CONFIGS[sheetId];
    if (!config) {
      container.innerHTML = `<div class="page-error">Unknown sheet type: ${escapeHtml(sheetId)}</div>`;
      return;
    }
    this._config = config;
    this._mode = "new";
    this._record = null;
    let draft = null;
    try {
      const raw = localStorage.getItem(getDraftKey(sheetId));
      if (raw) draft = JSON.parse(raw);
    } catch { /* ignore */ }
    this._render(draft || {});
    this._bind();
  },

  async mountExisting(container, sheetId, recordId) {
    this._container = container;
    const config = SETUP_SHEET_CONFIGS[sheetId];
    if (!config) {
      container.innerHTML = `<div class="page-error">Unknown sheet type.</div>`;
      return;
    }
    const record = await Storage.records.get(recordId);
    if (!record) {
      container.innerHTML = `<div class="page-error">Sheet not found.</div>`;
      return;
    }
    this._config = config;
    this._mode = "view";
    this._record = record;
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
      else data[f.id] = el.value;
    }
    return data;
  },

  _saveDraft() {
    if (this._mode !== "new") return;
    try {
      localStorage.setItem(getDraftKey(this._config.id), JSON.stringify(this._readDOM()));
    } catch { /* ignore quota */ }
  },

  _clearDraft() {
    try { localStorage.removeItem(getDraftKey(this._config.id)); } catch { /* ignore */ }
  },

  /* ---- Rendering ---- */

  _render(d) {
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

    this._container.innerHTML = `
      ${header}
      <form class="setup-sheet" id="setup-sheet-form" autocomplete="off" ${readOnly ? "data-readonly" : ""}>
        ${sectionsHtml}
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
        return `
          <label class="setup-sheet__field">
            ${labelHtml}
            <input type="text" id="ss-${f.id}" class="setup-sheet__input" value="${escapeHtml(v || "")}"${disabled} />
          </label>`;
    }
  },

  /* ---- Event wiring ---- */

  _bind() {
    const form = document.getElementById("setup-sheet-form");
    if (!form) return;

    form.addEventListener("change", () => this._saveDraft());
    form.addEventListener("input", () => this._saveDraft());

    const clearBtn = document.getElementById("ss-clear-btn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (!confirm("Clear all entered values on this draft?")) return;
        this._clearDraft();
        this.mountNew(this._container, this._config.id);
      });
    }

    const completeBtn = document.getElementById("ss-complete-btn");
    if (completeBtn) completeBtn.addEventListener("click", () => this._onComplete());

    const editBtn = document.getElementById("ss-edit-btn");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        this._mode = "edit";
        this._render(this._record);
        this._bind();
      });
    }

    const cancelEditBtn = document.getElementById("ss-cancel-edit-btn");
    if (cancelEditBtn) {
      cancelEditBtn.addEventListener("click", () => {
        this._mode = "view";
        this._render(this._record);
        this._bind();
      });
    }

    const exportBtn = document.getElementById("ss-export-btn");
    if (exportBtn && this._record) {
      exportBtn.addEventListener("click", async () => {
        const blob = this._record.pdfBlob;
        if (!blob) { alert("PDF data is missing for this record."); return; }
        const filename = buildExportFilename(this._config, this._record);
        const res = await exportPdf(blob, filename);
        if (!res.ok && !res.canceled) alert(res.error || "Could not export PDF.");
      });
    }
  },

  /* ---- Complete / Save ---- */

  async _onComplete() {
    const errorEl = document.getElementById("setup-sheet-error");
    errorEl.textContent = "";

    const signer = await pickTherapist({
      title: this._mode === "edit" ? "Save changes" : "Complete set-up sheet",
      confirmLabel: this._mode === "edit" ? "Save" : "Complete",
    });
    if (!signer) return;

    const btn = document.getElementById("ss-complete-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

    try {
      const data = this._readDOM();

      let result;
      if (this._mode === "edit" && this._record) {
        const pdfBytes = await this._fillPdf(data);
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        result = await Storage.records.update(
          this._record.id,
          data,
          blob,
          { name: signer.name, userId: signer.userId, at: new Date().toISOString() },
        );
      } else {
        data.completedBy = signer.name;
        data.completedByUserId = signer.userId;
        data.completedAt = new Date().toISOString();
        const pdfBytes = await this._fillPdf(data);
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        result = await Storage.records.save(this._config.id, data, blob);
      }

      if (!result.ok) {
        errorEl.textContent = "Could not save sheet: " + (result.error || "unknown error");
        if (btn) { btn.disabled = false; btn.textContent = this._mode === "edit" ? "Save changes" : "Complete Form"; }
        return;
      }

      this._clearDraft();
      Router.navigate(`/history/${this._config.id}`);
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Error generating PDF: " + err.message;
      if (btn) { btn.disabled = false; btn.textContent = this._mode === "edit" ? "Save changes" : "Complete Form"; }
    }
  },

  /* ---- PDF generation (verbatim from desktop, except template fetch) ---- */

  async _fillPdf(data) {
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

    for (const f of this._config.fields) {
      const v = data[f.id];
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

    return pdfDoc.save();
  },
};

export default SetupSheetForm;
