/**
 * Export filenames and the Export flow for a completed set-up sheet.
 *
 *   PDF:    ExtremitySetup_Jane_Smith_2026-05-11.pdf   (matches the desktop tool)
 *   Photos: ExtremitySetup_Jane_Smith_2026-05-11_Photo-01_Left-lateral.jpg
 *
 * A sheet without photos goes straight to the share sheet with its PDF, as
 * before. A sheet with photos first asks what to include, so the PDF and the
 * JPGs can land in the same folder from a single Save to Files.
 */

import Storage from "./storage.js";
import { exportPdf, shareFiles } from "./share.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildExportBaseName(config, record) {
  const patient = String(record?.patientName || "").trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  const date = String(record?.scanDate || "").trim() || (record?.id || "").slice(0, 8);
  const parts = [config.filenamePrefix];
  if (patient) parts.push(patient);
  if (date) parts.push(date);
  return parts.join("_");
}

/* `index` is the photo's 0-based position on the sheet. The label is made
   filename-safe: "Left lateral" -> "Left-lateral". */
export function photoFilename(baseName, index, label) {
  const number = String(index + 1).padStart(2, "0");
  const tag = String(label || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
  return `${baseName}_Photo-${number}${tag ? `_${tag}` : ""}.jpg`;
}

export async function exportSheet(config, record) {
  const baseName = buildExportBaseName(config, record);
  const photos = await Storage.photos.list(Storage.photos.owner.record(record.id));

  if (photos.length === 0) {
    if (!record.pdfBlob) { alert("PDF data is missing for this record."); return; }
    const res = await exportPdf(record.pdfBlob, `${baseName}.pdf`);
    if (!res.ok && !res.canceled) alert(res.error || "Could not export PDF.");
    return;
  }

  /* Load the JPEGs up front so tapping Export can open the share sheet
     immediately — iOS only allows that straight after a tap. */
  const blobs = await Storage.photos.getBlobs(photos.map((p) => p.id));
  openExportDialog(record, baseName, photos, blobs);
}

function openExportDialog(record, baseName, photos, blobs) {
  const root = document.getElementById("dialog-root");
  const pdfName = `${baseName}.pdf`;
  const photoFiles = photos
    .map((p, i) => ({ name: photoFilename(baseName, i, p.label), blob: blobs[i] }))
    .filter((f) => f.blob);
  const hasPdf = !!record.pdfBlob;
  const hasPhotos = photoFiles.length > 0;

  const photoSub = hasPhotos
    ? `${escapeHtml(photoFiles[0].name)}${photoFiles.length > 1 ? ` + ${photoFiles.length - 1} more` : ""}`
    : "Photo data is missing for this sheet.";

  root.innerHTML = `
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <h3 class="dialog__title" id="export-title">Export set-up sheet</h3>
        <p class="dialog__desc">
          Choose what to include. In the share sheet, tap <strong>Save to Files</strong>
          (not Save Images) to pick a folder &mdash; including a network folder.
        </p>
        <label class="export-option">
          <input type="checkbox" id="export-pdf"${hasPdf ? " checked" : " disabled"} />
          <span class="export-option__text">
            <span class="export-option__title">Set-up sheet PDF</span>
            <span class="export-option__sub">${hasPdf ? escapeHtml(pdfName) : "PDF data is missing for this record."}</span>
          </span>
        </label>
        <label class="export-option">
          <input type="checkbox" id="export-photos"${hasPhotos ? " checked" : " disabled"} />
          <span class="export-option__text">
            <span class="export-option__title">Photos (${photoFiles.length} JPG)</span>
            <span class="export-option__sub">${photoSub}</span>
          </span>
        </label>
        <div class="dialog__error" id="export-error"></div>
        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" id="export-cancel">Cancel</button>
          <button type="button" class="btn btn--primary" id="export-go">Export</button>
        </div>
      </div>
    </div>
  `;

  const pdfBox = document.getElementById("export-pdf");
  const photosBox = document.getElementById("export-photos");
  const goBtn = document.getElementById("export-go");
  const errorEl = document.getElementById("export-error");
  const cleanup = () => { root.innerHTML = ""; };
  const syncGo = () => { goBtn.disabled = !(pdfBox.checked || photosBox.checked); };

  pdfBox.addEventListener("change", syncGo);
  photosBox.addEventListener("change", syncGo);
  syncGo();

  document.getElementById("export-cancel").addEventListener("click", cleanup);

  goBtn.addEventListener("click", async () => {
    errorEl.textContent = "";
    const files = [];
    if (pdfBox.checked) files.push(new File([record.pdfBlob], pdfName, { type: "application/pdf" }));
    if (photosBox.checked) {
      for (const f of photoFiles) files.push(new File([f.blob], f.name, { type: "image/jpeg" }));
    }
    if (!files.length) return;
    goBtn.disabled = true;
    const res = await shareFiles(files);
    goBtn.disabled = false;
    if (res.ok) cleanup();
    else if (!res.canceled) errorEl.textContent = res.error || "Could not export.";
  });
}
