/**
 * IndexedDB wrapper. Three stores: records, therapists, settings.
 *
 * records:    keyed by id ("YYYYMMDD-HHMMSS-xxxx") — matches desktop format.
 *             Each row holds the form JSON + the rendered PDF as a Blob.
 * therapists: keyed by uuid. Editable list shown in the completion picker.
 * settings:   key/value bag (default therapist id, etc.)
 */

const DB_NAME = "dgroc-setup-sheets";
const DB_VERSION = 1;

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(storeName, mode = "readonly") {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
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

/* ---- records ---- */

async function saveRecord(sheetId, formData, pdfBlob) {
  const store = await tx("records", "readwrite");
  let id = generateId();
  while (await reqAsPromise(store.get(id))) id = generateId();
  const record = {
    ...formData,
    id,
    sheetId,
    status: "completed",
    pdfBlob,
  };
  await reqAsPromise(store.add(record));
  return { ok: true, id };
}

async function updateRecord(id, formData, pdfBlob, editor) {
  const store = await tx("records", "readwrite");
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
    completedBy: prev.completedBy || formData.completedBy || editor?.name || "",
    completedAt: prev.completedAt || formData.completedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editHistory: history,
    pdfBlob,
  };
  await reqAsPromise(store.put(next));
  return { ok: true, id };
}

async function listRecords(sheetId) {
  const store = await tx("records");
  const all = await reqAsPromise(store.getAll());
  const out = all
    .filter((r) => !sheetId || r.sheetId === sheetId)
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
    }));
  out.sort((a, b) =>
    (b.updatedAt || b.completedAt || "").localeCompare(a.updatedAt || a.completedAt || "")
  );
  return out;
}

async function getRecord(id) {
  const store = await tx("records");
  return reqAsPromise(store.get(id));
}

async function deleteRecord(id) {
  const store = await tx("records", "readwrite");
  await reqAsPromise(store.delete(id));
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
  records: { save: saveRecord, update: updateRecord, list: listRecords, get: getRecord, remove: deleteRecord },
  therapists: { list: listTherapists, add: addTherapist, rename: renameTherapist, remove: removeTherapist },
  settings: { get: getSetting, set: setSetting },
  generateId,
};
