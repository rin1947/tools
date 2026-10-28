/* =========================================================
   Phiếu khai nhanh ECUS — DỊCH SANG TIẾNG VIỆT cho tem phụ (chạy trên máy, không gọi dịch vụ ngoài)
   ---------------------------------------------------------
   Dịch theo từ điển: tên hàng (EN → VN), tên công ty Trung Quốc (EN → VN), địa chỉ Trung Quốc
   (pinyin → Hán Việt cho tỉnh / thành phố hay gặp). Từ nào không có trong từ điển (thường là tên
   riêng như tên hiệu, tên đường) thì GIỮ NGUYÊN và báo trong `unknown` để người dùng sửa tay.
     ViDict.product('Air Circulation Fan')            → { vi: 'Quạt tuần hoàn không khí', unknown: [] }
     ViDict.company('Ningbo Abc Intelligent Technology Co., Ltd.')
                                                      → { vi: 'Công ty TNHH Công nghệ Thông minh Abc Ninh Ba', unknown: ['Abc'] }
     ViDict.address('NO.298, Abc Road, Binhai Economic Development Zone, Cixi, Ningbo City Zhejiang')
                                                      → { vi: 'Số 298 Đường Abc, Khu Phát triển Kinh tế ven biển, Thành phố Từ Khê, Thành phố Ninh Ba, Tỉnh Chiết Giang, Trung Quốc', ... }
     ViDict.country('CN') → 'Trung Quốc'
   Bổ sung từ: thêm vào PRODUCT / ORG / PLACES bên dưới (chữ thường, không dấu câu).
   Nguồn: tên địa danh Hán Việt thông dụng; checked: đối chiếu tem mẫu của người dùng 27/10/2026.
   ========================================================= */
