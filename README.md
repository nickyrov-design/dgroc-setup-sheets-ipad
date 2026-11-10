# Setup Sheets — iPad PWA

A standalone Progressive Web App port of the **Setup Sheet Form Filler** tool from the desktop DGROC Toolkit. Designed to run from an iPad's home screen as a full-screen app, fully offline after first load.

## What it does

- Three patient set-up sheets — Extremity, Head and Neck, Omniboard.
- Same fields, same PDF coordinates, same templates as the desktop tool.
- A scan checklist for the site being scanned (8 treatment sites, plus Other / general), printed on a Scan Checklist page after the set-up sheet in the PDF.
- Completed sheets stored on-device (IndexedDB), tappable in a History list.
- Set-up photos attached to a sheet — taken in the app or chosen from the iPad — with optional labels.
- Export any saved PDF and its photos (as JPGs) via iOS share sheet → Files (including network folders) / pCloud / iCloud Drive / etc.
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

4. Check **Settings → Radiation oncologists**. It starts with Dr Kotzen, Dr Hugo, Dr Tunmer, Dr Chetty and Dr Mutsoane; add, rename, reorder or remove names as needed.

You can now tap a sheet card on the landing screen and start filling.

## Scan checklists

Every new sheet has a scan checklist, on by default.

- After you tap a sheet card, **Which site are you scanning?** asks for the site: Breast (Left or Right), Head and neck, Pelvis, SBRT – Pancreas, SBRT – Liver, SBRT – Lung, SBRT – Para-aortic lymph nodes, Cranial SRS, or Other / general (patient details and final checks only). Tapping a site only selects it (highlighted, with a tick); tap **Confirm** to use it, so a mis-tap is easy to correct. **Choose later** leaves it for now; **No checklist for this sheet** turns it off after an "Are you sure?".
- The sheet then has two tabs: **Set-up sheet** and **Scan checklist** (with a count such as 12/35). The checklist tab has the on/off switch, the site (**Change site**), the patient and scan details, the site's items with its **Escalate** warning above them, and the final checks.
- Tap **✓** or **N/A** for each item (tap again to clear). Tapping an item's text ticks it.
- Patient name / ID, date of planning scan and person performing the scan come from the set-up sheet (Patient name, Patient ID, Scan date, Radiotherapist), so they're only typed once. Pick the treating radiation oncologist and who reviewed the checklist from the lists, and add any outstanding queries or comments.
- **Complete Form** / **Save** warns if anything on the checklist is still open, with **Go to checklist** or **Complete anyway**.
- Changing the site clears the old site's ticks (after asking); patient details and final checks are kept.
- The checklist is printed on a **Scan Checklist** page straight after the set-up sheet in the same PDF: DGROC letterhead, "Scan Checklist", "Site: …", the details, the site's items and Escalate warning, the final checks and the "Important" note. Each site fits on one A4 page; very long comments carry on to a second page.
- History shows each sheet's site, and the search box finds sheets by site.

Sheets completed before this update have no checklist and are unchanged.

## Set-up photos

Every sheet has a **Photos** section — while you're filling it in, and after it has been completed.

- **Take photo** opens the camera. Photos taken this way go straight into the app and are **not** saved to the iPad's Photos library (or iCloud Photos). This is the recommended way to photograph patients.
- **Choose existing** picks photos already on the iPad (e.g. taken with the Camera app). The app can't remove them from the Photos library — delete them there yourself once they're attached.
- Photos are saved the moment they're added; you don't need to Save or Complete the sheet for them to stick. Photos added to an unfinished sheet stay with its draft and are filed with the sheet on **Complete Form**.
- Tap **+ Add label** under a photo (or the label button in the viewer) to label it — pick from the quick-pick list or type your own. After taking a single photo the label picker opens automatically. Edit the quick-pick list in **Settings → Photo labels**.
- Tap a photo to view it full screen: swipe between photos, pinch or double-tap to zoom, swipe down to close. Delete a photo from the viewer.

Photos are stored as JPEGs at full iPad camera resolution (12 MP, roughly 3–4 MB each). Anything larger is scaled down to that size. Rotation is baked in and embedded metadata such as GPS location is removed.

