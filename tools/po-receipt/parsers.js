/* =========================================================
   Đọc dữ liệu đầu vào cho tool "Phiếu nhập kho & File MISA"
   ---------------------------------------------------------
   PoParsers.num(s)                  số kiểu VN "14.654.000" hoặc EN "13,500,000"
   PoParsers.date(v)                 "26-Oct-2026" | "20-Oct" | "26/10/2026" | số serial Excel | Date → "yyyy-mm-dd"
   PoParsers.paste(text, known)      bảng dán từ Excel / email NCC → { kind, rows }
   PoParsers.pdfLines(lines, known)  dòng chữ của PDF có chữ (PO / hoá đơn) → { rows, warnings }
   PoParsers.invoiceXml(text)        hoá đơn điện tử XML (chuẩn TT78) → { rows }
   PoParsers.receiptSheet(aoa)       mở lại "Phiếu đề nghị nhập kho" đã xuất → { lots, items }
   PoParsers.misaSheet(aoa)          mở lại file nhập đơn mua hàng MISA đã xuất → { lots, items, supplier, poDate }
   PoParsers.catalogSheet(aoa)       danh mục hàng (Danh sách hàng hoá MISA, list sản phẩm NCC…) → [{ code, name, cbm, price }]

   rows = [{ model, desc, qty, price, delivered, unconfirmed, date, vat }]
   `known(model)` → true nếu mã có trong danh mục (giúp chọn đúng mã khi 1 dòng có nhiều chữ giống mã).
   Dùng chung cho trình duyệt và Node (để kiểm thử).
   ========================================================= */
