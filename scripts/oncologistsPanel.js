/**
 * Radiation oncologist list editor: the names offered for "Treating radiation
 * oncologist" on the scan checklist. Add, rename, reorder, remove.
 * Backed by IndexedDB via storage.js.
 */

import Storage from "./storage.js";
import { createListEditorPanel } from "./listEditorPanel.js";

const OncologistsPanel = createListEditorPanel({
  title: "Radiation oncologists",
  sub: "Names offered for “Treating radiation oncologist” on the scan checklist, in this order.",
  api: Storage.oncologists,
  nameLabel: "Oncologist name",
  addPlaceholder: "Name to add, e.g. Dr Smith",
  maxLength: 60,
  emptyText: "No radiation oncologists yet. Add one below.",
  addError: "Could not add name.",
  removeConfirm: (name) => `Remove "${name}" from the list? Sheets already completed keep the name.`,
});

export default OncologistsPanel;
