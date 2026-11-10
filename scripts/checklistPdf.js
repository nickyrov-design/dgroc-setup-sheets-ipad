/**
 * Scan checklist page(s) appended to a set-up sheet's PDF, drawn with pdf-lib.
 *
 *   DGROC letterhead, "Scan Checklist", "Site: <site>"
 *   Patient and scan details
 *   <Site> checklist, with its Escalate warning above the items
 *   Final checks (two columns)
 *   Important note, and a footer on every page
 *
 * A compact A4 layout: every site fits on one page. Anything that doesn't
 * (e.g. very long comments) carries on to a continuation page.
 *
 * Standard PDF fonts only cover WinAnsi characters, so ticks and boxes are
 * drawn as lines and any other character is printed as "?".
 */

import { FINAL_CHECKS, DETAIL_LABELS, IMPORTANT_NOTE } from "./scanChecklists.js";
import { readChecklistState, checklistModel, siteLabel } from "./checklistState.js";

const W = 595.28;
const H = 841.89;
const M = 36;
const BOTTOM = H - M - 16; /* lowest content line, measured from the top */

const LETTERHEAD_URL = "./assets/letterhead.jpg";
const LETTERHEAD_WIDTH = 370;

const ROW_SIZE = 8.3;   /* checklist item text */
const ROW_H = 11.6;     /* one-line row */
const LINE_H = 10;      /* each extra wrapped line */
const FINAL_SIZE = 7.8; /* final checks, two columns */

let _letterhead = null;

function letterheadBytes() {
  if (!_letterhead) {
    _letterhead = fetch(LETTERHEAD_URL).then((r) => {
      if (!r.ok) throw new Error(`Letterhead not available (${r.status}).`);
      return r.arrayBuffer();
    });
    _letterhead.catch(() => { _letterhead = null; });
  }
  return _letterhead;
}

function formatDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatStamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).replace(",", "");
}

/**
 * Adds the checklist page(s) to `pdfDoc`.
 *   checklist  the checklist as saved on the record (toRecordChecklist)
 *   sheet      the set-up sheet values (patientName, patientId, scanDate, radiotherapist)
 *   meta       { completedBy, completedAt, editedBy?, editedAt? }
 */