## Exporting a completed sheet

1. Open the sheet from **History** and tap **Export PDF…** / **Export…** (or use the **Export** button directly on the History row).
2. If the sheet has photos, choose what to include — the PDF, the photos, or both.
3. The iOS share sheet appears. Tap **Save to Files** and pick a folder — on the iPad, iCloud Drive, pCloud, or a network share — or pick any other destination. Avoid **Save Images**, which puts the photos in the iPad's Photos library.

A single photo can also be exported from the full-screen viewer.

Filenames match the desktop tool, and photos extend the same name with their position and label:

```
ExtremitySetup_PatientName_2026-05-11.pdf
ExtremitySetup_PatientName_2026-05-11_Photo-01_Left-lateral.jpg
ExtremitySetup_PatientName_2026-05-11_Photo-02.jpg
```

### Saving to a network folder

The iPad's Files app can save straight to an SMB network share. Set it up once per iPad: open **Files → Browse → ⋯ → Connect to Server**, enter the server address (e.g. `smb://server/share`) and sign in. The server then appears as a location whenever you tap **Save to Files**.

### Freeing up space

Photos take far more space than PDFs. **Settings → Storage** shows how much the photos use and has **Delete photos from archived sheets**, which removes photos (not the sheets) from sheets you've archived — use it once the photos have been exported to their permanent home.

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
├── letterhead.jpg              DGROC letterhead for the Scan Checklist page
└── templates/                  The 3 blank PDF templates (copied verbatim from the desktop app)
scripts/
├── app.js                      Entry point, route registrations
├── router.js                   Hash-based router
├── storage.js                  IndexedDB wrapper (records, PDFs, photos, labels, therapists, settings)
├── share.js                    Web Share API helper for PDF / photo export
├── exportFiles.js              Export filenames + the Export dialog (PDF and photos)
├── draft.js                    Draft persistence for unfinished sheets
├── setupSheetLanding.js        Landing screen (3 sheet cards)
├── setupSheetForm.js           Form renderer + PDF stamping (pdf-lib)
├── scanChecklists.js           Scan checklist wording (sites, final checks, details)
├── checklistState.js           Scan checklist state: drafts, records, progress, warnings
├── checklistSection.js         Scan checklist tab, site picker and its dialogs
├── checklistPdf.js             Scan Checklist page(s) in the PDF
├── photoGallery.js             Photos section of a sheet (add, label, grid)
├── photoViewer.js              Full-screen photo viewer (swipe, zoom)
├── photos.js                   Photo import: JPEG conversion + thumbnails
├── setupSheetHistory.js        History list
├── therapistsPanel.js          Therapist list editor
├── listEditorPanel.js          Shared editor for ordered name lists
├── photoLabelsPanel.js         Photo label list editor
├── oncologistsPanel.js         Radiation oncologist list editor
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

## Updating the scan checklist wording

All checklist wording lives in `scripts/scanChecklists.js`, typed in word for word from the departmental "Radiotherapy planning scan – Scanner checklist" document. Only Breast, Head and neck and Pelvis have an Escalate warning in that document, so the other sites have none.

1. Edit the wording there. Give any new item a new id; never reuse an old id for a different item.
2. Bump `CHECKLIST_VERSION` in the same file.
3. Bump `CACHE_VERSION` in `service-worker.js` and push.

Completed sheets keep a copy of the wording they were completed with, so their checklist and PDF never change.

## Known iOS limitations

- **No silent writes to Files.** Exporting always goes through the iOS share sheet (one tap). This is an iOS PWA restriction, not something the app can change.
- **No access to the Photos library beyond the picker.** The app can't delete photos from the Photos library after attaching them, and can't import photos without you choosing them.
- **localStorage and IndexedDB are per-origin.** All data is tied to the GitHub Pages URL. If you change hosts, the iPad starts fresh.
- **Deleting the Home Screen app deletes its data**, including photos that haven't been exported.
- **Web Share API requires iOS 15+.** Older iPads fall back to a download link.
