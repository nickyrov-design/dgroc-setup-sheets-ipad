/**
 * Diagnosis list editor: the diagnoses offered in a set-up sheet's Diagnosis
 * dropdown. Add, rename, reorder, remove. Names can also be added in place
 * from the dropdown ("+ Add new…"). Backed by IndexedDB via storage.js.
 */

import Storage from "./storage.js";
import { createListEditorPanel } from "./listEditorPanel.js";

const DiagnosesPanel = createListEditorPanel({
  title: "Diagnoses",
  sub: "Diagnoses offered in the set-up sheet’s Diagnosis dropdown, in this order. You can also add one from the dropdown itself.",
  api: Storage.diagnoses,
  nameLabel: "Diagnosis",
  addPlaceholder: "Diagnosis to add",
  maxLength: 80,
  emptyText: "No diagnoses yet. Add one below, or from a sheet’s Diagnosis dropdown.",
  addError: "Could not add diagnosis.",
  removeConfirm: (name) => `Remove "${name}" from the list? Sheets already completed keep their diagnosis.`,
});

export default DiagnosesPanel;
