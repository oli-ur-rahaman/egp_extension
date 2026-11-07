// @ts-nocheck: byte-level file writing, checked by reading files back in tests/unit/export.test.js.
// Writes a real .xls file (Excel 97-2003, BIFF8), as the owner asked (D54), from the same sheets as xlsx-writer.js.
// Limits of the format: 65,536 rows, 256 columns. Filter arrows and live formulas aren't written, so totals are plain values.

export const XLS_MAX_ROWS = 65536;
export const XLS_MAX_COLS = 256;

class Bytes {
  constructor(size = 65536) {
    this.buf = new Uint8Array(size);
    this.view = new DataView(this.buf.buffer);
    this.length = 0;
  }

  room(extra) {
    if (this.length + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v) { this.room(1); this.buf[this.length++] = v; return this; }

  u16(v) { this.room(2); this.view.setUint16(this.length, v, true); this.length += 2; return this; }

  u32(v) { this.room(4); this.view.setUint32(this.length, v >>> 0, true); this.length += 4; return this; }

  f64(v) { this.room(8); this.view.setFloat64(this.length, v, true); this.length += 8; return this; }

  chars(text) {
    this.room(text.length * 2);
    for (let i = 0; i < text.length; i++) this.view.setUint16(this.length + i * 2, text.charCodeAt(i), true);
    this.length += text.length * 2;
    return this;
  }

  bytes() { return this.buf.subarray(0, this.length); }
}

/** Writes one record. @param {Bytes} out @param {number} id @param {(b: Bytes) => void} fill */
function record(out, id, fill) {
  const body = new Bytes(64);
  fill(body);
  out.u16(id).u16(body.length);
  out.room(body.length);
  out.buf.set(body.bytes(), out.length);
  out.length += body.length;
}

// A string as these records hold it: length, flag, UTF-16.
const str16 = (b, text) => b.u16(text.length).u8(1).chars(text);
const str8 = (b, text) => b.u8(text.length).u8(1).chars(text);

/** Excel's custom colours, slots 8 to 63. */
function palette() {
  const colours = [];
  return {
    index(hex) {
      const at = colours.indexOf(hex);
      if (at >= 0) return at + 8;
      if (colours.length >= 56) return 8;
      colours.push(hex);
      return colours.length + 7;
    },
    write(out) {
      record(out, 0x0092, (b) => {
        b.u16(56);
        for (let i = 0; i < 56; i++) {
          const hex = colours[i] ?? 'FFFFFF';
          b.u8(parseInt(hex.slice(0, 2), 16)).u8(parseInt(hex.slice(2, 4), 16)).u8(parseInt(hex.slice(4, 6), 16)).u8(0);
        }
      });
    },
  };
}

/** Fonts, formats and cell styles, gathered from the sheets. */
function styleBook(colours) {
  // Font number 4 doesn't exist in this format, so the list of records and the numbers used differ past it.
  const fonts = ['200|0|0'];
  const formats = [];
  const xfs = [];
  const byKey = new Map();
  const fontId = (s) => {
    const key = `${(s.size ?? 10) * 20}|${s.bold ? 1 : 0}|${s.color ? colours.index(s.color) : 0}`;
    let at = fonts.indexOf(key);
    if (at < 0) at = fonts.push(key) - 1;
    return at >= 4 ? at + 1 : at;
  };
  return {
    /** 15 is the default cell style; 16 onward are made here. */
    id(s) {
      if (!s) return 15;
      const key = JSON.stringify(s);
      if (byKey.has(key)) return byKey.get(key);
      let format = 0;
      if (s.format) {
        let at = formats.indexOf(s.format);
        if (at < 0) at = formats.push(s.format) - 1;
        format = 164 + at;
      }
      xfs.push({
        font: fontId(s),
        format,
        align: (s.h === 'left' ? 1 : s.h === 'center' ? 2 : 0) | (s.wrap ? 8 : 0) | ((s.v === 'top' ? 0 : s.v === 'center' ? 1 : 2) << 4),
        fill: s.fill ? colours.index(s.fill) : null,
        border: s.border ? colours.index('D9D9D9') : null,
      });
      const id = xfs.length + 15;
      byKey.set(key, id);
      return id;
    },
    write(out) {
      for (const key of fonts.flatMap((f, i) => (i === 4 ? [f, f] : [f]))) {
        const [height, bold, colour] = key.split('|').map(Number);
        record(out, 0x0031, (b) => {
          b.u16(height).u16(0).u16(colour || 0x7FFF).u16(bold ? 700 : 400).u16(0).u8(0).u8(0).u8(0).u8(0);
          str8(b, 'Arial');
        });
      }
      formats.forEach((f, i) => record(out, 0x041E, (b) => {
        b.u16(164 + i);
        str16(b, f);
      }));
      const xf = (b, font, format, flags, align, used, border, colours2, fill) => {
        b.u16(font).u16(format).u16(flags).u8(align).u8(0).u8(0).u8(used).u32(border).u32(colours2).u16(fill);
      };
      // Sixteen standard entries that every file has.
      for (let i = 0; i < 15; i++) record(out, 0x00E0, (b) => xf(b, 0, 0, 0xFFF5, 0x20, 0xF4, 0, 0, 0x20C0));
      record(out, 0x00E0, (b) => xf(b, 0, 0, 0x0001, 0x20, 0, 0, 0, 0x20C0));
      for (const x of xfs) {
        record(out, 0x00E0, (b) => {
          const lines = x.border === null ? 0 : 1 | (1 << 4) | (1 << 8) | (1 << 12) | (x.border << 16) | (x.border << 23);
          const tops = x.border === null ? 0 : x.border | (x.border << 7);
          const fillBits = x.fill === null ? 0x20C0 : x.fill | (0x41 << 7);
          xf(b, x.font, x.format, 0x0001, x.align, 0xFC, lines, (tops | (x.fill === null ? 0 : 1 << 26)) >>> 0, fillBits);
        });
      }
      record(out, 0x0293, (b) => b.u16(0x8000).u8(0).u8(0xFF));
    },
  };
}

/** The shared text table. Text longer than a record continues in the next one. */
function writeStrings(out, strings, total) {
  const MAX = 8224;
  const parts = [];
  let current = new Bytes(MAX + 8);
  current.u32(total).u32(strings.length);
  const next = () => {
    parts.push(current.bytes());
    current = new Bytes(MAX + 8);
  };
  for (const text of strings) {
    if (current.length + 3 + 2 > MAX) next();
    current.u16(text.length).u8(1);
    let at = 0;
    while (at < text.length) {
      const fit = Math.floor((MAX - current.length) / 2);
      if (fit < 1) {
        next();
        current.u8(1); // a continued string says again that it's 16-bit
        continue;
      }
      const piece = text.slice(at, at + fit);
      current.chars(piece);
      at += piece.length;
    }
  }
  parts.push(current.bytes());
  parts.forEach((part, i) => {
    out.u16(i === 0 ? 0x00FC : 0x003C).u16(part.length);
    out.room(part.length);
    out.buf.set(part, out.length);
    out.length += part.length;
  });
}

const parseRef = (ref) => {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64;
  return { col: col - 1, row: Number(m[2]) - 1 };
};

function writeSheet(sheet, styles, stringId) {
  const out = new Bytes(1 << 20);
  record(out, 0x0809, (b) => b.u16(0x0600).u16(0x0010).u16(0x0DBB).u16(0x07CC).u32(0).u32(0x06));
  (sheet.widths ?? []).forEach((w, i) => record(out, 0x007D, (b) => b.u16(i).u16(i).u16(Math.round(w * 256)).u16(15).u16(0).u16(0)));
  const lastCol = Math.max(1, ...sheet.rows.map((r) => r.length));
  record(out, 0x0200, (b) => b.u32(0).u32(sheet.rows.length).u16(0).u16(lastCol).u16(0));
  sheet.rows.forEach((row, r) => {
    const height = sheet.heights?.[r];
    record(out, 0x0208, (b) => b.u16(r).u16(0).u16(Math.max(row.length, 1)).u16(height ? height * 20 : 0x00FF).u16(0).u16(0).u32(height ? 0x0140 : 0x0100));
  });
  sheet.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell) return;
      const xf = styles.id(cell.s);
      const { v } = cell;
      if (v === undefined || v === null || v === '') {
        if (cell.s) record(out, 0x0201, (b) => b.u16(r).u16(c).u16(xf));
      } else if (typeof v === 'number') {
        record(out, 0x0203, (b) => b.u16(r).u16(c).u16(xf).f64(v));
      } else {
        record(out, 0x00FD, (b) => b.u16(r).u16(c).u16(xf).u32(stringId(v)));
      }
    });
  });
  const frozen = sheet.freeze ? 0x0008 | 0x0100 : 0;
  const grid = sheet.hideGrid ? 0 : 0x0002;
  record(out, 0x023E, (b) => b.u16(0x0004 | 0x0010 | 0x0020 | 0x0080 | grid | frozen).u16(0).u16(0).u16(0x40).u16(0).u16(0).u16(0).u32(0));
  if (sheet.freeze) record(out, 0x0041, (b) => b.u16(0).u16(1).u16(1).u16(0).u16(2));
  // At most 1,026 merges fit in a record.
  const merges = sheet.merges ?? [];
  for (let i = 0; i < merges.length; i += 1026) {
    const group = merges.slice(i, i + 1026);
    record(out, 0x00E5, (b) => {
      b.u16(group.length);
      for (const m of group) {
        const [from, to] = m.split(':').map(parseRef);
        b.u16(from.row).u16(to.row).u16(from.col).u16(to.col);
      }
    });
  }
  record(out, 0x000A, () => {});
  return out.bytes();
}

