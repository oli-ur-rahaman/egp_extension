// Saves a file under the name the tool gives it (D73).
// Not chrome.downloads.download({ filename }): another extension that hooks Chrome's naming of downloads (download
// managers such as IDM, Seedr and Video DownloadHelper do) and was installed after this one makes Chrome drop that
// name, and the file is saved as the random ID of its blob link. Seen on the owner's Chrome, 2026-11-11. A link that
// carries the name makes it Chrome's own default, which a hook that suggests nothing leaves alone. Tested both ways
// round with a stand-in hook (tests/e2e/download-name.spec.js).

/** @param {Blob} blob @param {string} filename */
export async function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
