/* =========================================================
   PA giá & Đề nghị thanh toán
   ---------------------------------------------------------
   Nhập chi phí của một lô hàng nhập khẩu (theo hoá đơn) →
     1) Bảng kê chi phí (nhóm: Phí làm hàng / Cước QT / Bảo hiểm)
     2) Phương án giá vốn từng mã hàng
     3) Phiếu đề nghị thanh toán cho từng người nhận

   CÔNG THỨC
   - Tiền VAT = lấy ĐÚNG số trên hoá đơn (nhập từ PDF/XML); gõ tay mà để trống → Phí -VAT × VAT% (không làm tròn)
   - +VAT = Phí -VAT + Tiền VAT
   - Tổng tiền hàng (USD) = Σ QTY × Đơn giá
   - % chi phí = (Σ Cước QT + Σ Phí làm hàng + Σ Bảo hiểm, đều TRƯỚC VAT) ÷ Tỷ giá PA ÷ Tổng tiền hàng
   - Giá vốn dự kiến = Đơn giá × (1 + % chi phí) × Tỷ giá PA × (1 + % thuế NK)
   - Giá vốn (NK theo CIF) = Đơn giá × Tỷ giá PA × (1 + % chi phí)
                            + Đơn giá × Tỷ giá tính thuế × (1 + % CIF) × % thuế NK
       với % CIF = Σ phí đánh dấu CIF ÷ Tỷ giá tính thuế ÷ Tổng tiền hàng
   - Đề nghị thanh toán: gộp theo Người nhận; các dòng cùng Số HĐ gộp thành 1 dòng (cộng +VAT);
     dòng không có HĐ đứng riêng.

   NHẬP HOÁ ĐƠN: invoice-parser.js đọc PDF (qua pdf.js) / XML → mỗi dòng hàng hoá dịch vụ thành 1 dòng phí.
   Người nhận TT tự chọn theo MST bên bán (danh bạ tự học khi người dùng đổi người nhận).

   BẢO MẬT: tên công ty, MST, logo, người đề nghị, danh bạ STK và dữ liệu lô
   CHỈ lưu trong localStorage của trình duyệt. Code không chứa dữ liệu thật.
   ========================================================= */
