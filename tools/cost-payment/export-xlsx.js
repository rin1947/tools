/* =========================================================
   Xuất Excel theo ĐÚNG cấu trúc file PA giá gốc của người dùng (dùng ExcelJS)
   ---------------------------------------------------------
   Sheet "BẢNG KÊ CHI PHÍ"
     A1:B4  Số lượng cont / Cảng đi / Địa chỉ kho / Liên hệ
     Hàng 5 tiêu đề: (A trống) | LOẠI | PHÍ -VAT | +VAT | NOTE | hoá đơn số | Ngày hoá đơn | Ghi chú | Thông tin chuyển khoản
     Cột A gộp theo nhóm: PHÍ KHAI THÁC HÀNG → CƯỚC VẬN TẢI QT → BẢO HIỂM HÀNG HOÁ
     Các dòng cùng 1 hoá đơn đứng liền nhau; cột +VAT, HĐ số, Ngày, Ghi chú, TT chuyển khoản gộp ô (tổng HĐ)
   Sheet "PHƯƠNG ÁN GIÁ" — công thức sống, giống file gốc:
     F(item)  = E × D
     OF       = SUM(Bảng kê, khối CƯỚC VẬN TẢI QT, cột C) / Tỷ giá
     PHÍ LÀM HÀNG & KÉO HÀNG = SUM(khối PHÍ KHAI THÁC HÀNG) / Tỷ giá
     PHÍ BH   = SUM(khối BẢO HIỂM) / Tỷ giá
     TOTAL    = OF + Làm hàng + BH ;  %  = TOTAL / Tổng tiền hàng
     GIÁ VỐN DỰ KIẾN = E × (1 + %) × Tỷ giá × (1 + % thuế NK)
   Sheet "ĐNTT …" — mỗi người nhận 1 phiếu theo mẫu Giấy đề nghị thanh toán.
   ========================================================= */
