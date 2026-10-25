/* Trang chủ Gấu Bép — vẽ hero và lưới card từ tools.js */
GauBep.mountLayout();
document.getElementById('hero').innerHTML = `
  ${GauBep.panda(96).replace('<svg ', '<svg class="panda-big" ')}
  <div>
    <h1>Gấu Bép chào bạn! 🎋</h1>
    <p>Mấy tool nhỏ tự làm cho mua hàng, sourcing &amp; nhập khẩu. Chọn một tool để bắt đầu nhé.</p>
  </div>
  ${GauBep.bamboo()}`;

const STATUS = { live: ['live', 'Đang dùng'], beta: ['beta', 'Thử nghiệm'], soon: ['soon', 'Sắp có'] };
const tools = window.TOOLS || [];
const cats = ['Tất cả', ...new Set(tools.map(t => t.category).filter(Boolean))];
let cat = 'Tất cả', q = '';

document.getElementById('cats').innerHTML = cats.map(c =>
  `<button class="chip${c === cat ? ' active' : ''}" data-c="${c}">${c}</button>`).join('');
document.getElementById('cats').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  cat = b.dataset.c;
  document.querySelectorAll('.chip').forEach(x => x.classList.toggle('active', x === b));
  render();
});
document.getElementById('q').addEventListener('input', e => { q = e.target.value.toLowerCase(); render(); });

function render() {
  const list = tools.filter(t =>
    (cat === 'Tất cả' || t.category === cat) &&
    (!q || (t.name + ' ' + t.description).toLowerCase().includes(q)));
  document.getElementById('grid').innerHTML = list.length ? list.map(t => {
    const [cls, label] = STATUS[t.status] || STATUS.live;
    return `
      <a class="card tool-card${t.status === 'soon' ? ' disabled' : ''}" href="${t.path}">
        <div class="meta"><span class="tool-icon">${t.icon}</span><span class="badge ${cls}">${label}</span></div>
        <h3>${t.name}</h3>
        <p>${t.description}</p>
        <div class="meta muted" style="font-size:12px"><span>${t.category || ''}</span><span>${t.updated ? 'Cập nhật ' + t.updated : ''}</span></div>
      </a>`;
  }).join('') : `<div class="empty">🐼 Chưa có tool nào khớp…</div>`;
}
render();
