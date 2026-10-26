# AGENTS.md — Hướng dẫn cho AI khi làm việc trong repo này

> AI (Claude, ChatGPT, Copilot, Cursor…) **đọc hết file này trước khi sửa hay thêm tool**.
> Người dùng chỉ cần nói: *"Đọc AGENTS.md rồi làm tool X"*.

## 0. BẢO MẬT — ƯU TIÊN CAO NHẤT (đọc trước mọi thứ)

> Repo này **PUBLIC**: bất kỳ ai trên Internet cũng đọc được **mọi file và toàn bộ lịch sử commit**.
> Người dùng **không biết code** → AI phải tự giữ an toàn, và khi có gì nhạy cảm thì **dừng lại hỏi**, không tự quyết.
> Khi bảo mật mâu thuẫn với tiện lợi → **chọn bảo mật**.

### 0.1. TUYỆT ĐỐI không đưa lên repo
- **Thông tin cá nhân:** họ tên thật, email, số điện thoại, địa chỉ, CCCD, ảnh cá nhân.
- **Thông tin công ty / đối tác:** tên công ty, tên nhà cung cấp, người liên hệ, địa chỉ kho, mã số thuế, số hợp đồng / PO / hoá đơn / tờ khai.
- **Số liệu kinh doanh thật:** giá mua FOB/EXW thật, báo giá NCC, giá cước forwarder đã đàm phán, chi phí thử nghiệm thật, giá bán, biên lợi nhuận, doanh số, tồn kho, mã SKU thật, model sản phẩm đang phát triển.
- **Bí mật kỹ thuật:** mật khẩu, API key, token, link Google Sheet / Drive riêng, ID file nội bộ.
- **File dữ liệu:** Excel / CSV / PDF / Word / ảnh chụp chứng từ, ảnh sản phẩm chưa ra mắt.

### 0.2. Thông tin nhạy cảm thì để ở đâu
- **Trên trình duyệt của người dùng** (localStorage / IndexedDB): tool phải có ô nhập hoặc nút **"Nạp file"** để người dùng **tự nhập / tự upload**, tool tự lưu lại trên máy. Không gửi đi đâu.
- **Giá trị mặc định trong code** chỉ được là **số minh hoạ / số công khai** (tỷ giá công bố, thuế suất theo văn bản pháp luật). Sản phẩm ví dụ phải ghi rõ "(ví dụ)" và dùng mã giả `VD-…`.
- Nếu tool **cần** dữ liệu nhạy cảm mới chạy được → làm tính năng nạp file / nhập tay, và **ghi chú rõ cho người dùng** (trong README mục "Bảo mật" và trong tool) rằng phần đó họ **tự upload và chỉ lưu trên máy**.

### 0.3. Khi người dùng gửi file / nội dung cho AI
- File người dùng gửi (vd tool HTML, file Excel mẫu) **phải rà trước khi commit**: tìm tên công ty, NCC, email, số điện thoại, giá thật, mã SP thật, metadata tác giả trong file Office.
- Có nghi ngờ → **không commit phần đó**, liệt kê cho người dùng bằng lời dễ hiểu và **hỏi**.
- Thông tin AI biết về người dùng từ cuộc trò chuyện (công ty, chức danh, dự án, sản phẩm đang làm) **không** được viết vào repo.

### 0.4. Git
- Commit bằng tên `rin1947` và email **`rin1947@users.noreply.github.com`** — không bao giờ dùng email thật.
- Đã lỡ đẩy thông tin nhạy cảm lên: **xoá file thôi là CHƯA đủ** (lịch sử vẫn còn) → báo ngay cho người dùng, đề xuất viết lại lịch sử + force push, và nhắc đổi mật khẩu / key nếu là bí mật.