(function (root) {
  const ACC0 = '_(* #,##0_);_(* \\(#,##0\\);_(* \\-_);_(@_)';
  const ACC2 = '_(* #,##0.##_);_(* \\(#,##0.##\\);_(* \\-_);_(@_)';
  const USD2 = '_([$$-409]* #,##0.00_);_([$$-409]* \\(#,##0.00\\);_([$$-409]* \\-??_);_(@_)';
  const thin = { style: 'thin' };
  const BOX = { top: thin, left: thin, bottom: thin, right: thin };
  const GROUPS = { KT: 'PHÍ KHAI THÁC HÀNG', OF: 'CƯỚC VẬN TẢI QT', BH: 'BẢO HIỂM HÀNG HOÁ' };
  const BK = "'BẢNG KÊ CHI PHÍ'";

  function style(cell, o = {}) {
    cell.font = { name: o.fontName || 'Aptos Narrow', size: o.size || 12, bold: !!o.bold, italic: !!o.italic };
    if (o.fmt) cell.numFmt = o.fmt;
    if (o.box) cell.border = BOX;
    cell.alignment = { vertical: o.v || 'middle', horizontal: o.h, wrapText: o.wrap !== false };
    return cell;
  }
  const put = (ws, addr, value, o) => { const c = ws.getCell(addr); c.value = value; return style(c, o); };
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  /* data = { lot, items:[{code,name,color,qty,price,hs,nk}], fees:[{group,name,pre,post,vatNo,inv,date,note,payeeInfo,payee}],
              rate, dn:[{sheet, company, to, requester, dept, city, date, lines:[{inv,content,amount}], advance, holder, acc, bank, due}] } */
  function build(ExcelJS, data, opt = {}) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Gấu Bép';
    if (!opt.onlyDn) buildCost(wb, data);
    buildDn(wb, data.dn || [], opt.onlyDn ? [] : ['BẢNG KÊ CHI PHÍ', 'PHƯƠNG ÁN GIÁ']);
    return wb;
  }

  function buildCost(wb, data) {

    /* ---------------- BẢNG KÊ CHI PHÍ ---------------- */
    const bk = wb.addWorksheet('BẢNG KÊ CHI PHÍ', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    [22, 34, 15, 15, 15.5, 13.5, 13.5, 15, 44.125].forEach((w, i) => { bk.getColumn(i + 1).width = w; });
    [['SỐ LƯỢNG CONT:', data.lot.cont], ['CẢNG ĐI:', data.lot.port], ['Địa chỉ kho: ', data.lot.warehouse], ['Liên hệ:', data.lot.contact]]
      .forEach(([k, v], i) => {
        put(bk, `A${i + 1}`, k, { size: 14, bold: true, wrap: false });
        put(bk, `B${i + 1}`, v || '', { size: i < 2 ? 14 : 12, bold: i < 2, wrap: false });
      });
    ['', 'LOẠI', 'PHÍ -VAT', '+VAT', 'NOTE', 'hoá đơn số', 'Ngày hoá đơn', 'Ghi chú', 'Thông tin chuyển khoản']
      .forEach((h, i) => put(bk, bk.getCell(5, i + 1).address, h, { box: true, h: 'center', bold: true }));

    let r = 6;
    const ranges = {};
    ['KT', 'OF', 'BH'].forEach((g) => {
      const list = data.fees.filter((f) => f.group === g);
      if (!list.length) return;
      // gom các dòng cùng hoá đơn (cùng người nhận) đứng liền nhau, giữ thứ tự xuất hiện đầu tiên
      const order = []; const blocks = new Map();
      list.forEach((f) => {
        const k = f.inv ? `${f.payee}|${f.inv}` : `__${order.length}`;
        if (!blocks.has(k)) { blocks.set(k, []); order.push(k); }
        blocks.get(k).push(f);
      });
      const start = r;
      order.forEach((k) => {
        const rows = blocks.get(k);
        const top = r;
        rows.forEach((f) => {
          put(bk, `B${r}`, f.name, { box: true });
          put(bk, `C${r}`, f.pre || null, { box: true, fmt: ACC2 });
          put(bk, `E${r}`, f.noteType, { box: true });
          ['D', 'F', 'G', 'H', 'I'].forEach((col) => style(bk.getCell(`${col}${r}`), { box: true }));
          r++;
        });
        const f0 = rows[0];
        const post = sum(rows.map((f) => f.post));
        const showPost = f0.inv || rows.some((f) => f.vatNo !== '');
        put(bk, `D${top}`, showPost && post ? post : null, { box: true, fmt: ACC2 });
        put(bk, `F${top}`, f0.inv || '', { box: true, h: 'center' });
        put(bk, `G${top}`, f0.date ? new Date(f0.date + 'T00:00:00Z') : '', { box: true, fmt: 'dd/mm/yyyy', h: 'center' });
        put(bk, `H${top}`, rows.map((f) => f.note).find(Boolean) || '', { box: true });
        put(bk, `I${top}`, f0.payeeInfo || '', { box: true, bold: true, h: 'left', size: 11 });
        if (rows.length > 1) ['D', 'F', 'G', 'H', 'I'].forEach((col) => bk.mergeCells(`${col}${top}:${col}${r - 1}`));
      });
      ranges[g] = [start, r - 1];
      put(bk, `A${start}`, GROUPS[g], { box: true, h: 'left', bold: true });
      if (r - 1 > start) bk.mergeCells(`A${start}:A${r - 1}`);
    });
    const totRow = r;
    put(bk, `A${totRow}`, 'TỔNG CỘNG', { box: true, bold: true });
    put(bk, `B${totRow}`, '', { box: true });
    put(bk, `C${totRow}`, { formula: `SUM(C6:C${totRow - 1})`, result: sum(data.fees.map((f) => f.pre)) }, { box: true, bold: true, fmt: ACC2 });
    ['D', 'E', 'F', 'G', 'H', 'I'].forEach((col) => style(bk.getCell(`${col}${totRow}`), { box: true }));
    bk.views = [{ state: 'frozen', ySplit: 5 }];

    /* ---------------- PHƯƠNG ÁN GIÁ ---------------- */
    const pa = wb.addWorksheet('PHƯƠNG ÁN GIÁ', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    [17, 40, 18, 9, 27, 14.875, 11, 10.875, 16].forEach((w, i) => { pa.getColumn(i + 1).width = w; });
    put(pa, 'A1', 'PHƯƠNG ÁN GIÁ', { size: 24, bold: true, wrap: false });
    put(pa, 'A2', 'CẢNG ĐI:', {}); put(pa, 'B2', data.lot.port || '', {});
    put(pa, 'A3', 'LÔ HÀNG:', {}); put(pa, 'B3', data.lot.code || '', {});
    put(pa, 'A4', 'TỶ GIÁ:', {}); put(pa, 'B4', data.rate || 0, { fmt: '#,##0', h: 'left' });
    put(pa, 'A5', 'CONTAINER QTY', { wrap: false }); put(pa, 'B5', data.lot.cont || '', { h: 'right' });
    ['ITEM CODE', 'Tên hàng', 'Color', 'QTY', 'UNIT PRICE', 'TOTAL AMOUNT', 'Hs code', '% Thuế NK', 'GIÁ VỐN DỰ KIẾN']
      .forEach((h, i) => put(pa, pa.getCell(6, i + 1).address, h, { box: true, h: 'center', bold: true }));

    const items = data.items.length ? data.items : [{}];
    const first = 7, last = first + items.length - 1, sumRow = last + 1;
    const rOF = sumRow + 1, rKT = sumRow + 2, rBH = sumRow + 3, rTOT = sumRow + 4, rPCT = sumRow + 5;
    const fob = sum(items.map((it) => (it.qty || 0) * (it.price || 0)));
    const grp = (g) => sum(data.fees.filter((f) => f.group === g).map((f) => f.pre));
    const rate = data.rate || 0;
    const usd = (g) => (rate ? grp(g) / rate : 0);
    const totUsd = usd('OF') + usd('KT') + usd('BH');
    const pct = fob ? totUsd / fob : 0;
    items.forEach((it, i) => {
      const row = first + i;
      put(pa, `A${row}`, it.code || '', { box: true });
      put(pa, `B${row}`, it.name || '', { box: true });
      put(pa, `C${row}`, it.color || '', { box: true });
      put(pa, `D${row}`, it.qty ?? null, { box: true, fmt: '#,##0' });
      put(pa, `E${row}`, it.price ?? null, { box: true, fmt: USD2 });
      put(pa, `F${row}`, { formula: `E${row}*D${row}`, result: (it.qty || 0) * (it.price || 0) }, { box: true, fmt: USD2 });
      put(pa, `G${row}`, it.hs || '', { box: true, h: 'center' });
      put(pa, `H${row}`, it.nk != null ? it.nk / 100 : null, { box: true, fmt: '0%' });
      put(pa, `I${row}`, { formula: `E${row}*(1+$F$${rPCT})*$B$4*(1+H${row})`, result: (it.price || 0) * (1 + pct) * rate * (1 + (it.nk || 0) / 100) },
        { box: true, fmt: ACC2, bold: true });
    });
    ['A', 'B', 'C', 'E', 'G', 'H', 'I'].forEach((col) => style(pa.getCell(`${col}${sumRow}`), { box: true }));
    put(pa, `D${sumRow}`, { formula: `SUM(D${first}:D${last})`, result: sum(items.map((it) => it.qty || 0)) }, { box: true, fmt: '#,##0', bold: true });
    put(pa, `F${sumRow}`, { formula: `SUM(F${first}:F${last})`, result: fob }, { box: true, fmt: USD2, bold: true });
    const rng = (g) => (ranges[g] ? `SUM(${BK}!C${ranges[g][0]}:C${ranges[g][1]})/$B$4` : '0');
    [[rOF, 'OF', rng('OF'), usd('OF')], [rKT, 'PHÍ LÀM HÀNG & KÉO HÀNG', rng('KT'), usd('KT')], [rBH, 'PHÍ BH', rng('BH'), usd('BH')],
      [rTOT, 'TOTAL', `SUM(F${rOF}:F${rBH})`, totUsd], [rPCT, '%', `IF(F${sumRow}=0,0,F${rTOT}/F${sumRow})`, pct]]
      .forEach(([row, label, f, v]) => {
        put(pa, `E${row}`, label, { bold: label === 'TOTAL' || label === '%', wrap: false });
        put(pa, `F${row}`, { formula: f, result: v }, { fmt: label === '%' ? '0.00%' : USD2, bold: label === 'TOTAL' || label === '%' });
      });
    pa.views = [{ state: 'frozen', ySplit: 6 }];

  }

  /* ---------------- ĐNTT: mỗi người nhận 1 sheet ---------------- */
  function buildDn(wb, list, taken) {
    const names = new Set(taken);
    list.forEach((d) => {
      let name = ('ĐNTT ' + d.sheet).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim(); let n = 2;
      while (names.has(name)) name = (('ĐNTT ' + d.sheet).slice(0, 27) + ' ' + n++).trim();
      names.add(name);
      const ws = wb.addWorksheet(name, { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.5, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } } });
      [6.29, 15.14, 26.71, 31.29, 17.71].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      const T = { fontName: 'Times New Roman' };
      if (d.logo) {
        const m = d.logo.match(/^data:image\/(png|jpe?g|gif);base64,(.+)$/);
        if (m) {
          const id = wb.addImage({ base64: m[2], extension: m[1] === 'jpg' ? 'jpeg' : m[1] });
          const ratio = d.logoW && d.logoH ? d.logoW / d.logoH : 2.6;
          const h = 52, w = Math.min(150, h * ratio);
          ws.addImage(id, { tl: { col: 0.15, row: 0.2 }, ext: { width: w, height: w / ratio } });
        }
      }
      [d.company.name, d.company.address, d.company.mst ? 'MST: ' + d.company.mst : ''].forEach((t, i) => {
        put(ws, `C${i + 1}`, t || '', { ...T, size: 11, bold: true, wrap: false });
        ws.getRow(i + 1).height = 18.6;
      });
      ws.mergeCells('A5:E5'); put(ws, 'A5', 'GIẤY ĐỀ NGHỊ THANH TOÁN', { ...T, size: 16, bold: true, h: 'center' });
      put(ws, 'D6', `${d.city},`, { ...T, italic: true, h: 'right' });
      put(ws, 'E6', d.date, { ...T, italic: true, fmt: 'dd/mm/yyyy', h: 'left' });
      put(ws, 'B8', 'Kính gửi:  ', { ...T, bold: true, italic: true });
      put(ws, 'C8', d.to, { ...T, wrap: false });
      put(ws, 'B9', 'Tôi tên: ', { ...T, bold: true, italic: true });
      put(ws, 'C9', d.requester, { ...T, bold: true, wrap: false });
      put(ws, 'D9', 'Bộ phận:', { ...T, h: 'right' });
      put(ws, 'E9', d.dept, { ...T, h: 'center' });
      put(ws, 'B10', 'Đề nghị thanh toán theo nội dung sau:', { ...T, bold: true, italic: true, wrap: false });
      [8, 9, 10].forEach((x) => { ws.getRow(x).height = 22.35; });

      put(ws, 'A11', 'STT', { ...T, bold: true, box: true, h: 'center' });
      put(ws, 'B11', 'Số hóa đơn', { ...T, bold: true, box: true, h: 'center' });
      style(ws.getCell('D11'), { ...T, box: true });
      ws.mergeCells('C11:D11'); put(ws, 'C11', 'Nội Dung', { ...T, bold: true, box: true, h: 'center' });
      put(ws, 'E11', 'Số tiền', { ...T, bold: true, box: true, h: 'center' });
      ws.getRow(11).height = 25.7;
      const nRows = Math.max(5, d.lines.length);
      for (let i = 0; i < nRows; i++) {
        const row = 12 + i, l = d.lines[i];
        put(ws, `A${row}`, l ? i + 1 : null, { ...T, box: true, h: 'center' });
        put(ws, `B${row}`, l ? l.inv : '', { ...T, box: true, h: 'center' });
        style(ws.getCell(`D${row}`), { ...T, box: true });
        ws.mergeCells(`C${row}:D${row}`);
        put(ws, `C${row}`, l ? l.content : '', { ...T, box: true, h: 'left' });
        put(ws, `E${row}`, l ? l.amount : null, { ...T, box: true, fmt: ACC2, h: 'right' });
        ws.getRow(row).height = l ? Math.max(30, Math.ceil(String(l.content).length / 52) * 16 + 8) : 22;
      }
      const tot = 12 + nRows, total = sum(d.lines.map((l) => l.amount));
      ['B', 'C', 'D'].forEach((col) => style(ws.getCell(`${col}${tot}`), { ...T, box: true }));
      ws.mergeCells(`A${tot}:D${tot}`);
      put(ws, `A${tot}`, 'TỔNG CỘNG', { ...T, bold: true, box: true, h: 'center' });
      put(ws, `E${tot}`, { formula: `SUM(E12:E${tot - 1})`, result: total }, { ...T, bold: true, box: true, fmt: ACC2, h: 'right' });
      ws.mergeCells(`C${tot + 1}:D${tot + 1}`); put(ws, `C${tot + 1}`, 'SỐ TIỀN ĐÃ TẠM ỨNG:', { ...T, size: 11, bold: true, h: 'center' });
      put(ws, `E${tot + 1}`, d.advance || 0, { ...T, fmt: ACC2, h: 'right' });
      ws.mergeCells(`C${tot + 2}:D${tot + 2}`); put(ws, `C${tot + 2}`, 'SỐ TIỀN CÒN LẠI PHẢI THANH TOÁN:', { ...T, size: 11, bold: true, h: 'center' });
      put(ws, `E${tot + 2}`, { formula: `E${tot}-E${tot + 1}`, result: total - (d.advance || 0) }, { ...T, size: 14, bold: true, fmt: ACC2, h: 'right' });

      const b = tot + 4;
      [['Hình thức TT:', 'Chuyển khoản'], ['Chủ TK:', d.holder], ['Số tài khoản:', d.acc], ['Mở tại NH:', d.bank], ['Thời hạn TT:', d.due]]
        .forEach(([k, v], i) => {
          put(ws, `B${b + i}`, k, { ...T, bold: true, italic: true, wrap: false });
          ws.mergeCells(`C${b + i}:E${b + i}`);
          put(ws, `C${b + i}`, v || '', { ...T, bold: i > 0, italic: true, h: 'left', fmt: v instanceof Date ? 'dd/mm/yyyy' : undefined });
        });
      const s = b + 6;
      ['BGĐ', 'Phụ trách Kế toán', 'Phụ trách bộ phận', 'Người đề nghị'].forEach((t, i) => {
        const col = ['B', 'C', 'D', 'E'][i];
        put(ws, `${col}${s}`, t, { ...T, bold: true, h: 'center' });
        put(ws, `${col}${s + 1}`, '(Ký, ghi rõ họ tên)', { ...T, italic: true, h: 'center' });
      });
      put(ws, `E${s + 6}`, d.requester, { ...T, size: 11, bold: true, h: 'center' });
      ws.pageSetup.printArea = `A1:E${s + 6}`;
    });
    return wb;
  }

  root.CostPaymentExport = { build };
})(typeof window !== 'undefined' ? window : globalThis);
