/**
 * IndexedDB wrapper. Seven stores: records, pdfs, therapists, settings, photos,
 * photoBlobs, photoLabels.
 *
 * Rows that get rewritten hold no Blobs: iOS Safari often fails to store a
 * Blob that was read back out of IndexedDB ("Error preparing Blob/File data to
 * be stored in object store", WebKit bugs 235687 / 240216).
 *
 * records:     keyed by id ("YYYYMMDD-HHMMSS-xxxx") — matches desktop format.
 *              Each row holds the form JSON. Rewritten when archiving.
 * pdfs:        keyed by record id. The rendered PDF as a Blob, kept out of
 *              `records` so archiving never rewrites it. Only ever written
 *              with a freshly made PDF.
 * therapists:  keyed by uuid. Editable list shown in the completion picker.
 * settings:    key/value bag (default therapist id, etc.)
 * photos:      keyed by uuid. Photo metadata + a small JPEG thumbnail, kept as
 *              an ArrayBuffer rather than a Blob because these rows are
 *              rewritten (filing a draft, labelling). `owner` (indexed) is
 *              "draft:<sheetId>" while the sheet is still a draft and
 *              "record:<recordId>" once it has been filed.
 * photoBlobs:  keyed by the photo's uuid. The full-size JPEG, kept out of
 *              `photos` so listing, labelling and re-homing photos never
 *              rewrites image data.
 * photoLabels: keyed by uuid. Editable quick-pick labels for photos, in `order`.
 */

const DB_NAME = "dgroc-setup-sheets";
const DB_VERSION = 4;

