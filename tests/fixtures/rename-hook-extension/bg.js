/* global chrome */
// Like a download manager (Seedr 1.0.4 on the owner's Chrome): an async listener that acts only on its own file type
// and suggests nothing otherwise. Its presence alone makes Chrome drop the name another extension asked for.
chrome.downloads.onDeterminingFilename.addListener(async (item, suggest) => {
  if (item.filename.endsWith('.torrent')) suggest({ filename: 'x.torrent' });
});
