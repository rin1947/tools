/* =========================================================
   Xuất file cho tool "Phiếu nhập kho & File MISA"
   ---------------------------------------------------------
   PoExport.receipt(ExcelJS, data) → Workbook "PHIẾU ĐỀ NGHỊ NHẬP KHO" (đúng khuôn phiếu gốc)
     A1:B5 tên công ty · C1:C5 ô trống · D1:J5 tiêu đề · A7 Phòng ban · A8 Ngày lập phiếu (=TODAY())
     Hàng 10 tiêu đề: STT | MÃ HÀNG | LOCATION | TÊN HÀNG | ĐVT | Số lượng | Số khối | Tổng số khối | Tên lô hàng | Ngày nhập kho dự kiến
     Mỗi đợt: các dòng hàng (STT đánh lại từ 1, H = G × F) + dòng Total (F, H = SUM; I = ghi chú container, chữ đỏ)
     Cuối phiếu: 4 ô ký tên.
     data = { company, dept, lots: [{ name, when (Date | chuỗi ghi chú), cont, rows: [{ code, loc, name, unit, qty, cbm }] }], signs }

   PoExport.misaAoa(data) → mảng 2 chiều cho file nhập đơn mua hàng MISA (28 cột, giống "Mẫu nhập đơn mua hàng")
     Mỗi dòng = 1 mã hàng trong 1 đợt. Số đơn hàng = tên lô. Thành tiền = SL × Đơn giá.
     data = { poDate, supplier: { code, name, address, tax }, currency, lines: [{ so, delivery, code, name, whCode, unit, qty, price, vat }] }
   PoExport.misaWorkbook(XLSX, aoa) → workbook SheetJS 1 sheet "Don mua hang" (ghi ra .xls)
   ========================================================= */
