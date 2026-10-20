import { uniqueNames, zipParts } from "@/lib/zip";

/**
 * Downloads files one by one (a few at a time) and saves them as one .zip.
 * Returns how many could not be fetched; those are left out of the zip.
 */
export async function downloadAsZip(
  files: { url: string; fileName: string }[],
  zipName: string,
  onProgress: (done: number) => void,
): Promise<{ failed: number }> {
  const names = uniqueNames(files.map((file) => file.fileName));
  const results: ({ name: string; data: Uint8Array } | null)[] = new Array(files.length).fill(null);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < files.length) {
      const index = next++;
      try {
        const response = await fetch(files[index].url, { credentials: "same-origin" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        results[index] = { name: names[index], data: new Uint8Array(await response.arrayBuffer()) };
      } catch {
        results[index] = null;
      }
      done += 1;
      onProgress(done);
    }
  }
  // Three at a time: quick, without flooding a phone's connection.
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker));

  const entries = results.filter((entry): entry is { name: string; data: Uint8Array } => entry !== null);
  if (entries.length > 0) {
    const blob = new Blob(zipParts(entries) as BlobPart[], { type: "application/zip" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = zipName.endsWith(".zip") ? zipName : `${zipName}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give the browser a moment to start saving before letting go of it.
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  }
  return { failed: files.length - entries.length };
}

/** "Baptism - Sunday Service" → safe as a file name. */
export function zipFileName(title: string): string {
  return `${title.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "Photos"}.zip`;
}