### 0.5. Kiểm tra trước MỖI lần push
```bash
git diff --cached --name-only        # chỉ có file code/doc, không có .xlsx/.csv/.pdf/ảnh lạ
git log -3 --format='%an <%ae>'      # phải là rin1947@users.noreply.github.com
git diff --cached | grep -inE '@gmail|@yahoo|0[0-9]{9}|\+84|password|mật khẩu|api[_-]?key|token|docs.google|drive.google'
```
Lệnh cuối **không được ra kết quả** nào (trừ khi đã xác nhận là vô hại).

## 1. Repo này là gì

**Gấu Bép** — bộ tool web tĩnh **cá nhân** phục vụ công việc mua hàng, sourcing và nhập khẩu hàng gia dụng.
Tên thương hiệu hiển thị là **Gấu Bép** (không dùng tên công ty trong giao diện).

- **Người dùng:** chỉ một người, rành nghiệp vụ mua hàng nhưng **không biết code** → giao diện tiếng Việt, gọn, ưu tiên nhập nhanh; chú thích `?` chỉ đặt ở ô thật sự dễ nhầm.
- **Công nghệ:** HTML + CSS + JavaScript thuần. **Không** framework, **không** build step, **không** backend, **không** npm.
- **Repo PUBLIC**, xuất bản bằng GitHub Pages (`https://rin1947.github.io/tools/`). Ai có link đều xem được code → tuyệt đối không đưa dữ liệu thật vào repo.
- **Chạy được** bằng cách mở thẳng file `index.html` trong trình duyệt và trên GitHub Pages.
- **Dữ liệu** người dùng nhập chỉ nằm trên trình duyệt (localStorage). **Không** gửi dữ liệu đi đâu.

## 2. Cấu trúc thư mục

```
/
├── index.html            Trang chủ: lưới card, đọc từ tools.js — KHÔNG sửa khi thêm tool
│                         (style: assets/home.css · logic: assets/home.js)
├── tools.js              Danh sách tool (registry) — THÊM 1 object khi có tool mới
├── assets/
│   ├── theme.css         Toàn bộ màu, font, component dùng chung
│   └── common.js         Object global GauBep (header, format số, Excel, lưu trữ…)
├── _template/            Khuôn tool trống — COPY thư mục này để tạo tool mới
│   ├── index.html
│   ├── app.js
│   └── style.css
├── tools/
│   └── <tool-id>/        Mỗi tool một thư mục, tên kebab-case tiếng Anh
│       ├── index.html    GIAO DIỆN: chỉ HTML, không <style>, không <script> nội tuyến
│       ├── style.css     STYLE riêng của tool
│       ├── app.js        LOGIC: tính toán, xử lý sự kiện, xuất Excel
│       └── *-data.js     DỮ LIỆU tham chiếu (nếu có), dạng window.TEN_BIEN = ...
├── AGENTS.md             File này
└── README.md             Giới thiệu cho người
```

## 3. Quy trình thêm tool mới (làm đúng thứ tự)

1. **Chọn `tool-id`**: kebab-case tiếng Anh, ngắn (vd `slow-moving-stock`, `supplier-compare`).
2. **Copy** `_template/` → `tools/<tool-id>/`.
3. Trong 3 file mới, **thay hết placeholder**:
   - `__TOOL_NAME__` → tên tiếng Việt (vd "Phân tích hàng chậm bán")
   - `__ICON__` → 1 emoji
   - `__tool-id__` → tool-id (khoá localStorage, giữ hậu tố `:v1`)
   - `__TenFile__` → tiền tố tên file Excel, không dấu (vd `HangCham`)
   - `__MÔ TẢ…__` → 1–2 câu mô tả
4. **Viết logic** trong `app.js`; ghi **công thức tính** ở comment đầu file.
5. **Thêm vào `tools.js`**:
   ```js
   {
     id: 'tool-id',
     name: 'Tên tiếng Việt',
     icon: '📦',
     description: '1 câu: tool làm gì (≤ 140 ký tự).',
     path: 'tools/tool-id/index.html',
     status: 'live',          // live | beta | soon
     category: 'Nhập khẩu',   // dùng lại category có sẵn nếu hợp: Nhập khẩu, Sourcing, Kho, Báo cáo
     updated: 'YYYY-MM-DD',
   },
   ```
