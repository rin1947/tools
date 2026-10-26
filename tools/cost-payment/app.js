/* =========================================================
   PA giá & Đề nghị thanh toán
   ---------------------------------------------------------
   Nhập chi phí của một lô hàng nhập khẩu (theo hoá đơn) →
     1) Bảng kê chi phí (nhóm: Phí làm hàng / Cước QT / Bảo hiểm)
     2) Phương án giá vốn từng mã hàng
     3) Phiếu đề nghị thanh toán cho từng người nhận

   CÔNG THỨC
   - +VAT một dòng phí = Phí -VAT + ROUND(Phí -VAT × VAT%)   (gõ đè được nếu HĐ lệch do làm tròn)
   - Tổng tiền hàng (USD) = Σ QTY × Đơn giá
   - % chi phí = (Σ Cước QT + Σ Phí làm hàng + Σ Bảo hiểm, đều TRƯỚC VAT) ÷ Tỷ giá PA ÷ Tổng tiền hàng
   - Giá vốn dự kiến = Đơn giá × (1 + % chi phí) × Tỷ giá PA × (1 + % thuế NK)
   - Giá vốn (NK theo CIF) = Đơn giá × Tỷ giá PA × (1 + % chi phí)
                            + Đơn giá × Tỷ giá tính thuế × (1 + % CIF) × % thuế NK
       với % CIF = Σ phí đánh dấu CIF ÷ Tỷ giá tính thuế ÷ Tổng tiền hàng
   - Đề nghị thanh toán: gộp theo Người nhận; các dòng cùng Số HĐ gộp thành 1 dòng (cộng +VAT);
     dòng không có HĐ đứng riêng.

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

  const newFee = (o = {}) => ({ id: uid(), group: 'KT', name: '', pre: '', vat: '8', override: '', inv: '', date: '', note: '', payee: '', content: '', cif: false, pin: false, ...o });
  const newItem = (o = {}) => ({ id: uid(), code: '', name: '', color: '', qty: '', price: '', hs: '', nk: '', ...o });

  const DEFAULT_SETTINGS = {
    to: 'Ban Giám Đốc', requester: '', dept: 'XNK', city: 'TP. HCM',
    companies: [{ id: uid(), name: '', address: '', mst: '', logo: '' }],
    payees: [], template: null,
  };
  let S = { ...DEFAULT_SETTINGS, ...store.get(KEY_SET, {}) };
  if (!S.companies || !S.companies.length) S.companies = DEFAULT_SETTINGS.companies;
  let L = store.get(KEY_LOT, null) || makeLot();

  function makeLot() {
    const tpl = S.template || BASE_TEMPLATE;
    return {
      code: '', port: '', cont: '', decl: '', rate: '', taxRate: '',
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
  const feePost = (f) => {
    if (String(f.override).trim() !== '') return parseNum(f.override);
    const pre = parseNum(f.pre);
    return pre + Math.round(pre * (f.vat === '' ? 0 : parseNum(f.vat)) / 100);
  };

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
          : l.fees.length > 1 ? `Thanh toán HĐ ${l.inv} (${l.fees.length} khoản phí)` : l.fees[0].name;
        return { inv: l.inv, amount: l.amount, content: text + lot };
      }),
    }));
  }

  /* ======================= GIAO DIỆN: LÔ HÀNG ======================= */
  const lotFields = ['code', 'port', 'cont', 'decl', 'rate', 'taxRate'];
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
        <td><input data-k="name" value="${esc(f.name)}" list="feeNames" style="width:230px"></td>
        <td><input data-k="pre" value="${esc(f.pre)}" class="in-num" inputmode="decimal" style="width:110px"></td>
        <td><select data-k="vat" style="width:105px">${VATS.map(([v, t]) => `<option value="${v}" ${v === String(f.vat) ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td><input data-k="override" value="${esc(f.override)}" class="in-num" inputmode="decimal" style="width:110px" data-out="post"></td>
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
    if (k === 'override') e.target.dataset.typed = '1';
    if (k === 'group' && e.type === 'change') { renderFees(); }
    update();
  }
  $('feeBody').addEventListener('focusout', (e) => {
    // ô +VAT: nếu người dùng gõ đúng bằng số tự tính thì bỏ "gõ đè"
    if (e.target.dataset.k !== 'override') return;
    const f = L.fees[+e.target.closest('tr').dataset.i];
    const auto = parseNum(f.pre) + Math.round(parseNum(f.pre) * (f.vat === '' ? 0 : parseNum(f.vat)) / 100);
    if (String(f.override).trim() === '' || parseNum(f.override) === auto) { f.override = ''; update(); }
  });
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
      tr.querySelector('[data-out="cost"]').textContent = r.cost == null ? '' : fmt.vnd(r.cost);
      tr.querySelector('[data-out="costCif"]').textContent = r.costCif == null ? '' : fmt.vnd(r.costCif);
    });
    $('itemFoot').innerHTML = `<tr><td colspan="3">TỔNG</td><td class="num">${fmt.num(c.qty, 0)}</td><td></td>
      <td class="num">${fmt.num(c.fob, 2)}</td><td colspan="5"></td></tr>`;
    // bảng kê: ô +VAT hiển thị số tự tính khi chưa gõ đè
    document.querySelectorAll('#feeBody tr').forEach((tr) => {
      const f = L.fees[+tr.dataset.i]; const inp = tr.querySelector('[data-out="post"]');
      if (document.activeElement === inp) return;
      const post = feePost(f);
      inp.value = String(f.override).trim() !== '' ? f.override : (post ? fmt.vnd(post) : '');
      inp.classList.toggle('overridden', String(f.override).trim() !== '');
    });
    $('feeFoot').innerHTML = `<tr><td colspan="2">TỔNG CỘNG</td><td class="num">${fmt.vnd(c.totalPre)}</td><td></td>
      <td class="num">${fmt.vnd(c.totalPost)}</td><td colspan="8"></td></tr>`;
    $('feeKpis').innerHTML = `
      <div class="kpi"><div class="label">Phí làm hàng</div><div class="value">${fmt.vnd(c.sum.KT)}</div></div>
      <div class="kpi"><div class="label">Cước vận tải QT</div><div class="value">${fmt.vnd(c.sum.OF)}</div></div>
      <div class="kpi"><div class="label">Bảo hiểm</div><div class="value">${fmt.vnd(c.sum.BH)}</div></div>
      <div class="kpi accent"><div class="label">Tổng trước VAT</div><div class="value">${fmt.vnd(c.totalPre)}</div></div>`;
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
              ? `<tr><td class="center">${i + 1}</td><td class="center">${esc(l.inv)}</td><td class="wrap">${esc(l.content)}</td><td class="num">${fmt.vnd(l.amount)}</td></tr>`
              : '<tr class="empty"><td>&nbsp;</td><td></td><td></td><td></td></tr>').join('')}</tbody>
            <tfoot>
              <tr><td colspan="3" class="center"><b>TỔNG CỘNG</b></td><td class="num"><b>${fmt.vnd(total)}</b></td></tr>
              <tr class="plain"><td colspan="3" class="r">SỐ TIỀN ĐÃ TẠM ỨNG:</td><td class="num">${adv ? fmt.vnd(adv) : '-'}</td></tr>
              <tr class="plain"><td colspan="3" class="r"><b>SỐ TIỀN CÒN LẠI PHẢI THANH TOÁN:</b></td><td class="num big"><b>${fmt.vnd(total - adv)}</b></td></tr>
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
  $('btnAddPayee').onclick = () => { S.payees.push({ key: '', holder: '', acc: '', bank: '', days: '3' }); saveSet(); renderSettings(); };

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
      S = { ...DEFAULT_SETTINGS, ...d.settings }; if (d.lot) L = d.lot;
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

  $('fileEcus').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
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
    } finally { e.target.value = ''; }
  };

  /* ======================= XUẤT EXCEL ======================= */
  $('btnExport').onclick = () => {
    const c = calc();
    const sheets = [];
    const bk = [['LÔ HÀNG', L.code], ['SỐ LƯỢNG CONT', L.cont], ['CẢNG ĐI', L.port], ['SỐ TỜ KHAI', L.decl], [],
      ['NHÓM', 'LOẠI PHÍ', 'PHÍ -VAT', 'VAT %', '+VAT', 'NOTE/Ghi chú', 'Hoá đơn số', 'Ngày hoá đơn', 'Người nhận TT', 'Thông tin chuyển khoản']];
    L.fees.forEach((f) => {
      const p = S.payees.find((x) => x.key === f.payee);
      bk.push([GROUPS[f.group], f.name, parseNum(f.pre) || null, f.vat === '' ? 'không HĐ' : parseNum(f.vat) / 100,
        feePost(f) || null, f.note, f.inv, f.date ? dateVN(new Date(f.date + 'T00:00:00')) : '', f.payee,
        p ? [p.holder, p.acc && 'STK: ' + p.acc, p.bank].filter(Boolean).join(' - ') : '']);
    });
    bk.push(['TỔNG CỘNG', '', c.totalPre, '', c.totalPost]);
    sheets.push({ name: 'BẢNG KÊ CHI PHÍ', rows: bk, colWidths: [22, 36, 14, 9, 14, 18, 13, 13, 22, 50] });

    const pa = [['PHƯƠNG ÁN GIÁ'], ['CẢNG ĐI:', L.port], ['LÔ HÀNG:', L.code], ['TỶ GIÁ:', c.rate], ['CONTAINER QTY', L.cont], [],
      ['ITEM CODE', 'Tên hàng', 'Color', 'QTY', 'UNIT PRICE', 'TOTAL AMOUNT', 'Hs code', '% Thuế NK', 'GIÁ VỐN DỰ KIẾN', 'GIÁ VỐN (NK theo CIF)']];
    L.items.forEach((it, i) => {
      if (!it.code && !it.price) return;
      const r = c.items[i];
      pa.push([it.code, it.name, it.color, parseNum(it.qty), parseNum(it.price), r.amount, it.hs, parseNum(it.nk) / 100,
        r.cost == null ? null : Math.round(r.cost), r.costCif == null ? null : Math.round(r.costCif)]);
    });
    pa.push(['', '', 'TỔNG', c.qty, '', c.fob], [],
      ['', '', '', '', 'OF', c.rate ? c.sum.OF / c.rate : 0],
      ['', '', '', '', 'PHÍ LÀM HÀNG & KÉO HÀNG', c.rate ? c.sum.KT / c.rate : 0],
      ['', '', '', '', 'PHÍ BH', c.rate ? c.sum.BH / c.rate : 0],
      ['', '', '', '', 'TOTAL', c.rate ? c.totalPre / c.rate : 0],
      ['', '', '', '', '%', c.pct]);
    sheets.push({ name: 'PHƯƠNG ÁN GIÁ', rows: pa, colWidths: [14, 40, 18, 8, 12, 14, 12, 10, 16, 18] });

    buildPayments().forEach((pm) => {
      const st = dnState(pm.payee);
      const co = S.companies.find((x) => x.id === st.companyId) || {};
      const p = S.payees.find((x) => x.key === pm.payee) || {};
      const total = pm.lines.reduce((a, l) => a + l.amount, 0), adv = parseNum(st.advance);
      const rows = [[co.name || ''], [co.address || ''], [co.mst ? 'MST: ' + co.mst : ''], [], ['', 'GIẤY ĐỀ NGHỊ THANH TOÁN'],
        ['', '', '', `${S.city}, ${dateVN(new Date())}`], [], ['', 'Kính gửi:', S.to], ['', 'Tôi tên:', S.requester, 'Bộ phận:', S.dept],
        ['', 'Đề nghị thanh toán theo nội dung sau:'], ['STT', 'Số hóa đơn', 'Nội Dung', '', 'Số tiền']];
      pm.lines.forEach((l, i) => rows.push([i + 1, l.inv, l.content, '', l.amount]));
      rows.push(['TỔNG CỘNG', '', '', '', total], ['', '', 'SỐ TIỀN ĐÃ TẠM ỨNG:', '', adv],
        ['', '', 'SỐ TIỀN CÒN LẠI PHẢI THANH TOÁN:', '', total - adv], [],
        ['', 'Hình thức TT:', 'Chuyển khoản'], ['', 'Chủ TK:', p.holder || ''], ['', 'Số tài khoản:', p.acc || ''],
        ['', 'Mở tại NH:', p.bank || ''], ['', 'Thời hạn TT:', st.due ? dateVN(new Date(st.due + 'T00:00:00')) : ''], [],
        ['', 'BGĐ', 'Phụ trách Kế toán', 'Phụ trách bộ phận', 'Người đề nghị'],
        ['', '(Ký, ghi rõ họ tên)', '(Ký, ghi rõ họ tên)', '(Ký, ghi rõ họ tên)', '(Ký, ghi rõ họ tên)'], [], [], [], ['', '', '', '', S.requester]);
      const name = ('ĐNTT ' + pm.payee).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
      sheets.push({ name, rows, colWidths: [7, 16, 40, 18, 18] });
    });
    GauBep.exportXlsx(`PAGia_${(L.code || 'lo').replace(/[^\w-]+/g, '')}_${GauBep.today()}.xlsx`, sheets);
  };

  /* ======================= LÔ MỚI / MẪU / LÀM MỚI ======================= */
  $('btnNewLot').onclick = () => {
    if (!confirm('Tạo lô mới? Dữ liệu lô hiện tại sẽ bị thay (nên Xuất Excel trước). Cài đặt & danh bạ giữ nguyên.')) return;
    L = makeLot(); saveLot(); renderAll(); toast('Lô mới đã sẵn sàng ✨');
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
