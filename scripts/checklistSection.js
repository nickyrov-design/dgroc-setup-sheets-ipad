/**
 * Scan checklist screen of a set-up sheet (the "Scan checklist" tab), the site
 * picker, and the checklist's dialogs.
 *
 * mountChecklist() edits the `state` object it is given in place (see
 * checklistState.js for its shape) and calls onChange() after every change;
 * the form owns saving it with the draft or record.
 */

import Router from "./router.js";
import { CHECKLIST_SITES, SITE_SIDES, FINAL_CHECKS, DETAIL_LABELS, IMPORTANT_NOTE } from "./scanChecklists.js";
import { checklistModel, siteLabel } from "./checklistState.js";
import { fillListSelects, listSelectValue } from "./nameLists.js";

const TICK_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
const WARN_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* A modal on its own overlay, so it can sit above another dialog. Closed if
   the app navigates away while it is open. */
function openOverlay(html, { top = false } = {}) {
  const overlay = document.createElement("div");
  overlay.className = `dialog-backdrop${top ? " dialog-backdrop--top" : ""}`;
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  Router.onLeave(() => overlay.remove());
  return overlay;
}

/* Resolves true for the confirm button, false for cancel. */
export function confirmDialog({ title, message, confirmLabel, cancelLabel, danger = false }) {
  return new Promise((resolve) => {
    const overlay = openOverlay(`
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h3 class="dialog__title" id="confirm-title">${escapeHtml(title)}</h3>
        <p class="dialog__desc">${escapeHtml(message)}</p>
        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" data-act="cancel">${escapeHtml(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? "btn--danger" : "btn--primary"}" data-act="ok">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `, { top: true });
    overlay.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      overlay.remove();
      resolve(act === "ok");
    });
  });
}

function confirmTurnOff() {
  return confirmDialog({
    title: "Are you sure?",
    message: "Turn off the scan checklist for this sheet? No Scan Checklist page will be added to its PDF. You can turn it back on from the Scan checklist tab.",
    confirmLabel: "Turn off checklist",
    cancelLabel: "Keep checklist",
    danger: true,
  });
}

