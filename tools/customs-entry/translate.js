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
    return { vi: s.charAt(0).toUpperCase() + s.slice(1), unknown };
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

  const country = (cc) => COUNTRY[String(cc || '').toUpperCase()] || cc || '';
  const API = { product, company, address, ecusAddress, country, PLACES, PRODUCT, ORG };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.ViDict = API;
})(typeof window !== 'undefined' ? window : globalThis);
