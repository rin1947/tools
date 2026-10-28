/* =========================================================
   Danh sách hàng khai hải quan — LOGIC
   ---------------------------------------------------------
   Quy trình: chứng từ (Invoice, Packing List, hợp đồng…) nhờ AI đọc → điền vào FORM MẪU Excel (Mau-Danh-Sach-Hang.xlsx)
   → nạp form vào tool → tool hoàn thiện mô tả tiếng Việt, mã HS, tem phụ → xuất file danh sách hàng .xls cho ECUS5.
   • Mã HS + thuế suất: biểu thuế của tool Landed Cost (../landed-cost/tariff-data.js, hoặc biểu thuế người dùng
     nạp trong Landed Cost — IndexedDB 'landedcost' / khoá 'tariff') + điều chỉnh 'lc_ovr'.
       Thuế NK = ACFTA nếu dòng có C/O Form E và xuất xứ CN (không thuộc danh sách loại trừ), ngược lại MFN.
       VAT    = cột VAT của biểu thuế; 8% chỉ đến 31/12/2026 (NQ 204/2025/QH15), sau đó tạm tính 10%.
     Mã HS của model lấy từ sản phẩm cùng mã trong Landed Cost ('lc_products'), bảng từ khoá KEYWORDS của
     Landed Cost và tra biểu thuế. Không ghi ngược vào dữ liệu của Landed Cost.
   • Thư viện model (lưu trên máy): mã HS, ĐVT, thông tin TEM PHỤ (tiếng Việt), hình, mô tả khai HQ.
       Mô tả khai HQ tự tạo từ tem: "<model>- <Tên hàng> <Nhãn hiệu> <model>; thương hiệu …; <đặc điểm>;
       Điện áp: …, Công suất: …; <quy cách>; hàng mới 100%" — form có mô tả / sửa tay thì giữ bản đó.
   • Linh kiện (không tem): mô tả dịch từ tên tiếng Anh + máy chính; HS gợi ý theo nhóm "bộ phận" của máy chính.
   • Xuất file danh sách hàng .xls (biff8) đúng 25 cột mẫu import ECUS5.
   ========================================================= */
