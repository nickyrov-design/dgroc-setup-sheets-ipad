/**
 * Web Share API helpers.
 *
 * shareFiles(files) opens the iOS share sheet with one or more File objects,
 * letting the user pick Save to Files (any folder, including network shares
 * added in the Files app), pCloud, or any other destination. Falls back to
 * downloads if Web Share isn't available (e.g. desktop browsers used during
 * development).
 *
 * exportPdf(blob, filename) is the single-PDF case.
 */

export async function shareFiles(files, { title } = {}) {
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share(title ? { files, title } : { files });
      return { ok: true };
    } catch (err) {
      if (err && err.name === "AbortError") return { ok: false, canceled: true };
      /* iOS only opens the share sheet straight after a tap. */
      if (err && err.name === "NotAllowedError") {
        return { ok: false, error: "The share sheet didn't open. Please tap Export again." };
      }
      return { ok: false, error: err.message || String(err) };
    }
  }

  /* Fallback: trigger a download per file. */
  try {
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    return { ok: true, fallback: "download" };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

export async function exportPdf(blob, filename) {
  const file = new File([blob], filename, { type: "application/pdf" });
  return shareFiles([file], { title: filename });
}
