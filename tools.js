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
    description: 'Giá về kho theo mã HS, C/O (MFN/ACFTA/RCEP), cước cont, kiểm tra chuyên ngành. Tra cứu HS, nhập/xuất Excel. (v12)',
    path: 'tools/landed-cost/index.html',
    status: 'live',
    category: 'Nhập khẩu',
    updated: '2026-10-29',
  },
  {
    id: 'cost-payment',
    name: 'PA giá & Đề nghị thanh toán',
    icon: '🧾',
    description: 'Thả hoá đơn PDF/XML + tờ khai ECUS → bảng kê chi phí đúng số HĐ, giá vốn từng mã, phiếu đề nghị thanh toán theo người nhận.',
    path: 'tools/cost-payment/index.html',
    status: 'live',
    category: 'Nhập khẩu',
    updated: '2026-10-26',
  },
  {
    id: 'po-receipt',
    name: 'Phiếu nhập kho & File MISA',
    icon: '📦',
    description: 'Nạp PO scan (OCR) / Excel / lịch giao NCC, so giá hoá đơn → chia đợt → xuất Phiếu đề nghị nhập kho (.xlsx) và file nhập đơn mua hàng MISA (.xls) khớp tên lô.',
    path: 'tools/po-receipt/index.html',
    status: 'live',
    category: 'Kho',
    updated: '2026-10-27',
  },
  {
    id: 'customs-entry',
    name: 'Danh sách hàng khai HQ',
    icon: '🛃',
    description: 'Nạp form Excel (AI điền từ Invoice) → mô tả tiếng Việt, HS từ Landed Cost, tem phụ, linh kiện → xuất DS hàng .xls cho ECUS5.',
    path: 'tools/customs-entry/index.html',
    status: 'beta',
    category: 'Nhập khẩu',
    updated: '2026-10-28',
  },
];
