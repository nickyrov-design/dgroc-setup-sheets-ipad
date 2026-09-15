/**
 * Photo label editor. The quick-pick labels offered when labelling a photo
 * (a custom label can always be typed too). Add, rename, reorder, remove.
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

const PhotoLabelsPanel = {
  async mount(container) {
    this._container = container;
    await this._render();
  },

  async _render() {
    const labels = await Storage.photoLabels.list();

    const rows = labels.length
      ? `<ul class="therapist-list">
          ${labels.map((l, i) => `
            <li class="therapist-row" data-id="${escapeHtml(l.id)}">
              <div class="therapist-row__name">
                <input type="text" value="${escapeHtml(l.name)}" maxlength="40" aria-label="Label name" data-rename />
              </div>
              <button type="button" class="btn btn--ghost" data-move="-1"${i === 0 ? " disabled" : ""} aria-label="Move up">&uarr;</button>
              <button type="button" class="btn btn--ghost" data-move="1"${i === labels.length - 1 ? " disabled" : ""} aria-label="Move down">&darr;</button>
              <button type="button" class="btn btn--danger" data-remove>Remove</button>
            </li>
          `).join("")}
        </ul>`
      : `<div class="history-empty">No labels yet. Add one below, or type a custom label when labelling a photo.</div>`;

    this._container.innerHTML = `
      <h1 class="page-title">Photo labels</h1>
      <p class="page-sub">Quick-pick labels offered when labelling a set-up photo, in this order. Labels are added to exported photo filenames.</p>
      <section class="panel">
        <h2 class="panel__title">Current list</h2>
        ${rows}
        <div class="add-therapist">
          <input type="text" id="new-label-name" placeholder="Label to add" maxlength="40" autocomplete="off" />
          <button type="button" class="btn btn--primary" id="add-label-btn">Add</button>
        </div>
      </section>
      <p class="page-sub"><a href="#/settings">&larr; Back to Settings</a></p>
    `;

    this._bind();
  },

  _bind() {
    const addBtn = document.getElementById("add-label-btn");
    const nameInput = document.getElementById("new-label-name");
    const doAdd = async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const res = await Storage.photoLabels.add(name);
      if (!res.ok) { alert(res.error || "Could not add label."); return; }
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
          await Storage.photoLabels.rename(id, renameInput.value);
        }, 400);
      });
      renameInput.addEventListener("blur", async () => {
        clearTimeout(timer);
        await Storage.photoLabels.rename(id, renameInput.value);
      });

      row.querySelectorAll("[data-move]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          clearTimeout(timer);
          await Storage.photoLabels.rename(id, renameInput.value);
          await Storage.photoLabels.move(id, Number(btn.dataset.move));
          await this._render();
        });
      });

      row.querySelector("[data-remove]").addEventListener("click", async () => {
        clearTimeout(timer);
        if (!confirm(`Remove "${renameInput.value}" from the list? Photos already labelled keep their label.`)) return;
        await Storage.photoLabels.remove(id);
        await this._render();
      });
    });
  },
};

export default PhotoLabelsPanel;
