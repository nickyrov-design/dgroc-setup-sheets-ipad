/**
 * Therapist list editor. Add, rename, remove, set default.
 * Backed by IndexedDB via storage.js.
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

const TherapistsPanel = {
  async mount(container) {
    this._container = container;
    await this._render();
  },

  async _render() {
    const [therapists, defaultId] = await Promise.all([
      Storage.therapists.list(),
      Storage.settings.get("defaultTherapistId"),
    ]);

    const rows = therapists.length
      ? `<ul class="therapist-list">
          ${therapists.map((t) => `
            <li class="therapist-row" data-id="${escapeHtml(t.id)}">
              <div class="therapist-row__name">
                <input type="text" value="${escapeHtml(t.name)}" data-rename />
                ${t.id === defaultId ? `<span class="therapist-row__default-badge">Default</span>` : ""}
              </div>
              ${t.id === defaultId
                ? ""
                : `<button type="button" class="btn btn--ghost" data-set-default>Make default</button>`}
              <button type="button" class="btn btn--danger" data-remove>Remove</button>
            </li>
          `).join("")}
        </ul>`
      : `<div class="history-empty">No therapists yet. Add one below to enable completing sheets.</div>`;

    this._container.innerHTML = `
      <h1 class="page-title">Therapists &amp; Students</h1>
      <p class="page-sub">Names that appear in the completion picker. The default is preselected.</p>
      <section class="panel">
        <h2 class="panel__title">Current list</h2>
        ${rows}
        <div class="add-therapist">
          <input type="text" id="new-therapist-name" placeholder="Name to add" autocomplete="off" />
          <button type="button" class="btn btn--primary" id="add-therapist-btn">Add</button>
        </div>
      </section>
      <p class="page-sub"><a href="#/settings">&larr; Back to Settings</a></p>
    `;

    this._bind();
  },

  _bind() {
    const addBtn = document.getElementById("add-therapist-btn");
    const nameInput = document.getElementById("new-therapist-name");
    const doAdd = async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const res = await Storage.therapists.add(name);
      if (!res.ok) { alert(res.error || "Could not add therapist."); return; }
      /* If first one ever, auto-make default. */
      const all = await Storage.therapists.list();
      const def = await Storage.settings.get("defaultTherapistId");
      if (all.length === 1 || !def) {
        await Storage.settings.set("defaultTherapistId", res.id);
      }
      await this._render();
    };
    addBtn.addEventListener("click", doAdd);
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(); });

    this._container.querySelectorAll(".therapist-row").forEach((row) => {
      const id = row.dataset.id;
      const renameInput = row.querySelector("[data-rename]");
      let timer = null;
      renameInput.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          await Storage.therapists.rename(id, renameInput.value);
        }, 400);
      });
      renameInput.addEventListener("blur", async () => {
        await Storage.therapists.rename(id, renameInput.value);
      });

      const defaultBtn = row.querySelector("[data-set-default]");
      if (defaultBtn) {
        defaultBtn.addEventListener("click", async () => {
          await Storage.settings.set("defaultTherapistId", id);
          await this._render();
        });
      }

      row.querySelector("[data-remove]").addEventListener("click", async () => {
        if (!confirm(`Remove "${renameInput.value}" from the list?`)) return;
        await Storage.therapists.remove(id);
        await this._render();
      });
    });
  },
};

export default TherapistsPanel;