(function (root) {
  /* Tên hàng — cụm dài đặt trước cụm ngắn */
  const PRODUCT = [
    ['evaporative air cooler', 'máy làm mát không khí bằng bay hơi'], ['air cooler fan', 'quạt điều hòa'], ['air cooler', 'quạt điều hòa'],
    ['air circulation fan', 'quạt tuần hoàn không khí'], ['air circulator fan', 'quạt tuần hoàn không khí'], ['air circulator', 'quạt tuần hoàn không khí'],
    ['circulation fan', 'quạt tuần hoàn không khí'], ['stand fan', 'quạt đứng'], ['standing fan', 'quạt đứng'], ['pedestal fan', 'quạt đứng'],
    ['floor fan', 'quạt sàn'], ['desk fan', 'quạt bàn'], ['table fan', 'quạt bàn'], ['wall fan', 'quạt treo tường'], ['ceiling fan', 'quạt trần'],
    ['tower fan', 'quạt tháp'], ['box fan', 'quạt hộp'], ['bladeless fan', 'quạt không cánh'], ['rechargeable fan', 'quạt sạc'], ['mini fan', 'quạt mini'],
    ['exhaust fan', 'quạt hút'], ['ventilation fan', 'quạt thông gió'], ['electric fan', 'quạt điện'], ['fan', 'quạt'],
    ['hair dryer', 'máy sấy tóc'], ['hair straightener', 'máy duỗi tóc'], ['hair curler', 'máy uốn tóc'],
    ['nut milk maker', 'máy làm sữa hạt'], ['soymilk maker', 'máy làm sữa đậu nành'], ['soy milk maker', 'máy làm sữa đậu nành'],
    ['high speed blender', 'máy xay sinh tố tốc độ cao'], ['blender', 'máy xay sinh tố'], ['juicer', 'máy ép trái cây'], ['slow juicer', 'máy ép chậm'],
    ['food processor', 'máy xay thực phẩm đa năng'], ['meat grinder', 'máy xay thịt'], ['hand mixer', 'máy đánh trứng cầm tay'], ['stand mixer', 'máy trộn bột'],
    ['air fryer', 'nồi chiên không dầu'], ['rice cooker', 'nồi cơm điện'], ['pressure cooker', 'nồi áp suất điện'], ['slow cooker', 'nồi nấu chậm'],
    ['multi cooker', 'nồi nấu đa năng'], ['hot pot', 'nồi lẩu điện'], ['electric kettle', 'ấm đun nước siêu tốc'], ['kettle', 'ấm đun nước'],
    ['induction cooker', 'bếp từ'], ['infrared cooker', 'bếp hồng ngoại'], ['electric grill', 'bếp nướng điện'], ['sandwich maker', 'máy nướng bánh sandwich'],
    ['toaster', 'máy nướng bánh mì'], ['microwave oven', 'lò vi sóng'], ['electric oven', 'lò nướng điện'], ['oven', 'lò nướng'],
    ['coffee maker', 'máy pha cà phê'], ['coffee machine', 'máy pha cà phê'], ['water dispenser', 'cây nước nóng lạnh'],
    ['vacuum cleaner', 'máy hút bụi'], ['robot vacuum', 'robot hút bụi'], ['steam mop', 'cây lau nhà hơi nước'],
    ['air purifier', 'máy lọc không khí'], ['dehumidifier', 'máy hút ẩm'], ['humidifier', 'máy tạo độ ẩm'], ['heater', 'máy sưởi'],
    ['steam iron', 'bàn ủi hơi nước'], ['garment steamer', 'bàn ủi hơi nước đứng'], ['iron', 'bàn ủi'],
    ['frying pan', 'chảo chiên'], ['non stick pan', 'chảo chống dính'], ['wok', 'chảo xào'], ['casserole', 'nồi'], ['stock pot', 'nồi'], ['pot', 'nồi'],
    ['spare parts', 'linh kiện'], ['spare part', 'linh kiện'], ['remote control', 'điều khiển từ xa'], ['power cord', 'dây nguồn'], ['adapter', 'bộ đổi nguồn'],
  ];
  /* Từ trong tên công ty — dịch rồi đảo thứ tự (tiếng Việt: danh từ chính đứng trước) */
  const ORG = [
    ['science and technology', 'Khoa học Công nghệ'], ['sci tech', 'Khoa học Công nghệ'], ['import and export', 'Xuất nhập khẩu'], ['import & export', 'Xuất nhập khẩu'],
    ['imp and exp', 'Xuất nhập khẩu'], ['imp & exp', 'Xuất nhập khẩu'], ['household appliances', 'Đồ gia dụng'], ['household appliance', 'Đồ gia dụng'],
    ['home appliances', 'Đồ gia dụng'], ['home appliance', 'Đồ gia dụng'], ['electrical appliances', 'Thiết bị điện'], ['electrical appliance', 'Thiết bị điện'],
    ['electric appliances', 'Thiết bị điện'], ['electric appliance', 'Thiết bị điện'], ['appliances', 'Thiết bị'], ['appliance', 'Thiết bị'],
    ['intelligent', 'Thông minh'], ['smart', 'Thông minh'], ['technology', 'Công nghệ'], ['tech', 'Công nghệ'], ['electronics', 'Điện tử'], ['electronic', 'Điện tử'],
    ['electrical', 'Điện'], ['electric', 'Điện'], ['industrial', 'Công nghiệp'], ['industry', 'Công nghiệp'], ['trading', 'Thương mại'], ['trade', 'Thương mại'],
    ['commercial', 'Thương mại'], ['manufacturing', 'Sản xuất'], ['manufacture', 'Sản xuất'], ['plastic', 'Nhựa'], ['plastics', 'Nhựa'], ['metal', 'Kim loại'],
    ['hardware', 'Ngũ kim'], ['kitchenware', 'Đồ dùng nhà bếp'], ['kitchen', 'Nhà bếp'], ['houseware', 'Đồ gia dụng'], ['housewares', 'Đồ gia dụng'],
    ['development', 'Phát triển'], ['international', 'Quốc tế'], ['industrial development', 'Phát triển Công nghiệp'], ['supply chain', 'Chuỗi cung ứng'],
    ['motor', 'Động cơ'], ['machinery', 'Máy móc'], ['products', 'Sản phẩm'], ['product', 'Sản phẩm'], ['enterprise', 'Doanh nghiệp'],
  ];
  /* Địa danh: [pinyin, Hán Việt, cấp] — cấp: p = tỉnh / thành phố trực thuộc TW, c = thành phố, d = quận, t = trấn */
  const PLACES = [
    ['zhejiang', 'Chiết Giang', 'p'], ['guangdong', 'Quảng Đông', 'p'], ['jiangsu', 'Giang Tô', 'p'], ['fujian', 'Phúc Kiến', 'p'], ['shandong', 'Sơn Đông', 'p'],
    ['anhui', 'An Huy', 'p'], ['hebei', 'Hà Bắc', 'p'], ['henan', 'Hà Nam', 'p'], ['hunan', 'Hồ Nam', 'p'], ['hubei', 'Hồ Bắc', 'p'], ['jiangxi', 'Giang Tây', 'p'],
    ['sichuan', 'Tứ Xuyên', 'p'], ['guangxi', 'Quảng Tây', 'p'], ['liaoning', 'Liêu Ninh', 'p'], ['yunnan', 'Vân Nam', 'p'],
    ['shanghai', 'Thượng Hải', 'p'], ['beijing', 'Bắc Kinh', 'p'], ['tianjin', 'Thiên Tân', 'p'], ['chongqing', 'Trùng Khánh', 'p'],
    ['ningbo', 'Ninh Ba', 'c'], ['cixi', 'Từ Khê', 'c'], ['yuyao', 'Dư Diêu', 'c'], ['hangzhou', 'Hàng Châu', 'c'], ['wenzhou', 'Ôn Châu', 'c'], ['taizhou', 'Đài Châu', 'c'],
    ['jinhua', 'Kim Hoa', 'c'], ['yiwu', 'Nghĩa Ô', 'c'], ['yongkang', 'Vĩnh Khang', 'c'], ['shaoxing', 'Thiệu Hưng', 'c'], ['huzhou', 'Hồ Châu', 'c'], ['jiaxing', 'Gia Hưng', 'c'],
    ['guangzhou', 'Quảng Châu', 'c'], ['shenzhen', 'Thâm Quyến', 'c'], ['foshan', 'Phật Sơn', 'c'], ['zhongshan', 'Trung Sơn', 'c'], ['jiangmen', 'Giang Môn', 'c'],
    ['zhuhai', 'Châu Hải', 'c'], ['dongguan', 'Đông Quản', 'c'], ['huizhou', 'Huệ Châu', 'c'], ['shantou', 'Sán Đầu', 'c'], ['chaozhou', 'Triều Châu', 'c'],
    ['jieyang', 'Yết Dương', 'c'], ['zhaoqing', 'Triệu Khánh', 'c'], ['xiamen', 'Hạ Môn', 'c'], ['fuzhou', 'Phúc Châu', 'c'], ['quanzhou', 'Tuyền Châu', 'c'],
    ['suzhou', 'Tô Châu', 'c'], ['wuxi', 'Vô Tích', 'c'], ['changzhou', 'Thường Châu', 'c'], ['nanjing', 'Nam Kinh', 'c'], ['qingdao', 'Thanh Đảo', 'c'],
    ['jinan', 'Tế Nam', 'c'], ['hefei', 'Hợp Phì', 'c'], ['wuhan', 'Vũ Hán', 'c'], ['changsha', 'Trường Sa', 'c'], ['chengdu', 'Thành Đô', 'c'],
    ['shunde', 'Thuận Đức', 'd'], ['nanhai', 'Nam Hải', 'd'], ['beilun', 'Bắc Luân', 'd'], ['yinzhou', 'Ngân Châu', 'd'], ['haishu', 'Hải Thự', 'd'],
    ['zhenhai', 'Trấn Hải', 'd'], ['fenghua', 'Phụng Hóa', 'd'], ['xiangshan', 'Tượng Sơn', 'd'], ['ninghai', 'Ninh Hải', 'd'], ['baoan', 'Bảo An', 'd'], ["bao'an", 'Bảo An', 'd'],
    ['longgang', 'Long Cương', 'd'], ['longhua', 'Long Hoa', 'd'], ['xiaoshan', 'Tiêu Sơn', 'd'], ['ronggui', 'Dung Quế', 't'], ['beijiao', 'Bắc Kiều', 't'],
    ['leliu', 'Lặc Lưu', 't'], ['xiaolan', 'Tiểu Lãm', 't'], ['dongfeng', 'Đông Phụng', 't'],
  ];
  const ZONES = [
    ['binhai economic development zone', 'Khu Phát triển Kinh tế ven biển'], ['economic and technological development zone', 'Khu Phát triển Kinh tế - Kỹ thuật'],
    ['economic technological development zone', 'Khu Phát triển Kinh tế - Kỹ thuật'], ['economic development zone', 'Khu Phát triển Kinh tế'],
    ['high tech industrial development zone', 'Khu Phát triển Công nghiệp Công nghệ cao'], ['high tech zone', 'Khu Công nghệ cao'], ['hi tech zone', 'Khu Công nghệ cao'],
    ['industrial park', 'Khu công nghiệp'], ['industrial zone', 'Khu công nghiệp'], ['industrial area', 'Khu công nghiệp'], ['industry park', 'Khu công nghiệp'],
    ['development zone', 'Khu Phát triển'], ['free trade zone', 'Khu Thương mại tự do'], ['science park', 'Khu Khoa học'],
  ];
  const COUNTRY = { CN: 'Trung Quốc', VN: 'Việt Nam', TH: 'Thái Lan', MY: 'Malaysia', ID: 'Indonesia', KR: 'Hàn Quốc', JP: 'Nhật Bản', TW: 'Đài Loan', HK: 'Hồng Kông',
    IN: 'Ấn Độ', SG: 'Singapore', PH: 'Philippines', DE: 'Đức', IT: 'Ý', FR: 'Pháp', US: 'Hoa Kỳ', GB: 'Anh' };

  const clean = (s) => String(s || '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
  const low = (s) => clean(s).toLowerCase().replace(/[^a-z0-9&' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const cap = (s) => s.replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
  const placeMap = new Map(PLACES.map((p) => [p[0], p]));
  const LEVEL = { p: 'Tỉnh', c: 'Thành phố', d: 'Quận', t: 'Trấn' };
  const MUNI = new Set(['shanghai', 'beijing', 'tianjin', 'chongqing']);

  /* Thay cụm theo từ điển (dài trước) trong chuỗi chữ thường; trả về mảng mảnh {vi} | {raw} */
  function phrasePieces(text, dict) {
    const sorted = dict.slice().sort((a, b) => b[0].length - a[0].length);
    let parts = [{ raw: ' ' + text + ' ' }];
    sorted.forEach(([en, vi]) => {
      const next = [];
      parts.forEach((p) => {
        if (p.vi) { next.push(p); return; }
        const segs = p.raw.split(' ' + en + ' ');
        segs.forEach((s, i) => { if (s.trim()) next.push({ raw: ' ' + s.trim() + ' ' }); if (i < segs.length - 1) next.push({ vi }); });
      });
      parts = next;
    });
    return parts.map((p) => (p.vi ? p : { raw: p.raw.trim() })).filter((p) => p.vi || p.raw);
  }

  function product(name) {
    const t = low(name);
    if (!t) return { vi: '', unknown: [] };
    const pcs = phrasePieces(t, PRODUCT);
    const vi = pcs.filter((p) => p.vi).map((p) => p.vi);
    const unknown = pcs.filter((p) => p.raw).map((p) => p.raw);
    const s = (vi.join(' ') + (unknown.length ? ' ' + unknown.join(' ') : '')).trim();
    const k = vi.join(' ');
    return { vi: s.charAt(0).toUpperCase() + s.slice(1), known: k.charAt(0).toUpperCase() + k.slice(1), unknown };
  }

  function company(name) {
    let t = low(String(name || '').replace(/\([^)]*\)/g, ' ')).replace(/\bco\s*ltd\b|\bcompany limited\b|\bco limited\b|\bcorporation\b|\bcorp\b|\binc\b|\bcompany\b|\bco\b|\bltd\b|\blimited\b/g, ' ').replace(/\s+/g, ' ').trim();
    const group = /\bgroup\b/.test(t); t = t.replace(/\bgroup\b/g, ' ').replace(/\s+/g, ' ').trim();
    const words = t.split(' ').filter(Boolean);
    const places = []; while (words.length && placeMap.has(words[0])) places.push(placeMap.get(words.shift())[1]);
    const pcs = phrasePieces(words.join(' '), ORG);
    // tên riêng (phần không dịch được) đứng trước các từ ngành nghề trong tiếng Anh
    const brand = pcs.filter((p) => p.raw).map((p) => cap(p.raw));
    const trade = pcs.filter((p) => p.vi).map((p) => p.vi).reverse();
    const vi = ['Công ty TNHH', group ? 'Tập đoàn' : '', ...trade, ...brand, ...places].filter(Boolean).join(' ');
    return { vi, unknown: brand };
  }

  /* Tách 1 đoạn địa chỉ thành các địa danh đã biết (vd "ningbo city zhejiang" → Ninh Ba (thành phố), Chiết Giang (tỉnh)) */
  function placeRun(seg) {
    const w = seg.split(' ').filter(Boolean); const out = []; const rest = [];
    for (let i = 0; i < w.length; i++) {
      const p = placeMap.get(w[i]);
      if (!p) { rest.push(w[i]); continue; }
      let lv = p[2]; const nx = w[i + 1];
      if (nx === 'city') { lv = MUNI.has(p[0]) ? 'p' : 'c'; i++; } else if (nx === 'province') { lv = 'p'; i++; } else if (nx === 'district') { lv = 'd'; i++; }
      else if (nx === 'county') { lv = 'h'; i++; } else if (nx === 'town') { lv = 't'; i++; }
      out.push(lv === 'h' ? 'Huyện ' + p[1] : (MUNI.has(p[0]) && lv === 'p' ? 'Thành phố ' : LEVEL[lv] + ' ') + p[1]);
    }
    return { out, rest };
  }

  /* "NO.298" , "Abc Road" → "NO.298 Abc Road" (số nhà bị tách khỏi tên đường bởi dấu phẩy) */
  function joinNo(parts) {
    const out = [];
    parts.forEach((p) => { const prev = out[out.length - 1]; if (prev && /^(no\.?\s*)?\d+[a-z0-9\-]*$/i.test(prev)) out[out.length - 1] = prev + ' ' + p; else out.push(p); });
    return out;
  }

  function address(addr, countryCode) {
    const unknown = [];
    const parts = joinNo(clean(addr).replace(/\bP\.?\s*R\.?\s*CHINA\b/i, 'China').split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean));
    const out = []; let hasCountry = false;
    parts.forEach((part) => {
      let t = low(part.replace(/\bNO\.\s*/i, 'NO '));
      if (!t) return;
      if (t === 'china' || t === 'prc') { hasCountry = true; return; }
      if (/ china$/.test(t)) { hasCountry = true; t = t.replace(/ china$/, ''); }
      let m = t.match(/^(?:no\s*)?(\d+[a-z0-9\-]*)\s+(.+?)\s+(road|rd|street|st|avenue|ave|lane|ln|boulevard|blvd|highway)$/);
      if (m) { unknown.push(cap(m[2])); out.push(`Số ${m[1].toUpperCase()} Đường ${cap(m[2])}`); return; }
      m = t.match(/^(.+?)\s+(road|rd|street|st|avenue|ave|lane|boulevard|highway)$/);
      if (m) { unknown.push(cap(m[1])); out.push(`Đường ${cap(m[1])}`); return; }
      m = t.match(/^(?:no\s*)?(\d+[a-z0-9\-]*)$/);
      if (m) { out.push('Số ' + m[1].toUpperCase()); return; }
      const z = phrasePieces(t, ZONES);
      if (z.some((p) => p.vi)) {
        z.forEach((p) => { if (p.vi) out.push(p.vi); else { const r = placeRun(p.raw); out.push(...r.out); if (r.rest.length) { unknown.push(cap(r.rest.join(' '))); out.push(cap(r.rest.join(' '))); } } });
        return;
      }
      const r = placeRun(t);
      if (r.out.length && !r.rest.length) { out.push(...r.out); return; }
      const fl = t.match(/^(?:room|rm)\s*(\S+)|^(\S+)\s*(?:floor|f)$|^(?:building|bldg)\s*(\S+)$/);
      if (fl) { out.push(fl[1] ? 'Phòng ' + fl[1].toUpperCase() : fl[2] ? 'Tầng ' + fl[2].toUpperCase() : 'Tòa ' + fl[3].toUpperCase()); return; }
      out.push(...r.out); if (r.rest.length) { unknown.push(cap(r.rest.join(' '))); out.push(cap(r.rest.join(' '))); }
    });
    const cc = String(countryCode || (hasCountry ? 'CN' : '')).toUpperCase();
    if (cc && COUNTRY[cc]) out.push(COUNTRY[cc]);
    return { vi: out.join(', '), unknown: [...new Set(unknown)] };
  }

  /* Địa chỉ cho ô ECUS: CHỮ IN, bỏ dấu câu, xếp vào tối đa 4 dòng ≤ 35 ký tự, dòng cuối là tên nước */
  function ecusAddress(addr, countryCode) {
    const cc = String(countryCode || 'CN').toUpperCase();
    const cname = { CN: 'CHINA', VN: 'VIETNAM', TH: 'THAILAND', MY: 'MALAYSIA', KR: 'KOREA', JP: 'JAPAN', TW: 'TAIWAN', HK: 'HONG KONG' }[cc] || '';
    let parts = joinNo(clean(addr).toUpperCase().replace(/\bNO\.\s*/g, 'NO ').split(/[,;\n]+/)).map((s) => s.replace(/[^A-Z0-9 \-\/&]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    parts = parts.filter((p) => p !== cname && p !== 'P R ' + cname && p !== 'PRC');
    parts = parts.map((p) => { const w = p.split(' '); const last = w[w.length - 1].toLowerCase(); const pl = placeMap.get(last); return pl && pl[2] === 'p' && !MUNI.has(last) ? p + ' PROVINCE' : p; });
    const lines = [];
    parts.forEach((p) => {
      const cur = lines[lines.length - 1];
      if (cur && (cur + ' ' + p).length <= 35) lines[lines.length - 1] = cur + ' ' + p;
      else lines.push(p);
    });
    while (lines.length > 3) { const b = lines.pop(); lines[lines.length - 1] += ' ' + b; }
    if (cname) lines.push(cname);
    return lines;
  }

  /* Linh kiện / phụ kiện: tên tiếng Anh → tiếng Việt + vật liệu.
     "Main body (plastic)" → "Thân máy chính bằng nhựa"; "Nozzle ring, chrome plated, ABS" → "Vòng viền đầu thổi mạ crôm bằng nhựa ABS".
     Trong 1 cụm, danh từ chính tiếng Anh đứng cuối → tiếng Việt đảo lên đầu. */
  const PARTS = [
    ['main body', 'thân máy chính'], ['main housing', 'vỏ thân máy chính'], ['body', 'thân máy'], ['housing', 'vỏ'], ['shell', 'vỏ'], ['casing', 'vỏ'], ['enclosure', 'vỏ'],
    ['body cover', 'vỏ bọc thân máy'], ['handle cover', 'vỏ tay cầm'], ['handle shell', 'vỏ tay cầm'], ['front cover', 'nắp trước'], ['back cover', 'nắp sau'], ['rear cover', 'nắp sau'],
    ['top cover', 'nắp trên'], ['bottom cover', 'nắp đáy'], ['side cover', 'nắp bên'], ['cover', 'nắp'], ['lid', 'nắp'], ['cap', 'nắp'], ['handle', 'tay cầm'],
    ['air inlet filter', 'lưới lọc gió đầu vào'], ['inlet filter', 'lưới lọc gió đầu vào'], ['air filter', 'lưới lọc gió'], ['filter screen', 'lưới lọc'], ['filter', 'lưới lọc'],
    ['heat insulation sheet', 'tấm cách nhiệt'], ['heat insulation', 'tấm cách nhiệt'], ['insulation sheet', 'tấm cách nhiệt'], ['heat shield', 'tấm cách nhiệt'], ['mica sheet', 'tấm mica cách nhiệt'],
    ['decorative ring', 'vòng viền trang trí'], ['ring', 'vòng viền'], ['nozzle', 'đầu thổi'], ['concentrator', 'đầu thổi tập trung'], ['diffuser', 'đầu khuếch tán'],
    ['inner parts', 'chi tiết bên trong'], ['internal parts', 'chi tiết bên trong'], ['inner part', 'chi tiết bên trong'],
    ['dc motor', 'động cơ một chiều'], ['ac motor', 'động cơ xoay chiều'], ['motor', 'động cơ'], ['fan blade', 'cánh quạt'], ['impeller', 'cánh quạt'], ['blade assembly', 'cụm lưỡi dao'],
    ['knife', 'lưỡi dao'], ['cutter', 'lưỡi dao'], ['blade', 'cánh'], ['front grill', 'lồng quạt trước'], ['rear grill', 'lồng quạt sau'], ['front guard', 'lồng quạt trước'], ['rear guard', 'lồng quạt sau'],
    ['grill', 'lồng quạt'], ['guard', 'lồng bảo vệ'], ['base', 'đế'], ['stand', 'chân đế'], ['pole', 'trụ'], ['pillar', 'trụ'], ['column', 'trụ'], ['tube', 'ống'], ['pipe', 'ống'], ['hose', 'ống mềm'],
    ['control panel', 'bảng điều khiển'], ['control board', 'bo mạch điều khiển'], ['main board', 'bo mạch chính'], ['circuit board', 'bo mạch'], ['pcba', 'bo mạch'], ['pcb', 'bo mạch'],
    ['display board', 'bo mạch hiển thị'], ['display', 'màn hình hiển thị'], ['remote control', 'điều khiển từ xa'], ['remote', 'điều khiển từ xa'], ['power cord', 'dây nguồn'], ['power cable', 'dây nguồn'],
    ['cord', 'dây nguồn'], ['cable', 'dây cáp'], ['wire', 'dây điện'], ['plug', 'phích cắm'], ['socket', 'ổ cắm'], ['switch', 'công tắc'], ['button', 'nút bấm'], ['key', 'phím'], ['knob', 'núm vặn'],
    ['heating element', 'bộ phận gia nhiệt'], ['heating wire', 'dây gia nhiệt'], ['heater', 'bộ phận gia nhiệt'], ['heating plate', 'mâm nhiệt'], ['thermostat', 'bộ điều nhiệt'], ['thermal fuse', 'cầu chì nhiệt'],
    ['fuse', 'cầu chì'], ['sensor', 'cảm biến'], ['capacitor', 'tụ điện'], ['water tank', 'bình chứa nước'], ['tank', 'bình chứa'], ['water pump', 'bơm nước'], ['pump', 'bơm'],
    ['cooling pad', 'tấm làm mát'], ['honeycomb pad', 'tấm làm mát'], ['ice box', 'hộp đá khô'], ['wheel', 'bánh xe'], ['caster', 'bánh xe'], ['gear', 'bánh răng'], ['spring', 'lò xo'], ['bearing', 'vòng bi'],
    ['seal ring', 'gioăng'], ['gasket', 'gioăng'], ['seal', 'gioăng'], ['jar', 'cối'], ['cup', 'cốc'], ['bowl', 'tô'], ['basket', 'giỏ chiên'], ['inner pot', 'lòng nồi'], ['pot', 'nồi'], ['tray', 'khay'],
    ['glass', 'kính'], ['screws', 'ốc vít'], ['screw', 'ốc vít'], ['nut', 'đai ốc'], ['adapter', 'bộ đổi nguồn'], ['charger', 'bộ sạc'], ['battery', 'pin'], ['led', 'đèn led'], ['lamp', 'đèn'],
    ['user manual', 'sách hướng dẫn sử dụng'], ['instruction manual', 'sách hướng dẫn sử dụng'], ['manual', 'sách hướng dẫn'], ['warranty card', 'phiếu bảo hành'],
    ['color box', 'hộp màu'], ['gift box', 'hộp'], ['carton', 'thùng carton'], ['box', 'hộp'], ['label', 'nhãn'], ['sticker', 'nhãn dán'], ['bag', 'túi'], ['foam', 'mút xốp'],
    ['bracket', 'giá đỡ'], ['holder', 'giá đỡ'], ['clip', 'kẹp'], ['hook', 'móc'], ['brush', 'bàn chải'], ['plate', 'tấm'], ['panel', 'tấm'], ['sheet', 'tấm'], ['net', 'lưới'], ['mesh', 'lưới'],
    ['accessories', 'phụ kiện'], ['accessory', 'phụ kiện'], ['spare parts', 'linh kiện'], ['spare part', 'linh kiện'], ['parts', 'linh kiện'], ['part', 'linh kiện'],
  ];
  const MATS = [
    ['stainless steel', 'thép không gỉ'], ['abs', 'nhựa ABS'], ['pp', 'nhựa PP'], ['pc', 'nhựa PC'], ['pvc', 'nhựa PVC'], ['plastic', 'nhựa'], ['plastics', 'nhựa'], ['metal', 'kim loại'],
    ['iron', 'sắt'], ['steel', 'thép'], ['aluminum', 'nhôm'], ['aluminium', 'nhôm'], ['copper', 'đồng'], ['brass', 'đồng thau'], ['rubber', 'cao su'], ['silicone', 'silicon'],
    ['tempered glass', 'kính cường lực'], ['ceramic', 'gốm'], ['paper', 'giấy'], ['cardboard', 'bìa giấy'], ['wood', 'gỗ'], ['fabric', 'vải'], ['nylon', 'nylon'],
  ];
  const PART_RE = new RegExp('\\b(' + PARTS.map((p) => p[0]).join('|') + ')\\b', 'i');
  /* Có phải linh kiện? Bỏ phần "for / of <máy chính>" và các tên sản phẩm hoàn chỉnh (vd "stand fan", "power cord" vẫn giữ)
     rồi mới tìm từ chỉ bộ phận — để "Stand Fan" là quạt, còn "Fan blade", "Main body for X" là linh kiện */
  const WHOLE = PRODUCT.filter(([en]) => !['spare parts', 'spare part', 'remote control', 'power cord', 'adapter'].includes(en));
  function isPartName(en) {
    const s = String(en || '');
    if (/\bspare\b|\bparts?\b|accessor/i.test(s)) return true;
    const t = low(s.replace(/\b(?:for|of|used for|suitable for)\b\s+.+$/i, ' '));
    const rest = phrasePieces(t, WHOLE).filter((p) => p.raw).map((p) => p.raw).join(' ');
    return PART_RE.test(rest);
  }
  function part(en) {
    let t = clean(en).replace(/[“”"]/g, '');
    const foc = /\bf\.?\s*o\.?\s*c\.?\b|free\s*of\s*charge|\bfree\b/i.test(t);
    const plated = /chrome[\s-]*plated|chromed|mạ crôm/i.test(t);
    t = t.replace(/\bf\.?\s*o\.?\s*c\.?\b|free\s*of\s*charge|\bfree\b|chrome[\s-]*plated|chromed/gi, ' ');
    // phần sau "for / of / used for" là sản phẩm chính → bỏ (mô tả linh kiện tự ghép tên sản phẩm chính)
    const parentHint = (t.match(/\b(?:for|of|used for|suitable for)\b\s+(.+)$/i) || [])[1] || '';
    t = t.replace(/\b(?:for|of|used for|suitable for)\b\s+.+$/i, ' ');
    let tl = low(t.replace(/[()]/g, ' , '));
    const mats = [];
    MATS.slice().sort((a, b) => b[0].length - a[0].length).forEach(([en2, vi]) => {
      const re = new RegExp('(^| )' + en2 + '( |$)', 'g'); if (re.test(tl)) { if (!mats.includes(vi)) mats.push(vi); tl = tl.replace(re, ' ').replace(/\s+/g, ' ').trim(); }
    });
    tl = tl.replace(/\b(made|material|new|pcs|pc|set|sets|unit|units|and|with)\b/g, (w) => (w === 'and' ? ',' : w === 'with' ? ' / ' : ' ')).replace(/\b[a-z]*\d[a-z0-9\-]*\b/g, ' ');
    // "a with b" → "a kèm b"; "a and b" / "a, b" → "a và b"
    const withParts = tl.split(/\s*\/\s*/);
    const segs = withParts.length > 1 ? null : tl.split(/\s*[,&]\s*/).map((x) => x.trim()).filter(Boolean);
    if (!segs) {
      const w = withParts.map((x) => part(x).vi.toLowerCase()).filter(Boolean);
      let v = w.join(' kèm '); if (plated) v += ' mạ crôm'; if (mats.length) v += ' bằng ' + mats.join(' và ');
      return { vi: v.charAt(0).toUpperCase() + v.slice(1), foc, unknown: [], parentHint: clean(parentHint), parentVi: parentHint ? product(parentHint.replace(/\S*\d\S*/g, ' ')).known : '' };
    }
    const unknown = []; const viSegs = [];
    segs.forEach((seg) => {
      const pcs = phrasePieces(seg, PARTS);
      const vi = pcs.filter((x) => x.vi).map((x) => x.vi).reverse();
      pcs.filter((x) => x.raw).forEach((x) => unknown.push(x.raw));
      if (vi.length) viSegs.push(vi.join(' ') + (pcs.some((x) => x.raw) ? ' ' + pcs.filter((x) => x.raw).map((x) => x.raw).join(' ') : ''));
      else if (seg) viSegs.push(seg);
    });
    let vi = viSegs.join(' và ');
    if (plated) vi += ' mạ crôm';
    if (mats.length) vi += ' bằng ' + mats.join(' và ');
    vi = vi.trim(); vi = vi.charAt(0).toUpperCase() + vi.slice(1);
    return { vi, foc, unknown, parentHint: clean(parentHint), parentVi: parentHint ? product(parentHint.replace(/\S*\d\S*/g, ' ')).known : '' };
  }

  const country = (cc) => COUNTRY[String(cc || '').toUpperCase()] || cc || '';
  const API = { product, company, address, ecusAddress, country, part, isPartName, PLACES, PRODUCT, ORG };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.ViDict = API;
})(typeof window !== 'undefined' ? window : globalThis);
