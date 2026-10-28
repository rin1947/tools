/* =========================================================
   Phiếu khai nhanh ECUS — ĐỌC CHỨNG TỪ (không có giao diện)
   ---------------------------------------------------------
   CustomsParsers.linesFromPdfPages(pages)  pages = [[{ s, x, y }]] → chuỗi văn bản theo dòng
   CustomsParsers.classify(text)            → 'bill' | 'ci' | 'pl' | 'co' | null
   CustomsParsers.bill(text) / ci(text) / pl(text) / co(text) → object các trường đọc được
   CustomsParsers.contract(text) → { contractNo, contractDate, contractDate2, contractEnd, endGuess, sellerName, sellerAddr, brand }
     (đọc được cả chữ OCR từ bản scan: sửa 0Sth → 05th, ngày hết hạn chỉ thấy "12/2026" → lấy ngày cuối tháng)
   CustomsParsers.num("15.450,00") → 15450   (hiểu cả kiểu VN và kiểu EN)
   Chạy được bằng Node để kiểm thử: node -e "require('./parsers.js')"
   ========================================================= */
(function (root) {
  const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12 };

  /* Cảng xếp hàng hay gặp (Trung Quốc) → mã UN/LOCODE dùng trên ECUS */
  const POL = {
    NINGBO: ['CNNGB', 'NINGBO'], SHANGHAI: ['CNSHA', 'SHANGHAI'], SHENZHEN: ['CNSZX', 'SHENZHEN'],
    YANTIAN: ['CNYTN', 'YANTIAN'], SHEKOU: ['CNSHK', 'SHEKOU'], NANSHA: ['CNNSA', 'NANSHA'],
    GUANGZHOU: ['CNCAN', 'GUANGZHOU'], QINGDAO: ['CNTAO', 'QINGDAO'], XIAMEN: ['CNXMN', 'XIAMEN'],
    TIANJIN: ['CNTXG', 'TIANJIN'], FOSHAN: ['CNFOS', 'FOSHAN'], ZHONGSHAN: ['CNZSN', 'ZHONGSHAN'],
  };
  /* Cảng dỡ ở TP.HCM → mã địa điểm dỡ hàng + địa điểm lưu kho (để trống = chưa biết, nhập tay) */
  const POD = [
    [/SP[\s-]?ITC/i, { code: 'VNITC', name: 'CANG CONT SPITC', store: '02CIS02', storeName: 'CANG SP ITC' }],
    [/CAT\s*LAI/i, { code: 'VNCLI', name: 'CANG CAT LAI', store: '', storeName: '' }],
  ];

  function num(s) {
    if (s == null || s === '') return NaN;
    if (typeof s === 'number') return s;
    s = String(s).replace(/[^\d.,-]/g, '');
    if (!s) return NaN;
    const d = s.includes('.'), c = s.includes(',');
    if (d && c) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (c) { const p = s.split(','); s = (p.length === 2 && p[1].length !== 3) ? p[0] + '.' + p[1] : s.replace(/,/g, ''); }
    else if (d) { const p = s.split('.'); if (p.length > 2) s = s.replace(/\./g, ''); }
    return parseFloat(s);
  }
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const mon = (s) => { const u = String(s).toUpperCase(); return MONTHS[u.slice(0, 4)] || MONTHS[u.slice(0, 3)]; };

  /* Mọi ngày tìm thấy trong chuỗi, theo thứ tự xuất hiện. Hiểu: 16th JUNE,2026 · OCT. 04, 2026 · 04/10/2026 */
  function findDates(t) {
    const out = []; let m;
    const r1 = /\b(\d{1,2})(?:st|nd|rd|th)?[\s.\-]*([A-Za-z]{3,9})[\s.,\-]*(\d{4})\b/gi;
    while ((m = r1.exec(t))) { const mm = mon(m[2]); if (mm && +m[1] <= 31) out.push({ i: m.index, v: iso(m[3], mm, m[1]) }); }
    const r2 = /\b([A-Za-z]{3,9})[\s.,]*(\d{1,2})(?:st|nd|rd|th)?[\s,.]+(\d{4})\b/gi;
    while ((m = r2.exec(t))) { const mm = mon(m[1]); if (mm && +m[2] <= 31) out.push({ i: m.index, v: iso(m[3], mm, m[2]) }); }
    const r3 = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/g;
    while ((m = r3.exec(t))) { if (+m[2] <= 12) out.push({ i: m.index, v: iso(m[3], m[2], m[1]) }); }
    const r4 = /\b(\d{4})[\-\/.](\d{1,2})[\-\/.](\d{1,2})\b/g;                    // 2026-10-12
    while ((m = r4.exec(t))) { if (+m[2] <= 12 && +m[3] <= 31) out.push({ i: m.index, v: iso(m[1], m[2], m[3]) }); }
    const r5 = /\b(\d{1,2})[\s\-\/.]([A-Za-z]{3,9})[\s\-\/.,]+(\d{2})\b(?![\d:])/gi;   // 12-Oct-26
    while ((m = r5.exec(t))) { const mm = mon(m[2]); if (mm && +m[1] <= 31 && !out.some((o) => o.i === m.index)) out.push({ i: m.index, v: iso('20' + m[3], mm, m[1]) }); }
    const r6 = /ngày\s*(?:\([a-z]+\))?\s*(\d{1,2})\s*tháng\s*(?:\([a-z]+\))?\s*(\d{1,2})\s*năm\s*(?:\([a-z]+\))?\s*(\d{4})/gi;   // ngày 13 tháng 10 năm 2026
    while ((m = r6.exec(t))) out.push({ i: m.index, v: iso(m[3], m[2], m[1]) });
    return out.sort((a, b) => a.i - b.i);
  }

  /* Ghép mảnh chữ pdf.js thành dòng (cùng toạ độ y ±1.5) */
  function linesFromPdfPages(pages) {
    const lines = [];
    pages.forEach((items) => {
      // gom mảnh chữ cùng hàng: lệch y ≤ ~40% cỡ chữ (không chia theo ô cố định để khỏi tách 1 hàng thành 2)
      const rowsArr = [];
      items.filter((it) => String(it.s).trim()).sort((a, b) => b.y - a.y).forEach((it) => {
        const tol = Math.max(2, (it.h || 8) * 0.4);
        const r = rowsArr.find((x) => Math.abs(x.y - it.y) <= tol);
        if (r) r.items.push(it); else rowsArr.push({ y: it.y, items: [it] });
      });
      // mảnh chữ sát nhau (vd "HÓA ĐƠ" + "N") ghép liền, cách xa thì thêm khoảng trắng
      rowsArr.sort((a, b) => b.y - a.y).forEach((row) => {
        const it = row.items.sort((a, b) => a.x - b.x); let out = '';
        it.forEach((o, k) => {
          const prev = it[k - 1];
          const gap = prev && prev.w ? o.x - (prev.x + prev.w) : 99;
          out += (k && gap > Math.max(1, (o.h || prev.h || 8) * 0.18) ? ' ' : '') + o.s;
        });
        lines.push(out.replace(/\s+/g, ' ').trim());
      });
    });
    return lines.join('\n');
  }

  function classify(t) {
    const u = String(t).normalize('NFC').toUpperCase();
    if (/ARRIVAL\s*NOTICE|NOTICE\s*OF\s*ARRIVAL|GIẤY\s*BÁO\s*HÀNG\s*ĐẾN|THÔNG\s*BÁO\s*HÀNG\s*ĐẾN|GIẤY BÁO NHẬN HÀNG/.test(u)) return 'an';
    if (/HÓA\s*ĐƠN\s*GIÁ\s*TRỊ\s*GIA\s*TĂNG|HOÁ\s*ĐƠN\s*GIÁ\s*TRỊ\s*GIA\s*TĂNG|HÓA\s*ĐƠN\s*ĐIỆN\s*TỬ|HOÁ\s*ĐƠN\s*ĐIỆN\s*TỬ|MÃ CỦA CƠ QUAN THUẾ|HÓA ĐƠN BÁN HÀNG/.test(u)) return 'vat';
    if (/DEBIT\s*NOTE|FREIGHT\s*INVOICE|INSURANCE\s*(POLICY|CERTIFICATE)|ĐƠN BẢO HIỂM|GIẤY CHỨNG NHẬN BẢO HIỂM/.test(u)) return 'fee';
    if (/CONTRACT|HỢP ĐỒNG|HOP DONG/.test(u) && /SELLER|BÊN BÁN/.test(u) && /BUYER|BÊN MUA/.test(u) && /ARTICLE|ĐIỀU\s*\d|TERMS/.test(u)) return 'hd';
    if (/CERTIFICATE OF ORIGIN|FORM\s+E\b|ACFTA/.test(u)) return 'co';
    if (/PACKING\s*LIST/.test(u)) return 'pl';
    if (/COMMERCIAL\s*INVOICE|\bINVOICE\b/.test(u) && !/BILL OF LADING|SHIPPED ON BOARD/.test(u)) return 'ci';
    if (/BILL OF LADING|SHIPPED ON BOARD|CY-CY|CONTAINER\(S\)|B\/L/.test(u)) return 'bill';
    return null;
  }

  function findInvNo(u) {
    let m = u.match(/INVOICE\s*(?:NO|NUMBER)\.?\s*:?[^\n]{0,40}?\b([A-Z]{0,6}[-\/]?\d{4,}[A-Z0-9\-\/]*)/);
    if (m) return m[1];
    m = u.match(/\b([A-Z]{1,6}\d{6,}(?:[-\/]\d+)?)\b/);
    return m ? m[1] : undefined;
  }

  function bill(t) {
    const o = {}; const u = String(t).toUpperCase(); let m;
    if ((m = u.match(/B\/L\s*NO\.?\s*:?\s*([A-Z0-9]{8,})/))) o.blNo = m[1];
    else if ((m = u.match(/\b([A-Z]{3,6}\d{6,})\b/))) o.blNo = m[1];
    if ((m = u.match(/ON\s*BOARD\s*:?\s*(.{0,30})/))) { const d = findDates(m[1]); if (d.length) o.blDate = d[0].v; }
    if (!o.blDate) { const d = findDates(u); if (d.length) o.blDate = d[d.length - 1].v; }
    if ((m = u.match(/VESSEL[^\n]*?(?:VOY(?:AGE)?\.?\s*(?:NO\.?)?|NO\.?)\s*:?\s*([A-Z][A-Z0-9 .\-]{4,40})/))) o.vessel = m[1].trim();
    if (o.vessel && /PORT|PLACE|LOADING|DISCHARGE|RECEIPT|DELIVERY|VOYAGE|VESSEL/.test(o.vessel)) delete o.vessel;   // đọc nhầm nhãn cột
    const L = u.split('\n').map((s) => s.trim());
    if (!o.vessel) {
      const v = L.find((s) => /^(MSC|MAERSK|CMA|COSCO|ONE |EVER|OOCL|WAN HAI|YM |HMM|ZIM|SITC|KMTC|TS LINES|HAPAG|PIL|INTERASIA|XIN|CSCL|APL)[A-Z0-9 .\-]*\s[A-Z0-9]{3,8}$/.test(s));
      if (v) o.vessel = v;
    }
    for (const k in POL) { if (L.some((s) => s === k) || new RegExp('PORT OF LOADING[^\\n]*' + k).test(u)) { o.pol = k; break; } }
    if (!o.pol) for (const k in POL) { if (u.includes(k)) { o.pol = k; break; } }
    // HBL không ghi nhãn: tên tàu + số chuyến thường nằm cùng hàng, ngay trước cảng xếp (vd "IAL 001 S230 NANSHA,CHINA")
    if (!o.vessel && o.pol) {
      const vl = L.find((s) => new RegExp('^(.+?)\\s+' + o.pol + '\\b').test(s) && !/PORT|PLACE|LOADING|RECEIPT/.test(s));
      const v = vl && vl.match(new RegExp('^(.+?)\\s+' + o.pol + '\\b'))[1].trim();
      if (v && /[A-Z]/.test(v) && /\d/.test(v) && v.length <= 40) o.vessel = v;
    }
    for (const [re] of POD) {
      const mm = u.match(new RegExp('HO CHI MINH\\s*\\(?\\s*(' + re.source + ')\\s*\\)?', 'i'));
      if (mm) { o.pod = 'HO CHI MINH(' + mm[1].toUpperCase() + ')'; break; }
      if (!o.pod && re.test(u)) o.pod = u.match(re)[0];
    }
    const cs = [...u.matchAll(/([A-Z]{4}\d{7})\s*\/\s*(\d{2})'?\s*(HQ|HC|GP|DC|RF|OT)/g)].map((x) => `${x[1]} / ${x[2]}${x[3]}`);
    if (cs.length) o.cont = [...new Set(cs)].join(', ');
    if ((m = u.match(/(\d[\d,.]*)\s*(?:CARTONS|CTNS|PACKAGES|PKGS)\b/))) o.pkgs = num(m[1]);
    if ((m = u.match(/(\d[\d,.]*)\s*KGS?\b/))) o.gw = num(m[1]);
    if ((m = u.match(/(\d[\d,.]*)\s*CBM\b/))) o.cbm = num(m[1]);
    const hsAll = [...u.matchAll(/HS\s*CODE\s*:?\s*([\d.]{4,12})/g)].map((x) => x[1].replace(/\D/g, ''));
    if (hsAll.length) o.blHs = [...new Set(hsAll)].join(',');
    return o;
  }

  const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  function ci(t) {
    const o = {}; const u = String(t).toUpperCase(); let m;
    o.invNo = findInvNo(u);
    if ((m = u.match(/DATE(?:\s*OF\s*INVOICE)?\.?\s*:?\s*(.{0,30})/))) { const d = findDates(m[1]); if (d.length) o.invDate = d[0].v; }
    for (const x of u.matchAll(/\b(FOB|CIF|CFR|CNF|EXW|FCA|DAP|DDP)\s+([A-Z]{3,})/g)) {
      if (!/^(PRICE|VALUE|TERM|TERMS|AMOUNT)$/.test(x[2])) { o.incoterm = x[1] + ' ' + x[2]; break; }
    }
    const lines = [];
    u.split('\n').forEach((s) => {
      const r = s.match(/^\s*([A-Z0-9][A-Z0-9\-\/.]{2,})\s+(.+?)\s+(\d[\d.,]*)\s*(PCS|PC|SETS|SET|UNITS|UNIT)\s+(?:USD|US\$)?\s*([\d.,]+)\s+(?:USD|US\$)?\s*([\d.,]+)/);
      if (!r || r[1] === 'TOTAL') return;
      // "mã" không có số (vd MAIN BODY …) → dòng không có mã hàng, cả cụm là mô tả (thường là linh kiện)
      const coded = /\d/.test(r[1]) || /-/.test(r[1]);
      lines.push({ code: coded ? r[1] : '', name: titleCase(coded ? r[2] : r[1] + ' ' + r[2]), qty: num(r[3]), unit: r[4], price: num(r[5]), amount: num(r[6]) });
    });
    if (!lines.length) lines.push(...ciGeneric(u));
    if (lines.length) o.lines = lines;
    if ((m = u.match(/TOTAL[^\n]*?(?:USD|US\$)\s*([\d.,]+)\s*$/m))) o.invTotal = num(m[1]);
    else if (lines.length) o.invTotal = lines.reduce((a, b) => a + b.amount, 0);
    return o;
  }

  /* Invoice khác mẫu: mỗi dòng tìm bộ 3 số SL × Đơn giá = Thành tiền (theo thứ tự trên dòng),
     phần chữ phía trước là mã + tên hàng. Không phụ thuộc vị trí cột hay tên cột. */
  const UNIT_RE = /^(PCS|PC|PCE|SETS|SET|UNITS|UNIT|CTNS|CTN|CARTONS|BOX|BOXES|PAIRS|PR|NOS|EA)$/;
  function ciGeneric(u) {
    const out = [];
    u.split('\n').forEach((line) => {
      if (/^\s*(TOTAL|SUB\s*TOTAL|GRAND|SAY|TỔNG)/.test(line)) return;
      const toks = [...line.matchAll(/(?:US\$|USD|\$)?\s*(\d[\d.,]*)/g)].map((x) => ({ i: x.index, end: x.index + x[0].length, v: num(x[1]), raw: x[1] }));
      // dòng F.O.C 1 hàng (bản scan): "<mô tả> 40 PCS 0,50 F.O.C"
      if (/F\.?\s*O\.?\s*C/.test(line) && toks.length >= 2 && Math.abs(toks[0].v - Math.round(toks[0].v)) < 1e-6) {
        const q = toks[toks.length - 2], pr = toks[toks.length - 1];
        if (Math.abs(q.v - Math.round(q.v)) < 1e-6 && q.v > 0) {
          const words = line.slice(0, q.i).trim().split(/\s+/).filter((w) => w && !UNIT_RE.test(w)); if (/^\d{1,3}\.?$/.test(words[0] || '')) words.shift();
          const ci0 = words.findIndex((w) => /\d/.test(w) && /[A-Z]/.test(w) && w.length >= 3);
          const code = ci0 >= 0 && ci0 <= 1 ? words.splice(ci0, 1)[0] : '';
          out.push({ code, name: titleCase(words.join(' ')), qty: q.v, unit: 'PCS', price: pr.v, amount: 0, foc: true, spare: /SPARE|PARTS?\b/.test(line) }); return;
        }
      }
      if (toks.length < 3) return;
      let best = null;
      for (let a = 0; a < toks.length - 2; a++) for (let b = a + 1; b < toks.length - 1; b++) for (let c = b + 1; c < toks.length; c++) {
        const q = toks[a].v, p = toks[b].v, amt = toks[c].v;
        if (!(q > 0 && p > 0 && amt > 0) || Math.abs(q - Math.round(q)) > 1e-6) continue;
        if (Math.abs(q * p - amt) <= Math.max(0.011, amt * 0.002)) best = { a, b, c };
      }
      if (!best) return;
      const head = line.slice(0, toks[best.a].i).trim();
      const after = line.slice(toks[best.a].end, toks[best.b].i).trim().split(/\s+/)[0] || '';
      const words = head.split(/\s+/).filter(Boolean);
      if (!words.length) return;
      // bỏ số thứ tự đầu dòng ("1", "1.")
      if (/^\d{1,3}\.?$/.test(words[0])) words.shift();
      const ci0 = words.findIndex((w) => /\d/.test(w) && /[A-Z]/.test(w) && w.length >= 3);
      const code = ci0 >= 0 && ci0 <= 1 ? words.splice(ci0, 1)[0] : '';
      const name = words.filter((w) => !UNIT_RE.test(w) && !/^(USD|US\$)$/.test(w)).join(' ');
      const unit = UNIT_RE.test(after) ? after : 'PCS';
      out.push({ code: code.replace(/[.,;:]+$/, ''), name: titleCase(name), qty: toks[best.a].v, unit, price: toks[best.b].v, amount: toks[best.c].v });
    });
    return out;
  }

  /* Invoice PDF có bảng nhiều dòng trong 1 ô (mô tả xuống dòng, cột Thành tiền ghi "F.O.C"…): đọc theo TOẠ ĐỘ.
     1. Tìm dòng tiêu đề (ITEM / DESCRIPTION / QUANTITY / PRICE / AMOUNT, EN hoặc VN) → vị trí x của từng cột.
     2. Dòng "neo" = dòng có số ở cột Số lượng. Các dòng chữ khác (phần mô tả xuống dòng trên / dưới) gán cho dòng neo gần nhất theo chiều dọc.
     3. Thành tiền là "F.O.C" / "FREE" → hàng tặng (foc), không tính vào tổng Invoice. */
  const COLS = [['qty', /quantity|q'?ty|số\s*lượng|so luong/i], ['price', /unit\s*price|price|đơn\s*giá|don gia/i], ['amount', /amount|total\s*value|thành\s*tiền|thanh tien|value/i],
    ['code', /^(items?|item\s*no|model|code|art(icle)?|mã)/i], ['desc', /descriptions?|commodity|goods|tên\s*hàng|mô\s*tả|product/i], ['unit', /^(unit|uom|đvt)$/i]];
  function ciTable(pages) {
    const out = [];
    (pages || []).forEach((items) => {
      const toks = items.filter((t) => String(t.s).trim()).map((t) => ({ s: String(t.s).trim(), x: t.x, y: t.y, w: t.w || 0, cx: t.x + (t.w || 0) / 2 }));
      // dòng tiêu đề: có cột số lượng và (đơn giá hoặc thành tiền) trên cùng một dải y (±14)
      const qh = toks.filter((t) => COLS[0][1].test(t.s));
      let col = null, hy = null;
      for (const q of qh) {
        const band = toks.filter((t) => Math.abs(t.y - q.y) <= 14);
        const c = {};
        band.forEach((t) => { for (const [k, re] of COLS) if (c[k] === undefined && re.test(t.s)) { c[k] = t.cx; break; } });
        if (c.price !== undefined || c.amount !== undefined) { col = c; hy = Math.min(...band.map((t) => t.y)); break; }
      }
      if (!col) return;
      const totalTok = toks.find((t) => t.y < hy && /^(total|sub\s*total|grand\s*total|tổng)/i.test(t.s));
      const floor = totalTok ? totalTok.y + 3 : -1e9;
      const body = toks.filter((t) => t.y < hy - 2 && t.y > floor);
      const keys = Object.keys(col);
      const nearest = (t) => keys.reduce((a, k) => (Math.abs(col[k] - t.cx) < Math.abs(col[a] - t.cx) ? k : a), keys[0]);
      body.forEach((t) => { t.col = nearest(t); });
      const isNum = (s) => /^[$¥€]?\s*-?\d[\d.,]*$/.test(s.replace(/^(USD|US\$)/i, '').trim());
      const anchorsY = [...new Set(body.filter((t) => t.col === 'qty' && isNum(t.s) && num(t.s.replace(/[^\d.,-]/g, '')) > 0).map((t) => Math.round(t.y)))].sort((a, b) => b - a);
      if (!anchorsY.length) return;
      const rows = anchorsY.map((y) => ({ y, toks: [] }));
      body.forEach((t) => { const r = rows.reduce((a, b) => (Math.abs(b.y - t.y) < Math.abs(a.y - t.y) ? b : a)); r.toks.push(t); });
      rows.forEach((r) => {
        const cell = (k) => r.toks.filter((t) => t.col === k).sort((a, b) => b.y - a.y || a.x - b.x).map((t) => t.s).join(' ').replace(/\s+/g, ' ').replace(/-\s+(?=[A-Z0-9])/g, '-').trim();
        const n = (k) => { const v = cell(k).replace(/^(USD|US\$)/i, '').replace(/[^\d.,-]/g, ''); return v ? num(v) : NaN; };
        const qty = n('qty'); const price = n('price'); const amtTxt = cell('amount');
        const foc = /F\.?\s*O\.?\s*C|FREE/i.test(amtTxt);
        let amount = foc ? 0 : n('amount'); if (!(amount >= 0) && qty > 0 && price > 0) amount = Math.round(qty * price * 100) / 100;
        let code = cell('code'); let name = cell('desc');
        if (col.code === undefined || !code) { const m = name.match(/^([A-Z0-9][A-Z0-9\-\/.]{2,})\s+(.*)$/i); if (m && /\d/.test(m[1])) { code = m[1]; name = m[2]; } }
        const spare = /spare|parts?|accessor|phụ\s*kiện|linh\s*kiện/i.test(code);
        if (!/\d/.test(code)) code = '';
        if (!(qty > 0)) return;
        out.push({ code: code.toUpperCase(), name: name || cell('code'), qty, unit: cell('unit') || 'PCS', price: price || 0, amount, foc, spare });
      });
    });
    return out;
  }

  /* Invoice / Packing List dạng Excel: tìm dòng tiêu đề theo tên cột (EN / VN), đọc các dòng bên dưới */
  const HEAD = {
    code: /^(model|item\s*(no|code)?|code|art(icle)?\s*no|sku|part\s*no|mã(\s*hàng)?|ma hang|product\s*code|style)/,
    name: /(description|desc|product\s*name|commodity|goods|name|tên\s*hàng|ten hang|mô tả)/,
    qty: /^(q'?ty|quantity|qty\s*\(?pcs\)?|số\s*lượng|so luong|sl|pcs)$|quantity|q'?ty/,
    unit: /^(unit|uom|đvt|dvt|đơn vị)$/,
    price: /(unit\s*price|price|đơn\s*giá|don gia|u\/price)/,
    amount: /(amount|total\s*(value|amount|price)?|value|thành\s*tiền|thanh tien)/,
    pkgs: /(ctns|cartons|no\.?\s*of\s*(pkgs|packages|ctns)|pkgs|packages|số\s*kiện|so kien)/,
    gw: /(g\.?\s*w|gross)/, nw: /(n\.?\s*w|net)/, cbm: /(cbm|meas|m3|volume)/,
  };
  function sheetRows(aoa) {
    const norm = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    let hi = -1, map = null;
    for (let r = 0; r < Math.min(aoa.length, 40) && hi < 0; r++) {
      const row = (aoa[r] || []).map(norm); const m = {};
      row.forEach((c, i) => { if (!c) return; for (const k of ['price', 'amount', 'qty', 'code', 'name', 'unit', 'pkgs', 'gw', 'nw', 'cbm']) if (m[k] === undefined && HEAD[k].test(c)) { m[k] = i; break; } });
      if (m.qty !== undefined && (m.price !== undefined || m.amount !== undefined || m.gw !== undefined)) { hi = r; map = m; }
    }
    if (hi < 0) return { rows: [], meta: {} };
    const rows = [];
    for (let r = hi + 1; r < aoa.length; r++) {
      const row = aoa[r] || []; const g = (k) => (map[k] === undefined ? '' : row[map[k]]);
      const first = norm(row.find((c) => norm(c)) || '');
      if (/^(total|tổng|sub total|grand total|say)/.test(first)) break;
      const qty = num(g('qty'));
      if (!(qty > 0)) continue;
      rows.push({ code: String(g('code') || '').trim(), name: String(g('name') || '').trim(), qty, unit: String(g('unit') || 'PCS').toUpperCase(), price: num(g('price')), amount: num(g('amount')),
        pkgs: num(g('pkgs')), gw: num(g('gw')), nw: num(g('nw')), cbm: num(g('cbm')) });
    }
    // số / ngày hoá đơn: ô có chữ "Invoice No" / "Date" → ô kế bên hoặc phần sau dấu ":"
    const meta = {};
    aoa.slice(0, hi).forEach((row) => (row || []).forEach((c, i) => {
      const t = String(c ?? ''); const nx = String((row || [])[i + 1] ?? (row || [])[i + 2] ?? '');
      if (!meta.invNo && /invoice\s*(no|number)|số\s*hóa\s*đơn|inv\.?\s*no/i.test(t)) meta.invNo = (t.split(/[:：]/)[1] || nx).trim();
      if (!meta.invDate && /^\s*(date|ngày)/i.test(t)) { const d = findDates((t.split(/[:：]/)[1] || '') + ' ' + nx); if (d.length) meta.invDate = d[0].v; }
    }));
    return { rows, meta };
  }

  function pl(t) {
    const o = {}; const u = String(t).toUpperCase(); let m;
    o.plInv = findInvNo(u);
    const tl = u.split('\n').find((s) => /^\s*TOTAL/.test(s)) || u;
    if ((m = tl.match(/([\d.,]+)\s*(?:PCS|SETS|UNITS)/))) o.plQty = num(m[1]);
    if ((m = tl.match(/([\d.,]+)\s*(?:CTNS|CARTONS|PKGS)/))) o.plPkgs = num(m[1]);
    const kg = [...tl.matchAll(/([\d.,]+)\s*KGS?/g)].map((x) => num(x[1]));
    if (kg[0]) o.plGw = kg[0];
    if (kg[1]) o.plNw = kg[1];
    return o;
  }

  function co(t) {
    const o = {}; const u = String(t).toUpperCase(); let m;
    if ((m = u.match(/REFERENCE\s*NO\.?\s*:?\s*([A-Z0-9]{8,})/))) o.coNo = m[1];
    if ((m = u.match(/FORM\s+(E|D|AK|AJ|AI|VK|VJ|AANZ|EAV|RCEP)\b/))) o.coForm = m[1];
    if ((m = u.match(/\((\d[\d,]*)\)\s*CARTONS/)) || (m = u.match(/(\d[\d,]*)\s*CARTONS/))) o.coPkgs = num(m[1]);
    if ((m = u.match(/(\d[\d,.]*)\s*KGS?\s*G\.?\s*W/))) o.coGw = num(m[1]);
    const d = findDates(u).map((x) => x.v).sort();
    if (d.length) o.coDate = d[d.length - 1];       // ngày cấp = ngày muộn nhất trên C/O
    o.coText = u.replace(/\s+/g, ' ').slice(0, 4000);
    return o;
  }

  /* OCR hay đọc nhầm số trong ngày: O→0, S→5, I/l/|→1 (chỉ sửa trong cụm "05th", "0S/10") */
  function fixOcrDigits(t) {
    return String(t)
      .replace(/\b([0-9OSIl|]{1,2})(st|nd|rd|th)\b/gi, (m, d, suf) => d.replace(/[Oo]/g, '0').replace(/S/g, '5').replace(/[Il|]/g, '1') + suf)
      .replace(/\b([0-9OSIl]{1,2})\/([0-9OSIl]{1,2})\/(\d{4})\b/g, (m, a, b, y) => [a, b].map((x) => x.replace(/O/g, '0').replace(/S/g, '5').replace(/[Il]/g, '1')).join('/') + '/' + y);
  }
  const STOP = /^(TEL|PHONE|FAX|MOBILE|E-?MAIL|REPRESENTED|HEREINAFTER|ACCOUNT|BANK|TAX|MST|ĐIỆN THOẠI|ĐẠI DIỆN|WEBSITE|CONTACT|AND\s*:|ATTN)/i;
  function contract(text) {
    const t = fixOcrDigits(String(text).replace(/\r/g, ''));
    const L = t.split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const o = {}; let m;
    if ((m = t.match(/(?:CONTRACT|HỢP ĐỒNG)\s*(?:NO|NUMBER|SỐ)\.?\s*[:.]?\s*([A-Z0-9][A-Z0-9\-\/._']{3,})/i))) o.contractNo = m[1].replace(/['.]+$/g, '').replace(/'/g, '').toUpperCase();
    // ngày ký: dòng "Date" đầu tiên (thường ngay dưới số hợp đồng)
    const iNo = L.findIndex((l) => /CONTRACT\s*NO|HỢP ĐỒNG\s*SỐ/i.test(l));
    for (let i = Math.max(0, iNo); i < Math.min(L.length, iNo + 4); i++) {
      const d = /DATE|NGÀY|DATED/i.test(L[i]) ? findDates(L[i]) : [];
      if (d.length) { o.contractDate = d[0].v; break; }
    }
    // ngày ghi lại ở điều khoản hiệu lực ("contract no. … dated 05th May, 2025") — để so khớp
    if ((m = t.match(/DATED\s+(.{0,30})/i))) { const d = findDates(m[1]); if (d.length) o.contractDate2 = d[0].v; }
    if (!o.contractDate && o.contractDate2) o.contractDate = o.contractDate2;
    // hết hạn
    for (const em of t.matchAll(/(?:\bTERMI\w*|EXPIR\w*|VALID\s+(?:UNTIL|TILL|TO)|EFFECTIVE\s+(?:UNTIL|TILL|TO)|HIỆU LỰC ĐẾN|HẾT HẠN|END\s*DATE)([\s\S]{0,60})/gi)) {
      const d = findDates(em[1]);
      if (d.length) { o.contractEnd = d[0].v; break; }
      if ((m = em[1].match(/\b(\d{1,2})\s*[\/.\-]\s*(\d{4})\b/)) && +m[1] >= 1 && +m[1] <= 12) {
        const last = new Date(+m[2], +m[1], 0).getDate(); o.contractEnd = iso(m[2], m[1], last); o.endGuess = true; break;
      }
    }
    // bên bán: khối dòng phía trước "called The Seller" / "(the Seller)" / "Bên bán"
    let iS = L.findIndex((l) => /(?:CALLED|AS)\s*[“"'‘]?\s*THE\s*SELLER|\(\s*THE\s*SELLER|^SELLER\s*:|^THE SELLER\s*:|BÊN BÁN/i.test(l));
    if (iS >= 0) {
      const from = /^(THE\s*)?SELLER\s*:|BÊN BÁN\s*:/i.test(L[iS]) ? iS : Math.max(0, iS - 8);
      const block = L.slice(from, iS + (from === iS ? 8 : 1));
      const nameLine = block.find((l) => /(CO\b|CO\.|LTD|LIMITED|CORP|COMPANY|INC\b)/i.test(l) && !/^ADDRESS/i.test(l));
      if (nameLine) o.sellerName = nameLine.replace(/^(BETWEEN|THE\s*SELLER|SELLER|BÊN BÁN|NAME)\s*:?\s*/i, '').replace(/CO\s*[,.]+\s*,?\s*LTD\.?/i, 'CO., LTD').replace(/\s+/g, ' ').trim();
      const ia = block.findIndex((l) => /^(ADDRESS|ADD|ĐỊA CHỈ)\s*[:.]/i.test(l));
      if (ia >= 0) {
        const parts = [block[ia].replace(/^(ADDRESS|ADD|ĐỊA CHỈ)\s*[:.]\s*/i, '')];
        for (let j = ia + 1; j < block.length && !STOP.test(block[j]) && parts.length < 3; j++) parts.push(block[j]);
        o.sellerAddr = parts.join(', ').replace(/\s*,\s*,/g, ',').trim();
      }
    }
    // nhãn hiệu: "Brand name: X" / "Brand: X" / "Nhãn hiệu: X" (bỏ qua câu thường như "100% new brand, All the goods")
    if ((m = t.match(/BRAND\s*NAME\s*[:.]?\s*([A-Za-z][A-Za-z0-9&\-]*)/i)) || (m = t.match(/(?:^|\n|-)\s*BRAND\s*:\s*([A-Za-z][A-Za-z0-9&\-]*)/i))
      || (m = t.match(/NHÃN HIỆU\s*:\s*([A-Za-z][A-Za-z0-9&\-]*)/i))) o.brand = m[1];
    return o;
  }

  /* ---------- TEM PHỤ có sẵn (chữ từ PDF / .ai / ảnh OCR tiếng Việt) → các ô tem ----------
     Không đọc mã vạch. Nhận các nhãn: Model, Điện áp, Công suất, Sản xuất, Số lượng, Điều khiển, Kích thước sản phẩm / đóng gói,
     Khối lượng sản phẩm / đóng gói, Nhà sản xuất (+ Địa chỉ), Nhà NK & PP (+ Địa chỉ). Dòng tiêu đề chữ in = tên hàng + nhãn hiệu + model.
     Dòng không có nhãn nằm giữa thông số và "Nhà sản xuất" = chức năng nổi bật; dòng ngay sau "Địa chỉ" không có nhãn = phần tiếp của địa chỉ. */
  const fold = (s) => Array.from(String(s)).map((c) => (c === 'đ' ? 'd' : c === 'Đ' ? 'D' : c.normalize('NFD')[0])).join('').toLowerCase();
  const TEM_WORDS = ['model', 'dien ap', 'cong suat', 'san xuat', 'so luong', 'dieu khien', 'kich thuoc san pham', 'kich thuoc dong goi', 'khoi luong san pham',
    'khoi luong dong goi', 'nha san xuat', 'nha nk & pp', 'nha nk', 'nha nhap khau va phan phoi', 'nha nhap khau', 'dia chi', 'xuat xu', 'ma vach', 'barcode'];
  // OCR hay dính chữ ("Điệnáp", "Sốlượng") → khoảng trắng trong nhãn là tuỳ chọn
  const lab = (w) => w.split(' ').map((x) => x.replace('&', '\\s*&\\s*')).join('\\s*');
  const TEM_LABEL = new RegExp('(' + TEM_WORDS.map((w) => (w === 'san xuat' ? '(?<!nha\\s?)' + lab(w) : w === 'dieu khien' ? lab(w) + '(?=\\s*[:.])' : lab(w))).join('|') + ')\\s*[.:]?\\s*:?\\s*', 'g');
  const TEM_KEY = { model: 'model', dienap: 'voltage', congsuat: 'power', sanxuat: 'year', soluong: 'pack', dieukhien: 'control',
    kichthuocsanpham: 'sizeP', kichthuocdonggoi: 'sizeBox', khoiluongsanpham: 'wP', khoiluongdonggoi: 'wBox', nhasanxuat: 'makerVi',
    diachi: 'addr', xuatxu: 'origin', mavach: 'skip', barcode: 'skip' };
  const END = '(?=[\\s,.;]|$)';
  const OCR_FIX = [[new RegExp('([Tt]hành )ph[óôòồỏổ]' + END, 'g'), '$1phố'], [new RegExp('ĐÀU TƯ' + END, 'g'), 'ĐẦU TƯ'], [new RegExp('([Đđ])àu tư' + END, 'g'), '$1ầu tư'],
    [new RegExp('Tĩnh' + END, 'g'), 'Tỉnh'], [new RegExp('Qu[ộọồ]c' + END, 'g'), 'Quốc'], [/\s+([,.;])/g, '$1']];
  const cleanVal = (v) => OCR_FIX.reduce((a, [re, to]) => a.replace(re, to), String(v))
    .replace(/(\s+\d{6,8})+\s*$/, '')                  // số của mã vạch dính cuối dòng
    .replace(/\s+[|Il1\s]*\|[|Il1\s]*$/, '')            // vạch của mã vạch đọc thành | | |
    .replace(/[\s.,;:]+$/, '').replace(/\s+/g, ' ').trim();
  function tem(text) {
    const lines = String(text).split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const o = {}; let last = null; let afterSpecs = false;
    const iModel = lines.findIndex((l) => /^model\b/.test(fold(l)));
    lines.forEach((line, idx) => {
      const f = fold(line); const hits = [];
      let m; TEM_LABEL.lastIndex = 0;
      while ((m = TEM_LABEL.exec(f))) hits.push({ i: m.index, end: m.index + m[0].length, key: m[1].replace(/[\s&]+/g, '') });
      const ok = hits.filter((h) => h.i === 0 || /[\s.,;|]/.test(f[h.i - 1]));
      if (!ok.length || ok[0].i > 3) {
        // dòng không nhãn: tiếp địa chỉ / chức năng / tiêu đề
        if (/^(huong dan|xuat xu|trang \d)/.test(f)) { last = null; return; }
        if (last === 'makerAddrVi' || last === 'importerAddr') { o[last] = cleanVal(o[last] + ', ' + line); return; }
        if (afterSpecs && !o.feature && line.length > 15) { o.feature = cleanVal(line); return; }
        return;
      }
      ok.forEach((h, k) => {
        let key = TEM_KEY[h.key] || (/^nha(nk|nhap)/.test(h.key) ? 'importerName' : null);
        const val = cleanVal(line.slice(h.end, k + 1 < ok.length ? ok[k + 1].i : undefined));
        if (key === 'addr') key = last === 'makerVi' ? 'makerAddrVi' : last === 'importerName' ? 'importerAddr' : null;
        if (!key || key === 'skip' || key === 'origin') { last = null; return; }
        if (val && !o[key]) o[key] = val;
        last = key;
        if (['wP', 'wBox', 'sizeP', 'sizeBox', 'control', 'pack', 'year'].includes(key)) afterSpecs = true;
        if (key === 'makerVi' || key === 'importerName') afterSpecs = false;
      });
    });
    if (o.model) o.model = o.model.split(' ')[0].toUpperCase();
    if (o.year) o.year = (o.year.match(/\d{4}/) || [o.year])[0];
    if (o.voltage) o.voltage = o.voltage.replace(/\s*~\s*/, ' ~ ');
    // tiêu đề: dòng chữ in ngay trên dòng Model (hoặc dòng chữ in đầu tiên có model)
    const isCaps = (l) => { const letters = l.replace(/[^\p{L}]/gu, ''); return letters.length >= 8 && letters === letters.toUpperCase(); };
    let title = iModel > 0 && isCaps(lines[iModel - 1]) ? lines[iModel - 1] : lines.find((l) => isCaps(l) && (!o.model || l.toUpperCase().includes(o.model)));
    if (title) {
      o.title = title;
      let t = title.replace(/\s+/g, ' ').trim();
      if (o.model) t = t.replace(new RegExp('\\s*' + o.model.replace(/[-/.]/g, '\\$&') + '\\s*$', 'i'), '').trim();
      const w = t.split(' '); const lastW = w[w.length - 1];
      if (w.length > 1 && fold(lastW) === lastW.toLowerCase() && /^[A-Z][A-Z0-9&\-]{2,}$/.test(lastW)) { o.brand = lastW.charAt(0) + lastW.slice(1).toLowerCase(); w.pop(); }
      const name = w.join(' ').toLocaleLowerCase('vi');
      o.nameVi = name.charAt(0).toLocaleUpperCase('vi') + name.slice(1);
    }
    return o;
  }

  /* ---------- ARRIVAL NOTICE (giấy báo hàng đến của hãng tàu / forwarder) ----------
     → { anBl, anVessel, arrival (ETA), anPod, storeCode (mã địa điểm lưu kho dạng 02CIS02), anFreightUsd (cước O/F nếu AN có ghi) } */
  function an(t) {
    const u = String(t).toUpperCase(); const o = {}; let m;
    if ((m = u.match(/(?:B\/L|BILL OF LADING|HBL|MBL|SỐ VẬN ĐƠN)\s*(?:NO\.?|NUMBER|SỐ)?\s*[:.]?\s*([A-Z]{2,6}[A-Z0-9]*\d{4,}[A-Z0-9]*)/))) o.anBl = m[1];
    if ((m = u.match(/(?:VESSEL|TÊN TÀU|TÀU)\s*(?:\/\s*VOY(?:AGE)?\.?)?\s*(?:NAME)?\s*[:.]\s*([A-Z][A-Z0-9 .\-\/]{3,40})/))) o.anVessel = m[1].replace(/\s+(ETA|ETD|VOY|POL|POD|PORT)\b.*$/, '').replace(/\s*\/\s*/g, ' ').trim();
    const em = u.match(/(?:\bETA\b|ARRIVAL\s*DATE|DATE\s*OF\s*ARRIVAL|NGÀY\s*(?:TÀU\s*|HÀNG\s*)?ĐẾN|NGÀY\s*DỰ\s*KIẾN\s*ĐẾN)\s*[:.]?\s*(.{0,40})/);
    if (em) { const d = findDates(em[1]); if (d.length) o.arrival = d[0].v; }
    for (const [re] of POD) { if (re.test(u)) { o.anPod = u.match(re)[0]; break; } }
    if ((m = u.match(/\b(\d{2}[A-Z]{2,4}\d{2})\b/))) o.storeCode = m[1];
    if ((m = u.match(/(?:OCEAN\s*FREIGHT|SEA\s*FREIGHT|O\/F|CƯỚC\s*BIỂN)[^\n]{0,40}?(?:USD|US\$)\s*([\d.,]+)/)) || (m = u.match(/(?:OCEAN\s*FREIGHT|SEA\s*FREIGHT|O\/F)[^\n]{0,40}?([\d.,]+)\s*(?:USD|US\$)/))) o.anFreightUsd = num(m[1]);
    return o;
  }

  /* ---------- Phân loại phí trên hoá đơn: cước quốc tế / bảo hiểm / phí khác ----------
     Trị giá hải quan (FOB) chỉ cộng cước vận chuyển QUỐC TẾ tới cửa khẩu nhập + bảo hiểm — KHÔNG cộng phí local (THC, D/O, CIC, vệ sinh, nâng hạ…). */
  const LOCAL_RE = /\bthc\b|terminal|d\/o|delivery order|handling|\bcic\b|imbalance|cleaning|vệ sinh|nâng|hạ cont|lift|\bseal\b|\bebs\b|b\/l fee|chứng từ|documentation|doc fee|manifest|cfs|lưu kho|lưu cont|storage|demurrage|detention|trucking|vận chuyển nội địa|nội địa|telex|amendment|admin|phí dịch vụ|service/i;
  function feeKind(desc) {
    const d = String(desc || '');
    if (/bảo\s*hiểm|insurance|premium|\bphí bh\b/i.test(d)) return 'ins';
    if (LOCAL_RE.test(d)) return 'local';
    if (/cước|freight|\bo\/f\b|ocean|sea\s*freight|vận\s*(chuyển|tải)\s*(hàng\s*hóa\s*)?(quốc\s*tế|bằng\s*đường\s*biển)/i.test(d)) return 'freight';
    return 'other';
  }
  /* Debit note / hoá đơn tiếng Anh không theo mẫu VN: tìm dòng cước, bảo hiểm và số tiền (USD hoặc VND) */
  function feeLines(text, all) {
    const out = [];
    String(text).split('\n').forEach((line) => {
      const k = feeKind(line);
      if (all) { if (/^\s*(total|sub\s*total|grand|tổng|cộng|vat|thuế|amount in words|say)/i.test(line) || !/[a-zà-ỹ]{3}/i.test(line)) return; }
      else if (k !== 'freight' && k !== 'ins') return;
      const usd = line.match(/(?:USD|US\$)\s*([\d.,]+)|([\d.,]+)\s*(?:USD|US\$)/i);
      if (usd) out.push({ desc: line.trim(), kind: k, usd: num(usd[1] || usd[2]) });
      else { const v = [...line.matchAll(/\d[\d.,]*\d|\d/g)].map((x) => parseFloat(x[0].replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'))).filter((n) => n > 0);
        if (v.length) out.push({ desc: line.trim(), kind: k, vnd: v[v.length - 1] }); }      // VND: dấu . , là phân cách nghìn
    });
    return out;
  }

  /* Nhiều tem trong 1 file (nhiều trang / nhiều tem trên 1 trang) → tách theo từng dòng "Model" */
  function tems(text) {
    const lines = String(text).split('\n');
    const idx = lines.map((l, i) => (/^\s*model\b/.test(fold(l)) ? i : -1)).filter((i) => i >= 0);
    if (idx.length <= 1) { const one = tem(text); return Object.keys(one).length ? [one] : []; }
    const starts = idx.map((i) => { let s0 = i; for (let k = i - 1; k >= Math.max(0, i - 3); k--) { if (lines[k].trim()) { s0 = k; break; } } return s0; });
    return starts.map((st, n) => tem(lines.slice(st, n + 1 < starts.length ? starts[n + 1] : undefined).join('\n'))).filter((x) => x.model || x.nameVi);
  }

  const API = { num, findDates, linesFromPdfPages, classify, ciGeneric, ciTable, sheetRows, bill, ci, pl, co, contract, tem, tems, an, feeKind, feeLines, fixOcrDigits, POL, POD };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.CustomsParsers = API;
})(typeof window !== 'undefined' ? window : globalThis);
