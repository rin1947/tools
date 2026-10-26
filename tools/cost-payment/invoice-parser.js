/* =========================================================
   Đọc hoá đơn điện tử VN (PDF hoặc XML) → dữ liệu dòng phí
   ---------------------------------------------------------
   InvoiceParser.fromPdfPages(pages)  pages = [[{ s, x, y, w, h }]]  (toạ độ chữ do pdf.js trả về)
   InvoiceParser.fromXml(text)        hoá đơn XML theo chuẩn Tổng cục Thuế (TT78)
   Kết quả: { no, serial, date: 'yyyy-mm-dd', seller, sellerMst, bankAcc, bankName,
              lines: [{ desc, pre, rate (số % | null = không chịu thuế), vat }],
              total, check: true|false|null, warnings: [] }

   Nguyên tắc: lấy ĐÚNG số trên hoá đơn, không làm tròn.
   - Dòng có cột tiền thuế → lấy tiền thuế của dòng.
   - Dòng không có (vd hoá đơn chỉ ghi thuế ở tổng) → chia tổng tiền thuế của hoá đơn
     theo tỷ lệ tiền trước thuế, dòng cuối nhận phần chênh để tổng khớp hoá đơn.
   Dùng chung cho trình duyệt và Node (để kiểm thử).
   ========================================================= */
