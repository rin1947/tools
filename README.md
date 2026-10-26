# 🐼 Gấu Bép

Mấy tool web nhỏ tự làm cho mua hàng, sourcing và nhập khẩu hàng gia dụng. Dùng cá nhân.
Giao diện hồng · xanh tre · gấu trúc. Chạy hoàn toàn trên trình duyệt, không cần cài đặt. Dữ liệu nhập chỉ lưu trên máy (localStorage), không gửi đi đâu.

## Danh sách tool

| Tool | Mô tả | Trạng thái |
|---|---|---|
| 🚢 [Landed Cost Nhập Khẩu](tools/landed-cost/) (v10) | Giá về kho theo mã HS, C/O (MFN / ACFTA / RCEP), cước cont, QCVN 04/09, hiệu suất năng lượng, ATTP. Tra cứu HS, nhập từ Excel ([file mẫu](tools/landed-cost/Mau-Import-San-Pham.xlsx)), xuất Excel. Lưu tên/địa chỉ nhà máy, cảng đi, thông số kỹ thuật (chỉ trên máy) | Đang dùng |
| 🧾 [PA giá & Đề nghị thanh toán](tools/cost-payment/) | Kéo thả hoá đơn điện tử (PDF / XML) → tự đọc số HĐ, ngày, từng dòng phí, tiền thuế đúng hoá đơn (không làm tròn) và tự chọn người nhận theo MST. Ra bảng kê chi phí, phương án giá vốn, phiếu đề nghị thanh toán (in / xuất Excel). Nạp tờ khai ECUS để lấy hàng hoá, tỷ giá tính thuế, cước, bảo hiểm. Thông tin công ty, logo, danh bạ STK nhập ở ⚙️ Cài đặt — chỉ lưu trên máy | Đang dùng |
| 📦 [Phiếu nhập kho & File MISA](tools/po-receipt/) | Nạp file Excel PO / lịch giao ([file mẫu](tools/po-receipt/Mau-Nhap-PO.xlsx)), dán bảng từ email, hoặc nạp PO / hoá đơn PDF có chữ, XML → tự tra tên hàng, số khối, giá gần nhất theo danh mục (nạp từ file data sản phẩm NCC, nạp lại bản mới để cập nhật số khối) → chia đợt giao (phần chưa giao dồn sang đợt "chờ giao") → kiểm tra SL từng mã, tổng tiền so với PO → xuất **Phiếu đề nghị nhập kho** (.xlsx) và **file nhập đơn mua hàng MISA** (.xls), số đơn hàng = tên lô. Mở lại phiếu / file MISA cũ để sửa khi PO điều chỉnh. Tên công ty, NCC, MST, danh mục hàng nhập ở ⚙️ Cài đặt / 📚 Danh mục — chỉ lưu trên máy | Đang dùng |

## Cách dùng

- **Online:** https://rin1947.github.io/tools/
- **Offline:** tải repo về, mở file `index.html` bằng Chrome/Edge.

## Cấu trúc mỗi tool

Mỗi tool nằm trong `tools/<tên-tool>/`, tách riêng:
- `index.html` — giao diện
- `style.css` — màu sắc, bố cục
- `app.js` — logic tính toán
- `*-data.js` — dữ liệu tham chiếu (nếu có, vd biểu thuế)

## Thêm tool mới

Đọc [`AGENTS.md`](AGENTS.md). Khi nhờ AI, chỉ cần nói:

> Đọc AGENTS.md trong repo rồi làm tool **[tên tool]**: [mô tả tool cần làm gì, nhập gì, ra gì].

AI sẽ copy `_template/`, làm theo đúng khuôn giao diện và tự thêm card vào trang chủ.

## 🔒 Bảo mật — đọc kỹ

Repo này **công khai**: ai cũng xem được mọi file và lịch sử thay đổi. Vì vậy:

- **Không bao giờ** đưa lên repo: giá mua thật, báo giá nhà cung cấp, tên NCC / công ty / người liên hệ, file Excel mua hàng, hoá đơn, tờ khai, mật khẩu, link Google Sheet riêng.
- **Dữ liệu thật bạn tự nhập hoặc tự nạp file ngay trong tool.** Tool chỉ lưu trên trình duyệt của máy bạn, không gửi đi đâu, người khác mở link cũng **không thấy**.
- Vì dữ liệu nằm trên trình duyệt: **đổi máy, đổi trình duyệt, hoặc xoá lịch sử duyệt web** thì phải nhập / nạp lại. Nên giữ bản Excel gốc trên máy hoặc Drive riêng.
- Khi nhờ AI làm tool, AI phải tuân thủ mục **0. Bảo mật** trong `AGENTS.md`: có gì nhạy cảm thì hỏi bạn, không tự đưa lên.

## Lưu ý

- **PA giá & Đề nghị thanh toán**: tên công ty, MST, logo, người đề nghị, **số tài khoản người nhận** và dữ liệu lô **không có trong repo** — bạn tự nhập ở ⚙️ Cài đặt, chỉ lưu trên trình duyệt. Nên bấm *Tải bản sao lưu (.json)* và cất vào Drive riêng (file `.json` này **không** đưa lên repo).

- **Phiếu nhập kho & File MISA**: tên công ty, nhà cung cấp (mã NCC, địa chỉ, MST), tiền tố mã hàng, **danh mục hàng hoá** (mã, tên, số khối, giá gần nhất) và các PO đã làm **không có trong repo** — bạn nhập ở ⚙️ Cài đặt và nạp file ở 📚 Danh mục hàng, chỉ lưu trên trình duyệt. Nên bấm *Tải bản sao lưu (.json)* và cất vào Drive riêng (không đưa lên repo).

- **Landed Cost** có biểu thuế sẵn trong `tools/landed-cost/tariff-data.js`. Khi có biểu thuế mới: nạp file ở tab *Thay đổi & cập nhật* (lưu trên máy), hoặc nhờ AI tạo lại file dữ liệu và tăng phiên bản.
- **Không** commit dữ liệu thật (file mua hàng, hoá đơn, giá NCC) vào repo — repo đang public.