/** Puts the workbook into the container Excel's old files use. */
function container(stream) {
  const SECTOR = 512;
  // Short streams live elsewhere in this format, so a workbook is padded to the size that keeps it simple.
  const size = Math.max(stream.length, 4096);
  const dataSectors = Math.ceil(size / SECTOR);
  let fatSectors = 1;
  let difatSectors;
  for (;;) {
    difatSectors = fatSectors > 109 ? Math.ceil((fatSectors - 109) / 127) : 0;
    const needed = Math.ceil((dataSectors + 1 + fatSectors + difatSectors) / 128);
    if (needed <= fatSectors) break;
    fatSectors = needed;
  }
  const FREE = 0xFFFFFFFF;
  const END = 0xFFFFFFFE;
  const FAT = 0xFFFFFFFD;
  const DIFAT = 0xFFFFFFFC;
  // Order on disk: DIFAT, FAT, directory, workbook.
  const firstFat = difatSectors;
  const dirSector = difatSectors + fatSectors;
  const firstData = dirSector + 1;
  const total = firstData + dataSectors;

  const file = new Uint8Array(SECTOR * (total + 1));
  const view = new DataView(file.buffer);
  const write = (at, bytes) => file.set(bytes, at);
  const sectorAt = (n) => SECTOR * (n + 1);

  // Header
  write(0, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
  view.setUint16(24, 0x003E, true);
  view.setUint16(26, 3, true);
  view.setUint16(28, 0xFFFE, true);
  view.setUint16(30, 9, true);
  view.setUint16(32, 6, true);
  view.setUint32(44, fatSectors, true);
  view.setUint32(48, dirSector, true);
  view.setUint32(56, 4096, true);
  view.setUint32(60, END, true);
  view.setUint32(64, 0, true);
  view.setUint32(68, difatSectors ? 0 : END, true);
  view.setUint32(72, difatSectors, true);
  for (let i = 0; i < 109; i++) view.setUint32(76 + i * 4, i < fatSectors ? firstFat + i : FREE, true);

  // DIFAT: lists the FAT sectors that don't fit in the header.
  for (let d = 0; d < difatSectors; d++) {
    const at = sectorAt(d);
    for (let i = 0; i < 127; i++) {
      const fat = 109 + d * 127 + i;
      view.setUint32(at + i * 4, fat < fatSectors ? firstFat + fat : FREE, true);
    }
    view.setUint32(at + 508, d + 1 < difatSectors ? d + 1 : END, true);
  }

  // FAT: the chain of every sector.
  const entry = (n, value) => view.setUint32(sectorAt(firstFat + Math.floor(n / 128)) + (n % 128) * 4, value, true);
  for (let n = 0; n < fatSectors * 128; n++) entry(n, FREE);
  for (let n = 0; n < difatSectors; n++) entry(n, DIFAT);
  for (let n = 0; n < fatSectors; n++) entry(firstFat + n, FAT);
  entry(dirSector, END);
  for (let n = 0; n < dataSectors; n++) entry(firstData + n, n + 1 < dataSectors ? firstData + n + 1 : END);

  // Directory: the root, then the workbook.
  const dir = (index, name, type, start, length, child) => {
    const at = sectorAt(dirSector) + index * 128;
    for (let i = 0; i < name.length; i++) view.setUint16(at + i * 2, name.charCodeAt(i), true);
    view.setUint16(at + 64, (name.length + 1) * 2, true);
    file[at + 66] = type;
    file[at + 67] = 1;
    view.setUint32(at + 68, FREE, true);
    view.setUint32(at + 72, FREE, true);
    view.setUint32(at + 76, child, true);
    view.setUint32(at + 116, start, true);
    view.setUint32(at + 120, length, true);
  };
  dir(0, 'Root Entry', 5, END, 0, 1);
  dir(1, 'Workbook', 2, firstData, size, FREE);
  for (const empty of [2, 3]) {
    const at = sectorAt(dirSector) + empty * 128;
    view.setUint32(at + 68, FREE, true);
    view.setUint32(at + 72, FREE, true);
    view.setUint32(at + 76, FREE, true);
  }

  write(sectorAt(firstData), stream);
  return file;
}

/**
 * @param {import('./xlsx-writer.js').Sheet[]} sheets
 * @returns {Blob}
 */
export function buildXls(sheets) {
  const colours = palette();
  const styles = styleBook(colours);
  const strings = [];
  const known = new Map();
  let used = 0;
  const stringId = (value) => {
    const text = String(value)
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').slice(0, 32767);
    used += 1;
    let id = known.get(text);
    if (id === undefined) {
      id = strings.push(text) - 1;
      known.set(text, id);
    }
    return id;
  };
  const bodies = sheets.map((sheet) => writeSheet(sheet, styles, stringId));

  const globals = (offsets) => {
    const out = new Bytes(1 << 16);
    record(out, 0x0809, (b) => b.u16(0x0600).u16(0x0005).u16(0x0DBB).u16(0x07CC).u32(0).u32(0x06));
    record(out, 0x0042, (b) => b.u16(1200));
    record(out, 0x003D, (b) => b.u16(0).u16(0).u16(0x4000).u16(0x2000).u16(0x0038).u16(0).u16(0).u16(1).u16(600));
    styles.write(out);
    colours.write(out);
    sheets.forEach((sheet, i) => record(out, 0x0085, (b) => {
      b.u32(offsets[i]).u16(0);
      str8(b, sheet.name);
    }));
    writeStrings(out, strings, used);
    record(out, 0x000A, () => {});
    return out.bytes();
  };
  const head = globals(sheets.map(() => 0));
  const offsets = [];
  let at = head.length;
  for (const body of bodies) {
    offsets.push(at);
    at += body.length;
  }
  const stream = new Uint8Array(at);
  stream.set(globals(offsets));
  let pos = head.length;
  for (const body of bodies) {
    stream.set(body, pos);
    pos += body.length;
  }
  return new Blob([container(stream)], { type: 'application/vnd.ms-excel' });
}
