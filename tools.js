/* =========================================================
   DANH SÁCH TOOL Gấu Bép — trang chủ đọc file này để vẽ card.
   Thêm tool mới = thêm 1 object vào mảng (xem AGENTS.md).
   status: "live" (đang dùng) | "beta" (thử nghiệm) | "soon" (sắp có, card bị mờ)
   ========================================================= */
window.TOOLS = [
  {
    id: 'landed-cost',
    name: 'Landed Cost Nhập Khẩu',
    icon: '🚢',
    description: 'Giá về kho theo mã HS, C/O (MFN/ACFTA/RCEP), cước cont, kiểm tra chuyên ngành. Tra cứu HS, nhập/xuất Excel. (v9)',
    path: 'tools/landed-cost/index.html',
    status: 'live',
    category: 'Nhập khẩu',
    updated: '2026-10-25',
  },
];
