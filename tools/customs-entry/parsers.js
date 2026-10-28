/* =========================================================
   Danh sách hàng khai HQ — ĐỌC TEM PHỤ CÓ SẴN (không có giao diện)
   ---------------------------------------------------------
   CustomsParsers.linesFromPdfPages(pages)  pages = [[{ s, x, y, w, h }]] → chuỗi văn bản theo dòng
   CustomsParsers.tem(text)   → các ô tem phụ (tên hàng, nhãn hiệu, thông số, nhà sản xuất, nhà NK…) — không đọc mã vạch
   CustomsParsers.tems(text)  → nhiều tem trong 1 file (tách theo dòng "Model")
   (Các chứng từ khác — Invoice, Bill, C/O… — không đọc trong tool nữa: nhờ AI điền vào form mẫu Excel rồi nạp form.)
   Chạy được bằng Node để kiểm thử: node -e "require('./parsers.js')"
   ========================================================= */
(function (root) {
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
  /* Ghép mảnh chữ pdf.js thành dòng (cùng toạ độ y ±1.5) */
  function linesFromPdfPages(pages) {
    const lines = [];
    pages.forEach((items) => {
      // gom mảnh chữ cùng hàng: lệch y ≤ ~40% cỡ chữ (không chia theo ô cố định để khỏi tách 1 hàng thành 2)
      const rowsArr = [];
      items.filter((it) => String(it.s).trim()).sort((a, b) => b.y - a.y).forEach((it) => {
        const tol = Math.max(2, (it.h || 8) * 0.4);
        const r = rowsArr.find((x) => Math.abs(x.y - it.y) <= tol);
        if (r) r.items.push(it); else rowsArr.push({ y: it.y, items: [it] });
      });
      // mảnh chữ sát nhau (vd "HÓA ĐƠ" + "N") ghép liền, cách xa thì thêm khoảng trắng
      rowsArr.sort((a, b) => b.y - a.y).forEach((row) => {
        const it = row.items.sort((a, b) => a.x - b.x); let out = '';
        it.forEach((o, k) => {
          const prev = it[k - 1];
          const gap = prev && prev.w ? o.x - (prev.x + prev.w) : 99;
          out += (k && gap > Math.max(1, (o.h || prev.h || 8) * 0.18) ? ' ' : '') + o.s;
        });
        lines.push(out.replace(/\s+/g, ' ').trim());
      });
    });
    return lines.join('\n');
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

  /* Nhiều tem trong 1 file (nhiều trang / nhiều tem trên 1 trang) → tách theo từng dòng "Model" */
  function tems(text) {
    const lines = String(text).split('\n');
    const idx = lines.map((l, i) => (/^\s*model\b/.test(fold(l)) ? i : -1)).filter((i) => i >= 0);
    if (idx.length <= 1) { const one = tem(text); return Object.keys(one).length ? [one] : []; }
    const starts = idx.map((i) => { let s0 = i; for (let k = i - 1; k >= Math.max(0, i - 3); k--) { if (lines[k].trim()) { s0 = k; break; } } return s0; });
    return starts.map((st, n) => tem(lines.slice(st, n + 1 < starts.length ? starts[n + 1] : undefined).join('\n'))).filter((x) => x.model || x.nameVi);
  }

  const API = { num, linesFromPdfPages, tem, tems };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.CustomsParsers = API;
})(typeof window !== 'undefined' ? window : globalThis);
