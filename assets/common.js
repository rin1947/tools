/* =========================================================
   Gấu Bép — common.js (dùng chung cho mọi tool)
   Cung cấp object global `GauBep`:
     GauBep.mountLayout({ title, icon })  → vẽ header + footer
     GauBep.panda(size)                   → SVG gấu trúc
     GauBep.bamboo()                      → SVG nhánh tre
     GauBep.fmt.vnd(n) / num(n, d) / pct(n)
     GauBep.parseNum(str)
     GauBep.store.get(key, fallback) / set(key, value)
     GauBep.exportXlsx(filename, sheets)  → sheets = [{ name, rows: [[...]], colWidths? }]
     GauBep.toast(msg)
   Đường dẫn gốc: GauBep.root (tự tính theo vị trí common.js)
   ========================================================= */
(function () {
  const script = document.currentScript;
  const root = script ? script.src.replace(/assets\/common\.js.*$/, '') : '../../';

  const panda = (size = 42) => `
<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="22" cy="24" r="14" fill="#2b2b33"/><circle cx="78" cy="24" r="14" fill="#2b2b33"/>
  <circle cx="22" cy="24" r="6" fill="#ff8fb1"/><circle cx="78" cy="24" r="6" fill="#ff8fb1"/>
  <ellipse cx="50" cy="56" rx="38" ry="35" fill="#fff" stroke="#2b2b33" stroke-width="3"/>
  <ellipse cx="34" cy="52" rx="10" ry="13" transform="rotate(-20 34 52)" fill="#2b2b33"/>
  <ellipse cx="66" cy="52" rx="10" ry="13" transform="rotate(20 66 52)" fill="#2b2b33"/>
  <circle cx="36" cy="51" r="4" fill="#fff"/><circle cx="64" cy="51" r="4" fill="#fff"/>
  <circle cx="37" cy="52" r="2" fill="#2b2b33"/><circle cx="63" cy="52" r="2" fill="#2b2b33"/>
  <ellipse cx="50" cy="66" rx="6" ry="4" fill="#2b2b33"/>
  <path d="M44 73 Q50 78 56 73" fill="none" stroke="#2b2b33" stroke-width="2.5" stroke-linecap="round"/>
  <ellipse cx="25" cy="68" rx="7" ry="4" fill="#ffc8d8"/><ellipse cx="75" cy="68" rx="7" ry="4" fill="#ffc8d8"/>
</svg>`;

  const bamboo = () => `
<svg class="bamboo-deco" viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g stroke="#4a8a32" stroke-width="2">
    <rect x="70" y="0" width="14" height="140" rx="6" fill="#7dbb5a"/>
    <line x1="70" y1="40" x2="84" y2="40"/><line x1="70" y1="85" x2="84" y2="85"/>
    <rect x="96" y="20" width="11" height="120" rx="5" fill="#9fd07f"/>
    <line x1="96" y1="65" x2="107" y2="65"/><line x1="96" y1="105" x2="107" y2="105"/>
  </g>
  <path d="M70 40 Q40 30 22 44 Q46 50 70 40Z" fill="#7dbb5a"/>
  <path d="M70 85 Q38 82 18 98 Q46 100 70 85Z" fill="#9fd07f"/>
  <path d="M96 65 Q78 50 58 54 Q78 68 96 65Z" fill="#7dbb5a"/>
</svg>`;

  function mountLayout(opts = {}) {
    const { title = '', icon = '' } = opts;
    const header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML = `
      <div class="container">
        <a class="brand" href="${root}index.html">${panda(42)}
          <span class="brand-name">Gấu Bép<small>Tool cá nhân · mua hàng &amp; nhập khẩu</small></span>
        </a>
        <span class="header-spacer"></span>
        ${title ? `<span class="crumb"><a href="${root}index.html">Trang chủ</a> / ${icon} ${title}</span>` : ''}
      </div>`;
    document.body.prepend(header);
    const footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML = `🎋 Gấu Bép · làm bằng ❤️ và lá tre`;
    document.body.append(footer);
    if (title) document.title = `${title} · Gấu Bép`;
  }

  const nf = (d) => new Intl.NumberFormat('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = {
    vnd: (n) => (isFinite(n) ? nf(0).format(Math.round(n)) : '–'),
    num: (n, d = 2) => (isFinite(n) ? nf(d).format(n) : '–'),
    pct: (n, d = 1) => (isFinite(n) ? nf(d).format(n) + '%' : '–'),
  };
  // Chấp nhận "1.234,5" (VN) hoặc "1,234.5" (EN) hoặc số thường
  function parseNum(v) {
    if (typeof v === 'number') return v;
    if (v == null) return 0;
    let s = String(v).trim().replace(/\s/g, '');
    if (!s) return 0;
    if (/,\d{1,2}$/.test(s) && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    else s = s.replace(/,/g, s.includes('.') ? '' : '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('gaubep:' + key); return v ? JSON.parse(v) : fallback; }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('gaubep:' + key, JSON.stringify(value)); } catch (e) { /* bỏ qua */ }
    },
  };

  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => res(window.XLSX);
      s.onerror = () => rej(new Error('Không tải được thư viện Excel (kiểm tra mạng).'));
      document.head.append(s);
    });
  }

  async function exportXlsx(filename, sheets) {
    try {
      const XLSX = await loadSheetJS();
      const wb = XLSX.utils.book_new();
      sheets.forEach((sh) => {
        const ws = XLSX.utils.aoa_to_sheet(sh.rows);
        if (sh.colWidths) ws['!cols'] = sh.colWidths.map((w) => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
      });
      XLSX.writeFile(wb, filename);
      toast('Đã xuất file Excel 🎉');
    } catch (e) {
      toast(e.message);
    }
  }

  let toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.append(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  const today = () => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(2)}`;
  };

  window.GauBep = { root, panda, bamboo, mountLayout, fmt, parseNum, store, exportXlsx, toast, today };
})();