(function () {
  const { parseNum, store } = GauBep;
  const P = window.CustomsParsers;
  const V = window.ViDict;
  GauBep.mountLayout({ title: 'Danh sách hàng khai HQ', icon: '🛃' });
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
    btFormE: 'B05', btVat: 'VB245', importerName: '', importerAddr: '',
    usage: 'Hướng dẫn sử dụng, cảnh báo an toàn: xem trên tài liệu đính kèm', storage: 'Hướng dẫn bảo quản: Nơi khô ráo, thoáng mát, tránh va đập.',
  };
  const GEN_FIELDS = [
    ['btFormE', 'Mã biểu thuế NK khi có C/O Form E', 'Ghi vào cột "Mã biểu thuế NK" của file danh sách hàng'],
    ['btVat', 'Mã biểu thuế VAT', 'Ghi vào cột "Mã biểu thuế VAT" (vd mã áp dụng VAT 8%)'],
  ];
  const TEM_GEN = [
    ['importerName', 'Tem phụ — Nhà nhập khẩu & phân phối', 'Tên công ty nhập khẩu in trên tem'],
    ['importerAddr', 'Tem phụ — Địa chỉ nhà nhập khẩu', ''],
    ['usage', 'Tem phụ — dòng hướng dẫn sử dụng', ''],
    ['storage', 'Tem phụ — dòng hướng dẫn bảo quản', ''],
  ];
  let S = store.get(KEY_SET, null) || { gen: {}, models: {} };
  S.gen = { ...DEF_GEN, ...(S.gen || {}) }; S.models = S.models || {}; S.sups = S.sups || [];
  Object.values(S.models).forEach((m) => { if (!m.tem) { m.tem = {}; if (m.desc && m.descManual === undefined) m.descManual = true; } });
  const newLot = () => ({ name: '', lines: [] });
  let L = store.get(KEY_LOT, null) || newLot();
  L.lines = L.lines || [];
  const saveSet = () => store.set(KEY_SET, S);
  const saveLot = () => store.set(KEY_LOT, L);
  // Nhà cung cấp (bản trước) — chỉ còn dùng làm nguồn tên / địa chỉ NSX nếu đã lưu
  const sup = () => {
    const m = L.lines.map((l) => modelOf(l.code)).find((x) => x && x.supId);
    return (m && S.sups.find((x) => x.id === m.supId)) || {};
  };
  const lineOrigin = (l) => String((l && l.origin) || 'CN').toUpperCase();

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
  function rateOf(hs, l) {
    hs = String(hs || '').replace(/\D/g, '');
    if (!DB || hs.length !== 8) return null;
    const r = DB.map.get(hs); if (!r) return { bad: true };
    const today = new Date().toISOString().slice(0, 10);
    const g = (k) => r[DB.ci[k]];
    let mfn = parseRate(g('mfn')); const om = ovr(hs, 'mfn', today); if (om) mfn = { v: om.v, ex: [] };
    let acfta = parseRate(g('acfta')); const oa = ovr(hs, 'acfta', today); if (oa) acfta = { v: oa.v, ex: [] };
    if (acfta && acfta.ex.includes(lineOrigin(l))) acfta = null;
    let vat = parseFloat(g('vat')); if (isNaN(vat)) vat = 10;
    if (vat === 8 && today > '2026-12-31') vat = 10;
    const ov = ovr(hs, 'vat', today); if (ov) vat = ov.v;
    const formE = !!(l && l.co) && lineOrigin(l) === 'CN';
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
    m = S.models[code] = { hs: lcHS(p), hsSrc: lcHS(p) ? 'lc' : '', unit: 'PCE', bt: '', desc: '', descManual: false, tem: {}, img: '', invName: invName || '' };
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
    const a = { unknown: [], names: [] };
    const take = (r) => { a.unknown.push(...(r.unknown || [])); a.names.push(...(r.names || [])); };
    if (p && p.name) a.nameVi = String(p.name).replace(/\s*\(ví dụ\)\s*/i, '').trim();
    else if (m.invName) { const t = V.product(m.invName); a.nameVi = t.vi; if (t.unknown.length) a.unknown.push(...t.unknown); }
    a.brand = m.brand || s.brand || '';
    let x;
    if ((x = tech.match(/(\d{2,3})\s*V(?:\s*[~\-–,]?\s*(\d{2})(?:\s*\/\s*(\d{2}))?\s*Hz)?/i))) a.voltage = `${x[1]}V` + (x[2] ? ` ~ ${x[2]}${x[3] ? '/' + x[3] : ''}Hz` : '');
    if ((x = tech.match(/(\d+(?:[.,]\d+)?)\s*W\b/))) a.power = x[1] + 'W';
    if ((x = tech.match(/(Dạng [^;,.]+)/i))) a.kind = x[1].trim();
    if ((x = tech.match(/(\d+)\s*cái\s*\/\s*(thùng|hộp)/i))) a.pack = `${x[1]} cái / ${x[2]}`;
    a.year = String(new Date().getFullYear());
    if (p && parseNum(p.weight) > 0) a.wP = String(parseNum(p.weight)) + 'Kg';
    // tên / địa chỉ NSX: ưu tiên nhà máy ghi ở Landed Cost, không có thì lấy bên bán trong hợp đồng
    // (từ chưa dịch được luôn đưa vào unknown; phần hiển thị chỉ báo khi từ đó còn nằm trong ô)
    if (p && p.factory) { const t = V.company(p.factory); a.makerVi = t.vi; take(t); }
    else if (m.makerEn) { const t = V.company(m.makerEn); a.makerVi = t.vi; take(t); }
    else if (s.name) { const t = V.company(s.name); a.makerVi = s.nameVi || t.vi; a.unknown.push(...t.unknown); }
    if (p && p.faddr) { const t = V.address(p.faddr, 'CN'); a.makerAddrVi = t.vi; take(t); }
    else if (m.makerAddrEn) { const t = V.address(m.makerAddrEn, 'CN'); a.makerAddrVi = t.vi; take(t); }
    else if (s.addrRaw || s.addr1) {
      const t = V.address(s.addrRaw || [s.addr1, s.addr2, s.addr3].filter(Boolean).join(', '), s.country || 'CN');
      a.makerAddrVi = s.addrVi || t.vi; take(t);
    }
    a.unknown = [...new Set(a.unknown)]; a.names = [...new Set(a.names)];
    return a;
  }
  function temOf(code) {
    const m = modelOf(code) || { tem: {} }; const a = temAuto(code); const t = {};
    TEM_FIELDS.forEach(([k]) => { t[k] = has(m.tem[k]) ? m.tem[k] : (a[k] || ''); });
    t.auto = a; t.country = V.country(lineOrigin(L.lines.find((x) => x.code === code)));
    return t;
  }
  // viết hoa chữ đầu; chỉ hạ chữ thường khi cả chuỗi đang IN HOA (giữ nguyên 1.7L, 40W…)
  const sentence = (s) => { s = String(s || '').trim(); if (s === s.toUpperCase()) s = s.toLocaleLowerCase('vi').replace(/\S*\d\S*/g, (w) => w.toUpperCase()); return s.charAt(0).toUpperCase() + s.slice(1); };
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
    let pname = '';
    const tr = V.part(enOf(h), h.parent ? temOf(h.parent).nameVi : '');
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
  // cMap: PDF dùng font Trung Quốc / CJK (vd vận đơn của forwarder TQ) cần bảng mã này mới đọc được chữ
  // (bảng mã lấy từ gói npm pdfjs-dist cùng phiên bản trên jsDelivr — cdnjs không kèm thư mục cmaps)
  const PDF_CMAPS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/';
  const PDF_FONTS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/';
  async function openPdf(file) { const pdfjs = await loadPdfJs(); return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: PDF_CMAPS, cMapPacked: true, standardFontDataUrl: PDF_FONTS }).promise; }
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
  /* ======================= NẠP FORM MẪU (Excel) =======================
     Form: tools/customs-entry/Mau-Danh-Sach-Hang.xlsx — sheet đầu tiên, dòng tiêu đề nhận theo tên cột (không cần đúng thứ tự).
     Ô trống: Mô tả → tool tự tạo (tem phụ / dịch linh kiện); Mã HS → lấy từ Landed Cost / gợi ý; Trị giá → SL × đơn giá;
     Linh kiện → tool tự nhận theo tên; Xuất xứ → CN. */
  const FORM_COLS = [
    ['code', /^mã\s*hàng|^model|^item\s*no|^mã\b/], ['en', /tên\s*hàng.*invoice|tiếng\s*anh|^description|^tên\s*hàng/], ['desc', /mô\s*tả/],
    ['hs', /^mã\s*hs|^hs/], ['qty', /^số\s*lượng|^q'?ty|^quantity/], ['unit', /^đơn\s*vị|^đvt|^unit$/], ['price', /^đơn\s*giá|unit\s*price/],
    ['amount', /^trị\s*giá|^thành\s*tiền|^amount/], ['origin', /^xuất\s*xứ|origin/], ['co', /^c\/?o|form\s*e/], ['part', /^linh\s*kiện|spare/],
    ['parent', /thuộc\s*model|máy\s*chính|parent/], ['foc', /^f\.?o\.?c|free/], ['brand', /nhãn\s*hiệu|thương\s*hiệu|brand/],
    ['makerAddrEn', /địa\s*chỉ.*(nhà\s*sản\s*xuất|nsx)|maker\s*address|factory\s*address/], ['makerEn', /nhà\s*sản\s*xuất|manufacturer|factory|maker/],
    ['note', /ghi\s*chú|note/], ['stt', /^stt|^no\.?$/],
  ];
  const yes = (v) => /^(có|co|x|yes|y|1|true|v|✓|e|form\s*e)$/i.test(String(v ?? '').trim());
  const no = (v) => /^(không|khong|no|n|0|false)$/i.test(String(v ?? '').trim());
  function readForm(aoa) {
    const low = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    let hi = -1, map = {};
    for (let r = 0; r < Math.min(aoa.length, 30); r++) {
      const m = {};
      (aoa[r] || []).forEach((c, i) => { const t = low(c); if (!t) return; for (const [k, re] of FORM_COLS) if (m[k] === undefined && re.test(t)) { m[k] = i; break; } });
      if (m.qty !== undefined && (m.code !== undefined || m.en !== undefined || m.desc !== undefined)) { hi = r; map = m; break; }
    }
    if (hi < 0) throw new Error('không thấy dòng tiêu đề (cần cột "Số lượng" và "Mã hàng" / "Tên hàng") — dùng form mẫu của tool');
    const rows = [];
    for (let r = hi + 1; r < aoa.length; r++) {
      const row = aoa[r] || []; const g = (k) => (map[k] === undefined ? '' : row[map[k]]);
      const qty = parseNum(g('qty'));
      if (!(qty > 0)) { if (/^(tổng|total)/i.test(low(row.find((c) => low(c)) || ''))) break; continue; }
      const price = parseNum(g('price')); const amount = parseNum(g('amount'));
      rows.push({ code: String(g('code') ?? '').trim().toUpperCase(), en: String(g('en') ?? '').trim(), desc: String(g('desc') ?? '').trim(),
        hs: String(g('hs') ?? '').replace(/\D/g, ''), qty, unit: String(g('unit') || 'PCE').trim().toUpperCase(), price: price || 0, amount: amount || 0,
        origin: String(g('origin') || 'CN').trim().toUpperCase().slice(0, 2) || 'CN', co: yes(g('co')), partRaw: g('part'), parent: String(g('parent') ?? '').trim().toUpperCase(),
        foc: yes(g('foc')), brand: String(g('brand') ?? '').trim(), makerEn: String(g('makerEn') ?? '').trim(), makerAddrEn: String(g('makerAddrEn') ?? '').trim() });
    }
    return rows;
  }
  function applyForm(rows) {
    const isP = (x) => (yes(x.partRaw) ? true : no(x.partRaw) ? false : V.isPartName(x.en) && !lcFind(x.code));
    const mains = rows.filter((x) => x.code && !isP(x)).map((x) => x.code);
    L.lines = rows.map((x) => {
      const part = isP(x);
      const l = { id: uid(), code: x.code, qty: x.qty, price: x.price, unit: UNIT_MAP[x.unit] || x.unit || 'PCE', origin: x.origin, co: x.co,
        invAmount: x.amount > 0 ? x.amount : undefined, invFoc: x.foc && !(x.amount > 0) };
      const h = x.code ? ensureModel(x.code, x.en) : l;
      if (!x.code) Object.assign(h, { en: x.en, desc: part ? '' : (x.desc || x.en), hs: '' });
      if (x.en && x.code) h.invName = x.en;
      h.unit = l.unit;
      if (part) Object.assign(h, { part: true, foc: x.foc || V.part(x.en).foc, parent: x.parent || guessParent(x.code, x.en, mains) });
      else if (x.code) h.part = false;
      if (x.hs.length === 8) { h.hs = x.hs; h.hsSrc = ''; }
      else if (x.code && !h.hs) { const p = lcFind(x.code); if (lcHS(p)) { h.hs = lcHS(p); h.hsSrc = 'lc'; } }
      if (x.desc && (x.code || part)) { h.desc = x.desc; h.descManual = true; }
      if (x.brand) h.brand = x.brand;
      if (x.makerEn) h.makerEn = x.makerEn;
      if (x.makerAddrEn) h.makerAddrEn = x.makerAddrEn;
      return l;
    });
    fillPartHS();
  }
  async function importForm(f) {
    try {
      if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
      const wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const name = wb.SheetNames.find((n) => /danh\s*s[aá]ch|hang/i.test(n)) || wb.SheetNames[0];
      const rows = readForm(window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' }));
      if (!rows.length) throw new Error('form chưa có dòng hàng nào (cần Số lượng > 0)');
      hsLine = null; L = newLot(); L.name = f.name; applyForm(rows);
      saveSet(); saveLot(); renderAll();
      GauBep.toast(`Đã nạp ${rows.length} dòng hàng từ ${f.name} 🐼`);
    } catch (e) { GauBep.toast(`${f.name}: ${e.message || 'không đọc được file'}`); }
  }
  $('#fileForm').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importForm(f); });
  const fdz = $('#formDrop');
  ['dragenter', 'dragover'].forEach((ev) => fdz.addEventListener(ev, (e) => { e.preventDefault(); fdz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => fdz.addEventListener(ev, (e) => { e.preventDefault(); fdz.classList.remove('over'); if (ev === 'drop' && e.dataTransfer.files[0]) importForm(e.dataTransfer.files[0]); }));

  let busy = false;
  /* ======================= 1. DANH SÁCH HÀNG ======================= */
  let hsLine = null;   // dòng đang chọn mã HS (bảng gợi ý)
  function renderLines() {
    const tb = $('#lineBody');
    if (!L.lines.length) { tb.innerHTML = '<tr><td colspan="12" class="muted">Chưa có dòng hàng — nạp form danh sách hàng (Excel) hoặc bấm ＋ Thêm dòng.</td></tr>'; renderHsPanel(); return; }
    tb.innerHTML = L.lines.map((l, i) => {
      const hs = lineHS(l); const R = rateOf(hs, l); const m = modelOf(l.code); const p = l.code ? lcFind(l.code) : null;
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
        <td><input data-f="origin" value="${esc(lineOrigin(l))}" maxlength="2" style="width:48px" title="Mã nước xuất xứ"><label class="co-chk" title="Có C/O form E → thuế ACFTA, mã biểu thuế ${esc(S.gen.btFormE)}"><input type="checkbox" data-f="co"${l.co ? ' checked' : ''}> C/O E</label></td>
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
    else if (f === 'origin') l.origin = el.value.trim().toUpperCase() || 'CN';
    else if (f === 'co') l.co = el.checked;
    else if (f === 'nkOv' || f === 'vatOv') {
      const R = rateOf(lineHS(l), l); const auto = R && !R.bad ? (f === 'nkOv' ? R.nk : R.vat) : NaN;
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
    const item = (c, extra, src) => { const R = DB && DB.map.get(c); const r = rateOf(c, l);
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

  /* ======================= 2. TEM PHỤ ======================= */
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
          ${unknown.length ? `<div class="note">✍️ Tên riêng chưa dịch được: <b>${esc(unknown.join(', '))}</b> — sửa tay ở ô bên dưới (vd tên tiếng Việt in trên tem cũ), tool nhớ cho các lô sau.</div>` : ''}
          ${(t.auto.names || []).filter((u) => [t.makerVi, t.makerAddrVi].some((v) => String(v).includes(u))).length ? `<p class="help-text">ℹ️ Tên riêng tiếng Trung giữ nguyên phiên âm như cách khai thông thường: <b>${esc(t.auto.names.join(', '))}</b>. Muốn ghi tên Hán Việt (vd theo tem cũ) thì sửa ô bên dưới.</p>` : ''}
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
  /* ======================= KIỂM TRA (dòng hàng & tem) ======================= */
  function renderChecks() {
    const out = []; const add = (lv, m) => out.push([lv, m]);
    const focLines = L.lines.filter((l) => l.invFoc || peek(l).foc);
    if (focLines.length) add('ok', `${focLines.length} dòng hàng F.O.C — khai theo SL × đơn giá: ${fmt(focLines.reduce((a, l) => a + lineAmt(l), 0), 2)} USD`);
    L.lines.forEach((l, i) => { if (has(l.invAmount) && Math.abs(lineAmt(l) - l.invAmount) > 0.01) add('err', `Dòng ${i + 1} ${l.code}: SL × đơn giá = ${fmt(lineAmt(l), 2)}, form ghi trị giá ${fmt(l.invAmount, 2)}`); });
    L.lines.forEach((l, i) => {
      const hs = lineHS(l); const R = rateOf(hs, l); const pk = peek(l); const nm = l.code || (pk.part && enOf(pk) ? V.part(enOf(pk)).vi : enOf(pk)) || `dòng ${i + 1}`;
      if (!hs) add('err', `Dòng ${i + 1} (${nm}): chưa có mã HS — bấm ô Mã HS để tra, hoặc 🚢 Lấy HS từ Landed Cost`);
      else if (R && R.bad) add('err', `Dòng ${i + 1} (${nm}): mã ${fmtHS(hs)} không có trong biểu thuế`);
      const p = l.code ? lcFind(l.code) : null;
      if (hs && p && lcHS(p) && lcHS(p) !== hs) add('warn', `${l.code}: Landed Cost đang để mã ${fmtHS(lcHS(p))}, danh sách dùng ${fmtHS(hs)} — thống nhất 1 mã`);
      const h = peek(l);
      if (h.part) {
        const tr = V.part(enOf(h));
        if (h.hsSrc === 'sug') add('warn', `Dòng ${i + 1} (${nm}): mã HS ${fmtHS(h.hs)} là gợi ý tự động cho linh kiện — bấm ô Mã HS, chọn lại 1 mã để xác nhận`);
        if (!h.parent && !tr.parentVi) add('warn', `Dòng ${i + 1} (${nm}): linh kiện chưa rõ của máy nào — chọn "của máy" để ghép mô tả và gợi ý HS`);
        if (tr.unknown.length && !(h.descManual && h.desc)) add('warn', `Dòng ${i + 1} (${nm}): chưa dịch được "${tr.unknown.join('", "')}" — sửa tay mô tả`);
      }
      if (!lineDesc(l)) add('err', `Dòng ${i + 1} (${nm}): chưa có mô tả`);
    });
    temCodes().forEach((code) => {
      const t = temOf(code); const miss = [['nameVi', 'tên hàng'], ['makerVi', 'nhà sản xuất'], ['makerAddrVi', 'địa chỉ NSX']].filter(([k]) => !t[k]).map((x) => x[1]);
      if (!S.gen.importerName) miss.push('nhà nhập khẩu (⚙️ Cài đặt)');
      if (miss.length) add('warn', `Tem phụ ${code} còn thiếu: ${miss.join(', ')}`);
      const unk = t.auto.unknown.filter((u) => [t.nameVi, t.makerVi, t.makerAddrVi].some((v) => String(v).includes(u)));
      if (unk.length) add('warn', `Tem phụ ${code}: chưa dịch được "${unk.join('", "')}" — sửa tay ở mục 2`);
      if (t.barcode && !eanFix(t.barcode).ok) add('err', `Tem phụ ${code}: mã vạch ${t.barcode} sai chuẩn EAN-13`);
    });
    if (L.lines.length && !out.some((x) => x[0] !== 'ok')) add('ok', 'Đủ mô tả và mã HS cho mọi dòng — xuất file được');
    const order = { err: 0, warn: 1, ok: 2 };
    $('#checks').innerHTML = out.length ? out.sort((a, b) => order[a[0]] - order[b[0]]).map(([lv, msg]) => `<li class="${lv}"><i>${{ ok: 'Ổn', warn: 'Lưu ý', err: 'Cần sửa' }[lv]}</i><span>${esc(msg)}</span></li>`).join('')
      : '<li><span class="muted">Nạp form danh sách hàng để kiểm tra.</span></li>';
  }
  const nkOf = (l, R) => (has(l.nkOv) ? l.nkOv : R && !R.bad && isFinite(R.nk) ? R.nk : '');
  const vatOf = (l, R) => (has(l.vatOv) ? l.vatOv : R && !R.bad ? R.vat : '');
  const btNK = (l) => (l.code ? (modelOf(l.code) || {}).bt : l.bt) || (l.co ? S.gen.btFormE : '');

  /* ======================= XUẤT FILE ECUS ======================= */
  const ECUS_HEAD = ['STT', 'Mã hàng', 'Tên hàng (mô tả chi tiết)', 'Mã HS', 'Xuất xứ', 'Lượng', 'Đơn vị tính', 'Lượng 2', 'Đơn vị tính 2',
    'Đơn giá hóa đơn', 'Trị giá hóa đơn', 'Đơn giá tính thuế', 'Trị giá tính thuế', 'Mã biểu thuế NK', 'TS NK(%)', 'Tiền thuế NK',
    'Mã biếu thuế TTĐB', 'Thuế suất TTĐB(%)', 'Tiền thuế TTĐB', 'Mã biểu thuế môi trường', 'Thuế suất môi trường', 'Tiền thuế môi trường',
    'Mã biểu thuế VAT', 'Thuế suất VAT(%)', 'Tiền thuế VAT'];
  function ecusAoa() {
    return [ECUS_HEAD, ...L.lines.map((l, i) => [
      String(i + 1), null, lineDesc(l) || '', String(lineHS(l) || ''), lineOrigin(l), parseNum(l.qty), lineUnit(l), parseNum(l.qty), lineUnit(l),
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
      const safe = String(L.name || 'lo').replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_').slice(0, 40);
      XLSX.writeFile(wb, `DS_KHAI_HQ_${safe}_${GauBep.today()}.xls`, { bookType: 'biff8' });
      GauBep.toast('Đã xuất file danh sách hàng 🎉');
    } catch (e) { GauBep.toast(e.message || 'Không xuất được file'); }
  };
  /* ======================= CÀI ĐẶT ======================= */
  function renderSettings() {
    const gf = (arr) => arr.map(([k, lbl, tip]) => `<div class="field${k === 'importerAddr' || k === 'usage' || k === 'storage' ? ' wide' : ''}"><label>${lbl}${tip ? ` <span class="hint" tabindex="0" data-tip="${esc(tip)}">?</span>` : ''}</label><input data-g="${k}" value="${esc(S.gen[k])}"></div>`).join('');
    $('#genForm').innerHTML = gf(GEN_FIELDS);
    $('#temGenForm').innerHTML = gf(TEM_GEN);
    const codes = Object.keys(S.models).sort();
    $('#modelBody').innerHTML = codes.length ? codes.map((c) => { const m = S.models[c]; return `<tr data-code="${esc(c)}">
      <td><input data-m="code" value="${esc(c)}" style="width:130px"></td><td><input data-m="hs" value="${esc(fmtHS(m.hs))}" style="width:120px"></td>
      <td class="wrap">${esc(m.part ? genPartDesc(m) : descOf(c))}</td><td><input data-m="unit" value="${esc(m.unit || 'PCE')}" style="width:64px"></td>
      <td><input data-m="bt" value="${esc(m.bt || '')}" placeholder="tự động" style="width:84px" title="Để trống: tự dùng mã biểu thuế Form E khi dòng có C/O"></td>
      <td><button class="btn btn-ghost btn-sm btn-icon" data-act="delmodel" aria-label="Xoá model">✕</button></td></tr>`; }).join('')
      : '<tr><td colspan="6" class="muted">Chưa có model — nạp form danh sách hàng là tool tự thêm.</td></tr>';
    const n = lcProducts().length;
    $('#lcInfo').textContent = n ? `Landed Cost trên máy này có ${n} sản phẩm.` : 'Landed Cost trên máy này chưa có sản phẩm (ngoài ví dụ).';
  }
  const onGen = (e) => { const k = e.target.dataset.g; if (!k) return; S.gen[k] = e.target.value.trim(); saveSet(); later(); };
  $('#genForm').addEventListener('change', onGen); $('#temGenForm').addEventListener('change', onGen);
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
    S.models['MODEL-' + n] = { hs: '', unit: 'PCE', bt: '', desc: '', descManual: false, tem: {}, img: '' }; saveSet(); renderAll();
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
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `DanhSachHang_SaoLuu_${GauBep.today()}.json`;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  $('#fileBackup').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const d = JSON.parse(await f.text()); if (d.app !== 'customs-entry' || !d.settings) throw new Error('File không đúng bản sao lưu của tool này');
      S = d.settings; S.gen = { ...DEF_GEN, ...(S.gen || {}) }; S.sups = S.sups || []; S.models = S.models || {};
      Object.values(S.models).forEach((m) => { m.tem = m.tem || {}; });
      saveSet(); saveLot(); renderAll(); GauBep.toast('Đã nạp bản sao lưu');
    } catch (err) { GauBep.toast(err.message); }
  });

  /* ======================= MẪU / LÀM MỚI ======================= */
  $('#btnNew').onclick = () => { L = newLot(); hsLine = null; TEM_LOG = []; TEM_PENDING = []; saveLot(); renderAll(); GauBep.toast('Đã tạo lô mới'); };
  $('#btnSample').onclick = () => {
    S.models['VD-QUAT01'] = S.models['VD-QUAT01'] || { hs: '84145191', hsSrc: '', unit: 'PCE', bt: '', desc: '', descManual: false, invName: 'Air Circulation Fan', img: '', brand: 'Vidu',
      makerEn: 'Ningbo Vidu Electric Appliance Co., Ltd (ví dụ)', makerAddrEn: 'No.1, Example Road, Cixi, Ningbo City, Zhejiang',
      tem: { kind: 'Dạng quạt đứng', voltage: '220V ~ 50Hz', power: '40W', pack: '1 cái / thùng', control: 'Chạm / Remote' } };
    L = { name: 'vi-du.xlsx', sample: true, lines: [] };
    applyForm([
      { code: 'VD-QUAT01', en: 'Air Circulation Fan', desc: '', hs: '', qty: 500, unit: 'PCE', price: 15, amount: 7500, origin: 'CN', co: true, partRaw: '', parent: '', foc: false, brand: '', makerEn: '', makerAddrEn: '' },
      { code: '', en: 'Fan blade (plastic) for VD-QUAT01', desc: '', hs: '', qty: 20, unit: 'PCE', price: 0.5, amount: 10, origin: 'CN', co: true, partRaw: '', parent: '', foc: true, brand: '', makerEn: '', makerAddrEn: '' },
    ]);
    saveSet(); saveLot(); renderAll(); GauBep.toast('Đã nạp lô ví dụ 🐼');
  };

  let pending = false;
  function later() { if (pending) return; pending = true; setTimeout(() => { pending = false; renderAll(); }, 0); }
  function renderAll() { L.lines = L.lines || []; renderLines(); renderTem(); renderTemLog(); renderChecks(); renderSettings(); $('#lotName').textContent = L.name ? `· ${L.name}` : ''; }
  renderAll();
  loadTariff();
  loadLcKeywords();
})();