(function (root) {
  // Số kiểu VN: 1.234.567,89 · "1,000" = 1 · trả NaN nếu không phải số
  function vn(s) {
    const t = String(s ?? '').trim().replace(/\s+/g, '');
    if (!/^-?\(?[\d.,]+\)?$/.test(t) || !/\d/.test(t)) return NaN;
    const neg = /^-|^\(/.test(t);
    const n = parseFloat(t.replace(/[()-]/g, '').replace(/\./g, '').replace(',', '.'));
    return neg ? -n : n;
  }
  const isPct = (s) => /^\d+([.,]\d+)?\s*%$/.test(String(s).trim()) || /^(KCT|KKKNT)$/i.test(String(s).trim());
  const pctVal = (s) => (/^(KCT|KKKNT)$/i.test(String(s).trim()) ? null : vn(String(s).replace('%', '')));
  const r2 = (n) => Math.round(n * 100) / 100;          // chỉ để so sánh, không dùng cho số liệu
  const near = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 1e-6);

  /* ---------- Ghép mảnh chữ của pdf.js thành ô (cell) & dòng ---------- */
  function buildCells(items) {
    const toks = items.filter((t) => String(t.s).trim() !== '')
      .map((t) => ({ ...t, h: t.h || 10 }))
      .sort((a, b) => a.p - b.p || (Math.abs(b.y - a.y) > Math.min(a.h, b.h) * 0.4 ? b.y - a.y : a.x - b.x));
    // nhóm theo dòng (y gần nhau)
    const lines = [];
    toks.forEach((t) => {
      const ln = lines.find((l) => l.p === t.p && Math.abs(l.y - t.y) <= Math.min(l.h, t.h) * 0.4);
      if (ln) ln.toks.push(t); else lines.push({ p: t.p, y: t.y, h: t.h, toks: [t] });
    });
    const cells = [];
    lines.forEach((l) => {
      l.toks.sort((a, b) => a.x - b.x);
      let cur = null;
      l.toks.forEach((t) => {
        const gap = cur ? t.x - (cur.x2) : Infinity;
        if (cur && gap < l.h * 0.55) {
          const sp = gap > l.h * 0.12 && !/\s$/.test(cur.s) && !/^\s/.test(t.s);
          cur.s += (sp ? ' ' : '') + t.s; cur.x2 = Math.max(cur.x2, t.x + (t.w || 0));
        } else {
          cur = { s: t.s, x: t.x, x2: t.x + (t.w || 0), y: l.y, h: l.h, p: t.p };
          cells.push(cur);
        }
      });
    });
    cells.forEach((c) => { c.s = c.s.replace(/\s+/g, ' ').trim(); });
    return cells.filter((c) => c.s);
  }
  function groupLines(cells) {
    const out = [];
    cells.forEach((c) => {
      const l = out.find((o) => o.p === c.p && Math.abs(o.y - c.y) <= c.h * 0.4);
      if (l) l.cells.push(c); else out.push({ p: c.p, y: c.y, h: c.h, cells: [c] });
    });
    out.forEach((l) => { l.cells.sort((a, b) => a.x - b.x); l.text = l.cells.map((c) => c.s).join(' '); });
    return out.sort((a, b) => a.p - b.p || b.y - a.y);
  }

  /* ---------- PDF ---------- */
  function fromPdfPages(pages) {
    const all = [];
    pages.forEach((items, i) => items.forEach((t) => all.push({ ...t, p: i + 1 })));
    const cells = buildCells(all);
    const lines = groupLines(cells);
    const text = lines.map((l) => l.text).join('\n');
    const compact = text.replace(/\s+/g, '');
    const res = { lines: [], warnings: [] };

    // Số, ký hiệu, ngày
    let m = text.match(/Số\s*(?:hóa\s*đơn|hoá\s*đơn|HĐ)?\s*\(\s*(?:Invoice\s*)?No\.?\s*\)\s*:?\s*(\d{1,10})/i);
    if (m) res.no = m[1];
    m = text.match(/Ký\s*hiệu\s*(?:\([^)]*\))?\s*:?\s*([0-9]\s*[A-Z0-9]{5,7})/i);
    if (m) res.serial = m[1].replace(/\s/g, '');
    for (const l of lines) {
      if (!/Ngày|Date/i.test(l.text) || /ký|sign/i.test(l.text)) continue;
      m = l.text.match(/(\d{1,2})\s*(?:\/|tháng[^0-9]*)\s*(\d{1,2})\s*(?:\/|năm[^0-9]*)\s*(\d{4})/i);
      if (m) { res.date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; break; }
    }

    // Người bán: MST đầu tiên trên hoá đơn + tên công ty ngay phía trên
    const mstRe = /Mãsốthuế(?:\([^)]*\))?:?(\d{10}(?:-\d{3})?)/gi;
    const msts = [...compact.matchAll(mstRe)].map((x) => x[1]);
    res.sellerMst = msts[0] || '';
    res.buyerMst = msts[1] || '';
    const mstLine = lines.find((l) => /Mã\s*số\s*thuế/i.test(l.text));
    const isCo = (s) => /^(TỔNG\s+)?CÔNG\s*TY|^CHI\s*NHÁNH/i.test(s) && s === s.toUpperCase();
    if (mstLine) {
      const above = cells.filter((c) => c.p === mstLine.p && c.y > mstLine.y + 1 && isCo(c.s)).sort((a, b) => a.y - b.y);
      const first = above[0];
      if (first) {
        let name = first.s;
        // dòng tiếp theo (cùng lề trái, chữ in hoa, không có ":") là phần nối của tên
        const next = cells.find((c) => c.p === first.p && Math.abs(c.x - first.x) < 3 && c.y < first.y && first.y - c.y < first.h * 2.2
          && c.s === c.s.toUpperCase() && !/:/.test(c.s) && !isCo(c.s) && /[A-ZĐ]/.test(c.s) && !/AGENT|CARRIER/.test(c.s));
        if (next) name += ' ' + next.s;
        res.seller = name.replace(/\s+/g, ' ').trim();
      }
    }
    // Tài khoản ngân hàng người bán
    const tk = lines.find((l) => /(^|\s)(TK|STK|Số\s*TK|Tài\s*khoản)\b(\s*VND)?\s*:/i.test(l.text));
    if (tk) {
      m = tk.text.match(/(?:TK|STK|Số\s*TK|Tài\s*khoản)(?:\s*VND)?\s*:\s*([\d\s.]{6,24}\d)/i);
      if (m) {
        res.bankAcc = m[1].replace(/[\s.]/g, '');
        const after = tk.text.slice(tk.text.indexOf(m[1]) + m[1].length);
        const at = after.match(/tại\s*:?\s*(.+)$/i);
        if (at) res.bankName = at[1].trim();
        else {
          const idx = lines.indexOf(tk); const nx = lines[idx + 1];
          if (nx && /^(NH|Ngân\s*hàng)/i.test(nx.text)) res.bankName = nx.text.trim();
        }
      }
    }
    if (!res.bankAcc) {
      m = text.match(/(\d{8,20}),\s*(Ngân\s*hàng[^\n]+)/i);
      if (m) { res.bankAcc = m[1]; res.bankName = m[2].trim(); }
    }

    // Bảng hàng hoá
    const head = cells.find((c) => /^STT\b/i.test(c.s));
    if (!head) { res.warnings.push('Không tìm thấy bảng hàng hoá (cột STT)'); return finish(res, lines); }
    const p = head.p;
    const H = head.h;
    // tiêu đề chính cùng hàng với "STT" (bỏ dòng phụ tiếng Anh trong ngoặc)
    const headCells = cells.filter((c) => c.p === p && Math.abs(c.y - head.y) < H * 0.8 && c.x > head.x + 5 && !/^\(/.test(c.s))
      .sort((a, b) => a.x - b.x);
    const sttRight = head.x2 + 4;
    const descEnd = headCells[1] ? headCells[1].x - 4 : Infinity;   // đầu cột kế tiếp sau cột diễn giải
    const below = cells.filter((c) => c.p === p && c.y < head.y - H * 0.5);
    const rowOf = (y) => below.filter((c) => Math.abs(c.y - y) < H * 0.4);
    const isIndexRow = (y) => { const rc = rowOf(y); return rc.some((c) => /\d\s*=\s*\d/.test(c.s)) || (rc.length >= 4 && rc.every((c) => /^\d{1,2}$/.test(c.s))); };
    const isStop = (l) => /tổng|cộng|total|sum|bằng chữ|thuế suất gtgt/i.test(l.text);
    const indexYs = below.filter((c) => isIndexRow(c.y)).map((c) => c.y);
    const top = indexYs.length ? Math.min(...indexYs) - 1 : head.y - H * 0.5;
    const stopY = Math.max(-Infinity, ...lines.filter((l) => l.p === p && l.y < top - H * 0.5 && isStop(l)).map((l) => l.y));
    const sttCells = below.filter((c) => c.x >= head.x - 10 && c.x < sttRight + 6 && /^\d{1,3}$/.test(c.s) && !isIndexRow(c.y) && c.y > stopY + 1)
      .sort((a, b) => b.y - a.y);
    const bottom = sttCells.length ? Math.max(stopY + 1, sttCells[sttCells.length - 1].y - H * 8) : 0;
    const zone = below.filter((c) => c.y < top && c.y > bottom && !sttCells.includes(c));

    // Diễn giải: gom các dòng chữ liền nhau thành đoạn, đoạn nào chứa dòng STT thì thuộc dòng hàng đó
    const descCells = zone.filter((c) => c.x > sttRight && c.x < descEnd).sort((a, b) => b.y - a.y || a.x - b.x);
    const paras = [];
    descCells.forEach((c) => {
      const last = paras[paras.length - 1];
      if (last && (Math.abs(last.yMin - c.y) < H * 0.4 || last.yMin - c.y < H * 1.55)) { last.cells.push(c); last.yMin = Math.min(last.yMin, c.y); }
      else paras.push({ yMax: c.y, yMin: c.y, cells: [c] });
    });
    const items = sttCells.map((s, i) => {
      const lo = i < sttCells.length - 1 ? (s.y + sttCells[i + 1].y) / 2 : bottom;
      const hi = i > 0 ? (s.y + sttCells[i - 1].y) / 2 : top;
      return { s, lo, hi, desc: [], nums: zone.filter((c) => c.x >= descEnd && c.y <= hi && c.y > lo).sort((a, b) => a.x - b.x) };
    });
    paras.forEach((pa) => {
      let it = items.find((x) => x.s.y <= pa.yMax + H * 0.5 && x.s.y >= pa.yMin - H * 0.5);
      if (!it) {
        if (items.length && pa.yMin > items[0].s.y + H * 0.5 && !items.some((x) => x.s.y >= pa.yMin - H)) return;   // tiêu đề phụ phía trên
        it = items.slice().sort((a, b) => Math.abs(a.s.y - pa.yMax) - Math.abs(b.s.y - pa.yMax))[0];
      }
      const inside = items.filter((x) => x.s.y <= pa.yMax + H * 0.5 && x.s.y >= pa.yMin - H * 0.5);
      if (inside.length > 1) {   // đoạn chứa nhiều dòng STT → chia từng dòng chữ cho STT gần nhất
        pa.cells.forEach((c) => inside.slice().sort((a, b) => Math.abs(a.s.y - c.y) - Math.abs(b.s.y - c.y))[0].desc.push(c));
        return;
      }
      if (it) it.desc.push(...pa.cells);
    });
    items.forEach((it) => { it.desc = it.desc.sort((a, b) => b.y - a.y || a.x - b.x).map((c) => c.s).join(' '); });

    const docRate = (() => { const mm = text.match(/Thuế\s*suất\s*(?:GTGT|thuế\s*GTGT)?\s*(?:\([^)]*\))?\s*:\s*(\d+(?:[.,]\d+)?)\s*%/i); return mm ? vn(mm[1]) : null; })();
    items.forEach((it) => {
      const pct = it.nums.find((c) => isPct(c.s));
      const money = (arr) => arr.map((c) => vn(c.s)).filter((n) => isFinite(n));
      let pre, rate = docRate, vat = null;
      if (pct) {
        rate = pctVal(pct.s);
        const before = money(it.nums.filter((c) => c.x < pct.x));
        const after = money(it.nums.filter((c) => c.x > pct.x));
        pre = before[before.length - 1];
        if (after.length >= 2) vat = after[0];
        else if (after.length === 1 && isFinite(pre)) {
          if (rate != null && near(after[0], pre * (1 + rate / 100))) vat = after[0] - pre;
          else if (rate != null && near(after[0], pre * rate / 100)) vat = after[0];
        }
      } else {
        const mm = money(it.nums);
        pre = mm[mm.length - 1];
      }
      if (!isFinite(pre)) { res.warnings.push(`Dòng "${it.desc}" không đọc được số tiền`); return; }
      res.lines.push({ desc: it.desc, pre, rate: rate == null ? null : rate, vat });
    });

    // Tổng thanh toán: số lớn nhất trên các dòng "Tổng…/Total" (bỏ dòng bằng chữ)
    const totals = lines.filter((l) => /tổng|total|cộng/i.test(l.text) && !/bằng chữ|in words/i.test(l.text))
      .flatMap((l) => l.cells.map((c) => vn(c.s)).filter((n) => isFinite(n)));
    // dòng tổng chỉ toàn số ngay dưới bảng (MISA)
    const lastItemY = sttCells.length ? sttCells[sttCells.length - 1].y : head.y;
    // (dòng tổng không nhãn của MISA)
    lines.filter((l) => l.p === p && l.y < lastItemY && l.cells.every((c) => isFinite(vn(c.s)) || isPct(c.s)))
      .forEach((l) => l.cells.forEach((c) => { const n = vn(c.s); if (isFinite(n)) totals.push(n); }));
    if (totals.length) res.total = Math.max(...totals);
    return finish(res, lines);
  }

  /* Hoàn thiện: chia thuế còn thiếu theo tổng hoá đơn, kiểm tra khớp */
  function finish(res) {
    const L = res.lines;
    const preSum = L.reduce((a, l) => a + l.pre, 0);
    const missing = L.filter((l) => l.vat == null);
    if (missing.length) {
      const knownVat = L.reduce((a, l) => a + (l.vat || 0), 0);
      if (res.total != null && res.total >= preSum) {
        const pool = r2(res.total - preSum - knownVat);
        const base = missing.reduce((a, l) => a + (l.rate ? l.pre : 0), 0);
        let used = 0;
        const taxed = missing.filter((l) => l.rate);
        missing.forEach((l) => { if (!l.rate) l.vat = 0; });
        taxed.forEach((l, i) => {
          if (i === taxed.length - 1) l.vat = r2(pool - used);
          else {
            const v = base ? pool * l.pre / base : 0;
            l.vat = Number.isInteger(pool) ? Math.round(v) : r2(v);   // hoá đơn VND: tiền thuế từng dòng là số nguyên
            used += l.vat;
          }
        });
      } else {
        missing.forEach((l) => { l.vat = l.rate ? l.pre * l.rate / 100 : 0; });
        res.warnings.push('Không thấy tổng tiền thanh toán — tiền thuế tính theo thuế suất');
      }
    }
    const sum = r2(L.reduce((a, l) => a + l.pre + l.vat, 0));
    res.sum = sum;
    res.check = res.total == null ? null : near(sum, res.total);
    if (res.check === false) res.warnings.push(`Tổng các dòng ${sum} ≠ tổng hoá đơn ${res.total}`);
    if (!L.length) res.warnings.push('Không đọc được dòng hàng hoá/dịch vụ nào');
    return res;
  }

  /* ---------- XML (TT78) ---------- */
  function fromXml(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const q = (el, sel) => { const n = el && el.getElementsByTagName(sel)[0]; return n ? n.textContent.trim() : ''; };
    const nb = doc.getElementsByTagName('NBan')[0];
    const res = {
      no: q(doc, 'SHDon'), serial: (q(doc, 'KHMSHDon') + q(doc, 'KHHDon')), date: q(doc, 'NLap').slice(0, 10),
      seller: q(nb, 'Ten'), sellerMst: q(nb, 'MST'), bankAcc: q(nb, 'STKNHang'), bankName: q(nb, 'TNHang'),
      buyerMst: q(doc.getElementsByTagName('NMua')[0], 'MST'), lines: [], warnings: [],
    };
    const num = (s) => { const n = parseFloat(String(s).replace(',', '.')); return isFinite(n) ? n : 0; };
    [...doc.getElementsByTagName('HHDVu')].forEach((h) => {
      const tchat = q(h, 'TChat');
      if (tchat && !['1', '2', '3'].includes(tchat)) return;          // bỏ dòng ghi chú
      const ts = q(h, 'TSuat');
      const rate = /^(KCT|KKKNT)$/i.test(ts) ? null : num(ts.replace('%', ''));
      let pre = num(q(h, 'ThTien'));
      if (tchat === '3') pre = -pre;                                 // chiết khấu
      let vat = null;
      [...h.getElementsByTagName('TTin')].forEach((t) => { if (/VATAmount|TThue|TienThue/i.test(q(t, 'TTruong'))) vat = num(q(t, 'DLieu')); });
      res.lines.push({ desc: q(h, 'THHDVu'), pre, rate, vat });
    });
    const tt = doc.getElementsByTagName('TToan')[0];
    const total = num(q(tt, 'TgTTTBSo'));
    if (total) res.total = total;
    return finish(res);
  }

  root.InvoiceParser = { fromPdfPages, fromXml, vn };
})(typeof window !== 'undefined' ? window : globalThis);
