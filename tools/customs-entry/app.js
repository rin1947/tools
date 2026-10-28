/* =========================================================
   Phiếu khai nhanh ECUS — LOGIC
   ---------------------------------------------------------
   • Đọc chứng từ (parsers.js): Bill, Invoice, Packing List, C/O, HỢP ĐỒNG.
       PDF có chữ → pdf.js; PDF scan / ảnh → OCR tesseract.js chạy trên máy; Word .docx → JSZip.
       Hợp đồng → số HĐ, ngày ký, ngày hết hạn, tên + địa chỉ bên bán, nhãn hiệu → lưu vào hồ sơ NCC
       (địa chỉ tách 4 dòng chữ in cho ECUS; bản tiếng Việt cho tem phụ — translate.js).
   • Mã HS + thuế suất: biểu thuế của tool Landed Cost (../landed-cost/tariff-data.js, hoặc biểu thuế
     người dùng nạp trong Landed Cost — IndexedDB 'landedcost' / khoá 'tariff') + điều chỉnh 'lc_ovr'.
       Thuế NK = ACFTA nếu có C/O Form E và xuất xứ CN (không thuộc danh sách loại trừ), ngược lại MFN.
       VAT    = cột VAT của biểu thuế; 8% chỉ đến 31/12/2026 (NQ 204/2025/QH15), sau đó tạm tính 10%.
     Mã HS của từng model lấy từ sản phẩm cùng mã trong Landed Cost (localStorage 'lc_products'),
     tra thêm theo từ khoá trong biểu thuế. Không ghi ngược vào dữ liệu của Landed Cost.
   • Thư viện model (lưu trên máy): mã HS, ĐVT, thông tin TEM PHỤ (tiếng Việt), hình, mô tả khai HQ.
       Mô tả khai HQ tự tạo từ tem: "<model>- <Tên hàng> <Nhãn hiệu> <model>; thương hiệu …; <đặc điểm>;
       Điện áp: …, Công suất: …; <quy cách>; hàng mới 100%" — sửa tay thì giữ bản sửa tay.
   • Ước tính thuế:
       Trị giá dòng (USD)   = SL × đơn giá
       Trị giá tính thuế    = trị giá dòng × tỷ giá + (cước + bảo hiểm) × trị giá dòng / tổng trị giá
                              (FOB / EXW / FCA cộng cước + bảo hiểm; CFR/CNF chỉ cộng bảo hiểm; CIF không cộng)
       Thuế NK  = trị giá tính thuế × %NK ;  Thuế VAT = (trị giá tính thuế + thuế NK) × %VAT
   • Xuất file danh sách hàng .xls (biff8) đúng 25 cột mẫu import ECUS5.
   ========================================================= */
