/* =========================================================
   Phiếu nhập kho & File MISA
   ---------------------------------------------------------
   Quy trình:
     1. Thông tin PO (số PO, ngày, NCC, kho)
     2. Dòng hàng: dán bảng PO / lịch giao, hoặc nạp PDF/XML có chữ (PO, hoá đơn GTGT)
        → model tra danh mục để lấy Mã hàng MISA, Tên hàng, Số khối, Đơn giá gần nhất
     3. Chia đợt: mỗi dòng hàng có SL cho từng đợt. Còn lại = SL PO − Σ SL các đợt (phải = 0)
   Tên lô (= Số đơn hàng MISA) = "<Số PO> <viết tắt kho> đợt <n>"
     (PO chỉ 1 đợt + bật tuỳ chọn → bỏ " đợt 1"); sửa tay được.
   Phiếu đề nghị nhập kho: mỗi đợt 1 khối, Tổng số khối = Số lượng × Số khối, dòng Total có ghi chú container.
   File MISA: mỗi mã trong mỗi đợt 1 dòng; Thành tiền = SL × Đơn giá; Ngày giao hàng = ngày nhập kho của đợt.
   Mọi dữ liệu (cài đặt, danh mục, các PO) chỉ lưu localStorage trên máy người dùng.
   ========================================================= */