const SELECTED_ICON = `<svg class="site-option__check" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

/**
 * Asks which site is being scanned. Tapping a site (or Breast's Left / Right)
 * only selects it; Confirm uses the selection, so a mis-tap is easy to undo.
 * Opens with the sheet's current site selected, if it has one.
 * Resolves { siteId, side }, "none" (turn the checklist off, already
 * confirmed), or null (choose later / cancel).
 */
export function pickChecklistSite({ siteId = null, side = null, first = false } = {}) {
  return new Promise((resolve) => {
    const current = CHECKLIST_SITES.find((s) => s.id === siteId);
    let selected = current && (!current.sided || side) ? { siteId, side: current.sided ? side : null } : null;

    const options = CHECKLIST_SITES.map((s) => {
      const sub = s.subtitle ? `<span class="site-option__sub">${escapeHtml(s.subtitle)}</span>` : "";
      if (s.sided) {
        return `
          <div class="site-option site-option--sided" data-site-card="${escapeHtml(s.id)}">
            <span class="site-option__name">${escapeHtml(s.name)}</span>
            ${sub}
            <span class="site-option__sides">
              ${SITE_SIDES.map((sd) => `
                <button type="button" class="btn btn--sm btn--ghost site-option__side" data-site="${escapeHtml(s.id)}" data-side="${escapeHtml(sd)}" aria-pressed="false">${escapeHtml(sd)}</button>
              `).join("")}
            </span>
            ${SELECTED_ICON}
          </div>`;
      }
      return `
        <button type="button" class="site-option" data-site="${escapeHtml(s.id)}" data-site-card="${escapeHtml(s.id)}" aria-pressed="false">
          <span class="site-option__name">${escapeHtml(s.name)}</span>
          ${sub}
          ${SELECTED_ICON}
        </button>`;
    }).join("");

    const overlay = openOverlay(`
      <div class="dialog dialog--wide" role="dialog" aria-modal="true" aria-labelledby="site-picker-title">
        <h3 class="dialog__title" id="site-picker-title">Which site are you scanning?</h3>
        <p class="dialog__desc">Tap a site to select it, then tap <strong>Confirm</strong>. Its scan checklist is added to this sheet and printed on a Scan Checklist page after the set-up sheet in the PDF.</p>
        <div class="site-grid">${options}</div>
        <p class="site-picker__selected" aria-live="polite"></p>
        <div class="dialog__actions dialog__actions--spread">
          <button type="button" class="btn btn--ghost" data-act="none">No checklist for this sheet</button>
          <span class="dialog__actions-group">
            <button type="button" class="btn btn--ghost" data-act="cancel">${first ? "Choose later" : "Cancel"}</button>
            <button type="button" class="btn btn--primary" data-act="confirm">Confirm</button>
          </span>
        </div>
      </div>
    `);

    const summary = overlay.querySelector(".site-picker__selected");
    const confirmBtn = overlay.querySelector('[data-act="confirm"]');

    /* Highlights the selection and shows it above the buttons. */
    function sync() {
      overlay.querySelectorAll("[data-site-card]").forEach((card) => {
        const on = !!selected && selected.siteId === card.dataset.siteCard;
        card.classList.toggle("is-selected", on);
        if (card.matches("button")) card.setAttribute("aria-pressed", String(on));
      });
      overlay.querySelectorAll(".site-option__side").forEach((b) => {
        const on = !!selected && selected.siteId === b.dataset.site && selected.side === b.dataset.side;
        b.classList.toggle("btn--primary", on);
        b.classList.toggle("btn--ghost", !on);
        b.setAttribute("aria-pressed", String(on));
      });
      const site = selected && CHECKLIST_SITES.find((s) => s.id === selected.siteId);
      summary.innerHTML = site
        ? `Selected: <strong>${escapeHtml(site.sided ? `${site.name} – ${selected.side}` : site.name)}</strong>`
        : "No site selected yet.";
      summary.classList.toggle("is-empty", !site);
      confirmBtn.disabled = !site;
    }
    sync();

    const done = (value) => { overlay.remove(); resolve(value); };
    overlay.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) {
        /* Tapping Breast's card (not a side) means Breast: clear any other
           selection and ask for the side. */
        const card = e.target.closest(".site-option--sided");
        if (card) {
          const site = CHECKLIST_SITES.find((s) => s.id === card.dataset.siteCard);
          if (selected?.siteId !== site.id) selected = null;
          sync();
          if (!selected) summary.innerHTML = `Choose <strong>Left</strong> or <strong>Right</strong> for ${escapeHtml(site.name)}.`;
        }
        return;
      }
      if (btn.dataset.site) {
        selected = { siteId: btn.dataset.site, side: btn.dataset.side || null };
        sync();
      } else if (btn.dataset.act === "confirm") {
        if (selected) done(selected);
      } else if (btn.dataset.act === "none") {
        if (await confirmTurnOff()) done("none");
      } else if (btn.dataset.act === "cancel") {
        done(null);
      }
    });
  });
}

/* Shown on Complete / Save when the checklist isn't finished. Resolves "go"
   (show the checklist) or "anyway" (carry on and file the sheet). */
export function confirmIncompleteChecklist(issues, { isEdit = false } = {}) {
  return new Promise((resolve) => {
    const overlay = openOverlay(`
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="incomplete-title">
        <h3 class="dialog__title" id="incomplete-title">Scan checklist not finished</h3>
        <p class="dialog__desc">This sheet&rsquo;s scan checklist still has:</p>
        <ul class="dialog__list">${issues.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
        <div class="dialog__actions dialog__actions--stacked">
          <button type="button" class="btn btn--primary" data-act="go">Go to checklist</button>
          <button type="button" class="btn btn--ghost" data-act="anyway">${isEdit ? "Save anyway" : "Complete anyway"}</button>
        </div>
      </div>
    `);
    overlay.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      overlay.remove();
      resolve(act);
    });
  });
}

/**
 * Renders the checklist into `host`.
 *   state     the checklist state, edited in place
 *   readOnly  completed sheet being viewed
 *   getSheet  () => { patientName, patientId, scanDate, radiotherapist }
 *   onChange  () => void, after every change
 * Returns { refreshMirrors, openSitePicker, unmount }.
 */
export function mountChecklist(host, { state, readOnly = false, getSheet, onChange }) {
  let alive = true;
  const dis = readOnly ? " disabled" : "";

  const changed = () => { if (alive) onChange?.(); };

  function mirrorValue(key) {
    const sheet = getSheet?.() || {};
    switch (key) {
      case "patient": return [sheet.patientName, sheet.patientId].map((v) => String(v || "").trim()).filter(Boolean).join(" / ");
      case "site": return siteLabel(state);
      case "scanDate": return formatDate(String(sheet.scanDate || "").trim());
      case "performedBy": return String(sheet.radiotherapist || "").trim();
      default: return "";
    }
  }

  function mirrorHtml(key, label) {
    const v = mirrorValue(key);
    return `
      <div class="setup-sheet__field">
        <span class="setup-sheet__label">${escapeHtml(label)}</span>
        <div class="checklist-mirror${v ? "" : " is-empty"}" data-mirror="${key}">${v ? escapeHtml(v) : "Not filled in"}</div>
      </div>`;
  }

  /* A name-list dropdown (with "+ Add new…"); filled in by fillListSelects(). */
  function selectHtml(key, label, list) {
    const cur = state.details[key];
    return `
      <label class="setup-sheet__field">
        <span class="setup-sheet__label">${escapeHtml(label)}</span>
        <select class="setup-sheet__input" data-detail="${key}" data-list="${list}" data-value="${escapeHtml(cur)}"${dis}>
          <option value="${escapeHtml(cur)}" selected>${escapeHtml(cur || "Select…")}</option>
        </select>
      </label>`;
  }

  function itemHtml(item) {
    const a = state.answers[item.id] || "";
    return `
      <div class="checklist-item${a ? ` is-${a}` : ""}" data-item="${escapeHtml(item.id)}">
        <button type="button" class="checklist-item__text" data-toggle${dis}>${escapeHtml(item.text)}</button>
        <div class="checklist-item__answers">
          <button type="button" class="answer-btn answer-btn--done" data-answer="done" aria-label="Done" aria-pressed="${a === "done"}"${dis}>${TICK_ICON}</button>
          <button type="button" class="answer-btn answer-btn--na" data-answer="na" aria-pressed="${a === "na"}"${dis}>N/A</button>
        </div>
      </div>`;
  }

  function headHtml(model) {
    const siteRow = !state.enabled ? "" : `
      <div class="checklist-site">
        <div class="checklist-site__info">
          <span class="setup-sheet__label">Site</span>
          <span class="checklist-site__name${model.site ? "" : " is-empty"}">${model.site ? escapeHtml(model.site.name) : "Not chosen"}</span>
        </div>
        ${model.site?.sided ? `
          <div class="segmented" role="group" aria-label="Side">
            ${SITE_SIDES.map((sd) => `
              <button type="button" class="segmented__btn${state.side === sd ? " is-active" : ""}" data-side="${escapeHtml(sd)}" aria-pressed="${state.side === sd}"${dis}>${escapeHtml(sd)}</button>
            `).join("")}
          </div>` : ""}
        ${readOnly ? "" : `<button type="button" class="btn btn--ghost" data-cl="change-site">${model.site ? "Change site" : "Choose site"}</button>`}
      </div>`;

    return `
      <section class="setup-sheet__section checklist-head${state.enabled ? "" : " is-off"}">
        <div class="checklist-head__top">
          <div>
            <h3 class="setup-sheet__section-title">Scan checklist</h3>
            <p class="checklist-head__desc">${state.enabled
              ? "Printed on a Scan Checklist page after the set-up sheet in the PDF."
              : "Off for this sheet &mdash; no Scan Checklist page is added to its PDF."}</p>
          </div>
          <label class="switch">
            <input type="checkbox" role="switch" data-cl="enabled"${state.enabled ? " checked" : ""}${dis} />
            <span class="switch__track" aria-hidden="true"></span>
            <span class="switch__text">${state.enabled ? "On" : "Off"}</span>
          </label>
        </div>
        ${siteRow}
      </section>`;
  }

  function detailsHtml() {
    return `
      <section class="setup-sheet__section">
        <h3 class="setup-sheet__section-title">Patient and scan details</h3>
        <div class="setup-sheet__grid">
          ${mirrorHtml("patient", DETAIL_LABELS.patient)}
          ${mirrorHtml("site", DETAIL_LABELS.site)}
          ${mirrorHtml("scanDate", DETAIL_LABELS.scanDate)}
          ${mirrorHtml("performedBy", DETAIL_LABELS.performedBy)}
          ${selectHtml("oncologist", DETAIL_LABELS.oncologist, "oncologists")}
          ${selectHtml("reviewedBy", DETAIL_LABELS.reviewedBy, "therapists")}
          <label class="setup-sheet__field setup-sheet__field--full">
            <span class="setup-sheet__label">${escapeHtml(DETAIL_LABELS.comments)}</span>
            <textarea class="setup-sheet__textarea" rows="3" data-detail="comments"${dis}>${escapeHtml(state.details.comments)}</textarea>
          </label>
        </div>
        <p class="checklist-hint">Patient name / ID, date and person performing the scan come from the set-up sheet.</p>
      </section>`;
  }

  function siteHtml(model) {
    if (!model.site) {
      return `
        <section class="setup-sheet__section checklist-choose">
          <p>Choose the site you&rsquo;re scanning to add its checklist.</p>
          ${readOnly ? "" : `<button type="button" class="btn btn--primary" data-cl="change-site">Choose site</button>`}
        </section>`;
    }
    if (!model.site.items.length) return "";

    const groups = [];
    for (const item of model.site.items) {
      const last = groups[groups.length - 1];
      if (last && last.check === item.check) last.items.push(item);
      else groups.push({ check: item.check, items: [item] });
    }
    const escalate = model.site.escalate ? `
      <div class="escalate" role="note">
        <span class="escalate__icon">${WARN_ICON}</span>
        <div>
          <div class="escalate__title">Escalate</div>
          <p class="escalate__text">${escapeHtml(model.site.escalate)}</p>
        </div>
      </div>` : "";

    return `
      <section class="setup-sheet__section">
        <div class="checklist-sec-head">
          <h3 class="checklist-sec-head__title">${escapeHtml(siteLabel(state, model))}</h3>
          ${model.site.subtitle ? `<span class="checklist-sec-head__sub">${escapeHtml(model.site.subtitle)}</span>` : ""}
        </div>
        ${escalate}
        ${groups.map((g) => `
          <div class="checklist-group">
            <div class="checklist-group__title">${escapeHtml(g.check)}</div>
            ${g.items.map(itemHtml).join("")}
          </div>
        `).join("")}
      </section>`;
  }

  function finalHtml(model) {
    return `
      <section class="setup-sheet__section">
        <div class="checklist-sec-head">
          <h3 class="checklist-sec-head__title">${escapeHtml(FINAL_CHECKS.title)}</h3>
          <span class="checklist-sec-head__sub">${escapeHtml(FINAL_CHECKS.subtitle)}</span>
        </div>
        <div class="checklist-group">${model.final.map(itemHtml).join("")}</div>
      </section>`;
  }

  function render() {
    if (!alive) return;
    const model = checklistModel(state);
    host.innerHTML = `
      <div class="checklist">
        ${headHtml(model)}
        ${state.enabled ? `
          ${detailsHtml()}
          ${siteHtml(model)}
          ${finalHtml(model)}
          <p class="checklist-note"><strong>Important:</strong> ${escapeHtml(IMPORTANT_NOTE)}</p>
        ` : ""}
      </div>`;
    fillListSelects(host);
  }

  function setAnswer(row, answer) {
    const id = row.dataset.item;
    if (state.answers[id] === answer) delete state.answers[id];
    else state.answers[id] = answer;
    const a = state.answers[id] || "";
    row.classList.toggle("is-done", a === "done");
    row.classList.toggle("is-na", a === "na");
    row.querySelectorAll("[data-answer]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.answer === a)));
    changed();
  }

  async function openSitePicker({ first = false } = {}) {
    if (!alive || readOnly) return;
    const res = await pickChecklistSite({ siteId: state.siteId, side: state.side, first });
    if (!alive || res == null) return;
    if (res === "none") {
      state.enabled = false;
      state.turnedOffAt = new Date().toISOString();
      render();
      changed();
      return;
    }
    if (res.siteId !== state.siteId) {
      const prev = checklistModel(state);
      const prevItems = prev.site?.items || [];
      const answered = prevItems.filter((i) => state.answers[i.id]).length;
      if (answered > 0) {
        const name = siteLabel(state, prev);
        const ok = await confirmDialog({
          title: "Change site?",
          message: `The ${answered} answer${answered === 1 ? "" : "s"} ticked for ${name} will be cleared. Patient and scan details and final checks are kept.`,
          confirmLabel: "Change site",
          cancelLabel: `Keep ${name}`,
        });
        if (!ok || !alive) return;
      }
      for (const i of prevItems) delete state.answers[i.id];
    }
    state.siteId = res.siteId;
    state.side = res.side;
    render();
    changed();
  }

  function onClick(e) {
    if (readOnly) return;
    const answerBtn = e.target.closest("[data-answer]");
    if (answerBtn) {
      setAnswer(answerBtn.closest("[data-item]"), answerBtn.dataset.answer);
      return;
    }
    const toggle = e.target.closest("[data-toggle]");
    if (toggle) {
      /* Tapping the text ticks the item (replacing N/A), or clears a tick. */
      setAnswer(toggle.closest("[data-item]"), "done");
      return;
    }
    const sideBtn = e.target.closest("[data-side]");
    if (sideBtn) {
      state.side = state.side === sideBtn.dataset.side ? null : sideBtn.dataset.side;
      render();
      changed();
      return;
    }
    if (e.target.closest('[data-cl="change-site"]')) openSitePicker();
  }

  async function onChangeEvent(e) {
    if (readOnly) return;
    const t = e.target;
    if (t.matches('[data-cl="enabled"]')) {
      if (t.checked) {
        state.enabled = true;
        state.turnedOffAt = null;
        render();
        changed();
        if (!state.siteId) openSitePicker();
      } else if (await confirmTurnOff()) {
        if (!alive) return;
        state.enabled = false;
        state.turnedOffAt = new Date().toISOString();
        render();
        changed();
      } else {
        t.checked = true;
      }
      return;
    }
    if (t.matches("select[data-detail]")) {
      state.details[t.dataset.detail] = listSelectValue(t);
      changed();
    }
  }

  function onInput(e) {
    if (readOnly) return;
    const t = e.target;
    if (t.matches("textarea[data-detail]")) {
      state.details[t.dataset.detail] = t.value;
      changed();
    }
  }

  host.addEventListener("click", onClick);
  host.addEventListener("change", onChangeEvent);
  host.addEventListener("input", onInput);

  render();

  return {
    refreshMirrors() {
      if (!alive) return;
      host.querySelectorAll("[data-mirror]").forEach((el) => {
        const v = mirrorValue(el.dataset.mirror);
        el.textContent = v || "Not filled in";
        el.classList.toggle("is-empty", !v);
      });
    },
    openSitePicker,
    unmount() {
      alive = false;
      host.removeEventListener("click", onClick);
      host.removeEventListener("change", onChangeEvent);
      host.removeEventListener("input", onInput);
      host.innerHTML = "";
    },
  };
}