(function (root) {
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

  function num(v) {
    if (typeof v === 'number') return v;
    let s = String(v ?? '').trim().replace(/\s+/g, '');
    if (!s || !/\d/.test(s) || !/^-?\(?[\d.,]+\)?$/.test(s)) return NaN;
    const neg = /^-|^\(/.test(s);
    s = s.replace(/[()-]/g, '');
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');          // 13,500,000 | 14.654.000
    else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
    else if (/^\d{1,3}(,\d{3})+\.\d+$/.test(s)) s = s.replace(/,/g, '');    // 1,234.56
    else s = s.replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? (neg ? -n : n) : NaN;
  }

  function date(v, refYear) {
    if (v == null || v === '') return '';
    const y0 = refYear || new Date().getFullYear();
    if (v instanceof Date && !isNaN(v)) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number' && v > 20000 && v < 80000) {             // số serial Excel
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-\s/.]([A-Za-z]{3})[a-z]*[-\s/.,]*(\d{2,4})?$/);
    if (m && MON[m[2].toLowerCase()]) {
      let y = m[3] ? +m[3] : y0; if (y < 100) y += 2000;
      return iso(y, MON[m[2].toLowerCase()], +m[1]);
    }
    m = s.match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?$/);
    if (m) { let y = m[3] ? +m[3] : y0; if (y < 100) y += 2000; return iso(y, +m[2], +m[1]); }
    return '';
  }

  /* Chữ giống mã model: có cả chữ và số, dài ≥ 5, không phải số tiền / ngày */
  const MODEL_RE = /^[A-Z0-9][A-Z0-9/._-]{3,}[A-Z0-9]$/;
  function looksModel(t) {
    const s = String(t || '').trim().toUpperCase();
    return MODEL_RE.test(s) && /[A-Z]/.test(s) && /\d/.test(s) && !/^\d+[%.,]/.test(s);
  }
  function pickModel(tokens, known) {
    const cands = [...new Set(tokens.map((t) => String(t).trim().toUpperCase().replace(/[(),;:]+$/g, '').replace(/^[(]+/, '')))]
      .filter(looksModel);
    if (!cands.length) return '';
    const score = (s) => (known && known(s) ? 1000 : 0) + (s.includes('-') ? 0 : 50) + (/^\d/.test(s) ? 0 : 20) + s.length;
    return cands.sort((a, b) => score(b) - score(a))[0];
  }

  /* ---------- Bảng dán từ Excel / email (Outlook) ---------- */
  const HEAD = [
    ['model', /^(material|model|model code|mã sản phẩm|mã sp|mã hàng|mã hàng \(\*\)|item|sku|code)$/i],
    ['desc', /(item description|description|tên hàng|tên sản phẩm|product name)/i],
    ['qty', /(order quantity|^qty|số lượng|^sl$|quantity)/i],
    ['delivered', /(cumulative|deliv\.? ?qty|delivered|đã giao|sl giao)/i],
    ['unconfirmed', /(unconfirmed|not deliv|chưa giao|còn lại)/i],
    ['date', /(delivery date|ngày giao|planning date|ngày dự kiến|eta|ngày nhập)/i],
    ['price', /(price|đơn giá|unit price)/i],
  ];
  function splitRows(text) {
    return String(text || '').replace(/\r/g, '').split('\n')
      .map((r) => (r.includes('\t') ? r.split('\t') : r.trim().split(/\s{2,}|\s(?=[\d(])/)))
      .map((r) => r.map((c) => String(c).trim()))
      .filter((r) => r.some((c) => c));
  }
  function headerMap(row) {
    const map = {};
    row.forEach((c, i) => {
      const cell = c.replace(/\s+/g, ' ').trim();
      for (const [k, re] of HEAD) {
        if (map[k] == null && re.test(cell)) {
          if (k === 'qty' && /cumulative|deliv|unconfirmed|not deliv/i.test(cell)) continue;
          map[k] = i; break;
        }
      }
    });
    return map;
  }
  function paste(text, known) {
    const rows = splitRows(text);
    let hi = -1, map = {};
    for (let i = 0; i < Math.min(rows.length, 8); i++) {
      const m = headerMap(rows[i]);
      if (m.model != null && (m.qty != null || m.delivered != null || m.price != null)) { hi = i; map = m; break; }
    }
    const out = [];
    const refYear = new Date().getFullYear();
    if (hi >= 0) {
      rows.slice(hi + 1).forEach((r) => {
        const model = String(r[map.model] || '').trim().toUpperCase();
        if (!looksModel(model)) return;
        const g = (k) => (map[k] == null ? NaN : num(r[map[k]]));
        const blankNum = (k) => (map[k] != null && /^\s*-?\s*$/.test(r[map[k]] || '') ? 0 : g(k));
        out.push({
          model,
          desc: map.desc != null ? r[map.desc] : '',
          qty: g('qty'),
          price: g('price'),
          delivered: map.delivered != null ? blankNum('delivered') : NaN,
          unconfirmed: map.unconfirmed != null ? blankNum('unconfirmed') : NaN,
          date: map.date != null ? date(r[map.date], refYear) : '',
        });
      });
      return { kind: map.delivered != null ? 'delivery' : 'po', header: true, rows: out };
    }
    // Không có dòng tiêu đề: mỗi dòng lấy mã + các số (SL, đơn giá, thành tiền)
    rows.forEach((r) => {
      const toks = r.flatMap((c) => c.split(/\s+/));
      const model = pickModel(toks, known);
      if (!model) return;
      const nums = toks.filter((t) => t.toUpperCase() !== model).map(num).filter((n) => isFinite(n));
      const row = { model, desc: '', qty: NaN, price: NaN, delivered: NaN, unconfirmed: NaN, date: '' };
      const tri = findTriple(nums);
      if (tri) { row.qty = tri.q; row.price = tri.p; }
      else if (nums.length) { row.qty = nums[0]; if (nums.length > 1) row.price = nums[1]; }
      const d = toks.map((t) => date(t, refYear)).find(Boolean);
      if (d && !tri) row.date = d;
      out.push(row);
    });
    return { kind: 'po', header: false, rows: out };
  }

  /* 3 số liền nhau SL × Đơn giá = Thành tiền */
  function findTriple(nums, from = 0) {
    for (let i = from; i + 2 < nums.length; i++) {
      const [q, p, g] = [nums[i], nums[i + 1], nums[i + 2]];
      if (q > 0 && q <= 1e6 && Number.isInteger(q) && p > 0 && Math.abs(q * p - g) <= Math.max(1, g * 1e-6)) return { q, p, g, i };
    }
    return null;
  }

  /* ---------- PDF có chữ: PO dạng bảng (QTY | PRICE | VALUE) hoặc hoá đơn GTGT ----------
     lines = [{ y, h, toks: [{ s, x }] }] (đã gom theo dòng, y giảm dần từ trên xuống) */
  function pdfLines(lines, known) {
    const rows = []; const warnings = [];
    lines.forEach((ln, li) => {
      const toks = ln.toks.flatMap((t) => String(t.s).split(/\s+/).filter(Boolean).map((s) => ({ s, x: t.x })));
      const nums = toks.map((t) => num(t.s));
      const valid = nums.map((n, i) => ({ n, i })).filter((o) => isFinite(o.n));
      const tri = findTriple(valid.map((o) => o.n));
      if (!tri) return;
      const qTok = toks[valid[tri.i].i];
      // mã hàng: chữ bên trái ô số lượng, trên dòng này hoặc dòng sát trên/dưới (mô tả xuống dòng)
      const near = lines.filter((l, j) => Math.abs(j - li) <= 2 && Math.abs(l.y - ln.y) <= (ln.h || 10) * 2.2);
      const cand = near.flatMap((l) => l.toks).filter((t) => t.x < qTok.x).flatMap((t) => String(t.s).split(/\s+/));
      const model = pickModel(cand, known);
      if (!model) { if (tri.p >= 1000) warnings.push(`Dòng có SL ${tri.q} × ${tri.p} nhưng không tìm thấy mã hàng`); return; }
      const after = toks.slice(valid[tri.i + 2].i + 1).map((t) => t.s);
      const vt = after.find((s) => /^\d{1,2}([.,]\d+)?%$/.test(s));
      rows.push({ model, desc: '', qty: tri.q, price: tri.p, delivered: NaN, unconfirmed: NaN, date: '', vat: vt ? num(vt.replace('%', '')) : NaN });
    });
    return { rows, warnings };
  }

  /* ---------- Hoá đơn XML (TT78): mỗi <HHDVu> là 1 dòng ---------- */
  function invoiceXml(text) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const get = (el, tag) => { const x = el.getElementsByTagName(tag)[0]; return x ? x.textContent.trim() : ''; };
    const rows = [];
    Array.from(doc.getElementsByTagName('HHDVu')).forEach((el) => {
      const code = get(el, 'MHHDVu'); const name = get(el, 'THHDVu');
      const model = looksModel(code) ? code.toUpperCase() : pickModel(name.split(/\s+/));
      const qty = parseFloat(get(el, 'SLuong')); const price = parseFloat(get(el, 'DGia'));
      if (!model || !(qty > 0)) return;
      rows.push({ model, desc: name, qty, price, delivered: NaN, unconfirmed: NaN, date: '', vat: parseFloat(get(el, 'TSuat')) });
    });
    return { rows };
  }

  /* ---------- Mở lại Phiếu đề nghị nhập kho (.xlsx) ----------
     aoa: mảng 2 chiều (SheetJS sheet_to_json header:1, cellDates)  */
  function receiptSheet(aoa) {
    const norm = (v) => String(v ?? '').trim();
    const hi = aoa.findIndex((r) => r && r.some((c) => /^MÃ HÀNG$/i.test(norm(c))) && r.some((c) => /tên lô/i.test(norm(c))));
    if (hi < 0) return null;
    const H = aoa[hi].map(norm);
    const col = (re) => H.findIndex((h) => re.test(h));
    const C = { code: col(/^MÃ HÀNG$/i), loc: col(/LOCATION|^KHO$/i), name: col(/TÊN HÀNG/i), unit: col(/ĐVT/i), qty: col(/Số lượng/i),
      cbm: col(/^Số khối$/i), lot: col(/Tên lô/i), date: col(/Ngày nhập/i) };
    const lots = []; const items = [];
    let lastLot = null;
    for (let r = hi + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const first = norm(row[0]);
      if (/phòng|ký và ghi|giám đốc/i.test(first) || row.some((c) => /\(ký và ghi rõ/i.test(norm(c)))) break;
      const isTotal = row.some((c) => /^total$|^tổng$/i.test(norm(c)));
      if (isTotal) { if (lastLot && C.lot >= 0 && norm(row[C.lot])) lastLot.cont = norm(row[C.lot]); continue; }
      const code = norm(row[C.code]); const qty = num(row[C.qty]);
      if (!code || !isFinite(qty)) continue;
      const lotName = norm(row[C.lot]) || (lastLot ? lastLot.name : 'Đợt 1');
      let lot = lots.find((l) => l.name === lotName);
      if (!lot) {
        const dv = row[C.date];
        const d = dv instanceof Date || typeof dv === 'number' ? date(dv) : '';
        lot = { name: lotName, date: d, note: d ? '' : norm(dv), cont: '' };
        lots.push(lot);
      }
      lastLot = lot;
      items.push({ code, name: norm(row[C.name]), unit: norm(row[C.unit]) || 'Cái', loc: C.loc >= 0 ? norm(row[C.loc]) : '',
        qty, cbm: num(row[C.cbm]), lot: lotName });
    }
    return { lots, items };
  }

  /* ---------- Mở lại file nhập đơn mua hàng MISA (.xls) ---------- */
  const MISA_HEAD = ['Ngày đơn hàng (*)', 'Số đơn hàng (*)', 'Tình trạng', 'Ngày giao hàng', 'Mã nhà cung cấp', 'Tên nhà cung cấp',
    'Địa chỉ', 'Mã số thuế', 'Người liên hệ', 'Diễn giải', 'Loại tiền', 'Tỷ giá', 'Mã hàng (*)', 'Tên hàng', 'Là dòng ghi chú',
    'Mã kho', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Thành tiền quy đổi', 'Tỷ lệ CK (%)', 'Tiền chiết khấu',
    'Tiền chiết khấu quy đổi', '% thuế GTGT', '% thuế suất KHAC', 'Tiền thuế GTGT', 'Tiền thuế GTGT quy đổi'];
  function misaSheet(aoa) {
    const hi = aoa.findIndex((r) => r && r.some((c) => /^Số đơn hàng/i.test(String(c ?? '').trim())));
    if (hi < 0) return null;
    const H = aoa[hi].map((c) => String(c ?? '').trim());
    const ix = (name) => H.indexOf(name);
    const lots = []; const items = []; let supplier = null; let poDate = '';
    for (let r = hi + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const so = String(row[ix('Số đơn hàng (*)')] ?? '').trim();
      const code = String(row[ix('Mã hàng (*)')] ?? '').trim();
      if (!so || !code) continue;
      if (!poDate) poDate = date(row[ix('Ngày đơn hàng (*)')]);
      if (!supplier) supplier = { code: String(row[ix('Mã nhà cung cấp')] ?? '').trim(), name: String(row[ix('Tên nhà cung cấp')] ?? '').trim(),
        address: String(row[ix('Địa chỉ')] ?? '').trim(), tax: String(row[ix('Mã số thuế')] ?? '').trim() };
      if (!lots.find((l) => l.name === so)) lots.push({ name: so, date: date(row[ix('Ngày giao hàng')]), note: '', cont: '' });
      items.push({ code, name: String(row[ix('Tên hàng')] ?? '').trim(), unit: String(row[ix('ĐVT')] ?? '').trim() || 'Cái',
        qty: num(row[ix('Số lượng')]), price: num(row[ix('Đơn giá')]), vat: num(row[ix('% thuế GTGT')]), lot: so,
        whCode: String(row[ix('Mã kho')] ?? '').trim() });
    }
    return { lots, items, supplier, poDate };
  }

  /* ---------- Danh mục hàng từ file bất kỳ có cột Mã / Tên / (CBM) / (Đơn giá) ---------- */
  function catalogSheet(aoa) {
    const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
    for (let hi = 0; hi < Math.min(aoa.length, 15); hi++) {
      const H = (aoa[hi] || []).map(norm);
      const code = H.findIndex((h) => /^(mã|mã hàng|mã hàng \(\*\)|model|material|mã sản phẩm|model code)$/i.test(h));
      const name = H.findIndex((h) => /^(tên|tên hàng|tên sản phẩm|item description|tên hàng hoá|tên hàng hóa)$/i.test(h));
      if (code < 0 || name < 0) continue;
      const cbm = H.findIndex((h) => /^(cbm|số khối|m3|thể tích)$/i.test(h));
      const price = H.findIndex((h) => /^(đơn giá|giá mua|price)$/i.test(h));
      const out = [];
      const kind = /^(mã|mã hàng|mã hàng \(\*\))$/i.test(H[code]) ? 'misa' : 'supplier';
      for (let r = hi + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const c = norm(row[code]).toUpperCase();
        if (!c || !looksModel(c.replace(/\s/g, ''))) continue;
        out.push({ code: c.replace(/\s/g, ''), name: norm(row[name]).replace(/\s*\n\s*/g, ' '),
          cbm: cbm >= 0 ? num(row[cbm]) : NaN, price: price >= 0 ? num(row[price]) : NaN, kind });
      }
      return out;
    }
    return [];
  }

  const api = { num, date, looksModel, pickModel, paste, pdfLines, invoiceXml, receiptSheet, misaSheet, catalogSheet, MISA_HEAD, findTriple };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PoParsers = api;
})(typeof window !== 'undefined' ? window : globalThis);