(function () {
  const { parseNum, store } = GauBep;
  const P = window.CustomsParsers;
  const V = window.ViDict;
  GauBep.mountLayout({ title: 'Phiếu khai nhanh ECUS', icon: '🛃' });
  document.getElementById('bamboo').outerHTML = GauBep.bamboo();

  const KEY_SET = 'customs-entry-settings:v1';
  const KEY_LOT = 'customs-entry-lot:v1';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n, d = 3) => (isFinite(n) && n !== '' && n !== null ? Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d }) : '');
  const raw = (n) => (isFinite(n) && n !== '' && n !== null ? String(Math.round(n * 10000) / 10000) : '');
  const has = (v) => v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && isNaN(v));
  const dmy = (s) => (s ? s.split('-').reverse().join('/') : '');
  const ddmmyy = (s) => { if (!s) return ''; const [y, m, d] = s.split('-'); return d + m + y.slice(2); };
  const ddmmyyyy = (s) => { if (!s) return ''; const [y, m, d] = s.split('-'); return d + m + y; };
  const fmtHS = (c) => (c && c.length === 8 ? c.slice(0, 4) + '.' + c.slice(4, 6) + '.' + c.slice(6) : c || '');
  const normKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normTxt = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
  const UNIT_MAP = { PCS: 'PCE', PC: 'PCE', UNIT: 'PCE', UNITS: 'PCE', SETS: 'SET', SET: 'SET' };
  const uid = () => Math.random().toString(36).slice(2, 9);
  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Không tải được thư viện (kiểm tra mạng)')); document.head.append(s); });

  /* ======================= TRẠNG THÁI ======================= */
  const DEF_GEN = {
    loaiHinh: 'A11', coQuan: '', boPhan: '', pttt: 'TTR', ptvc: '9999', mpltg: '6', btFormE: 'B05', btVat: 'VB245',
    importerName: '', importerAddr: '',
    usage: 'Hướng dẫn sử dụng, cảnh báo an toàn: xem trên tài liệu đính kèm', storage: 'Hướng dẫn bảo quản: Nơi khô ráo, thoáng mát, tránh va đập.',
  };
  const GEN_FIELDS = [
    ['loaiHinh', 'Mã loại hình', 'A11 = nhập kinh doanh tiêu dùng'],
    ['coQuan', 'Cơ quan hải quan', 'Tên/mã chi cục tiếp nhận tờ khai, như trên tờ khai cũ'],
    ['boPhan', 'Mã bộ phận xử lý', ''],
    ['pttt', 'Phương thức thanh toán', 'vd TTR, LC, KC'],
    ['ptvc', 'Mã phương tiện vận chuyển', '9999 = tàu biển chưa có mã'],
    ['mpltg', 'Mã phân loại khai trị giá', ''],
    ['btFormE', 'Mã biểu thuế NK khi có Form E', 'Ghi vào cột "Mã biểu thuế NK" của file danh sách hàng'],
    ['btVat', 'Mã biểu thuế VAT', 'Ghi vào cột "Mã biểu thuế VAT" (vd mã áp dụng VAT 8%)'],
  ];
  const TEM_GEN = [
    ['importerName', 'Tem phụ — Nhà nhập khẩu & phân phối', 'Tên công ty nhập khẩu in trên tem'],
    ['importerAddr', 'Tem phụ — Địa chỉ nhà nhập khẩu', ''],
    ['usage', 'Tem phụ — dòng hướng dẫn sử dụng', ''],
    ['storage', 'Tem phụ — dòng hướng dẫn bảo quản', ''],
  ];
  let S = store.get(KEY_SET, null) || { gen: {}, sups: [], models: {} };
  S.gen = { ...DEF_GEN, ...(S.gen || {}) }; S.sups = S.sups || []; S.models = S.models || {};
  // bản cũ: model có mô tả gõ sẵn mà chưa có tem → giữ mô tả đó (coi như sửa tay)
  Object.values(S.models).forEach((m) => { if (!m.tem) { m.tem = {}; if (m.desc && m.descManual === undefined) m.descManual = true; } });
  const newLot = () => ({ docs: {}, supId: (S.sups[0] || {}).id || '', origin: 'CN', lines: [] });
  let L = store.get(KEY_LOT, null) || newLot();
  L.docs = L.docs || {}; L.lines = L.lines || [];
  const saveSet = () => store.set(KEY_SET, S);
  const saveLot = () => store.set(KEY_LOT, L);
  const sup = () => S.sups.find((x) => x.id === L.supId) || {};

  /* ======================= BIỂU THUẾ (từ Landed Cost) ======================= */
  let DB = null, DBsrc = '';
  const lcGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  function idbTariff() {
    return new Promise((res) => {
      try {
        const r = indexedDB.open('landedcost', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { try { const q = r.result.transaction('kv').objectStore('kv').get('tariff'); q.onsuccess = () => res(q.result); q.onerror = () => res(null); } catch (e) { res(null); } };
        r.onerror = () => res(null);
      } catch (e) { res(null); }
    });
  }
  async function loadTariff() {
    try {
      const saved = await idbTariff();
      let d;
      if (saved && saved.rows) { d = saved; DBsrc = 'biểu thuế đã nạp trong Landed Cost (' + (saved._name || 'file') + ')'; }
      else {
        if (!window.LC_TARIFF_B64) await loadScript('../landed-cost/tariff-data.js?v=20261026');
        const bin = Uint8Array.from(atob(window.LC_TARIFF_B64.trim()), (c) => c.charCodeAt(0));
        d = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
        DBsrc = 'biểu thuế có sẵn trong Landed Cost';
      }
      const ci = {}; d.cols.forEach((c, i) => { ci[c] = i; });
      DB = { ci, map: new Map(d.rows.map((r) => [r[0], r])), rows: d.rows.filter((r) => /^\d{8}$/.test(r[0])) };
      $('#tariffInfo').textContent = '📚 Thuế suất theo ' + DBsrc + '.';
      fillPartHS(); saveSet(); saveLot();
    } catch (e) {
      $('#tariffInfo').textContent = '⚠️ Không đọc được biểu thuế của Landed Cost — nhập thuế suất tay.';
    }
    renderAll();
  }
  function parseRate(s) {
    s = String(s ?? '').trim();
    if (!s || s === '*' || s === '-' || /^x$/i.test(s)) return null;
    const m = s.match(/^(\d+(?:[.,]\d+)?)/); if (!m) return null;
    const ex = []; const p = s.match(/\(-([^)]*)\)/); if (p) p[1].split(/[,\s]+/).forEach((x) => x && ex.push(x.trim().toUpperCase()));
    return { v: parseFloat(m[1].replace(',', '.')), ex };
  }
  function ovr(hs, field, date) {
    let best = null;
    lcGet('lc_ovr', []).forEach((o) => { if (o.hs === hs && o.field === field && (!o.from || o.from <= date) && (!best || o.from > best.from)) best = o; });
    return best;
  }
  const shortDesc = (r) => String(r[1] || '').split(' › ').slice(-2).join(' › ');
  /* Thuế suất cho 1 mã HS theo C/O của lô */
  function rateOf(hs) {
    hs = String(hs || '').replace(/\D/g, '');
    if (!DB || hs.length !== 8) return null;
    const r = DB.map.get(hs); if (!r) return { bad: true };
    const today = new Date().toISOString().slice(0, 10);
    const g = (k) => r[DB.ci[k]];
    let mfn = parseRate(g('mfn')); const om = ovr(hs, 'mfn', today); if (om) mfn = { v: om.v, ex: [] };
    let acfta = parseRate(g('acfta')); const oa = ovr(hs, 'acfta', today); if (oa) acfta = { v: oa.v, ex: [] };
    if (acfta && acfta.ex.includes(String(L.origin || 'CN').toUpperCase())) acfta = null;
    let vat = parseFloat(g('vat')); if (isNaN(vat)) vat = 10;
    if (vat === 8 && today > '2026-12-31') vat = 10;
    const ov = ovr(hs, 'vat', today); if (ov) vat = ov.v;
    const formE = has(L.coNo) && String(L.coForm || 'E').toUpperCase() === 'E' && String(L.origin || '').toUpperCase() === 'CN';
    const useE = formE && acfta;
    return { desc: shortDesc(r), mfn: mfn && mfn.v, acfta: acfta && acfta.v, nk: useE ? acfta.v : (mfn ? mfn.v : NaN), src: useE ? 'ACFTA' : 'MFN', vat, formE };
  }
  /* Tra biểu thuế theo từ khoá (không dấu) hoặc đầu mã số */
  let SEARCH = null;
  function searchTariff(q, limit = 12) {
    if (!DB) return [];
    const digits = String(q).replace(/[.\s]/g, '');
    if (/^\d{2,8}$/.test(digits)) return DB.rows.filter((r) => r[0].startsWith(digits)).slice(0, limit).map((r) => r[0]);
    const STOPW = new Set(['khong', 'co', 'va', 'cac', 'loai', 'khac', 'dung', 'cho', 'bang', 'cua', 'tu', 'den', 'qua', 'hoac', 'voi', 'mot', 'kieu', 'dang']);
    let toks = normTxt(q).split(' ').filter((t) => t.length > 1);
    if (toks.length > 1) toks = toks.filter((t) => !STOPW.has(t));
    if (!toks.length) return [];
    if (!SEARCH) SEARCH = DB.rows.map((r) => ({ c: r[0], n: ' ' + normTxt(r[1]) + ' ' }));
    // ưu tiên dòng chứa nhiều từ khác nhau nhất, sau đó số lần xuất hiện
    const occ = (n, t) => n.split(' ' + t + ' ').length - 1;
    return SEARCH.map((x) => ({ c: x.c, k: toks.filter((t) => occ(x.n, t)).length, s: toks.reduce((a, t) => a + Math.min(3, occ(x.n, t)), 0) }))
      .filter((x) => x.k).sort((a, b) => b.k - a.k || b.s - a.s || a.c.localeCompare(b.c)).slice(0, limit).map((x) => x.c);
  }

  /* ======================= LANDED COST ======================= */
  /* Bảng "từ khoá sản phẩm → mã HS" của Landed Cost: đọc thẳng từ ../landed-cost/app.js (const KEYWORDS=[…])
     để luôn dùng chung 1 nguồn; đọc không được (vd mở file trực tiếp không qua web) thì chỉ tra biểu thuế. */
  let LC_KW = [];
  async function loadLcKeywords() {
    try {
      const t = await (await fetch('../landed-cost/app.js', { cache: 'no-cache' })).text();
      const i = t.indexOf('const KEYWORDS='); if (i < 0) return;
      const j = t.indexOf(']];', i); if (j < 0) return;
      const arr = new Function('return ' + t.slice(i + 'const KEYWORDS='.length, j + 2))();
      LC_KW = arr.filter((k) => Array.isArray(k) && Array.isArray(k[1]) && Array.isArray(k[2])).map((k) => ({ label: k[0], keys: k[1], codes: k[2], note: k[3] || '' }));
      if (hsLine) renderHsPanel();
    } catch (e) { LC_KW = []; }
  }
  /* Gợi ý theo tên hàng (cùng cách Landed Cost): từ khoá dài, cụ thể được ưu tiên hơn từ chung như "quat" */
  function kwSuggest(text) {
    const n = normTxt(text); if (!n || !LC_KW.length) return [];
    const sc = [];
    LC_KW.forEach((k) => { let sv = 0; k.keys.forEach((key) => { if ((' ' + n + ' ').includes(' ' + key + ' ') || n.includes(key)) sv = Math.max(sv, 10 + key.length); }); if (sv) sc.push([sv, k]); });
    sc.sort((a, b) => b[0] - a[0]);
    const top = sc.length ? sc[0][0] : 0;
    return sc.filter((x) => x[0] >= top - 4).map((x) => x[1]).slice(0, 6);
  }
  const lcProducts = () => (lcGet('lc_products', []) || []).filter((p) => p && !p.sample && p.code);
  /* Sản phẩm Landed Cost cùng model: trùng mã, hoặc mã này chứa mã kia (≥ 5 ký tự) */
  function lcFind(code) {
    const k = normKey(code); if (!k) return null;
    const list = lcProducts();
    return list.find((p) => normKey(p.code) === k)
      || list.find((p) => { const c = normKey(p.code); return c.length >= 5 && k.length >= 5 && (c.includes(k) || k.includes(c)); }) || null;
  }
  const lcHS = (p) => { const h = String((p && p.hs) || '').replace(/\D/g, ''); return h.length === 8 ? h : ''; };

  /* ======================= THƯ VIỆN MODEL & TEM PHỤ ======================= */
  const modelOf = (code) => (code ? S.models[code] || S.models[String(code).toUpperCase()] || null : null);
  /* Tạo model mới (từ Invoice / gõ tay): HS + tên lấy từ Landed Cost nếu có */
  function ensureModel(code, invName) {
    if (!code) return null;
    let m = modelOf(code);
    if (m) { if (invName && !m.invName) m.invName = invName; return m; }
    const p = lcFind(code);
    m = S.models[code] = { hs: lcHS(p), hsSrc: lcHS(p) ? 'lc' : '', unit: 'PCE', bt: '', desc: '', descManual: false, tem: {}, img: '', invName: invName || '', supId: L.supId || '' };
    saveSet();
    return m;
  }
  const lineHS = (l) => (l.code ? (modelOf(l.code) || {}).hs || '' : l.hs || '');
  const lineUnit = (l) => (l.code ? (modelOf(l.code) || {}).unit || 'PCE' : l.unit || 'PCE');
  /* "chủ" của dòng: dòng có mã → model trong thư viện; dòng không mã → chính dòng đó */
  const holder = (l) => (l.code ? ensureModel(l.code) : l);
  const peek = (l) => (l.code ? modelOf(l.code) || {} : l);
  const isPart = (l) => !!peek(l).part;
  const enOf = (h) => h.en || h.invName || '';
  /* Mô tả tự động: linh kiện → dịch từ tên tiếng Anh + máy chính; hàng có tem → tạo từ tem */
  const autoDesc = (l) => { const h = peek(l); return h.part ? genPartDesc(h) : l.code ? genDesc(l.code) : (l.desc || ''); };
  const lineDesc = (l) => { const h = peek(l); if (h.part) return h.descManual && h.desc ? h.desc : genPartDesc(h); return l.code ? descOf(l.code) : l.desc || ''; };
  const mainCodes = () => [...new Set(L.lines.filter((l) => l.code && !isPart(l)).map((l) => l.code))];
  const lineAmt = (l) => Math.round((parseNum(l.qty) * parseNum(l.price)) * 100) / 100;

  const TEM_FIELDS = [
    ['nameVi', 'Tên hàng (tiếng Việt)', ''], ['brand', 'Nhãn hiệu', ''], ['kind', 'Đặc điểm khai HQ', 'vd Dạng quạt đứng — chỉ đưa vào mô tả khai hải quan'],
    ['voltage', 'Điện áp', 'vd 220V ~ 50Hz'], ['power', 'Công suất', 'vd 40W'], ['year', 'Năm sản xuất', ''], ['pack', 'Số lượng / quy cách', 'vd 1 cái / thùng'],
    ['control', 'Điều khiển', 'vd Giọng nói / Chạm / Remote'], ['sizeP', 'Kích thước sản phẩm', 'vd 345X330X1178mm'], ['sizeBox', 'Kích thước đóng gói', ''],
    ['wP', 'Khối lượng sản phẩm', 'vd 4.75Kg'], ['wBox', 'Khối lượng đóng gói', ''], ['feature', 'Chức năng nổi bật', '1 dòng mô tả tính năng'],
    ['barcode', 'Mã vạch EAN-13', '13 số (hoặc 12 số, tool tự thêm số kiểm tra)'], ['makerVi', 'Nhà sản xuất (tiếng Việt)', ''], ['makerAddrVi', 'Địa chỉ nhà sản xuất (tiếng Việt)', ''],
  ];
  /* Giá trị tự động của tem (khi người dùng chưa sửa) — từ Landed Cost, hợp đồng / NCC, Invoice, Packing List */
  function temAuto(code) {
    const m = modelOf(code) || {}; const p = lcFind(code); const s = S.sups.find((x) => x.id === m.supId) || sup();
    const tech = [p && p.tech, p && p.desc, m.descManual ? m.desc : ''].filter(Boolean).join(' ; ');
    const a = { unknown: [] };
    if (p && p.name) a.nameVi = String(p.name).replace(/\s*\(ví dụ\)\s*/i, '').trim();
    else if (m.invName) { const t = V.product(m.invName); a.nameVi = t.vi; if (t.unknown.length) a.unknown.push(...t.unknown); }
    a.brand = s.brand || '';
    let x;
    if ((x = tech.match(/(\d{2,3})\s*V(?:\s*[~\-–,]?\s*(\d{2})(?:\s*\/\s*(\d{2}))?\s*Hz)?/i))) a.voltage = `${x[1]}V` + (x[2] ? ` ~ ${x[2]}${x[3] ? '/' + x[3] : ''}Hz` : '');
    if ((x = tech.match(/(\d+(?:[.,]\d+)?)\s*W\b/))) a.power = x[1] + 'W';
    if ((x = tech.match(/(Dạng [^;,.]+)/i))) a.kind = x[1].trim();
    if ((x = tech.match(/(\d+)\s*cái\s*\/\s*(thùng|hộp)/i))) a.pack = `${x[1]} cái / ${x[2]}`;
    else if (L.lines.filter((l) => l.code).length === 1 && L.plQty > 0 && L.plPkgs > 0 && L.plQty % L.plPkgs === 0) a.pack = `${L.plQty / L.plPkgs} cái / thùng`;
    a.year = String(new Date().getFullYear());
    if (p && parseNum(p.weight) > 0) a.wP = String(parseNum(p.weight)) + 'Kg';
    // tên / địa chỉ NSX: ưu tiên nhà máy ghi ở Landed Cost, không có thì lấy bên bán trong hợp đồng
    // (từ chưa dịch được luôn đưa vào unknown; phần hiển thị chỉ báo khi từ đó còn nằm trong ô)
    if (p && p.factory) { const t = V.company(p.factory); a.makerVi = t.vi; a.unknown.push(...t.unknown); }
    else if (s.name) { const t = V.company(s.name); a.makerVi = s.nameVi || t.vi; a.unknown.push(...t.unknown); }
    if (p && p.faddr) { const t = V.address(p.faddr, 'CN'); a.makerAddrVi = t.vi; a.unknown.push(...t.unknown); }
    else if (s.addrRaw || s.addr1) {
      const t = V.address(s.addrRaw || [s.addr1, s.addr2, s.addr3].filter(Boolean).join(', '), s.country || 'CN');
      a.makerAddrVi = s.addrVi || t.vi; a.unknown.push(...t.unknown);
    }
    a.unknown = [...new Set(a.unknown)];
    return a;
  }
  function temOf(code) {
    const m = modelOf(code) || { tem: {} }; const a = temAuto(code); const t = {};
    TEM_FIELDS.forEach(([k]) => { t[k] = has(m.tem[k]) ? m.tem[k] : (a[k] || ''); });
    t.auto = a; t.country = V.country(L.origin || 'CN');
    return t;
  }
  const sentence = (s) => { s = String(s || '').trim(); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
  /* Mô tả khai hải quan tạo từ tem */
  function genDesc(code) {
    const t = temOf(code); const m = modelOf(code) || {};
    const name = t.nameVi ? `${sentence(t.nameVi)}${t.brand ? ' ' + t.brand : ''} ${code}` : (m.invName || '');
    const elec = [t.voltage && `Điện áp: ${t.voltage.replace(/\s*~\s*/, '-')}`, t.power && `Công suất: ${t.power}`].filter(Boolean).join(', ');
    return [`${code}- ${name}`.trim(), t.brand && `thương hiệu ${t.brand}`, t.kind, elec, t.pack && t.pack.replace(/\s*\/\s*/, '/'), 'hàng mới 100%'].filter(Boolean).join('; ');
  }
  const descOf = (code) => { const m = modelOf(code); return m && m.descManual && m.desc ? m.desc : genDesc(code); };

  /* ======================= LINH KIỆN (không có tem phụ) =======================
     Mô tả: "Linh kiện <tên máy chính> <nhãn hiệu> <model máy chính>: <tên linh kiện tiếng Việt> [bằng <vật liệu>]; hàng mới F.O.C; hàng mới 100%"
     Mã HS gợi ý: mặt hàng có nhóm riêng (dây nguồn 85.44, phích cắm 85.36, ốc vít 73.18, sách HD 49.01, thùng carton 48.19, adapter 85.04)
     → còn lại là "bộ phận" của máy chính: 4 số đầu mã máy chính + "90" (vd quạt 8414.51 → 8414.90.29; máy sấy tóc 8516.31 → 8516.90.90).
     Luôn là GỢI Ý — người dùng xác nhận theo đặc tính thực tế (Chú giải 2 Phần XVI). */
  function genPartDesc(h) {
    const tr = V.part(enOf(h));
    let pname = '';
    if (h.parent) { const t = temOf(h.parent); pname = `${t.nameVi ? sentence(t.nameVi) : ''}${t.brand ? ' ' + t.brand : ''} ${h.parent}`.replace(/\s+/g, ' ').trim(); }
    else pname = tr.parentVi || '';
    const foc = h.foc !== undefined ? h.foc : tr.foc;
    return [`Linh kiện${pname ? ' ' + pname : ''}: ${tr.vi || enOf(h)}`, foc ? 'hàng mới F.O.C' : '', 'hàng mới 100%'].filter(Boolean).join('; ');
  }
  const PART_PARENT = [['8414', '84149029'], ['8509', '85099090'], ['851633', '85169029'], ['851650', '85169029'], ['851660', '85169029'], ['851671', '85169029'],
    ['85167910', '85169029'], ['8516', '85169090'], ['8479', '84799090'], ['8508', '85087090'], ['8415', '84159019'], ['8418', '84189990'], ['8450', '84509020'], ['8451', '84519010']];
  const PART_SPEC = [[/power\s*cord|power\s*cable|\bcord\b/i, '85444294', 'dây nguồn có vỏ nhựa'], [/\bplug\b/i, '85366992', 'phích cắm'], [/\bscrews?\b/i, '73181590', 'ốc vít'],
    [/manual|warranty\s*card|instruction/i, '49019990', 'sách hướng dẫn / phiếu bảo hành'], [/carton|colou?r\s*box|gift\s*box/i, '48191000', 'thùng / hộp giấy'], [/adapter|charger/i, '85044090', 'bộ đổi nguồn']];
  const PART_HINT = [[/\bmotor\b/i, '8501', 'Động cơ điện có nhóm riêng 85.01 (theo loại, công suất)'], [/remote/i, '854370', 'Điều khiển từ xa: xem 8543.70'],
    [/switch/i, '853650', 'Công tắc: nhóm 85.36'], [/battery/i, '8507', 'Pin, ắc quy: nhóm 85.07']];
  function parentHS(h) {
    if (h.parent) {
      const ph = lineHS({ code: h.parent }); if (ph) return ph;
      const pm = modelOf(h.parent) || {}; const k0 = kwSuggest([temOf(h.parent).nameVi, pm.invName].filter(Boolean).join(' '));
      if (k0.length) return k0[0].codes[0];
    }
    const tr = V.part(enOf(h)); const k = kwSuggest(tr.parentVi || tr.parentHint || '');
    return k.length ? k[0].codes[0] : '';
  }
  function partSuggest(h) {
    const en = enOf(h); const out = [];
    const spec = PART_SPEC.find(([re]) => re.test(en));
    if (spec && DB && DB.map.has(spec[1])) out.push({ c: spec[1], label: 'Mặt hàng có nhóm riêng: ' + spec[2] });
    const ph = parentHS(h);
    if (ph && DB) {
      const heading = ph.slice(0, 4);
      const rows = DB.rows.filter((r) => r[0].startsWith(heading + '90')).map((r) => r[0]);
      let pc = (PART_PARENT.find(([pre]) => ph.startsWith(pre)) || [])[1];
      if (!pc || !DB.map.has(pc)) pc = rows.filter((c) => /loại khác/i.test(shortDesc(DB.map.get(c)))).pop() || rows[rows.length - 1];
      if (pc) out.push({ c: pc, label: `Bộ phận của máy chính (${fmtHS(ph)})` });
      rows.filter((c) => c !== pc).slice(0, 6).forEach((c) => out.push({ c, label: `Bộ phận nhóm ${heading.slice(0, 2)}.${heading.slice(2)}` }));
    }
    const hint = PART_HINT.find(([re]) => re.test(en));
    if (hint && DB) DB.rows.filter((r) => r[0].startsWith(hint[1])).slice(0, 6).forEach((r) => out.push({ c: r[0], label: hint[2] }));
    return { list: out, best: out.length ? out[0].c : '', hint: hint ? hint[2] : '' };
  }
  /* Linh kiện chưa có mã HS → điền mã gợi ý (đánh dấu 'sug' để nhắc kiểm tra) */
  function fillPartHS() {
    if (!DB) return;
    L.lines.forEach((l) => { const h = peek(l); if (h.part && (!h.hs || h.hsSrc === 'sug')) { const b = partSuggest(h).best; if (b) { const hh = holder(l); hh.hs = b; hh.hsSrc = 'sug'; } } });
  }
  /* Máy chính của linh kiện: mã model nằm trong tên / mã linh kiện, hoặc lô chỉ có 1 máy chính */
  function guessParent(code, en, mains) {
    const k = normKey(code + ' ' + en);
    return mains.find((c) => k.includes(normKey(c))) || (mains.length === 1 ? mains[0] : '');
  }

  /* Mã vạch EAN-13 → SVG */
  const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const EAN_R = EAN_L.map((s) => s.replace(/./g, (c) => (c === '0' ? '1' : '0')));
  const EAN_PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  const eanCheck = (d12) => (10 - (d12.split('').reduce((a, c, i) => a + (+c) * (i % 2 ? 3 : 1), 0) % 10)) % 10;
  function eanFix(code) {
    const d = String(code || '').replace(/\D/g, '');
    if (d.length === 12) return { code: d + eanCheck(d), ok: true, added: true };
    if (d.length === 13) return { code: d, ok: eanCheck(d.slice(0, 12)) === +d[12] };
    return { code: d, ok: false };
  }
  function eanSvg(code) {
    const e = eanFix(code); if (e.code.length !== 13) return '';
    const d = e.code; const par = EAN_PAR[+d[0]];
    let bits = '101';
    for (let i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? EAN_L : EAN_G)[+d[i]];
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += EAN_R[+d[i]];
    bits += '101';
    const X0 = 9; const long = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
    let rects = '';
    for (let i = 0; i < bits.length; i++) if (bits[i] === '1') rects += `<rect x="${X0 + i}" y="0" width="1" height="${long.has(i) ? 56 : 50}"/>`;
    const txt = (x, s) => `<text x="${x}" y="64" font-size="10" text-anchor="middle" font-family="monospace">${s}</text>`;
    return `<svg class="ean" viewBox="0 0 113 66" xmlns="http://www.w3.org/2000/svg" aria-label="Mã vạch ${d}" fill="currentColor">${rects}`
      + txt(4, d[0]) + txt(X0 + 3 + 21, d.slice(1, 7)) + txt(X0 + 50 + 21, d.slice(7)) + '</svg>';
  }

  /* ======================= ĐỌC FILE: PDF / ẢNH SCAN (OCR) / WORD ======================= */
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  async function loadPdfJs() {
    if (!window.pdfjsLib) await loadScript(PDFJS + 'pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
    return window.pdfjsLib;
  }
  async function openPdf(file) { const pdfjs = await loadPdfJs(); return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; }
  async function pdfPages(doc) {
    const pages = [];
    for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      pages.push(tc.items.map((t) => ({ s: t.str, x: t.transform[4], y: t.transform[5], w: t.width, h: Math.hypot(t.transform[2], t.transform[3]) || t.height })));
    }
    return pages;
  }
  /* OCR (tesseract.js chạy trên máy; lần đầu tải bộ đọc chữ tiếng Anh ~3 MB) — cùng cấu hình tool Phiếu nhập kho */
  const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/';
  const OCR_LANG = { eng: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int', vie: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/vie@1.0.0/4.0.0_best_int' };
  const ocrWorkers = {};
  async function getOcr(lang) {
    if (ocrWorkers[lang]) return ocrWorkers[lang];
    if (!window.Tesseract) await loadScript(TESS + 'tesseract.min.js');
    const w = await window.Tesseract.createWorker(lang, 1, { workerPath: TESS + 'worker.min.js', corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1', langPath: OCR_LANG[lang], gzip: true });
    await w.setParameters({ tessedit_pageseg_mode: '3' });
    return (ocrWorkers[lang] = w);
  }
  async function ocrCanvases(canvases, name, lang = 'eng') {
    const w = await getOcr(lang); let text = '';
    for (let i = 0; i < canvases.length; i++) {
      GauBep.toast(`🔎 Đang đọc bản scan ${name}: trang ${i + 1}/${canvases.length}…`);
      const { data } = await w.recognize(canvases[i]); text += data.text + '\n';
    }
    return text;
  }
  async function pdfCanvases(doc, max = 4) {
    const out = [];
    for (let p = 1; p <= Math.min(doc.numPages, max); p++) {
      const page = await doc.getPage(p); const v0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 2480 / v0.width });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: x, viewport: vp }).promise; out.push(c);
    }
    return out;
  }
  async function imageCanvas(file) {
    const bmp = await createImageBitmap(file); const k = bmp.width < 2000 ? 2480 / bmp.width : 1;
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  }
  async function docxText(file) {
    if (!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
    const f = zip.file('word/document.xml'); if (!f) throw new Error('File Word không đọc được');
    const xml = await f.async('string');
    const div = document.createElement('textarea');
    return xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
      .split('\n').map((s) => { div.innerHTML = s; return div.value; }).join('\n');
  }
  /* Đọc chữ của 1 file bất kỳ → { text, ocr }. lang: 'eng' cho chứng từ tiếng Anh, 'vie' cho tem phụ tiếng Việt */
  async function fileText(f, lang = 'eng') {
    if (/\.xml$/i.test(f.name)) { const xml = await f.text(); return { text: /<HDon|<TTChung|<NBan/i.test(xml) ? 'HÓA ĐƠN ĐIỆN TỬ\n' + xml : xml, xml }; }
    if (/\.docx$/i.test(f.name)) return { text: await docxText(f) };
    if (/\.doc$/i.test(f.name)) throw new Error('file Word đời cũ (.doc) — mở bằng Word, lưu lại thành .docx hoặc PDF rồi nạp lại');
    if (/\.(png|jpe?g|webp|bmp)$/i.test(f.name) || /^image\//.test(f.type)) return { text: await ocrCanvases([await imageCanvas(f)], f.name, lang), ocr: true };
    let doc;
    try { doc = await openPdf(f); }
    catch (e) { throw new Error(/\.ai$/i.test(f.name) ? 'file .ai này không lưu kèm bản PDF — trong Illustrator chọn Save As PDF (hoặc xuất ảnh PNG) rồi nạp lại' : 'không mở được file PDF'); }
    const pages = await pdfPages(doc); const t = P.linesFromPdfPages(pages);
    if (t.replace(/\s/g, '').length >= 40) return { text: t, pages };
    return { text: await ocrCanvases(await pdfCanvases(doc, lang === 'vie' ? 6 : 4), f.name, lang), ocr: true };
  }

  /* ======================= NẠP CHỨNG TỪ ======================= */
  const DOCNAME = { hd: 'Hợp đồng', bill: 'Vận đơn (Bill)', ci: 'Commercial Invoice', pl: 'Packing List', co: 'C/O', an: 'Arrival Notice', fr: 'Hoá đơn cước', bh: 'Hoá đơn bảo hiểm' };
  let busy = false;
  async function handleFiles(files) {
    if (busy) { GauBep.toast('Đang đọc file trước, chờ chút…'); return; }
    busy = true; const done = [];
    try {
      for (const f of files) {
        try {
          const { text, ocr, pages, xml } = await fileText(f);
          const k = P.classify(text);
          if (!k) { GauBep.toast(`${f.name}: chưa nhận ra loại chứng từ`); continue; }
          if (L.sample) L = newLot();
          if (k === 'hd') { if (applyContract(P.contract(text), f.name, ocr)) done.push('Hợp đồng'); continue; }
          if (k === 'an') { applyAN(P.an(text), f.name + (ocr ? ' (đọc bản scan)' : '')); done.push('Arrival Notice'); continue; }
          if (k === 'vat' || k === 'fee') { const r = await applyFee(k, text, pages, xml, f.name); if (r) done.push(r); continue; }
          const res = P[k](text);
          if (k === 'ci') {
            if (res.lines) {
              const partOf = (x) => V.isPartName(x.name) && !lcFind(x.code);
              const mains = res.lines.filter((x) => x.code && !partOf(x)).map((x) => x.code);
              L.lines = res.lines.map((x) => {
                const base = { id: uid(), code: x.code, qty: x.qty, price: x.price, invAmount: x.amount, unit: UNIT_MAP[x.unit] || 'PCE' };
                const isP = partOf(x); const tr = isP ? V.part(x.name) : null;
                if (x.code) {
                  const fresh = !modelOf(x.code); const m = ensureModel(x.code, x.name);
                  if (fresh && isP) Object.assign(m, { part: true, foc: tr.foc, parent: guessParent(x.code, x.name, mains) });
                  return base;
                }
                return Object.assign(base, { en: x.name, desc: isP ? '' : x.name, part: isP, foc: isP ? tr.foc : false, parent: isP ? guessParent('', x.name, mains) : '', hs: '' });
              });
              fillPartHS();
            }
            delete res.lines;
            const hit = S.sups.find((s) => s.key && normKey(text).includes(normKey(s.key)));
            if (hit) L.supId = hit.id;
          }
          Object.entries(res).forEach(([kk, v]) => { if (has(v)) L[kk] = v; });
          L.docs[k] = f.name + (ocr ? ' (đọc bản scan)' : ''); done.push(DOCNAME[k]);
        } catch (e) { GauBep.toast(`${f.name}: ${e.message || 'lỗi đọc file'}`); }
      }
    } finally { busy = false; }
    L.lines.forEach((l) => { const m = modelOf(l.code); if (m && !m.supId) m.supId = L.supId; });
    saveSet(); saveLot(); renderAll();
    if (done.length) GauBep.toast('Đã đọc: ' + done.join(', ') + ' 🐼');
  }
  /* Arrival Notice → ngày hàng đến, mã địa điểm lưu kho, cước O/F (nếu có) để đối chiếu */
  function applyAN(a, fname) {
    if (a.arrival) L.arrival = a.arrival;
    if (a.storeCode) L.storeCode = a.storeCode;
    if (!L.pod && a.anPod) L.pod = 'HO CHI MINH(' + a.anPod + ')';
    Object.assign(L, { anBl: a.anBl || '', anVessel: a.anVessel || '', anFreightUsd: a.anFreightUsd || '' });
    L.docs.an = fname;
  }
  /* Hoá đơn cước / bảo hiểm (hoá đơn điện tử VN dạng PDF / XML, hoặc debit note tiếng Anh)
     → chỉ cộng dòng CƯỚC QUỐC TẾ và PHÍ BẢO HIỂM (tiền trước thuế); phí local (THC, D/O, CIC…) bỏ qua */
  async function applyFee(k, text, pages, xml, fname) {
    let rows = [];
    if (k === 'vat') {
      if (!window.InvoiceParser) await loadScript('../cost-payment/invoice-parser.js?v=20261028');
      const inv = xml ? window.InvoiceParser.fromXml(xml) : window.InvoiceParser.fromPdfPages(pages || []);
      rows = (inv.lines || []).map((x) => ({ desc: x.desc, kind: P.feeKind(x.desc), vnd: x.pre }));
    } else rows = P.feeLines(text);
    const fr = rows.filter((r) => r.kind === 'freight'); const ins = rows.filter((r) => r.kind === 'ins');
    const local = rows.filter((r) => r.kind === 'local');
    if (!fr.length && !ins.length) { GauBep.toast(`${fname}: không thấy dòng cước quốc tế / phí bảo hiểm trên hoá đơn`); return ''; }
    const setFee = (kind, list) => {
      const usd = list.reduce((a, r) => a + (r.usd || 0), 0); const vnd = list.reduce((a, r) => a + (r.vnd || 0), 0);
      const cur = usd && !vnd ? 'USD' : 'VND';
      L[kind] = cur === 'USD' ? Math.round(usd * 100) / 100 : Math.round(vnd);
      L[kind + 'Cur'] = cur;
      L[kind + 'Doc'] = { file: fname, lines: list.map((r) => ({ desc: r.desc, amt: r.usd || r.vnd, cur: r.usd ? 'USD' : 'VND' })), local: local.map((r) => r.desc) };
    };
    const got = [];
    if (fr.length) { setFee('freight', fr); L.docs.fr = fname; got.push('Hoá đơn cước'); }
    if (ins.length) { setFee('ins', ins); L.docs.bh = fname; got.push('Hoá đơn bảo hiểm'); }
    return got.join(', ');
  }
  /* Hợp đồng → hồ sơ NCC (tìm NCC trùng tên / trùng số HĐ, không có thì tạo mới) */
  function applyContract(c, fname, ocr) {
    if (!c.contractNo && !c.sellerName) { GauBep.toast(`${fname}: không tìm thấy số hợp đồng / bên bán`); return false; }
    const core = (n) => normKey(String(n || '').replace(/\b(CO|LTD|LIMITED|COMPANY|CORP|CORPORATION|INC)\b/gi, ''));
    let s = S.sups.find((x) => c.sellerName && core(x.name) && core(x.name) === core(c.sellerName))
      || S.sups.find((x) => c.contractNo && x.contractNo === c.contractNo);
    if (!s) { s = { id: uid(), country: 'CN' }; S.sups.push(s); }
    const name = String(c.sellerName || '').toUpperCase().replace(/\s*CO\s*[.,]*\s*LTD\.?/, ' CO., LTD').replace(/\s+/g, ' ').trim();
    if (name && !s.name) s.name = name;
    if (c.sellerAddr) {
      s.addrRaw = c.sellerAddr;
      if (!s.addr1) { const ln = V.ecusAddress(c.sellerAddr, s.country || 'CN'); ['addr1', 'addr2', 'addr3', 'addr4'].forEach((k, i) => { s[k] = ln[i] || ''; }); }
      if (!s.addrVi) s.addrVi = V.address(c.sellerAddr, s.country || 'CN').vi;
    }
    if (s.name && !s.nameVi) s.nameVi = V.company(s.name).vi;
    if (c.brand && !s.brand) s.brand = c.brand;
    if (!s.key && s.name) {
      const skip = new Set([...V.PLACES.map((p) => p[0].toUpperCase()), ...V.ORG.map((o) => o[0].toUpperCase()), 'CO', 'LTD', 'GROUP', 'COMPANY', 'LIMITED']);
      s.key = s.name.split(/[^A-Z0-9]+/).find((w) => w.length >= 3 && !skip.has(w)) || '';
    }
    Object.assign(s, { contractNo: c.contractNo || s.contractNo, contractDate: c.contractDate || s.contractDate, contractEnd: c.contractEnd || s.contractEnd,
      contractDate2: c.contractDate2 || '', endGuess: !!c.endGuess, contractFile: fname, contractOcr: !!ocr });
    L.supId = s.id; L.docs.hd = fname + (ocr ? ' (đọc bản scan)' : '');
    return true;
  }
  $('#fileDocs').addEventListener('change', (e) => { handleFiles([...e.target.files]); e.target.value = ''; });
  $('#fileContract').addEventListener('change', (e) => { handleFiles([...e.target.files]); e.target.value = ''; });
  const dz = $('#dropzone');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', (e) => handleFiles([...e.dataTransfer.files].filter((f) => /\.(pdf|docx?|xml|png|jpe?g|webp)$/i.test(f.name))));

  /* ======================= 1–2. CHỨNG TỪ & THÔNG TIN LÔ ======================= */
  function renderLot() {
    document.querySelectorAll('[data-k]').forEach((el) => {
      const v = L[el.dataset.k];
      el.value = has(v) ? (el.hasAttribute('data-num') ? fmt(v) : v) : (el.tagName === 'SELECT' ? el.options[0].value : '');
      el.classList.toggle('empty', el.value === '');
    });
    const s = sup();
    $('#docs').innerHTML = Object.keys(DOCNAME).map((k) => {
      let sub = L.docs[k] || 'Chưa nạp'; let ok = !!L.docs[k];
      if (k === 'hd' && s.contractNo) { ok = true; sub = `${s.contractNo} · ký ${dmy(s.contractDate) || '?'} · hết hạn ${dmy(s.contractEnd) || '?'}` + (L.docs.hd ? '' : ' (đã lưu ở NCC)'); }
      if (k === 'fr' && L.docs.fr) sub = `${L.docs.fr} · cước ${fmt(L.freight, 2)} ${L.freightCur || 'VND'}`;
      if (k === 'bh' && L.docs.bh) sub = `${L.docs.bh} · phí BH ${fmt(L.ins, 2)} ${L.insCur || 'VND'}`;
      if (k === 'an' && L.docs.an) sub = `${L.docs.an}${L.arrival ? ' · đến ' + dmy(L.arrival) : ''}${L.storeCode ? ' · kho ' + L.storeCode : ''}`;
      return `<div class="doc${ok ? ' ok' : ''}"><b>${ok ? '✅' : '⬜'} ${DOCNAME[k]}</b><span>${esc(sub)}</span></div>`;
    }).join('');
    $('#supSel').innerHTML = S.sups.length ? S.sups.map((x) => `<option value="${x.id}"${x.id === L.supId ? ' selected' : ''}>${esc(x.name || '(chưa đặt tên)')}</option>`).join('')
      : '<option value="">Chưa có — nạp hợp đồng hoặc thêm ở ⚙️ Cài đặt</option>';
    $('#setupNote').hidden = S.sups.length > 0;
  }
  document.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('change', () => {
    const k = el.dataset.k;
    L[k] = el.hasAttribute('data-num') ? (el.value.trim() === '' ? '' : parseNum(el.value)) : el.value.trim();
    if (k === 'origin') L[k] = String(L[k]).toUpperCase();
    saveLot(); later();
  }));
  $('#supSel').addEventListener('change', (e) => { L.supId = e.target.value; saveLot(); later(); });

  /* ======================= 3. DANH SÁCH HÀNG ======================= */
  let hsLine = null;   // dòng đang chọn mã HS (bảng gợi ý)
  function renderLines() {
    const tb = $('#lineBody');
    if (!L.lines.length) { tb.innerHTML = '<tr><td colspan="11" class="muted">Chưa có dòng hàng — nạp Invoice hoặc bấm ＋ Thêm dòng.</td></tr>'; renderHsPanel(); return; }
    tb.innerHTML = L.lines.map((l, i) => {
      const hs = lineHS(l); const R = rateOf(hs); const m = modelOf(l.code); const p = l.code ? lcFind(l.code) : null;
      const h = peek(l); const part = !!h.part;
      const src = h.hsSrc === 'sug' && hs ? '<div class="hs-src sug">💡 gợi ý tự động — bấm ô để xem & xác nhận</div>'
        : !l.code ? (hs ? '<div class="hs-src">✍️ nhập tay</div>' : '') : m && m.hsSrc === 'lc' && hs && hs === lcHS(p) ? '<div class="hs-src">🚢 từ Landed Cost</div>' : hs ? '<div class="hs-src">✍️ nhập tay</div>' : '';
      const note = !hs ? '<div class="hs-note bad">Chưa có mã HS — bấm vào ô để tra</div>'
        : R && R.bad ? '<div class="hs-note bad">Mã không có trong biểu thuế</div>'
          : R ? `<div class="hs-note">${esc(R.desc)}<br>MFN ${fmt(R.mfn)}% · ACFTA ${has(R.acfta) ? fmt(R.acfta) + '%' : '–'}</div>` : '';
      const nk = has(l.nkOv) ? l.nkOv : R && !R.bad ? R.nk : '';
      const vat = has(l.vatOv) ? l.vatOv : R && !R.bad ? R.vat : '';
      const manual = h.descManual && h.desc;
      const mains = mainCodes().filter((c) => c !== l.code);
      const partCtl = `<div class="part-ctl"><label><input type="checkbox" data-f="part"${part ? ' checked' : ''}> Linh kiện (không tem)</label>${part ? `
          <label><input type="checkbox" data-f="foc"${(h.foc !== undefined ? h.foc : V.part(enOf(h)).foc) ? ' checked' : ''}> F.O.C</label>
          <label>của máy <select data-f="parent"><option value="">— chọn —</option>${mains.map((c) => `<option${c === h.parent ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>` : ''}</div>`
        + (part && enOf(h) ? `<div class="desc-src">Invoice: ${esc(enOf(h))}</div>` : '');
      const descSrc = manual ? `✍️ mô tả sửa tay · <button type="button" class="link-btn" data-act="regen">↺ tạo lại ${part ? 'tự động' : 'từ tem'}</button>`
        : part ? '🔧 tự dịch từ tên trên Invoice' : l.code ? '🏷️ tạo từ tem phụ (mục 4)' : '';
      return `<tr data-id="${l.id}"${hsLine === l.id ? ' class="sel"' : ''}>
        <td class="num">${i + 1}</td>
        <td class="code-cell"><input data-f="code" value="${esc(l.code)}" placeholder="(không mã)"></td>
        <td><textarea data-f="desc" rows="3">${esc(lineDesc(l))}</textarea>${descSrc ? `<div class="desc-src">${descSrc}</div>` : ''}${partCtl}</td>
        <td class="hs-cell"><input data-f="hs" value="${esc(fmtHS(hs))}" placeholder="gõ mã / từ khoá">${src}${note}</td>
        <td><input class="in-num" data-f="qty" value="${fmt(l.qty)}" inputmode="decimal" style="width:90px"></td>
        <td><input data-f="unit" value="${esc(lineUnit(l))}" style="width:64px"></td>
        <td><input class="in-num" data-f="price" value="${fmt(l.price, 4)}" inputmode="decimal" style="width:90px"></td>
        <td class="num">${fmt(lineAmt(l), 2)}</td>
        <td><input class="in-num" data-f="nkOv" value="${fmt(nk)}" placeholder="–" inputmode="decimal" style="width:62px" title="${R && !R.bad ? 'Theo biểu thuế: ' + R.src : ''}"></td>
        <td><input class="in-num" data-f="vatOv" value="${fmt(vat)}" placeholder="–" inputmode="decimal" style="width:62px"></td>
        <td><button class="btn btn-ghost btn-sm btn-icon" data-act="del" aria-label="Xoá dòng">✕</button></td></tr>`;
    }).join('');
    renderHsPanel();
  }
  function setLineHS(l, hs, src) {
    if (l.code) { const m = ensureModel(l.code); m.hs = hs; m.hsSrc = src || ''; saveSet(); } else { l.hs = hs; l.hsSrc = src || ''; }
  }
  $('#lineBody').addEventListener('change', (e) => {
    const el = e.target; const tr = el.closest('tr'); if (!tr || !el.dataset.f) return;
    const l = L.lines.find((x) => x.id === tr.dataset.id); const f = el.dataset.f;
    if (f === 'qty' || f === 'price') l[f] = parseNum(el.value);
    else if (f === 'nkOv' || f === 'vatOv') {
      const R = rateOf(lineHS(l)); const auto = R && !R.bad ? (f === 'nkOv' ? R.nk : R.vat) : NaN;
      l[f] = el.value.trim() === '' || parseNum(el.value) === auto ? '' : parseNum(el.value);
    } else if (f === 'hs') {
      const d = el.value.replace(/\D/g, '');
      if (d.length === 8 || !el.value.trim()) setLineHS(l, d, '');
      else return;                                   // đang gõ từ khoá → chỉ tra, chưa đổi mã
    } else if (f === 'code') {
      const old = { desc: lineDesc(l), hs: lineHS(l), unit: lineUnit(l) };
      l.code = el.value.trim().toUpperCase();
      if (l.code) { const m = ensureModel(l.code); if (!m.hs && old.hs) m.hs = old.hs; }
      else Object.assign(l, old);
    } else if (f === 'desc') {
      const h = holder(l); const v = el.value.trim();
      if (l.code || h.part) { h.descManual = v !== autoDesc(l); h.desc = h.descManual ? v : ''; saveSet(); }
      else l.desc = el.value;
    } else if (f === 'part') {
      const h = holder(l); h.part = el.checked;
      if (h.part) { if (!enOf(h)) h.en = l.code ? '' : (l.desc || ''); if (!h.parent) h.parent = guessParent(l.code, enOf(h), mainCodes().filter((c) => c !== l.code)); h.descManual = false; fillPartHS(); }
      else if (h.hsSrc === 'sug') { h.hs = ''; h.hsSrc = ''; }
      saveSet();
    } else if (f === 'foc') { holder(l).foc = el.checked; saveSet(); }
    else if (f === 'parent') { const h = holder(l); h.parent = el.value; if (h.hsSrc === 'sug') h.hs = ''; fillPartHS(); saveSet();
    } else if (f === 'unit') {
      if (l.code) { ensureModel(l.code).unit = el.value.trim().toUpperCase(); saveSet(); } else l.unit = el.value.trim().toUpperCase();
    }
    saveLot(); later();
  });
  $('#lineBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('tr').dataset.id; const l = L.lines.find((x) => x.id === id);
    if (b.dataset.act === 'del') { L.lines = L.lines.filter((x) => x.id !== id); if (hsLine === id) hsLine = null; }
    if (b.dataset.act === 'regen') { const h = holder(l); h.descManual = false; h.desc = ''; saveSet(); }
    saveLot(); renderAll();
  });
  $('#lineBody').addEventListener('focusin', (e) => { if (e.target.dataset.f !== 'hs') return; hsLine = e.target.closest('tr').dataset.id; renderHsPanel(e.target.value); });
  $('#lineBody').addEventListener('input', (e) => { if (e.target.dataset.f !== 'hs') return; hsLine = e.target.closest('tr').dataset.id; renderHsPanel(e.target.value); });
  $('#btnAddLine').onclick = () => {
    L.lines.push({ id: uid(), code: '', desc: '', hs: '', qty: '', unit: 'PCE', price: '' });
    saveLot(); renderAll();
  };
  /* Lấy HS từ Landed Cost cho mọi dòng có model */
  $('#btnLcHs').onclick = () => {
    if (!lcProducts().length) { GauBep.toast('Landed Cost trên máy này chưa có sản phẩm nào'); return; }
    const got = [], miss = [];
    L.lines.filter((l) => l.code).forEach((l) => { const h = lcHS(lcFind(l.code)); if (h) { setLineHS(l, h, 'lc'); got.push(l.code); } else miss.push(l.code); });
    saveSet(); saveLot(); renderAll();
    GauBep.toast((got.length ? `Đã lấy HS cho ${got.join(', ')}` : 'Không lấy được mã nào') + (miss.length ? ` · không thấy trong Landed Cost: ${miss.join(', ')}` : ''));
  };
  /* Bảng gợi ý mã HS cho dòng đang chọn: sản phẩm Landed Cost + tra biểu thuế */
  function renderHsPanel(q) {
    const box = $('#hsPanel'); const l = L.lines.find((x) => x.id === hsLine);
    if (!l) { box.hidden = true; return; }
    const i = L.lines.indexOf(l) + 1; const hs = lineHS(l);
    if (q === undefined || /^[\d.\s]*$/.test(q) && q.replace(/\D/g, '') === hs) q = '';
    const part = isPart(l); const ps = part ? partSuggest(peek(l)) : null;
    const t = l.code && !part ? temOf(l.code) : {};
    const query = q || t.nameVi || (part ? '' : (modelOf(l.code) || {}).invName || '');
    const nq = normTxt(query); const nk = normKey(l.code);
    const lcs = lcProducts().filter((p) => lcHS(p) && ((nk && normKey(p.code) === nk) || (nk.length >= 5 && (normKey(p.code).includes(nk) || nk.includes(normKey(p.code))))
      || (nq && normTxt(p.name).includes(nq)) || (q && normTxt(p.code + ' ' + p.name).includes(normTxt(q))))).slice(0, 6);
    const kws = part && !q ? [] : kwSuggest(q || [t.nameVi, (modelOf(l.code) || {}).invName].filter(Boolean).join(' '));
    const codes = searchTariff(query, 6);
    const item = (c, extra, src) => { const R = DB && DB.map.get(c); const r = rateOf(c);
      return `<button type="button" class="hs-opt${c === hs ? ' on' : ''}" data-hs="${c}" data-src="${src}"><b class="mono">${fmtHS(c)}</b>${extra ? ' ' + extra : ''}<span class="muted"> · MFN ${r && !r.bad ? fmt(r.mfn) : '–'}% · ACFTA ${r && has(r.acfta) ? fmt(r.acfta) + '%' : '–'}</span><br><span class="small">${esc(R ? shortDesc(R) : '')}</span></button>`; };
    box.hidden = false;
    box.innerHTML = `<div class="hs-head"><b>Mã HS cho dòng ${i}${l.code ? ' · ' + esc(l.code) : ''}</b><span class="help-text">${query ? 'tra theo: “' + esc(query) + '”' : 'gõ từ khoá hoặc đầu mã vào ô Mã HS'}</span><button type="button" class="btn btn-ghost btn-sm" data-act="close">Đóng</button></div>
      ${part ? '<div class="hs-group">🔧 Gợi ý cho linh kiện' + (peek(l).parent ? ' của ' + esc(peek(l).parent) : '') + ' — chọn 1 mã để xác nhận</div>'
        + (ps.list.length ? ps.list.map((x) => item(x.c, `<span class="chip-lc">${esc(x.label)}</span>`, '')).join('') : '<p class="help-text">Chọn "của máy" ở dòng hàng (hoặc máy chính chưa có mã HS) để tool gợi ý mã bộ phận.</p>')
        + '<p class="help-text">Linh kiện chỉ dùng cho 1 loại máy → xếp vào "bộ phận" của máy đó; riêng động cơ, dây nguồn, phích cắm, công tắc, ốc vít, pin, sách HD… có nhóm riêng (Chú giải 2 Phần XVI).</p>' : ''}
      ${lcs.length ? '<div class="hs-group">🚢 Sản phẩm trong Landed Cost</div>' + lcs.map((p) => item(lcHS(p), `<span class="chip-lc">${esc(p.code)} · ${esc(String(p.name || '').slice(0, 40))}</span>`, 'lc')).join('') : (lcProducts().length || part ? '' : '<p class="help-text">Landed Cost trên máy này chưa có sản phẩm — đang tra trong biểu thuế.</p>')}
      ${kws.length ? '<div class="hs-group">💡 Gợi ý theo tên hàng (bảng từ khoá của Landed Cost — đối chiếu đặc tính thực tế)</div>' + kws.map((k) => k.codes.map((c) => item(c, `<span class="chip-lc">${esc(k.label)}</span>${k.note ? ` <span class="muted small">${esc(k.note)}</span>` : ''}`, '')).join('')).join('') : ''}
      ${codes.length ? '<div class="hs-group">📚 Tra trong biểu thuế</div>' + codes.map((c) => item(c, '', '')).join('') : part && !q ? '' : (DB ? '<p class="help-text">Không thấy mã phù hợp — thử từ khoá khác (vd "quat", "may say toc") hoặc 4 số đầu mã.</p>' : '<p class="help-text">Đang tải biểu thuế…</p>')}`;
  }
  $('#hsPanel').addEventListener('click', (e) => {
    if (e.target.closest('[data-act="close"]')) { hsLine = null; renderAll(); return; }
    const b = e.target.closest('[data-hs]'); if (!b) return; const l = L.lines.find((x) => x.id === hsLine); if (!l) return;
    setLineHS(l, b.dataset.hs, b.dataset.src); saveLot(); renderAll(); GauBep.toast('Đã chọn mã ' + fmtHS(b.dataset.hs));
  });

  /* ======================= 4. TEM PHỤ ======================= */
  const temCodes = () => mainCodes();
  function temLines(code) {
    const t = temOf(code); const g = S.gen;
    const kv = (a, b) => (b ? `${a} : ${b}` : '');
    return {
      title: `${t.nameVi} ${t.brand} ${code}`.replace(/\s+/g, ' ').trim().toUpperCase(),
      rows: [
        [kv('Model', code)], [kv('Điện áp', t.voltage), kv('Công suất', t.power)], [kv('Sản xuất', t.year), kv('Số lượng', t.pack)],
        [kv('Điều khiển', t.control)], [kv('Kích thước sản phẩm', t.sizeP)], [kv('Kích thước đóng gói', t.sizeBox)],
        [kv('Khối lượng sản phẩm', t.wP), t.wBox ? `Khối lượng đóng gói: ${t.wBox}` : ''], [t.feature],
      ].map((r) => r.filter(Boolean)).filter((r) => r.length),
      maker: t.makerVi, makerAddr: t.makerAddrVi, imp: g.importerName, impAddr: g.importerAddr, usage: g.usage, storage: g.storage, country: t.country, t,
    };
  }
  function temText(code) {
    const x = temLines(code);
    return [x.title, ...x.rows.map((r) => r.join('   ')), x.maker && 'Nhà sản xuất: ' + x.maker, x.makerAddr && 'Địa chỉ: ' + x.makerAddr,
      x.imp && 'Nhà NK & PP: ' + x.imp, x.impAddr && 'Địa chỉ: ' + x.impAddr, x.usage, x.storage, 'Xuất xứ: ' + x.country,
      x.t.barcode && 'Mã vạch: ' + eanFix(x.t.barcode).code].filter(Boolean).join('\n');
  }
  function temPaper(code) {
    const x = temLines(code); const m = modelOf(code) || {}; const s = S.sups.find((y) => y.id === m.supId) || sup();
    const img = m.img || s.logo || '';
    return `<div class="tem-paper" data-paper="${esc(code)}">
      <div class="tem-title">${esc(x.title)}</div>
      <div class="tem-body">
        <div class="tem-rows">${x.rows.map((r, i) => `<div class="tem-row${i === 0 ? ' b' : ''}">${r.map((c) => `<span>${esc(c)}</span>`).join('')}</div>`).join('')}</div>
        <div class="tem-side">${img ? `<img src="${img}" alt="">` : ''}${x.t.barcode ? eanSvg(x.t.barcode) : ''}</div>
      </div>
      ${x.maker ? `<div class="tem-row b">Nhà sản xuất: ${esc(x.maker)}</div>` : ''}${x.makerAddr ? `<div class="tem-row">Địa chỉ: ${esc(x.makerAddr)}</div>` : ''}
      ${x.imp ? `<div class="tem-row b">Nhà NK &amp; PP: ${esc(x.imp)}</div>` : ''}${x.impAddr ? `<div class="tem-row">Địa chỉ: ${esc(x.impAddr)}</div>` : ''}
      ${x.usage ? `<div class="tem-row">${esc(x.usage)}</div>` : ''}${x.storage ? `<div class="tem-row">${esc(x.storage)}</div>` : ''}
      <div class="tem-row">Xuất xứ: ${esc(x.country)}</div></div>`;
  }
  function renderTem() {
    const codes = temCodes(); const box = $('#temList');
    if (!codes.length) { box.innerHTML = '<p class="muted">Chưa có model — nạp Invoice để tạo tem phụ cho từng model.</p>'; return; }
    box.innerHTML = codes.map((code) => {
      const m = ensureModel(code); const t = temOf(code);
      const unknown = t.auto.unknown.filter((u) => [t.nameVi, t.makerVi, t.makerAddrVi].some((v) => String(v).includes(u)));
      const ean = t.barcode ? eanFix(t.barcode) : null;
      return `<div class="tem-card" data-code="${esc(code)}">
        <div class="tem-form">
          <h3 class="sub-title" style="margin-top:0">🏷️ ${esc(code)}${m.invName ? ` <span class="muted small">· Invoice: ${esc(m.invName)}</span>` : ''}${m.temFile ? ` <span class="muted small">· tem: ${esc(m.temFile)}</span>` : ''}</h3>
          ${unknown.length ? `<div class="note">✍️ Tên riêng chưa dịch được: <b>${esc(unknown.join(', '))}</b> — sửa tay ở ô bên dưới (vd tên tiếng Việt in trên tem cũ). Sửa ô Nhà sản xuất / Địa chỉ thì lưu cho cả nhà cung cấp.</div>` : ''}
          <div class="form-grid tem-grid">${TEM_FIELDS.map(([k, lbl, tip]) => {
            const isAuto = !has(m.tem[k]) && has(t[k]);
            const wide = ['makerVi', 'makerAddrVi', 'feature', 'nameVi'].includes(k);
            const input = k === 'makerAddrVi' ? `<textarea data-t="${k}" rows="2">${esc(t[k])}</textarea>` : `<input data-t="${k}" value="${esc(t[k])}">`;
            return `<div class="field${wide ? ' wide' : ''}${isAuto ? ' auto' : ''}"><label>${lbl}${tip ? ` <span class="hint" tabindex="0" data-tip="${esc(tip)}">?</span>` : ''}${isAuto ? ' <span class="auto-tag">tự động</span>' : ''}</label>${input}</div>`;
          }).join('')}
            <div class="field wide"><label>Hình trên tem (logo / ảnh)</label>
              <div class="img-row">${m.img ? `<img src="${m.img}" alt="">` : '<span class="muted small">Chưa có hình</span>'}
                <label class="btn btn-ghost btn-sm file-btn">🖼️ Chọn hình<input type="file" accept="image/*" data-img hidden></label>
                ${m.img ? '<button type="button" class="btn btn-ghost btn-sm" data-act="noimg">Bỏ hình</button>' : ''}</div></div>
          </div>
          ${ean && !ean.ok ? '<div class="warn">⚠️ Mã vạch không đúng chuẩn EAN-13 (sai số kiểm tra hoặc không đủ 13 số).</div>' : ''}
          <div class="toolbar" style="margin-top:10px">
            <label class="btn btn-pink btn-sm file-btn" title="PDF / .ai / ảnh chụp tem đã in — tool đọc tên hàng, thông số, nhà sản xuất, nhà nhập khẩu">📥 Nạp tem có sẵn<input type="file" accept=".pdf,.ai,image/*" data-temfile hidden></label>
            <button type="button" class="btn btn-ghost btn-sm" data-act="copytem">📋 Copy nội dung tem</button>
            <button type="button" class="btn btn-ghost btn-sm" data-act="printtem">🖨️ In tem</button>
            <button type="button" class="btn btn-ghost btn-sm" data-act="resettem" title="Bỏ các ô đã sửa tay, lấy lại giá trị tự động">↺ Lấy lại tự động</button>
          </div>
          <div class="desc-preview"><b>Mô tả khai hải quan:</b> ${esc(descOf(code))}${m.descManual ? ' <span class="muted small">(đang dùng bản sửa tay ở mục 3)</span>' : ''}</div>
        </div>
        <div class="tem-preview">${temPaper(code)}</div>
      </div>`;
    }).join('');
  }
  $('#temList').addEventListener('change', async (e) => {
    const card = e.target.closest('.tem-card'); if (!card) return; const code = card.dataset.code; const m = ensureModel(code);
    if (e.target.dataset.temfile !== undefined) { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) importTem(fs, code); return; }
    if (e.target.dataset.img !== undefined) {
      const f = e.target.files[0]; if (!f) return;
      try { m.img = await shrinkImage(f); const s = S.sups.find((y) => y.id === m.supId) || sup(); if (s.id && !s.logo) s.logo = m.img; saveSet(); later(); }
      catch (err) { GauBep.toast('Không đọc được hình'); }
      return;
    }
    const k = e.target.dataset.t; if (!k) return;
    let v = e.target.value.trim(); if (k === 'barcode') v = v.replace(/\D/g, '');
    const auto = temAuto(code)[k] || '';
    if (k === 'makerVi' || k === 'makerAddrVi') {          // tên / địa chỉ NSX tiếng Việt: lưu cho cả NCC (dùng lại cho model khác)
      const s = S.sups.find((y) => y.id === m.supId) || sup();
      if (s.id && !lcFind(code)) { s[k === 'makerVi' ? 'nameVi' : 'addrVi'] = v; delete m.tem[k]; saveSet(); later(); return; }
    }
    if (v === auto) delete m.tem[k]; else m.tem[k] = v;
    saveSet(); later();
  });
  $('#temList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return; const code = b.closest('.tem-card').dataset.code; const m = ensureModel(code);
    if (b.dataset.act === 'noimg') { m.img = ''; saveSet(); renderAll(); }
    if (b.dataset.act === 'resettem') { m.tem = {}; saveSet(); renderAll(); GauBep.toast('Đã lấy lại giá trị tự động'); }
    if (b.dataset.act === 'copytem') await copyText(temText(code), b);
    if (b.dataset.act === 'printtem') {
      const paper = document.querySelector(`.tem-paper[data-paper="${CSS.escape(code)}"]`); if (!paper) return;
      paper.classList.add('print-me'); document.body.classList.add('printing-tem');
      const done = () => { paper.classList.remove('print-me'); document.body.classList.remove('printing-tem'); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done); window.print(); setTimeout(done, 1500);
    }
  });
  /* Nạp tem có sẵn (PDF / .ai / ảnh) → điền các ô tem của model. Không đọc mã vạch.
     Nạp nhiều file cùng lúc; 1 file có nhiều trang / nhiều tem cũng được — mỗi tem tìm model theo dòng "Model :".
     Tem không khớp model nào trong lô → hiện ở danh sách bên dưới để chọn model. forCode: nạp từ nút trong thẻ model. */
  let TEM_PENDING = []; let TEM_LOG = [];
  const TEM_KEYS = ['nameVi', 'brand', 'voltage', 'power', 'year', 'pack', 'control', 'sizeP', 'sizeBox', 'wP', 'wBox', 'feature', 'makerVi', 'makerAddrVi'];
  function applyTem(code, x, fname) {
    const m = ensureModel(code);
    const got = TEM_KEYS.filter((k) => x[k]); got.forEach((k) => { m.tem[k] = x[k]; });
    const s = S.sups.find((y) => y.id === m.supId) || sup();
    if (s.id) { if (x.makerVi && !s.nameVi) s.nameVi = x.makerVi; if (x.makerAddrVi && !s.addrVi) s.addrVi = x.makerAddrVi; if (x.brand && !s.brand) s.brand = x.brand; }
    if (x.importerName && !S.gen.importerName) S.gen.importerName = x.importerName;
    if (x.importerAddr && !S.gen.importerAddr) S.gen.importerAddr = x.importerAddr;
    m.temFile = fname;
    return got.length;
  }
  async function importTem(files, forCode) {
    if (busy) { GauBep.toast('Đang đọc file trước, chờ chút…'); return; }
    busy = true; TEM_LOG = [];
    try {
      for (let n = 0; n < files.length; n++) {
        const f = files[n];
        try {
          GauBep.toast(`🔎 Đang đọc tem ${n + 1}/${files.length}: ${f.name}… (lần đầu tải bộ đọc chữ tiếng Việt ~1,5 MB)`);
          const { text } = await fileText(f, 'vie');
          const list = P.tems(text);
          if (!list.length) { TEM_LOG.push({ file: f.name, msg: 'không đọc được nội dung tem', bad: true }); continue; }
          list.forEach((x, k) => {
            const codes = temCodes();
            let code = (x.model && codes.find((c) => normKey(c) === normKey(x.model))) || '';
            if (!code && forCode && k === 0) code = forCode;
            const name = f.name + (list.length > 1 ? ` (tem ${k + 1})` : '');
            if (!code) { TEM_PENDING.push({ id: uid(), file: name, x }); TEM_LOG.push({ file: name, msg: `model ${x.model || '?'} không có trong lô — chọn model bên dưới`, bad: true }); return; }
            const cnt = applyTem(code, x, name);
            TEM_LOG.push({ file: name, msg: `→ ${code}: ${cnt} ô` + (x.model && normKey(x.model) !== normKey(code) ? ` (tem ghi ${x.model} — kiểm tra lại)` : ''), bad: !!(x.model && normKey(x.model) !== normKey(code)) });
          });
        } catch (e) { TEM_LOG.push({ file: f.name, msg: e.message || 'không đọc được tem', bad: true }); }
      }
    } finally { busy = false; }
    saveSet(); renderAll();
    const ok = TEM_LOG.filter((x) => !x.bad).length;
    GauBep.toast(`Đã đọc ${ok}/${TEM_LOG.length} tem 🐼`);
  }
  function renderTemLog() {
    const box = $('#temLog'); const codes = temCodes();
    if (!TEM_LOG.length && !TEM_PENDING.length) { box.innerHTML = ''; return; }
    box.innerHTML = (TEM_LOG.length ? `<div class="tem-log">${TEM_LOG.map((x) => `<div class="${x.bad ? 'bad' : 'ok'}">${x.bad ? '⚠️' : '✅'} <b>${esc(x.file)}</b> ${esc(x.msg)}</div>`).join('')}</div>` : '')
      + TEM_PENDING.map((p) => `<div class="tem-pend" data-pid="${p.id}"><span>🏷️ <b>${esc(p.file)}</b> · ${esc(p.x.title || p.x.nameVi || '')}${p.x.model ? ' · Model ' + esc(p.x.model) : ''}</span>
        <select data-pend-code><option value="">— gán cho model —</option>${codes.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
        <button type="button" class="btn btn-primary btn-sm" data-pend="apply">Áp dụng</button><button type="button" class="btn btn-ghost btn-sm" data-pend="drop">Bỏ</button></div>`).join('');
  }
  $('#temLog').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pend]'); if (!b) return; const row = b.closest('.tem-pend'); const p = TEM_PENDING.find((x) => x.id === row.dataset.pid);
    if (b.dataset.pend === 'apply') {
      const code = row.querySelector('[data-pend-code]').value; if (!code) { GauBep.toast('Chọn model trước'); return; }
      const cnt = applyTem(code, p.x, p.file); GauBep.toast(`Đã gán tem cho ${code}`);
      TEM_LOG = TEM_LOG.map((x) => (x.file === p.file ? { file: x.file, msg: `→ ${code}: ${cnt} ô (gán tay)`, bad: false } : x));
    }
    TEM_PENDING = TEM_PENDING.filter((x) => x !== p); saveSet(); renderAll();
  });
  $('#fileTem').addEventListener('change', (e) => { importTem([...e.target.files]); e.target.value = ''; });
  const tdz = $('#temDrop');
  ['dragenter', 'dragover'].forEach((ev) => tdz.addEventListener(ev, (e) => { e.preventDefault(); tdz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => tdz.addEventListener(ev, (e) => { e.preventDefault(); tdz.classList.remove('over'); }));
  tdz.addEventListener('drop', (e) => importTem([...e.dataTransfer.files].filter((f) => /\.(pdf|ai|png|jpe?g|webp)$/i.test(f.name))));

  function shrinkImage(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { const im = new Image(); im.onload = () => {
        const M = 320; const k = Math.min(1, M / Math.max(im.width, im.height));
        const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        const png = c.toDataURL('image/png'); res(png.length < 120000 ? png : c.toDataURL('image/jpeg', 0.85));
      }; im.onerror = rej; im.src = fr.result; };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  async function copyText(t, el) {
    try { await navigator.clipboard.writeText(t); if (el) { el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 900); } GauBep.toast('Đã copy'); }
    catch (err) { GauBep.toast('Trình duyệt chặn copy — bôi đen để copy tay'); }
  }

  /* ======================= 5. KIỂM TRA ======================= */
  function renderChecks() {
    const out = []; const add = (lv, m) => out.push([lv, m]);
    const same = (a, b) => isFinite(a) && isFinite(b) && Math.abs(a - b) < 0.01;
    const cmp = (name, arr, unit) => {
      const v = arr.filter((x) => has(x.v)); if (v.length < 2) return;
      const ok = v.every((x) => same(x.v, v[0].v));
      add(ok ? 'ok' : 'err', ok ? `${name} khớp: ${fmt(v[0].v)} ${unit} (${v.map((x) => x.n).join(', ')})` : `${name} lệch: ` + v.map((x) => `${x.n} ${fmt(x.v)}`).join(' · '));
    };
    const qtyTotal = L.lines.reduce((a, l) => a + (parseNum(l.qty) || 0), 0);
    const amtTotal = L.lines.reduce((a, l) => a + lineAmt(l), 0);
    cmp('Số kiện', [{ n: 'Bill', v: L.pkgs }, { n: 'PL', v: L.plPkgs }, { n: 'C/O', v: L.coPkgs }], 'kiện');
    cmp('Gross weight', [{ n: 'Bill', v: L.gw }, { n: 'PL', v: L.plGw }, { n: 'C/O', v: L.coGw }], 'kg');
    if (L.lines.length) cmp('Số lượng hàng', [{ n: 'Danh sách hàng', v: qtyTotal }, { n: 'PL', v: L.plQty }], '');
    if (L.lines.length && has(L.invTotal)) {
      add(same(amtTotal, L.invTotal) ? 'ok' : 'err', same(amtTotal, L.invTotal) ? `Tổng trị giá các dòng = tổng Invoice: ${fmt(amtTotal, 2)} USD`
        : `Tổng các dòng ${fmt(amtTotal, 2)} USD khác tổng Invoice ${fmt(L.invTotal, 2)} USD (dòng F.O.C có tính trị giá thì Invoice cũng phải có)`);
    }
    L.lines.forEach((l, i) => { if (has(l.invAmount) && !same(lineAmt(l), l.invAmount)) add('err', `Dòng ${i + 1} ${l.code}: SL × đơn giá = ${fmt(lineAmt(l), 2)}, Invoice ghi ${fmt(l.invAmount, 2)}`); });
    if (L.coNo && L.invNo && L.coText) {
      const ct = normKey(L.coText), iv = normKey(L.invNo);
      if (ct.includes(iv)) add('ok', 'Số Invoice trên C/O khớp');
      else if (ct.includes(iv.slice(0, -1))) add('warn', `Số Invoice trên C/O đọc không trọn (bản scan xuống dòng) — nhìn lại ô 10 của C/O: ${L.invNo}`);
      else add('err', `Không thấy số Invoice ${L.invNo} trên C/O`);
    }
    if (L.coDate && L.blDate) {
      const days = Math.round((new Date(L.coDate) - new Date(L.blDate)) / 864e5);
      if (days > 3) add('warn', `C/O cấp ${dmy(L.coDate)}, sau ngày tàu chạy ${days} ngày — xem C/O có đánh dấu "Issued Retroactively" không`);
      else add('ok', `C/O cấp ${dmy(L.coDate)}, ngày tàu chạy ${dmy(L.blDate)}`);
    }
    if (L.coNo) add('ok', `Có C/O Form ${L.coForm || 'E'} số ${L.coNo}: thuế NK theo ${String(L.coForm || 'E').toUpperCase() === 'E' ? 'ACFTA' : 'MFN (form khác E: tự kiểm tra biểu thuế)'}, số C/O đã ghép vào phần ghi chú`);
    else if (L.lines.length) add('warn', 'Chưa có C/O: thuế NK tính theo MFN');
    if (L.blHs && L.lines.length) {
      const bad = L.lines.filter((l) => lineHS(l) && !lineHS(l).startsWith(L.blHs.slice(0, 4)));
      if (bad.length) add('warn', `HS trên Bill là ${L.blHs}, khác nhóm với dòng ${bad.map((l) => l.code || '?').join(', ')} — xem lại`);
    }
    // Arrival Notice, hoá đơn cước / bảo hiểm
    if (L.docs.an) {
      if (L.anBl && L.blNo) add(normKey(L.anBl).includes(normKey(L.blNo)) || normKey(L.blNo).includes(normKey(L.anBl)) ? 'ok' : 'err', normKey(L.anBl).includes(normKey(L.blNo)) || normKey(L.blNo).includes(normKey(L.anBl)) ? `Số vận đơn trên Arrival Notice khớp Bill (${L.blNo})` : `Arrival Notice ghi vận đơn ${L.anBl}, khác Bill ${L.blNo}`);
      if (L.anVessel && L.vessel && !normKey(L.anVessel).includes(normKey(L.vessel).slice(0, 8)) && !normKey(L.vessel).includes(normKey(L.anVessel).slice(0, 8))) add('warn', `Tên tàu trên AN (${L.anVessel}) khác Bill (${L.vessel}) — tàu có thể đã đổi, khai theo AN`);
      if (!L.arrival) add('warn', 'Không đọc được ngày hàng đến trên Arrival Notice — nhập tay ở mục 2');
    }
    if (L.freightDoc) {
      const d = L.freightDoc;
      add('ok', `Phí vận chuyển lấy từ ${d.file}: ${d.lines.map((x) => `${x.desc} = ${fmt(x.amt, 2)} ${x.cur}`).join(' + ')}`);
      if (d.local && d.local.length) add('ok', `Đã bỏ qua phí local không cộng vào trị giá hải quan: ${d.local.slice(0, 6).join(', ')}`);
    }
    if (L.anFreightUsd && L.freightCur === 'USD' && has(L.freight) && Math.abs(L.anFreightUsd - L.freight) > 0.01) add('warn', `Cước trên Arrival Notice USD ${fmt(L.anFreightUsd, 2)} khác hoá đơn cước USD ${fmt(L.freight, 2)}`);
    if (L.anFreightUsd && !has(L.freight)) add('warn', `Arrival Notice ghi cước O/F USD ${fmt(L.anFreightUsd, 2)} — chưa có hoá đơn cước, có thể khai tạm theo AN`);
    if (L.insDoc) add('ok', `Phí bảo hiểm lấy từ ${L.insDoc.file}: ${L.insDoc.lines.map((x) => `${fmt(x.amt, 2)} ${x.cur}`).join(' + ')}`);
    // linh kiện
    L.lines.forEach((l, i) => {
      const h = peek(l); if (!h.part) return;
      const tr = V.part(enOf(h)); const nm = l.code || enOf(h) || `dòng ${i + 1}`;
      if (h.hsSrc === 'sug') add('warn', `Dòng ${i + 1} (${nm}): mã HS ${fmtHS(h.hs)} là gợi ý tự động cho linh kiện — bấm ô Mã HS, chọn lại 1 mã để xác nhận`);
      if (!h.parent && !tr.parentVi) add('warn', `Dòng ${i + 1} (${nm}): linh kiện chưa rõ của máy nào — chọn "của máy" để ghép mô tả và gợi ý HS`);
      if (tr.unknown.length && !(h.descManual && h.desc)) add('warn', `Dòng ${i + 1} (${nm}): chưa dịch được "${tr.unknown.join('", "')}" — sửa tay mô tả`);
    });
    // hợp đồng
    const s = sup();
    if (!s.name) add('warn', 'Chưa có nhà cung cấp — nạp hợp đồng (PDF / Word) hoặc thêm ở ⚙️ Cài đặt');
    else if (!s.contractNo) add('warn', `Chưa có hợp đồng của ${s.name} — nạp file hợp đồng để lấy số, ngày, hạn hợp đồng`);
    if (s.contractEnd) { const ref = L.invDate || new Date().toISOString().slice(0, 10); add(s.contractEnd >= ref ? 'ok' : 'err', s.contractEnd >= ref ? `Hợp đồng ${s.contractNo || ''} còn hiệu lực đến ${dmy(s.contractEnd)}` : `Hợp đồng ${s.contractNo || ''} hết hạn ${dmy(s.contractEnd)} trước ngày Invoice`); }
    if (s.endGuess) add('warn', `Ngày hết hạn hợp đồng đọc không rõ (bị che / mờ) — tool lấy ngày cuối tháng ${dmy(s.contractEnd)}. Kiểm lại trên hợp đồng rồi sửa ở ⚙️ Cài đặt nếu khác`);
    if (s.contractDate2 && s.contractDate && s.contractDate2 !== s.contractDate) add('warn', `Hợp đồng ghi 2 ngày khác nhau: đầu trang ${dmy(s.contractDate)}, điều khoản hiệu lực ${dmy(s.contractDate2)} — tờ khai đang lấy ${dmy(s.contractDate)}. Nên đính chính với NCC`);
    if (s.contractOcr) add('warn', 'Hợp đồng là bản scan — số, ngày đã đọc bằng nhận dạng chữ, xem lại một lần ở mục 1');
    // mã HS & Landed Cost
    L.lines.forEach((l, i) => {
      const hs = lineHS(l); const R = rateOf(hs);
      if (!hs) add('err', `Dòng ${i + 1} ${l.code || ''}: chưa có mã HS — bấm ô Mã HS để tra, hoặc 🚢 Lấy HS từ Landed Cost`);
      else if (R && R.bad) add('err', `Dòng ${i + 1} ${l.code || ''}: mã ${fmtHS(hs)} không có trong biểu thuế`);
      const p = l.code ? lcFind(l.code) : null;
      if (hs && p && lcHS(p) && lcHS(p) !== hs) add('warn', `${l.code}: Landed Cost đang để mã ${fmtHS(lcHS(p))}, phiếu khai dùng ${fmtHS(hs)} — thống nhất 1 mã`);
    });
    // tem phụ
    temCodes().forEach((code) => {
      const t = temOf(code); const miss = [['nameVi', 'tên hàng'], ['makerVi', 'nhà sản xuất'], ['makerAddrVi', 'địa chỉ NSX']].filter(([k]) => !t[k]).map((x) => x[1]);
      if (!S.gen.importerName) miss.push('nhà nhập khẩu (⚙️ Cài đặt)');
      if (miss.length) add('warn', `Tem phụ ${code} còn thiếu: ${miss.join(', ')}`);
      const unk = t.auto.unknown.filter((u) => [t.nameVi, t.makerVi, t.makerAddrVi].some((v) => String(v).includes(u)));
      if (unk.length) add('warn', `Tem phụ ${code}: chưa dịch được "${unk.join('", "')}" — sửa tay ở mục 4`);
      if (t.barcode && !eanFix(t.barcode).ok) add('err', `Tem phụ ${code}: mã vạch ${t.barcode} sai chuẩn EAN-13`);
    });
    if (L.pol && !P.POL[String(L.pol).toUpperCase()]) add('warn', `Chưa có mã cảng xếp cho "${L.pol}" — gõ mã trên ECUS`);
    const pod = podInfo();
    if (L.pod && !pod) add('warn', `Chưa có mã cảng dỡ cho "${L.pod}"`);
    else if (pod && !pod.store && !L.storeCode) add('warn', `Chưa có mã địa điểm lưu kho cho ${pod.name} — nạp Arrival Notice hoặc xem trên AN`);
    const miss = { arrival: 'ngày hàng đến', freight: 'phí vận chuyển', ins: 'phí bảo hiểm', rate: 'tỷ giá tính thuế' };
    const m = Object.keys(miss).filter((k) => !has(L[k])).map((k) => miss[k]);
    if (m.length) add('warn', 'Còn thiếu: ' + m.join(', '));
    const order = { err: 0, warn: 1, ok: 2 };
    $('#checks').innerHTML = out.length ? out.sort((a, b) => order[a[0]] - order[b[0]]).map(([lv, msg]) => `<li class="${lv}"><i>${{ ok: 'Khớp', warn: 'Lưu ý', err: 'Sai lệch' }[lv]}</i><span>${esc(msg)}</span></li>`).join('')
      : '<li><span class="muted">Nạp chứng từ để kiểm tra.</span></li>';
  }

  /* ======================= 6. PHIẾU KHAI ======================= */
  function podInfo() { const s = String(L.pod || ''); for (const [re, v] of P.POD) if (re.test(s)) return v; return null; }
  function polInfo() { const k = String(L.pol || '').toUpperCase().trim(); return P.POL[k] ? { code: P.POL[k][0], name: P.POL[k][1] } : null; }
  const term = () => String(L.incoterm || '').trim().split(/\s+/)[0].toUpperCase();
  const contCount = () => (L.cont ? String(L.cont).split(',').filter((x) => x.trim()).length : '');
  function note() {
    const s = sup(); const parts = [];
    if (s.contractNo) parts.push(s.contractNo, ddmmyyyy(s.contractDate), ddmmyyyy(s.contractEnd));
    let t = parts.filter(Boolean).join('#&');
    if (L.coNo) t += (t ? '#&' : '') + `CO FORM ${String(L.coForm || 'E').toUpperCase()} SỐ ${L.coNo} ngày ${dmy(L.coDate)}`;
    return t;
  }
  const C = (v, fixed) => ({ v: has(v) ? String(v) : '', fixed });
  function rowsT1() {
    const g = S.gen, s = sup(), pol = polInfo(), pod = podInfo();
    return [
      ['Mã loại hình', [C(g.loaiHinh, 1)]], ['Cơ quan hải quan', [C(g.coQuan, 1)]], ['Mã bộ phận xử lý', [C(g.boPhan, 1)]],
      ['Người xuất khẩu – Tên', [C(s.name, 1)]], ['Người xuất khẩu – Địa chỉ', [C(s.addr1, 1), C(s.addr2, 1), C(s.addr3, 1), C(s.addr4, 1)].filter((x, i) => i === 0 || x.v)],
      ['Mã nước', [C(s.country || L.origin, 1)]],
      ['Số vận đơn', [C(L.blNo && L.blDate ? ddmmyy(L.blDate) + L.blNo : '')]],
      ['Số lượng kiện', [C(raw(L.pkgs)), C('CT', 1)]], ['Tổng trọng lượng (Gross)', [C(raw(L.gw)), C('KGM', 1)]],
      ['Số lượng container', [C(contCount())]],
      ['Địa điểm lưu kho', [C(L.storeCode || (pod && pod.store)), C(L.storeCode && pod && L.storeCode !== pod.store ? '' : pod && pod.storeName)]], ['Địa điểm dỡ hàng', [C(pod && pod.code), C(pod && pod.name)]],
      ['Địa điểm xếp hàng', [C(pol && pol.code), C(pol && pol.name)]], ['Phương tiện vận chuyển', [C(g.ptvc, 1), C(L.vessel)]],
      ['Ngày hàng đến', [C(dmy(L.arrival))]],
    ];
  }
  function rowsT2() {
    const g = S.gen;
    return [
      ['Số hoá đơn', [C('A', 1), C(L.invNo)]], ['Ngày phát hành', [C(dmy(L.invDate))]], ['Phương thức thanh toán', [C(g.pttt, 1)]],
      ['Tổng trị giá hoá đơn', [C('A', 1), C(term()), C('USD', 1), C(raw(L.invTotal))]], ['Mã phân loại khai trị giá', [C(g.mpltg, 1)]],
      ['Phí vận chuyển', [C('A', 1), C(L.freightCur || 'VND', 1), C(raw(L.freight))]], ['Phí bảo hiểm', [C('A', 1), C(L.insCur || 'VND', 1), C(raw(L.ins))]],
      ['Chi tiết khai trị giá', [C(L.blDate ? ddmmyyyy(L.blDate) + '#&' : '')]],
      ['Giấy phép nhập khẩu', [C('RK01', 1), C(L.permit)]], ['Phần ghi chú', [C(note())]],
    ];
  }
  function rowsT3() {
    const r = [];
    L.lines.forEach((l, i) => {
      const hs = lineHS(l); const R = rateOf(hs); const u = lineUnit(l);
      r.push([`Dòng ${i + 1} · ${l.code || ''}`, [], 'head']);
      r.push(['Mã số hàng hoá', [C(hs)]], ['Mô tả hàng hoá', [C(lineDesc(l))]],
        ['Số lượng (1) / ĐVT', [C(raw(l.qty)), C(u, 1)]], ['Số lượng (2) / ĐVT', [C(raw(l.qty)), C(u, 1)]],
        ['Trị giá hoá đơn', [C(raw(lineAmt(l)))]], ['Đơn giá hoá đơn', [C(raw(l.price)), C('USD', 1), C(u, 1)]],
        ['Nước xuất xứ', [C(L.origin, 1)]], ['Mã biểu thuế NK', [C(btNK(l))]], ['Mã biểu thuế VAT', [C(S.gen.btVat)]],
        ['Thuế suất NK / VAT', [C(nkOf(l, R) !== '' ? nkOf(l, R) + '%' : ''), C(vatOf(l, R) !== '' ? vatOf(l, R) + '%' : '')]]);
    });
    if (!r.length) r.push(['Chưa có dòng hàng', [C('')]]);
    return r;
  }
  const nkOf = (l, R) => (has(l.nkOv) ? l.nkOv : R && !R.bad && isFinite(R.nk) ? R.nk : '');
  const vatOf = (l, R) => (has(l.vatOv) ? l.vatOv : R && !R.bad ? R.vat : '');
  const isFormE = () => has(L.coNo) && String(L.coForm || 'E').toUpperCase() === 'E';
  const btNK = (l) => (l.code ? (modelOf(l.code) || {}).bt : l.bt) || (isFormE() ? S.gen.btFormE : '');
  let tab = 't1';
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; tab = b.dataset.tab;
    document.querySelectorAll('#tabs button').forEach((x) => x.setAttribute('aria-selected', x === b)); renderOut();
  });
  function renderOut() {
    const rows = tab === 't1' ? rowsT1() : tab === 't2' ? rowsT2() : rowsT3();
    $('#out').innerHTML = rows.map(([lbl, chips, kind]) => kind === 'head' ? `<div class="row head">${esc(lbl)}</div>`
      : `<div class="row"><div class="lbl">${esc(lbl)}</div><div class="chips">${chips.map((c) => c.v
        ? `<button type="button" class="chip${c.fixed ? ' fixed' : ''}" data-copy="${esc(c.v)}" title="Bấm để copy">${esc(c.v)}</button>`
        : '<span class="chip miss">còn thiếu</span>').join('')}</div></div>`).join('');
  }
  $('#out').addEventListener('click', (e) => { const b = e.target.closest('[data-copy]'); if (b) copyText(b.dataset.copy, b); });

  /* ======================= 7. THUẾ ======================= */
  function taxCalc() {
    const rate = parseNum(L.rate); const t = term();
    const addFr = /^(FOB|EXW|FCA)$/.test(t), addIns = addFr || /^(CFR|CNF)$/.test(t);
    const vndOf = (v, cur) => (parseNum(v) || 0) * (cur === 'USD' ? rate : 1);
    const extra = (addFr ? vndOf(L.freight, L.freightCur) : 0) + (addIns ? vndOf(L.ins, L.insCur) : 0);
    const tot = L.lines.reduce((a, l) => a + lineAmt(l), 0);
    let base = 0, nk = 0, vat = 0;
    L.lines.forEach((l) => {
      const R = rateOf(lineHS(l)); const amt = lineAmt(l);
      const tg = amt * rate + (tot ? extra * amt / tot : 0);
      const n = tg * (parseNum(nkOf(l, R)) || 0) / 100;
      base += tg; nk += n; vat += (tg + n) * (parseNum(vatOf(l, R)) || 0) / 100;
    });
    return { ok: rate > 0 && L.lines.length > 0, base: Math.round(base), nk: Math.round(nk), vat: Math.round(vat) };   // ECUS làm tròn từng sắc thuế
  }
  function renderTax() {
    const x = taxCalc(); const v = (n) => (x.ok ? GauBep.fmt.vnd(n) : '–');
    $('#kpis').innerHTML = `<div class="kpi"><div class="label">Trị giá tính thuế</div><div class="value">${v(x.base)}</div></div>
      <div class="kpi"><div class="label">Thuế nhập khẩu</div><div class="value">${v(x.nk)}</div></div>
      <div class="kpi"><div class="label">Thuế GTGT</div><div class="value">${v(x.vat)}</div></div>
      <div class="kpi accent"><div class="label">Tổng thuế phải nộp</div><div class="value">${v(x.nk + x.vat)}</div></div>`;
  }

  /* ======================= XUẤT FILE ECUS ======================= */
  const ECUS_HEAD = ['STT', 'Mã hàng', 'Tên hàng (mô tả chi tiết)', 'Mã HS', 'Xuất xứ', 'Lượng', 'Đơn vị tính', 'Lượng 2', 'Đơn vị tính 2',
    'Đơn giá hóa đơn', 'Trị giá hóa đơn', 'Đơn giá tính thuế', 'Trị giá tính thuế', 'Mã biểu thuế NK', 'TS NK(%)', 'Tiền thuế NK',
    'Mã biếu thuế TTĐB', 'Thuế suất TTĐB(%)', 'Tiền thuế TTĐB', 'Mã biểu thuế môi trường', 'Thuế suất môi trường', 'Tiền thuế môi trường',
    'Mã biểu thuế VAT', 'Thuế suất VAT(%)', 'Tiền thuế VAT'];
  function ecusAoa() {
    return [ECUS_HEAD, ...L.lines.map((l, i) => [
      String(i + 1), null, lineDesc(l) || '', String(lineHS(l) || ''), String(L.origin || ''), parseNum(l.qty), lineUnit(l), parseNum(l.qty), lineUnit(l),
      parseNum(l.price), lineAmt(l), null, null, btNK(l) || null, null, null, null, null, null, null, null, null, S.gen.btVat || null, null, null,
    ])];
  }
  $('#btnExport').onclick = async () => {
    if (!L.lines.length) { GauBep.toast('Chưa có dòng hàng để xuất'); return; }
    const bad = L.lines.filter((l) => !lineHS(l) || !lineDesc(l) || !(parseNum(l.qty) > 0));
    if (bad.length) { GauBep.toast(`Còn ${bad.length} dòng thiếu mã HS / mô tả / số lượng`); return; }
    try {
      if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
      const ws = XLSX.utils.aoa_to_sheet(ecusAoa());
      ws['!cols'] = [6, 10, 60, 12, 8, 10, 10, 10, 10, 12, 14, 12, 14, 10, 8, 12, 10, 8, 12, 10, 8, 12, 10, 8, 12].map((w) => ({ wch: w }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const safe = String(L.invNo || 'lo').replace(/[^\w\-]+/g, '_');
      XLSX.writeFile(wb, `DS_KHAI_HQ_${safe}_${GauBep.today()}.xls`, { bookType: 'biff8' });
      GauBep.toast('Đã xuất file danh sách hàng 🎉');
    } catch (e) { GauBep.toast(e.message || 'Không xuất được file'); }
  };

  /* ======================= CÀI ĐẶT ======================= */
  const SUP_FIELDS = [['key', 'Từ khoá nhận diện trên Invoice'], ['name', 'Tên người xuất khẩu (ECUS)'], ['addr1', 'Địa chỉ dòng 1'], ['addr2', 'Địa chỉ dòng 2'], ['addr3', 'Địa chỉ dòng 3'], ['addr4', 'Địa chỉ dòng 4'],
    ['country', 'Mã nước'], ['brand', 'Nhãn hiệu'], ['contractNo', 'Số hợp đồng'], ['contractDate', 'Ngày hợp đồng', 'date'], ['contractEnd', 'Hợp đồng hết hạn', 'date'],
    ['nameVi', 'Tên tiếng Việt (tem phụ)', '', 'wide'], ['addrVi', 'Địa chỉ tiếng Việt (tem phụ)', '', 'wide']];
  function renderSettings() {
    const gf = (arr) => arr.map(([k, lbl, tip]) => `<div class="field${k === 'importerAddr' || k === 'usage' || k === 'storage' ? ' wide' : ''}"><label>${lbl}${tip ? ` <span class="hint" tabindex="0" data-tip="${esc(tip)}">?</span>` : ''}</label><input data-g="${k}" value="${esc(S.gen[k])}"></div>`).join('');
    $('#genForm').innerHTML = gf(GEN_FIELDS);
    $('#temGenForm').innerHTML = gf(TEM_GEN);
    $('#supList').innerHTML = S.sups.length ? S.sups.map((s, i) => `<div class="sup" data-sid="${s.id}"><div class="sup-head"><span>NCC ${i + 1}${s.name ? ' · ' + esc(s.name) : ''}${s.contractFile ? ` <span class="muted small">· HĐ: ${esc(s.contractFile)}</span>` : ''}</span>
        <span><button class="btn btn-ghost btn-sm" data-act="retrans" title="Dịch lại tên + địa chỉ tiếng Việt từ bản tiếng Anh">↺ Dịch lại</button> <button class="btn btn-ghost btn-sm" data-act="delsup">Xoá</button></span></div>
      <div class="form-grid">${SUP_FIELDS.map(([k, lbl, t, w]) => `<div class="field${w ? ' wide' : ''}"><label>${lbl}</label><input data-s="${k}"${t ? ` type="${t}"` : ''} value="${esc(s[k] || '')}"></div>`).join('')}</div></div>`).join('')
      : '<p class="muted">Chưa có nhà cung cấp — nạp file hợp đồng là tool tự tạo.</p>';
    const codes = Object.keys(S.models).sort();
    $('#modelBody').innerHTML = codes.length ? codes.map((c) => { const m = S.models[c]; return `<tr data-code="${esc(c)}">
      <td><input data-m="code" value="${esc(c)}" style="width:130px"></td><td><input data-m="hs" value="${esc(fmtHS(m.hs))}" style="width:120px"></td>
      <td class="wrap">${esc(descOf(c))}</td><td><input data-m="unit" value="${esc(m.unit || 'PCE')}" style="width:64px"></td>
      <td><input data-m="bt" value="${esc(m.bt || '')}" placeholder="tự động" style="width:84px" title="Để trống: tự dùng mã biểu thuế Form E khi có C/O"></td>
      <td><button class="btn btn-ghost btn-sm btn-icon" data-act="delmodel" aria-label="Xoá model">✕</button></td></tr>`; }).join('')
      : '<tr><td colspan="6" class="muted">Chưa có model — nạp Invoice là tool tự thêm.</td></tr>';
    const n = lcProducts().length;
    $('#lcInfo').textContent = n ? `Landed Cost trên máy này có ${n} sản phẩm.` : 'Landed Cost trên máy này chưa có sản phẩm (ngoài ví dụ).';
  }
  const onGen = (e) => { const k = e.target.dataset.g; if (!k) return; S.gen[k] = e.target.value.trim(); saveSet(); later(); };
  $('#genForm').addEventListener('change', onGen); $('#temGenForm').addEventListener('change', onGen);
  $('#supList').addEventListener('change', (e) => {
    const k = e.target.dataset.s; if (!k) return; const s = S.sups.find((x) => x.id === e.target.closest('.sup').dataset.sid);
    s[k] = e.target.value.trim(); if (['country', 'name', 'key', 'addr1', 'addr2', 'addr3', 'addr4', 'contractNo'].includes(k)) s[k] = s[k].toUpperCase();
    if (k === 'contractEnd') s.endGuess = false;
    if (k === 'contractDate') s.contractDate2 = '';
    saveSet(); later();
  });
  $('#supList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return; const id = b.closest('.sup').dataset.sid; const s = S.sups.find((x) => x.id === id);
    if (b.dataset.act === 'delsup') { S.sups = S.sups.filter((x) => x.id !== id); if (L.supId === id) L.supId = (S.sups[0] || {}).id || ''; }
    if (b.dataset.act === 'retrans') { s.nameVi = V.company(s.name).vi; s.addrVi = V.address(s.addrRaw || [s.addr1, s.addr2, s.addr3].filter(Boolean).join(', '), s.country || 'CN').vi; GauBep.toast('Đã dịch lại — sửa tay các tên riêng nếu cần'); }
    saveSet(); saveLot(); renderAll();
  });
  $('#btnAddSup').onclick = () => { const s = { id: uid(), country: 'CN' }; S.sups.push(s); if (!L.supId) L.supId = s.id; saveSet(); saveLot(); renderAll(); };
  $('#modelBody').addEventListener('change', (e) => {
    const k = e.target.dataset.m; if (!k) return; const old = e.target.closest('tr').dataset.code; const m = S.models[old];
    if (k === 'code') {
      const nv = e.target.value.trim().toUpperCase();
      if (!nv || (nv !== old && S.models[nv])) { GauBep.toast(nv ? 'Model này đã có trong thư viện' : 'Model không được để trống'); renderAll(); return; }
      delete S.models[old]; S.models[nv] = m; L.lines.forEach((l) => { if (l.code === old) l.code = nv; }); saveLot();
    } else if (k === 'hs') { m.hs = e.target.value.replace(/\D/g, ''); m.hsSrc = ''; }
    else m[k] = e.target.value.trim().toUpperCase();
    saveSet(); later();
  });
  $('#modelBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act="delmodel"]'); if (!b) return; delete S.models[b.closest('tr').dataset.code]; saveSet(); renderAll();
  });
  $('#btnAddModel').onclick = () => {
    let n = Object.keys(S.models).length + 1; while (S.models['MODEL-' + n]) n++;
    S.models['MODEL-' + n] = { hs: '', unit: 'PCE', bt: '', desc: '', descManual: false, tem: {}, img: '', supId: L.supId }; saveSet(); renderAll();
    GauBep.toast('Đã thêm dòng MODEL-' + n + ' — sửa lại mã model, HS');
  };
  $('#btnFromLC').onclick = () => {
    const list = lcProducts(); let n = 0;
    list.forEach((p) => { if (!S.models[p.code]) { ensureModel(p.code, ''); n++; } });
    saveSet(); renderAll();
    GauBep.toast(list.length ? `Đã lấy ${n} model mới từ Landed Cost` : 'Landed Cost trên máy này chưa có sản phẩm');
  };
  $('#btnSettings').onclick = () => { const c = $('#settingsCard'); c.hidden = !c.hidden; if (!c.hidden) c.scrollIntoView({ behavior: 'smooth' }); };
  $('#btnCloseSettings').onclick = () => { $('#settingsCard').hidden = true; };
  $('#btnBackup').onclick = () => {
    const blob = new Blob([JSON.stringify({ app: 'customs-entry', v: 1, settings: S }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `PhieuKhai_SaoLuu_${GauBep.today()}.json`;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  $('#fileBackup').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const d = JSON.parse(await f.text()); if (d.app !== 'customs-entry' || !d.settings) throw new Error('File không đúng bản sao lưu của tool này');
      S = d.settings; S.gen = { ...DEF_GEN, ...(S.gen || {}) }; S.sups = S.sups || []; S.models = S.models || {};
      Object.values(S.models).forEach((m) => { m.tem = m.tem || {}; });
      if (!S.sups.find((x) => x.id === L.supId)) L.supId = (S.sups[0] || {}).id || '';
      saveSet(); saveLot(); renderAll(); GauBep.toast('Đã nạp bản sao lưu');
    } catch (err) { GauBep.toast(err.message); }
  });

  /* ======================= MẪU / LÀM MỚI ======================= */
  $('#btnNew').onclick = () => { L = newLot(); hsLine = null; saveLot(); renderAll(); GauBep.toast('Đã tạo lô mới'); };
  $('#btnSample').onclick = () => {
    if (!S.sups.find((x) => x.id === 'vd')) S.sups.push({ id: 'vd', key: 'VDSUPPLIER', name: 'NINGBO VDSUPPLIER ELECTRIC APPLIANCE CO., LTD (VÍ DỤ)', addr1: 'NO 1 EXAMPLE ROAD', addr2: 'BINHAI ECONOMIC DEVELOPMENT ZONE', addr3: 'CIXI NINGBO CITY ZHEJIANG PROVINCE', addr4: 'CHINA',
      addrRaw: 'NO.1, Example Road, Binhai Economic Development Zone, Cixi, Ningbo City, Zhejiang', country: 'CN', brand: 'Vidu', contractNo: 'VD-HD-01', contractDate: '2025-08-01', contractEnd: '2026-12-31' });
    if (!S.models['VD-QUAT01']) S.models['VD-QUAT01'] = { hs: '84145191', hsSrc: '', unit: 'PCE', bt: '', desc: '', descManual: false, supId: 'vd', invName: 'Air Circulation Fan', img: '',
      tem: { kind: 'Dạng quạt đứng', voltage: '220V ~ 50Hz', power: '40W', pack: '1 cái / thùng', control: 'Chạm / Remote', barcode: '893000000000' } };
    L = { sample: true, docs: { bill: 'vi-du-bill.pdf', ci: 'vi-du-invoice.pdf', pl: 'vi-du-packing-list.pdf', co: 'vi-du-co.pdf' }, supId: 'vd', origin: 'CN',
      blNo: 'VDHCM0000001', blDate: '2026-10-04', vessel: 'VD VESSEL V001', pol: 'NINGBO', pod: 'HO CHI MINH(SPITC)', cont: 'VDCU0000001 / 40HQ', pkgs: 500, gw: 3000, cbm: 60,
      invNo: 'VD-INV-001', invDate: '2026-09-20', incoterm: 'FOB NINGBO', invTotal: 7500, plPkgs: 500, plGw: 3000, plNw: 2500, plQty: 500,
      coNo: 'E26VD0000000001', coForm: 'E', coDate: '2026-10-06', coPkgs: 500, coGw: 3000, coText: 'VD-INV-001',
      arrival: '2026-10-11', freight: 20000000, ins: 200000, rate: 25800, permit: '',
      lines: [{ id: uid(), code: 'VD-QUAT01', qty: 500, price: 15, invAmount: 7500, unit: 'PCE' }] };
    saveSet(); saveLot(); renderAll(); GauBep.toast('Đã nạp lô ví dụ 🐼');
  };

  let pending = false;
  function later() { if (pending) return; pending = true; setTimeout(() => { pending = false; renderAll(); }, 0); }
  function renderAll() { renderLot(); renderLines(); renderTem(); renderTemLog(); renderChecks(); renderOut(); renderTax(); renderSettings(); }
  renderAll();
  loadTariff();
  loadLcKeywords();
})();
