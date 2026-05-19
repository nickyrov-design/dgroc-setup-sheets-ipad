/**
 * History list. Filter chips by sheet type; tap a row to open in view mode.
 * Toggle to show archived records, per-row archive/unarchive, and a
 * name/patient-id search box.
 */

import SETUP_SHEET_CONFIGS, { SETUP_SHEET_ORDER } from "./setupSheetConfigs/index.js";
import Storage from "./storage.js";
import { exportPdf } from "./share.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimestamp(iso) {
  if (!iso) return "";
  return iso.slice(0, 16).replace("T", " ");
}

function buildExportFilename(cfg, record) {
  const patient = String(record?.patientName || "").trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  const date = String(record?.scanDate || "").trim() || (record?.id || "").slice(0, 8);
  const parts = [cfg.filenamePrefix];
  if (patient) parts.push(patient);
  if (date) parts.push(date);
  return parts.join("_") + ".pdf";
}

function matchesSearch(r, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    (r.patientName || "").toLowerCase().includes(needle) ||
    (r.patientId || "").toLowerCase().includes(needle)
  );
}

const SetupSheetHistory = {
  async mount(container, sheetFilter) {
    this._container = container;
    this._sheetFilter = sheetFilter || null;
    this._search = "";
    this._showArchived = !!(await Storage.settings.get("historyShowArchived"));
    await this._render();
  },

  async _render() {
    const container = this._container;
    const sheetFilter = this._sheetFilter;

    const [records, archivedCount] = await Promise.all([
      Storage.records.list(sheetFilter || undefined, { includeArchived: this._showArchived }),
      Storage.records.countArchived(sheetFilter || undefined),
    ]);

    const filtered = records.filter((r) => matchesSearch(r, this._search));

    const chips = `
      <button class="history-toolbar__chip${!sheetFilter ? " is-active" : ""}" data-filter="">All</button>
      ${SETUP_SHEET_ORDER.map((id) => `
        <button class="history-toolbar__chip${sheetFilter === id ? " is-active" : ""}" data-filter="${id}">${escapeHtml(SETUP_SHEET_CONFIGS[id].label)}</button>
      `).join("")}
    `;

    const toggleLabel = archivedCount > 0
      ? `Show archived (${archivedCount})`
      : `Show archived`;

    const rowsHtml = filtered.length === 0
      ? `<div class="history-empty">${this._emptyMessage(records.length, this._search)}</div>`
      : `<div class="history-list">
          ${filtered.map((r) => {
            const cfg = SETUP_SHEET_CONFIGS[r.sheetId];
            const stamp = formatTimestamp(r.updatedAt || r.completedAt);
            const editTag = r.editCount > 0 ? ` &middot; ${r.editCount} edit${r.editCount > 1 ? "s" : ""}` : "";
            const archivedTag = r.archived ? `<span class="history-row__tag">Archived</span>` : "";
            const archiveBtnLabel = r.archived ? "Unarchive" : "Archive";
            return `
              <a class="history-row${r.archived ? " is-archived" : ""}" href="#/form/${encodeURIComponent(r.sheetId)}/${encodeURIComponent(r.id)}" data-record-id="${escapeHtml(r.id)}">
                <div>
                  <div class="history-row__primary">${escapeHtml(r.patientName || "(no patient name)")}${archivedTag}</div>
                  <div class="history-row__sub">${escapeHtml(cfg?.label || r.sheetId)}${r.patientId ? ` &middot; ${escapeHtml(r.patientId)}` : ""}</div>
                </div>
                <div>
                  <div class="history-row__sub">${escapeHtml(r.linac || "")}${r.radiotherapist ? ` &middot; ${escapeHtml(r.radiotherapist)}` : ""}</div>
                  <div class="history-row__sub">${escapeHtml(r.scanDate || "")}</div>
                </div>
                <div class="history-row__meta">
                  <div>${escapeHtml(stamp)}</div>
                  <div>by ${escapeHtml(r.completedBy || "?")}${editTag}</div>
                  <div class="history-row__actions">
                    <button type="button" class="btn btn--ghost btn--sm" data-export-id="${escapeHtml(r.id)}" data-sheet-id="${escapeHtml(r.sheetId)}">Export</button>
                    <button type="button" class="btn btn--ghost btn--sm" data-archive-id="${escapeHtml(r.id)}" data-archive-to="${r.archived ? "0" : "1"}">${archiveBtnLabel}</button>
                  </div>
                </div>
              </a>
            `;
          }).join("")}
        </div>`;

    container.innerHTML = `
      <h1 class="page-title">History</h1>
      <p class="page-sub">Completed sheets stored on this iPad. Tap a row to view, or Export to send to Files / pCloud.</p>
      <div class="history-toolbar">${chips}</div>
      <div class="history-controls">
        <input
          id="history-search"
          class="history-search"
          type="search"
          inputmode="search"
          autocomplete="off"
          placeholder="Search name or patient ID"
          value="${escapeHtml(this._search)}"
        />
        <label class="history-toggle">
          <input type="checkbox" id="history-show-archived"${this._showArchived ? " checked" : ""}/>
          <span>${escapeHtml(toggleLabel)}</span>
        </label>
      </div>
      ${rowsHtml}
    `;

    this._bind();
  },

  _emptyMessage(totalCount, search) {
    if (search) return `No matches for &ldquo;${escapeHtml(search)}&rdquo;.`;
    if (totalCount === 0 && !this._showArchived) {
      return "No completed sheets yet.";
    }
    if (totalCount === 0 && this._showArchived) {
      return "No sheets stored on this iPad.";
    }
    return "Nothing to show.";
  },

  _bind() {
    const container = this._container;

    container.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const f = btn.dataset.filter;
        location.hash = f ? `#/history/${f}` : "#/history";
      });
    });

    const search = container.querySelector("#history-search");
    if (search) {
      search.addEventListener("input", () => {
        this._search = search.value || "";
        this._renderRowsOnly();
      });
    }

    const toggle = container.querySelector("#history-show-archived");
    if (toggle) {
      toggle.addEventListener("change", async () => {
        this._showArchived = !!toggle.checked;
        await Storage.settings.set("historyShowArchived", this._showArchived);
        await this._render();
      });
    }

    container.querySelectorAll("[data-export-id]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.exportId;
        const sheetId = btn.dataset.sheetId;
        const record = await Storage.records.get(id);
        if (!record || !record.pdfBlob) { alert("PDF data missing for this record."); return; }
        const cfg = SETUP_SHEET_CONFIGS[sheetId];
        const filename = buildExportFilename(cfg, record);
        const res = await exportPdf(record.pdfBlob, filename);
        if (!res.ok && !res.canceled) alert(res.error || "Could not export PDF.");
      });
    });

    container.querySelectorAll("[data-archive-id]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.archiveId;
        const archive = btn.dataset.archiveTo === "1";
        const res = await Storage.records.setArchived(id, archive);
        if (!res.ok) { alert(res.error || "Could not update record."); return; }
        await this._render();
      });
    });
  },

  /* Re-render just the rows after a search keystroke (keeps the input focused). */
  async _renderRowsOnly() {
    const records = await Storage.records.list(this._sheetFilter || undefined, {
      includeArchived: this._showArchived,
    });
    const filtered = records.filter((r) => matchesSearch(r, this._search));

    const host = this._container.querySelector(".history-list, .history-empty");
    if (!host) return;

    if (filtered.length === 0) {
      const div = document.createElement("div");
      div.className = "history-empty";
      div.innerHTML = this._emptyMessage(records.length, this._search);
      host.replaceWith(div);
      return;
    }

    const list = document.createElement("div");
    list.className = "history-list";
    list.innerHTML = filtered.map((r) => {
      const cfg = SETUP_SHEET_CONFIGS[r.sheetId];
      const stamp = formatTimestamp(r.updatedAt || r.completedAt);
      const editTag = r.editCount > 0 ? ` &middot; ${r.editCount} edit${r.editCount > 1 ? "s" : ""}` : "";
      const archivedTag = r.archived ? `<span class="history-row__tag">Archived</span>` : "";
      const archiveBtnLabel = r.archived ? "Unarchive" : "Archive";
      return `
        <a class="history-row${r.archived ? " is-archived" : ""}" href="#/form/${encodeURIComponent(r.sheetId)}/${encodeURIComponent(r.id)}" data-record-id="${escapeHtml(r.id)}">
          <div>
            <div class="history-row__primary">${escapeHtml(r.patientName || "(no patient name)")}${archivedTag}</div>
            <div class="history-row__sub">${escapeHtml(cfg?.label || r.sheetId)}${r.patientId ? ` &middot; ${escapeHtml(r.patientId)}` : ""}</div>
          </div>
          <div>
            <div class="history-row__sub">${escapeHtml(r.linac || "")}${r.radiotherapist ? ` &middot; ${escapeHtml(r.radiotherapist)}` : ""}</div>
            <div class="history-row__sub">${escapeHtml(r.scanDate || "")}</div>
          </div>
          <div class="history-row__meta">
            <div>${escapeHtml(stamp)}</div>
            <div>by ${escapeHtml(r.completedBy || "?")}${editTag}</div>
            <div class="history-row__actions">
              <button type="button" class="btn btn--ghost btn--sm" data-export-id="${escapeHtml(r.id)}" data-sheet-id="${escapeHtml(r.sheetId)}">Export</button>
              <button type="button" class="btn btn--ghost btn--sm" data-archive-id="${escapeHtml(r.id)}" data-archive-to="${r.archived ? "0" : "1"}">${archiveBtnLabel}</button>
            </div>
          </div>
        </a>
      `;
    }).join("");
    host.replaceWith(list);

    /* Re-bind delegated buttons inside the new list. */
    this._bindRowActions(list);
  },

  _bindRowActions(root) {
    root.querySelectorAll("[data-export-id]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.exportId;
        const sheetId = btn.dataset.sheetId;
        const record = await Storage.records.get(id);
        if (!record || !record.pdfBlob) { alert("PDF data missing for this record."); return; }
        const cfg = SETUP_SHEET_CONFIGS[sheetId];
        const filename = buildExportFilename(cfg, record);
        const res = await exportPdf(record.pdfBlob, filename);
        if (!res.ok && !res.canceled) alert(res.error || "Could not export PDF.");
      });
    });

    root.querySelectorAll("[data-archive-id]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.archiveId;
        const archive = btn.dataset.archiveTo === "1";
        const res = await Storage.records.setArchived(id, archive);
        if (!res.ok) { alert(res.error || "Could not update record."); return; }
        await this._render();
      });
    });
  },
};

export default SetupSheetHistory;
