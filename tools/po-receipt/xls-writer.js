/* =========================================================
   Ghi file Excel 97-2003 (.xls, BIFF8) CÓ ĐỊNH DẠNG — để file nhập MISA giống mẫu gốc
   (thư viện SheetJS bản miễn phí ghi .xls được nhưng mất font, màu nền, khung, độ cao dòng).
   ---------------------------------------------------------
   XlsWriter.build(CFB, book) → Uint8Array nội dung file .xls
     CFB  = XLSX.CFB (bộ đóng gói "Compound File" có sẵn trong SheetJS)
     book = {
       fonts:   [{ name, size (pt), bold, italic, color (chỉ số màu, 8 = đen, 0x7FFF = tự động) }],
       xfs:     [{ font (chỉ số trong fonts), fmt (chuỗi định dạng số | 'General'), h, v, wrap, border, fill }],
                 h: 0 chung · 1 trái · 2 giữa · 3 phải ;  v: 0 trên · 1 giữa · 2 dưới
                 border: true = khung mảnh 4 cạnh ; fill: chỉ số màu nền (vd 27 xanh nhạt, 42 xanh lá nhạt, 22 xám) | null
       sheets:  [{ name, colWidths: [đơn vị 1/256 ký tự], rowHeights: { dòng: twips }, defaultRowHeight (twips),
                   freezeRows, merges: [[r1, r2, c1, c2]], cells: [[r, c, giá trị (số | chuỗi | null), xf]] }]
     }
   Chuỗi ghi bằng bản ghi LABEL (Unicode) — giống cách SheetJS ghi .xls.
   Dùng chung cho trình duyệt và Node (để kiểm thử).
   ========================================================= */
