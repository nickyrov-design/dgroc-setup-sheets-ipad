/**
 * App entry point. Registers the service worker, wires routes to screens,
 * and starts the router.
 */

import Router from "./router.js";
import SetupSheetLanding from "./setupSheetLanding.js";
import SetupSheetForm from "./setupSheetForm.js";
import SetupSheetHistory from "./setupSheetHistory.js";
import SettingsPanel from "./settingsPanel.js";
import TherapistsPanel from "./therapistsPanel.js";

/* Register service worker (best-effort — non-fatal if it fails). */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}

/* Routes */
Router.register("/", (container) => SetupSheetLanding.mount(container));

Router.register("/form/:sheetId", (container, { sheetId }) => {
  SetupSheetForm.mountNew(container, sheetId);
});

Router.register("/form/:sheetId/:recordId", (container, { sheetId, recordId }) => {
  SetupSheetForm.mountExisting(container, sheetId, recordId);
});

Router.register("/history", (container) => SetupSheetHistory.mount(container, null));
Router.register("/history/:sheetId", (container, { sheetId }) => SetupSheetHistory.mount(container, sheetId));

Router.register("/settings", (container) => SettingsPanel.mount(container));
Router.register("/therapists", (container) => TherapistsPanel.mount(container));

Router.start();
