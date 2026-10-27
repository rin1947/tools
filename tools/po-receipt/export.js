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
   PoExport.misaBook(aoa, catalog) → mô tả sổ .xls CÓ ĐỊNH DẠNG giống mẫu MISA, ghi bằng XlsWriter (xls-writer.js)
   PoExport.misaWorkbook(XLSX, aoa) → (dự phòng) workbook SheetJS không định dạng
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
      views: [{ zoomScale: 70 }],
    });
    [13.3, 19.7, 19, 32, 9.2, 9.2, 8.2, 8.7, 19.5, 17.3, 20.7, 11.8, 11.8].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const cell = (addr, value, o = {}) => {
      const c = ws.getCell(addr);
      if (value !== undefined) c.value = value;
      c.font = { name: o.fontName || F, size: o.size || 11, bold: !!o.bold, italic: !!o.italic, color: o.color };
      if (o.box) c.border = o.noRight ? { top: thin, left: thin, bottom: thin } : o.noBottom ? { top: thin, left: thin, right: thin } : BOX;
      if (o.fill) c.fill = HEAD_FILL;
      if (o.fmt) c.numFmt = o.fmt;
      c.alignment = { horizontal: o.h, vertical: o.v === null ? undefined : 'middle', wrapText: !!o.wrap };
      return c;
    };

    // Khối tiêu đề
    for (let r = 1; r <= 5; r++) ws.getRow(r).height = 16;
    ws.mergeCells('A1:B5'); ws.mergeCells('D1:J5');
    cell('A1', data.company || '', { size: 12, bold: true, box: true, fill: true, h: 'center', wrap: true });
    for (let rr = 1; rr <= 5; rr++) {                                   // cột C: tô nền, khung ngoài như mẫu
      const c = cell(`C${rr}`, null, { size: 12, bold: true, fill: true });
      c.border = { left: thin, ...(rr === 1 ? { top: thin } : {}), ...(rr === 5 ? { bottom: thin } : {}) };
    }
    cell('D1', 'PHIẾU ĐỀ NGHỊ NHẬP KHO', { size: 22, bold: true, box: true, fill: true, h: 'center', wrap: true });
    cell('A7', 'Phòng ban:'); cell('B7', data.dept || '', { size: 12, fontName: 'Calibri', v: null });
    cell('A8', 'Ngày lập phiếu: ');
    const now = new Date();
    cell('B8', { formula: 'TODAY()', result: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) }, { size: 12, fontName: 'Calibri', fmt: 'd-mmm-yy', v: null });

    const heads = ['STT', 'MÃ HÀNG', 'LOCATION', 'TÊN HÀNG', 'ĐVT', 'Số lượng', 'Số khối', 'Tổng số khối', 'Tên lô hàng', 'Ngày nhập kho dự kiến'];
    ws.getRow(10).height = 28;
    heads.forEach((h, i) => cell(ws.getCell(10, i + 1).address, h, { size: 10, bold: true, box: true, noBottom: i < 9, h: 'center', wrap: true,
      fmt: i === 5 ? ACC0 : undefined }));

    let r = 11;
    data.lots.forEach((lot) => {
      if (!lot.rows.length) return;
      const start = r;
      lot.rows.forEach((it, i) => {
        ws.getRow(r).height = 28;
        cell(`A${r}`, i + 1, { size: 10, box: true, h: 'center', wrap: true });
        cell(`B${r}`, it.code, { box: true, noRight: true });
        cell(`C${r}`, it.loc, { box: true, noRight: true, wrap: true });
        cell(`D${r}`, it.name, { box: true, noRight: true, wrap: true });
        cell(`E${r}`, it.unit, { box: true, h: 'center' });
        cell(`F${r}`, it.qty, { box: true, h: 'center', fmt: ACC0 });
        cell(`G${r}`, isFinite(it.cbm) ? it.cbm : null, { box: true, fmt: ACC2 });
        cell(`H${r}`, { formula: `G${r}*F${r}`, result: (it.cbm || 0) * it.qty }, { box: true, fmt: ACC2 });
        cell(`I${r}`, lot.name, { size: 10, bold: true, italic: true, box: true, wrap: true, fmt: '@' });
        const when = lot.when instanceof Date ? lot.when : (lot.when || '');
        cell(`J${r}`, when, { size: 10, box: true, h: 'right', wrap: true, fmt: lot.when instanceof Date ? 'd-mmm-yy' : undefined });
        r++;
      });
      const q = lot.rows.reduce((s, x) => s + x.qty, 0);
      const v = lot.rows.reduce((s, x) => s + x.qty * (x.cbm || 0), 0);
      const tot = { bold: true, italic: true, color: RED, box: true };
      ws.getRow(r).height = 28;
      ['A', 'B', 'C'].forEach((c) => cell(`${c}${r}`, null, { box: true }));
      cell(`D${r}`, lot.totalNote || null, { ...tot, noRight: true, wrap: true });
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

  /* Sổ .xls định dạng giống "Mẫu nhập đơn mua hàng" của MISA (đo từ file mẫu gốc):
     dòng tiêu đề Times New Roman 12 đậm, khung, nền xanh nhạt (cột A–L màu 27, M–AB màu 42), cao 34pt;
     dòng dữ liệu Calibri 11, cao 48pt; cột A ngày dạng dài, cột D d/m/yyyy; cố định dòng đầu;
     sheet 2 "Danh sách hàng hoá" (STT | Mã | Tên). catalog = [{ code, name }] */
  const MISA_WIDTHS = [6485, 5205, 4394, 4394, 2645, 5888, 13525, 4394, 4394, 5248, 3968, 3754, 4480, 4480, 2688, 3669, 3712, 3712, 3712, 5205, 3712, 3712, 3712, 4309, 4352, 4309, 4309, 4309];
  const ACC_0 = '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)';
  const ACC_3 = '_(* #,##0.000_);_(* \\(#,##0.000\\);_(* "-"_);_(@_)';
  function misaBook(aoa, catalog) {
    const fonts = [
      { name: 'Times New Roman', size: 12, bold: true },   // 0 tiêu đề
      { name: 'Calibri', size: 11, color: 8 },              // 1 dữ liệu
      { name: 'Arial', size: 10 },                          // 2 cột tiền
      { name: 'Arial', size: 16, bold: true, color: 8 },    // 3 tên sheet danh sách
      { name: 'Arial', size: 10, bold: true },              // 4 tiêu đề danh sách
    ];
    const H = { h: 2, v: 1, wrap: true, border: true };
    const xfs = [
      { font: 0, ...H, fill: 27 },                                           // 0 tiêu đề A–L
      { font: 0, ...H, fill: 42 },                                           // 1 tiêu đề M–AB
      { font: 2, ...H, fill: 42, fmt: ACC_0 },                               // 2 tiêu đề cột tiền
      { font: 1, v: 1, fmt: '[$-F800]dddd", "mmmm\\ dd", "yyyy' },         // 3 ngày đơn hàng
      { font: 1, v: 1 },                                                     // 4 chung
      { font: 1, v: 1, fmt: 'd/m/yyyy;@' },                                  // 5 ngày giao
      { font: 1, v: 1, wrap: true },                                         // 6 tên / địa chỉ NCC
      { font: 1, v: 1, fmt: '@' },                                           // 7 chữ (MST, ĐVT)
      { font: 1, v: 2, fmt: '@' },                                           // 8 mã hàng
      { font: 1, v: 1, wrap: true, fmt: '@' },                               // 9 tên hàng, ghi chú
      { font: 1, v: 1, fmt: '0' },                                           // 10 số lượng
      { font: 2, h: 2, v: 1, fmt: ACC_0 },                                   // 11 đơn giá
      { font: 2, h: 3, v: 1, fmt: ACC_0 },                                   // 12 thành tiền
      { font: 1, v: 2 },                                                     // 13 % thuế
      { font: 2, v: 1, fmt: ACC_3 },                                         // 14 tiền thuế
      { font: 1, v: 1, fmt: '#,##0' },                                       // 15 tỷ giá
      { font: 3, h: 2, v: 1, wrap: true },                                   // 16 tên danh sách
      { font: 4, h: 2, v: 1, wrap: true, border: true, fill: 22 },           // 17 tiêu đề danh sách
      { font: 1, h: 1, v: 2, wrap: true, border: true },                     // 18 dòng danh sách
    ];
    const COLXF = { 0: 3, 3: 5, 5: 6, 6: 6, 7: 7, 11: 15, 12: 8, 13: 9, 14: 9, 16: 7, 17: 10, 18: 11, 19: 12, 24: 13, 26: 14 };
    const cells = []; const heights = { 0: 680 };
    aoa.forEach((row, r) => {
      for (let c = 0; c < 28; c++) {
        let v = row[c];
        if (v && typeof v === 'object') v = 'date' in v ? v.date : v.text;
        if (r === 0) cells.push([r, c, v, [18, 19, 26].includes(c) ? 2 : c < 12 ? 0 : 1]);
        else cells.push([r, c, v ?? null, COLXF[c] ?? 4]);
      }
      if (r > 0) heights[r] = 960;
    });
    const sheets = [{ name: 'Don mua hang', colWidths: MISA_WIDTHS, rowHeights: heights, defaultRowHeight: 300, freezeRows: 1, cells }];
    if (catalog && catalog.length) {
      const c2 = [[0, 0, 'DANH SÁCH HÀNG HÓA, DỊCH VỤ', 16], [0, 1, null, 16], [0, 2, null, 16], [1, 0, null, 16], [1, 1, null, 16], [1, 2, null, 16],
        [2, 0, 'STT', 17], [2, 1, 'Mã', 17], [2, 2, 'Tên', 17]];
      catalog.forEach((it, i) => { c2.push([i + 3, 0, i + 1, 18], [i + 3, 1, it.code, 18], [i + 3, 2, it.name || '', 18]); });
      sheets.push({ name: 'Danh sách hàng hoá', colWidths: [1066, 7125, 10496], rowHeights: { 0: 565, 1: 400, 2: 560 }, defaultRowHeight: 320,
        freezeRows: 3, merges: [[0, 0, 0, 2], [1, 1, 0, 2]], cells: c2 });
    }
    return { fonts, xfs, sheets };
  }

  const api = { receipt, misaAoa, misaWorkbook, misaBook, MISA_HEAD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PoExport = api;
})(typeof window !== 'undefined' ? window : globalThis);
