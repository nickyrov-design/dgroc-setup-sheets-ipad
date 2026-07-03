/**
 * Draft persistence for in-progress "new" set-up sheets.
 *
 * A draft is the set of field values the user has typed, auto-saved to
 * localStorage per sheet id so an unfinished sheet survives an accidental
 * navigation, an app close (home button), or a reload.
 *
 * Stored shape:  { savedAt: "<iso>", data: { <fieldId>: value, ... } }
 * Legacy drafts (a bare data object, no wrapper) are still read so sheets
 * started before this update are not orphaned.
 */

const NA = "N/A";

export function getDraftKey(sheetId) {
  return `setup-sheet-draft-${sheetId}`;
}

export function readDraft(sheetId) {
  try {
    const raw = localStorage.getItem(getDraftKey(sheetId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.data && typeof parsed.data === "object") {
      return { data: parsed.data, savedAt: parsed.savedAt || null };
    }
    /* Legacy format: the whole object is the field data. */
    return { data: parsed, savedAt: null };
  } catch {
    return null;
  }
}

export function writeDraft(sheetId, data) {
  try {
    localStorage.setItem(
      getDraftKey(sheetId),
      JSON.stringify({ savedAt: new Date().toISOString(), data }),
    );
  } catch {
    /* ignore quota */
  }
}

export function clearDraft(sheetId) {
  try {
    localStorage.removeItem(getDraftKey(sheetId));
  } catch {
    /* ignore */
  }
}

/**
 * True if the draft holds at least one user-entered value — a ticked checkbox,
 * a chosen dropdown (anything other than N/A), or a non-empty text/date/weight
 * field. A pristine form (all defaults) is NOT a recoverable draft, so it never
 * triggers a "save before leaving" prompt or a resume banner.
 */
export function draftHasData(data, config) {
  if (!data || !config) return false;
  for (const f of config.fields) {
    const v = data[f.id];
    if (v == null) continue;
    if (f.type === "check") {
      if (v === true) return true;
    } else if (f.type === "dropdown") {
      if (v && v !== NA) return true;
    } else if (String(v).trim() !== "") {
      return true;
    }
  }
  return false;
}