/* Seeded when the photoLabels store is created; editable in Settings. */
const DEFAULT_PHOTO_LABELS = [
  "Anterior", "Left lateral", "Right lateral", "Superior", "Inferior", "Tattoos", "Immobilisation",
];

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const txn = e.target.transaction;
      if (!db.objectStoreNames.contains("records")) {
        const store = db.createObjectStore("records", { keyPath: "id" });
        store.createIndex("sheetId", "sheetId", { unique: false });
      }
      if (!db.objectStoreNames.contains("therapists")) {
        db.createObjectStore("therapists", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
      /* v1 -> v2: backfill archived:false on existing records. */
      if (e.oldVersion < 2 && txn) {
        const store = txn.objectStore("records");
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (ev) => {
          const cursor = ev.target.result;
          if (!cursor) return;
          const rec = cursor.value;
          if (typeof rec.archived !== "boolean") {
            rec.archived = false;
            cursor.update(rec);
          }
          cursor.continue();
        };
      }
      /* v2 -> v3: photo attachments and their label list. */
      if (!db.objectStoreNames.contains("photos")) {
        const photos = db.createObjectStore("photos", { keyPath: "id" });
        photos.createIndex("owner", "owner", { unique: false });
      }
      if (!db.objectStoreNames.contains("photoBlobs")) {
        db.createObjectStore("photoBlobs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("photoLabels")) {
        const labels = db.createObjectStore("photoLabels", { keyPath: "id" });
        DEFAULT_PHOTO_LABELS.forEach((name, order) => labels.add({ id: uuid(), name, order }));
      }
      /* v3 -> v4: PDFs get their own store (existing ones moved by moveLegacyPdfs). */
      if (!db.objectStoreNames.contains("pdfs")) {
        db.createObjectStore("pdfs", { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      /* Don't block a schema upgrade or "Wipe all app data" from another
         connection — close this one and reopen on next use. */
      db.onversionchange = () => {
        db.close();
        _dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  }).then(async (db) => {
    await convertLegacyThumbs(db);
    await moveLegacyPdfs(db);
    return db;
  });
  return _dbPromise;
}

/* Settings key set once every photo's thumbnail is stored as bytes. */
const THUMBS_AS_BYTES = "photoThumbsAsBytes";

/* Photos added before thumbnails were kept as bytes hold them as Blobs. Rewrite
   those rows once, before anything else uses the database, so filing a draft
   or labelling a photo never puts a Blob from IndexedDB back into it. Never
   stops the app opening: a failure is logged and retried on the next launch. */
async function convertLegacyThumbs(db) {
  try {
    const done = await reqAsPromise(db.transaction("settings").objectStore("settings").get(THUMBS_AS_BYTES));
    if (done?.value) return;
    const rows = await reqAsPromise(db.transaction("photos").objectStore("photos").getAll());
    const converted = [];
    let failed = 0;
    for (const p of rows) {
      if (!(p.thumb instanceof Blob)) continue;
      try {
        converted.push({ ...p, thumb: await p.thumb.arrayBuffer() });
      } catch (err) {
        console.error(`Could not read the thumbnail of photo ${p.id}:`, err);
        failed++;
      }
    }
    const t = db.transaction(["photos", "settings"], "readwrite");
    for (const p of converted) t.objectStore("photos").put(p);
    if (!failed) t.objectStore("settings").put({ key: THUMBS_AS_BYTES, value: true });
    await txDone(t);
  } catch (err) {
    console.error("Could not convert photo thumbnails:", err);
  }
}

/* Settings key set once no record holds its own PDF. */
const PDFS_MOVED = "pdfsInOwnStore";

/* Records saved before v4 hold their PDF as a Blob, so archiving one rewrote a
   Blob read out of IndexedDB. Move each PDF into `pdfs` once, as a new Blob
   made from its bytes, one record per transaction so an interrupted run
   carries on where it stopped. Like convertLegacyThumbs, never stops the app
   opening. */
async function moveLegacyPdfs(db) {
  try {
    const done = await reqAsPromise(db.transaction("settings").objectStore("settings").get(PDFS_MOVED));
    if (done?.value) return;
    const records = await reqAsPromise(db.transaction("records").objectStore("records").getAll());
    let failed = 0;
    for (const rec of records) {
      if (!("pdfBlob" in rec)) continue;
      const { pdfBlob, ...rest } = rec;
      try {
        const pdf = pdfBlob ? new Blob([await pdfBlob.arrayBuffer()], { type: "application/pdf" }) : null;
        const t = db.transaction(["records", "pdfs"], "readwrite");
        if (pdf) t.objectStore("pdfs").put({ id: rec.id, blob: pdf });
        t.objectStore("records").put(rest);
        await txDone(t);
      } catch (err) {
        console.error(`Could not move the PDF of record ${rec.id}:`, err);
        failed++;
      }
    }
    if (!failed) {
      await reqAsPromise(db.transaction("settings", "readwrite").objectStore("settings").put({ key: PDFS_MOVED, value: true }));
    }
  } catch (err) {
    console.error("Could not move PDFs out of records:", err);
  }
}

function tx(storeName, mode = "readonly") {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

/* A transaction spanning several stores, for writes that must land together. */
function txStores(storeNames, mode = "readonly") {
  return openDb().then((db) => db.transaction(storeNames, mode));
}

function txDone(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = (e) => reject(e.target.error || t.error);
    t.onabort = () => reject(t.error || new DOMException("Transaction aborted.", "AbortError"));
  });
}

function reqAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function generateId() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return `${date}-${time}-${rand}`;
}

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const photoOwner = {
  draft: (sheetId) => `draft:${sheetId}`,
  record: (recordId) => `record:${recordId}`,
};

/* ---- records ---- */

async function saveRecord(sheetId, formData, pdfBlob) {
  const t = await txStores(["records", "pdfs", "photos"], "readwrite");
  const store = t.objectStore("records");
  let id = generateId();
  while (await reqAsPromise(store.get(id))) id = generateId();
  const record = {
    ...formData,
    id,
    sheetId,
    status: "completed",
    archived: false,
  };
  store.add(record);
  t.objectStore("pdfs").put({ id, blob: pdfBlob });
  /* Photos attached while this sheet was a draft move onto the filed record in
     the same transaction, so they can never be left behind on the draft. */
  const photos = t.objectStore("photos");
  const drafted = await reqAsPromise(photos.index("owner").getAll(photoOwner.draft(sheetId)));
  for (const p of drafted) photos.put({ ...p, owner: photoOwner.record(id) });
  await txDone(t);
  return { ok: true, id };
}

async function updateRecord(id, formData, pdfBlob, editor) {
  const t = await txStores(["records", "pdfs"], "readwrite");
  const store = t.objectStore("records");
  const prev = await reqAsPromise(store.get(id));
  if (!prev) return { ok: false, error: "Set-up sheet not found." };

  const history = Array.isArray(prev.editHistory) ? prev.editHistory.slice() : [];
  if (editor?.name) {
    history.push({
      name: editor.name,
      userId: editor.userId || null,
      at: editor.at || new Date().toISOString(),
    });
  }

  const next = {
    ...formData,
    id,
    sheetId: prev.sheetId,
    status: "completed",
    archived: typeof prev.archived === "boolean" ? prev.archived : false,
    archivedAt: prev.archivedAt || null,
    completedBy: prev.completedBy || formData.completedBy || editor?.name || "",
    completedAt: prev.completedAt || formData.completedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editHistory: history,
  };
  store.put(next);
  t.objectStore("pdfs").put({ id, blob: pdfBlob });
  await txDone(t);
  return { ok: true, id };
}

async function listRecords(sheetId, opts = {}) {
  const { includeArchived = false, archivedOnly = false } = opts;
  const store = await tx("records");
  const all = await reqAsPromise(store.getAll());
  const out = all
    .filter((r) => !sheetId || r.sheetId === sheetId)
    .filter((r) => {
      const archived = !!r.archived;
      if (archivedOnly) return archived;
      if (includeArchived) return true;
      return !archived;
    })
    .map((r) => ({
      id: r.id,
      sheetId: r.sheetId,
      patientName: r.patientName || "",
      patientId: r.patientId || "",
      scanDate: r.scanDate || "",
      radiotherapist: r.radiotherapist || "",
      linac: r.linac || "",
      completedBy: r.completedBy || "",
      completedAt: r.completedAt || "",
      updatedAt: r.updatedAt || "",
      editCount: Array.isArray(r.editHistory) ? r.editHistory.length : 0,
      archived: !!r.archived,
      archivedAt: r.archivedAt || "",
    }));
  out.sort((a, b) =>
    (b.updatedAt || b.completedAt || "").localeCompare(a.updatedAt || a.completedAt || "")
  );
  return out;
}

async function countArchived(sheetId) {
  const archived = await listRecords(sheetId, { archivedOnly: true });
  return archived.length;
}

async function setArchived(id, archived) {
  const store = await tx("records", "readwrite");
  const cur = await reqAsPromise(store.get(id));
  if (!cur) return { ok: false, error: "Record not found." };
  const next = {
    ...cur,
    archived: !!archived,
    archivedAt: archived ? new Date().toISOString() : null,
  };
  await reqAsPromise(store.put(next));
  return { ok: true };
}

async function archiveOlderThan(isoCutoff) {
  const store = await tx("records", "readwrite");
  const all = await reqAsPromise(store.getAll());
  let updated = 0;
  for (const r of all) {
    if (r.archived) continue;
    const stamp = r.updatedAt || r.completedAt || "";
    if (stamp && stamp < isoCutoff) {
      const next = { ...r, archived: true, archivedAt: new Date().toISOString() };
      await reqAsPromise(store.put(next));
      updated++;
    }
  }
  return { ok: true, archived: updated };
}

async function countOlderThan(isoCutoff) {
  const store = await tx("records");
  const all = await reqAsPromise(store.getAll());
  let n = 0;
  for (const r of all) {
    if (r.archived) continue;
    const stamp = r.updatedAt || r.completedAt || "";
    if (stamp && stamp < isoCutoff) n++;
  }
  return n;
}

/* The record with its PDF as `pdfBlob`. Read-only: never write it back. */
async function getRecord(id) {
  const t = await txStores(["records", "pdfs"]);
  const [record, pdf] = await Promise.all([
    reqAsPromise(t.objectStore("records").get(id)),
    reqAsPromise(t.objectStore("pdfs").get(id)),
  ]);
  /* A record whose PDF couldn't be moved yet still carries its own. */
  return record && pdf ? { ...record, pdfBlob: pdf.blob } : record;
}

async function deleteRecord(id) {
  const t = await txStores(["records", "pdfs", "photos", "photoBlobs"], "readwrite");
  t.objectStore("records").delete(id);
  t.objectStore("pdfs").delete(id);
  await queuePhotoDeletes(t, photoOwner.record(id));
  await txDone(t);
  return { ok: true };
}

/* ---- photos ---- */

/* Queues deletion of every photo under `owner` in an open photos + photoBlobs
   transaction. Resolves to the number of photos queued. */
async function queuePhotoDeletes(t, owner) {
  const photos = t.objectStore("photos");
  const blobs = t.objectStore("photoBlobs");
  const ids = await reqAsPromise(photos.index("owner").getAllKeys(owner));
  for (const id of ids) {
    photos.delete(id);
    blobs.delete(id);
  }
  return ids.length;
}

/* Sort key for photos: add order, unique even within one multi-photo import. */
let _lastPhotoStamp = 0;
function nextPhotoStamp() {
  _lastPhotoStamp = Math.max(Date.now(), _lastPhotoStamp + 1);
  return _lastPhotoStamp;
}

/* `image` is the output of processPhotoFile(): { blob, thumb, width, height }.
   The thumbnail is stored as bytes (see the photos store above). */
async function addPhoto(owner, image) {
  /* Read before the transaction opens — awaiting anything but IndexedDB inside
     one lets it commit early. */
  const thumb = await image.thumb.arrayBuffer();
  const t = await txStores(["photos", "photoBlobs"], "readwrite");
  const photo = {
    id: uuid(),
    owner,
    label: "",
    width: image.width,
    height: image.height,
    size: image.blob.size,
    thumb,
    thumbSize: thumb.byteLength,
    createdAt: nextPhotoStamp(),
    addedAt: new Date().toISOString(),
  };
  t.objectStore("photos").add(photo);
  t.objectStore("photoBlobs").add({ id: photo.id, blob: image.blob });
  await txDone(t);
  return { ok: true, photo };
}

/* Photo metadata (with thumbnail bytes) for one owner, in the order added. */
async function listPhotos(owner) {
  const store = await tx("photos");
  const rows = await reqAsPromise(store.index("owner").getAll(owner));
  rows.sort((a, b) => a.createdAt - b.createdAt);
  return rows;
}

/* Full-size JPEG Blobs for the given photo ids, in the same order (null if missing). */
async function getPhotoBlobs(ids) {
  const store = await tx("photoBlobs");
  const rows = await Promise.all(ids.map((id) => reqAsPromise(store.get(id))));
  return rows.map((row) => row?.blob || null);
}

async function setPhotoLabel(id, label) {
  const store = await tx("photos", "readwrite");
  const cur = await reqAsPromise(store.get(id));
  if (!cur) return { ok: false, error: "Photo not found." };
  const next = { ...cur, label: String(label || "").trim() };
  await reqAsPromise(store.put(next));
  return { ok: true, photo: next };
}

async function removePhoto(id) {
  const t = await txStores(["photos", "photoBlobs"], "readwrite");
  t.objectStore("photos").delete(id);
  t.objectStore("photoBlobs").delete(id);
  await txDone(t);
  return { ok: true };
}

/* Deletes every photo under one owner, or under each owner in an array. */
async function removePhotosByOwner(owners) {
  const list = Array.isArray(owners) ? owners : [owners];
  const t = await txStores(["photos", "photoBlobs"], "readwrite");
  let removed = 0;
  for (const owner of list) removed += await queuePhotoDeletes(t, owner);
  await txDone(t);
  return { ok: true, removed };
}

async function removeArchivedPhotos() {
  const archived = await listRecords(undefined, { archivedOnly: true });
  if (!archived.length) return { ok: true, removed: 0 };
  return removePhotosByOwner(archived.map((r) => photoOwner.record(r.id)));
}

/* Map of owner -> photo count, read from the index alone (no image data). */
async function countPhotosByOwner() {
  const store = await tx("photos");
  const counts = new Map();
  await new Promise((resolve, reject) => {
    const req = store.index("owner").openKeyCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(); return; }
      counts.set(cursor.key, (counts.get(cursor.key) || 0) + 1);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
  return counts;
}

async function photoStats() {
  const store = await tx("photos");
  const rows = await reqAsPromise(store.getAll());
  let bytes = 0;
  for (const p of rows) bytes += (p.size || 0) + (p.thumbSize || 0);
  return { count: rows.length, bytes };
}

/* ---- photo labels ---- */

async function listPhotoLabels() {
  const store = await tx("photoLabels");
  const all = await reqAsPromise(store.getAll());
  all.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return all;
}

async function addPhotoLabel(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return { ok: false, error: "Label required." };
  const all = await listPhotoLabels();
  if (all.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, error: "That label is already in the list." };
  }
  const order = all.length ? (all[all.length - 1].order ?? all.length - 1) + 1 : 0;
  const store = await tx("photoLabels", "readwrite");
  const id = uuid();
  await reqAsPromise(store.add({ id, name: trimmed, order }));
  return { ok: true, id };
}

async function renamePhotoLabel(id, name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return { ok: false, error: "Label required." };
  const store = await tx("photoLabels", "readwrite");
  const cur = await reqAsPromise(store.get(id));
  if (!cur) return { ok: false, error: "Label not found." };
  await reqAsPromise(store.put({ ...cur, name: trimmed }));
  return { ok: true };
}

async function removePhotoLabel(id) {
  const store = await tx("photoLabels", "readwrite");
  await reqAsPromise(store.delete(id));
  return { ok: true };
}

/* Swaps a label with its neighbour (delta -1 = up, +1 = down) and renumbers the list. */
async function movePhotoLabel(id, delta) {
  const all = await listPhotoLabels();
  const i = all.findIndex((l) => l.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= all.length) return { ok: false, error: "Label can't move further." };
  [all[i], all[j]] = [all[j], all[i]];
  const store = await tx("photoLabels", "readwrite");
  await Promise.all(all.map((l, order) => reqAsPromise(store.put({ ...l, order }))));
  return { ok: true };
}

/* ---- therapists ---- */

async function listTherapists() {
  const store = await tx("therapists");
  const all = await reqAsPromise(store.getAll());
  all.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return all;
}

async function addTherapist(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return { ok: false, error: "Name required." };
  const store = await tx("therapists", "readwrite");
  const id = uuid();
  await reqAsPromise(store.add({ id, name: trimmed }));
  return { ok: true, id };
}

async function renameTherapist(id, name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return { ok: false, error: "Name required." };
  const store = await tx("therapists", "readwrite");
  const cur = await reqAsPromise(store.get(id));
  if (!cur) return { ok: false, error: "Therapist not found." };
  await reqAsPromise(store.put({ ...cur, name: trimmed }));
  return { ok: true };
}

async function removeTherapist(id) {
  const store = await tx("therapists", "readwrite");
  await reqAsPromise(store.delete(id));
  /* If this was the default, clear it. */
  const def = await getSetting("defaultTherapistId");
  if (def === id) await setSetting("defaultTherapistId", null);
  return { ok: true };
}

/* ---- settings ---- */

async function getSetting(key) {
  const store = await tx("settings");
  const row = await reqAsPromise(store.get(key));
  return row ? row.value : undefined;
}

async function setSetting(key, value) {
  const store = await tx("settings", "readwrite");
  await reqAsPromise(store.put({ key, value }));
  return { ok: true };
}

export default {
  records: {
    save: saveRecord,
    update: updateRecord,
    list: listRecords,
    get: getRecord,
    remove: deleteRecord,
    setArchived,
    countArchived,
    archiveOlderThan,
    countOlderThan,
  },
  photos: {
    owner: photoOwner,
    add: addPhoto,
    list: listPhotos,
    getBlobs: getPhotoBlobs,
    setLabel: setPhotoLabel,
    remove: removePhoto,
    removeByOwner: removePhotosByOwner,
    removeArchived: removeArchivedPhotos,
    countByOwner: countPhotosByOwner,
    stats: photoStats,
  },
  photoLabels: {
    list: listPhotoLabels,
    add: addPhotoLabel,
    rename: renamePhotoLabel,
    remove: removePhotoLabel,
    move: movePhotoLabel,
  },
  therapists: { list: listTherapists, add: addTherapist, rename: renameTherapist, remove: removeTherapist },
  settings: { get: getSetting, set: setSetting },
  generateId,
};
