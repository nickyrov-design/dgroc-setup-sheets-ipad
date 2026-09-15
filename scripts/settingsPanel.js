/**
 * Settings screen. Pick the default therapist, link out to the therapist and
 * photo label editors, free up photo storage, and offer a destructive
 * "wipe all app data" action for fresh starts.
 */

import Storage from "./storage.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBytes(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
}

const SettingsPanel = {
  async mount(container) {
    this._container = container;
    await this._render();
  },

  async _render() {
    const sixMonthsAgoIso = (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 6);
      return d.toISOString();
    })();

    const [therapists, defaultId, records, archivedRecords, archivableCount, photoStats, photoCounts, photoLabels] = await Promise.all([
      Storage.therapists.list(),
      Storage.settings.get("defaultTherapistId"),
      Storage.records.list(undefined, { includeArchived: true }),
      Storage.records.list(undefined, { archivedOnly: true }),
      Storage.records.countOlderThan(sixMonthsAgoIso),
      Storage.photos.stats(),
      Storage.photos.countByOwner(),
      Storage.photoLabels.list(),
    ]);
    const archivedCount = archivedRecords.length;
    const archivedPhotoCount = archivedRecords.reduce(
      (n, r) => n + (photoCounts.get(Storage.photos.owner.record(r.id)) || 0),
      0,
    );
    this._sixMonthsAgoIso = sixMonthsAgoIso;
    this._archivedPhotoCount = archivedPhotoCount;

    const therapistOpts = therapists.length
      ? `<select id="default-therapist-select" class="setup-sheet__input">
          <option value="">— None —</option>
          ${therapists.map((t) => `
            <option value="${escapeHtml(t.id)}"${t.id === defaultId ? " selected" : ""}>${escapeHtml(t.name)}</option>
          `).join("")}
        </select>`
      : `<p class="page-sub">No therapists configured yet.</p>`;

    this._container.innerHTML = `
      <h1 class="page-title">Settings</h1>

      <section class="panel">
        <h2 class="panel__title">Therapist list</h2>
        <p class="panel__desc">${therapists.length} therapist${therapists.length === 1 ? "" : "s"} configured. Used in the completion picker.</p>
        <a href="#/therapists" class="btn btn--ghost">Edit list</a>
      </section>

      <section class="panel">
        <h2 class="panel__title">Default therapist</h2>
        <p class="panel__desc">Preselected in the completion picker. You can still choose a different name when completing a sheet.</p>
        ${therapistOpts}
      </section>

      <section class="panel">
        <h2 class="panel__title">Photo labels</h2>
        <p class="panel__desc">${photoLabels.length} quick-pick label${photoLabels.length === 1 ? "" : "s"} offered when labelling a photo. A custom label can always be typed.</p>
        <a href="#/photo-labels" class="btn btn--ghost">Edit list</a>
      </section>

      <section class="panel">
        <h2 class="panel__title">Storage</h2>
        <p class="panel__desc">
          ${records.length} completed sheet${records.length === 1 ? "" : "s"} stored on this iPad &middot; ${archivedCount} archived
          &middot; ${photoStats.count} photo${photoStats.count === 1 ? "" : "s"} (${formatBytes(photoStats.bytes)}).
        </p>
        <div class="panel__actions">
          <button
            type="button"
            class="btn btn--ghost"
            id="bulk-archive-btn"
            ${archivableCount === 0 ? "disabled" : ""}
          >Archive sheets older than 6 months${archivableCount > 0 ? ` (${archivableCount})` : ""}</button>
          <button
            type="button"
            class="btn btn--ghost"
            id="delete-archived-photos-btn"
            ${archivedPhotoCount === 0 ? "disabled" : ""}
          >Delete photos from archived sheets${archivedPhotoCount > 0 ? ` (${archivedPhotoCount})` : ""}</button>
          <button type="button" class="btn btn--danger" id="wipe-data-btn">Wipe all app data&hellip;</button>
        </div>
      </section>

      <p class="page-sub" style="margin-top:24px">Setup Sheets PWA &middot; v3</p>
    `;

    this._bind();
  },

  _bind() {
    const select = document.getElementById("default-therapist-select");
    if (select) {
      select.addEventListener("change", async () => {
        await Storage.settings.set("defaultTherapistId", select.value || null);
      });
    }

    const bulkBtn = document.getElementById("bulk-archive-btn");
    if (bulkBtn && !bulkBtn.disabled) {
      bulkBtn.addEventListener("click", async () => {
        const res = await Storage.records.archiveOlderThan(this._sixMonthsAgoIso);
        if (!res.ok) { alert(res.error || "Could not archive."); return; }
        alert(`Archived ${res.archived} sheet${res.archived === 1 ? "" : "s"} older than 6 months.`);
        await this._render();
      });
    }

    const deletePhotosBtn = document.getElementById("delete-archived-photos-btn");
    if (deletePhotosBtn && !deletePhotosBtn.disabled) {
      deletePhotosBtn.addEventListener("click", async () => {
        const n = this._archivedPhotoCount;
        const sure = confirm(
          `Delete ${n} photo${n === 1 ? "" : "s"} from archived sheets on this iPad? ` +
          "The sheets themselves are kept, and photos already exported elsewhere are not affected. This can't be undone."
        );
        if (!sure) return;
        try {
          const res = await Storage.photos.removeArchived();
          alert(`Deleted ${res.removed} photo${res.removed === 1 ? "" : "s"} from archived sheets.`);
        } catch (err) {
          alert("Could not delete photos: " + (err.message || err));
        }
        await this._render();
      });
    }

    document.getElementById("wipe-data-btn").addEventListener("click", async () => {
      const sure = confirm(
        "This will delete ALL completed sheets, photos, drafts, therapists, and settings on this iPad. " +
        "PDFs and photos already exported elsewhere are not affected. Continue?"
      );
      if (!sure) return;
      const reallySure = prompt('Type "WIPE" to confirm:');
      if (reallySure !== "WIPE") return;

      indexedDB.deleteDatabase("dgroc-setup-sheets");
      try { localStorage.clear(); } catch { /* ignore */ }
      alert("App data wiped. Reload the page to start fresh.");
      location.reload();
    });
  },
};

export default SettingsPanel;
