/**
 * Editor screen for an ordered list of names (photo labels, radiation
 * oncologists): add, rename, reorder, remove. `api` is one of Storage's
 * ordered lists ({ list, add, rename, remove, move }).
 */

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createListEditorPanel({
  title, sub, api, nameLabel, addPlaceholder, maxLength, emptyText, addError, removeConfirm,
}) {
  return {
    async mount(container) {
      this._container = container;
      await this._render();
    },

    async _render() {
      const items = await api.list();

      const rows = items.length
        ? `<ul class="therapist-list">
            ${items.map((l, i) => `
              <li class="therapist-row" data-id="${escapeHtml(l.id)}">
                <div class="therapist-row__name">
                  <input type="text" value="${escapeHtml(l.name)}" maxlength="${maxLength}" aria-label="${escapeHtml(nameLabel)}" data-rename />
                </div>
                <button type="button" class="btn btn--ghost" data-move="-1"${i === 0 ? " disabled" : ""} aria-label="Move up">&uarr;</button>
                <button type="button" class="btn btn--ghost" data-move="1"${i === items.length - 1 ? " disabled" : ""} aria-label="Move down">&darr;</button>
                <button type="button" class="btn btn--danger" data-remove>Remove</button>
              </li>
            `).join("")}
          </ul>`
        : `<div class="history-empty">${escapeHtml(emptyText)}</div>`;

      this._container.innerHTML = `
        <h1 class="page-title">${escapeHtml(title)}</h1>
        <p class="page-sub">${escapeHtml(sub)}</p>
        <section class="panel">
          <h2 class="panel__title">Current list</h2>
          ${rows}
          <div class="add-therapist">
            <input type="text" id="list-new-name" placeholder="${escapeHtml(addPlaceholder)}" maxlength="${maxLength}" autocomplete="off" />
            <button type="button" class="btn btn--primary" id="list-add-btn">Add</button>
          </div>
        </section>
        <p class="page-sub"><a href="#/settings">&larr; Back to Settings</a></p>
      `;

      this._bind();
    },

    _bind() {
      const addBtn = document.getElementById("list-add-btn");
      const nameInput = document.getElementById("list-new-name");
      const doAdd = async () => {
        const name = nameInput.value.trim();
        if (!name) return;
        const res = await api.add(name);
        if (!res.ok) { alert(res.error || addError); return; }
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
            await api.rename(id, renameInput.value);
          }, 400);
        });
        renameInput.addEventListener("blur", async () => {
          clearTimeout(timer);
          await api.rename(id, renameInput.value);
        });

        row.querySelectorAll("[data-move]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            clearTimeout(timer);
            await api.rename(id, renameInput.value);
            await api.move(id, Number(btn.dataset.move));
            await this._render();
          });
        });

        row.querySelector("[data-remove]").addEventListener("click", async () => {
          clearTimeout(timer);
          if (!confirm(removeConfirm(renameInput.value))) return;
          await api.remove(id);
          await this._render();
        });
      });
    },
  };
}
