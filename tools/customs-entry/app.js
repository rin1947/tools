/* =========================================================
   Phiếu khai nhanh ECUS — LOGIC
   ---------------------------------------------------------
   • Đọc chứng từ PDF (parsers.js) → điền thông tin lô; ô nào không đọc được để trống cho nhập tay.
   • Mã HS + thuế suất: đọc biểu thuế của tool Landed Cost (../landed-cost/tariff-data.js, hoặc biểu
     thuế người dùng đã nạp trong Landed Cost — IndexedDB 'landedcost' / khoá 'tariff'), có tính các
     điều chỉnh thủ công của Landed Cost (localStorage 'lc_ovr').
       Thuế NK = ACFTA nếu có C/O Form E và xuất xứ CN (không thuộc danh sách loại trừ), ngược lại MFN.
       VAT    = cột VAT của biểu thuế; 8% chỉ đến 31/12/2026 (NQ 204/2025/QH15), sau đó tạm tính 10%.
   • Thư viện model (model → HS, mô tả khai hải quan, ĐVT) lưu trên máy; có thể lấy từ danh sách
     sản phẩm của Landed Cost (localStorage 'lc_products', cùng Mã SP).
   • Ước tính thuế:
       Trị giá dòng (USD)   = SL × đơn giá
       Trị giá tính thuế    = trị giá dòng × tỷ giá + (cước + bảo hiểm) × trị giá dòng / tổng trị giá
                              (cước + bảo hiểm chỉ cộng khi điều kiện giao hàng FOB / EXW / FCA;
                               CFR/CNF chỉ cộng bảo hiểm; CIF không cộng)
       Thuế NK  = trị giá tính thuế × %NK
       Thuế VAT = (trị giá tính thuế + thuế NK) × %VAT
   • Xuất file danh sách hàng .xls (biff8) đúng 25 cột mẫu import ECUS5.
   ========================================================= */
