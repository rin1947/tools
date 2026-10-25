/* =========================================================
   __TOOL_NAME__ — mô tả ngắn + công thức chính ở đây
   ========================================================= */
(function () {
  const { fmt, parseNum, store } = GauBep;
  GauBep.mountLayout({ title: '__TOOL_NAME__', icon: '__ICON__' });
  document.getElementById('bamboo').outerHTML = GauBep.bamboo();

  const KEY = '__tool-id__:v1';           // khoá lưu localStorage, đổi theo id tool
  const DEFAULT = { example: '0' };
  let state = { ...DEFAULT, ...store.get(KEY, {}) };

  const input = document.getElementById('example');
  input.value = state.example;
  input.addEventListener('input', () => { state.example = input.value; compute(); });

  let last;
  function compute() {
    store.set(KEY, state);
    const x = parseNum(state.example);
    last = { x, result: x * 2 };          // ← thay bằng công thức thật
    document.getElementById('kpis').innerHTML = `
      <div class="kpi accent"><div class="label">Kết quả</div><div class="value">${fmt.vnd(last.result)}</div></div>`;
  }

  document.getElementById('btnSample').onclick = () => { state = { example: '1000000' }; input.value = state.example; compute(); };
  document.getElementById('btnReset').onclick = () => { state = { ...DEFAULT }; input.value = state.example; compute(); };
  document.getElementById('btnExport').onclick = () =>
    GauBep.exportXlsx(`__TenFile___${GauBep.today()}.xlsx`, [
      { name: 'Kết quả', rows: [['Đầu vào', 'Kết quả'], [last.x, last.result]], colWidths: [20, 20] },
    ]);

  compute();
})();