6. **Kiểm tra** theo checklist mục 7.
7. Cập nhật bảng tool trong `README.md`.

### Nguyên tắc tách file (bắt buộc với mọi tool)

**Giao diện, style, logic, dữ liệu luôn ở file riêng.** Không nhét CSS/JS/dữ liệu vào `index.html`.
Người dùng có thể gửi tool dạng **một file HTML** (vd bản landed cost mới) → AI phải **tách ra** đúng cấu trúc trên trước khi commit.

### Tool `landed-cost` (bản v10 của người dùng)

Phát triển riêng bởi người dùng, đã tách thành:
| File | Nội dung |
|---|---|
| `index.html` | Giao diện: 4 tab (Tính giá, Tra cứu HS, Thay đổi & cập nhật, Cách tính) |
| `style.css` | Style: khối `:root` ánh xạ biến cũ (`--bg, --ink, --accent, --steel…`) sang bảng màu Gấu Bép + khối "Lớp giao diện Gấu Bép" cuối file |
| `app.js` | Logic gốc v10 (giữ nguyên) + 2 dòng cuối gọi `GauBep.mountLayout()` và gắn gấu trúc vào tiêu đề |
| `tariff-data.js` | Biểu thuế XNK nén gzip + base64: `window.LC_TARIFF_B64` (app.js đọc ở 1 chỗ duy nhất) |
| `Mau-Import-San-Pham.xlsx` | File mẫu import rỗng (được phép commit, xem `.gitignore`) |

- **Không** viết lại logic v10; **không** sửa `tariff-data.js` trừ khi được yêu cầu cập nhật biểu thuế.
- Khi người dùng gửi **phiên bản mới** (v11…, thường là 1 file HTML): tách `<style>` → `style.css`, `<script id="tdata">` → `tariff-data.js`, script chính → `app.js` (đổi `document.getElementById('tdata').textContent` thành `window.LC_TARIFF_B64`), phần còn lại → `index.html`; rồi áp lại lớp giao diện Gấu Bép như trên. **Chạy bản gốc và bản tách, so bảng Tổng hợp phải ra cùng số.** Cập nhật `tools.js`, README, ngày `updated`.

## 4. Quy tắc giao diện (bắt buộc)

Phong cách: **hồng cute · xanh tre · gấu trúc**. Mềm, bo tròn, thân thiện nhưng số liệu phải rõ.

- **Chỉ dùng biến CSS** trong `assets/theme.css` (`var(--accent)`, `var(--pink-400)`…). **Không** viết mã màu cứng trong tool, trừ khi thêm biến mới vào `theme.css`.
- **Font:** Nunito (đã import trong theme). Không đổi.
- **Luôn gọi** `GauBep.mountLayout({ title, icon })` để có header/footer chung.
- **Bố cục tool:** `hero` → `toolbar` → các `section.card` đánh số bước (`.section-title .num`) → kết quả.
- **Component có sẵn** — dùng lại, không tự chế:

| Mục đích | Class |
|---|---|
| Khung nội dung | `.card` |
| Tiêu đề bước | `h2.section-title > span.num` |
| Lưới ô nhập | `.form-grid > .field > label + input` |
| Chú thích | `<span class="hint" tabindex="0" data-tip="...">?</span>` |
| Nút | `.btn` + `.btn-primary` (hành động chính) / `.btn-pink` (thêm) / `.btn-ghost` (phụ), `.btn-sm` |
| Bảng | `.table-wrap > table`, cột số dùng `td.num` / `th.num` |
| Số tổng nổi bật | `.kpis > .kpi` (`.kpi.accent` cho số quan trọng nhất) |
| Nhãn trạng thái | `.badge.live` / `.badge.beta` / `.badge.soon` |
| Ghi chú/cảnh báo | `.note` |
| Ẩn khi in | `.no-print` |