export async function appendChecklistPages(pdfDoc, { checklist, sheet = {}, meta = {} }) {
  const { rgb, StandardFonts } = window.PDFLib;
  const state = readChecklistState(checklist);
  if (!state?.enabled) return;
  const model = checklistModel(state);
  const label = siteLabel(state, model) || "Not chosen";

  const C = {
    navy: rgb(0.106, 0.165, 0.373),
    blue: rgb(0.18, 0.33, 0.59),
    grey: rgb(0.42, 0.42, 0.42),
    line: rgb(0.75, 0.78, 0.85),
    headBg: rgb(0.91, 0.93, 0.97),
    amber: rgb(0.8, 0.45, 0),
    amberBg: rgb(1, 0.95, 0.85),
    amberText: rgb(0.2, 0.12, 0),
    black: rgb(0, 0, 0),
  };

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try {
    logo = await pdfDoc.embedJpg(await letterheadBytes());
  } catch (err) {
    console.error("Scan checklist printed without the letterhead:", err);
  }

  const charset = new Set(font.getCharacterSet());
  const clean = (s) => Array.from(String(s ?? "").replace(/\t/g, " "))
    .map((ch) => (charset.has(ch.codePointAt(0)) ? ch : "?"))
    .join("");

  /* Splits text into lines no wider than maxW (paragraphs kept; over-long
     words broken). `firstW` is the width of the first line, if different. */
  function wrap(text, maxW, size, f = font, firstW = maxW) {
    const out = [];
    const width = () => (out.length === 0 ? firstW : maxW);
    const fits = (s) => f.widthOfTextAtSize(s, size) <= width();
    const paras = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map(clean);
    for (const para of paras) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { if (paras.length > 1) out.push(""); continue; }
      let line = "";
      for (let w of words) {
        const candidate = line ? `${line} ${w}` : w;
        if (fits(candidate)) { line = candidate; continue; }
        if (line) { out.push(line); line = ""; }
        /* A single word wider than a whole line: break it. */
        while (!fits(w)) {
          let cut = w.length - 1;
          while (cut > 1 && !fits(w.slice(0, cut))) cut--;
          out.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        line = w;
      }
      if (line) out.push(line);
    }
    return out.length ? out : [""];
  }

  /* Shrinks text down to 7pt to fit maxW, then cuts it short with "...". */
  function fit(text, maxW, size, f = font) {
    let s = clean(text);
    let sz = size;
    while (sz > 7 && f.widthOfTextAtSize(s, sz) > maxW) sz -= 0.25;
    if (f.widthOfTextAtSize(s, sz) > maxW) {
      while (s.length > 1 && f.widthOfTextAtSize(`${s}…`, sz) > maxW) s = s.slice(0, -1);
      s = `${s.trimEnd()}…`;
    }
    return { text: s, size: sz };
  }

  const pages = [];
  let page = null;
  let y = 0; /* distance from the top of the page */

  const text = (s, x, top, size, f = font, color = C.black) => {
    const str = clean(s);
    if (str) page.drawText(str, { x, y: H - top, size, font: f, color });
  };
  const hline = (x1, x2, top, color = C.line, thickness = 0.4) => {
    page.drawLine({ start: { x: x1, y: H - top }, end: { x: x2, y: H - top }, thickness, color });
  };
  const rect = (x, top, w, h, opts) => {
    page.drawRectangle({ x, y: H - top - h, width: w, height: h, ...opts });
  };
  const tickMark = (x, base, color = C.navy) => {
    const p = (dx, dy) => ({ x: x + dx, y: H - (base + dy) });
    page.drawLine({ start: p(1.8, -4), end: p(3.8, -1.6), thickness: 1.3, color });
    page.drawLine({ start: p(3.8, -1.6), end: p(7.6, -7), thickness: 1.3, color });
  };
  /* Done: box with a tick. N/A: "N/A". Not answered: empty box. */
  const answerMark = (x, base, answer) => {
    if (answer === "na") {
      text("N/A", x - 1, base - 0.5, 7, bold, C.grey);
      return;
    }
    rect(x, base - 8.5, 9, 9, { borderColor: C.grey, borderWidth: 0.6 });
    if (answer === "done") tickMark(x, base);
  };

  const patientText = [sheet.patientName, sheet.patientId]
    .map((v) => String(v || "").trim()).filter(Boolean).join(" / ");

  function newPage(first) {
    page = pdfDoc.addPage([W, H]);
    pages.push(page);
    if (first) {
      let top = M;
      if (logo) {
        const lh = LETTERHEAD_WIDTH * logo.height / logo.width;
        page.drawImage(logo, { x: (W - LETTERHEAD_WIDTH) / 2, y: H - top - lh, width: LETTERHEAD_WIDTH, height: lh });
        top += lh;
      }
      y = top + 22;
      text("Scan Checklist", M, y, 18, bold, C.navy);
      y += 17;
      text(`Site: ${label}`, M, y, 12, font, C.blue);
      y += 12;
    } else {
      const right = fit(patientText, 200, 9);
      text(right.text, W - M - font.widthOfTextAtSize(right.text, right.size), M + 10, right.size, font, C.grey);
      const head = fit(`Scan Checklist – Site: ${label} (continued)`, W - 2 * M - 210, 10, bold);
      text(head.text, M, M + 10, head.size, bold, C.navy);
      y = M + 24;
    }
  }

  /* Starts a new page unless `h` more points fit on this one. */
  function ensure(h) {
    if (y + h > BOTTOM) { newPage(false); return true; }
    return false;
  }

  /* `keep`: room needed below the heading, so it never ends a page alone. */
  function heading(title, sub, keep = 0) {
    ensure((sub ? 28 : 17) + keep);
    y += 12;
    text(title, M, y, 11, bold, C.navy);
    if (sub) {
      y += 11;
      text(sub, M, y, 8, font, C.grey);
    }
    y += 5;
  }

  /* ---- Patient and scan details ---- */

  function details() {
    heading("Patient and scan details", "", 32);
    const colW = (W - 2 * M) / 2;
    const pairs = [
      [DETAIL_LABELS.patient, patientText],
      [DETAIL_LABELS.site, label],
      [DETAIL_LABELS.oncologist, state.details.oncologist],
      [DETAIL_LABELS.scanDate, formatDate(String(sheet.scanDate || "").trim())],
      [DETAIL_LABELS.performedBy, String(sheet.radiotherapist || "").trim()],
      [DETAIL_LABELS.reviewedBy, state.details.reviewedBy],
    ];
    for (let i = 0; i < pairs.length; i += 2) {
      ensure(16);
      pairs.slice(i, i + 2).forEach(([lab, val], k) => {
        const x = M + k * colW;
        const l = `${lab}:`;
        text(l, x + 2, y + 10, 8, bold, C.navy);
        const vx = x + 2 + bold.widthOfTextAtSize(l, 8) + 5;
        const v = fit(val, x + colW - 8 - vx, 9);
        text(v.text, vx, y + 10, v.size);
        hline(x, x + colW - 8, y + 14);
      });
      y += 16;
    }

    /* Outstanding queries / comments: full width, wraps, may run on. */
    const l = `${DETAIL_LABELS.comments}:`;
    const vx = M + 2 + bold.widthOfTextAtSize(l, 8) + 8;
    const lines = wrap(state.details.comments, W - M - 8 - vx, 9);
    ensure(22);
    text(l, M + 2, y + 10, 8, bold, C.navy);
    lines.forEach((line, j) => {
      if (j > 0) ensure(11); /* very long comments carry on to the next page */
      text(line, vx, y + 10, 9);
      y += 11;
    });
    hline(M, W - M - 8, y + 4);
    y += 10;
  }

  /* ---- Site checklist ---- */

  function escalateBox(msg) {
    const lines = wrap(msg, W - 2 * M - 74, 8.5);
    const h = 9 + lines.length * 10.5;
    ensure(h + 8);
    const top = y + 4;
    rect(M, top, W - 2 * M, h, { color: C.amberBg, borderColor: C.amber, borderWidth: 1 });
    rect(M, top, 4, h, { color: C.amber });
    text("ESCALATE", M + 10, top + 13, 9, bold, C.amber);
    lines.forEach((line, j) => text(line, M + 68, top + 13 + j * 10.5, 8.5, font, C.amberText));
    y = top + h + 5;
  }

  function siteTable(items) {
    const xCat = M + 4;
    const catW = 114;
    const xItem = xCat + catW;
    const xDone = W - M - 28;
    const header = () => {
      rect(M, y, W - 2 * M, ROW_H + 1, { color: C.headBg });
      text("Check", xCat, y + 9.2, 8, bold, C.navy);
      text("Item to confirm", xItem, y + 9.2, 8, bold, C.navy);
      tickMark(xDone + 1, y + 10);
      y += ROW_H + 1;
    };
    ensure(ROW_H * 4);
    header();
    let prevCheck = null;
    for (const item of items) {
      const lines = wrap(item.text, xDone - xItem - 8, ROW_SIZE);
      const h = ROW_H + (lines.length - 1) * LINE_H;
      if (ensure(h)) { header(); prevCheck = null; }
      if (item.check !== prevCheck) {
        const c = fit(item.check, catW - 6, ROW_SIZE - 0.5, bold);
        text(c.text, xCat, y + 9, c.size, bold, C.blue);
      }
      prevCheck = item.check;
      lines.forEach((line, j) => text(line, xItem, y + 9 + j * LINE_H, ROW_SIZE));
      answerMark(xDone + 2, y + 9.5, state.answers[item.id]);
      hline(M, W - M, y + h);
      y += h;
    }
    y += 4;
  }

  /* ---- Final checks, in two columns ---- */

  function finalTable(items) {
    const colW = (W - 2 * M) / 2;
    const half = Math.ceil(items.length / 2);
    const textW = colW - 4 - 36;
    const header = () => {
      rect(M, y, W - 2 * M, ROW_H + 1, { color: C.headBg });
      for (let k = 0; k < 2; k++) {
        const x = M + k * colW;
        text(FINAL_CHECKS.columnTitle, x + 4, y + 9.2, 8, bold, C.navy);
        tickMark(x + colW - 27, y + 10);
      }
      y += ROW_H + 1;
    };
    ensure(ROW_H * 4);
    header();
    for (let r = 0; r < half; r++) {
      const cells = [items[r], items[r + half]].filter(Boolean);
      const wrapped = cells.map((it) => wrap(it.text, textW, FINAL_SIZE));
      const h = ROW_H + (Math.max(...wrapped.map((l) => l.length)) - 1) * LINE_H;
      if (ensure(h)) header();
      cells.forEach((it, k) => {
        const x = M + k * colW;
        wrapped[k].forEach((line, j) => text(line, x + 4, y + 8.6 + j * LINE_H, FINAL_SIZE));
        answerMark(x + colW - 26, y + 9, state.answers[it.id]);
      });
      hline(M, W - M, y + h);
      y += h;
    }
    y += 4;
  }

  function importantNote() {
    const lead = "Important:";
    const leadW = bold.widthOfTextAtSize(`${lead} `, 7);
    const lines = wrap(IMPORTANT_NOTE, W - 2 * M, 7, font, W - 2 * M - leadW);
    ensure(8 + lines.length * 8.5);
    y += 6;
    lines.forEach((line, j) => {
      const base = y + 8 + j * 8.5;
      if (j === 0) {
        text(lead, M, base, 7, bold, C.grey);
        text(line, M + leadW, base, 7, font, C.grey);
      } else {
        text(line, M, base, 7, font, C.grey);
      }
    });
    y += 8 + lines.length * 8.5;
  }

  /* ---- Lay out ---- */

  newPage(true);
  details();
  if (model.site && model.site.items.length) {
    heading(siteLabel(state, model), model.site.subtitle, (model.site.escalate ? 40 : 0) + ROW_H * 3);
    if (model.site.escalate) escalateBox(model.site.escalate);
    siteTable(model.site.items);
  }
  heading(FINAL_CHECKS.title, FINAL_CHECKS.subtitle, ROW_H * 3);
  finalTable(model.final);
  importantNote();

  /* Footer on every page, now the page count is known. */
  const parts = [];
  if (meta.completedBy) parts.push(`Completed by ${meta.completedBy}${meta.completedAt ? ` on ${formatStamp(meta.completedAt)}` : ""}`);
  if (meta.editedBy) parts.push(`Last edited by ${meta.editedBy}${meta.editedAt ? ` on ${formatStamp(meta.editedAt)}` : ""}`);
  pages.forEach((p, i) => {
    page = p;
    const footer = [...parts, `Checklist page ${i + 1} of ${pages.length}`].join("  ·  ");
    const f = fit(footer, W - 2 * M, 7);
    text(f.text, M, H - M + 6, f.size, font, C.grey);
  });
}
