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
  {
    id: 'cost-payment',
    name: 'PA giá & Đề nghị thanh toán',
    icon: '🧾',
    description: 'Nhập chi phí lô hàng theo hoá đơn → bảng kê, giá vốn từng mã và phiếu đề nghị thanh toán cho từng người nhận. Nạp tờ khai ECUS.',
    path: 'tools/cost-payment/index.html',
    status: 'live',
    category: 'Nhập khẩu',
    updated: '2026-10-26',
  },
];
