/**
 * Settings screen. Pick the default therapist, link out to the therapist
 * editor, and offer a destructive "wipe all app data" action for fresh
 * starts.
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

const SettingsPanel = {
  async mount(container) {
    this._container = container;
    await this._render();
  },

  async _render() {
    const [therapists, defaultId, records] = await Promise.all([
      Storage.therapists.list(),
      Storage.settings.get("defaultTherapistId"),
      Storage.records.list(),
    ]);

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
        <h2 class="panel__title">Storage</h2>
        <p class="panel__desc">${records.length} completed sheet${records.length === 1 ? "" : "s"} stored on this iPad.</p>
        <button type="button" class="btn btn--danger" id="wipe-data-btn">Wipe all app data&hellip;</button>
      </section>

      <p class="page-sub" style="margin-top:24px">Setup Sheets PWA &middot; v1</p>
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

    document.getElementById("wipe-data-btn").addEventListener("click", async () => {
      const sure = confirm(
        "This will delete ALL completed sheets, drafts, therapists, and settings on this iPad. " +
        "PDFs already exported elsewhere are not affected. Continue?"
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
