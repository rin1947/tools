/* =========================================================
   Đọc PO dạng ẢNH SCAN (OCR) — chạy hoàn toàn trên máy, không gửi ảnh đi đâu
   ---------------------------------------------------------
   Cách làm (đọc cả trang một lần hay sót số vì đường kẻ bảng → đọc TỪNG Ô):
     1. Tìm đường kẻ bảng: đường ngang dài cùng mép trái/phải = các dòng của bảng hàng; đường dọc trong khoảng đó = các cột.
     2. Đọc dòng tiêu đề để biết cột nào là MODEL / QTY / PRICE / VALUE.
     3. Mỗi dòng hàng đọc 4 ô (mã, SL, đơn giá, thành tiền) với bộ ký tự giới hạn.
     4. Kiểm tra SL × Đơn giá = Thành tiền; lệch thì thử suy ra số đọc sai (đánh dấu để người dùng xem lại).
     5. Mã hàng so với danh mục, sửa lỗi nhận nhầm chữ/số hay gặp (O↔0, I↔1, S↔5, B↔8, G↔6, Z↔2).
     6. Ô ngay dưới bảng ở cột thành tiền = Tổng tiền trước VAT (để đối chiếu).
   PoOcr.readPo(img, recognize, models) →
     { rows: [{ model, raw, qty, price, value, ok, fixed, note }], total, poNo, poDate, warnings }
     img       = { width, height, data } (RGBA, như ImageData của canvas)
     recognize = async (ảnh 1 ô đã cắt {width,height,data}, mode 'header'|'model'|'num'|'text') → chuỗi
     models    = danh sách model đã biết (danh mục + PO đang làm) để sửa mã
   Dùng chung cho trình duyệt và Node (để kiểm thử).
   ========================================================= */
