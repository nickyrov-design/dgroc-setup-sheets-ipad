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

function start() {
  window.addEventListener("hashchange", dispatch);
  dispatch();
}

export default { register, navigate, start };
