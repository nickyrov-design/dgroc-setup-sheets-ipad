# Setup Sheets — iPad PWA

A standalone Progressive Web App port of the **Setup Sheet Form Filler** tool from the desktop DGROC Toolkit. Designed to run from an iPad's home screen as a full-screen app, fully offline after first load.

## What it does

- Three patient set-up sheets — Extremity, Head and Neck, Omniboard.
- Same fields, same PDF coordinates, same templates as the desktop tool.
- Completed sheets stored on-device (IndexedDB), tappable in a History list.
- Export any saved PDF via iOS share sheet → pCloud / iCloud Drive / Files / etc.
- Editable list of therapists/students; default therapist preselected at completion.
- Drafts auto-save in localStorage as you type.

No network connection, no server, no patient data leaves the iPad except when you explicitly export.

## Deploying to GitHub Pages

1. Create a public repo on GitHub (suggested name: `dgroc-setup-sheets-ipad`).
2. Push this directory's contents to the repo's default branch.
3. In the repo's **Settings → Pages**, set the source to "Deploy from a branch", branch `main` (or `master`), folder `/ (root)`.
4. Wait a minute or two. The app will be live at `https://<your-github-username>.github.io/<repo-name>/`.

To deploy an update later: commit and push. GitHub Pages rebuilds automatically.
Bump `CACHE_VERSION` in `service-worker.js` so installed clients pick up new code.

## Installing on the iPad

1. Open Safari on the iPad.
2. Navigate to the GitHub Pages URL.
3. Tap the **Share** icon → **Add to Home Screen**.
4. Confirm. The "Setup Sheets" icon appears on the home screen.
5. Launch it from the home screen — it runs full-screen with no Safari chrome.
6. (Optional but recommended) Install the **pCloud** app from the App Store so pCloud appears as a destination in the iOS share sheet.

After first load the app is cached for offline use — Wi-Fi only needed for code updates.

## First-run setup inside the app

1. Tap the **gear icon** (top right) → **Settings**.
2. Tap **Edit list** → add the names of all therapists and students who will use the iPad. The first one you add becomes the default automatically.
3. Optionally pick a different default therapist on the Settings screen.

You can now tap a sheet card on the landing screen and start filling.

## Exporting a completed sheet

1. Open the sheet from **History**, tap **Export PDF…** (or use the **Export** button directly on the History row).
2. The iOS share sheet appears. Pick **pCloud** (or any other destination). iOS remembers recent destinations, so subsequent exports are one tap.

Filename format matches the desktop tool: `ExtremitySetup_PatientName_2026-05-11.pdf`.

## Local development

This is plain static HTML/JS/CSS. To work on it locally:

```bash
# from this directory, any static file server works
python -m http.server 8000
# then open http://localhost:8000
```

Service workers require HTTPS or `localhost`, so don't open `index.html` directly via `file://`.

## File layout

```
index.html                      App shell
manifest.webmanifest            PWA metadata
service-worker.js               Offline cache (bump CACHE_VERSION on updates)
vendor/pdf-lib.min.js           PDF rendering library, bundled for offline use
styles/app.css                  Touch-optimised styles
assets/
├── icons/                      Logo / PWA icons
└── templates/                  The 3 blank PDF templates (copied verbatim from the desktop app)
scripts/
├── app.js                      Entry point, route registrations
├── router.js                   Hash-based router
├── storage.js                  IndexedDB wrapper (records, therapists, settings)
├── share.js                    Web Share API helper for PDF export
├── setupSheetLanding.js        Landing screen (3 sheet cards)
├── setupSheetForm.js           Form renderer + PDF stamping (pdf-lib)
├── setupSheetHistory.js        History list
├── therapistsPanel.js          Therapist list editor
├── settingsPanel.js            Settings screen
└── setupSheetConfigs/          The 3 sheet definitions, copied verbatim from desktop
    ├── index.js
    ├── extremityConfig.js
    ├── headAndNeckConfig.js
    └── omniboardConfig.js
```

## Updating the sheet templates or fields

The configs in `scripts/setupSheetConfigs/` are byte-identical to their desktop counterparts. If a sheet layout changes:

1. Update the config in the desktop repo first (so coordinate work is shared).
2. Copy the updated config and the regenerated `.pdf` template into this repo.
3. Bump `CACHE_VERSION` in `service-worker.js` and push.

## Known iOS limitations

- **No silent writes to Files.** Exporting always goes through the iOS share sheet (one tap). This is an iOS PWA restriction, not something the app can change.
- **localStorage and IndexedDB are per-origin.** All data is tied to the GitHub Pages URL. If you change hosts, the iPad starts fresh.
- **Web Share API requires iOS 15+.** Older iPads fall back to a download link.
