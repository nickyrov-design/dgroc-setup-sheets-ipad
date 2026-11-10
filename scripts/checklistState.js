/**
 * Scan checklist state, shared by drafts, records, the checklist screen and
 * the PDF. Plain JSON only, so it can live in localStorage drafts and in
 * IndexedDB records alike.
 *
 *   {
 *     v: 1,                         CHECKLIST_VERSION of the wording
 *     enabled: true,                false when turned off for this sheet
 *     turnedOffAt: null | "<iso>",  when it was turned off
 *     siteId: null | "pelvis",      see scanChecklists.js
 *     side: null | "Left" | "Right" (sided sites only, i.e. Breast)
 *     answers: { "<itemId>": "done" | "na" }   unanswered items are absent
 *     details: { oncologist, reviewedBy, comments }
 *     snapshot: { site, final }     completed sheets only: the wording they
 *                                   were completed with
 *     siteLabel: "Breast – Left"    completed sheets only, for History
 *   }
 *
 * Patient name / ID, scan date and the person performing the scan are not
 * stored here: they come from the set-up sheet's own fields.
 *
 * A sheet completed before scan checklists existed has no `checklist` at all;
 * readChecklistState() returns null for it and no checklist is shown.
 */

import { CHECKLIST_VERSION, FINAL_CHECKS, DETAIL_LABELS, getChecklistSite } from "./scanChecklists.js";

const ANSWERS = new Set(["done", "na"]);

export function newChecklistState() {
  return {
    v: CHECKLIST_VERSION,
    enabled: true,
    turnedOffAt: null,
    siteId: null,
    side: null,
    answers: {},
    details: { oncologist: "", reviewedBy: "", comments: "" },
    snapshot: null,
  };
}

/* A clean copy of a stored checklist (draft or record), or null if there is none. */
export function readChecklistState(raw) {
  if (!raw || typeof raw !== "object") return null;
  const answers = {};
  for (const [id, a] of Object.entries(raw.answers || {})) {
    if (ANSWERS.has(a)) answers[id] = a;
  }
  return {
    v: raw.v || CHECKLIST_VERSION,
    enabled: raw.enabled !== false,
    turnedOffAt: raw.turnedOffAt || null,
    siteId: raw.siteId || null,
    side: raw.side || null,
    answers,
    details: {
      oncologist: String(raw.details?.oncologist || ""),
      reviewedBy: String(raw.details?.reviewedBy || ""),
      comments: String(raw.details?.comments || ""),
    },
    snapshot: raw.snapshot && typeof raw.snapshot === "object" ? raw.snapshot : null,
  };
}

/**
 * What to show for a state: { site, final }. A completed sheet shows the
 * wording it was completed with while its site is unchanged; otherwise the
 * current wording. `site` is null until a site is chosen.
 */
export function checklistModel(state) {
  const snap = state?.snapshot;
  const final = Array.isArray(snap?.final) && snap.final.length ? snap.final : FINAL_CHECKS.items;
  let site = null;
  if (state?.siteId) {
    site = snap?.site && snap.site.id === state.siteId ? snap.site : getChecklistSite(state.siteId);
  }
  return { site, final };
}

/* "Breast – Left", "Pelvis", or "" before a site is chosen. */
export function siteLabel(state, model = checklistModel(state)) {
  if (!model.site) return "";
  return model.site.sided && state.side ? `${model.site.name} – ${state.side}` : model.site.name;
}

function itemIds(model) {
  return [...(model.site?.items || []), ...model.final].map((i) => i.id);
}

/* Answered / total over the site's items and the final checks. */
export function checklistProgress(state, model = checklistModel(state)) {
  const ids = itemIds(model);
  const answered = ids.filter((id) => ANSWERS.has(state.answers[id])).length;
  return { answered, total: ids.length };
}

