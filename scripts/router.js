/**
 * Tiny hash-based router. Patterns supported:
 *   #/                            -> landing
 *   #/form/<sheetId>              -> new form
 *   #/form/<sheetId>/<recordId>   -> existing form (view mode)
 *   #/history                     -> history list
 *   #/history/<sheetId>           -> history filtered by sheet
 *   #/settings                    -> settings screen
 *   #/therapists                  -> therapist list editor
 */

const routes = [];

/**
 * Optional navigation guard. A mounted screen (currently the set-up sheet form)
 * registers a function that is consulted before the app leaves it via a tap on
 * an in-app link (History, Settings, the logo, etc.). The guard receives the
 * target hash and resolves to one of:
 *   "proceed"  — allow navigation to the target
 *   "stay"     — cancel navigation, keep the current screen
 *   "handled"  — the guard performed its own navigation; do nothing further
 */
let _guard = null;

function setGuard(fn) { _guard = fn; }
function clearGuard() { _guard = null; }

function register(pattern, handler) {
  routes.push({ pattern, handler });
}

function match(hash) {
  const path = (hash || "").replace(/^#/, "") || "/";
  for (const { pattern, handler } of routes) {
    const result = matchPattern(pattern, path);
    if (result) return { handler, params: result };
  }
  return null;
}

function matchPattern(pattern, path) {
  const p = pattern.split("/").filter(Boolean);
  const u = path.split("/").filter(Boolean);
  if (p.length !== u.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) {
      params[p[i].slice(1)] = decodeURIComponent(u[i]);
    } else if (p[i] !== u[i]) {
      return null;
    }
  }
  return params;
}

function navigate(path) {
  const target = path.startsWith("#") ? path : `#${path}`;
  if (location.hash === target) {
    dispatch();
  } else {
    location.hash = target;
  }
}

function dispatch() {
  /* Any guard belonged to the screen we are leaving; a new screen re-registers
     its own on mount. Clearing here keeps a stale guard from firing on the
     next page. */
  clearGuard();
  /* The header Save button belongs to the sheet form; hide it on every
     navigation. The form re-shows it when a fillable sheet mounts. */
  const headerSave = document.getElementById("header-save-btn");
  if (headerSave) headerSave.hidden = true;
  const result = match(location.hash);
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = "";
  if (result) {
    result.handler(app, result.params);
  } else {
    app.innerHTML = `<div class="page-error">Page not found.</div>`;
  }
  updateNavHighlight();
}

function updateNavHighlight() {
  const route = (location.hash || "#/").replace(/^#\//, "").split("/")[0];
  document.querySelectorAll("[data-route]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.route === route);
  });
}

/**
 * Capture-phase click handler. When a guard is active and the user taps an
 * in-app hash link, ask the guard first instead of navigating immediately.
 */
function onDocumentClick(e) {
  if (!_guard) return;
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

  const start = e.target instanceof Element ? e.target : e.target?.parentElement;
  const link = start?.closest?.('a[href^="#"]');
  if (!link) return;

  const target = link.getAttribute("href");
  if (!target || target === location.hash) return;

  e.preventDefault();
  e.stopPropagation();

  const guard = _guard;
  Promise.resolve(guard(target)).then((decision) => {
    if (decision === "proceed") {
      _guard = null;
      navigate(target);
    }
    /* "handled": the guard navigated itself. "stay": remain on the screen. */
  });
}

function start() {
  document.addEventListener("click", onDocumentClick, true);
  window.addEventListener("hashchange", dispatch);
  dispatch();
}

export default { register, navigate, start, setGuard, clearGuard };
