/**
 * Photo label editor. The quick-pick labels offered when labelling a photo
 * (a custom label can always be typed too). Add, rename, reorder, remove.
 * Backed by IndexedDB via storage.js.
 */

import Storage from "./storage.js";
import { createListEditorPanel } from "./listEditorPanel.js";

const PhotoLabelsPanel = createListEditorPanel({
  title: "Photo labels",
  sub: "Quick-pick labels offered when labelling a set-up photo, in this order. Labels are added to exported photo filenames.",
  api: Storage.photoLabels,
  nameLabel: "Label name",
  addPlaceholder: "Label to add",
  maxLength: 40,
  emptyText: "No labels yet. Add one below, or type a custom label when labelling a photo.",
  addError: "Could not add label.",
  removeConfirm: (name) => `Remove "${name}" from the list? Photos already labelled keep their label.`,
});

export default PhotoLabelsPanel;