(function () {
  const { fmt, parseNum, store, toast } = GauBep;
  GauBep.mountLayout({ title: 'PA giá & Đề nghị thanh toán', icon: '🧾' });
  document.getElementById('bamboo').outerHTML = GauBep.bamboo();

  const KEY_SET = 'cost-payment-settings:v1';
  const KEY_LOT = 'cost-payment-lot:v1';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf2 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
  const mny = (n) => (isFinite(n) ? nf2.format(n) : '–');   // số tiền: giữ nguyên, tối đa 2 số lẻ
  const uid = () => Math.random().toString(36).slice(2, 9);

  const GROUPS = { KT: 'PHÍ KHAI THÁC HÀNG', OF: 'CƯỚC VẬN TẢI QT', BH: 'BẢO HIỂM HÀNG HOÁ' };
  const GROUP_SHORT = { KT: 'Phí làm hàng', OF: 'Cước QT', BH: 'Bảo hiểm' };
  const VATS = [['', 'Không HĐ'], ['0', '0%'], ['5', '5%'], ['8', '8%'], ['10', '10%']];

  /* ---------- Mẫu bảng kê gốc (chỉ tên phí chung, không có số thật) ---------- */
  const BASE_TEMPLATE = [
    ['KT', 'Phí cơ sở hạ tầng', '8'],
    ['KT', 'Phí đăng ký cont + chuyển bãi kiểm hoá', '8'],
    ['KT', 'Phí kiểm hoá', '8'],
    ['KT', 'Phí kiểm tra chất lượng + nhãn năng lượng', ''],
    ['KT', 'Phí xuống container', ''],
    ['KT', 'Phí trả cont rỗng về bãi (nâng hạ)', '8'],
    ['KT', 'Phí dịch vụ hải quan', '8'],
    ['KT', 'Phí vận tải nội địa (kéo cont)', '8'],
    ['KT', 'Phí xếp dỡ tại cảng (THC)', '8'],
    ['KT', 'Phí lệnh giao hàng (D/O)', '8'],
    ['KT', 'Phí hạ xa', '8'],
    ['OF', 'Cước vận tải biển', '0', true],
    ['OF', 'Phí local charge cảng đến', '8'],
    ['BH', 'Phí bảo hiểm hàng hoá', '10', true],
  ].map(([group, name, vat, cif]) => ({ group, name, vat, cif: !!cif }));

  const newFee = (o = {}) => ({ id: uid(), group: 'KT', name: '', pre: '', vat: '8', vatAmt: '', inv: '', date: '', note: '', payee: '', content: '', cif: false, pin: false, src: '', seller: '', sellerMst: '', desc: '', ...o });
  const newItem = (o = {}) => ({ id: uid(), code: '', name: '', color: '', qty: '', price: '', hs: '', nk: '', ...o });

  const DEFAULT_SETTINGS = {
    to: 'Ban Giám Đốc', requester: '', dept: 'XNK', city: 'TP. HCM',
    companies: [{ id: uid(), name: '', address: '', mst: '', logo: '' }],
    payees: [], template: null,
  };
  let S = { ...DEFAULT_SETTINGS, ...store.get(KEY_SET, {}) };
  if (!S.companies || !S.companies.length) S.companies = DEFAULT_SETTINGS.companies;
  let L = store.get(KEY_LOT, null) || makeLot();
  migrate(L);
  function migrate(lot) {           // bản cũ dùng "override" (+VAT gõ đè) → đổi sang Tiền VAT
    (lot.fees || []).forEach((f) => {
      if (f.vatAmt === undefined) f.vatAmt = String(f.override ?? '').trim() !== '' ? String(parseNum(f.override) - parseNum(f.pre)) : '';
      delete f.override;
    });
    S.payees.forEach((p) => { if (p.msts === undefined) p.msts = ''; });
    if (!S.nameGroup) S.nameGroup = {};
  }

  function makeLot(L0) {
    const tpl = S.template || BASE_TEMPLATE;
    return {
      code: '', port: '', cont: '', decl: '', rate: '', taxRate: '',
      warehouse: (L0 && L0.warehouse) || '', contact: (L0 && L0.contact) || '',
      companyId: (S.companies[0] || {}).id || '',
      items: [newItem()],
      fees: tpl.map((t) => newFee({
        group: t.group, name: t.name, vat: t.vat ?? '8', cif: !!t.cif, note: t.note || '',
        payee: t.payee || '', content: t.content || '', pin: !!t.pin, pre: t.pin ? t.pre || '' : '',
      })),
      dn: {},
    };
  }
  const saveSet = () => store.set(KEY_SET, S);
  const saveLot = () => store.set(KEY_LOT, L);

  /* ======================= TÍNH TOÁN ======================= */
  const autoVat = (f) => (f.vat === '' ? 0 : parseNum(f.pre) * parseNum(f.vat) / 100);
  const feeVat = (f) => (String(f.vatAmt ?? '').trim() !== '' ? parseNum(f.vatAmt) : autoVat(f));
  const feePost = (f) => parseNum(f.pre) + feeVat(f);

  function calc() {
    const rate = parseNum(L.rate), taxRate = parseNum(L.taxRate) || rate;
    const sum = { KT: 0, OF: 0, BH: 0 };
    let totalPre = 0, totalPost = 0, cifVnd = 0;
    L.fees.forEach((f) => {
      const pre = parseNum(f.pre);
      sum[f.group] = (sum[f.group] || 0) + pre;
      totalPre += pre; totalPost += feePost(f);
      if (f.cif) cifVnd += pre;
    });
    const fob = L.items.reduce((a, it) => a + parseNum(it.qty) * parseNum(it.price), 0);
    const qty = L.items.reduce((a, it) => a + parseNum(it.qty), 0);
    const costUsd = rate ? totalPre / rate : 0;
    const pct = fob ? costUsd / fob : 0;
    const cifPct = fob && taxRate ? cifVnd / taxRate / fob : 0;
    const items = L.items.map((it) => {
      const p = parseNum(it.price), nk = parseNum(it.nk) / 100;
      const has = String(it.price).trim() !== '';
      return {
        amount: parseNum(it.qty) * p,
        cost: has ? p * (1 + pct) * rate * (1 + nk) : null,
        costCif: has ? p * rate * (1 + pct) + p * taxRate * (1 + cifPct) * nk : null,
      };
    });
    return { rate, taxRate, sum, totalPre, totalPost, cifVnd, fob, qty, pct, cifPct, items };
  }

  /* Gộp đề nghị thanh toán theo người nhận */
  function buildPayments() {
    const by = new Map();
    L.fees.forEach((f) => {
      const post = feePost(f);
      if (!f.payee || (!parseNum(f.pre) && !post)) return;
      if (!by.has(f.payee)) by.set(f.payee, []);
      const lines = by.get(f.payee);
      const inv = String(f.inv).trim();
      const ex = inv && lines.find((l) => l.inv === inv);
      if (ex) { ex.amount += post; ex.fees.push(f); }
      else lines.push({ inv, amount: post, fees: [f] });
    });
    const lot = L.code ? ` - lô hàng ${L.code}` : '';
    return [...by.entries()].map(([payee, lines]) => ({
      payee,
      lines: lines.map((l) => {
        const custom = l.fees.find((f) => String(f.content).trim());
        const text = custom ? custom.content
          : l.fees.length > 1 ? joinNames(l) : l.fees[0].name;
        return { inv: l.inv, amount: l.amount, content: text + lot };
      }),
    }));
  }

  function joinNames(l) {
    const t = l.fees.map((f) => f.name).join(', ');
    return t.length <= 110 ? t : `Thanh toán HĐ ${l.inv} (${l.fees.length} khoản phí)`;
  }

  /* ======================= GIAO DIỆN: LÔ HÀNG ======================= */
  const lotFields = ['code', 'port', 'cont', 'decl', 'rate', 'taxRate', 'warehouse', 'contact'];
  function renderLot() {
    lotFields.forEach((k) => { $('lot_' + k).value = L[k] ?? ''; });
    $('lot_company').innerHTML = S.companies.map((c, i) =>
      `<option value="${c.id}">${esc(c.name || `Công ty ${i + 1} (chưa đặt tên)`)}</option>`).join('');
    $('lot_company').value = L.companyId;
  }
  lotFields.forEach((k) => $('lot_' + k).addEventListener('input', (e) => { L[k] = e.target.value; update(); }));
  $('lot_company').addEventListener('change', (e) => { L.companyId = e.target.value; update(); });

  /* ======================= HÀNG HOÁ ======================= */
  function renderItems() {
    $('itemBody').innerHTML = L.items.map((it, i) => `
      <tr data-i="${i}">
        <td><input data-k="code" value="${esc(it.code)}" style="width:110px"></td>
        <td><input data-k="name" value="${esc(it.name)}" style="width:240px"></td>
        <td><input data-k="color" value="${esc(it.color)}" style="width:100px"></td>
        <td><input data-k="qty" value="${esc(it.qty)}" class="in-num" inputmode="decimal" style="width:80px"></td>
        <td><input data-k="price" value="${esc(it.price)}" class="in-num" inputmode="decimal" style="width:90px"></td>
        <td class="num" data-out="amount"></td>
        <td><input data-k="hs" value="${esc(it.hs)}" style="width:95px"></td>
        <td><input data-k="nk" value="${esc(it.nk)}" class="in-num" inputmode="decimal" style="width:60px"></td>
        <td class="num strong" data-out="cost"></td>
        <td class="num" data-out="costCif"></td>
        <td class="no-print"><button class="btn btn-ghost btn-sm btn-icon" data-del title="Xoá">✕</button></td>
      </tr>`).join('');
  }
  $('itemBody').addEventListener('input', (e) => {
    const tr = e.target.closest('tr'); const k = e.target.dataset.k;
    if (!tr || !k) return;
    L.items[+tr.dataset.i][k] = e.target.value; update();
  });
  $('itemBody').addEventListener('click', (e) => {
    if (!e.target.closest('[data-del]')) return;
    L.items.splice(+e.target.closest('tr').dataset.i, 1);
    if (!L.items.length) L.items.push(newItem());
    renderItems(); update();
  });
  $('btnAddItem').onclick = () => { L.items.push(newItem()); renderItems(); update(); };

  /* ======================= BẢNG KÊ CHI PHÍ ======================= */
  const payeeOptions = (sel) => `<option value=""></option>` +
    S.payees.map((p) => `<option ${p.key === sel ? 'selected' : ''}>${esc(p.key)}</option>`).join('') +
    (sel && !S.payees.some((p) => p.key === sel) ? `<option selected>${esc(sel)}</option>` : '');

  function renderFees() {
    // giữ thứ tự nhóm: KT → OF → BH
    const order = { KT: 0, OF: 1, BH: 2 };
    L.fees.sort((a, b) => order[a.group] - order[b.group]);
    let lastG = null;
    $('feeBody').innerHTML = L.fees.map((f, i) => {
      const head = f.group !== lastG; lastG = f.group;
      return `
      <tr data-i="${i}" class="${head ? 'group-start' : ''}">
        <td><select data-k="group" class="grp">${Object.entries(GROUP_SHORT).map(([k, v]) => `<option value="${k}" ${k === f.group ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td><input data-k="name" value="${esc(f.name)}" list="feeNames" style="width:230px" title="${esc(f.desc || '')}">${f.src === 'inv' ? `<div class="src-tag">📄 ${esc(f.seller || '')}</div>` : ''}</td>
        <td><input data-k="pre" value="${esc(f.pre)}" class="in-num" inputmode="decimal" style="width:110px"></td>
        <td><select data-k="vat" style="width:105px">${(VATS.some(([v]) => v === String(f.vat)) ? VATS : [...VATS, [String(f.vat), f.vat + '%']]).map(([v, t]) => `<option value="${v}" ${v === String(f.vat) ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td><input data-k="vatAmt" value="${esc(f.vatAmt)}" class="in-num" inputmode="decimal" style="width:100px" data-out="vat"></td>
        <td class="num" data-out="post"></td>
        <td><input data-k="inv" value="${esc(f.inv)}" style="width:95px"></td>
        <td><input data-k="date" type="date" value="${esc(f.date)}" style="width:140px"></td>
        <td><input data-k="note" value="${esc(f.note)}" list="noteNames" style="width:130px"></td>
        <td><select data-k="payee" style="width:170px">${payeeOptions(f.payee)}</select></td>
        <td><input data-k="content" value="${esc(f.content)}" placeholder="(tự động)" style="width:220px"></td>
        <td class="center"><input type="checkbox" data-k="cif" ${f.cif ? 'checked' : ''}></td>
        <td class="center no-print"><input type="checkbox" data-k="pin" ${f.pin ? 'checked' : ''} title="Cố định số tiền cho lô mới"></td>
        <td class="no-print"><button class="btn btn-ghost btn-sm btn-icon" data-del title="Xoá">✕</button></td>
      </tr>`;
    }).join('');
    const names = new Set([...BASE_TEMPLATE.map((t) => t.name), ...(S.template || []).map((t) => t.name), ...L.fees.map((f) => f.name)]);
    $('feeNames').innerHTML = [...names].filter(Boolean).map((n) => `<option value="${esc(n)}">`).join('') ;
    if (!$('noteNames')) document.body.insertAdjacentHTML('beforeend',
      '<datalist id="noteNames"><option value="chi hộ"><option value="công nợ 30 ngày"><option value="dự kiến chưa có HĐ"></datalist>');
  }
  $('feeBody').addEventListener('input', onFeeEdit);
  $('feeBody').addEventListener('change', onFeeEdit);
  function onFeeEdit(e) {
    const tr = e.target.closest('tr'); const k = e.target.dataset.k;
    if (!tr || !k) return;
    const f = L.fees[+tr.dataset.i];
    f[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    // gõ tay: đổi phí hoặc thuế suất thì Tiền VAT tính lại (hoá đơn nhập từ file thì giữ đúng số HĐ)
    if ((k === 'pre' || k === 'vat') && f.src !== 'inv') { f.vatAmt = ''; const inp = tr.querySelector('[data-k="vatAmt"]'); if (inp) inp.value = ''; }
    if (e.type === 'change') {
      if (k === 'payee' && f.sellerMst) learnPayee(f.sellerMst, f.payee);
      if (k === 'group') { f.groupManual = true; if (f.src === 'inv') S.nameGroup[normName(f.name)] = f.group; saveSet(); renderFees(); }
    }
    update();
  }
  $('feeBody').addEventListener('click', (e) => {
    if (!e.target.closest('[data-del]')) return;
    L.fees.splice(+e.target.closest('tr').dataset.i, 1); renderFees(); update();
  });
  document.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => {
    const g = b.dataset.add;
    L.fees.push(newFee({ group: g, vat: g === 'OF' ? '0' : g === 'BH' ? '10' : '8' }));
    renderFees(); update();
    const rows = [...document.querySelectorAll('#feeBody tr')];
    const tr = rows.reverse().find((r) => L.fees[+r.dataset.i].group === g);
    tr && tr.querySelector('[data-k="name"]').focus();
  });

  /* ======================= CẬP NHẬT SỐ ======================= */
  function update() {
    saveLot();
    const c = calc();
    // hàng hoá
    document.querySelectorAll('#itemBody tr').forEach((tr) => {
      const r = c.items[+tr.dataset.i]; if (!r) return;
      tr.querySelector('[data-out="amount"]').textContent = r.amount ? fmt.num(r.amount, 2) : '';
      tr.querySelector('[data-out="cost"]').textContent = r.cost == null ? '' : mny(r.cost);
      tr.querySelector('[data-out="costCif"]').textContent = r.costCif == null ? '' : mny(r.costCif);
    });
    $('itemFoot').innerHTML = `<tr><td colspan="3">TỔNG</td><td class="num">${fmt.num(c.qty, 0)}</td><td></td>
      <td class="num">${fmt.num(c.fob, 2)}</td><td colspan="5"></td></tr>`;
    // bảng kê: Tiền VAT (để trống = tự tính, hiện mờ) và +VAT
    document.querySelectorAll('#feeBody tr').forEach((tr) => {
      const f = L.fees[+tr.dataset.i];
      const inp = tr.querySelector('[data-out="vat"]');
      inp.placeholder = parseNum(f.pre) && f.vat !== '' ? mny(autoVat(f)) : '';
      tr.querySelector('[data-out="post"]').textContent = parseNum(f.pre) ? mny(feePost(f)) : '';
    });
    $('feeFoot').innerHTML = `<tr><td colspan="2">TỔNG CỘNG</td><td class="num">${mny(c.totalPre)}</td><td></td>
      <td class="num">${mny(c.totalPost - c.totalPre)}</td><td class="num">${mny(c.totalPost)}</td><td colspan="8"></td></tr>`;
    $('feeKpis').innerHTML = `
      <div class="kpi"><div class="label">Phí làm hàng</div><div class="value">${mny(c.sum.KT)}</div></div>
      <div class="kpi"><div class="label">Cước vận tải QT</div><div class="value">${mny(c.sum.OF)}</div></div>
      <div class="kpi"><div class="label">Bảo hiểm</div><div class="value">${mny(c.sum.BH)}</div></div>
      <div class="kpi accent"><div class="label">Tổng trước VAT</div><div class="value">${mny(c.totalPre)}</div></div>`;
    $('paKpis').innerHTML = `
      <div class="kpi"><div class="label">Tổng tiền hàng</div><div class="value">${fmt.num(c.fob, 2)} $</div></div>
      <div class="kpi"><div class="label">Chi phí quy USD</div><div class="value">${fmt.num(c.rate ? c.totalPre / c.rate : 0, 2)} $</div></div>
      <div class="kpi accent"><div class="label">% chi phí / tiền hàng</div><div class="value">${fmt.pct(c.pct * 100, 2)}</div></div>
      <div class="kpi"><div class="label">% CIF (cước + BH)</div><div class="value">${fmt.pct(c.cifPct * 100, 2)}</div></div>`;
    renderDN();
    $('setupNote').hidden = !!(S.companies[0] && S.companies[0].name && S.requester);
  }

  /* ======================= ĐỀ NGHỊ THANH TOÁN ======================= */
  const dateVN = (d) => d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '';
  const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ROWS_MIN = 5;

  function dnState(payee) {
    if (!L.dn[payee]) {
      const p = S.payees.find((x) => x.key === payee);
      const due = new Date(); due.setDate(due.getDate() + (p && p.days !== '' && p.days != null ? parseNum(p.days) : 3));
      L.dn[payee] = { companyId: L.companyId, advance: '', due: isoDate(due) };
    }
    return L.dn[payee];
  }

  function renderDN() {
    const list = buildPayments();
    if (!list.length) { $('dnList').innerHTML = `<div class="note">🐼 Chưa có phiếu nào — chọn <b>Người nhận TT</b> cho các dòng phí ở bước 3.</div>`; return; }
    const today = dateVN(new Date());
    $('dnList').innerHTML = list.map((pm, idx) => {
      const st = dnState(pm.payee);
      const co = S.companies.find((c) => c.id === st.companyId) || S.companies[0] || {};
      const p = S.payees.find((x) => x.key === pm.payee) || {};
      const total = pm.lines.reduce((a, l) => a + l.amount, 0);
      const adv = parseNum(st.advance);
      const rows = [...pm.lines]; while (rows.length < ROWS_MIN) rows.push(null);
      const due = st.due ? dateVN(new Date(st.due + 'T00:00:00')) : '';
      return `
      <article class="dn-card" data-payee="${esc(pm.payee)}">
        <div class="dn-controls no-print">
          <b>${esc(pm.payee)}</b>
          <label>Công ty <select data-dn="companyId">${S.companies.map((c, i) => `<option value="${c.id}" ${c.id === co.id ? 'selected' : ''}>${esc(c.name || `Công ty ${i + 1}`)}</option>`).join('')}</select></label>
          <label>Đã tạm ứng <input data-dn="advance" value="${esc(st.advance)}" inputmode="decimal" style="width:120px"></label>
          <label>Thời hạn TT <input data-dn="due" type="date" value="${esc(st.due)}"></label>
          <button class="btn btn-primary btn-sm" data-print="${idx}">🖨️ In phiếu này</button>
          ${!p.key ? '<span class="warn">⚠ Chưa có trong danh bạ — thêm STK ở Cài đặt</span>' : ''}
          ${pm.lines.length > ROWS_MIN ? `<span class="warn">Có ${pm.lines.length} dòng</span>` : ''}
        </div>
        <div class="dn-paper">
          <div class="dn-head">
            ${co.logo ? `<img src="${co.logo}" alt="" class="dn-logo">` : '<span class="dn-logo"></span>'}
            <div class="dn-co"><b>${esc(co.name || '(Tên công ty – nhập ở Cài đặt)')}</b><br>${esc(co.address || '')}<br>${co.mst ? 'MST: ' + esc(co.mst) : ''}</div>
          </div>
          <h3 class="dn-title">GIẤY ĐỀ NGHỊ THANH TOÁN</h3>
          <div class="dn-date">${esc(S.city)}, ${today}</div>
          <table class="dn-info">
            <tr><td class="lbl">Kính gửi:</td><td colspan="3">${esc(S.to)}</td></tr>
            <tr><td class="lbl">Tôi tên:</td><td><b>${esc(S.requester)}</b></td><td class="lbl r">Bộ phận:</td><td>${esc(S.dept)}</td></tr>
            <tr><td colspan="4" class="lbl">Đề nghị thanh toán theo nội dung sau:</td></tr>
          </table>
          <table class="dn-table">
            <thead><tr><th style="width:42px">STT</th><th style="width:110px">Số hoá đơn</th><th>Nội dung</th><th style="width:130px" class="num">Số tiền</th></tr></thead>
            <tbody>${rows.map((l, i) => l
              ? `<tr><td class="center">${i + 1}</td><td class="center">${esc(l.inv)}</td><td class="wrap">${esc(l.content)}</td><td class="num">${mny(l.amount)}</td></tr>`
              : '<tr class="empty"><td>&nbsp;</td><td></td><td></td><td></td></tr>').join('')}</tbody>
            <tfoot>
              <tr><td colspan="3" class="center"><b>TỔNG CỘNG</b></td><td class="num"><b>${mny(total)}</b></td></tr>
              <tr class="plain"><td colspan="3" class="r">SỐ TIỀN ĐÃ TẠM ỨNG:</td><td class="num">${adv ? mny(adv) : '-'}</td></tr>
              <tr class="plain"><td colspan="3" class="r"><b>SỐ TIỀN CÒN LẠI PHẢI THANH TOÁN:</b></td><td class="num big"><b>${mny(total - adv)}</b></td></tr>
            </tfoot>
          </table>
          <table class="dn-info">
            <tr><td class="lbl">Hình thức TT:</td><td>Chuyển khoản</td></tr>
            <tr><td class="lbl">Chủ TK:</td><td><b>${esc(p.holder || '')}</b></td></tr>
            <tr><td class="lbl">Số tài khoản:</td><td><b>${esc(p.acc || '')}</b></td></tr>
            <tr><td class="lbl">Mở tại NH:</td><td><b>${esc(p.bank || '')}</b></td></tr>
            <tr><td class="lbl">Thời hạn TT:</td><td><b>${due}</b></td></tr>
          </table>
          <div class="dn-sign">
            <div><b>BGĐ</b><i>(Ký, ghi rõ họ tên)</i></div>
            <div><b>Phụ trách Kế toán</b><i>(Ký, ghi rõ họ tên)</i></div>
            <div><b>Phụ trách bộ phận</b><i>(Ký, ghi rõ họ tên)</i></div>
            <div><b>Người đề nghị</b><i>(Ký, ghi rõ họ tên)</i><span class="dn-name">${esc(S.requester)}</span></div>
          </div>
        </div>
      </article>`;
    }).join('');
  }
  $('dnList').addEventListener('change', (e) => {
    const k = e.target.dataset.dn; if (!k) return;
    const payee = e.target.closest('.dn-card').dataset.payee;
    dnState(payee)[k] = e.target.value; update();
  });
  $('dnList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-print]'); if (!b) return;
    printDN(b.closest('.dn-card'));
  });
  $('btnPrintAll').onclick = () => printDN(null);

  function printDN(card) {
    document.querySelectorAll('.dn-card').forEach((c) => c.classList.toggle('print-on', !card || c === card));
    document.body.dataset.print = 'dn';
    window.print();
  }
  $('btnPrintPa').onclick = () => { document.body.dataset.print = 'pa'; window.print(); };
  window.addEventListener('afterprint', () => { delete document.body.dataset.print; });

  /* ======================= CÀI ĐẶT ======================= */
  function renderSettings() {
    $('set_to').value = S.to; $('set_requester').value = S.requester; $('set_dept').value = S.dept; $('set_city').value = S.city;
    $('companyList').innerHTML = S.companies.map((c, i) => `
      <div class="company" data-i="${i}">
        <div class="company-logo">${c.logo ? `<img src="${c.logo}" alt="">` : '<span class="muted">Chưa có logo</span>'}
          <label class="btn btn-ghost btn-sm file-btn">🖼️ Logo<input type="file" accept="image/*" data-logo hidden></label>
          ${c.logo ? '<button class="btn btn-ghost btn-sm" data-unlogo>Bỏ logo</button>' : ''}
        </div>
        <div class="form-grid">
          <div class="field"><label>Tên công ty</label><input data-c="name" value="${esc(c.name)}"></div>
          <div class="field"><label>Địa chỉ</label><input data-c="address" value="${esc(c.address)}"></div>
          <div class="field"><label>Mã số thuế</label><input data-c="mst" value="${esc(c.mst)}"></div>
        </div>
        ${S.companies.length > 1 ? '<button class="btn btn-ghost btn-sm btn-icon" data-delco title="Xoá công ty">✕</button>' : ''}
      </div>`).join('');
    $('payeeBody').innerHTML = S.payees.map((p, i) => `
      <tr data-i="${i}">
        <td><input data-p="key" value="${esc(p.key)}" style="width:170px"></td>
        <td><input data-p="holder" value="${esc(p.holder)}" style="width:260px"></td>
        <td><input data-p="acc" value="${esc(p.acc)}" style="width:150px"></td>
        <td><input data-p="bank" value="${esc(p.bank)}" style="width:260px"></td>
        <td><input data-p="days" value="${esc(p.days)}" class="in-num" inputmode="numeric" style="width:70px"></td>
        <td><input data-p="msts" value="${esc(p.msts)}" placeholder="MST, cách nhau dấu phẩy" style="width:220px"></td>
        <td><button class="btn btn-ghost btn-sm btn-icon" data-delp title="Xoá">✕</button></td>
      </tr>`).join('');
    $('templateInfo').textContent = S.template ? `Đang dùng mẫu riêng (${S.template.length} dòng).` : 'Đang dùng mẫu gốc.';
  }
  ['to', 'requester', 'dept', 'city'].forEach((k) => $('set_' + k).addEventListener('input', (e) => { S[k] = e.target.value; saveSet(); update(); }));
  $('companyList').addEventListener('input', (e) => {
    const k = e.target.dataset.c; if (!k) return;
    S.companies[+e.target.closest('.company').dataset.i][k] = e.target.value; saveSet(); renderLot(); update();
  });
  $('companyList').addEventListener('change', (e) => {
    if (!e.target.hasAttribute('data-logo') || !e.target.files[0]) return;
    const i = +e.target.closest('.company').dataset.i;
    shrinkImage(e.target.files[0]).then((url) => { S.companies[i].logo = url; saveSet(); renderSettings(); update(); });
  });
  $('companyList').addEventListener('click', (e) => {
    const box = e.target.closest('.company'); if (!box) return;
    const i = +box.dataset.i;
    if (e.target.closest('[data-unlogo]')) { S.companies[i].logo = ''; }
    else if (e.target.closest('[data-delco]')) { if (!confirm('Xoá công ty này?')) return; S.companies.splice(i, 1); }
    else return;
    saveSet(); renderSettings(); renderLot(); update();
  });
  $('btnAddCompany').onclick = () => { S.companies.push({ id: uid(), name: '', address: '', mst: '', logo: '' }); saveSet(); renderSettings(); renderLot(); };
  $('payeeBody').addEventListener('input', (e) => {
    const k = e.target.dataset.p; if (!k) return;
    const p = S.payees[+e.target.closest('tr').dataset.i];
    const old = p.key; p[k] = e.target.value;
    if (k === 'key' && old) L.fees.forEach((f) => { if (f.payee === old) f.payee = p.key; });
    saveSet(); update();
  });
  $('payeeBody').addEventListener('change', (e) => { if (e.target.dataset.p === 'key') renderFees(); });
  $('payeeBody').addEventListener('click', (e) => {
    if (!e.target.closest('[data-delp]')) return;
    S.payees.splice(+e.target.closest('tr').dataset.i, 1); saveSet(); renderSettings(); renderFees(); update();
  });
  $('btnAddPayee').onclick = () => { S.payees.push({ key: '', holder: '', acc: '', bank: '', days: '3', msts: '' }); saveSet(); renderSettings(); };

  $('btnSettings').onclick = () => { renderSettings(); $('settingsCard').hidden = false; $('settingsCard').scrollIntoView({ behavior: 'smooth' }); };
  $('btnCloseSettings').onclick = () => { $('settingsCard').hidden = true; renderFees(); update(); };

  $('btnSaveTemplate').onclick = () => {
    S.template = L.fees.filter((f) => f.name).map((f) => ({
      group: f.group, name: f.name, vat: f.vat, cif: f.cif, note: f.note, payee: f.payee,
      content: f.content, pin: f.pin, pre: f.pin ? f.pre : '',
    }));
    saveSet(); renderSettings(); toast('Đã lưu mẫu bảng kê 🎋');
  };
  $('btnResetTemplate').onclick = () => { if (!confirm('Về mẫu bảng kê gốc?')) return; S.template = null; saveSet(); renderSettings(); };

  $('btnBackup').onclick = () => {
    const blob = new Blob([JSON.stringify({ app: 'cost-payment', v: 1, settings: S, lot: L }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `PAGia_SaoLuu_${GauBep.today()}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  $('fileBackup').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((t) => {
      const d = JSON.parse(t);
      if (d.app !== 'cost-payment') throw new Error('File không đúng');
      S = { ...DEFAULT_SETTINGS, ...d.settings }; if (d.lot) L = d.lot; migrate(L);
      saveSet(); saveLot(); renderAll(); renderSettings(); toast('Đã nạp bản sao lưu 🐼');
    }).catch(() => toast('Không đọc được file sao lưu')).finally(() => { e.target.value = ''; });
  };

  function shrinkImage(file) {
    return new Promise((res) => {
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const s = Math.min(1, 360 / img.width, 200 / img.height);
          const cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          res(cv.toDataURL('image/png'));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  /* ======================= NẠP TỜ KHAI ECUS ======================= */
  // Số trên tờ khai ECUS theo kiểu VN: 1.234.567,89
  const vnNum = (s) => { const t = String(s ?? '').trim().replace(/\s/g, ''); if (!/^-?[\d.,]+$/.test(t)) return NaN; return parseFloat(t.replace(/\./g, '').replace(',', '.')); };

  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('Không tải được thư viện Excel'));
      document.head.append(s);
    });
  }

  function parseEcus(rows) {
    const clean = (v) => String(v ?? '').trim();
    const after = (r, c) => rows[r].slice(c + 1).map(clean).filter(Boolean);
    const find = (label, from = 0, to = rows.length) => {
      for (let r = from; r < to; r++) {
        const c = rows[r].findIndex((v) => clean(v) === label);
        if (c >= 0) return { r, c, vals: after(r, c) };
      }
      return null;
    };
    const firstNum = (hit) => hit ? hit.vals.map(vnNum).find((n) => isFinite(n) && n > 0) : undefined;
    const out = {};
    const d = find('Số tờ khai'); if (d) out.decl = d.vals[0];
    const tr = find('Tỷ giá tính thuế'); out.taxRate = firstNum(tr);
    const port = find('Địa điểm xếp hàng'); if (port) out.port = port.vals[port.vals.length - 1];
    const cont = find('Số lượng container'); if (cont) out.cont = cont.vals[0];
    out.freight = firstNum(find('Phí vận chuyển'));
    out.insurance = firstNum(find('Phí bảo hiểm'));
    // dòng hàng: mỗi khối bắt đầu bằng ô "<01>", "<02>"…
    const starts = [];
    rows.forEach((row, r) => { if (row.some((v) => /^<\d{2,3}>$/.test(clean(v)))) starts.push(r); });
    out.items = starts.map((s, i) => {
      const end = starts[i + 1] ?? rows.length;
      const hs = find('Mã số hàng hóa', s, end);
      const desc = find('Mô tả hàng hóa', s, end);
      const qty = find('Số lượng (1)', s, end);
      const price = find('Đơn giá hóa đơn', s, end);
      const tax = find('Thuế suất', s, end);
      const text = desc ? desc.vals[0] || '' : '';
      const m = text.match(/^(.+?)\s*-\s+(.*)$/);
      return newItem({
        code: m ? m[1].trim() : '',
        name: (m ? m[2] : text).split(';')[0].trim(),
        hs: hs ? hs.vals[0] : '',
        qty: qty ? String(vnNum(qty.vals[0]) || '') : '',
        price: price ? String(vnNum(price.vals[0]) || '') : '',
        nk: tax ? String(vnNum((tax.vals.find((v) => /%$/.test(v)) || '').replace('%', '')) || 0) : '',
      });
    });
    return out;
  }

  $('fileEcus').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importEcus(f); };
  async function importEcus(file) {
    try {
      const XLSX = await loadSheetJS();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      const t = parseEcus(rows);
      if (!t.items.length && !t.decl) throw new Error('Không nhận ra tờ khai ECUS');
      const hasItems = L.items.some((it) => it.code || it.price);
      if (t.items.length && (!hasItems || confirm(`Thay danh sách hàng hiện tại bằng ${t.items.length} dòng hàng từ tờ khai?`))) L.items = t.items;
      if (t.decl) L.decl = t.decl;
      if (t.taxRate) L.taxRate = String(t.taxRate);
      if (t.port && !L.port) L.port = t.port;
      if (t.cont && !L.cont) L.cont = `${t.cont} CONT`;
      const fill = (group, amount) => {
        if (!amount) return;
        const f = L.fees.find((x) => x.group === group && x.cif) || L.fees.find((x) => x.group === group);
        if (f && !parseNum(f.pre)) { f.pre = String(amount); f.cif = true; }
      };
      fill('OF', t.freight); fill('BH', t.insurance);
      renderAll();
      toast(`Đã nạp tờ khai: ${t.items.length} dòng hàng${t.freight ? ', cước' : ''}${t.insurance ? ', bảo hiểm' : ''} 🐼`);
    } catch (err) {
      toast(err.message || 'Không đọc được file');
    }
  }

  /* ======================= NHẬP HOÁ ĐƠN PDF / XML ======================= */
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = PDFJS + 'pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; res(window.pdfjsLib); };
      s.onerror = () => rej(new Error('Không tải được thư viện đọc PDF (kiểm tra mạng)'));
      document.head.append(s);
    });
  }
  async function readPdf(file) {
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      pages.push(tc.items.map((t) => ({ s: t.str, x: t.transform[4], y: t.transform[5], w: t.width, h: Math.hypot(t.transform[2], t.transform[3]) || t.height })));
    }
    return InvoiceParser.fromPdfPages(pages);
  }

  const normName = (s) => String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/^\s*(phụ\s*)?phí\s+/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const sameName = (a, b) => {
    const x = normName(a), y = normName(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const [sh, lg] = x.length < y.length ? [x, y] : [y, x];
    return sh.length >= 6 && lg.includes(sh) && sh.length / lg.length >= 0.7;   // gần như trùng tên
  };
  const mstList = (p) => String(p.msts || '').split(/[,;\s]+/).filter(Boolean);
  const shortName = (n) => String(n || '').replace(/^(TỔNG\s+)?CÔNG\s*TY\s*/i, '').replace(/^(TNHH|CỔ\s*PHẦN|CP)\s*(MTV\s*)?/i, '')
    .replace(/\s*-?\s*CHI\s*NHÁNH.*$/i, '').replace(/\s+/g, ' ').trim() || n;

  function learnPayee(mst, key) {            // hoá đơn của MST này từ nay gán cho người nhận "key"
    S.payees.forEach((p) => { p.msts = mstList(p).filter((m) => m !== mst).join(', '); });
    const p = S.payees.find((x) => x.key === key);
    if (p) { p.msts = [...mstList(p), mst].join(', '); toast(`Đã nhớ: hoá đơn MST ${mst} → ${key}`); }
    saveSet();
  }
  function payeeFor(inv) {
    if (!inv.sellerMst) return '';
    const hit = S.payees.find((p) => mstList(p).includes(inv.sellerMst));
    if (hit) return hit.key;
    let key = shortName(inv.seller) || inv.sellerMst; let n = 2;
    while (S.payees.some((p) => p.key === key)) key = `${shortName(inv.seller)} (${n++})`;
    S.payees.push({ key, holder: inv.seller || '', acc: inv.bankAcc || '', bank: inv.bankName || '', days: '30', msts: inv.sellerMst });
    saveSet();
    return key;
  }
  function groupFor(desc) {
    const learned = S.nameGroup[normName(desc)];
    if (learned) return learned;
    if (/bảo\s*hiểm|\bICC\b/i.test(desc)) return 'BH';
    if (/cước\s*(vận\s*(tải|chuyển)\s*)?(biển|quốc\s*tế)|ocean|sea\s*freight/i.test(desc)) return 'OF';
    return 'KT';
  }
  function cleanName(desc, group) {
    let n = String(desc || '').replace(/\s*(Tuyến\s*đường|BKS|Biển\s*số|Số\s*con'?t|\(Số\s*hiệu|Số\s*hiệu\s*tàu)[\s\S]*$/i, '').trim();
    n = n.replace(/\s+\S*\d+\/\d+\/\S*/g, '').trim();                       // bỏ số đơn bảo hiểm / chứng từ
    if (group === 'BH' && !/bảo\s*hiểm/i.test(n)) n = `Phí bảo hiểm hàng hoá (${n})`;
    return n || desc;
  }

  let batchId = 0;
  function addInvoice(inv, fileName) {
    const log = { file: fileName, inv };
    if (!inv.lines.length) { log.status = 'err'; log.msg = inv.warnings.join('; ') || 'Không đọc được'; return log; }
    if (L.fees.some((f) => f.src === 'inv' && f.inv === inv.no && f.sellerMst === inv.sellerMst)) {
      log.status = 'dup'; log.msg = 'Hoá đơn này đã có trong bảng kê'; return log;
    }
    const co = S.companies.find((c) => c.id === L.companyId);
    if (co && co.mst && inv.buyerMst && co.mst.replace(/\D/g, '') !== inv.buyerMst.replace(/\D/g, '')) log.warn = `MST người mua ${inv.buyerMst} khác công ty đang chọn`;
    const payee = payeeFor(inv);
    inv.lines.forEach((ln) => {
      const group = groupFor(ln.desc);
      const name = cleanName(ln.desc, group);
      const cif = (group === 'OF' && /cước/i.test(ln.desc)) || group === 'BH';
      const data = {
        group, name, pre: String(ln.pre), vat: ln.rate == null ? '' : String(ln.rate), vatAmt: String(ln.vat),
        inv: inv.no, date: inv.date || '', payee, src: 'inv', batch: batchId, learned: !!S.nameGroup[normName(ln.desc)], seller: shortName(inv.seller), sellerMst: inv.sellerMst, desc: ln.desc, cif,
      };
      // ưu tiên điền vào dòng mẫu còn trống (cùng tên / dòng cước-bảo hiểm đã có số từ tờ khai)
      const empty = (f) => f.src !== 'inv' && !String(f.inv).trim();
      const slot = L.fees.find((f) => empty(f) && !parseNum(f.pre) && sameName(f.name, name))
        || (cif && L.fees.find((f) => empty(f) && f.group === group && f.cif && (!parseNum(f.pre) || near(parseNum(f.pre), ln.pre))))
        || L.fees.find((f) => empty(f) && f.pin === false && parseNum(f.pre) && near(parseNum(f.pre), ln.pre) && sameName(f.name, name));
      if (slot) {
        const keep = { note: slot.note, content: slot.content, pin: false };
        Object.assign(slot, data, keep, { name: slot.name || name });
      } else L.fees.push(newFee(data));
    });
    log.status = inv.check === false ? 'warn' : 'ok';
    log.payee = payee;
    return log;
  }
  const near = (a, b) => Math.abs(a - b) < 0.005;

  /* Hoá đơn phí nội địa (local charge) xuất CÙNG NGÀY, CÙNG bên bán với hoá đơn cước biển
     → xếp vào nhóm CƯỚC VẬN TẢI QT (giống cách làm bảng kê gốc). Nhóm người dùng đã chỉnh/đã học thì giữ nguyên. */
  function regroupLocalCharges() {
    const freight = L.fees.filter((f) => f.src === 'inv' && f.group === 'OF' && f.cif);
    L.fees.forEach((f) => {
      if (f.batch !== batchId || f.group !== 'KT' || f.learned || f.groupManual) return;
      if (freight.some((x) => x.sellerMst === f.sellerMst && x.date && x.date === f.date && x.inv !== f.inv)) f.group = 'OF';
    });
  }

  let importLog = [];
  async function importFiles(files) {
    files = [...files];
    if (!files.length) return;
    const xlsx = files.filter((f) => /\.xlsx?$/i.test(f.name));
    const invs = files.filter((f) => /\.(pdf|xml)$/i.test(f.name));
    for (const f of xlsx) await importEcus(f);
    if (!invs.length) return;
    toast(`Đang đọc ${invs.length} hoá đơn…`);
    const logs = [];
    batchId = Date.now();
    for (const f of invs) {
      try {
        const inv = /\.xml$/i.test(f.name) ? InvoiceParser.fromXml(await f.text()) : await readPdf(f);
        logs.push(addInvoice(inv, f.name));
      } catch (err) {
        logs.push({ file: f.name, status: 'err', msg: err.message || 'Không đọc được file' });
      }
    }
    regroupLocalCharges();
    importLog = logs.concat(importLog).slice(0, 30);
    saveLot(); renderFees(); update(); renderImportLog();
    const ok = logs.filter((l) => l.status === 'ok' || l.status === 'warn').length;
    toast(`Đã nhập ${ok}/${invs.length} hoá đơn 🐼`);
  }
  function renderImportLog() {
    const icon = { ok: '✅', warn: '⚠️', dup: '↩️', err: '❌' };
    $('importLog').innerHTML = importLog.length ? `
      <div class="log-head"><b>Hoá đơn vừa nhập</b><button class="btn btn-ghost btn-sm" id="btnClearLog">Ẩn</button></div>
      ${importLog.map((l) => {
        const i = l.inv || {};
        return `<div class="log-row ${l.status}">${icon[l.status]} <b>${esc(i.no || l.file)}</b>
          ${i.seller ? ' · ' + esc(shortName(i.seller)) : ''}${i.date ? ' · ' + esc(dateVN(new Date(i.date + 'T00:00:00'))) : ''}
          ${i.lines && i.lines.length ? ` · ${i.lines.length} dòng · <b>${mny(i.sum)}</b>` : ''}
          ${l.status === 'ok' ? ' · khớp tổng hoá đơn' : ''}${l.payee ? ' → ' + esc(l.payee) : ''}
          ${l.msg ? ` <span class="muted">— ${esc(l.msg)}</span>` : ''}
          ${l.status === 'warn' ? ` <span class="warn">— Tổng các dòng ${mny(i.sum)} ≠ tổng HĐ ${mny(i.total)}, kiểm tra lại</span>` : ''}
          ${l.warn ? ` <span class="warn">— ${esc(l.warn)}</span>` : ''}</div>`;
      }).join('')}` : '';
    const b = $('btnClearLog'); if (b) b.onclick = () => { importLog = []; renderImportLog(); };
  }
  ['fileInvoice', 'fileInvoice2'].forEach((id) => $(id).addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; importFiles(fs); }));
  // kéo thả: cả trang đều nhận file
  const dz = $('dropzone');
  ['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault(); dz.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => {
    if (ev === 'dragleave' && e.relatedTarget) return;
    dz.classList.remove('over');
  }));
  document.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault(); importFiles(e.dataTransfer.files);
  });

  /* ======================= XUẤT EXCEL ======================= */
  /* Xuất Excel đúng cấu trúc file PA giá gốc (export-xlsx.js, thư viện ExcelJS tải lười từ cdnjs) */
  function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
      s.onload = () => res(window.ExcelJS); s.onerror = () => rej(new Error('Không tải được thư viện Excel (kiểm tra mạng)'));
      document.head.append(s);
    });
  }
  const imgSize = (url) => new Promise((res) => { const i = new Image(); i.onload = () => res([i.width, i.height]); i.onerror = () => res([0, 0]); i.src = url; });

  $('btnExport').onclick = async () => {
    try {
      const c = calc();
      const bankInfo = (p) => (p ? [p.holder && `Tên TK: ${p.holder}`, p.acc && `TK số: ${p.acc}`, p.bank && `Tại ${p.bank}`].filter(Boolean).join(' – ') : '');
      const fees = L.fees.filter((f) => String(f.name).trim() || parseNum(f.pre)).map((f) => {
        const p = S.payees.find((x) => x.key === f.payee);
        const inv = String(f.inv).trim();
        const noteType = /dự kiến/i.test(f.note) ? 'dự kiến cp chưa có hoá đơn' : inv || f.vat !== '' ? 'có hoá đơn' : 'không hoá đơn';
        return {
          group: f.group, name: f.name, pre: parseNum(f.pre), post: feePost(f), vatNo: f.vat, inv, date: f.date,
          note: /dự kiến/i.test(f.note) ? '' : f.note, noteType, payee: f.payee, payeeInfo: bankInfo(p) || f.payee,
        };
      });
      const items = L.items.filter((it) => it.code || it.name || String(it.price).trim()).map((it) => ({
        code: it.code, name: it.name, color: it.color, qty: parseNum(it.qty), price: parseNum(it.price), hs: it.hs, nk: parseNum(it.nk),
      }));
      const dn = [];
      for (const pm of buildPayments()) {
        const st = dnState(pm.payee);
        const co = S.companies.find((x) => x.id === st.companyId) || S.companies[0] || {};
        const p = S.payees.find((x) => x.key === pm.payee) || {};
        const [lw, lh] = co.logo ? await imgSize(co.logo) : [0, 0];
        dn.push({
          sheet: pm.payee, company: co, logo: co.logo, logoW: lw, logoH: lh, to: S.to, requester: S.requester, dept: S.dept, city: S.city,
          date: new Date(), lines: pm.lines, advance: parseNum(st.advance), holder: p.holder || pm.payee, acc: p.acc || '', bank: p.bank || '',
          due: st.due ? new Date(st.due + 'T00:00:00Z') : '',
        });
      }
      const ExcelJS = await loadExcelJS();
      const wb = CostPaymentExport.build(ExcelJS, { lot: L, rate: c.rate, items, fees, dn });
      const buf = await wb.xlsx.writeBuffer();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = `PAGia_${(L.code || 'lo').replace(/[^\w-]+/g, '')}_${GauBep.today()}.xlsx`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Đã xuất file Excel 🎉');
    } catch (err) {
      toast(err.message || 'Không xuất được file');
    }
  };

  /* ======================= LÔ MỚI / MẪU / LÀM MỚI ======================= */
  $('btnNewLot').onclick = () => {
    if (!confirm('Tạo lô mới? Dữ liệu lô hiện tại sẽ bị thay (nên Xuất Excel trước). Cài đặt & danh bạ giữ nguyên.')) return;
    L = makeLot(L); saveLot(); renderAll(); toast('Lô mới đã sẵn sàng ✨');
  };

  $('btnSample').onclick = () => {
    if (!confirm('Nạp dữ liệu ví dụ? Dữ liệu lô hiện tại sẽ bị thay.')) return;
    const sp = [
      { key: 'VD Forwarder', holder: 'CÔNG TY VẬN TẢI VÍ DỤ', acc: '0000000001', bank: 'Ngân hàng Ví dụ', days: '30' },
      { key: 'VD Chi hộ', holder: 'NGUYỄN VĂN VÍ DỤ', acc: '0000000002', bank: 'Ngân hàng Ví dụ', days: '3' },
      { key: 'VD Bảo hiểm', holder: 'CÔNG TY BẢO HIỂM VÍ DỤ', acc: '0000000003', bank: 'Ngân hàng Ví dụ', days: '30' },
    ];
    sp.forEach((p) => { if (!S.payees.some((x) => x.key === p.key)) S.payees.push(p); });
    saveSet();
    L = {
      code: 'VD-PO-001', port: 'NINGBO', cont: "1 CONT 40'", decl: 'VD-0001', rate: '26500', taxRate: '25800',
      companyId: (S.companies[0] || {}).id, dn: {},
      items: [
        newItem({ code: 'VD-FAN-01', name: 'Quạt đứng (ví dụ)', color: 'Trắng', qty: '1000', price: '15', hs: '84145191', nk: '15' }),
        newItem({ code: 'VD-FAN-02', name: 'Quạt bàn (ví dụ)', color: 'Đen', qty: '500', price: '9.5', hs: '84145191', nk: '15' }),
      ],
      fees: [
        newFee({ name: 'Phí đăng ký cont + chuyển bãi kiểm hoá', pre: '800000', vat: '8', inv: 'VD101', note: 'chi hộ', payee: 'VD Chi hộ' }),
        newFee({ name: 'Phí kiểm tra chất lượng + nhãn năng lượng', pre: '1000000', vat: '', payee: 'VD Chi hộ', pin: true }),
        newFee({ name: 'Phí trả cont rỗng về bãi (nâng hạ)', pre: '1800000', vat: '8', inv: 'VD102', note: 'chi hộ', payee: 'VD Chi hộ' }),
        newFee({ name: 'Phí dịch vụ hải quan', pre: '800000', vat: '8', inv: 'VD201', note: 'công nợ 30 ngày', payee: 'VD Forwarder', content: 'Phí dịch vụ HQ, vận tải nội địa, THC, D/O' }),
        newFee({ name: 'Phí vận tải nội địa (kéo cont)', pre: '3000000', vat: '8', inv: 'VD201', note: 'công nợ 30 ngày', payee: 'VD Forwarder' }),
        newFee({ name: 'Phí xếp dỡ tại cảng (THC)', pre: '4500000', vat: '8', inv: 'VD201', note: 'công nợ 30 ngày', payee: 'VD Forwarder' }),
        newFee({ name: 'Phí lệnh giao hàng (D/O)', pre: '1000000', vat: '8', inv: 'VD201', note: 'công nợ 30 ngày', payee: 'VD Forwarder' }),
        newFee({ group: 'OF', name: 'Cước vận tải biển', pre: '40000000', vat: '0', inv: 'VD202', note: 'công nợ 30 ngày', payee: 'VD Forwarder', cif: true }),
        newFee({ group: 'BH', name: 'Phí bảo hiểm hàng hoá', pre: '350000', vat: '10', inv: 'VD301', payee: 'VD Bảo hiểm', cif: true }),
      ],
    };
    saveLot(); renderAll(); toast('Đã nạp dữ liệu ví dụ 🐼');
  };

  function renderAll() { renderLot(); renderItems(); renderFees(); update(); }
  renderAll();
})();
