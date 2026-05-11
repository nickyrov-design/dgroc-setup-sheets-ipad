/**
 * Web Share API helper.
 *
 * exportPdf(blob, filename) opens the iOS share sheet with the PDF as a
 * shareable file, letting the user pick pCloud / iCloud Drive / Files /
 * any other destination. Falls back to a download link if Web Share
 * isn't available (e.g. desktop browsers used during development).
 */

export async function exportPdf(blob, filename) {
  const file = new File([blob], filename, { type: "application/pdf" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return { ok: true };
    } catch (err) {
      if (err && err.name === "AbortError") return { ok: false, canceled: true };
      return { ok: false, error: err.message || String(err) };
    }
  }

  /* Fallback: trigger a download. */
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return { ok: true, fallback: "download" };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