(function () {
  const { fmt, parseNum, store, toast } = GauBep;
  GauBep.mountLayout({ title: 'Phiếu nhập kho & File MISA', icon: '📦' });
  document.getElementById('bamboo').outerHTML = GauBep.bamboo();
  const P = window.PoParsers, X = window.PoExport;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const vnDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
  const n0 = (v) => (isFinite(v) ? v : 0);

  /* ======================= LƯU TRỮ ======================= */
  const K = { cur: 'po-receipt:v1', set: 'po-receipt:settings:v1', cat: 'po-receipt:catalog:v1', his: 'po-receipt:history:v1' };
  const DEF_SET = {
    company: '', dept: 'Phòng mua hàng', prefix: '', vat: 8, unit: 'Cái', currency: 'VND', noSuffix: true,
    suppliers: [], defaultSupplier: '',
    warehouses: [{ id: 'mn', name: 'Kho Miền Nam', short: 'MN', misa: '' }, { id: 'mb', name: 'Kho Miền Bắc', short: 'MB', misa: '' }],
    defaultWh: 'mn',
  };
  let S = { ...DEF_SET, ...store.get(K.set, {}) };
  let CAT = store.get(K.cat, {});           // { MODEL: { code, name, cbm, price, at } }
  let HIS = store.get(K.his, {});           // { poNo: state }
  const blank = () => ({ poNo: '', poDate: todayIso(), supplier: S.defaultSupplier, wh: S.defaultWh, poTotal: '', misaMode: 'lot', lots: [], items: [] });
  let st = { ...blank(), ...store.get(K.cur, {}) };
  const saveSet = () => store.set(K.set, S);
  const saveCat = () => store.set(K.cat, CAT);
  function save() {
    store.set(K.cur, st);
    if (st.poNo && st.items.length) { HIS[st.poNo] = { ...JSON.parse(JSON.stringify(st)), at: new Date().toISOString() }; store.set(K.his, HIS); }
  }

  /* ======================= DANH MỤC ======================= */
  const up = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
  function modelOf(code) {
    const c = up(code); const pre = up(S.prefix);
    if (pre && c.startsWith(pre)) return c.slice(pre.length);
    return c;
  }
  const codeOf = (model) => (up(S.prefix) || '') + up(model);
  function catFind(model) {
    const m = up(model);
    if (CAT[m]) return CAT[m];
    const full = codeOf(m);
    return Object.values(CAT).find((v) => { const c = up(v.code); return c === full || c.endsWith('-' + m); }) || null;
  }
  const known = (model) => !!catFind(model);
  const hasMisaList = () => Object.values(CAT).some((v) => v.misaList);
  /* Ghi 1 mã vào danh mục.
     overwrite: true = ghi đè mọi trường có giá trị · mảng tên trường = chỉ ghi đè các trường đó · false = chỉ điền chỗ trống
     Trả về { isNew, changes: [[trường, cũ, mới]] } */
  function catLearn(e, overwrite) {
    const m = up(e.model || modelOf(e.code));
    if (!m) return null;
    const isNew = !CAT[m];
    const cur = CAT[m] || {};
    const changes = [];
    const pick = (k, isNum) => {
      const v = e[k];
      const has = isNum ? isFinite(v) && v > 0 : v != null && String(v).trim() !== '';
      const empty = cur[k] == null || cur[k] === '' || (isNum && !(cur[k] > 0));
      const ow = overwrite === true || (Array.isArray(overwrite) && overwrite.includes(k));
      if (has && (ow || empty)) {
        if (!empty && (isNum ? Math.abs(cur[k] - v) > 1e-9 : String(cur[k]) !== String(v))) changes.push([k, cur[k], v]);
        return v;
      }
      return cur[k];
    };
    CAT[m] = { code: pick('code') || cur.code || codeOf(m), name: pick('name'), cbm: pick('cbm', true), price: pick('price', true),
      misa: !!(cur.misa || e.misa), misaList: !!(cur.misaList || e.misaList), src: e.src || cur.src || '',
      at: changes.length || isNew ? new Date().toISOString().slice(0, 10) : cur.at || new Date().toISOString().slice(0, 10) };
    return { isNew, changes };
  }

  /* ======================= TÊN LÔ ======================= */
  const whOf = () => S.warehouses.find((w) => w.id === st.wh) || S.warehouses[0] || { name: '', short: '', misa: '' };
  // NCC của PO; PO chưa chọn (hoặc NCC đã bị xoá) → dùng NCC mặc định, hoặc NCC duy nhất trong cài đặt
  const supOf = () => S.suppliers.find((s) => s.id === st.supplier)
    || S.suppliers.find((s) => s.id === S.defaultSupplier) || (S.suppliers.length === 1 ? S.suppliers[0] : null);
  function syncSupplier() { const s = supOf(); if (s && st.supplier !== s.id) st.supplier = s.id; }
  function autoName(i) {
    const base = [st.poNo || 'PO', whOf().short].filter(Boolean).join(' ');
    return st.lots.length === 1 && S.noSuffix ? base : `${base} đợt ${i + 1}`;
  }
  const lotName = (lot, i) => (lot.name && lot.name.trim()) || autoName(i);

  /* ======================= TÍNH TOÁN ======================= */
  const lotQty = (it, lot) => n0(parseNum(it.split[lot.id]));
  const assigned = (it) => st.lots.reduce((s, l) => s + lotQty(it, l), 0);
  const rest = (it) => n0(parseNum(it.qty)) - assigned(it);
  function totals() {
    const t = { qty: 0, amount: 0, vat: 0, cbm: 0, lots: st.lots.map(() => ({ qty: 0, cbm: 0 })) };
    st.items.forEach((it) => {
      const q = n0(parseNum(it.qty)); const p = parseNum(it.price); const v = isFinite(parseNum(it.vat)) && it.vat !== '' ? parseNum(it.vat) : S.vat;
      t.qty += q; t.amount += q * n0(p); t.vat += q * n0(p) * v / 100; t.cbm += q * n0(parseNum(it.cbm));
      st.lots.forEach((l, i) => { const lq = lotQty(it, l); t.lots[i].qty += lq; t.lots[i].cbm += lq * n0(parseNum(it.cbm)); });
    });
    return t;
  }

  /* ======================= DÒNG HÀNG ======================= */
  function newItem(model, extra = {}) {
    const m = up(model); const c = catFind(m) || {};
    return { id: uid(), model: m, code: c.code || codeOf(m), name: c.name || extra.desc || '', unit: S.unit,
      cbm: c.cbm > 0 ? c.cbm : '', price: c.price > 0 ? c.price : '', priceFrom: c.price > 0 ? 'cat' : '', vat: '', qty: '', split: {} };
  }
  /* Điền các ô CÒN TRỐNG của dòng hàng từ danh mục (không ghi đè ô đã có / đã sửa tay) */
  function fillFromCatalog(it) {
    const c = catFind(it.model); if (!c) return false;
    let ch = false;
    if (!(parseNum(it.cbm) > 0) && c.cbm > 0) { it.cbm = c.cbm; ch = true; }
    if (!String(it.name || '').trim() && c.name) { it.name = c.name; ch = true; }
    if (c.code && (!it.code || up(it.code) === up(it.model) || up(it.code) === codeOf(it.model)) && up(it.code) !== up(c.code)) { it.code = c.code; ch = true; }
    return ch;
  }
  function itemFor(model, desc) {
    const m = up(model);
    let it = st.items.find((x) => x.model === m);
    if (!it) { it = newItem(m, { desc }); st.items.push(it); } else fillFromCatalog(it);
    return it;
  }
  function ensureLot() { if (!st.lots.length) st.lots.push({ id: uid(), name: '', date: '', note: '', cont: '' }); }

  /* Dòng kiểu PO (mã, SL, giá): thêm/cập nhật; hàng mới mặc định vào đợt 1 nếu chỉ có 1 đợt */
  function applyPoRows(rows, source) {
    ensureLot();
    let add = 0, upd = 0;
    rows.forEach((r) => {
      const existed = st.items.some((x) => x.model === up(r.model));
      const it = itemFor(r.model, r.desc);
      if (isFinite(r.qty)) {
        const oldQty = n0(parseNum(it.qty));
        it.qty = r.qty;
        // chỉ có 1 đợt: hàng mới, hàng chưa xếp đợt nào, hoặc đang xếp đủ SL cũ → xếp đủ SL mới vào đợt đó
        if (st.lots.length === 1 && (!existed || assigned(it) === 0 || assigned(it) === oldQty)) it.split = { [st.lots[0].id]: r.qty };
      }
      if (isFinite(r.price) && r.price > 0) { it.price = r.price; it.priceFrom = source; }
      if (isFinite(r.vat)) it.vat = r.vat;
      if (!String(it.name || '').trim() && r.desc) it.name = String(r.desc).replace(/\s*\([^()]*\)\s*$/, '').trim();
      existed ? upd++ : add++;
    });
    return { add, upd };
  }
  /* Lịch giao NCC: SL đã giao → đợt theo ngày giao; phần chưa giao để ở "Còn lại" */
  function applyDelivery(rows) {
    let add = 0, upd = 0, pend = 0; const diff = [];
    rows.forEach((r) => {
      const existed = st.items.some((x) => x.model === up(r.model));
      const it = itemFor(r.model, r.desc);
      // SL PO đã có (từ PO / PO điều chỉnh) thì giữ; lịch giao khác số thì chỉ báo
      if (isFinite(r.qty)) {
        const cur = n0(parseNum(it.qty));
        if (!cur) it.qty = r.qty; else if (cur !== r.qty) diff.push(`${it.model}: lịch giao ${r.qty}, PO ${cur}`);
      }
      if (isFinite(r.price) && r.price > 0) { it.price = r.price; it.priceFrom = 'paste'; }
      const dlv = n0(r.delivered);
      // phần đã giao xếp vào đợt có ngày giao; bỏ SL ở các đợt thường khác (đợt có ghi chú "chờ…" giữ nguyên)
      it.split = { ...it.split };
      st.lots.forEach((l) => { if (!l.note) delete it.split[l.id]; });
      if (dlv > 0) {
        let lot = st.lots.find((l) => r.date && l.date === r.date && !l.note);
        if (!lot) lot = st.lots.find((l) => !l.date && !l.note);
        if (!lot) { lot = { id: uid(), name: '', date: r.date || '', note: '', cont: '' }; st.lots.push(lot); }
        if (!lot.date && r.date) lot.date = r.date;
        it.split[lot.id] = dlv;
      }
      existed ? upd++ : add++;
    });
    // bỏ đợt trống (không hàng, không ngày, không ghi chú)
    st.lots = st.lots.filter((l) => l.date || l.note || l.cont || st.items.some((x) => lotQty(x, l) > 0));
    rows.forEach((r) => { const it = st.items.find((x) => x.model === up(r.model)); if (it) pend += Math.max(0, rest(it)); });
    return { add, upd, pend, diff };
  }

  /* ======================= RENDER ======================= */
  function renderPo() {
    syncSupplier();
    $('poNo').value = st.poNo; $('poDate').value = st.poDate; $('poTotal').value = st.poTotal; $('misaMode').value = st.misaMode || 'lot';
    $('poSupplier').innerHTML = `<option value="">— chọn NCC —</option>` + S.suppliers.map((s) => `<option value="${s.id}">${esc(s.code)} · ${esc(s.name)}</option>`).join('');
    $('poSupplier').value = st.supplier || '';
    $('poWh').innerHTML = S.warehouses.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join('');
    $('poWh').value = st.wh || (S.warehouses[0] || {}).id || '';
  }

  function renderLots(t) {
    $('lotBody').innerHTML = st.lots.map((l, i) => `
      <tr data-lot="${l.id}">
        <td class="center"><b>${i + 1}</b></td>
        <td><input class="w-lg" data-lk="name" value="${esc(l.name)}" placeholder="${esc(autoName(i))}"></td>
        <td><input type="date" data-lk="date" value="${esc(l.date)}"></td>
        <td><input class="w-lg" data-lk="note" value="${esc(l.note)}" placeholder="vd Chờ giao chéo kho"></td>
        <td><input class="w-sm" data-lk="cont" value="${esc(l.cont)}" placeholder="vd 1x40"></td>
        <td class="num" data-out="lq${i}">${fmt.num(t.lots[i].qty, 0)}</td>
        <td class="num" data-out="lc${i}">${fmt.num(t.lots[i].cbm, 2)}</td>
        <td><button class="btn-x" data-del-lot="${l.id}" title="Xoá đợt">✕</button></td>
      </tr>`).join('') || `<tr><td colspan="8" class="muted">Chưa có đợt — dán bảng hoặc bấm ＋ Thêm đợt.</td></tr>`;
  }

  function renderItems() {
    const lotHeads = st.lots.map((l, i) => `<th class="num lot-col" title="${esc(lotName(l, i))}">Đợt ${i + 1}</th>`).join('');
    $('itemHead').innerHTML = `<tr><th>#</th><th>Model</th><th>Mã hàng MISA</th><th>Tên hàng</th><th>ĐVT</th><th class="num">SL PO</th>
      <th class="num">Đơn giá</th><th class="num">Thành tiền</th><th class="num">Số khối</th><th class="num">VAT %</th>${lotHeads}<th class="num">Còn lại</th><th></th></tr>`;
    $('itemBody').innerHTML = st.items.map((it, k) => {
      const unknown = !catFind(it.model);
      return `<tr data-id="${it.id}" class="${unknown ? 'unknown' : ''}">
        <td class="center">${k + 1}</td>
        <td class="model"><input class="w-md" data-k="model" value="${esc(it.model)}" title="${unknown ? 'Chưa có trong danh mục' : ''}"></td>
        <td><input class="w-md" data-k="code" value="${esc(it.code)}"></td>
        <td><input class="w-xl" data-k="name" value="${esc(it.name)}"></td>
        <td><input class="w-xs" data-k="unit" value="${esc(it.unit)}"></td>
        <td><input class="w-xs in-num" data-k="qty" inputmode="decimal" value="${esc(it.qty)}"></td>
        <td><input class="w-sm in-num" data-k="price" inputmode="decimal" value="${it.price === '' ? '' : esc(fmt.vnd(parseNum(it.price)))}" title="${it.priceFrom === 'cat' ? 'Giá gần nhất trong danh mục — kiểm tra lại với PO' : ''}">${it.priceFrom === 'cat' ? '<span class="tag">giá cũ</span>' : ''}</td>
        <td class="num" data-out="amt">${fmt.vnd(n0(parseNum(it.qty)) * n0(parseNum(it.price)))}</td>
        <td><input class="w-xs in-num" data-k="cbm" inputmode="decimal" value="${esc(it.cbm)}"></td>
        <td><input class="w-xs in-num" data-k="vat" inputmode="decimal" value="${esc(it.vat)}" placeholder="${S.vat}"></td>
        ${st.lots.map((l) => `<td class="lot-col"><input class="w-xs in-num" data-lot="${l.id}" inputmode="decimal" value="${esc(it.split[l.id] ?? '')}"></td>`).join('')}
        <td class="num rest" data-out="rest"></td>
        <td><button class="btn-x" data-del-item="${it.id}" title="Xoá dòng">✕</button></td>
      </tr>`;
    }).join('') || `<tr><td colspan="${12 + st.lots.length}" class="muted">Chưa có dòng hàng.</td></tr>`;
  }

  function renderDerived() {
    const t = totals();
    st.items.forEach((it) => {
      const tr = document.querySelector(`#itemBody tr[data-id="${it.id}"]`);
      if (!tr) return;
      tr.querySelector('[data-out="amt"]').textContent = fmt.vnd(n0(parseNum(it.qty)) * n0(parseNum(it.price)));
      const r = rest(it); const c = tr.querySelector('[data-out="rest"]');
      c.textContent = fmt.num(r, 0); c.className = 'num rest ' + (r === 0 ? 'ok' : 'bad');
    });
    $('itemFoot').innerHTML = st.items.length ? `<tr><td colspan="5">Tổng</td><td class="num">${fmt.num(t.qty, 0)}</td><td></td>
      <td class="num">${fmt.vnd(t.amount)}</td><td class="num">${fmt.num(t.cbm, 2)}</td><td></td>
      ${t.lots.map((l) => `<td class="num">${fmt.num(l.qty, 0)}</td>`).join('')}<td class="num">${fmt.num(t.qty - t.lots.reduce((s, l) => s + l.qty, 0), 0)}</td><td></td></tr>` : '';
    t.lots.forEach((l, i) => {
      const a = document.querySelector(`[data-out="lq${i}"]`); if (a) a.textContent = fmt.num(l.qty, 0);
      const b = document.querySelector(`[data-out="lc${i}"]`); if (b) b.textContent = fmt.num(l.cbm, 2);
    });
    renderChecks(t);
    save();
  }

  function issues(t) {
    const out = [];
    if (!S.company) out.push(['warn', 'Chưa nhập tên công ty ở ⚙️ Cài đặt (đầu phiếu nhập kho sẽ trống).']);
    if (!st.poNo) out.push(['bad', 'Chưa nhập Số PO.']);
    if (!Object.keys(CAT).length) out.push(['warn', 'Danh mục hàng trên máy này đang trống → tool chưa có số khối / tên hàng để tự điền. Vào 📚 Danh mục hàng, nạp file data sản phẩm (list Bosch) — chỉ cần làm 1 lần.']);
    if (!S.prefix && st.items.some((it) => it.model && up(it.code) === up(it.model)))
      out.push(['bad', 'Chưa đặt tiền tố mã hàng (vd ABC-) → mã hàng MISA đang bằng model. Vào 📚 Danh mục hàng hoặc ⚙️ Cài đặt để nhập, tool tự sửa mã.']);
    if (!supOf()) out.push(['bad', 'Chưa có nhà cung cấp → file MISA sẽ trống Mã / Tên NCC. Vào ⚙️ Cài đặt thêm NCC rồi chọn ở bước 1.']);
    else if (!String(supOf().code || '').trim()) out.push(['bad', `NCC "${supOf().name}" chưa có Mã NCC (MISA) — nhập ở ⚙️ Cài đặt.`]);
    st.items.forEach((it) => {
      const r = rest(it); const nm = it.model || '(chưa có model)';
      if (!it.model) out.push(['bad', 'Có dòng chưa nhập model.']);
      if (r > 0) out.push(['bad', `${nm}: còn ${fmt.num(r, 0)} cái chưa xếp vào đợt nào.`]);
      if (r < 0) out.push(['bad', `${nm}: chia đợt nhiều hơn SL PO ${fmt.num(-r, 0)} cái.`]);
      if (it.model && !String(it.name || '').trim()) out.push(['bad', `${nm}: chưa có tên hàng.`]);
      if (!(parseNum(it.price) > 0)) out.push(['warn', `${nm}: chưa có đơn giá (file MISA cần).`]);
      else if (it.priceFrom === 'cat') out.push(['warn', `${nm}: đang dùng giá gần nhất trong danh mục (${fmt.vnd(parseNum(it.price))}) — kiểm tra lại với PO.`]);
      if (!(parseNum(it.cbm) > 0)) out.push(['warn', `${nm}: chưa có số khối.`]);
      const ce = it.model ? catFind(it.model) : null;
      if (it.model && !ce) out.push(['warn', `${nm}: mã chưa có trong danh mục — kiểm tra tên, số khối và nhớ tạo mã ${it.code} trên MISA trước khi import.`]);
      else if (ce && !ce.misa && hasMisaList()) out.push(['warn', `${nm}: chưa thấy trong danh sách hàng hoá MISA — nhớ tạo mã ${it.code} trên MISA trước khi import.`]);
    });
    st.lots.forEach((l, i) => {
      if (!t.lots[i].qty) out.push(['warn', `Đợt ${i + 1} chưa có hàng (sẽ bị bỏ qua khi xuất).`]);
      else if (!l.date && !l.note) out.push(['warn', `Đợt ${i + 1} chưa có ngày nhập kho hoặc ghi chú.`]);
    });
    const names = st.lots.map(lotName);
    if (new Set(names).size !== names.length) out.push(['bad', 'Có 2 đợt trùng tên lô — sửa lại tên lô.']);
    const pt = parseNum(st.poTotal);
    if (pt > 0) {
      const diff = Math.round(t.amount - pt);
      out.push(diff === 0 ? ['ok', `Tổng tiền hàng ${fmt.vnd(t.amount)} khớp với PO ✓`] : ['bad', `Tổng tiền hàng ${fmt.vnd(t.amount)} lệch PO ${fmt.vnd(pt)}: ${diff > 0 ? '+' : ''}${fmt.vnd(diff)}`]);
    }
    return out;
  }
  function renderChecks(t) {
    const assignedQty = t.lots.reduce((s, l) => s + l.qty, 0);
    $('kpis').innerHTML = `
      <div class="kpi"><div class="label">SL PO</div><div class="value">${fmt.num(t.qty, 0)}</div></div>
      <div class="kpi ${assignedQty === t.qty ? 'accent' : ''}"><div class="label">Đã chia đợt</div><div class="value">${fmt.num(assignedQty, 0)}</div></div>
      <div class="kpi"><div class="label">Tổng số khối</div><div class="value">${fmt.num(t.cbm, 2)}</div></div>
      <div class="kpi accent"><div class="label">Tiền hàng trước VAT</div><div class="value">${fmt.vnd(t.amount)}</div></div>
      <div class="kpi"><div class="label">VAT</div><div class="value">${fmt.vnd(t.vat)}</div></div>
      <div class="kpi"><div class="label">Sau VAT</div><div class="value">${fmt.vnd(t.amount + t.vat)}</div></div>`;
    const list = st.items.length ? issues(t) : [];
    const bad = list.filter((x) => x[0] !== 'ok');
    $('checks').innerHTML = list.map(([k, m]) => `<div class="check-row ${k}">${k === 'ok' ? '✅' : k === 'bad' ? '⛔' : '⚠️'} ${esc(m)}</div>`).join('')
      + (st.items.length && !bad.length ? `<div class="check-row">🐼 Mọi thứ đã khớp — xuất file được rồi.</div>` : '');
  }

  function renderHistory() {
    const rows = Object.entries(HIS).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at)));
    $('historyBody').innerHTML = rows.map(([k, h]) => {
      const q = (h.items || []).reduce((s, it) => s + n0(parseNum(it.qty)), 0);
      return `<tr><td><b>${esc(k)}</b></td><td>${vnDate(h.poDate)}</td><td class="num">${(h.items || []).length}</td><td class="num">${fmt.num(q, 0)}</td>
        <td>${(h.lots || []).length}</td><td class="muted">${esc(String(h.at || '').slice(0, 16).replace('T', ' '))}</td>
        <td><button class="btn btn-ghost btn-sm" data-open="${esc(k)}">Mở</button> <button class="btn-x" data-del-his="${esc(k)}" title="Xoá">✕</button></td></tr>`;
    }).join('') || `<tr><td colspan="7" class="muted">Chưa có PO nào.</td></tr>`;
  }

  function renderAll() {
    renderPo(); renderLots(totals()); renderItems(); renderDerived(); renderHistory();
    $('setupNote').hidden = !!(S.company && S.suppliers.length && Object.keys(CAT).length);
  }

  /* ======================= SỰ KIỆN: PO ======================= */
  ['poNo', 'poDate', 'poTotal'].forEach((id) => $(id).addEventListener('input', () => {
    st[id] = $(id).value.trim();
    if (id === 'poNo') { renderLots(totals()); renderItems(); }
    renderDerived();
  }));
  $('poSupplier').onchange = () => { st.supplier = $('poSupplier').value; renderDerived(); };
  $('poWh').onchange = () => { st.wh = $('poWh').value; renderLots(totals()); renderItems(); renderDerived(); };
  $('misaMode').onchange = () => { st.misaMode = $('misaMode').value; save(); };

  /* Đợt */
  $('lotBody').addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-lot]'); const k = e.target.dataset.lk;
    if (!tr || !k) return;
    const lot = st.lots.find((l) => l.id === tr.dataset.lot); lot[k] = e.target.value;
    if (k === 'name') renderItems();
    renderDerived();
  });
  $('lotBody').addEventListener('click', (e) => {
    const id = e.target.dataset.delLot; if (!id) return;
    const has = st.items.some((it) => n0(parseNum(it.split[id])) > 0);
    if (has && !confirm('Đợt này đang có hàng. Xoá đợt thì số lượng của đợt sẽ trả về cột "Còn lại". Xoá?')) return;
    st.lots = st.lots.filter((l) => l.id !== id); st.items.forEach((it) => delete it.split[id]);
    renderAll();
  });
  $('btnAddLot').onclick = () => { st.lots.push({ id: uid(), name: '', date: '', note: '', cont: '' }); renderAll(); };
  $('btnRemainder').onclick = () => {
    const left = st.items.filter((it) => rest(it) > 0);
    if (!left.length) return toast('Không còn hàng nào chưa chia đợt 🐼');
    const lot = { id: uid(), name: '', date: '', note: 'Chờ giao', cont: '' };
    st.lots.push(lot); left.forEach((it) => { it.split[lot.id] = rest(it); });
    renderAll(); toast(`Đã dồn ${left.length} mã vào đợt ${st.lots.length} — sửa ghi chú / ngày cho đợt này`);
  };

  /* Dòng hàng */
  $('itemBody').addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const it = st.items.find((x) => x.id === tr.dataset.id);
    if (e.target.dataset.lot) { it.split[e.target.dataset.lot] = e.target.value.trim(); }
    else {
      const k = e.target.dataset.k; it[k] = e.target.value;
      if (k === 'price') it.priceFrom = 'manual';
    }
    renderDerived();
  });
  $('itemBody').addEventListener('change', (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const it = st.items.find((x) => x.id === tr.dataset.id); const k = e.target.dataset.k;
    if (k === 'model') {                         // đổi model → tra lại danh mục
      it.model = up(it.model); const c = catFind(it.model);
      if (c) { it.code = c.code || codeOf(it.model); if (c.name) it.name = c.name; if (c.cbm > 0) it.cbm = c.cbm; if (c.price > 0 && !(parseNum(it.price) > 0)) { it.price = c.price; it.priceFrom = 'cat'; } }
      else if (!it.code || it.code === S.prefix) it.code = codeOf(it.model);
    }
    if (k === 'price') { it.price = parseNum(it.price) || ''; e.target.value = it.price === '' ? '' : fmt.vnd(it.price); const tag = e.target.nextElementSibling; if (tag) tag.remove(); }
    if (k === 'model') { renderItems(); renderLots(totals()); }   // chỉ vẽ lại khi đổi model (giữ con trỏ khi Tab qua các ô khác)
    renderDerived();
  });
  $('itemBody').addEventListener('click', (e) => {
    const id = e.target.dataset.delItem; if (!id) return;
    st.items = st.items.filter((x) => x.id !== id); renderAll();
  });
  $('btnAddItem').onclick = () => { ensureLot(); const it = newItem(''); st.items.push(it); renderAll(); document.querySelector(`tr[data-id="${it.id}"] input`).focus(); };

  /* ======================= DÁN BẢNG ======================= */
  const log = (html, ok) => { $('importLog').insertAdjacentHTML('afterbegin', `<div class="log-row ${ok ? 'ok' : ''}">${html}</div>`); };
  $('btnPaste').onclick = () => { $('pasteBox').hidden = false; $('pasteText').focus(); };
  $('btnCancelPaste').onclick = () => { $('pasteBox').hidden = true; };
  /* Áp bảng đã đọc (dán hoặc file Excel) vào PO: lịch giao → chia đợt; bảng PO → SL, đơn giá */
  function applyParsed(res, label) {
    if (res.kind === 'delivery') {
      const r = applyDelivery(res.rows);
      log(`${label} — lịch giao: ${res.rows.length} mã (${r.add} mới, ${r.upd} cập nhật).${r.pend ? ` Còn <b>${fmt.num(r.pend, 0)}</b> cái chưa giao → bấm <b>↳ Dồn phần còn lại vào đợt mới</b>.` : ''}`
        + (r.diff.length ? `<br>⚠️ SL trên lịch giao khác SL PO (giữ SL PO): ${esc(r.diff.join('; '))}` : ''), !r.pend && !r.diff.length);
    } else {
      const r = applyPoRows(res.rows, 'paste');
      log(`${label} — bảng PO: ${res.rows.length} dòng (${r.add} mới, ${r.upd} cập nhật SL / đơn giá).`, true);
    }
  }
  $('btnReadPaste').onclick = () => {
    const res = P.paste($('pasteText').value, known);
    if (!res.rows.length) return toast('Không đọc được dòng hàng nào — kiểm tra lại bảng dán');
    applyParsed(res, '📋 Bảng dán');
    $('pasteText').value = ''; $('pasteBox').hidden = true;
    renderAll();
  };

  /* ======================= PDF / XML ======================= */
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const loadScript = (src, glob) => (window[glob] ? Promise.resolve(window[glob]) : new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src;
    s.onload = () => res(window[glob]); s.onerror = () => rej(new Error('Không tải được thư viện (kiểm tra mạng)'));
    document.head.append(s);
  }));
  const loadXLSX = () => loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX');
  const loadExcelJS = () => loadScript('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js', 'ExcelJS');
  async function pdfToLines(file) {
    const pdfjs = await loadScript(PDFJS + 'pdf.min.js', 'pdfjsLib');
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const lines = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      const items = tc.items.filter((i) => String(i.str).trim())
        .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5] - p * 100000, h: i.height || 10 }))
        .sort((a, b) => b.y - a.y || a.x - b.x);
      items.forEach((t) => {
        const l = lines.find((x) => Math.abs(x.y - t.y) <= Math.min(x.h, t.h) * 0.4);
        if (l) l.toks.push(t); else lines.push({ y: t.y, h: t.h, toks: [t] });
      });
    }
    lines.forEach((l) => l.toks.sort((a, b) => a.x - b.x));
    return lines;
  }
  $('fileDoc').onchange = async (e) => {
    for (const f of e.target.files) {
      try {
        let res;
        if (/\.xml$/i.test(f.name)) res = P.invoiceXml(await f.text());
        else {
          const lines = await pdfToLines(f);
          if (!lines.length) { log(`📄 ${esc(f.name)}: PDF dạng ảnh scan, không có chữ để đọc → hãy dán bảng (📋) hoặc nhập tay.`); continue; }
          res = P.pdfLines(lines, known);
        }
        if (!res.rows.length) { log(`📄 ${esc(f.name)}: không tìm thấy dòng hàng (SL × đơn giá = thành tiền).`); continue; }
        const r = applyPoRows(res.rows, 'doc');
        log(`📄 ${esc(f.name)}: ${res.rows.length} dòng — ${r.add} mã mới, ${r.upd} cập nhật SL / đơn giá.${(res.warnings || []).length ? ' ⚠️ ' + esc(res.warnings.join('; ')) : ''}`, true);
      } catch (err) { log(`📄 ${esc(f.name)}: lỗi — ${esc(err.message)}`); }
    }
    e.target.value = ''; renderAll();
  };

  /* ======================= MỞ PHIẾU CŨ (.xlsx phiếu nhập kho / .xls MISA) ======================= */
  async function readAoa(file) {
    const XLSX = await loadXLSX();
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { cellDates: false });   // ngày giữ dạng số serial → không lệch múi giờ
    return wb.SheetNames.map((n) => ({ name: n, aoa: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) }));
  }
  function splitLotName(name) {               // "PO-1 MN đợt 2" → { po: 'PO-1', wh }
    const base = String(name).replace(/\s+đợt\s*\d+\s*$/i, '').trim();
    const parts = base.split(/\s+/);
    const wh = S.warehouses.find((w) => w.short && parts.length > 1 && up(parts[parts.length - 1]) === up(w.short));
    return { po: wh ? parts.slice(0, -1).join(' ') : parts[0], wh };
  }
  function mergeFile(kind, data) {
    const first = data.lots[0];
    if (!first) return 0;
    const { po, wh } = splitLotName(first.name);
    const same = st.poNo && up(st.poNo) === up(po);
    if (!same) {
      if (st.items.length && !confirm(`Mở PO ${po}? PO đang làm (${st.poNo || 'chưa đặt số'}) đã được lưu ở mục "PO đã làm".`)) return 0;
      save(); st = blank(); st.poNo = po;
    }
    if (wh) st.wh = wh.id;
    if (kind === 'misa') {
      if (data.poDate) st.poDate = data.poDate;
      if (data.supplier && data.supplier.code) {
        let s = S.suppliers.find((x) => up(x.code) === up(data.supplier.code) || (x.tax && x.tax === data.supplier.tax));
        if (!s) { s = { id: uid(), ...data.supplier }; S.suppliers.push(s); if (!S.defaultSupplier) S.defaultSupplier = s.id; saveSet(); }
        st.supplier = s.id;
      }
    }
    // đợt: theo tên lô
    const lotMap = {};
    data.lots.forEach((fl) => {
      let lot = st.lots.find((l, i) => up(lotName(l, i)) === up(fl.name));
      if (!lot) { lot = { id: uid(), name: fl.name, date: '', note: '', cont: '' }; st.lots.push(lot); }
      if (fl.date && (kind === 'receipt' || !lot.date)) lot.date = fl.date;   // phiếu nhập kho quyết định ngày; file MISA chỉ điền chỗ trống
      if (fl.note) lot.note = fl.note;
      if (fl.cont) lot.cont = fl.cont;
      lotMap[fl.name] = lot;
    });
    // dòng hàng: gom theo mã, SL từng đợt
    const touched = new Set();
    data.items.forEach((fi) => {
      const model = modelOf(fi.code);
      let it = st.items.find((x) => up(x.code) === up(fi.code) || x.model === model);
      if (!it) { it = newItem(model); it.code = fi.code; st.items.push(it); }
      if (!touched.has(it.id)) { touched.add(it.id); data.lots.forEach((fl) => { delete it.split[lotMap[fl.name].id]; }); }
      if (fi.name) it.name = fi.name;
      if (fi.unit) it.unit = fi.unit;
      if (fi.cbm > 0) it.cbm = fi.cbm;
      if (fi.price > 0) { it.price = fi.price; it.priceFrom = 'file'; }
      if (isFinite(fi.vat)) it.vat = fi.vat;
      const lot = lotMap[fi.lot];
      it.split[lot.id] = n0(parseNum(it.split[lot.id])) + fi.qty;
      catLearn({ model, code: fi.code, name: fi.name, cbm: fi.cbm, price: fi.price, misa: kind === 'misa' });
    });
    // SL PO = tổng các đợt (với mã vừa đọc)
    st.items.forEach((it) => { if (touched.has(it.id)) it.qty = Math.max(n0(parseNum(it.qty)), assigned(it)); });
    // giữ tên lô tự động nếu trùng mẫu
    st.lots.forEach((l, i) => { if (l.name && up(l.name) === up(autoName(i))) l.name = ''; });
    saveCat();
    return data.items.length;
  }
  $('fileOpen').onchange = async (e) => {
    for (const f of e.target.files) {
      try {
        const sheets = await readAoa(f);
        let done = false;
        for (const sh of sheets) {
          const m = P.misaSheet(sh.aoa);
          if (m && m.items.length) { const n = mergeFile('misa', m); log(`📂 ${esc(f.name)}: file MISA — ${n} dòng, ${m.lots.length} số đơn.`, true); done = true; break; }
          const r = P.receiptSheet(sh.aoa);
          if (r && r.items.length) { const n = mergeFile('receipt', r); log(`📂 ${esc(f.name)}: phiếu nhập kho — ${n} dòng, ${r.lots.length} đợt.`, true); done = true; break; }
        }
        if (!done) log(`📂 ${esc(f.name)}: không nhận ra phiếu nhập kho hay file MISA.`);
      } catch (err) { log(`📂 ${esc(f.name)}: lỗi — ${esc(err.message)}`); }
    }
    e.target.value = ''; renderAll(); renderCatalog();
  };

  /* Nạp file Excel bất kỳ: phiếu nhập kho / file MISA cũ → mở lại; bảng PO / lịch giao → thêm vào PO đang làm */
  $('fileExcel').onchange = async (e) => {
    for (const f of e.target.files) {
      try {
        const sheets = await readAoa(f);
        let done = false;
        for (const sh of sheets) {
          const m = P.misaSheet(sh.aoa);
          if (m && m.items.length) { mergeFile('misa', m); log(`📥 ${esc(f.name)}: là file MISA → đã mở lại (${m.items.length} dòng).`, true); done = true; break; }
          const r = P.receiptSheet(sh.aoa);
          if (r && r.items.length) { mergeFile('receipt', r); log(`📥 ${esc(f.name)}: là phiếu nhập kho → đã mở lại (${r.items.length} dòng).`, true); done = true; break; }
          const t = P.table(sh.aoa, known);
          if (t.rows.length) { ensureLot(); applyParsed(t, `📥 ${esc(f.name)}${sheets.length > 1 ? ` (sheet ${esc(sh.name)})` : ''}`); done = true; break; }
        }
        if (!done) log(`📥 ${esc(f.name)}: không tìm thấy cột Model + Số lượng. Xem file mẫu để đặt tên cột.`);
      } catch (err) { log(`📥 ${esc(f.name)}: lỗi — ${esc(err.message)}`); }
    }
    e.target.value = ''; renderAll();
  };

  /* ======================= XUẤT FILE ======================= */
  const safe = (s) => String(s || 'PO').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_');
  const utcDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  function preflight() {
    if (!st.items.length) { toast('Chưa có dòng hàng'); return false; }
    const bad = issues(totals()).filter((x) => x[0] === 'bad');
    if (bad.length && !confirm(`Còn ${bad.length} lỗi:\n- ${bad.map((x) => x[1]).join('\n- ')}\n\nVẫn xuất file?`)) return false;
    return true;
  }
  function learnAll() {
    st.items.forEach((it) => it.model && catLearn({ model: it.model, code: it.code, name: it.name, cbm: parseNum(it.cbm), price: parseNum(it.price), misa: true }, true));
    saveCat(); renderCatalog();
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  $('btnExportReceipt').onclick = async () => {
    if (!preflight()) return;
    try {
      const ExcelJS = await loadExcelJS();
      const wh = whOf();
      const lots = st.lots.map((l, i) => ({
        name: lotName(l, i), cont: l.cont,
        when: l.note ? l.note : (l.date ? utcDate(l.date) : ''),
        rows: st.items.filter((it) => lotQty(it, l) > 0).map((it) => ({ code: it.code, loc: wh.name, name: it.name, unit: it.unit || S.unit, qty: lotQty(it, l), cbm: parseNum(it.cbm) })),
      })).filter((l) => l.rows.length);
      const wb = X.receipt(ExcelJS, { company: S.company, dept: S.dept, lots });
      const buf = await wb.xlsx.writeBuffer();
      download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${GauBep.today()}_PO_${safe(st.poNo)}_PHIEU_DE_NGHI_NHAP_KHO.xlsx`);
      learnAll(); save(); toast('Đã xuất phiếu đề nghị nhập kho 🎉');
    } catch (err) { toast(err.message); }
  };
  $('btnExportMisa').onclick = async () => {
    if (!preflight()) return;
    try {
      const XLSX = await loadXLSX();
      const wh = whOf(); const lines = [];
      const vatOf = (it) => (it.vat !== '' && isFinite(parseNum(it.vat)) ? parseNum(it.vat) : S.vat);
      if (st.misaMode === 'po') {
        const so = [st.poNo, wh.short].filter(Boolean).join(' ');
        const firstDate = st.lots.map((l) => l.date).filter(Boolean).sort()[0] || '';
        st.items.forEach((it) => lines.push({ so, delivery: firstDate, code: it.code, name: it.name, whCode: wh.misa, unit: it.unit || S.unit, qty: n0(parseNum(it.qty)), price: parseNum(it.price), vat: vatOf(it) }));
      } else {
        st.lots.forEach((l, i) => st.items.forEach((it) => {
          const q = lotQty(it, l); if (!q) return;
          lines.push({ so: lotName(l, i), delivery: l.date, code: it.code, name: it.name, whCode: wh.misa, unit: it.unit || S.unit, qty: q, price: parseNum(it.price), vat: vatOf(it) });
        }));
      }
      const aoa = X.misaAoa({ poDate: st.poDate, supplier: supOf(), currency: S.currency, lines });
      // sheet "Danh sách hàng hoá" như mẫu MISA: các mã MISA trong danh mục + mã của PO này
      const list = new Map();
      Object.values(CAT).filter((v) => v.misa && v.code).forEach((v) => list.set(up(v.code), { code: v.code, name: v.name }));
      st.items.forEach((it) => { if (it.code && !list.has(up(it.code))) list.set(up(it.code), { code: it.code, name: it.name }); });
      const catalog = [...list.values()].sort((a, b) => a.code.localeCompare(b.code));
      const bytes = XlsWriter.build(XLSX.CFB, X.misaBook(aoa, catalog));
      download(new Blob([bytes], { type: 'application/vnd.ms-excel' }), `${GauBep.today()}_PO_${safe(st.poNo)}_NHAP_DON_MUA_HANG.xls`);
      learnAll(); save(); toast('Đã xuất file nhập MISA 🎉');
    } catch (err) { toast(err.message); }
  };

  /* ======================= PO MỚI / MẪU / LỊCH SỬ ======================= */
  $('btnNew').onclick = () => {
    if (st.items.length && !confirm('Làm PO mới? PO hiện tại vẫn được lưu ở mục "PO đã làm".')) return;
    save(); st = blank(); $('importLog').innerHTML = ''; renderAll(); $('poNo').focus();
  };
  $('historyBody').addEventListener('click', (e) => {
    const o = e.target.dataset.open; const d = e.target.dataset.delHis;
    if (o && HIS[o]) { save(); st = { ...blank(), ...JSON.parse(JSON.stringify(HIS[o])) }; delete st.at; renderAll(); window.scrollTo({ top: 0, behavior: 'smooth' }); toast(`Đã mở PO ${o}`); }
    if (d && confirm(`Xoá PO ${d} khỏi danh sách đã làm?`)) { delete HIS[d]; store.set(K.his, HIS); renderHistory(); }
  });
  $('btnSample').onclick = () => {
    if (st.items.length && !confirm('Thay PO hiện tại bằng dữ liệu mẫu?')) return;
    save();
    const l1 = { id: uid(), name: '', date: todayIso(), note: '', cont: '1x40' };
    const l2 = { id: uid(), name: '', date: '', note: 'Chờ giao chéo kho (ví dụ)', cont: '' };
    const mk = (model, name, qty, price, cbm, a, b) => ({ id: uid(), model, code: codeOf(model), name, unit: S.unit, cbm, price, priceFrom: 'manual', vat: '', qty, split: { [l1.id]: a, ...(b ? { [l2.id]: b } : {}) } });
    st = { ...blank(), poNo: 'VD-PO-001', poTotal: '', lots: [l1, l2], items: [
      mk('VD-MRC01', 'Máy rửa chén (ví dụ)', 20, 10000000, 0.39, 20),
      mk('VD-MG02', 'Máy giặt (ví dụ)', 10, 8000000, 0.43, 4, 6),
      mk('VD-TL03', 'Tủ lạnh (ví dụ)', 3, 25000000, 1.3, 0, 3),
    ] };
    st.poTotal = String(20 * 10000000 + 10 * 8000000 + 3 * 25000000);
    renderAll(); toast('Đã nạp dữ liệu mẫu 🐼');
  };

  /* ======================= CÀI ĐẶT ======================= */
  function renderSettings() {
    ['company', 'dept', 'prefix', 'vat', 'unit', 'currency'].forEach((k) => { $('set_' + k).value = S[k] ?? ''; });
    $('set_noSuffix').checked = !!S.noSuffix;
    $('supplierBody').innerHTML = S.suppliers.map((s) => `<tr data-sid="${s.id}">
      <td class="center"><input type="radio" name="defSup" ${S.defaultSupplier === s.id ? 'checked' : ''} data-def="1"></td>
      <td><input class="w-sm" data-sk="code" value="${esc(s.code)}"></td><td><input class="w-lg" data-sk="name" value="${esc(s.name)}"></td>
      <td><input class="w-xl" data-sk="address" value="${esc(s.address)}"></td><td><input class="w-md" data-sk="tax" value="${esc(s.tax)}"></td>
      <td><button class="btn-x" data-del-sup="${s.id}">✕</button></td></tr>`).join('') || `<tr><td colspan="6" class="muted">Chưa có nhà cung cấp.</td></tr>`;
    $('whBody').innerHTML = S.warehouses.map((w) => `<tr data-wid="${w.id}">
      <td><input class="w-md" data-wk="name" value="${esc(w.name)}"></td><td><input class="w-xs" data-wk="short" value="${esc(w.short)}"></td>
      <td><input class="w-sm" data-wk="misa" value="${esc(w.misa)}"></td><td><button class="btn-x" data-del-wh="${w.id}">✕</button></td></tr>`).join('');
  }
  ['company', 'dept', 'unit', 'currency'].forEach((k) => $('set_' + k).addEventListener('input', () => { S[k] = $('set_' + k).value; saveSet(); }));
  $('set_prefix').addEventListener('change', () => { setPrefix($('set_prefix').value); renderAll(); });
  $('set_vat').addEventListener('input', () => { S.vat = parseNum($('set_vat').value); saveSet(); });
  $('set_noSuffix').onchange = () => { S.noSuffix = $('set_noSuffix').checked; saveSet(); renderAll(); };
  $('supplierBody').addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-sid]'); if (!tr) return;
    const s = S.suppliers.find((x) => x.id === tr.dataset.sid);
    if (e.target.dataset.def) S.defaultSupplier = s.id; else s[e.target.dataset.sk] = e.target.value.trim();
    saveSet();
  });
  $('supplierBody').addEventListener('click', (e) => {
    const id = e.target.dataset.delSup; if (!id || !confirm('Xoá nhà cung cấp này?')) return;
    S.suppliers = S.suppliers.filter((x) => x.id !== id); saveSet(); renderSettings();
  });
  $('btnAddSupplier').onclick = () => { const s = { id: uid(), code: '', name: '', address: '', tax: '' }; S.suppliers.push(s); if (!S.defaultSupplier) S.defaultSupplier = s.id; saveSet(); renderSettings(); };
  $('whBody').addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-wid]'); if (!tr) return;
    S.warehouses.find((x) => x.id === tr.dataset.wid)[e.target.dataset.wk] = e.target.value.trim(); saveSet();
  });
  $('whBody').addEventListener('click', (e) => {
    const id = e.target.dataset.delWh; if (!id || S.warehouses.length < 2 || !confirm('Xoá kho này?')) return;
    S.warehouses = S.warehouses.filter((x) => x.id !== id); saveSet(); renderSettings();
  });
  $('btnAddWh').onclick = () => { S.warehouses.push({ id: uid(), name: '', short: '', misa: '' }); saveSet(); renderSettings(); };
  $('btnSettings').onclick = () => { renderSettings(); $('settingsCard').hidden = false; $('settingsCard').scrollIntoView({ behavior: 'smooth' }); };
  $('btnCloseSettings').onclick = () => { $('settingsCard').hidden = true; if (!st.supplier) st.supplier = S.defaultSupplier; renderAll(); };
  $('btnBackup').onclick = () => {
    const blob = new Blob([JSON.stringify({ app: 'po-receipt', v: 1, settings: S, catalog: CAT, history: HIS, current: st }, null, 1)], { type: 'application/json' });
    download(blob, `PhieuNhapKho_SaoLuu_${GauBep.today()}.json`);
  };
  $('fileRestore').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'po-receipt') throw new Error('File sao lưu không đúng tool này');
      if (!confirm('Nạp bản sao lưu: cài đặt lấy theo file, danh mục hàng và các PO đã làm được GỘP vào dữ liệu đang có trên máy này. Tiếp tục?')) return;
      S = { ...DEF_SET, ...S, ...(d.settings || {}) }; CAT = { ...CAT, ...(d.catalog || {}) }; HIS = { ...HIS, ...(d.history || {}) };
      if (d.current && (d.current.items || []).length) { save(); st = { ...blank(), ...d.current }; }
      st.items.forEach(fillFromCatalog);
      saveSet(); saveCat(); store.set(K.his, HIS); renderSettings(); renderAll(); renderCatalog(); toast('Đã khôi phục 🐼');
    } catch (err) { toast(err.message); }
    e.target.value = '';
  };

  /* ======================= DANH MỤC HÀNG ======================= */
  function renderCatalog() {
    const q = up($('catSearch').value);
    const all = Object.entries(CAT).sort((a, b) => a[0].localeCompare(b[0]));
    const list = all.filter(([k, v]) => !q || k.includes(q) || up(v.name).includes(q) || up(v.code).includes(q));
    $('catInfo').textContent = `${all.length} mã${q ? ` · tìm thấy ${list.length}` : ''}${S.lastCatalog ? ` · lần nạp gần nhất: ${S.lastCatalog.file} (${S.lastCatalog.at})` : ''}`;
    if (document.activeElement !== $('cat_prefix')) $('cat_prefix').value = S.prefix || '';
    $('catBody').innerHTML = list.slice(0, 300).map(([k, v]) => `<tr data-m="${esc(k)}">
      <td><b>${esc(k)}</b></td><td><input class="w-md" data-ck="code" value="${esc(v.code)}"></td><td><input class="w-xl" data-ck="name" value="${esc(v.name)}"></td>
      <td><input class="w-xs in-num" data-ck="cbm" value="${v.cbm > 0 ? v.cbm : ''}"></td><td class="num">${v.price > 0 ? fmt.vnd(v.price) : ''}</td>
      <td class="muted">${v.misa ? '✅' : '—'}</td><td class="muted">${esc(vnDate(v.at))}</td>
      <td><button class="btn-x" data-del-cat="${esc(k)}">✕</button></td></tr>`).join('')
      + (list.length > 300 ? `<tr><td colspan="8" class="muted">… còn ${list.length - 300} mã, gõ ô tìm để lọc.</td></tr>` : '')
      || `<tr><td colspan="8" class="muted">Chưa có mã nào — nạp file data sản phẩm.</td></tr>`;
  }
  $('catSearch').addEventListener('input', renderCatalog);
  function setPrefix(v) {
    const old = up(S.prefix); S.prefix = String(v || '').trim(); saveSet();
    st.items.forEach((it) => { if (it.model && (up(it.code) === up(it.model) || up(it.code) === old + up(it.model))) it.code = codeOf(it.model); });
  }
  $('cat_prefix').addEventListener('change', () => { setPrefix($('cat_prefix').value); renderAll(); });
  $('catBody').addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-m]'); const k = e.target.dataset.ck; if (!tr || !k) return;
    CAT[tr.dataset.m][k] = k === 'cbm' ? parseNum(e.target.value) : e.target.value.trim(); saveCat();
  });
  $('catBody').addEventListener('click', (e) => {
    const k = e.target.dataset.delCat; if (!k) return;
    delete CAT[k]; saveCat(); renderCatalog();
  });
  /* Chưa đặt tiền tố mã hàng: lấy tiền tố chung của đa số mã trong danh sách MISA (vd "ABC-") */
  function detectPrefix(rows) {
    if (S.prefix) return;
    const cnt = {};
    rows.filter((r) => r.kind === 'misa').forEach((r) => { const m = r.code.match(/^([A-Z]{2,8}-)[A-Z0-9]/); if (m) cnt[m[1]] = (cnt[m[1]] || 0) + 1; });
    const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= rows.length * 0.5) { setPrefix(best[0]); renderSettings(); toast(`Đã nhận tiền tố mã hàng "${best[0]}" (sửa ở ⚙️ Cài đặt nếu sai)`); }
  }
  /* Nạp / cập nhật danh mục:
     - File data sản phẩm NCC (cột Model, Tên sản phẩm, CBM…): bản mới nhất quyết định SỐ KHỐI (ghi đè);
       tên lấy theo file này nếu mã chưa có tên từ danh sách MISA.
     - Danh sách hàng hoá MISA (cột Mã có tiền tố, Tên): quyết định MÃ HÀNG và TÊN HÀNG.
     Sau khi nạp, các dòng của PO đang làm được cập nhật số khối (nếu chưa sửa tay) và điền tên còn trống. */
  $('fileCatalog').onchange = async (e) => {
    const before = JSON.parse(JSON.stringify(CAT));
    let total = 0;
    for (const f of e.target.files) {
      try {
        const sheets = await readAoa(f); let n = 0, fresh = 0; const changed = [];
        sheets.forEach((sh) => { const rows = P.catalogSheet(sh.aoa); detectPrefix(rows); rows.forEach((r) => {
          const pre = up(S.prefix);
          const isMisa = r.kind === 'misa' || (pre && r.code.startsWith(pre));
          const model = modelOf(r.code);
          const cur = CAT[model] || {};
          const ow = isMisa ? ['code', 'name'] : ['cbm', 'price', ...(cur.misaList ? [] : ['name'])];
          const res = catLearn({ model, code: isMisa ? r.code : undefined, name: r.name, cbm: r.cbm, price: r.price,
            misa: isMisa, misaList: isMisa, src: isMisa ? cur.src : f.name }, ow);
          if (!res) return;
          n++; if (res.isNew) fresh++;
          res.changes.filter((c) => c[0] === 'cbm').forEach((c) => changed.push(`${model}: ${fmt.num(c[1], 4)} → ${fmt.num(c[2], 4)}`));
        }); });
        total += n;
        log(`📚 ${esc(f.name)}: ${n} mã — <b>${fresh}</b> mã mới, <b>${changed.length}</b> mã đổi số khối${changed.length ? ` (${esc(changed.slice(0, 8).join('; '))}${changed.length > 8 ? '…' : ''})` : ''}.`, n > 0);
        if (n) { S.lastCatalog = { file: f.name, at: new Date().toISOString().slice(0, 16).replace('T', ' ') }; saveSet(); }
      } catch (err) { log(`📚 ${esc(f.name)}: lỗi — ${esc(err.message)}`); }
    }
    // cập nhật PO đang làm theo danh mục mới
    let upd = 0;
    st.items.forEach((it) => {
      const c = catFind(it.model); if (!c) return;
      const old = before[it.model] || {};
      const cb = parseNum(it.cbm);
      if (c.cbm > 0 && (!(cb > 0) || Math.abs(cb - (old.cbm || 0)) < 1e-9) && Math.abs(cb - c.cbm) > 1e-9) { it.cbm = c.cbm; upd++; }
      if (!String(it.name || '').trim() && c.name) { it.name = c.name; upd++; }
      if (c.code && (!it.code || it.code === codeOf(it.model)) && it.code !== c.code) { it.code = c.code; upd++; }
    });
    if (upd) log(`🔄 Đã cập nhật ${upd} ô (số khối / tên / mã) của PO đang làm theo danh mục mới.`, true);
    saveCat(); e.target.value = ''; renderCatalog(); renderAll();
    toast(`Đã nạp ${total} mã vào danh mục 🐼`);
  };
  $('btnClearCatalog').onclick = () => { if (confirm('Xoá toàn bộ danh mục hàng trên máy này?')) { CAT = {}; saveCat(); renderCatalog(); renderAll(); } };
  $('btnCatalog').onclick = () => { renderCatalog(); $('catalogCard').hidden = false; $('catalogCard').scrollIntoView({ behavior: 'smooth' }); };
  $('btnCloseCatalog').onclick = () => { $('catalogCard').hidden = true; renderAll(); };

  if (!S.suppliers.length || !S.company) renderSettings();
  st.items.forEach(fillFromCatalog);
  renderAll();
})();
