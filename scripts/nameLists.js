/**
 * Dropdowns backed by an editable name list (therapists, radiation
 * oncologists, diagnoses), each with a "+ Add new…" option that adds a name
 * to its list in place, without going to Settings. Settings is still where
 * names are renamed, reordered or removed.
 *
 * Markup: <select data-list="therapists" data-value="<current>"
 *                 data-placeholder="Select…" [data-list-value="id"]>
 * then call fillListSelects(root) to fill in the options. Options hold the
 * name, or the entry's id with data-list-value="id".
 *
 * Picking "+ Add new…" never reaches the page's own input/change handlers:
 * they only ever see a real name (or the previous value, if cancelled).
 */

import Storage from "./storage.js";

export const ADD_NEW = "__add_new__";

const LISTS = {
  therapists: {
    api: () => Storage.therapists,
    title: "Add a therapist or student",
    label: "Name",
    placeholder: "Name to add",
    where: "Settings → Therapist list",
    maxLength: 60,
  },
  oncologists: {
    api: () => Storage.oncologists,
    title: "Add a radiation oncologist",
    label: "Name",
    placeholder: "e.g. Dr Smith",
    where: "Settings → Radiation oncologists",
    maxLength: 60,
  },
  diagnoses: {
    api: () => Storage.diagnoses,
    title: "Add a diagnosis",
    label: "Diagnosis",
    placeholder: "Diagnosis to add",
    where: "Settings → Diagnoses",
    maxLength: 80,
  },
};

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* The select's value, ignoring a "+ Add new…" pick that is still open. */
export function listSelectValue(sel) {
  return sel.value === ADD_NEW ? (sel.dataset.value || "") : sel.value;
}

/**
 * Fills every name-list select under `root` from its list, keeping each
 * one's current value (a value that is no longer in the list, e.g. from an
 * older sheet, stays as an extra option).
 */
export async function fillListSelects(root = document) {
  const selects = [...root.querySelectorAll("select[data-list]")].filter((s) => LISTS[s.dataset.list]);
  const keys = [...new Set(selects.map((s) => s.dataset.list))];
  const lists = {};
  await Promise.all(keys.map(async (k) => {
    try {
      lists[k] = await LISTS[k].api().list();
    } catch (err) {
      console.error(`Could not load the ${k} list:`, err);
      lists[k] = [];
    }
  }));
  for (const sel of selects) {
    if (!sel.isConnected) continue;
    const byId = sel.dataset.listValue === "id";
    const items = lists[sel.dataset.list].map((it) => ({ value: byId ? it.id : it.name, label: it.name }));
    const cur = sel.dataset.value ?? listSelectValue(sel);
    if (cur && !items.some((i) => i.value === cur)) items.push({ value: cur, label: cur });
    sel.innerHTML = [
      `<option value="">${escapeHtml(sel.dataset.placeholder || "Select…")}</option>`,
      ...items.map((i) => `<option value="${escapeHtml(i.value)}">${escapeHtml(i.label)}</option>`),
      sel.disabled ? "" : `<option value="${ADD_NEW}">+ Add new…</option>`,
    ].join("");
    sel.value = cur || "";
    sel.dataset.value = sel.value;
  }
}

/* Asks for a new name. Resolves the trimmed name, or null if cancelled. */
function promptNewName(cfg) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "dialog-backdrop dialog-backdrop--top dialog-backdrop--keyboard";
    overlay.innerHTML = `
      <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="add-name-title" novalidate>
        <h3 class="dialog__title" id="add-name-title">${escapeHtml(cfg.title)}</h3>
        <p class="dialog__desc">Added to the list for every sheet. Rename or remove names in ${escapeHtml(cfg.where)}.</p>
        <div class="dialog__field">
          <label for="add-name-input">${escapeHtml(cfg.label)}</label>
          <input type="text" id="add-name-input" maxlength="${cfg.maxLength}" autocomplete="off" placeholder="${escapeHtml(cfg.placeholder)}" />
        </div>
        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" data-act="cancel">Cancel</button>
          <button type="submit" class="btn btn--primary" data-act="add" disabled>Add</button>
        </div>
      </form>
    `;
    document.body.appendChild(overlay);
    const form = overlay.querySelector("form");
    const input = overlay.querySelector("input");
    const addBtn = overlay.querySelector('[data-act="add"]');
    const done = (v) => { overlay.remove(); resolve(v); };
    input.addEventListener("input", () => { addBtn.disabled = !input.value.trim(); });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (name) done(name);
    });
    overlay.querySelector('[data-act="cancel"]').addEventListener("click", () => done(null));
    input.focus();
  });
}

/* Adds `name` to a list (or finds it, ignoring case). Resolves the entry. */
async function addToList(key, name) {
  const api = LISTS[key].api();
  const existing = (await api.list()).find((it) => it.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const res = await api.add(name);
  if (!res.ok) throw new Error(res.error || "Could not add the name.");
  if (key === "therapists") {
    /* As in the therapist editor: the first name becomes the default. */
    const def = await Storage.settings.get("defaultTherapistId");
    if (!def) await Storage.settings.set("defaultTherapistId", res.id);
  }
  return { id: res.id, name };
}

async function onAddNew(sel) {
  const key = sel.dataset.list;
  const prev = sel.dataset.value || "";
  let picked = null;
  try {
    const name = await promptNewName(LISTS[key]);
    if (name) picked = await addToList(key, name);
  } catch (err) {
    console.error(err);
    alert(err.message || String(err));
  }
  /* Refresh every dropdown of this list on the page, then select the new name. */
  sel.dataset.value = picked ? (sel.dataset.listValue === "id" ? picked.id : picked.name) : prev;
  await fillListSelects(document);
  if (!sel.isConnected) return;
  if (picked) sel.dispatchEvent(new Event("change", { bubbles: true }));
}

/* Capture phase, so "+ Add new…" is handled before any page handler sees it. */
function intercept(e) {
  const sel = e.target;
  if (!(sel instanceof HTMLSelectElement) || !sel.dataset.list || !LISTS[sel.dataset.list]) return;
  if (sel.value !== ADD_NEW) {
    if (e.type === "change") sel.dataset.value = sel.value;
    return;
  }
  e.stopPropagation();
  if (e.type === "change") onAddNew(sel);
}
document.addEventListener("input", intercept, true);
document.addEventListener("change", intercept, true);
