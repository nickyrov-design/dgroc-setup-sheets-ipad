/**
 * History list. Filter chips by sheet type; tap a row to open in view mode.
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

const SetupSheetHistory = {
  async mount(container, sheetFilter) {
    const chips = `
      <button class="history-toolbar__chip${!sheetFilter ? " is-active" : ""}" data-filter="">All</button>
      ${SETUP_SHEET_ORDER.map((id) => `
        <button class="history-toolbar__chip${sheetFilter === id ? " is-active" : ""}" data-filter="${id}">${escapeHtml(SETUP_SHEET_CONFIGS[id].label)}</button>
      `).join("")}
    `;

    const records = await Storage.records.list(sheetFilter || undefined);

    const rowsHtml = records.length === 0
      ? `<div class="history-empty">No completed sheets yet.</div>`
      : `<div class="history-list">
          ${records.map((r) => {
            const cfg = SETUP_SHEET_CONFIGS[r.sheetId];
            const stamp = formatTimestamp(r.updatedAt || r.completedAt);
            const editTag = r.editCount > 0 ? ` &middot; ${r.editCount} edit${r.editCount > 1 ? "s" : ""}` : "";
            return `
              <a class="history-row" href="#/form/${encodeURIComponent(r.sheetId)}/${encodeURIComponent(r.id)}" data-record-id="${escapeHtml(r.id)}">
                <div>
                  <div class="history-row__primary">${escapeHtml(r.patientName || "(no patient name)")}</div>
                  <div class="history-row__sub">${escapeHtml(cfg?.label || r.sheetId)}${r.patientId ? ` &middot; ${escapeHtml(r.patientId)}` : ""}</div>
                </div>
                <div>
                  <div class="history-row__sub">${escapeHtml(r.linac || "")}${r.radiotherapist ? ` &middot; ${escapeHtml(r.radiotherapist)}` : ""}</div>
                  <div class="history-row__sub">${escapeHtml(r.scanDate || "")}</div>
                </div>
                <div class="history-row__meta">
                  <div>${escapeHtml(stamp)}</div>
                  <div>by ${escapeHtml(r.completedBy || "?")}${editTag}</div>
                  <button type="button" class="btn btn--ghost" data-export-id="${escapeHtml(r.id)}" data-sheet-id="${escapeHtml(r.sheetId)}" style="margin-top:6px">Export</button>
                </div>
              </a>
            `;
          }).join("")}
        </div>`;

    container.innerHTML = `
      <h1 class="page-title">History</h1>
      <p class="page-sub">Completed sheets stored on this iPad. Tap a row to view, or Export to send to Files / pCloud.</p>
      <div class="history-toolbar">${chips}</div>
      ${rowsHtml}
    `;

    container.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const f = btn.dataset.filter;
        location.hash = f ? `#/history/${f}` : "#/history";
      });
    });

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
  },
};

export default SetupSheetHistory;