(function (root) {
  const F = 'Times New Roman';
  const ACC0 = '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)';
  const ACC2 = '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"_);_(@_)';
  const thin = { style: 'thin' };
  const BOX = { top: thin, left: thin, bottom: thin, right: thin };
  const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE9D9' } };
  const RED = { argb: 'FFE40000' };

  function receipt(ExcelJS, data) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Gấu Bép';
    const ws = wb.addWorksheet('Sheet1', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
      views: [{ showGridLines: false }],
    });
    [13.3, 19.7, 14, 32, 7, 9.2, 8.2, 8.7, 19.5, 17.3].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const cell = (addr, value, o = {}) => {
      const c = ws.getCell(addr);
      if (value !== undefined) c.value = value;
      c.font = { name: F, size: o.size || 11, bold: !!o.bold, italic: !!o.italic, color: o.color };
      if (o.box) c.border = BOX;
      if (o.fill) c.fill = HEAD_FILL;
      if (o.fmt) c.numFmt = o.fmt;
      c.alignment = { horizontal: o.h, vertical: 'middle', wrapText: !!o.wrap };
      return c;
    };

    // Khối tiêu đề
    for (let r = 1; r <= 5; r++) ws.getRow(r).height = 16;
    ws.mergeCells('A1:B5'); ws.mergeCells('C1:C5'); ws.mergeCells('D1:J5');
    cell('A1', data.company || '', { size: 12, bold: true, box: true, fill: true, h: 'center', wrap: true });
    cell('C1', '', { box: true, fill: true });
    cell('D1', 'PHIẾU ĐỀ NGHỊ NHẬP KHO', { size: 22, bold: true, box: true, fill: true, h: 'center', wrap: true });
    cell('A7', 'Phòng ban:'); cell('B7', data.dept || '', { size: 12 });
    cell('A8', 'Ngày lập phiếu: ');
    const now = new Date();
    cell('B8', { formula: 'TODAY()', result: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) }, { size: 12, fmt: 'd-mmm-yy', h: 'right' });

    const heads = ['STT', 'MÃ HÀNG', 'LOCATION', 'TÊN HÀNG', 'ĐVT', 'Số lượng', 'Số khối', 'Tổng số khối', 'Tên lô hàng', 'Ngày nhập kho dự kiến'];
    ws.getRow(10).height = 28;
    heads.forEach((h, i) => cell(ws.getCell(10, i + 1).address, h, { size: 10, bold: true, box: true, h: 'center', wrap: true }));

    let r = 11;
    data.lots.forEach((lot) => {
      if (!lot.rows.length) return;
      const start = r;
      lot.rows.forEach((it, i) => {
        ws.getRow(r).height = 28;
        cell(`A${r}`, i + 1, { size: 10, box: true, h: 'center' });
        cell(`B${r}`, it.code, { box: true });
        cell(`C${r}`, it.loc, { box: true });
        cell(`D${r}`, it.name, { box: true, wrap: true });
        cell(`E${r}`, it.unit, { box: true, h: 'center' });
        cell(`F${r}`, it.qty, { box: true, h: 'center', fmt: ACC0 });
        cell(`G${r}`, isFinite(it.cbm) ? it.cbm : null, { box: true, fmt: ACC2 });
        cell(`H${r}`, { formula: `G${r}*F${r}`, result: (it.cbm || 0) * it.qty }, { box: true, fmt: ACC2 });
        cell(`I${r}`, lot.name, { size: 10, bold: true, italic: true, box: true, wrap: true });
        const when = lot.when instanceof Date ? lot.when : (lot.when || '');
        cell(`J${r}`, when, { size: 10, box: true, h: 'right', wrap: true, fmt: lot.when instanceof Date ? 'd-mmm-yy' : undefined });
        r++;
      });
      const q = lot.rows.reduce((s, x) => s + x.qty, 0);
      const v = lot.rows.reduce((s, x) => s + x.qty * (x.cbm || 0), 0);
      const tot = { bold: true, italic: true, color: RED, box: true };
      ws.getRow(r).height = 28;
      ['A', 'B', 'C'].forEach((c) => cell(`${c}${r}`, null, { box: true }));
      cell(`D${r}`, lot.totalNote || null, { ...tot, wrap: true });
      cell(`E${r}`, 'Total', { ...tot, h: 'center' });
      cell(`F${r}`, { formula: `SUM(F${start}:F${r - 1})`, result: q }, { ...tot, fmt: ACC2 });
      cell(`G${r}`, null, { box: true });
      cell(`H${r}`, { formula: `SUM(H${start}:H${r - 1})`, result: v }, { ...tot, fmt: ACC2 });
      cell(`I${r}`, lot.cont || null, { ...tot, size: 10, wrap: true, fmt: '@' });
      cell(`J${r}`, null, { box: true });
      r++;
    });

    const s1 = r + 1;
    const signs = data.signs || ['Phòng cung ứng- BP mua hàng', 'Phòng cung ứng- BP Kho', 'Phòng kế toán', 'BAN GIÁM ĐỐC'];
    [['A', 'B', signs[0]], ['D', 'D', signs[1]], ['E', 'F', signs[2]], ['I', 'J', signs[3]]].forEach(([a, b, t]) => {
      if (a !== b) { ws.mergeCells(`${a}${s1}:${b}${s1}`); ws.mergeCells(`${a}${s1 + 1}:${b}${s1 + 1}`); }
      cell(`${a}${s1}`, t, { h: 'center' });
      cell(`${a}${s1 + 1}`, '(ký và ghi rõ họ tên)', { size: 12, italic: true, h: 'center' });
    });
    ws.getRow(s1 + 1).height = 17;
    ws.pageSetup.printArea = `A1:J${s1 + 6}`;
    return wb;
  }

  const MISA_HEAD = ['Ngày đơn hàng (*)', 'Số đơn hàng (*)', 'Tình trạng', 'Ngày giao hàng', 'Mã nhà cung cấp', 'Tên nhà cung cấp',
    'Địa chỉ', 'Mã số thuế', 'Người liên hệ', 'Diễn giải', 'Loại tiền', 'Tỷ giá', 'Mã hàng (*)', 'Tên hàng', 'Là dòng ghi chú',
    'Mã kho', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Thành tiền quy đổi', 'Tỷ lệ CK (%)', 'Tiền chiết khấu',
    'Tiền chiết khấu quy đổi', '% thuế GTGT', '% thuế suất KHAC', 'Tiền thuế GTGT', 'Tiền thuế GTGT quy đổi'];
  const serial = (iso) => {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
  };

  function misaAoa(data) {
    const sup = data.supplier || {};
    const rows = [MISA_HEAD.slice()];
    data.lines.forEach((l) => {
      const row = new Array(28).fill(null);
      row[0] = { date: serial(data.poDate) };
      row[1] = l.so; row[2] = 'Chưa thực hiện';
      row[3] = l.delivery ? { date: serial(l.delivery) } : null;
      row[4] = sup.code || null; row[5] = sup.name || null; row[6] = sup.address || null;
      row[7] = sup.tax ? { text: String(sup.tax) } : null;
      row[10] = data.currency || 'VND';
      row[12] = l.code; row[13] = l.name; row[14] = 'không'; row[15] = l.whCode || null; row[16] = l.unit;
      row[17] = l.qty; row[18] = isFinite(l.price) ? l.price : null;
      row[19] = isFinite(l.price) ? Math.round(l.qty * l.price) : null;
      row[24] = isFinite(l.vat) ? l.vat : null;
      rows.push(row);
    });
    return rows;
  }

  /* Ghi bằng SheetJS: ngày là số serial + định dạng d/m/yyyy, MST giữ dạng chữ (không mất số 0 đầu) */
  function misaWorkbook(XLSX, aoa) {
    const ws = {};
    let maxR = 0;
    aoa.forEach((row, r) => {
      row.forEach((v, c) => {
        if (v == null || v === '') return;
        const addr = XLSX.utils.encode_cell({ r, c });
        if (typeof v === 'object' && 'date' in v) { if (v.date != null) ws[addr] = { t: 'n', v: v.date, z: 'd/m/yyyy' }; }
        else if (typeof v === 'object' && 'text' in v) ws[addr] = { t: 's', v: v.text };
        else if (typeof v === 'number') ws[addr] = { t: 'n', v, z: c === 24 ? 'General' : '#,##0' };
        else ws[addr] = { t: 's', v: String(v) };
      });
      maxR = r;
    });
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: 27 } });
    ws['!cols'] = [12, 22, 13, 12, 10, 36, 50, 13, 12, 12, 8, 8, 18, 40, 10, 10, 8, 9, 13, 15, 12, 10, 12, 12, 10, 10, 12, 12].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Don mua hang');
    return wb;
  }

  const api = { receipt, misaAoa, misaWorkbook, MISA_HEAD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PoExport = api;
})(typeof window !== 'undefined' ? window : globalThis);
