// M10: writes an .xlsx file. SheetJS's free edition can't write cell colours, and the agreed format has them (docs/samples), so the few parts needed are written here.
// Tests read the result back with SheetJS and openpyxl.

const esc = (/** @type {string} */ s) => String(s)
  // Characters XML doesn't allow at all would make Excel ask to repair the file.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, ' ')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** @param {number} n 0-based */
export function colName(n) {
  let s = '';
  for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

/**
 * @typedef {{ bold?: boolean, color?: string, size?: number, fill?: string, border?: boolean, wrap?: boolean, h?: 'left' | 'center', v?: 'top' | 'center', format?: string }} CellStyle
 * @typedef {{ v?: string | number | null, f?: string, s?: CellStyle }} Cell
 * @typedef {{ name: string, widths?: number[], rows: (Cell | null)[][], heights?: Record<number, number>, merges?: string[], freeze?: boolean, filter?: string, hideGrid?: boolean }} Sheet
 */

/** Gathers the distinct styles into Excel's tables. */
function styleBook() {
  const fonts = ['<font><sz val="10"/><name val="Arial"/></font>'];
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  /** @type {string[]} */
  const formats = [];
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  /** @type {Map<string, number>} */
  const byKey = new Map();
  /** @param {string[]} list @param {string} item */
  const intern = (list, item) => {
    const at = list.indexOf(item);
    return at >= 0 ? at : list.push(item) - 1;
  };
  return {
    /** @param {CellStyle} [s] */
    id(s) {
      if (!s) return 0;
      const key = JSON.stringify(s);
      const known = byKey.get(key);
      if (known !== undefined) return known;
      const font = intern(fonts, `<font>${s.bold ? '<b/>' : ''}<sz val="${s.size ?? 10}"/>${s.color ? `<color rgb="FF${s.color}"/>` : ''}<name val="Arial"/></font>`);
      const fill = s.fill ? intern(fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const side = (/** @type {string} */ n) => `<${n} style="thin"><color rgb="FFD9D9D9"/></${n}>`;
      const border = s.border ? intern(borders, `<border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border>`) : 0;
      const format = s.format ? 164 + intern(formats, s.format) : 0;
      const align = s.wrap || s.h || s.v
        ? `<alignment${s.h ? ` horizontal="${s.h}"` : ''}${s.v ? ` vertical="${s.v}"` : ''}${s.wrap ? ' wrapText="1"' : ''}/>` : '';
      const attrs = `numFmtId="${format}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${format ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}${fill ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''}${align ? ' applyAlignment="1"' : ''}`;
      const id = xfs.push(align ? `<xf ${attrs}>${align}</xf>` : `<xf ${attrs}/>`) - 1;
      byKey.set(key, id);
      return id;
    },
    xml() {
      const numFmts = formats.length ? `<numFmts count="${formats.length}">${formats.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('')}</numFmts>` : '';
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmts}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    },
  };
}

/** @param {Sheet} sheet @param {ReturnType<typeof styleBook>} styles */
function sheetXml(sheet, styles) {
  const lastCol = Math.max(1, ...sheet.rows.map((r) => r.length));
  const parts = [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`];
  parts.push(`<dimension ref="A1:${colName(lastCol - 1)}${Math.max(1, sheet.rows.length)}"/>`);
  const view = sheet.hideGrid ? ' showGridLines="0"' : '';
  parts.push(sheet.freeze
    ? `<sheetViews><sheetView workbookViewId="0"${view}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"${view}/></sheetViews>`);
  parts.push('<sheetFormatPr defaultRowHeight="13.2"/>');
  if (sheet.widths?.length) parts.push(`<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`);
  parts.push('<sheetData>');
  sheet.rows.forEach((row, r) => {
    const height = sheet.heights?.[r];
    /** @type {string[]} */
    const cells = [];
    row.forEach((cell, c) => {
      if (!cell) return;
      const ref = `${colName(c)}${r + 1}`;
      const s = styles.id(cell.s);
      const style = s ? ` s="${s}"` : '';
      const { v, f } = cell;
      const empty = v === undefined || v === null || v === '';
      if (f) {
        if (typeof v === 'number') cells.push(`<c r="${ref}"${style}><f>${esc(f)}</f><v>${v}</v></c>`);
        else cells.push(`<c r="${ref}"${style} t="str"><f>${esc(f)}</f><v>${esc(v ?? '')}</v></c>`);
      } else if (empty) cells.push(s ? `<c r="${ref}"${style}/>` : '');
      else if (typeof v === 'number') cells.push(`<c r="${ref}"${style}><v>${v}</v></c>`);
      else cells.push(`<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(String(v).slice(0, 32767))}</t></is></c>`);
    });
    parts.push(`<row r="${r + 1}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells.join('')}</row>`);
  });
  parts.push('</sheetData>');
  if (sheet.filter) parts.push(`<autoFilter ref="${sheet.filter}"/>`);
  if (sheet.merges?.length) parts.push(`<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`);
  parts.push('</worksheet>');
  return parts.join('');
}

// --- zip ---

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** @param {Uint8Array} data */
function crc32(data) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** @param {Uint8Array} data */
async function deflate(data) {
  const stream = new Blob([/** @type {any} */ (data)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** @param {{ name: string, text: string }[]} files */
async function zip(files) {
  const encoder = new TextEncoder();
  /** @type {Uint8Array[]} */
  const chunks = [];
  /** @type {Uint8Array[]} */
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const packed = await deflate(data);
    const crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 0x0800, true); // names are UTF-8
    head.setUint16(8, 8, true); // deflate
    head.setUint16(10, 0, true);
    head.setUint16(12, 0x21, true); // 1 Jan 1980, as many tools write when no date matters
    head.setUint32(14, crc, true);
    head.setUint32(18, packed.length, true);
    head.setUint32(22, data.length, true);
    head.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(head.buffer), name, packed);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 8, true);
    entry.setUint16(14, 0x21, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, packed.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + packed.length;
  }
  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([.../** @type {any[]} */ (chunks), .../** @type {any[]} */ (central), end.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * @param {Sheet[]} sheets
 * @returns {Promise<Blob>}
 */
export async function buildXlsx(sheets) {
  const styles = styleBook();
  const sheetFiles = sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(sheet, styles) }));
  const overrides = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const files = [
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>` },
    { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr fullCalcOnLoad="1"/></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    ...sheetFiles,
    { name: 'xl/styles.xml', text: styles.xml() },
  ];
  return zip(files);
}
