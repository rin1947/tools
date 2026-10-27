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
    const r3 = /\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\b/g;
    while ((m = r3.exec(t))) { if (+m[2] <= 12) out.push({ i: m.index, v: iso(m[3], m[2], m[1]) }); }
    return out.sort((a, b) => a.i - b.i);
  }

  /* Ghép mảnh chữ pdf.js thành dòng (cùng toạ độ y ±1.5) */
  function linesFromPdfPages(pages) {
    const lines = [];
    pages.forEach((items) => {
      const rows = {};
      items.forEach((it) => { if (!String(it.s).trim()) return; const y = Math.round(it.y / 3) * 3; (rows[y] = rows[y] || []).push(it); });
      Object.keys(rows).map(Number).sort((a, b) => b - a)
        .forEach((y) => lines.push(rows[y].sort((a, b) => a.x - b.x).map((o) => o.s).join(' ').replace(/\s+/g, ' ').trim()));
    });
    return lines.join('\n');
  }

  function classify(t) {
    const u = String(t).toUpperCase();
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
    const L = u.split('\n').map((s) => s.trim());
    if (!o.vessel) {
      const v = L.find((s) => /^(MSC|MAERSK|CMA|COSCO|ONE |EVER|OOCL|WAN HAI|YM |HMM|ZIM|SITC|KMTC|TS LINES|HAPAG|PIL|INTERASIA|XIN|CSCL|APL)[A-Z0-9 .\-]*\s[A-Z0-9]{3,8}$/.test(s));
      if (v) o.vessel = v;
    }
    for (const k in POL) { if (L.some((s) => s === k) || new RegExp('PORT OF LOADING[^\\n]*' + k).test(u)) { o.pol = k; break; } }
    if (!o.pol) for (const k in POL) { if (u.includes(k)) { o.pol = k; break; } }
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
    if ((m = u.match(/HS\s*CODE\s*:?\s*([\d.]{4,12})/))) o.blHs = m[1].replace(/\D/g, '');
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
      if (r && r[1] !== 'TOTAL') lines.push({ code: r[1], name: titleCase(r[2]), qty: num(r[3]), unit: r[4], price: num(r[5]), amount: num(r[6]) });
    });
    if (lines.length) o.lines = lines;
    if ((m = u.match(/TOTAL[^\n]*?(?:USD|US\$)\s*([\d.,]+)\s*$/m))) o.invTotal = num(m[1]);
    else if (lines.length) o.invTotal = lines.reduce((a, b) => a + b.amount, 0);
    return o;
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

  const API = { num, findDates, linesFromPdfPages, classify, bill, ci, pl, co, contract, tem, fixOcrDigits, POL, POD };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.CustomsParsers = API;
})(typeof window !== 'undefined' ? window : globalThis);