/* True if anything was entered beyond the defaults and the site choice. */
export function checklistHasData(raw) {
  if (!raw || typeof raw !== "object") return false;
  if (Object.values(raw.answers || {}).some((a) => ANSWERS.has(a))) return true;
  const d = raw.details || {};
  return [d.oncologist, d.reviewedBy, d.comments].some((v) => String(v || "").trim() !== "");
}

/**
 * What still needs doing before completing, as short sentences (empty when
 * the checklist is off or finished). `sheet` holds the set-up sheet's values.
 */
export function checklistIssues(state, sheet, model = checklistModel(state)) {
  if (!state?.enabled) return [];
  const issues = [];
  const count = (items) => items.filter((i) => !ANSWERS.has(state.answers[i.id])).length;

  if (!model.site) {
    issues.push("No site chosen.");
  } else {
    if (model.site.sided && !state.side) issues.push(`${model.site.name}: Left or Right not chosen.`);
    const open = count(model.site.items);
    if (open) issues.push(`${open} of ${model.site.items.length} ${model.site.name} item${open === 1 ? "" : "s"} not ticked or marked N/A.`);
  }
  const openFinal = count(model.final);
  if (openFinal) issues.push(`${openFinal} of ${model.final.length} final check${openFinal === 1 ? "" : "s"} not ticked or marked N/A.`);

  const blank = (v) => String(v || "").trim() === "";
  const missing = [];
  if (blank(sheet?.patientName) && blank(sheet?.patientId)) missing.push(DETAIL_LABELS.patient);
  if (blank(sheet?.scanDate)) missing.push(DETAIL_LABELS.scanDate);
  if (blank(sheet?.radiotherapist)) missing.push(DETAIL_LABELS.performedBy);
  if (blank(state.details.oncologist)) missing.push(DETAIL_LABELS.oncologist);
  if (blank(state.details.reviewedBy)) missing.push(DETAIL_LABELS.reviewedBy);
  if (missing.length) issues.push(`Not filled in: ${missing.join(", ")}.`);
  return issues;
}

/* The checklist as saved on a completed sheet, with a copy of its wording. */
export function toRecordChecklist(state) {
  if (!state.enabled) {
    return {
      v: state.v || CHECKLIST_VERSION,
      enabled: false,
      turnedOffAt: state.turnedOffAt || new Date().toISOString(),
    };
  }
  const model = checklistModel(state);
  const ids = new Set(itemIds(model));
  const answers = {};
  for (const [id, a] of Object.entries(state.answers)) {
    if (ids.has(id) && ANSWERS.has(a)) answers[id] = a;
  }
  const fromSnapshot = !!(state.snapshot?.site && model.site && state.snapshot.site.id === model.site.id);
  return {
    v: fromSnapshot ? state.v : CHECKLIST_VERSION,
    enabled: true,
    turnedOffAt: null,
    siteId: model.site ? model.site.id : null,
    side: model.site?.sided ? state.side : null,
    siteLabel: siteLabel(state, model),
    answers,
    details: {
      oncologist: state.details.oncologist.trim(),
      reviewedBy: state.details.reviewedBy.trim(),
      comments: state.details.comments.trim(),
    },
    snapshot: {
      site: model.site
        ? {
            id: model.site.id,
            name: model.site.name,
            subtitle: model.site.subtitle || "",
            sided: !!model.site.sided,
            escalate: model.site.escalate || null,
            items: model.site.items.map(({ id, check, text }) => ({ id, check, text })),
          }
        : null,
      final: model.final.map(({ id, text }) => ({ id, text })),
    },
  };
}

/* Comparable form of a state, for spotting unsaved changes. */
export function checklistFingerprint(state) {
  if (!state) return "";
  if (!state.enabled) return JSON.stringify({ enabled: false });
  const answers = Object.keys(state.answers).sort().map((id) => [id, state.answers[id]]);
  return JSON.stringify({
    enabled: true,
    siteId: state.siteId || null,
    side: state.side || null,
    answers,
    details: [state.details.oncologist.trim(), state.details.reviewedBy.trim(), state.details.comments.trim()],
  });
}