(function (root) {
  const BUILTIN_FMT = { General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '@': 49 };

  class Buf {
    constructor() { this.parts = []; this.len = 0; }
    push(u8) { this.parts.push(u8); this.len += u8.length; }
    rec(type, body) {
      const b = body || new Uint8Array(0);
      const h = new Uint8Array(4); h[0] = type & 255; h[1] = type >> 8; h[2] = b.length & 255; h[3] = b.length >> 8;
      this.push(h); this.push(b);
    }
    bytes() { const out = new Uint8Array(this.len); let o = 0; this.parts.forEach((p) => { out.set(p, o); o += p.length; }); return out; }
  }
  // ghép trường: [['u8',v],['u16',v],['u32',v],['f64',v],['raw',Uint8Array]]
  function pack(fields) {
    const size = fields.reduce((s, [t, v]) => s + (t === 'u8' ? 1 : t === 'u16' ? 2 : t === 'u32' ? 4 : t === 'f64' ? 8 : v.length), 0);
    const u8 = new Uint8Array(size); const dv = new DataView(u8.buffer); let o = 0;
    fields.forEach(([t, v]) => {
      if (t === 'u8') { dv.setUint8(o, v); o += 1; } else if (t === 'u16') { dv.setUint16(o, v, true); o += 2; }
      else if (t === 'u32') { dv.setUint32(o, v >>> 0, true); o += 4; } else if (t === 'f64') { dv.setFloat64(o, v, true); o += 8; }
      else { u8.set(v, o); o += v.length; }
    });
    return u8;
  }
  const utf16 = (s) => { const u = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); u[2 * i] = c & 255; u[2 * i + 1] = c >> 8; } return u; };
  const shortStr = (s) => pack([['u8', s.length], ['u8', 1], ['raw', utf16(s)]]);     // ShortXLUnicodeString
  const longStr = (s) => pack([['u16', s.length], ['u8', 1], ['raw', utf16(s)]]);     // XLUnicodeString

  function fontRec(f) {
    return pack([['u16', Math.round((f.size || 10) * 20)], ['u16', f.italic ? 2 : 0], ['u16', f.color ?? 0x7FFF], ['u16', f.bold ? 700 : 400],
      ['u16', 0], ['u8', 0], ['u8', 0], ['u8', 0], ['u8', 0], ['raw', shortStr(f.name || 'Arial')]]);
  }
  function xfRec(x, isStyle) {
    const ifnt = x.font >= 4 ? x.font + 1 : x.font;                       // chỉ số font 4 không dùng trong BIFF
    const flags = isStyle ? 0xFFF5 : 0x0001;
    const align = (x.h || 0) | (x.wrap ? 8 : 0) | ((x.v ?? 2) << 4);
    const used = isStyle ? 0 : 0xFC;
    const b = x.border ? 1 : 0;
    const border1 = b | (b << 4) | (b << 8) | (b << 12) | (b ? (8 << 16) | (8 << 23) : 0);
    const border2 = (b ? 8 | (8 << 7) : 0) | ((x.fill != null ? 1 : 0) << 26);
    const fill = x.fill != null ? (x.fill | (0x41 << 7)) : (0x40 | (0x41 << 7));
    return pack([['u16', ifnt], ['u16', x.ifmt || 0], ['u16', flags], ['u8', align], ['u8', 0], ['u8', 0], ['u8', used],
      ['u32', border1], ['u32', border2], ['u16', fill]]);
  }

  function build(CFB, book) {
    // ---- định dạng số tuỳ chỉnh ----
    const fmtIds = {}; let next = 164;
    book.xfs.forEach((x) => {
      const f = x.fmt || 'General';
      x.ifmt = BUILTIN_FMT[f] ?? (fmtIds[f] ?? (fmtIds[f] = next++));
    });

    // ---- phần dùng chung (globals) ----
    const g = new Buf();
    g.rec(0x0809, pack([['u16', 0x0600], ['u16', 0x0005], ['u16', 0x0DBB], ['u16', 0x07CC], ['u32', 0], ['u32', 6]]));
    g.rec(0x00E1, pack([['u16', 1200]])); g.rec(0x00C1, pack([['u16', 0]])); g.rec(0x00E2);
    g.rec(0x0042, pack([['u16', 1200]]));                                  // CODEPAGE = Unicode
    g.rec(0x0161, pack([['u16', 0]]));
    g.rec(0x0019, pack([['u16', 0]])); g.rec(0x0012, pack([['u16', 0]])); g.rec(0x0013, pack([['u16', 0]]));
    g.rec(0x003D, pack([['u16', 0x0168], ['u16', 0x001E], ['u16', 0x4000], ['u16', 0x2400], ['u16', 0x0038], ['u16', 0], ['u16', 0], ['u16', 1], ['u16', 0x0258]]));
    g.rec(0x0040, pack([['u16', 0]])); g.rec(0x008D, pack([['u16', 0]])); g.rec(0x0022, pack([['u16', 0]]));
    g.rec(0x000E, pack([['u16', 1]])); g.rec(0x01B7, pack([['u16', 0]])); g.rec(0x00DA, pack([['u16', 0]]));
    const baseFont = { name: 'Arial', size: 10 };
    for (let i = 0; i < 4; i++) g.rec(0x0031, fontRec(i === 0 ? baseFont : baseFont));
    book.fonts.forEach((f) => g.rec(0x0031, fontRec(f)));
    Object.entries(fmtIds).forEach(([f, id]) => g.rec(0x041E, pack([['u16', id], ['raw', longStr(f)]])));
    // 16 XF kiểu (style) mặc định + XF ô
    const styleXf = { font: 0, ifmt: 0 };
    for (let i = 0; i < 15; i++) g.rec(0x00E0, xfRec(styleXf, true));
    g.rec(0x00E0, xfRec({ font: 0, ifmt: 0 }, false));                     // XF 15 = ô mặc định
    book.xfs.forEach((x) => g.rec(0x00E0, xfRec({ ...x, font: x.font + 4 }, false)));
    g.rec(0x0293, pack([['u16', 0x8000], ['u8', 0], ['u8', 0xFF]]));      // STYLE Normal
    const sheetPos = [];
    book.sheets.forEach((sh) => {
      sheetPos.push(g.len + 4);                                           // vị trí trường lbPlyPos để vá sau
      g.rec(0x0085, pack([['u32', 0], ['u8', 0], ['u8', 0], ['raw', shortStr(sh.name)]]));
    });
    g.rec(0x000A);

    // ---- từng sheet ----
    const sheetBytes = book.sheets.map((sh, si) => {
      const s = new Buf();
      s.rec(0x0809, pack([['u16', 0x0600], ['u16', 0x0010], ['u16', 0x0DBB], ['u16', 0x07CC], ['u32', 0], ['u32', 6]]));
      s.rec(0x000D, pack([['u16', 1]])); s.rec(0x000C, pack([['u16', 100]])); s.rec(0x000F, pack([['u16', 1]]));
      s.rec(0x0011, pack([['u16', 0]])); s.rec(0x0010, pack([['f64', 0.001]])); s.rec(0x005F, pack([['u16', 1]]));
      s.rec(0x002A, pack([['u16', 0]])); s.rec(0x002B, pack([['u16', 0]])); s.rec(0x0082, pack([['u16', 1]]));
      s.rec(0x0080, pack([['u16', 0], ['u16', 0], ['u16', 0], ['u16', 0]]));
      s.rec(0x0225, pack([['u16', 0], ['u16', sh.defaultRowHeight || 300]]));
      s.rec(0x0081, pack([['u16', 0x04C1]]));
      s.rec(0x0055, pack([['u16', 8]]));
      (sh.colWidths || []).forEach((w, c) => s.rec(0x007D, pack([['u16', c], ['u16', c], ['u16', w], ['u16', 15], ['u16', 0], ['u16', 0]])));
      const maxR = sh.cells.reduce((m, x) => Math.max(m, x[0]), 0);
      const maxC = sh.cells.reduce((m, x) => Math.max(m, x[1]), 0);
      s.rec(0x0200, pack([['u32', 0], ['u32', maxR + 1], ['u16', 0], ['u16', maxC + 1], ['u16', 0]]));
      for (let r = 0; r <= maxR; r++) {
        const h = (sh.rowHeights || {})[r];
        s.rec(0x0208, pack([['u16', r], ['u16', 0], ['u16', maxC + 1], ['u16', h || sh.defaultRowHeight || 300], ['u16', 0], ['u16', 0],
          ['u16', 0x0100 | (h ? 0x0040 : 0)], ['u16', 15]]));
      }
      sh.cells.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach(([r, c, v, xf]) => {
        const ixfe = 16 + xf;
        if (typeof v === 'number' && isFinite(v)) s.rec(0x0203, pack([['u16', r], ['u16', c], ['u16', ixfe], ['f64', v]]));
        else if (v != null && v !== '') s.rec(0x0204, pack([['u16', r], ['u16', c], ['u16', ixfe], ['raw', longStr(String(v).slice(0, 32767))]]));
        else s.rec(0x0201, pack([['u16', r], ['u16', c], ['u16', ixfe]]));
      });
      const fr = sh.freezeRows || 0;
      const sel = si === 0 ? 0x0600 : 0;                                    // chỉ sheet đầu được chọn (tránh nhóm sheet)
      s.rec(0x023E, pack([['u16', 0x00B6 | sel | (fr ? 0x0108 : 0)], ['u16', 0], ['u16', 0], ['u32', 0x40], ['u16', 0], ['u16', 0], ['u32', 0]]));
      if (fr) s.rec(0x0041, pack([['u16', 0], ['u16', fr], ['u16', fr], ['u16', 0], ['u8', 2], ['u8', 0]]));
      if ((sh.merges || []).length) {
        s.rec(0x00E5, pack([['u16', sh.merges.length], ...sh.merges.flatMap(([r1, r2, c1, c2]) => [['u16', r1], ['u16', r2], ['u16', c1], ['u16', c2]])]));
      }
      s.rec(0x000A);
      return s.bytes();
    });

    // ---- ghép + vá vị trí sheet ----
    const glob = g.bytes();
    const total = glob.length + sheetBytes.reduce((a, b) => a + b.length, 0);
    const wb = new Uint8Array(total); wb.set(glob, 0);
    let off = glob.length;
    const dv = new DataView(wb.buffer);
    sheetBytes.forEach((b, i) => { dv.setUint32(sheetPos[i], off, true); wb.set(b, off); off += b.length; });

    const cfb = CFB.utils.cfb_new();
    CFB.utils.cfb_add(cfb, 'Workbook', wb);
    const out = CFB.write(cfb, { type: 'array' });
    return out instanceof Uint8Array ? out : new Uint8Array(out);
  }

  const api = { build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.XlsWriter = api;
})(typeof window !== 'undefined' ? window : globalThis);