- **Responsive:** phải dùng được trên điện thoại (bảng rộng nằm trong `.table-wrap` để cuộn ngang).
- **Dark mode** đã có sẵn trong theme — chỉ cần dùng biến là tự hoạt động.

## 5. Quy tắc code

- Bọc toàn bộ `app.js` trong `(function () { ... })();` — không tạo biến global (trừ file dữ liệu `window.XXX`).
- **Số tiền:** hiển thị bằng `GauBep.fmt.vnd()`; đọc ô nhập bằng `GauBep.parseNum()` (hiểu cả `1.234,5` và `1,234.5`).
- **Lưu trạng thái:** `GauBep.store.get/set` với khoá `'<tool-id>:v1'`. Đổi cấu trúc dữ liệu → tăng `v2`.
- **Xuất Excel:** `GauBep.exportXlsx(tênFile, [{ name, rows, colWidths }])`. Số xuất ra dạng **number** (không phải chuỗi đã format). Tên file: `<TienTo>_<tên>_<ddmmyy>.xlsx` (dùng `GauBep.today()`).
- **Thư viện ngoài:** chỉ khi thật cần, chỉ lấy từ `cdnjs.cloudflare.com`, và tải lười (lazy) như `loadSheetJS` trong `common.js`.
- **Không** gọi API ngoài với dữ liệu người dùng. **Không** đưa dữ liệu thật (giá, NCC, hoá đơn) vào repo — chỉ dữ liệu mẫu.
- **Dữ liệu tham chiếu** (mã HS, thuế suất, phí…) để ở file `.js` riêng trong thư mục tool, có comment nguồn + trường `checked` cho biết đã đối chiếu hay chưa.
- Tên biến/hàm tiếng Anh; nội dung hiển thị và comment giải thích nghiệp vụ tiếng Việt.

## 6. Nghiệp vụ cần biết

- Hàng chủ yếu nhập từ **Trung Quốc** (1688 / Alibaba), tiền tệ **CNY / USD**.
- **Trị giá tính thuế** = giá CIF (tiền hàng + cước + bảo hiểm tới cửa khẩu VN) × tỷ giá tính thuế.
- **Thuế NK**: MFN nếu không có C/O; **Form E (ACFTA)** nếu có C/O Form E — thường thấp hơn.
- **VAT nhập khẩu** = (trị giá tính thuế + thuế NK) × %VAT; doanh nghiệp được khấu trừ → mặc định **không** tính vào giá vốn.
- Hàng điện gia dụng thường phải **hợp quy an toàn điện + EMC**, một số phải **dán nhãn năng lượng**; đồ tiếp xúc thực phẩm phải **kiểm tra ATTP**.
- Một lô có thể nhiều mã SP → chi phí chung phân bổ theo **CBM / KG / giá trị / số lượng**.

## 7. Checklist trước khi xong

- [ ] Mở `index.html` gốc: card tool mới hiện đúng, bấm vào mở được tool.
- [ ] Trong tool: header có gấu trúc + link về trang chủ.
- [ ] Nút "Nạp dữ liệu mẫu" cho ra kết quả hợp lý; nút "Làm mới" xoá sạch.
- [ ] Tính tay 1 trường hợp đơn giản và so với kết quả của tool.
- [ ] Xuất Excel mở được, số là dạng số.
- [ ] Thu nhỏ còn ~380px: không vỡ layout, không cuộn ngang cả trang.
- [ ] Không có lỗi trong Console.
- [ ] `index.html` không còn `<style>` hay `<script>` nội tuyến (trừ thẻ `<script src>`).
- [ ] Đã thêm vào `tools.js` và `README.md`.
- [ ] **Đã chạy kiểm tra bảo mật mục 0.5** — không có thông tin nhạy cảm.