(function () {
  const { parseNum, store } = GauBep;
  const P = window.CustomsParsers;
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
  const UNIT_MAP = { PCS: 'PCE', PC: 'PCE', UNIT: 'PCE', UNITS: 'PCE', SETS: 'SET', SET: 'SET' };

  /* ======================= TRẠNG THÁI ======================= */
  const DEF_GEN = { loaiHinh: 'A11', coQuan: '', boPhan: '', pttt: 'TTR', ptvc: '9999', mpltg: '6', btFormE: 'B05', btVat: 'VB245' };
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
  let S = store.get(KEY_SET, null) || { gen: { ...DEF_GEN }, sups: [], models: {} };
  S.gen = { ...DEF_GEN, ...(S.gen || {}) };
  const newLot = () => ({ docs: {}, supId: (S.sups[0] || {}).id || '', origin: 'CN', lines: [] });
  let L = store.get(KEY_LOT, null) || newLot();
  const saveSet = () => store.set(KEY_SET, S);
  const saveLot = () => store.set(KEY_LOT, L);
  const sup = () => S.sups.find((x) => x.id === L.supId) || {};
  const uid = () => Math.random().toString(36).slice(2, 9);

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
  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Không tải được ' + src)); document.head.append(s); });
  async function loadTariff() {
    try {
      const saved = await idbTariff();
      let d;
      if (saved && saved.rows) { d = saved; DBsrc = 'biểu thuế đã nạp trong Landed Cost (' + (saved._name || 'file') + ')'; }
      else {
        if (!window.LC_TARIFF_B64) await loadScript('../landed-cost/tariff-data.js');
        const bin = Uint8Array.from(atob(window.LC_TARIFF_B64.trim()), (c) => c.charCodeAt(0));
        d = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
        DBsrc = 'biểu thuế có sẵn trong Landed Cost';
      }
      const ci = {}; d.cols.forEach((c, i) => { ci[c] = i; });
      DB = { ci, map: new Map(d.rows.map((r) => [r[0], r])) };
      $('#tariffInfo').textContent = '📚 Thuế suất theo ' + DBsrc + '.';
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
    const segs = String(r[1] || '').split(' › ');
    return { desc: segs.slice(-2).join(' › '), mfn: mfn && mfn.v, acfta: acfta && acfta.v, nk: useE ? acfta.v : (mfn ? mfn.v : NaN), src: useE ? 'ACFTA' : 'MFN', vat, formE };
  }

  /* ======================= THƯ VIỆN MODEL ======================= */
  function lcProducts() { return (lcGet('lc_products', []) || []).filter((p) => p && !p.sample && p.code); }
  function lcModel(code) {
    const p = lcProducts().find((x) => normKey(x.code) === normKey(code));
    if (!p) return null;
    const desc = p.descManual && p.desc ? p.desc
      : [p.name, 'model ' + p.code, String(p.tech || '').trim().replace(/[.;,\s]+$/, ''), 'hàng mới 100%'].filter(Boolean).join(', ');
    return { hs: String(p.hs || '').replace(/\D/g, ''), desc: `${p.code}- ${desc}`, unit: 'PCE', bt: '' };
  }
  function modelOf(code) { return S.models[code] || S.models[normKey(code)] || null; }
  /* Dòng hàng mới từ Invoice: lấy mô tả/HS từ thư viện → Landed Cost → để trống */
  function lineFromInvoice(x) {
    const m = modelOf(x.code) || lcModel(x.code) || {};
    return { id: uid(), code: x.code, desc: m.desc || `${x.code}- ${x.name || ''}`.trim(), hs: m.hs || '', qty: x.qty, unit: m.unit || UNIT_MAP[x.unit] || x.unit || 'PCE',
      price: x.price, invAmount: x.amount, bt: m.bt || '', fromLib: !!modelOf(x.code), fromLC: !modelOf(x.code) && !!lcModel(x.code) };
  }
  const lineAmt = (l) => Math.round((parseNum(l.qty) * parseNum(l.price)) * 100) / 100;

  /* ======================= NẠP CHỨNG TỪ ======================= */
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return loadScript(PDFJS + 'pdf.min.js').then(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; return window.pdfjsLib; });
  }
  async function pdfText(file) {
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      pages.push(tc.items.map((t) => ({ s: t.str, x: t.transform[4], y: t.transform[5] })));
    }
    return P.linesFromPdfPages(pages);
  }
  const DOCNAME = { bill: 'Vận đơn (Bill)', ci: 'Commercial Invoice', pl: 'Packing List', co: 'C/O' };
  async function handleFiles(files) {
    const done = [];
    for (const f of files) {
      try {
        const t = await pdfText(f);
        if (t.replace(/\s/g, '').length < 40) { GauBep.toast(`${f.name}: file ảnh scan, không có chữ để đọc`); continue; }
        const k = P.classify(t);
        if (!k) { GauBep.toast(`${f.name}: chưa nhận ra loại chứng từ`); continue; }
        if (L.sample) { L = newLot(); }
        const res = P[k](t);
        if (k === 'ci') {
          if (res.lines) L.lines = res.lines.map(lineFromInvoice);
          delete res.lines;
          const hit = S.sups.find((s) => s.key && normKey(t).includes(normKey(s.key)));
          if (hit) L.supId = hit.id;
        }
        Object.entries(res).forEach(([kk, v]) => { if (has(v)) L[kk] = v; });
        L.docs[k] = f.name; done.push(DOCNAME[k]);
      } catch (e) { GauBep.toast(`${f.name}: ${e.message || 'lỗi đọc file'}`); }
    }
    saveLot(); renderAll();
    if (done.length) GauBep.toast('Đã đọc: ' + done.join(', ') + ' 🐼');
  }
  $('#fileDocs').addEventListener('change', (e) => { handleFiles([...e.target.files]); e.target.value = ''; });
  const dz = $('#dropzone');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', (e) => handleFiles([...e.dataTransfer.files].filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')));

  /* ======================= 2. THÔNG TIN LÔ ======================= */
  function renderLot() {
    document.querySelectorAll('[data-k]').forEach((el) => {
      const v = L[el.dataset.k];
      el.value = has(v) ? (el.hasAttribute('data-num') ? fmt(v) : v) : '';
      el.classList.toggle('empty', el.value === '');
    });
    $('#docs').innerHTML = Object.keys(DOCNAME).map((k) => `<div class="doc${L.docs[k] ? ' ok' : ''}"><b>${L.docs[k] ? '✅' : '⬜'} ${DOCNAME[k]}</b><span>${esc(L.docs[k] || 'Chưa nạp')}</span></div>`).join('');
    $('#supSel').innerHTML = S.sups.length ? S.sups.map((s) => `<option value="${s.id}"${s.id === L.supId ? ' selected' : ''}>${esc(s.name || '(chưa đặt tên)')}</option>`).join('')
      : '<option value="">Chưa có — thêm ở ⚙️ Cài đặt</option>';
    $('#setupNote').hidden = S.sups.length > 0;
  }
  document.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('change', () => {
    const k = el.dataset.k;
    L[k] = el.hasAttribute('data-num') ? (el.value.trim() === '' ? '' : parseNum(el.value)) : el.value.trim();
    if (k === 'origin') L[k] = String(L[k]).toUpperCase();
    saveLot(); later();
  }));
  $('#supSel').addEventListener('change', (e) => { L.supId = e.target.value; saveLot(); renderAll(); });

  /* ======================= 3. DÒNG HÀNG ======================= */
  function renderLines() {
    const tb = $('#lineBody');
    if (!L.lines.length) { tb.innerHTML = '<tr><td colspan="11" class="muted">Chưa có dòng hàng — nạp Invoice hoặc bấm ＋ Thêm dòng.</td></tr>'; return; }
    tb.innerHTML = L.lines.map((l, i) => {
      const R = rateOf(l.hs);
      const note = !l.hs ? '<div class="hs-note bad">Chưa có mã HS</div>'
        : R && R.bad ? '<div class="hs-note bad">Mã không có trong biểu thuế</div>'
          : R ? `<div class="hs-note">${esc(R.desc)}<br>MFN ${fmt(R.mfn)}% · ACFTA ${has(R.acfta) ? fmt(R.acfta) + '%' : '–'}</div>` : '';
      const nk = has(l.nkOv) ? l.nkOv : R && !R.bad ? R.nk : '';
      const vat = has(l.vatOv) ? l.vatOv : R && !R.bad ? R.vat : '';
      return `<tr data-id="${l.id}">
        <td class="num">${i + 1}</td>
        <td class="code-cell"><div class="code-wrap"><input data-f="code" value="${esc(l.code)}">${modelOf(l.code) ? '<span class="lib-tag">📚 có trong thư viện</span>' : `<button class="btn btn-ghost btn-sm" data-act="save" title="Lưu mô tả, HS, ĐVT của dòng này vào thư viện">💾 Lưu thư viện</button>`}</div></td>
        <td><textarea data-f="desc" rows="3">${esc(l.desc)}</textarea></td>
        <td class="hs-cell"><input data-f="hs" value="${esc(fmtHS(l.hs))}" inputmode="numeric">${note}</td>
        <td><input class="in-num" data-f="qty" value="${fmt(l.qty)}" inputmode="decimal" style="width:90px"></td>
        <td><input data-f="unit" value="${esc(l.unit)}" style="width:64px"></td>
        <td><input class="in-num" data-f="price" value="${fmt(l.price, 4)}" inputmode="decimal" style="width:90px"></td>
        <td class="num">${fmt(lineAmt(l), 2)}</td>
        <td><input class="in-num" data-f="nkOv" value="${fmt(nk)}" placeholder="–" inputmode="decimal" style="width:62px" title="${R && !R.bad ? 'Theo biểu thuế: ' + R.src : ''}"></td>
        <td><input class="in-num" data-f="vatOv" value="${fmt(vat)}" placeholder="–" inputmode="decimal" style="width:62px"></td>
        <td><button class="btn btn-ghost btn-sm btn-icon" data-act="del" aria-label="Xoá dòng">✕</button></td></tr>`;
    }).join('');
  }
  $('#lineBody').addEventListener('change', (e) => {
    const el = e.target; const tr = el.closest('tr'); if (!tr || !el.dataset.f) return;
    const l = L.lines.find((x) => x.id === tr.dataset.id); const f = el.dataset.f;
    if (f === 'qty' || f === 'price') l[f] = parseNum(el.value);
    else if (f === 'nkOv' || f === 'vatOv') {
      const R = rateOf(l.hs); const auto = R && !R.bad ? (f === 'nkOv' ? R.nk : R.vat) : NaN;
      l[f] = el.value.trim() === '' || parseNum(el.value) === auto ? '' : parseNum(el.value);
    } else if (f === 'hs') l.hs = el.value.replace(/\D/g, '');
    else if (f === 'code') {
      l.code = el.value.trim().toUpperCase();
      const m = modelOf(l.code) || lcModel(l.code);
      if (m) { l.desc = m.desc || l.desc; l.hs = m.hs || l.hs; l.unit = m.unit || l.unit; }
    } else l[f] = el.value;
    saveLot(); later();
  });
  $('#lineBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('tr').dataset.id; const l = L.lines.find((x) => x.id === id);
    if (b.dataset.act === 'del') L.lines = L.lines.filter((x) => x.id !== id);
    if (b.dataset.act === 'save') {
      if (!l.code) { GauBep.toast('Nhập model trước đã'); return; }
      S.models[l.code] = { hs: l.hs, desc: l.desc, unit: l.unit, bt: l.bt || '' }; saveSet();
      GauBep.toast(`Đã lưu ${l.code} vào thư viện`);
    }
    saveLot(); renderAll();
  });
  $('#btnAddLine').onclick = () => {
    const last = L.lines[L.lines.length - 1];
    L.lines.push({ id: uid(), code: '', desc: '', hs: last ? last.hs : '', qty: '', unit: last ? last.unit : 'PCE', price: '', bt: '' });
    saveLot(); renderAll();
  };

  /* ======================= 4. KIỂM TRA ======================= */
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
      const bad = L.lines.filter((l) => l.hs && !String(l.hs).startsWith(L.blHs.slice(0, 4)));
      if (bad.length) add('warn', `HS trên Bill là ${L.blHs}, khác nhóm với dòng ${bad.map((l) => l.code || '?').join(', ')} — xem lại`);
    }
    const s = sup();
    if (s.contractEnd) { const ref = L.invDate || new Date().toISOString().slice(0, 10); add(s.contractEnd >= ref ? 'ok' : 'err', s.contractEnd >= ref ? `Hợp đồng ${s.contractNo || ''} còn hiệu lực đến ${dmy(s.contractEnd)}` : `Hợp đồng ${s.contractNo || ''} hết hạn ${dmy(s.contractEnd)} trước ngày Invoice`); }
    if (!s.name) add('warn', 'Chưa chọn nhà cung cấp — thêm ở ⚙️ Cài đặt để điền tên, địa chỉ người xuất khẩu và số hợp đồng');
    L.lines.forEach((l, i) => {
      const R = rateOf(l.hs);
      if (!l.hs) add('err', `Dòng ${i + 1} ${l.code || ''}: chưa có mã HS`);
      else if (R && R.bad) add('err', `Dòng ${i + 1} ${l.code || ''}: mã ${fmtHS(l.hs)} không có trong biểu thuế`);
      if (l.code && !modelOf(l.code)) add('warn', `Model ${l.code} chưa có trong thư viện${l.fromLC ? ' (mô tả, HS đang lấy từ Landed Cost)' : ''} — kiểm tra mô tả rồi bấm 💾 Lưu vào thư viện`);
    });
    if (L.pol && !P.POL[String(L.pol).toUpperCase()]) add('warn', `Chưa có mã cảng xếp cho "${L.pol}" — gõ mã trên ECUS`);
    const pod = podInfo();
    if (L.pod && !pod) add('warn', `Chưa có mã cảng dỡ cho "${L.pod}"`);
    else if (pod && !pod.store) add('warn', `Chưa có mã địa điểm lưu kho cho ${pod.name} — xem Arrival Notice`);
    const miss = { arrival: 'ngày hàng đến', freight: 'phí vận chuyển', ins: 'phí bảo hiểm', rate: 'tỷ giá tính thuế' };
    const m = Object.keys(miss).filter((k) => !has(L[k])).map((k) => miss[k]);
    if (m.length) add('warn', 'Còn thiếu: ' + m.join(', '));
    const order = { err: 0, warn: 1, ok: 2 };
    $('#checks').innerHTML = out.length ? out.sort((a, b) => order[a[0]] - order[b[0]]).map(([lv, msg]) => `<li class="${lv}"><i>${{ ok: 'Khớp', warn: 'Lưu ý', err: 'Sai lệch' }[lv]}</i><span>${esc(msg)}</span></li>`).join('')
      : '<li><span class="muted">Nạp chứng từ để kiểm tra.</span></li>';
  }

  /* ======================= 5. PHIẾU KHAI ======================= */
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
      ['Địa điểm lưu kho', [C(pod && pod.store), C(pod && pod.storeName)]], ['Địa điểm dỡ hàng', [C(pod && pod.code), C(pod && pod.name)]],
      ['Địa điểm xếp hàng', [C(pol && pol.code), C(pol && pol.name)]], ['Phương tiện vận chuyển', [C(g.ptvc, 1), C(L.vessel)]],
      ['Ngày hàng đến', [C(dmy(L.arrival))]],
    ];
  }
  function rowsT2() {
    const g = S.gen;
    return [
      ['Số hoá đơn', [C('A', 1), C(L.invNo)]], ['Ngày phát hành', [C(dmy(L.invDate))]], ['Phương thức thanh toán', [C(g.pttt, 1)]],
      ['Tổng trị giá hoá đơn', [C('A', 1), C(term()), C('USD', 1), C(raw(L.invTotal))]], ['Mã phân loại khai trị giá', [C(g.mpltg, 1)]],
      ['Phí vận chuyển', [C('A', 1), C('VND', 1), C(raw(L.freight))]], ['Phí bảo hiểm', [C('A', 1), C('VND', 1), C(raw(L.ins))]],
      ['Chi tiết khai trị giá', [C(L.blDate ? ddmmyyyy(L.blDate) + '#&' : '')]],
      ['Giấy phép nhập khẩu', [C('RK01', 1), C(L.permit)]], ['Phần ghi chú', [C(note())]],
    ];
  }
  function rowsT3() {
    const r = [];
    L.lines.forEach((l, i) => {
      const R = rateOf(l.hs);
      r.push([`Dòng ${i + 1} · ${l.code || ''}`, [], 'head']);
      r.push(['Mã số hàng hoá', [C(l.hs)]], ['Mô tả hàng hoá', [C(l.desc)]],
        ['Số lượng (1) / ĐVT', [C(raw(l.qty)), C(l.unit, 1)]], ['Số lượng (2) / ĐVT', [C(raw(l.qty)), C(l.unit, 1)]],
        ['Trị giá hoá đơn', [C(raw(lineAmt(l)))]], ['Đơn giá hoá đơn', [C(raw(l.price)), C('USD', 1), C(l.unit, 1)]],
        ['Nước xuất xứ', [C(L.origin, 1)]], ['Mã biểu thuế NK', [C(btNK(l))]], ['Mã biểu thuế VAT', [C(S.gen.btVat)]],
        ['Thuế suất NK / VAT', [C(nkOf(l, R) !== '' ? nkOf(l, R) + '%' : ''), C(vatOf(l, R) !== '' ? vatOf(l, R) + '%' : '')]]);
    });
    if (!r.length) r.push(['Chưa có dòng hàng', [C('')]]);
    return r;
  }
  const nkOf = (l, R) => (has(l.nkOv) ? l.nkOv : R && !R.bad && isFinite(R.nk) ? R.nk : '');
  const vatOf = (l, R) => (has(l.vatOv) ? l.vatOv : R && !R.bad ? R.vat : '');
  const isFormE = () => has(L.coNo) && String(L.coForm || 'E').toUpperCase() === 'E';
  const btNK = (l) => l.bt || (modelOf(l.code) || {}).bt || (isFormE() ? S.gen.btFormE : '');
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
  $('#out').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); b.classList.add('copied'); setTimeout(() => b.classList.remove('copied'), 900); GauBep.toast('Đã copy'); }
    catch (err) { const r = document.createRange(); r.selectNodeContents(b); const s = getSelection(); s.removeAllRanges(); s.addRange(r); GauBep.toast('Đã bôi đen — bấm Ctrl+C'); }
  });

  /* ======================= 6. THUẾ ======================= */
  function taxCalc() {
    const rate = parseNum(L.rate); const t = term();
    const addFr = /^(FOB|EXW|FCA)$/.test(t), addIns = addFr || /^(CFR|CNF)$/.test(t);
    const extra = (addFr ? parseNum(L.freight) || 0 : 0) + (addIns ? parseNum(L.ins) || 0 : 0);
    const tot = L.lines.reduce((a, l) => a + lineAmt(l), 0);
    let base = 0, nk = 0, vat = 0;
    L.lines.forEach((l) => {
      const R = rateOf(l.hs); const amt = lineAmt(l);
      const tg = amt * rate + (tot ? extra * amt / tot : 0);
      const n = tg * (parseNum(nkOf(l, R)) || 0) / 100;
      base += tg; nk += n; vat += (tg + n) * (parseNum(vatOf(l, R)) || 0) / 100;   // ECUS làm tròn từng sắc thuế
    });
    return { ok: rate > 0 && L.lines.length > 0, base: Math.round(base), nk: Math.round(nk), vat: Math.round(vat) };
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
      String(i + 1), null, l.desc || '', String(l.hs || ''), String(L.origin || ''), parseNum(l.qty), l.unit || '', parseNum(l.qty), l.unit || '',
      parseNum(l.price), lineAmt(l), null, null, btNK(l) || null, null, null, null, null, null, null, null, null, S.gen.btVat || null, null, null,
    ])];
  }
  $('#btnExport').onclick = async () => {
    if (!L.lines.length) { GauBep.toast('Chưa có dòng hàng để xuất'); return; }
    const bad = L.lines.filter((l) => !l.hs || !l.desc || !(parseNum(l.qty) > 0));
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
  function renderSettings() {
    $('#genForm').innerHTML = GEN_FIELDS.map(([k, lbl, tip]) => `<div class="field"><label>${lbl}${tip ? ` <span class="hint" tabindex="0" data-tip="${esc(tip)}">?</span>` : ''}</label><input data-g="${k}" value="${esc(S.gen[k])}"></div>`).join('');
    const SF = [['key', 'Từ khoá nhận diện trên Invoice'], ['name', 'Tên người xuất khẩu'], ['addr1', 'Địa chỉ dòng 1'], ['addr2', 'Địa chỉ dòng 2'], ['addr3', 'Địa chỉ dòng 3'], ['addr4', 'Địa chỉ dòng 4'],
      ['country', 'Mã nước'], ['contractNo', 'Số hợp đồng'], ['contractDate', 'Ngày hợp đồng', 'date'], ['contractEnd', 'Hợp đồng hết hạn', 'date']];
    $('#supList').innerHTML = S.sups.length ? S.sups.map((s, i) => `<div class="sup" data-sid="${s.id}"><div class="sup-head"><span>NCC ${i + 1}${s.name ? ' · ' + esc(s.name) : ''}</span><button class="btn btn-ghost btn-sm" data-act="delsup">Xoá</button></div>
      <div class="form-grid">${SF.map(([k, lbl, t]) => `<div class="field"><label>${lbl}</label><input data-s="${k}"${t ? ` type="${t}"` : ''} value="${esc(s[k] || '')}"></div>`).join('')}</div></div>`).join('')
      : '<p class="muted">Chưa có nhà cung cấp.</p>';
    const codes = Object.keys(S.models).sort();
    $('#modelBody').innerHTML = codes.length ? codes.map((c) => { const m = S.models[c]; return `<tr data-code="${esc(c)}">
      <td><input data-m="code" value="${esc(c)}" style="width:130px"></td><td><input data-m="hs" value="${esc(fmtHS(m.hs))}" style="width:120px"></td>
      <td><textarea data-m="desc" rows="2">${esc(m.desc)}</textarea></td><td><input data-m="unit" value="${esc(m.unit || 'PCE')}" style="width:64px"></td>
      <td><input data-m="bt" value="${esc(m.bt || '')}" placeholder="tự động" style="width:84px" title="Để trống: tự dùng mã biểu thuế Form E khi có C/O"></td>
      <td><button class="btn btn-ghost btn-sm btn-icon" data-act="delmodel" aria-label="Xoá model">✕</button></td></tr>`; }).join('')
      : '<tr><td colspan="6" class="muted">Chưa có model. Nạp Invoice rồi bấm 💾 Lưu vào thư viện ở từng dòng, hoặc lấy từ Landed Cost.</td></tr>';
    const n = lcProducts().length;
    $('#lcInfo').textContent = n ? `Landed Cost trên máy này có ${n} sản phẩm.` : 'Landed Cost trên máy này chưa có sản phẩm (ngoài ví dụ).';
  }
  $('#genForm').addEventListener('change', (e) => { const k = e.target.dataset.g; if (!k) return; S.gen[k] = e.target.value.trim(); saveSet(); later(); });
  $('#supList').addEventListener('change', (e) => {
    const k = e.target.dataset.s; if (!k) return; const s = S.sups.find((x) => x.id === e.target.closest('.sup').dataset.sid);
    s[k] = e.target.value.trim(); if (k === 'country') s[k] = s[k].toUpperCase(); saveSet(); later();
  });
  $('#supList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act="delsup"]'); if (!b) return;
    const id = b.closest('.sup').dataset.sid; S.sups = S.sups.filter((x) => x.id !== id); if (L.supId === id) L.supId = (S.sups[0] || {}).id || '';
    saveSet(); saveLot(); renderAll();
  });
  $('#btnAddSup').onclick = () => { const s = { id: uid(), country: 'CN' }; S.sups.push(s); if (!L.supId) L.supId = s.id; saveSet(); saveLot(); renderAll(); };
  $('#modelBody').addEventListener('change', (e) => {
    const k = e.target.dataset.m; if (!k) return; const old = e.target.closest('tr').dataset.code; const m = S.models[old];
    if (k === 'code') {
      const nv = e.target.value.trim().toUpperCase();
      if (!nv || (nv !== old && S.models[nv])) { GauBep.toast(nv ? 'Model này đã có trong thư viện' : 'Model không được để trống'); renderAll(); return; }
      delete S.models[old]; S.models[nv] = m;
    } else m[k] = k === 'hs' ? e.target.value.replace(/\D/g, '') : e.target.value.trim();
    saveSet(); later();
  });
  $('#modelBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act="delmodel"]'); if (!b) return; delete S.models[b.closest('tr').dataset.code]; saveSet(); renderAll();
  });
  $('#btnAddModel').onclick = () => {
    let n = Object.keys(S.models).length + 1; while (S.models['MODEL-' + n]) n++;
    S.models['MODEL-' + n] = { hs: '', desc: '', unit: 'PCE', bt: '' }; saveSet(); renderAll();
    GauBep.toast('Đã thêm dòng MODEL-' + n + ' — sửa lại mã model, HS, mô tả');
  };
  $('#btnFromLC').onclick = () => {
    const list = lcProducts(); let n = 0;
    list.forEach((p) => { if (!S.models[p.code]) { const m = lcModel(p.code); if (m) { S.models[p.code] = m; n++; } } });
    saveSet(); renderAll();
    GauBep.toast(list.length ? `Đã lấy ${n} model mới từ Landed Cost` : 'Landed Cost trên máy này chưa có sản phẩm');
  };
  $('#btnSettings').onclick = () => { const c = $('#settingsCard'); c.hidden = !c.hidden; if (!c.hidden) c.scrollIntoView({ behavior: 'smooth' }); };
  $('#btnCloseSettings').onclick = () => { $('#settingsCard').hidden = true; };
  $('#btnBackup').onclick = () => {
    const blob = new Blob([JSON.stringify({ app: 'customs-entry', v: 1, settings: S }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `PhieuKhai_saoluu_${GauBep.today()}.json`;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  $('#fileBackup').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const d = JSON.parse(await f.text()); if (d.app !== 'customs-entry' || !d.settings) throw new Error('File không đúng bản sao lưu của tool này');
      S = d.settings; S.gen = { ...DEF_GEN, ...(S.gen || {}) }; S.sups = S.sups || []; S.models = S.models || {};
      if (!S.sups.find((x) => x.id === L.supId)) L.supId = (S.sups[0] || {}).id || '';
      saveSet(); saveLot(); renderAll(); GauBep.toast('Đã nạp bản sao lưu');
    } catch (err) { GauBep.toast(err.message); }
  });

  /* ======================= MẪU / LÀM MỚI ======================= */
  $('#btnNew').onclick = () => { L = newLot(); saveLot(); renderAll(); GauBep.toast('Đã tạo lô mới'); };
  $('#btnSample').onclick = () => {
    if (!S.sups.find((x) => x.id === 'vd')) S.sups.push({ id: 'vd', key: 'VD SUPPLIER', name: 'VD SUPPLIER CO., LTD (ví dụ)', addr1: 'NO 1 EXAMPLE ROAD', addr2: 'EXAMPLE DISTRICT', addr3: 'NINGBO CITY ZHEJIANG PROVINCE', addr4: 'CHINA', country: 'CN', contractNo: 'VD-HD-01', contractDate: '2025-08-01', contractEnd: '2026-12-31' });
    if (!S.models['VD-QUAT01']) S.models['VD-QUAT01'] = { hs: '84145191', desc: 'VD-QUAT01- Quạt đứng (ví dụ); Điện áp: 220V-50Hz; Công suất: 40W; 1 cái/thùng; hàng mới 100%', unit: 'PCE', bt: '' };
    L = { sample: true, docs: { bill: 'vi-du-bill.pdf', ci: 'vi-du-invoice.pdf', pl: 'vi-du-packing-list.pdf', co: 'vi-du-co.pdf' }, supId: 'vd', origin: 'CN',
      blNo: 'VDHCM0000001', blDate: '2026-10-04', vessel: 'VD VESSEL V001', pol: 'NINGBO', pod: 'HO CHI MINH(SPITC)', cont: 'VDCU0000001 / 40HQ', pkgs: 500, gw: 3000, cbm: 60,
      invNo: 'VD-INV-001', invDate: '2026-09-20', incoterm: 'FOB NINGBO', invTotal: 7500, plPkgs: 500, plGw: 3000, plNw: 2500, plQty: 500,
      coNo: 'E26VD0000000001', coForm: 'E', coDate: '2026-10-06', coPkgs: 500, coGw: 3000, coText: 'VD-INV-001',
      arrival: '2026-10-11', freight: 20000000, ins: 200000, rate: 25800, permit: '',
      lines: [{ id: uid(), code: 'VD-QUAT01', desc: S.models['VD-QUAT01'].desc, hs: '84145191', qty: 500, unit: 'PCE', price: 15, invAmount: 7500, bt: '' }] };
    saveSet(); saveLot(); renderAll(); GauBep.toast('Đã nạp lô ví dụ 🐼');
  };

  let pending = false;
  function later() { if (pending) return; pending = true; setTimeout(() => { pending = false; renderAll(); }, 0); }
  function renderAll() { renderLot(); renderLines(); renderChecks(); renderOut(); renderTax(); renderSettings(); }
  renderAll();
  loadTariff();
})();