(function (root) {
  const P = root.PoParsers || (typeof require !== 'undefined' ? require('./parsers.js') : null);

  /* ---------- chỉnh nghiêng (bản scan thường lệch vài độ → đường kẻ không nằm trên 1 hàng điểm ảnh) ---------- */
  function skewAngle(img) {
    const W = img.width, H = img.height, d = darkMap(img);
    const pts = [];
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 3) if (d[y * W + x]) pts.push(x, y);
    let best = 0, bestScore = -1;
    for (let a = -3; a <= 3.0001; a += 0.05) {
      const t = Math.tan(a * Math.PI / 180); const hist = new Float64Array(H + 2 * W);
      for (let i = 0; i < pts.length; i += 2) { const yy = Math.round(pts[i + 1] - pts[i] * t) + W; if (yy >= 0 && yy < hist.length) hist[yy]++; }
      let sc = 0; for (let i = 0; i < hist.length; i++) sc += hist[i] * hist[i];
      if (sc > bestScore) { bestScore = sc; best = a; }
    }
    return best;
  }
  function rotate(img, deg) {
    if (Math.abs(deg) < 0.05) return img;
    const W = img.width, H = img.height, src = img.data, out = new Uint8ClampedArray(W * H * 4).fill(255);
    const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), cx = W / 2, cy = H / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = Math.round(c * (x - cx) - s * (y - cy) + cx), sy = Math.round(s * (x - cx) + c * (y - cy) + cy);
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      const i = (y * W + x) * 4, j = (sy * W + sx) * 4;
      out[i] = src[j]; out[i + 1] = src[j + 1]; out[i + 2] = src[j + 2]; out[i + 3] = 255;
    }
    return { width: W, height: H, data: out };
  }

  /* cắt 1 vùng ảnh (đọc ô nhỏ nhanh hơn nhiều so với đọc cả trang) */
  function crop(img, r) {
    const left = Math.max(0, Math.round(r.left)), top = Math.max(0, Math.round(r.top));
    const w = Math.max(1, Math.min(img.width - left, Math.round(r.width))), h = Math.max(1, Math.min(img.height - top, Math.round(r.height)));
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) out.set(img.data.subarray(((top + y) * img.width + left) * 4, ((top + y) * img.width + left + w) * 4), y * w * 4);
    return { width: w, height: h, data: out };
  }

  /* ---------- tìm đường kẻ ---------- */
  function darkMap(img, thr = 140) {
    const { width: W, height: H, data } = img; const d = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < W * H; i++, p += 4) d[i] = (data[p] + data[p + 1] + data[p + 2]) < thr * 3 ? 1 : 0;
    return d;
  }
  function group(vals, gap = 4) {                       // gom các toạ độ liền nhau thành 1 đường
    const out = [];
    vals.forEach((v) => { const g = out[out.length - 1]; if (g && v.pos - g.last <= gap) { g.last = v.pos; g.items.push(v); } else out.push({ first: v.pos, last: v.pos, items: [v] }); });
    return out.map((g) => ({ pos: Math.round((g.first + g.last) / 2), x0: Math.min(...g.items.map((i) => i.x0)), x1: Math.max(...g.items.map((i) => i.x1)) }));
  }
  function findGrid(img) {
    const W = img.width, H = img.height, d = darkMap(img, 190);          // ngưỡng nhạt hơn: đường kẻ mảnh khi vẽ lại bị mờ (xám)
    const hs = [];
    for (let y = 0; y < H; y++) {                       // run tối dài nhất trên mỗi hàng điểm ảnh (cho phép đứt ≤ 3px)
      let best = 0, bx = 0, run = 0, start = 0, miss = 0;
      for (let x = 0; x < W; x++) {
        if (d[y * W + x]) { if (!run) start = x; run = x - start + 1; miss = 0; }
        else if (run && ++miss > 3) { if (run > best) { best = run; bx = start; } run = 0; miss = 0; }
      }
      if (run > best) { best = run; bx = start; }
      if (best >= W * 0.35) hs.push({ pos: y, x0: bx, x1: bx + best });
    }
    const lines = group(hs);
    // nhóm các đường ngang cùng mép trái/phải → bảng; chọn nhóm nhiều đường nhất
    const sets = [];
    lines.forEach((l) => {
      const s = sets.find((t) => Math.abs(t.x0 - l.x0) < 25 && Math.abs(t.x1 - l.x1) < 25 && l.pos - t.ys[t.ys.length - 1] < H * 0.08);
      if (s) s.ys.push(l.pos); else sets.push({ x0: l.x0, x1: l.x1, ys: [l.pos] });
    });
    const t = sets.sort((a, b) => b.ys.length - a.ys.length)[0];
    if (!t || t.ys.length < 3) return null;
    const top = t.ys[0], bot = t.ys[t.ys.length - 1];
    const vs = [];
    for (let x = Math.max(0, t.x0 - 5); x <= Math.min(W - 1, t.x1 + 5); x++) {
      let c = 0; for (let y = top; y <= bot; y++) { const i = y * W + x; c += (d[i] || d[i - 1] || d[i + 1]) ? 1 : 0; }   // đường mảnh: xét cả 2 điểm ảnh bên cạnh
      if (c >= (bot - top) * 0.7) vs.push({ pos: x, x0: x, x1: x });
    }
    const xs = group(vs).map((v) => v.pos);
    return { ys: t.ys, xs, x0: t.x0, x1: t.x1 };
  }

  /* ---------- sửa mã theo danh mục ---------- */
  const canon = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '')
    .replace(/[OQD]/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2').replace(/G/g, '6');
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m || !n) return m + n;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function fixModel(raw, models) {
    const r = String(raw || '').toUpperCase().replace(/[^A-Z0-9/.-]/g, '');
    if (!r) return { model: '', fixed: false };
    if (models.includes(r)) return { model: r, fixed: false };
    const c = canon(r);
    const scored = models.map((m) => ({ m, d: lev(c, canon(m)) })).sort((a, b) => a.d - b.d);
    if (scored.length && scored[0].d <= (c.length >= 8 ? 2 : 1) && (scored.length === 1 || scored[1].d > scored[0].d)) return { model: scored[0].m, fixed: true };
    return { model: r, fixed: false, unknown: true };
  }

  /* ---------- đọc số trong ô ---------- */
  const cleanNum = (s) => { const t = String(s || '').replace(/[^\d.,]/g, ''); const n = P.num(t); return isFinite(n) ? n : NaN; };

  async function readPo(img0, recognize0, models = [], onProgress) {
    const warnings = [];
    const angle = skewAngle(img0);
    const img = rotate(img0, angle);
    const recognize = (rect, mode) => recognize0(crop(img, rect), mode);
    const grid = findGrid(img);
    if (!grid || grid.xs.length < 4) return { rows: [], angle, warnings: ['Không tìm thấy bảng hàng có kẻ ô trong ảnh.'] };
    const { ys, xs } = grid;
    const pad = 4;
    const cell = (r, c) => ({ left: xs[c] + pad, top: ys[r] + pad, width: xs[c + 1] - xs[c] - 2 * pad, height: ys[r + 1] - ys[r] - 2 * pad });
    // 1. tiêu đề cột
    const heads = [];
    for (let c = 0; c + 1 < xs.length; c++) heads.push(await recognize(cell(0, c), 'header'));
    const find = (re) => heads.findIndex((h) => re.test(h));
    const col = { model: find(/MODEL|M[ÃA] S[ẢA]N/i), qty: find(/QTY|L[ƯU]?[OỢ]NG/i), price: find(/PRICE|[ĐD][OƠ]N GI/i), value: find(/VALUE|GI[ÁA] TR/i) };
    if (Object.values(col).some((v) => v < 0)) {
      warnings.push(`Không nhận ra đủ tiêu đề cột (${heads.map((h) => h.replace(/\s+/g, ' ').trim()).join(' | ')}).`);
      return { rows: [], warnings };
    }
    // 2. từng dòng hàng
    const rows = [];
    const uniq = [...new Set(models.map((m) => String(m).toUpperCase()))];
    const nRows = ys.length - 1;
    for (let r = 1; r < nRows; r++) {
      if (onProgress) onProgress(r, nRows - 1);
      const raw = (await recognize(cell(r, col.model), 'model')).trim();
      if (!raw) continue;
      const qty = cleanNum(await recognize(cell(r, col.qty), 'num'));
      const price = cleanNum(await recognize(cell(r, col.price), 'num'));
      const value = cleanNum(await recognize(cell(r, col.value), 'num'));
      const fm = fixModel(raw, uniq);
      const row = { model: fm.model, raw, qty, price, value, ok: false, fixed: fm.fixed, unknown: !!fm.unknown, note: '' };
      const near = (a, b) => Math.abs(a - b) <= Math.max(1, b * 1e-6);
      if (qty > 0 && price > 0 && value > 0 && near(qty * price, value)) row.ok = true;
      else if (price > 0 && value > 0 && Number.isInteger(value / price)) { row.note = `SL đọc được "${isFinite(qty) ? qty : '?'}" → suy ra ${value / price} từ thành tiền`; row.qty = value / price; row.ok = true; row.fixed = true; }
      else if (qty > 0 && value > 0 && Number.isInteger(value / qty) && value / qty >= 1000) { row.note = `Đơn giá đọc được "${isFinite(price) ? price : '?'}" → suy ra ${value / qty}`; row.price = value / qty; row.ok = true; row.fixed = true; }
      else if (qty > 0 && price > 0) { row.note = `Không đọc được thành tiền để đối chiếu`; row.value = qty * price; }
      else row.note = 'Không đọc đủ SL / đơn giá — nhập tay';
      rows.push(row);
    }
    // 3. tổng tiền trước VAT: ô ngay dưới bảng, cột thành tiền
    let total = NaN;
    const h = ys[ys.length - 1] - ys[ys.length - 2];
    const below = { left: xs[col.value] + pad, top: ys[ys.length - 1] + pad, width: xs[col.value + 1] - xs[col.value] - 2 * pad, height: Math.round(h * 1.1) };
    if (below.top + below.height < img.height) total = cleanNum(await recognize(below, 'num'));
    // 4. số PO, ngày PO ở phần đầu trang
    let poNo = '', poDate = '';
    const headText = await recognize({ left: Math.round(img.width * 0.5), top: 0, width: Math.round(img.width * 0.5), height: Math.min(ys[0], Math.round(img.height * 0.3)) }, 'text');
    const ht = headText.replace(/[|]/g, ' ');
    const mNo = ht.match(/(?:Master\s*PO\s*Number|PO\s*N(?:o|umber)|S[ốo]\s*[ĐD][ơo]n\s*H[àa]ng)\s*[:.]?\s*([A-Z0-9][A-Z0-9/-]{4,})/i);
    if (mNo) poNo = mNo[1];
    const mDate = ht.match(/PO\s*Date\s*[:.]?\s*(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})/i);
    if (mDate) poDate = P.date(mDate[1]);
    return { rows, total, poNo, poDate, heads, warnings, grid, angle, headText };
  }

  const api = { readPo, findGrid, fixModel, canon, skewAngle, rotate, crop };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PoOcr = api;
})(typeof window !== 'undefined' ? window : globalThis);
