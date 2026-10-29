/* =========================================================
   Landed Cost v12 — LOGIC (tính toán, tra cứu HS, nhập/xuất Excel)
   Giao diện: index.html · Style: style.css · Dữ liệu biểu thuế: tariff-data.js
   Công thức chi tiết: xem tab "Cách tính" trong tool.
   Xuất Excel: khuôn "PA giá" (1 dòng/model, ảnh, thông số, chi phí khai thác gộp,
   giá vốn không VAT / có VAT, Ghi chú test) + sheet ẩn "Du lieu nhap lai" để nhập lại.
   ========================================================= */
"use strict";
/* ---------------- storage helpers ---------------- */
const TOOL_VER='v12 · 29/10/2026';
const LS={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}};
const idb={open(){return new Promise((res,rej)=>{try{const r=indexedDB.open('landedcost',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}})},
  async get(k){try{const db=await this.open();return await new Promise(r=>{const q=db.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>r(q.result);q.onerror=()=>r(undefined)})}catch(e){return undefined}},
  async set(k,v){try{const db=await this.open();return await new Promise(r=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>r(true);t.onerror=()=>r(false)})}catch(e){return false}},
  async del(k){try{const db=await this.open();return await new Promise(r=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').delete(k);t.oncomplete=()=>r(true);t.onerror=()=>r(false)})}catch(e){return false}}};
const $=s=>document.querySelector(s);
const fmt=(n,d=0)=>(n==null||isNaN(n))?'–':Number(n).toLocaleString('vi-VN',{minimumFractionDigits:d,maximumFractionDigits:d});
const pnum=v=>{if(v==null)return NaN;if(typeof v==='number')return v;v=String(v).trim().replace(/\s/g,'');if(!v)return NaN;
  if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v))v=v.replace(/\./g,'').replace(',','.');else if(/^\d+,\d+$/.test(v))v=v.replace(',','.');else v=v.replace(/,/g,'');return parseFloat(v)};
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtHS=c=>c&&c.length===8?c.slice(0,4)+'.'+c.slice(4,6)+'.'+c.slice(6):c;
function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2600)}

/* ---------------- reference data ---------------- */
const ORIGINS=[
 {id:'CN',name:'Trung Quốc',fta:['acfta'],rcep:'C'},
 {id:'TH',name:'Thái Lan',fta:['atiga'],rcep:'A'},{id:'MY',name:'Malaysia',fta:['atiga'],rcep:'A'},{id:'ID',name:'Indonesia',fta:['atiga'],rcep:'A'},
 {id:'SG',name:'Singapore',fta:['atiga','cptpp'],rcep:'A'},{id:'PH',name:'Philippines',fta:['atiga'],rcep:'A'},{id:'KH',name:'Campuchia',fta:['atiga'],rcep:'A'},
 {id:'LA',name:'Lào',fta:['atiga','vnlao'],rcep:'A'},{id:'MM',name:'Myanmar',fta:['atiga'],rcep:'A'},{id:'BN',name:'Brunei',fta:['atiga','cptpp'],rcep:'A'},
 {id:'KR',name:'Hàn Quốc',fta:['akfta','vkfta'],rcep:'E'},{id:'JP',name:'Nhật Bản',fta:['ajcep','vjepa','cptpp'],rcep:'D'},
 {id:'TW',name:'Đài Loan',fta:[]},{id:'HK',name:'Hồng Kông',fta:['ahkfta']},{id:'IN',name:'Ấn Độ',fta:['aifta']},
 {id:'AU',name:'Úc',fta:['aanzfta','cptpp'],rcep:'B'},{id:'NZ',name:'New Zealand',fta:['aanzfta','cptpp'],rcep:'F'},
 {id:'EU',name:'EU (Đức, Ý, Pháp…)',fta:['evfta']},{id:'UK',name:'Anh',fta:['ukvfta']},{id:'US',name:'Hoa Kỳ',fta:[]},
 {id:'CA',name:'Canada',fta:['cptpp']},{id:'MX',name:'Mexico',fta:['cptpp']},{id:'CL',name:'Chile',fta:['vcfta','cptpp']},{id:'PE',name:'Peru',fta:['cptpp']},
 {id:'RU',name:'Nga / EAEU',fta:['eaeu']},{id:'IL',name:'Israel',fta:['vifta']},
 {id:'XX',name:'Nước khác (có MFN)',fta:[]},{id:'NM',name:'Nước khác (không MFN)',fta:[],nomfn:true}];
const OMAP=Object.fromEntries(ORIGINS.map(o=>[o.id,o]));
const FTA_LABEL={acfta:'ACFTA (Form E)',atiga:'ATIGA (Form D)',ajcep:'AJCEP',vjepa:'VJEPA',akfta:'AKFTA',aanzfta:'AANZFTA',aifta:'AIFTA',vkfta:'VKFTA',vcfta:'VCFTA',eaeu:'VN-EAEU',cptpp:'CPTPP',ahkfta:'AHKFTA',evfta:'EVFTA (EUR.1)',ukvfta:'UKVFTA',vnlao:'VN-Lào',vifta:'VIFTA',rcep:'RCEP'};
/* QĐ 1725/QĐ-BCT ngày 01/07/2024 – danh mục kiểm tra hiệu suất năng lượng (đọc từ bản scan) */
const HSNL=[
 ['85393110','Đèn huỳnh quang compact (CFL)','TCVN 7896:2015','Công suất 5–60 W'],['85393120','Đèn huỳnh quang ống thẳng','TCVN 8249:2013','Công suất 4–65 W'],['85393130','Đèn CFL có chấn lưu liền','TCVN 7896:2015','Công suất 5–60 W'],
 ['85041000','Chấn lưu điện tử cho đèn huỳnh quang','TCVN 8248:2013 / 7897:2013','4–65 W'],
 ['841810','Tủ lạnh, tủ kết đông','TCVN 7828:2016; TCVN 10289:2014','Đến 1000 L; không áp dụng làm lạnh hấp thụ, tủ chuyên dụng'],['84182','Tủ lạnh gia dụng','TCVN 7828:2016',''],['841830','Tủ kết đông cửa trên','TCVN 7828:2016',''],['841840','Tủ kết đông cửa trước','TCVN 7828:2016',''],['84185019','Tủ trưng bày có làm lạnh','TCVN 10289:2014',''],['84185099','Tủ có làm lạnh/kết đông khác','TCVN 10289:2014',''],
 ['85166010','Nồi cơm điện','TCVN 8252:2015','Đến 1000 W'],
 ['841451','Quạt điện','TCVN 7826:2015','Công suất không quá 125 W'],
 ['85287292','Máy thu hình / màn hình máy tính','TCVN 9536:2012; TCVN 9508:2012','Màn hình đến 24 inch'],['85287299','Máy thu hình','TCVN 9536:2012',''],
 ['85161019','Bình đun nước nóng có dự trữ','TCVN 7898:2018','Đến 40 L; không áp dụng dụng cụ đun nước để uống'],
 ['84151020','Máy điều hòa không khí','TCVN 7830:2015/2021','≤ 21,10 kW; không áp dụng loại xách tay, đứng sàn, âm trần, làm mát bằng nước'],
 ['845011','Máy giặt gia dụng','TCVN 8526:2013','2–15 kg'],['845012','Máy giặt gia dụng','TCVN 8526:2013','2–15 kg'],['845019','Máy giặt gia dụng','TCVN 8526:2013','2–15 kg'],['84502000','Máy giặt > 10 kg','TCVN 8526:2013',''],
 ['853952','Đèn LED','TCVN 11844:2017; TCVN 12666:2019','Đèn đầu E27/B22, G5/G13 ≤ 60 W; đèn đường ≥ 20 W'],
 ['84433910','Máy photocopy','TCVN 9510:2012',''],['84433930','Máy photocopy','TCVN 9510:2012',''],['844331','Máy in đa chức năng','TCVN 9509:2012',''],
 ['84713020','Máy tính xách tay','TCVN 11848:2017/2021',''],['847141','Máy tính để bàn','TCVN 13371:2021',''],['847149','Máy tính để bàn','TCVN 13371:2021',''],
 ['85015219','Động cơ điện','TCVN 7450-1:2013','KĐB 3 pha 0,75–150 kW'],['85015229','Động cơ điện','TCVN 7450-1:2013',''],['85015239','Động cơ điện','TCVN 7450-1:2013',''],['85015390','Động cơ điện','TCVN 7450-1:2013',''],
 ['84021120','Nồi hơi công nghiệp','TCVN 8630:2019',''],['84021221','Nồi hơi công nghiệp','TCVN 8630:2019',''],['84021229','Nồi hơi công nghiệp','TCVN 8630:2019',''],['84021921','Nồi hơi công nghiệp','TCVN 8630:2019',''],['84021929','Nồi hơi công nghiệp','TCVN 8630:2019',''],['84022020','Nồi hơi công nghiệp','TCVN 8630:2019',''],
 ['850421','Máy biến áp','TCVN 8525:2015','Phân phối 3 pha 25–2.500 kVA'],['850422','Máy biến áp','TCVN 8525:2015','']];
/* Từ điển gợi ý HS cho nhóm hàng hay nhập */
const AIRCOOL_RE=/quat (dieu hoa|hoi nuoc|lam mat)|may lam mat|air ?cooler|evaporative/;
/* CV 10442/TCHQ-TXNK ngày 04/11/2016: máy làm mát không khí bằng bay hơi */
const CV10442={no:'10442/TCHQ-TXNK',date:'04/11/2016',limit:20,heavy:'84796000',light:'85098090'};
function isAirCooler(p){return String(p.hs||'')===CV10442.heavy||AIRCOOL_RE.test(norm(p.name))}
/* Phân loại theo thông số (ngưỡng trong biểu thuế) */
const CLASS_RULES=[
 {id:'washer',label:'Máy giặt',param:'Sức chứa',unit:'kg vải khô/lần',hs:['8450'],re:/may giat/,
  pick:(v,p)=>v>10?'84502000':(/ban tu dong|vat ly tam|long doi|2 long/.test(norm(p.name))?(v<=6?'84501210':'84501290'):(v<=6?'84501110':'84501190')),
  rule:'≤ 6 kg → 8450.11.10 · 6–10 kg → 8450.11.90 · > 10 kg → 8450.20.00 (loại tự động hoàn toàn; bán tự động có vắt ly tâm → 8450.12.xx)',
  desc:v=>'sức chứa '+fmt(v,v%1?1:0)+' kg vải khô/lần giặt'},
 {id:'dryer',label:'Máy sấy quần áo',param:'Sức chứa',unit:'kg vải khô/lần',hs:['845121','845129'],re:/say (quan ao|do)|may say quan|clothes dryer|tumble/,
  pick:v=>v>10?'84512900':'84512100',rule:'≤ 10 kg → 8451.21.00 · > 10 kg → 8451.29.00',desc:v=>'sức chứa '+fmt(v,v%1?1:0)+' kg vải khô/lần sấy'},
 {id:'fan',label:'Quạt điện',param:'Công suất',unit:'W',hs:['841451','841459'],re:/quat/,excl:p=>isAirCooler(p)||/suoi|heater/.test(norm(p.name)),
  pick:(v,p)=>{const h=String(p.hs||'');const luoi=/(91|41)$/.test(h)||/co luoi/.test(norm(p.name));if(v>125)return luoi?'84145941':'84145949';if(/quat (ban|hop)|box fan|desk fan/.test(norm(p.name))||h==='84145110')return '84145110';return luoi?'84145191':'84145199'},
  rule:'≤ 125 W → 8414.51.xx (bàn/hộp .10, có lưới .91, khác .99) · > 125 W → 8414.59.41/.49',desc:v=>'công suất '+fmt(v,v%1?1:0)+' W'},
 {id:'ac',label:'Máy điều hòa không khí',param:'Công suất lạnh',unit:'kW',hs:['841510'],re:/dieu hoa khong khi|may lanh|dieu hoa (treo|cay|am tran|inverter)|air ?con/,excl:p=>isAirCooler(p),
  pick:v=>v>21.1?'84151090':'84151020',rule:'≤ 21,10 kW → 8415.10.20 · lớn hơn → 8415.10.90 (12.000 BTU/h ≈ 3,5 kW)',desc:v=>'công suất làm lạnh '+fmt(v,v%1?2:0)+' kW'},
 {id:'fridge',label:'Tủ lạnh gia đình',param:'Dung tích',unit:'lít',hs:['841821'],re:/tu lanh|fridge|refrigerator/,
  pick:v=>v>230?'84182190':'84182110',rule:'≤ 230 lít → 8418.21.10 · > 230 lít → 8418.21.90 (loại dùng máy nén)',desc:v=>'dung tích '+fmt(v)+' lít'}];
function classRule(p){const h=String(p.hs||'');const n=norm(p.name);
  for(const r of CLASS_RULES){if(r.excl&&r.excl(p))continue;if(h&&r.hs.some(x=>h.startsWith(x)))return r}
  for(const r of CLASS_RULES){if(r.excl&&r.excl(p))continue;if(r.re.test(n))return r}return null}
function specCode(p){const r=classRule(p);const v=pnum(p.spec);if(!r||!(v>0))return null;const c=r.pick(v,p);return row(c)?c:null}
const POL_LIST=['Ningbo','Shanghai','Shenzhen (Yantian)','Shenzhen (Shekou)','Guangzhou (Nansha)','Guangzhou (Huangpu)','Foshan','Zhongshan','Jiangmen','Xiamen','Qingdao','Tianjin','Dalian','Fuzhou','Lianyungang'];
function autoDesc(p){
  const w=pnum(p.weight);const name=String(p.name||'').trim();const parts=[];
  if(isAirCooler(p)&&!/lam mat khong khi bang bay hoi/.test(norm(name))){parts.push('Máy làm mát không khí bằng bay hơi'+(name?' ('+name+')':''))}else if(name)parts.push(name);
  if(p.code)parts.push('model '+String(p.code).trim());
  if(String(p.tech||'').trim())parts.push(String(p.tech).trim().replace(/[.;,\s]+$/,''));
  if(w>0)parts.push('trọng lượng '+fmt(w,w%1?1:0)+' kg/chiếc'+(isAirCooler(p)?(w>CV10442.limit?' (loại trên 20 kg)':' (loại không quá 20 kg)'):''));
  {const cr=classRule(p);const v=pnum(p.spec);if(cr&&v>0)parts.push(cr.desc(v))}
  parts.push('mới 100%');
  return parts.join(', ')}
function descOf(p){return (p.descManual&&p.desc)?p.desc:autoDesc(p)}
function cvCode(p){const w=pnum(p.weight);if(!(w>0))return null;return w>CV10442.limit?CV10442.heavy:CV10442.light}
/* Từ khoá sản phẩm → mã HS (gợi ý; luôn đối chiếu mô tả và đặc tính thực tế của hàng) */
const KEYWORDS=[
 ['Quạt điều hòa / máy làm mát không khí – trên 20 kg',['quat dieu hoa','may lam mat','lam mat khong khi','quat hoi nuoc','quat nuoc','air cooler','evaporative'],['84796000'],'CV 10442: trên 20 kg/chiếc'],
 ['Quạt điều hòa / máy làm mát không khí – từ 20 kg trở xuống',['quat dieu hoa','may lam mat','lam mat khong khi','quat hoi nuoc','quat nuoc','air cooler','evaporative'],['85098090'],'CV 10442: không quá 20 kg/chiếc · VAT 8%'],
 ['Quạt bàn, quạt hộp (≤125 W)',['quat ban','quat hop','box fan','desk fan','quat'],['84145110'],''],
 ['Quạt đứng, quạt cây, quạt sàn (≤125 W)',['quat dung','quat cay','quat san','quat lung','stand fan','quat'],['84145191','84145199'],'Có lưới bảo vệ → .91, loại khác → .99'],
 ['Quạt treo tường (≤125 W)',['quat treo','quat tuong','wall fan','quat'],['84145191','84145199'],''],
 ['Quạt trần, quạt mái (≤125 W)',['quat tran','quat mai','ceiling fan','quat'],['84145199'],''],
 ['Quạt tháp, quạt không cánh (≤125 W)',['quat thap','khong canh','tower fan','bladeless','quat'],['84145199'],''],
 ['Quạt công nghiệp, quạt thông gió > 125 W',['quat cong nghiep','quat thong gio','quat hut','quat'],['84145941','84145949'],'Có lưới → .41'],
 ['Máy hút mùi bếp',['hut mui','hut khoi','range hood'],['84146019','84146099'],'Đã lắp lọc → .19'],
 ['Máy làm sữa hạt',['sua hat','lam sua','soy milk','sua dau'],['85094000'],''],
 ['Máy xay sinh tố, máy xay thịt, máy đánh trứng',['xay','sinh to','blender','xay thit','danh trung','may xay'],['85094000'],''],
 ['Máy ép trái cây, máy ép chậm',['may ep','ep trai cay','ep cham','ep hoa qua','juicer'],['85094000'],''],
 ['Nồi chiên không dầu',['noi chien','air fryer','chien khong dau'],['85166090'],''],
 ['Lò nướng, bếp nướng điện',['lo nuong','bep nuong','vi nuong','oven'],['85166090'],''],
 ['Bếp từ, bếp điện, bếp hồng ngoại',['bep tu','bep dien','hong ngoai','induction'],['85166090'],''],
 ['Nồi cơm điện',['noi com','rice cooker'],['85166010'],''],
 ['Nồi áp suất điện, nồi lẩu điện, nồi nấu chậm',['noi ap suat','noi lau','nau cham','noi dien'],['85166090'],''],
 ['Ấm siêu tốc, ấm đun nước',['am sieu toc','am dun','kettle','sieu toc'],['85167910'],''],
 ['Máy pha cà phê, pha trà',['ca phe','pha tra','coffee'],['85167100'],''],
 ['Máy nướng bánh mì (toaster)',['banh mi','toaster','sandwich'],['85167200'],''],
 ['Bình thủy điện',['binh thuy'],['85161011'],''],
 ['Bình nóng lạnh, máy nước nóng',['nuoc nong','nong lanh','water heater'],['85161019'],''],
 ['Lò vi sóng',['vi song','microwave'],['85165000'],'VAT 10% (không được giảm)'],
 ['Máy sấy tóc',['say toc','hair dryer'],['85163100'],''],
 ['Máy uốn, duỗi, kẹp tóc',['uon toc','duoi toc','kep toc'],['85163200'],''],
 ['Bàn là, bàn ủi',['ban la','ban ui','ban hoi'],['85164090'],''],
 ['Máy sưởi điện',['may suoi','suoi dien','heater'],['85162900'],''],
 ['Máy hút ẩm',['hut am','dehumidifier'],['85098090'],'VAT 10% (không được giảm)'],
 ['Máy lọc không khí',['loc khong khi','air purifier'],['84213920'],''],
 ['Máy lọc nước gia đình',['loc nuoc','water purifier'],['84212111'],''],
 ['Máy hút bụi',['hut bui','vacuum','robot hut'],['85081100','85081910'],'VAT 10% (không được giảm)'],
 ['Máy rửa bát gia đình',['rua bat','rua chen','dishwasher'],['84221100'],''],
 ['Máy điều hòa không khí (≤ 21,1 kW)',['dieu hoa khong khi','may lanh','dieu hoa treo tuong','air conditioner'],['84151020'],'Không phải quạt điều hòa · VAT 10%'],
 ['Tủ lạnh gia đình',['tu lanh','fridge'],['84182110','84182190'],'VAT 10%'],
 ['Máy giặt gia đình',['may giat','washing'],['84501110','84501190','84502000'],'Theo sức chứa: ≤6 kg / 6–10 kg / >10 kg · VAT 10%'],
 ['Máy sấy quần áo (≤ 10 kg vải khô/lần)',['say quan ao','may say quan ao','say do','clothes dryer','tumble dryer','may say'],['84512100'],'Loại > 10 kg → 8451.29.00 · VAT 8%'],
 ['Máy sấy quần áo công nghiệp (> 10 kg)',['say quan ao','say cong nghiep','may say'],['84512900'],''],
 ['Máy giặt có chức năng sấy',['giat say','may giat say','washer dryer'],['84501110','84501190'],'Vẫn thuộc nhóm 84.50 · VAT 10%'],
 ['Bình giữ nhiệt, phích chân không',['giu nhiet','phich','binh giu nhiet','vacuum flask','thermos'],['96170010'],''],
 ['Bếp gas',['bep gas','bep ga','gas stove'],['73211100'],''],
 ['Máy làm đá',['lam da','ice maker','may lam da'],['84186950','84186990'],'Đá vảy → .50 · VAT 10%'],
 ['Robot hút bụi, lau nhà',['robot hut','robot lau','lau nha'],['85081100'],'Có chức năng hút bụi → 85.08; chỉ lau sàn cần xem lại'],
 ['Cây nước nóng lạnh',['cay nuoc','nong lanh','water dispenser'],['84186930'],'Có làm lạnh → 8418.69.30 · VAT 10%'],
 ['Bóng đèn LED',['den led','bong den','led'],['85395210'],'VAT 10%']];
const KW=KEYWORDS.map(k=>({label:k[0],keys:k[1],codes:k[2],note:k[3],nl:norm(k[0])}));
function kwMatch(text,loose){const n=norm(text).trim();if(!n)return [];const toks=n.split(/\s+/).filter(x=>x.length>1);
  const sc=[];KW.forEach(k=>{let s=0;
    for(const key of k.keys){if(n.includes(key))s=Math.max(s,10+key.length);else if(loose&&key.startsWith(n))s=Math.max(s,10+n.length)}
    if(loose&&!s){if(k.nl.includes(n))s=6;else{const words=(k.nl+' '+k.keys.join(' ')).split(/[^a-z0-9]+/);const m=toks.filter(t=>words.some(w=>t.length<=2?w===t:w.startsWith(t))).length;if(m&&m===toks.length)s=4+m}}
    if(s)sc.push([s,k])});
  sc.sort((a,b)=>b[0]-a[0]);
  // khi đã có từ khoá cụ thể (vd "quat dieu hoa"), bỏ từ khoá chung "quat"
  const top=sc.length?sc[0][0]:0;return sc.filter(x=>x[0]>=(top>=10?top-4:0)).map(x=>x[1])}
const ATTP_RE=/sua|xay|sinh to|ep |noi|am |chien|nuong|thuc pham|bep|chao|coc|binh|hop com|pha (ca phe|tra)|blender|juicer|fryer|kettle/;
const ATTP_HS=['850940','851660','851671','851672','851679','7323','3924','761510','821191'];
const T04='QCVN 4:',T09='QCVN 9:';

/* ---------------- data load ---------------- */
let DB=null, DBsrc='builtin';
async function decodeBuiltin(){
  const b64=window.LC_TARIFF_B64.trim();
  const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  const ds=new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(ds).json();
}
function indexDB(d){
  const ci={};d.cols.forEach((c,i)=>ci[c]=i);d.ci=ci;d.map=new Map();d.ndesc=[];
  const H=d.heads||{},HE=d.heads_en||{};d.nfull=[];d.nleaf=[];
  const sp=s=>' '+norm(s).replace(/[^a-z0-9]+/g,' ')+' ';
  d.rows.forEach((r,i)=>{d.map.set(r[0],r);d.ndesc[i]=norm(r[1]);const segs=r[1].split(' › ');
    d.nleaf[i]=sp(segs.slice(1).join(' '));
    d.nfull[i]=sp((H[r[0].slice(0,4)]||segs[0])+' '+segs.slice(1).join(' '))+'|'+sp((HE[r[0].slice(0,4)]||'')+' '+(ci.en!=null?r[ci.en]:''))});
  return d;
}
function row(hs){return DB&&DB.map.get(String(hs||'').replace(/\D/g,''))}
function fld(r,k){return r?r[DB.ci[k]]:''}
function parseRate(s){
  s=String(s??'').trim();if(!s||s==='*'||s==='-'||/^x$/i.test(s))return null;
  const m=s.match(/^(\d+(?:[.,]\d+)?)/);if(!m)return null;
  const ex=[];const p=s.match(/\(-([^)]*)\)/);if(p)p[1].split(/[,\s]+/).forEach(x=>x&&ex.push(x.trim().toUpperCase()));
  return {v:parseFloat(m[1].replace(',','.')),ex};
}
function rcepRate(hs,sheet,year){
  const d=DB.rcep&&DB.rcep[sheet];if(!d)return null;const v=d[hs];if(v==null)return null;
  const yrs=DB.rcepYears||[2025,2026,2027];
  if(!Array.isArray(v))return parseRate(v);
  let i=yrs.indexOf(year);if(i<0)i=year<yrs[0]?0:yrs.length-1;return parseRate(v[i]);
}
/* manual overrides */
let OVR=LS.get('lc_ovr',[]);
function ovr(hs,field,dateStr){
  let best=null;for(const o of OVR){if(o.hs===hs&&o.field===field&&(!o.from||o.from<=dateStr)){if(!best||o.from>best.from)best=o}}return best;
}
function tt36For(hs){const out=[];if(!DB.tt36)return out;for(let L=8;L>=4;L--){const e=DB.tt36[hs.slice(0,L)];if(e)e.forEach(x=>out.push(x))}return out}
function hsnlFor(hs){return HSNL.filter(h=>hs.startsWith(h[0]))}

/* Thuế suất cho 1 mã + xuất xứ + ngày */
function rates(hs,origin,dateStr,pname){
  const r=row(hs);const o=OMAP[origin]||OMAP.XX;const year=+String(dateStr||'').slice(0,4)||new Date().getFullYear();
  if(!r)return null;
  let mfn=parseRate(fld(r,'mfn')),nktt=parseRate(fld(r,'nktt'));
  const om=ovr(r[0],'mfn',dateStr);if(om)mfn={v:om.v,ex:[],ovr:om};
  let base=o.nomfn?nktt:mfn;const baseLabel=o.nomfn?'NK thông thường':'NK ưu đãi (MFN)';
  const cands=[];
  for(const k of o.fta){let p=parseRate(fld(r,k));const ov=ovr(r[0],k,dateStr);if(ov)p={v:ov.v,ex:[],ovr:ov};
    if(p&&!p.ex.includes(origin))cands.push({k,label:FTA_LABEL[k],v:p.v,ovr:p.ovr})}
  if(o.rcep){let p=rcepRate(r[0],o.rcep,year);const ov=ovr(r[0],'rcep',dateStr);if(ov)p={v:ov.v,ex:[],ovr:ov};
    if(p)cands.push({k:'rcep',label:'RCEP biểu '+o.rcep+' ('+Math.min(Math.max(year,2025),2027)+')',v:p.v,ovr:p.ovr})}
  cands.sort((a,b)=>a.v-b.v);
  let pref=cands[0]||null;if(pref&&base&&pref.v>=base.v)pref={...pref,noGain:true};
  // VAT
  let vat=parseFloat(fld(r,'vat'));const vnote=DB.pol[r[DB.ci.vatnote]]||'';let vatNote='';
  if(isNaN(vat))vat=10;
  let vatSplit=false;
  if(r[0]==='85098090'&&vat===10){vatSplit=true; /* PL loại trừ chỉ nêu máy hút ẩm */
    if(pname!=null&&!/hut am|dehumid/.test(norm(pname))){vat=8;vatNote='Mã 8509.80.90: chỉ máy hút ẩm bị loại khỏi giảm VAT; hàng khác (vd máy làm mát) được 8%'}}
  if(vat===8&&dateStr>'2026-12-31'){vat=10;vatNote=(vatNote?vatNote+'. ':'')+'Giảm VAT 2% (NQ 204/2025/QH15) hết hạn 31/12/2026 → tạm tính 10%'}
  const ov=ovr(r[0],'vat',dateStr);if(ov){vat=ov.v;vatNote='Điều chỉnh: '+ov.doc}
  return {r,base,baseLabel,cands,pref,vat,vatNote,vnote,year,vatSplit};
}

/* ---------------- state ---------------- */
const DEF_S={rate:26020,date:'',c40:2500,c20:1200,frPct:100,ins:0.09,other:0,coMode:'single',t04:5000000,t09:10000000,tHs:1500000,tAt:8000000};
let S=Object.assign({},DEF_S,LS.get('lc_settings',{}));
if(!S.v2){S.ins=0.09;S.v2=1}
if(!S.date){const d=new Date();d.setDate(d.getDate()+30);S.date=d.toISOString().slice(0,10)}
const SAMPLE=[
 {id:1,sample:true,code:'VD-QDH01',name:'Quạt điều hòa 40L (ví dụ)',weight:'24',fob:42,moq:300,cont:'40',origin:'CN',hs:'84796000',qty:'',group:'',annual:'1200',img:'',man:{},co:'yes'},
 {id:2,sample:true,code:'VD-SH01',name:'Máy làm sữa hạt 1,2L (ví dụ)',fob:21.5,moq:1600,cont:'40',origin:'CN',hs:'85094000',qty:'800',group:'A',annual:'3200',img:'',man:{}},
 {id:3,sample:true,code:'VD-QD02',name:'Quạt đứng 16 inch (ví dụ)',fob:9.8,moq:1100,cont:'40',origin:'CN',hs:'84145199',qty:'550',group:'A',annual:'',img:'',man:{}}];
let P=LS.get('lc_products',null)||JSON.parse(JSON.stringify(SAMPLE));
let nextId=Math.max(0,...P.map(p=>p.id))+1;
const save=()=>{LS.set('lc_products',P);LS.set('lc_settings',S)};

/* auto-detect checks */
function autoChecks(p){
  const hs=String(p.hs||'');const out={q04:null,q09:null,hsnl:null,attp:null};
  if(hs.length===8&&DB){
    const tt=tt36For(hs);
    const e04=tt.filter(e=>e.q.some(q=>q.startsWith(T04)));const e09=tt.filter(e=>e.q.some(q=>q.startsWith(T09)));
    if(e04.length)out.q04='TT36 PL '+[...new Set(e04.map(e=>e.a))].join('/');
    if(e09.length)out.q09='TT36 PL '+[...new Set(e09.map(e=>e.a))].join('/');
    if(hsnlFor(hs).length)out.hsnl='QĐ 1725';
    const pol=norm(DB.pol[(row(hs)||[])[DB.ci.pol]]||'');
    if(/an toan thuc pham|attp/.test(pol))out.attp='Biểu thuế';
    else if(ATTP_HS.some(x=>hs.startsWith(x))&&ATTP_RE.test(norm(p.name)))out.attp='Tiếp xúc thực phẩm';
  }
  return out;
}
function checksOf(p){const a=autoChecks(p);const c={};for(const k of ['q04','q09','hsnl','attp']){c[k]=(p.man&&k in p.man)?p.man[k]:!!a[k]}return {c,a}}

/* ---------------- engine ---------------- */
function compute(list,s,opt={}){
  const rate=s.rate*(opt.fx||1);const dateStr=opt.date||s.date;
  const cc={'40':s.c40*(opt.fr||1),'20':s.c20*(opt.fr||1)};
  const qtyOf=p=>{const q=pnum(p.qty);return q>0?q:(pnum(p.moq)||0)};
  const groups=new Map();
  list.forEach(p=>{const g=String(p.group||'').trim();const key=g?'G:'+g.toUpperCase():'S:'+p.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p)});
  const fr={};
  for(const [key,ps] of groups){
    const type=ps[0].cont||'40';const fills=ps.map(p=>{const m=pnum(p.moq),q=qtyOf(p);return m>0?q/m:0});
    const tot=fills.reduce((a,b)=>a+b,0);const n=Math.max(1,Math.ceil(tot-1e-9));
    ps.forEach((p,i)=>{fr[p.id]={key,type,n,tot,share:tot>0?fills[i]/tot:0,mixed:ps.length>1,typeMismatch:ps.some(x=>(x.cont||'40')!==type),costUSD:n*cc[type],otherVND:n*(s.other||0)}});
  }
  return list.map(p=>{
    const res={p,warn:[]};const q=qtyOf(p);const fob=pnum(p.fob);res.q=q;
    const hs=opt.hs&&opt.hs[p.id]?opt.hs[p.id]:String(p.hs||'').replace(/\D/g,'');res.hs=hs;
    const f=fr[p.id];res.f=f;
    if(!(fob>0)||!(q>0)||!(pnum(p.moq)>0)){res.incomplete=true}
    const frU=q>0?f.costUSD*f.share/q:0;const frCIF=frU*(s.frPct/100);
    const insU=(fob||0)*(s.ins/100);const cifU=(fob||0)+frCIF+insU;const cifV=cifU*rate;
    const R=rates(hs,p.origin,dateStr,p.name||'');res.R=R;
    const {c}=checksOf(p);res.checks=c;
    const annual=pnum(p.annual)>0?pnum(p.annual):q;
    res.t04=c.q04&&q>0?s.t04/q:0;res.t09=c.q09&&annual>0?s.t09/annual:0;res.tHs=c.hsnl&&annual>0?s.tHs/annual:0;res.tAt=c.attp&&annual>0?s.tAt/annual:0;
    res.tests=res.t04+res.t09+res.tHs+res.tAt;
    res.otherU=q>0?f.otherVND*f.share/q:0;
    res.fobV=(fob||0)*rate;res.frV=frU*rate;res.insV=insU*rate;res.cifV=cifV;
    const baseR=R&&R.base?R.base.v:NaN;const prefR=R?(R.pref&&!R.pref.noGain?R.pref.v:baseR):NaN;
    res.dutyRateNo=baseR;res.dutyRateCO=prefR;res.dutyNo=cifV*(baseR||0)/100;res.dutyCO=cifV*(prefR||0)/100;
    const common=res.fobV+res.frV+res.insV+res.tests+res.otherU;
    res.landNo=common+res.dutyNo;res.landCO=common+res.dutyCO;
    res.vat=R?R.vat:NaN;res.vatNo=(cifV+res.dutyNo)*(res.vat||0)/100;res.vatCO=(cifV+res.dutyCO)*(res.vat||0)/100;
    res.useCO=p.co!=='no';const gain=R&&R.pref&&!R.pref.noGain;
    res.dutyRate=res.useCO?res.dutyRateCO:res.dutyRateNo;res.duty=res.useCO?res.dutyCO:res.dutyNo;res.land=res.useCO?res.landCO:res.landNo;res.vatPay=res.useCO?res.vatCO:res.vatNo;res.landVat=res.land*(1+(res.vat||0)/100);
    res.coLabel=res.useCO?(gain?'Có – '+R.pref.label:(R&&R.pref?'Có – '+R.pref.label+' (không thấp hơn MFN)':'Có – không có ưu đãi FTA, tính MFN')):'Không C/O – '+(R?R.baseLabel:'MFN');
    // warnings
    if(p.hsAuto&&R)res.warn.push(['warn','Mã HS <b>'+fmtHS(hs)+'</b> do tool gợi ý từ tên khi nhập Excel — kiểm tra lại rồi chọn mã ở ô HS để xác nhận.']);
    if(!R){res.warn.push(['bad','Chưa có mã HS hợp lệ — chọn mã 8 số để tính thuế.'])}
    else{
      if(R.base==null)res.warn.push(['bad','Biểu thuế không có thuế suất MFN cho mã này.']);
      if(!R.pref&&OMAP[p.origin]&&OMAP[p.origin].fta.length)res.warn.push(['warn','Không có ưu đãi FTA cho xuất xứ này (hoặc nước bị loại trừ) — giá có C/O = không C/O.']);
      if(R.pref&&R.pref.noGain)res.warn.push(['info','C/O không giúp giảm thuế cho mã này (FTA ≥ MFN).']);
      if(!res.useCO&&gain&&!res.incomplete)res.warn.push(['info','Đang tính <b>không C/O</b>. Nếu có C/O '+esc(R.pref.label)+': thuế còn '+fmt(R.pref.v,1)+'%, giảm '+fmt(res.dutyNo-res.dutyCO)+' đ/sp.']);
      if(R.pref&&R.pref.ovr)res.warn.push(['info','Đang áp thuế suất điều chỉnh thủ công: '+esc(R.pref.ovr.doc)]);
      if(R.vatNote)res.warn.push([R.vatSplit?'info':'warn','VAT: '+esc(R.vatNote)]);
      if(!R.vatSplit&&R.vat===10&&/khong duoc giam/.test(norm(R.vnote)))res.warn.push(['info','VAT: '+esc(R.vnote)]);
      const pol=DB.pol[R.r[DB.ci.pol]]||'';
      if(/2711\/QĐ-BKHCN/.test(pol))res.warn.push(['info','Cột chính sách của file biểu thuế còn dẫn "Hàng hóa nhóm 2 (2711/QĐ-BKHCN)". Từ 01/07/2026 thay bằng danh mục rủi ro TT 36/2026/TT-BKHCN — tool đã dùng TT 36.']);
      const tt=tt36For(hs);if(tt.some(e=>e.a==='I'))res.warn.push(['warn','<b>TT 36 – Phụ lục I (rủi ro cao):</b> chứng nhận hợp quy bởi tổ chức được chỉ định + kiểm tra nhà nước về chất lượng khi nhập, phải xong trước khi bán.']);
      else if(tt.length)res.warn.push(['info','<b>TT 36 – Phụ lục II (rủi ro trung bình):</b> công bố hợp quy trước khi lưu thông, không kiểm tra nhà nước tại khâu nhập.']);
      const hn=hsnlFor(hs);if(hn.length&&hn[0][3])res.warn.push(['info','Hiệu suất năng lượng (QĐ 1725): '+esc(hn[0][1])+' – '+esc(hn[0][3])+'.']);
      {const cr=classRule(p);if(cr){const v=pnum(p.spec);const exp=specCode(p);
        if(!(v>0))res.warn.push(['warn','<b>'+cr.label+':</b> nhập '+cr.param.toLowerCase()+' ('+cr.unit+') ở ô thông số để tool chọn đúng mã. Ngưỡng: '+cr.rule+'.']);
        else if(exp&&exp!==hs)res.warn.push(['bad','<b>Mã chưa khớp '+cr.param.toLowerCase()+':</b> '+cr.label.toLowerCase()+' '+fmt(v,1)+' '+cr.unit+' → <b>'+fmtHS(exp)+'</b>, đang khai '+(fmtHS(hs)||'trống')+'. <button type="button" class="btn" data-act="seths" data-hs="'+exp+'" style="padding:2px 8px;font-size:12px">Đổi sang '+fmtHS(exp)+'</button>']);
        else if(exp)res.warn.push(['info','<b>Đúng mã theo '+cr.param.toLowerCase()+':</b> '+fmt(v,1)+' '+cr.unit+' → '+fmtHS(exp)+'. ('+cr.rule+')'])}}
      if(isAirCooler(p)){const w=pnum(p.weight);const exp=cvCode(p);const CVT='CV '+CV10442.no+' ('+CV10442.date+')';
        if(!exp)res.warn.push(['bad','<b>Máy làm mát bay hơi:</b> nhập trọng lượng máy. Theo '+CVT+': trên 20 kg → 8479.60.00 (MFN 0%); từ 20 kg trở xuống → 8509.80.90 (MFN 25%, ACFTA 5%).']);
        else if(exp!==hs&&(hs===CV10442.heavy||hs===CV10442.light||!hs))res.warn.push(['bad','<b>Sai mã theo '+CVT+':</b> máy '+fmt(w,1)+' kg '+(w>20?'trên':'không quá')+' 20 kg phải khai <b>'+fmtHS(exp)+'</b>, đang khai '+(fmtHS(hs)||'trống')+'. <button type="button" class="btn" data-act="seths" data-hs="'+exp+'" style="padding:2px 8px;font-size:12px">Đổi sang '+fmtHS(exp)+'</button>']);
        else if(exp===hs)res.warn.push([w>20&&w<=22?'warn':'info','<b>Đúng mã theo '+CVT+':</b> '+fmt(w,1)+' kg → '+fmtHS(exp)+'.'+(w>20&&w<=22?' Trọng lượng sát ngưỡng 20 kg: công văn không nói rõ tịnh hay cả bì, nên ghi rõ N.W trên catalogue, packing list và tài liệu kỹ thuật.':'')+' Hải quan vẫn có thể phân tích, phân loại lại theo thực tế hàng.']);
        if(exp===CV10442.heavy||hs===CV10442.heavy)res.warn.push(['info','Mô tả 8479.60.00 theo công văn: khối chữ nhật, mặt trước là cửa gió, có khoang chứa nước, bơm nước tuần hoàn lên khối giấy làm sóng (cooling pad), quạt thổi hơi mát ra. Giữ hồ sơ kỹ thuật thể hiện các bộ phận này.'])}
    }
    if(f.mixed&&f.tot>1.0001)res.warn.push(['warn','Nhóm ghép cont "'+esc(p.group)+'" chiếm '+fmt(f.tot*100)+'% cont → cần '+f.n+' cont.']);
    else if(f.tot<0.999&&f.tot>0)res.warn.push(['warn','Cont mới đầy '+fmt(f.tot*100)+'% — cước/sp đang gánh phần trống. Ghép thêm hàng để giảm cước.']);
    if(f.typeMismatch)res.warn.push(['warn','Các mã trong cùng nhóm ghép đang chọn loại cont khác nhau; tool dùng cont '+f.type+"'."]);
    return res;
  });
}

/* ---------------- UI: settings ---------------- */
const SFIELDS=['rate','date','c40','c20','frPct','ins','other','t04','t09','tHs','tAt'];
function fillSettings(){SFIELDS.forEach(k=>{const el=$('#s_'+k);if(el)el.value=k==='date'?S.date:fmt(S[k],k==='ins'?3:0)});const cm=$('#s_coMode');if(cm)cm.value=S.coMode||'single'}
function bindReset(){
  const panel=$('#resetPanel');
  $('#resetBtn').onclick=()=>{const n=P.length;$('#resetMsg').innerHTML=n?`Đang có <b>${n}</b> sản phẩm${P.some(p=>p.img)?' (kèm ảnh)':''}. Thao tác này không hoàn tác được.`:'Danh sách sản phẩm đang trống.';panel.hidden=false;panel.scrollIntoView({block:'nearest'})};
  panel.addEventListener('click',e=>{const b=e.target.closest('[data-reset]');if(!b)return;const m=b.dataset.reset;panel.hidden=true;if(m==='cancel')return;
    P=[];IMP=null;renderImport();$('#xlsMsg').textContent='';
    if(m==='all'){S=Object.assign({},DEF_S,{v2:1});const d=new Date();d.setDate(d.getDate()+30);S.date=d.toISOString().slice(0,10);fillSettings()}
    save();renderCards();toast(m==='all'?'Đã xoá sản phẩm và đưa thông số về mặc định':'Đã xoá toàn bộ sản phẩm')});
}
function bindSettings(){
  const cm=$('#s_coMode');cm.value=S.coMode||'single';cm.addEventListener('change',()=>{S.coMode=cm.value;save();recalc()});
  SFIELDS.forEach(k=>{const el=$('#s_'+k);el.value=k==='date'?S.date:fmt(S[k],k==='ins'?3:0);
    el.addEventListener('input',()=>{S[k]=k==='date'?el.value:(pnum(el.value)||0);save();recalc()});
    if(k!=='date')el.addEventListener('blur',()=>{el.value=fmt(S[k],k==='ins'?3:0)})});
}

/* ---------------- UI: product cards ---------------- */
/* ---------------- tìm kiếm thông minh ---------------- */
const SYN=[
 ['quan ao',['quan ao','vai','det','giat','clothes','linen','textile']],['do',['do','quan ao','vai','det']],
 ['say',['say','lam kho','drying','dryer']],['lam kho',['lam kho','say','drying']],
 ['dieu hoa khong khi',['dieu hoa khong khi','air conditioning']],['may lanh',['dieu hoa khong khi','air conditioning']],
 ['dieu hoa',['dieu hoa','lam mat','air conditioning','cooler']],['lam mat',['lam mat','cooler','cooling']],
 ['quat',['quat','fan']],['tu lanh',['tu lanh','refrigerator']],['tu dong',['tu ket dong','freezer']],['lanh',['lanh','lam lanh','refrigerat']],
 ['noi',['noi','nau','cooker','cooking']],['chien',['chien','fry','nau']],['nuong',['nuong','lo nuong','oven','grill','roast']],['bep',['bep','cooker','stove','nau']],
 ['xay',['xay','nghien','tron','grinder','mixer','blender']],['ep',['ep','juice','extractor']],['sinh to',['sinh to','blender','tron']],
 ['hut bui',['hut bui','vacuum']],['loc',['loc','filter','purif']],['nuoc nong',['nuoc nong','water heater']],
 ['ban la',['ban la','iron']],['ban ui',['ban la','iron']],['den',['den','lamp','light']],['bong den',['bong den','lamp','bulb']],
 ['pin',['pin','battery','ac quy']],['sac',['sac','charger','nap']],['dien thoai',['dien thoai','telephone']],['tai nghe',['tai nghe','headphone','earphone']],
 ['loa',['loa','loudspeaker']],['tivi',['thu hinh','television']],['ti vi',['thu hinh','television']],['may tinh',['may tinh','computer','xu ly du lieu']],['laptop',['xach tay','portable']],
 ['bat',['bat','dia','tableware','kitchenware']],['chen',['bat','tableware']],['coc',['coc','ly','cup']],['binh',['binh','bottle','flask','container']],
 ['nhua',['nhua','plastic']],['inox',['thep khong gi','stainless']],['thuy tinh',['thuy tinh','glass']],['go',['go','wood']],
 ['do choi',['do choi','toy']],['xe dap',['xe dap','bicycle']],['massage',['xoa bop','massage']],['xoa bop',['xoa bop','massage']],
 ['can',['can','weighing']],['dong ho',['dong ho','clock','watch']],['camera',['camera','video','ghi hinh']],['robot',['robot','tu dong']],
 ['say toc',['say kho toc','hair']],['toc',['toc','hair']],['rua bat',['rua bat','dishwash']],['giat',['giat','washing']],
 ['giu nhiet',['chan khong','phich','vacuum flask','giu nhiet']],['phich',['phich','chan khong','vacuum flask']],['lam da',['san xuat da','lam da','ice']],['gas',['nhien lieu khi','gas']],['ga',['nhien lieu khi','gas']],
 ['lau nha',['hut bui','lau','floor','vacuum']],['cam tay',['cam tay','hand']],['sac dien',['sac','charger']],['bluetooth',['khong day','wireless']],['khong day',['khong day','wireless','cordless']],
 ['nuoc',['nuoc','water']],['khong khi',['khong khi','air']],['dien',['dien','electric']],['gia dung',['gia dung','gia dinh','household','domestic']]];
const STOP=new Set(['may','cai','chiec','bo','loai','cho','dung','de','va','cua','bang','hang','san','pham','thiet','bi','mini','cao','cap','moi','nhap','khau','gia','dinh','the','a','of','for','and']);
function parseQuery(q){
  let n=' '+norm(q).replace(/[^a-z0-9]+/g,' ').trim()+' ';const concepts=[];
  for(const [k,alts] of SYN.slice().sort((a,b)=>b[0].length-a[0].length)){if(n.includes(' '+k+' ')){concepts.push({k,alts,w:1});n=n.replace(' '+k+' ',' ')}}
  n.trim().split(/\s+/).filter(Boolean).forEach(tk=>concepts.push({k:tk,alts:[tk],w:STOP.has(tk)?0.25:1}));
  return concepts}
function searchHS(q,limit=40){
  const C=parseQuery(q);if(!C.length)return {list:[],C,approx:false};
  const max=C.reduce((a,c)=>a+c.w,0);const strong=C.filter(c=>c.w>=1).length;const qn=' '+norm(q).replace(/[^a-z0-9]+/g,' ').trim()+' ';
  const sc=[];
  DB.rows.forEach((r,i)=>{const F=DB.nfull[i],Lf=DB.nleaf[i];let s=0,hit=0,leaf=0;
    const has=(T,a)=>a.length<=3?T.includes(' '+a+' '):T.includes(' '+a);
    for(const c of C){if(c.alts.some(a=>has(F,a))){s+=c.w;if(c.w>=1)hit++;if(c.alts.some(a=>has(Lf,a)))leaf+=c.w}}
    if(r[0].startsWith('98'))s-=0.6;
    if(hit){if(qn.length>4&&F.includes(qn))s+=2;sc.push({c:r[0],s:s+leaf*0.35,hit,len:F.length})}});
  sc.sort((a,b)=>b.s-a.s||a.len-b.len);
  const need=strong<=2?strong:strong-1;let list=sc.filter(x=>x.hit>=need);let approx=false;
  if(!list.length){list=sc;approx=true}
  return {list:list.slice(0,limit),C,approx};
}
function hsSuggest(name,q){
  const out=[];const seen=new Set();const n=norm(name);
  const addKw=list=>list.forEach(k=>k.codes.forEach(c=>{if(row(c)&&!seen.has(c)){seen.add(c);out.push({c,hint:k.label+(k.note?' · '+k.note:'')})}}));
  if(n)addKw(kwMatch(name,false));
  if(q&&!/^[\d.\s]+$/.test(q))addKw(kwMatch(q,true));
  const qq=norm(q||'').trim();
  if(qq){
    const digits=qq.replace(/[.\s]/g,'');
    if(/^\d{2,8}$/.test(digits)){for(const r of DB.rows){if(r[0].startsWith(digits)&&!seen.has(r[0])){seen.add(r[0]);out.push({c:r[0]});if(out.length>40)break}}}
    else{const R=searchHS(q,50);R.list.forEach(x=>{if(!seen.has(x.c)){seen.add(x.c);out.push({c:x.c,approx:R.approx})}})}
  }
  return out.slice(0,40);
}
function hsSuggestP(p,q){const list=hsSuggest(p.name,q);const cr=classRule(p);const e=isAirCooler(p)?cvCode(p):specCode(p);
  if(e){let i=list.findIndex(x=>x.c===e);if(i<0){list.unshift({c:e,hint:''});i=0}if(i>0){const [x]=list.splice(i,1);list.unshift(x)}
    list[0].hint=(isAirCooler(p)?'Đúng theo trọng lượng '+fmt(pnum(p.weight),1)+' kg':'Đúng theo '+cr.param.toLowerCase()+' '+fmt(pnum(p.spec),1)+' '+cr.unit)+(list[0].hint?' · '+list[0].hint:'')}
  return list}
function shortDesc(hs){const r=row(hs);if(!r)return '';const parts=r[1].split(' › ');return parts.length>2?parts[0].slice(0,50)+'… › '+parts.slice(-2).join(' › '):r[1]}
function originOpts(sel){return ORIGINS.map(o=>`<option value="${o.id}"${o.id===sel?' selected':''}>${esc(o.name)}</option>`).join('')}
function cardHTML(p,i){
  return `<article class="pcard" data-id="${p.id}">
  <div class="imgcol"><span class="idx">#${i+1}</span>
    <label class="imgbox" title="Chọn ảnh sản phẩm">${p.img?`<img alt="" src="${p.img}">`:'Bấm để<br>thêm ảnh'}<input type="file" accept="image/*" data-k="imgfile" hidden></label>
    <button class="ghost small" data-act="del" title="Xoá sản phẩm">Xoá</button></div>
  <div class="pbody">
    <div class="prow">
      <label class="f">Mã sản phẩm<input id="p${p.id}_code" data-k="code" value="${esc(p.code)}"></label>
      <label class="f wide">Tên sản phẩm<input id="p${p.id}_name" data-k="name" value="${esc(p.name)}"></label>
      <label class="f">Giá FOB (USD/sp)<input id="p${p.id}_fob" data-k="fob" class="num" inputmode="decimal" value="${esc(p.fob)}"></label>
      <label class="f">MOQ (sp đầy 1 cont)<input id="p${p.id}_moq" data-k="moq" class="num" inputmode="numeric" value="${esc(p.moq)}"></label>
      <label class="f">Trọng lượng (kg/máy)<input id="p${p.id}_weight" data-k="weight" class="num" inputmode="decimal" placeholder="Bắt buộc với quạt điều hòa" value="${esc(p.weight||'')}"></label>
      <label class="f" data-out="specbox"><span data-out="speclab">Thông số phân loại</span><input id="p${p.id}_spec" data-k="spec" class="num" inputmode="decimal" value="${esc(p.spec||'')}"><span class="h" data-out="spech"></span></label>
      <label class="f">Loại cont<select id="p${p.id}_cont" data-k="cont"><option value="40"${p.cont==='40'?' selected':''}>1 × 40'</option><option value="20"${p.cont==='20'?' selected':''}>1 × 20'</option></select></label>
      <label class="f">Xuất xứ<select id="p${p.id}_origin" data-k="origin">${originOpts(p.origin)}</select></label>
      <label class="f">C/O ưu đãi<select id="p${p.id}_co" data-k="co"><option value="yes"${p.co!=='no'?' selected':''}>Có C/O</option><option value="no"${p.co==='no'?' selected':''}>Không C/O</option></select><span class="h" data-out="coh"></span></label>
      <div class="f hsfield wide"><label class="f">Mã HS<input id="p${p.id}_hs" data-k="hs" class="mono" autocomplete="off" placeholder="Gõ mã hoặc từ khoá" value="${esc(fmtHS(p.hs))}"></label><div class="sug" hidden></div><div class="hsdesc" data-out="hsdesc"></div></div>
      <label class="f wide">Tên nhà máy<input id="p${p.id}_factory" data-k="factory" placeholder="Tên nhà máy / nhà cung cấp" value="${esc(p.factory||'')}"></label>
      <label class="f">Cảng đi<input id="p${p.id}_pol" data-k="pol" list="polList" placeholder="vd Ningbo" value="${esc(p.pol||'')}"></label>
      <label class="f" style="grid-column:1/-1">Địa chỉ nhà máy<input id="p${p.id}_faddr" data-k="faddr" value="${esc(p.faddr||'')}"></label>
      <label class="f" style="grid-column:1/-1">Thông số kỹ thuật<input id="p${p.id}_tech" data-k="tech" placeholder="vd 220V/50Hz, 180W, bình nước 40L, 3 tốc độ gió" value="${esc(p.tech||'')}"><span class="h">Được đưa vào mô tả hàng hoá khai báo</span></label>
      <div class="f" style="grid-column:1/-1"><label class="f">Mô tả hàng hoá (khai báo) <span class="h" data-out="descsrc"></span><input id="p${p.id}_desc" data-k="desc" value="${esc(descOf(p))}"></label></div>
    </div>
    <details class="adv"${(p.group||p.qty||p.annual)?' open':''}><summary>Số lượng lô, ghép cont, phân bổ năm</summary>
      <div class="prow" style="margin-top:8px">
        <label class="f">SL nhập lô này<input id="p${p.id}_qty" data-k="qty" class="num" inputmode="numeric" placeholder="= MOQ" value="${esc(p.qty)}"></label>
        <label class="f">Nhóm ghép cont<input id="p${p.id}_group" data-k="group" placeholder="Trống = cont riêng" value="${esc(p.group)}"></label>
        <label class="f">SL nhập dự kiến / năm<input id="p${p.id}_annual" data-k="annual" class="num" inputmode="numeric" placeholder="= SL lô" value="${esc(p.annual)}"></label>
      </div></details>
    <div class="checks" data-out="checks"></div>
    <div class="result" data-out="result"></div>
    <div class="warns" data-out="warns"></div>
  </div></article>`;
}
function renderCards(){
  $('#plist').innerHTML=P.length?P.map(cardHTML).join(''):'<section class="panel"><p style="margin:0"><b>Chưa có sản phẩm.</b> Bấm <b>＋ Thêm sản phẩm</b> để nhập tay, hoặc <b>Nhập từ Excel</b> để nạp nhiều dòng từ file mẫu.</p></section>';
  $('#sampleBanner').hidden=!P.some(p=>p.sample);
  recalc();
}
function pById(id){return P.find(p=>p.id===+id)}
function resizeImage(file){return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>{const im=new Image();im.onload=()=>{const M=240;const k=Math.min(1,M/Math.max(im.width,im.height));const c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.85))};im.onerror=rej;im.src=fr.result};fr.onerror=rej;fr.readAsDataURL(file)})}
function showSug(card,p){
  const box=card.querySelector('.sug');const inp=card.querySelector('[data-k="hs"]');
  const list=hsSuggestP(p,inp.value===fmtHS(p.hs)?'':inp.value);
  if(!list.length){box.innerHTML='<div class="small muted" style="padding:8px 10px">Không thấy mã phù hợp. Gõ từ khoá khác (vd "quat", "may xay") hoặc dùng tab Tra cứu HS.</div>';box.hidden=false;return}
  box.innerHTML=list.map(x=>{const r=row(x.c);const m=parseRate(fld(r,'mfn'));const a=parseRate(fld(r,'acfta'));
    return `<button type="button" data-hs="${x.c}"><b>${fmtHS(x.c)}</b> ${x.hint?'<span class="chip steel">gợi ý: '+esc(x.hint)+'</span>':''} <span class="muted">MFN ${m?m.v:'–'}% · ACFTA ${a?a.v:'–'}%</span><br>${esc(shortDesc(x.c))}</button>`}).join('');
  box.hidden=false;
}
function bindCards(){
  const pl=$('#plist');
  pl.addEventListener('input',e=>{const el=e.target;const card=el.closest('.pcard');if(!card)return;const p=pById(card.dataset.id);const k=el.dataset.k;if(!k||k==='imgfile')return;
    if(k==='hs'){const d=el.value.replace(/\D/g,'');if(d.length===8||el.value.trim()===''){p.hs=d;p.hsAuto=false}if(d.length===8&&row(d)){card.querySelector('.sug').hidden=true}else showSug(card,p)}
    else if(k==='desc'){p.desc=el.value;p.descManual=el.value.trim()!==''}
    else p[k]=el.value;
    save();recalc();});
  pl.addEventListener('change',async e=>{const el=e.target;const card=el.closest('.pcard');if(!card)return;const p=pById(card.dataset.id);
    if(el.dataset.k==='imgfile'&&el.files[0]){try{p.img=await resizeImage(el.files[0]);card.querySelector('.imgbox').innerHTML=`<img alt="" src="${p.img}">`;const nf=document.createElement('input');nf.type='file';nf.accept='image/*';nf.dataset.k='imgfile';nf.hidden=true;card.querySelector('.imgbox').appendChild(nf);save()}catch(err){toast('Không đọc được ảnh này. Thử ảnh JPG/PNG khác.')}}
    if(el.dataset.ck){p.man=p.man||{};p.man[el.dataset.ck]=el.checked;save();recalc()}
    if(el.dataset.k==='cont'||el.dataset.k==='origin'||el.dataset.k==='co'){p[el.dataset.k]=el.value;save();recalc()}});
  pl.addEventListener('focusin',e=>{const el=e.target;if(el.dataset.k==='hs'){const card=el.closest('.pcard');showSug(card,pById(card.dataset.id))}});
  pl.addEventListener('focusout',e=>{const el=e.target;if(el.dataset.k==='hs'){const card=el.closest('.pcard');setTimeout(()=>{if(!card.contains(document.activeElement)||!document.activeElement.closest('.hsfield')){card.querySelector('.sug').hidden=true;const p=pById(card.dataset.id);el.value=fmtHS(p.hs)}},150)}});
  pl.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const card=b.closest('.pcard');if(!card)return;const p=pById(card.dataset.id);
    if(b.dataset.act==='descauto'){p.descManual=false;p.desc='';card.querySelector('[data-k="desc"]').value=autoDesc(p);save();recalc();return}
    if(b.dataset.hs||b.dataset.act==='seths'){p.hs=b.dataset.hs;p.hsAuto=false;card.querySelector('[data-k="hs"]').value=fmtHS(p.hs);card.querySelector('.sug').hidden=true;save();recalc()}
    if(b.dataset.act==='del'){
      if(b.dataset.confirm){P=P.filter(x=>x.id!==p.id);save();renderCards()}else{b.dataset.confirm='1';b.textContent='Bấm lần nữa để xoá';b.style.color='var(--bad)';setTimeout(()=>{if(b.isConnected){delete b.dataset.confirm;b.textContent='Xoá';b.style.color=''}},3000)}}});
}
const CKL={q04:'QCVN 04',q09:'QCVN 09',hsnl:'Hiệu suất NL',attp:'ATTP'};
function recalc(){
  if(!DB)return;
  const R=compute(P,S);LAST=R;
  R.forEach(res=>{const card=document.querySelector(`.pcard[data-id="${res.p.id}"]`);if(!card)return;const p=res.p;
    {const cr=classRule(p);const sb=card.querySelector('[data-out="specbox"]');if(sb){sb.hidden=!cr&&!p.spec;card.querySelector('[data-out="speclab"]').textContent=cr?cr.param+' ('+cr.unit+')':'Thông số phân loại';card.querySelector('[data-out="spech"]').textContent=cr?'Tool chọn mã '+cr.label.toLowerCase()+' theo ngưỡng':'';const si=card.querySelector('[data-k="spec"]');si.placeholder=cr?'Bắt buộc để chọn mã':''}}
    const di=card.querySelector('[data-k="desc"]');if(di&&!p.descManual&&document.activeElement!==di)di.value=autoDesc(p);
    const ds=card.querySelector('[data-out="descsrc"]');if(ds)ds.innerHTML=p.descManual?'· bạn tự sửa · <button type="button" class="ghost" data-act="descauto" style="padding:0 4px;font-size:11px">dùng lại tự động</button>':'· tự tạo từ tên, model, thông số kỹ thuật, trọng lượng';
    const hsd=card.querySelector('[data-out="hsdesc"]');hsd.textContent=res.R?shortDesc(res.hs):(p.hs?'Mã không có trong biểu thuế':'Chưa chọn mã HS');
    const {a}=checksOf(p);
    card.querySelector('[data-out="checks"]').innerHTML=Object.keys(CKL).map(k=>`<label class="ck${a[k]?' auto':''}"><input type="checkbox" data-ck="${k}"${res.checks[k]?' checked':''}> ${CKL[k]} <span class="src">${a[k]?esc(a[k]):(p.man&&k in p.man?'tự chọn':'không yêu cầu')}</span></label>`).join('');
    const pr=res.R&&res.R.pref&&!res.R.pref.noGain?res.R.pref:null;
    const coh=card.querySelector('[data-out="coh"]');if(coh)coh.textContent=res.R?(res.useCO?(pr?pr.label+' · '+fmt(pr.v,1)+'%':(res.R.pref?'Bằng MFN '+fmt(res.dutyRateNo,1)+'%':'Không có ưu đãi FTA')):'MFN '+fmt(res.dutyRateNo,1)+'%'):'';
    const single=(S.coMode||'single')==='single';
    card.querySelector('[data-out="result"]').innerHTML=res.incomplete?'<div style="grid-column:1/-1" class="small muted">Nhập giá FOB, MOQ để tính.</div>':single?`
      <div><div class="k">FOB/sp</div><div class="v">${fmt(pnum(p.fob),2)} USD</div><div class="small muted mono">${fmt(res.fobV)} đ</div></div>
      <div><div class="k">Bảo hiểm/sp</div><div class="v">${fmt(res.insV)}</div></div>
      <div><div class="k">Cước + khai thác/sp</div><div class="v">${fmt(res.frV)}</div></div>
      <div><div class="k">Thuế NK · ${res.useCO?'có C/O':'không C/O'}</div><div class="v">${fmt(res.dutyRate,1)}% · ${fmt(res.duty)}</div></div>
      <div><div class="k">Phí kiểm tra/sp</div><div class="v">${fmt(res.tests)}</div></div>
      <div><div class="k">Landed cost chưa VAT</div><div class="v big">${fmt(res.land)}</div></div>
      <div><div class="k">Landed cost gồm VAT (${fmt(res.vat)}%)</div><div class="v big">${fmt(res.landVat)}</div><div class="small muted mono">= giá vốn × (1 + ${fmt(res.vat)}%)</div></div>`:`
      <div><div class="k">FOB/sp</div><div class="v">${fmt(pnum(p.fob),2)} USD</div><div class="small muted mono">${fmt(res.fobV)} đ</div></div>
      <div><div class="k">Bảo hiểm/sp</div><div class="v">${fmt(res.insV)}</div></div>
      <div><div class="k">Cước + khai thác/sp</div><div class="v">${fmt(res.frV)}</div></div>
      <div><div class="k">Thuế NK không C/O</div><div class="v">${fmt(res.dutyRateNo,1)}% · ${fmt(res.dutyNo)}</div></div>
      <div><div class="k">Thuế NK có C/O${pr?' – '+esc(pr.label):''}</div><div class="v">${fmt(res.dutyRateCO,1)}% · ${fmt(res.dutyCO)}</div></div>
      <div><div class="k">Phí kiểm tra/sp</div><div class="v">${fmt(res.tests)}</div></div>
      <div><div class="k">Landed chưa VAT · không C/O</div><div class="v big">${fmt(res.landNo)}</div></div>
      <div><div class="k">Landed chưa VAT · có C/O</div><div class="v big">${fmt(res.landCO)}</div></div>
      <div><div class="k">Landed gồm VAT · có C/O</div><div class="v big">${fmt(res.landCO+res.vatCO)}</div></div>`;
    card.querySelector('[data-out="warns"]').innerHTML=res.warn.map(w=>`<div class="w ${w[0]}">${w[1]}</div>`).join('');
  });
  renderSummary(R);renderSens();renderTimeline();
  $('#paramSum').textContent=`Tỷ giá ${fmt(S.rate)} · 40' ${fmt(S.c40)} USD · 20' ${fmt(S.c20)} USD · bảo hiểm ${fmt(S.ins,2)}% · thông quan ${S.date.split('-').reverse().join('/')}`;
}
let LAST=[];
function renderSummary(R){
  if((S.coMode||'single')==='single'){
    let tL=0,tF=0,tLV=0;const h=`<tr><th>#</th><th>Mã SP</th><th>Tên</th><th>HS</th><th>Xuất xứ</th><th>C/O</th><th class="n">SL lô</th><th class="n">FOB (USD)</th><th class="n">FOB (VND)</th><th class="n">Cước</th><th class="n">Bảo hiểm</th><th class="n">Thuế NK %</th><th class="n">Thuế NK</th><th class="n">Kiểm tra</th><th class="n">Phí khác</th><th class="n">Landed<br>chưa VAT</th><th class="n">VAT NK</th><th class="n">VAT nộp</th><th class="n">Landed<br>gồm VAT</th></tr>`;
    const b=R.map((r,i)=>{if(!r.incomplete){tL+=r.land*r.q;tLV+=r.landVat*r.q;tF+=r.fobV*r.q}
      return `<tr><td>${i+1}</td><td class="mono">${esc(r.p.code)}</td><td>${esc(r.p.name)}</td><td class="mono">${fmtHS(r.hs)||'–'}</td><td>${esc((OMAP[r.p.origin]||{}).name||'')}</td><td>${r.useCO?'Có':'Không'}</td><td class="n">${fmt(r.q)}</td><td class="n">${fmt(pnum(r.p.fob),2)}</td><td class="n">${fmt(r.fobV)}</td><td class="n">${fmt(r.frV)}</td><td class="n">${fmt(r.insV)}</td><td class="n">${fmt(r.dutyRate,1)}%</td><td class="n">${fmt(r.duty)}</td><td class="n">${fmt(r.tests)}</td><td class="n">${fmt(r.otherU)}</td><td class="n"><b>${fmt(r.land)}</b></td><td class="n">${fmt(r.vat)}%</td><td class="n">${fmt(r.vatPay)}</td><td class="n"><b>${fmt(r.landVat)}</b></td></tr>`}).join('');
    $('#sumTbl').innerHTML=`<thead>${h}</thead><tbody>${b}<tr class="tot"><td colspan="8">Tổng giá trị lô (× SL)</td><td class="n">${fmt(tF)}</td><td colspan="6"></td><td class="n">${fmt(tL)}</td><td colspan="2"></td><td class="n">${fmt(tLV)}</td></tr></tbody>`;return}
  const head=`<tr><th>#</th><th>Mã SP</th><th>Tên</th><th>HS</th><th>Xuất xứ</th><th class="n">SL lô</th><th class="n">FOB (USD)</th><th class="n">FOB (VND)</th><th class="n">Cước</th><th class="n">Bảo hiểm</th><th class="n">Thuế NK<br>không C/O</th><th class="n">Thuế NK<br>có C/O</th><th class="n">Kiểm tra</th><th class="n">Phí khác</th><th class="n">Landed<br>không C/O</th><th class="n">Landed<br>có C/O</th><th class="n">VAT NK</th></tr>`;
  let tq=0,tNo=0,tCO=0,tF=0;
  const body=R.map((r,i)=>{if(!r.incomplete){tq+=r.q;tNo+=r.landNo*r.q;tCO+=r.landCO*r.q;tF+=r.fobV*r.q}
    return `<tr><td>${i+1}</td><td class="mono">${esc(r.p.code)}</td><td>${esc(r.p.name)}</td><td class="mono">${fmtHS(r.hs)||'–'}</td><td>${esc((OMAP[r.p.origin]||{}).name||'')}</td><td class="n">${fmt(r.q)}</td><td class="n">${fmt(pnum(r.p.fob),2)}</td><td class="n">${fmt(r.fobV)}</td><td class="n">${fmt(r.frV)}</td><td class="n">${fmt(r.insV)}</td><td class="n">${fmt(r.dutyNo)}</td><td class="n">${fmt(r.dutyCO)}</td><td class="n">${fmt(r.tests)}</td><td class="n">${fmt(r.otherU)}</td><td class="n"><b>${fmt(r.landNo)}</b></td><td class="n"><b>${fmt(r.landCO)}</b></td><td class="n">${fmt(r.vat)}%</td></tr>`}).join('');
  const tot=`<tr class="tot"><td colspan="8">Tổng giá trị lô (landed × SL)</td><td class="n">${fmt(tF)}</td><td colspan="6"></td><td class="n">${fmt(tNo)}</td><td class="n">${fmt(tCO)}</td><td></td></tr>`;
  $('#sumTbl').innerHTML=`<thead>${head}</thead><tbody>${body}${tot}</tbody>`;
}

/* ---------------- Changes tab ---------------- */
function renderTimeline(){
  const today=new Date().toISOString().slice(0,10);const cd=S.date;
  const EV=[
   {d:'2016-11-04',t:'CV 10442/TCHQ-TXNK – phân loại máy làm mát không khí bằng bay hơi',x:'Trên 20 kg: nhóm 84.79, mã 8479.60.00 (MFN 0%). Không quá 20 kg: nhóm 85.09, mã 8509.80.90 (MFN 25%, ACFTA 5%; VAT 8% đến hết 2026 vì trong mã này chỉ máy hút ẩm bị loại khỏi giảm VAT). Áp dụng từ 04/11/2016; lô đã thông quan trước đó được giữ nguyên. Công văn dẫn TT 103/2015 (danh mục cũ); cả hai mã vẫn tồn tại trong danh mục TT 31/2022 hiện hành. Đây là công văn hướng dẫn, khi có văn bản mới thay thế cần kiểm tra lại.'},
   {d:'2024-07-01',t:'QĐ 1725/QĐ-BCT – danh mục kiểm tra hiệu suất năng lượng',x:'Thay Phụ lục III của QĐ 1182/QĐ-BCT. Quạt điện 8414.51 (≤125 W), nồi cơm điện, tủ lạnh, điều hòa, máy giặt… phải thử hiệu suất và dán nhãn. Quạt điều hòa 8479.60 và máy xay 8509.40 không có trong danh mục.'},
   {d:'2024-12-16',t:'NĐ 144/2024/NĐ-CP – biểu thuế NK ưu đãi (MFN)',x:'Phiên bản MFN đang dùng trong file biểu thuế.'},
   {d:'2025-07-01',t:'Bắt đầu giảm VAT 10% → 8%',x:'NQ 204/2025/QH15, NĐ 174/2025/NĐ-CP. Áp dụng đến hết 31/12/2026, trừ nhóm hàng loại trừ (vd lò vi sóng, máy hút bụi, tủ lạnh, máy giặt, điều hòa, máy hút ẩm).'},
   {d:'2026-01-01',t:'RCEP cắt giảm năm 2026',x:'Biểu RCEP (NĐ 129/2022) giảm theo năm vào 01/01. Với biểu C (Trung Quốc), '+cntRcep(2026)+' mã thay đổi so với 2025. Với hầu hết đồ gia dụng từ Trung Quốc, ACFTA vẫn thấp hơn.'},
   {d:'2026-07-01',t:'TT 36/2026/TT-BKHCN có hiệu lực (ký 30/06/2026)',x:'Danh mục hàng rủi ro cao (PL I) và trung bình (PL II) thay khái niệm "hàng hóa nhóm 2" (2711/QĐ-BKHCN) mà file biểu thuế vẫn ghi. Bãi bỏ TT 01/2009/TT-BKHCN, TT 29/2025/TT-BKHCN… Giấy chứng nhận/thông báo công bố hợp quy cấp trước 01/07/2026 còn giá trị đến hết hạn. Phương thức đánh giá theo TT 14/2026/TT-BKHCN.'},
   {d:'2026-12-31',t:'Hết hạn giảm VAT 2%',x:'Từ 01/01/2027 VAT quay lại 10% nếu Quốc hội không gia hạn. Tool tự chuyển sang 10% khi ngày thông quan sau mốc này. VAT được khấu trừ nên không đổi landed cost chưa VAT, nhưng tăng tiền phải nộp khi thông quan.'},
   {d:'2027-01-01',t:'RCEP cắt giảm năm 2027',x:'Năm cuối có trong file. Biểu C: '+cntRcep(2027)+' mã thay đổi so với 2026.'},
   {d:'2027-04-01',t:'QCVN 25:2025/BKHCN bắt đầu áp dụng',x:'Thiết bị đóng cắt (áptômát chống dòng rò) — ví dụ về quy chuẩn mới được TT 36 dẫn chiếu với ngày hiệu lực riêng.'},
   {d:'2027-12-31',t:'Hết giai đoạn các biểu thuế FTA 2022–2027',x:'ACFTA (NĐ 118/2022), ATIGA (NĐ 126/2022), RCEP (NĐ 129/2022)… ban hành cho giai đoạn 2022–2027. Dự kiến có nghị định mới cho giai đoạn sau; khi có, nạp file biểu thuế mới hoặc thêm điều chỉnh thủ công.'}];
  $('#timeline').innerHTML=EV.map(e=>{const st=e.d<=today?(e.d<=cd?'past':'past'):(e.d<=cd?'now':'soon');
    const lab=e.d<=today?'<span class="chip">đã hiệu lực</span>':(e.d<=cd?'<span class="chip bad">ảnh hưởng lô đang tính</span>':'<span class="chip warn">sắp tới</span>');
    return `<div class="ev ${st}"><div class="d">${e.d.split('-').reverse().join('/')} ${lab}</div><b>${esc(e.t)}</b><p class="small">${esc(e.x)}</p></div>`}).join('');
}
let _rc={};function cntRcep(y){if(_rc[y]!=null)return _rc[y];const d=DB.rcep.C||{};const yrs=DB.rcepYears||[2025,2026,2027];const i=yrs.indexOf(y);let n=0;if(i>0)for(const k in d){const v=d[k];if(Array.isArray(v)&&v[i]!==v[i-1])n++}return _rc[y]=fmt(n)}
function renderSrc(){
  const rows=[['Biểu thuế XNK',DBsrc==='builtin'?'File "Biểu thuế XNK 2025 cập nhật NĐ 174" — MFN NĐ 26/2023 & 144/2024; FTA giai đoạn 2022–2027':'File bạn nạp: '+esc(DBsrc),fmt(DB.rows.length)+' mã 8 số'],
   ['RCEP theo năm','Sheet RCEPT-A, B…F (NĐ 129/2022), dùng năm 2025–2027','Theo ngày thông quan'],
   ['Kiểm tra chất lượng','TT 36/2026/TT-BKHCN, hiệu lực 01/07/2026',fmt(Object.keys(DB.tt36||{}).length)+' mã/nhóm mã'],
   ['Hiệu suất năng lượng','QĐ 1725/QĐ-BCT ngày 01/07/2024',HSNL.length+' dòng'],
   ['Phân loại máy làm mát','CV 10442/TCHQ-TXNK ngày 04/11/2016','Ngưỡng 20 kg/máy'],
   ['VAT','Theo file + NQ 204/2025/QH15 (8% đến 31/12/2026)','Tự đổi 10% từ 2027'],
   ['Tỷ giá, cước, phí kiểm tra','Bạn nhập ở thông số chung','Cập nhật mỗi lô'],
   ['Điều chỉnh thủ công',OVR.length+' dòng','Ưu tiên cao nhất']];
  $('#srcTbl').innerHTML='<thead><tr><th>Dữ liệu</th><th>Nguồn</th><th>Ghi chú</th></tr></thead><tbody>'+rows.map(r=>`<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')+'</tbody>';
  $('#verChips').innerHTML=`<span class="chip">Phiên bản ${TOOL_VER}</span><span class="chip steel">Biểu thuế: ${DBsrc==='builtin'?'2025 (NĐ 174)':'file đã nạp'}</span><span class="chip steel">TT 36/2026</span><span class="chip steel">QĐ 1725/2024</span><span class="chip steel">CV 10442</span>${OVR.length?`<span class="chip warn">${OVR.length} điều chỉnh</span>`:''}`;
}
function renderSens(){
  const base=compute(P,S);
  const sc=[['Hiện tại',{}],['Tỷ giá +3%',{fx:1.03}],['Cước +30%',{fr:1.3}],['Thông quan 01/2027',{date:'2027-01-15'}]];
  const runs=sc.map(([n,o])=>compute(P,S,o));
  const alt={};P.forEach(p=>{const h=String(p.hs);if(h===CV10442.heavy)alt[p.id]=CV10442.light;else if(h===CV10442.light&&isAirCooler(p))alt[p.id]=CV10442.heavy});
  const altRun=Object.keys(alt).length?compute(P,S,{hs:alt}):null;
  const vat27=runs[3];
  let h='<thead><tr><th>Sản phẩm</th>'+sc.map(s=>`<th class="n">${s[0]}</th>`).join('')+'<th class="n">VAT nộp/sp<br>hiện tại → 2027</th>'+(altRun?'<th class="n">Nếu áp mã còn lại<br>theo CV 10442</th>':'')+'</tr></thead><tbody>';
  h+=base.map((r,i)=>{if(r.incomplete)return `<tr><td>${esc(r.p.code||r.p.name)}</td><td colspan="${sc.length+2}" class="muted">Chưa đủ dữ liệu</td></tr>`;
    const cells=runs.map((rr,j)=>{const v=rr[i].land;const d=v-r.land;return `<td class="n">${fmt(v)}${j?`<br><span class="small ${d>0.5?'up':d<-0.5?'down':'muted'}">${d>0.5?'+':''}${fmt(d)}</span>`:''}</td>`}).join('');
    const vatc=`<td class="n">${fmt(r.vatPay)} → ${fmt(vat27[i].vatPay)}</td>`;
    const ac=altRun?(alt[r.p.id]?(()=>{const d=altRun[i].land-r.land;return `<td class="n"><span class="mono small">${fmtHS(alt[r.p.id])}</span><br>${fmt(altRun[i].land)}<br><span class="small ${d>0?'up':'down'}">${d>0?'+':''}${fmt(d)}</span></td>`})():'<td></td>'):'';
    return `<tr><td><b>${esc(r.p.code)}</b><br><span class="small muted">${esc(r.p.name)}</span></td>${cells}${vatc}${ac}</tr>`}).join('');
  $('#sensTbl').innerHTML=h+'</tbody>';
}
/* overrides */
function renderOvr(){
  const opts=[['mfn','NK ưu đãi (MFN)'],['acfta','ACFTA'],['rcep','RCEP (theo xuất xứ)'],['atiga','ATIGA'],['akfta','AKFTA'],['vkfta','VKFTA'],['ajcep','AJCEP'],['vjepa','VJEPA'],['cptpp','CPTPP'],['evfta','EVFTA'],['ukvfta','UKVFTA'],['aifta','AIFTA'],['ahkfta','AHKFTA'],['aanzfta','AANZFTA'],['vat','VAT']];
  if(!$('#ov_field').options.length)$('#ov_field').innerHTML=opts.map(o=>`<option value="${o[0]}">${o[1]}</option>`).join('');
  $('#ovTbl').innerHTML='<thead><tr><th>Mã HS</th><th>Loại</th><th class="n">Thuế suất</th><th>Hiệu lực từ</th><th>Văn bản</th><th></th></tr></thead><tbody>'+(OVR.length?OVR.map((o,i)=>`<tr><td class="mono">${fmtHS(o.hs)}</td><td>${esc(o.field)}</td><td class="n">${fmt(o.v,1)}%</td><td>${(o.from||'').split('-').reverse().join('/')}</td><td>${esc(o.doc)}</td><td><button class="ghost" data-ovdel="${i}">Xoá</button></td></tr>`).join(''):'<tr><td colspan="6" class="muted">Chưa có điều chỉnh. Ví dụ: nghị định mới giảm MFN của 8414.51.99 xuống 20% từ 01/01/2027 → nhập mã, chọn MFN, 20, ngày 01/01/2027.</td></tr>')+'</tbody>';
}
function bindOvr(){
  $('#ov_add').onclick=()=>{const hs=$('#ov_hs').value.replace(/\D/g,'');const v=pnum($('#ov_val').value);
    if(hs.length!==8||!row(hs)){toast('Mã HS phải có 8 số và có trong biểu thuế.');return}
    if(isNaN(v)){toast('Nhập thuế suất mới, ví dụ 20.');return}
    OVR.push({hs,field:$('#ov_field').value,v,from:$('#ov_from').value||'',doc:$('#ov_doc').value||'Điều chỉnh thủ công'});LS.set('lc_ovr',OVR);renderOvr();renderSrc();recalc();toast('Đã thêm điều chỉnh')};
  $('#ovTbl').addEventListener('click',e=>{const b=e.target.closest('[data-ovdel]');if(!b)return;OVR.splice(+b.dataset.ovdel,1);LS.set('lc_ovr',OVR);renderOvr();renderSrc();recalc()});
}
/* load new tariff file */
function loadScript(src){return new Promise((res,rej)=>{if(window.XLSX)return res();const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Không tải được thư viện đọc Excel (cần mạng).'));document.head.appendChild(s)})}
async function parseTariffFile(file){
  const msg=$('#tfMsg');msg.textContent='Đang tải thư viện đọc Excel…';
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  msg.textContent='Đang đọc file (có thể mất vài chục giây)…';await new Promise(r=>setTimeout(r,50));
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:'array',cellStyles:false,cellHTML:false,sheets:['BT2025','RCEPT-A','B','C','D','E','F']});
  let main=wb.Sheets['BT2025'];if(!main){const n=wb.SheetNames.find(n=>/^BT\d{4}/.test(n));if(n){const wb2=XLSX.read(buf,{type:'array',sheets:[n]});main=wb2.Sheets[n]}}
  if(!main)throw new Error('Không thấy sheet biểu thuế chính (BT2025 hoặc BTxxxx).');
  const off=XLSX.utils.decode_range(main['!ref']).s.c;
  const A=XLSX.utils.sheet_to_json(main,{header:1,defval:'',raw:true});
  const C=x=>x-off;const COLS={nktt:10,mfn:13,vat:16,acfta:19,atiga:22,ajcep:25,vjepa:28,akfta:31,aanzfta:34,aifta:37,vkfta:40,vcfta:43,eaeu:46,cptpp:49,ahkfta:52,evfta:58,ukvfta:61,vnlao:64,vifta:67};
  const keys=Object.keys(COLS);const s=v=>v==null?'':String(v).trim();
  const pol=[],pi=new Map();const pidx=t=>{if(!pi.has(t)){pi.set(t,pol.length);pol.push(t)}return pi.get(t)};
  const rows=[];const heads={},headsEn={};let heading='',stack={};
  for(let i=10;i<A.length;i++){const r=A[i];const code=s(r[C(5)]).replace(/\./g,'');const desc=s(r[C(6)]);if(!desc)continue;
    const m=desc.match(/^((?:-\s*)*)/);const lvl=(m[1].match(/-/g)||[]).length;const text=desc.slice(m[0].length).trim();
    if(/^\d{4}$/.test(code)){heading=text;heads[code]=text;headsEn[code]=s(r[C(7)]);stack={};continue}
    const ns={};for(const k in stack)if(+k<lvl)ns[k]=stack[k];ns[lvl]=text;stack=ns;
    if(/^\d{8}$/.test(code)){const path=Object.keys(stack).map(Number).sort((a,b)=>a-b).filter(k=>k<lvl).map(k=>stack[k].replace(/:$/,''));
      rows.push([code,[heading.slice(0,90),...path,text].join(' › '),s(r[C(8)]),...keys.map(k=>s(r[C(COLS[k])])),pidx(s(r[C(96)])),pidx((s(r[C(97)])+' '+s(r[C(98)])).trim()),s(r[C(7)]).replace(/^[-\s]+/,'')])}}
  if(rows.length<1000)throw new Error('Đọc được quá ít mã ('+rows.length+'). File có thể khác định dạng.');
  const rcep={};let years=[2025,2026,2027];
  for(const sh of 'ABCDEF'){const ws=wb.Sheets[sh==='A'?'RCEPT-A':sh];if(!ws)continue;const o=XLSX.utils.decode_range(ws['!ref']).s.c;const R=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});
    const yr=R.find(r=>r.some(v=>/^20\d\d$/.test(String(v))));let yi=[];if(yr){yi=yr.map((v,i)=>/^20\d\d$/.test(String(v))?[+v,i]:null).filter(Boolean);years=yi.map(x=>x[0])}
    const d={};R.forEach(r=>{const c=s(r[1-o]).replace(/\./g,'');if(/^\d{8}$/.test(c)){const v=yi.map(x=>s(r[x[1]]).replace(',','.'));if(v.some(x=>x!==''))d[c]=new Set(v).size>1?v:v[0]}});rcep[sh]=d}
  return {cols:['code','desc','unit',...keys,'pol','vatnote','en'],heads,heads_en:headsEn,rows,pol,rcep:Object.keys(rcep).length?rcep:DB.rcep,rcepYears:Object.keys(rcep).length?years:DB.rcepYears,tt36:DB.tt36,_name:file.name+' ('+new Date().toLocaleDateString('vi-VN')+')'};
}
function bindTariff(){
  $('#tfFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;const msg=$('#tfMsg');
    try{const d=await parseTariffFile(f);DB=indexDB(d);DBsrc=d._name;_rc={};const ok=await idb.set('tariff',d);
      msg.textContent=`Đã nạp ${fmt(d.rows.length)} mã từ ${f.name}.`+(ok?' Đã lưu trên máy này.':' Không lưu được trên trình duyệt này — dữ liệu chỉ dùng trong phiên hiện tại.');renderSrc();recalc()}
    catch(err){msg.textContent='Lỗi: '+err.message}});
  $('#tfReset').onclick=async()=>{await idb.del('tariff');DB=indexDB(await decodeBuiltin());DBsrc='builtin';_rc={};renderSrc();recalc();$('#tfMsg').textContent='Đã quay lại dữ liệu gốc.'};
}

/* ---------------- Lookup tab ---------------- */
function bindLookup(){
  $('#lkOrigin').innerHTML=originOpts('CN');$('#lkYear').innerHTML=[2025,2026,2027].map(y=>`<option${y===new Date().getFullYear()?' selected':''}>${y}</option>`).join('');
  let cur=null;
  let kwSel=null;
  const POP=['Quạt điều hòa / máy làm mát không khí – trên 20 kg','Quạt điều hòa / máy làm mát không khí – từ 20 kg trở xuống','Quạt đứng, quạt cây, quạt sàn (≤125 W)','Máy làm sữa hạt','Nồi chiên không dầu','Máy xay sinh tố, máy xay thịt, máy đánh trứng','Nồi cơm điện','Ấm siêu tốc, ấm đun nước','Máy lọc không khí','Máy hút bụi'];
  const chips=()=>{$('#lkChips').innerHTML='<span class="small muted" style="align-self:center">Từ khoá hay dùng:</span>'+KW.filter(k=>POP.includes(k.label)).map(k=>`<button type="button" class="chip kw" data-kw="${esc(k.label)}" aria-pressed="${kwSel===k}">${esc(k.label)}</button>`).join('')};
  const resItem=(c,hint)=>{const r=row(c);const m=parseRate(fld(r,'mfn'));const a=parseRate(fld(r,'acfta'));return `<button data-c="${c}" aria-current="${c===cur}"><b class="mono">${fmtHS(c)}</b> <span class="muted small">MFN ${m?m.v:'–'}% · ACFTA ${a?a.v:'–'}%</span>${hint?`<br><span class="small" style="color:var(--steel);font-weight:600">${esc(hint)}</span>`:''}<br><span class="small">${esc(shortDesc(c))}</span></button>`};
  const run=()=>{const q=$('#lkQ').value.trim();let html='';
    if(kwSel){html+=`<div class="small muted" style="padding:8px 12px;background:var(--soft)">Mã theo từ khoá <b>${esc(kwSel.label)}</b></div>`+kwSel.codes.filter(row).map(c=>resItem(c,kwSel.note)).join('')}
    const list=q&&!kwSel?hsSuggest('',q):[];
    if(list.length){const P=/^[\d.\s]+$/.test(q)?null:parseQuery(q);const exp=P?P.filter(c=>c.w>=1&&c.alts.length>1).map(c=>`<b>${esc(c.k)}</b> → ${esc(c.alts.slice(1,4).join(' / '))}`).join(' · '):'';
      const approx=list.some(x=>x.approx);
      html+=`<div class="small muted" style="padding:8px 12px;background:var(--soft)">${approx?'Không khớp đủ mọi từ — đây là kết quả gần đúng nhất cho':'Kết quả cho'} “${esc(q)}”${exp?'<br>Tìm cả từ tương đương: '+exp:''}</div>`+list.slice(0,50).map(x=>resItem(x.c,x.hint)).join('')}
    if(!q&&!kwSel)html=['84796000','85098090','84145199','85094000','85166090','85167910'].map(c=>resItem(c)).join('');
    $('#lkRes').innerHTML=html||'<p class="muted small" style="padding:10px">Không thấy mã phù hợp. Thử từ khoá ngắn hơn (vd "quạt", "nồi", "máy ép") hoặc chọn một từ khoá gợi ý.</p>';chips()};
  const sug=()=>{const q=$('#lkQ').value.trim();const box=$('#lkSug');if(!q||/^[\d.\s]+$/.test(q)){box.hidden=true;return}
    const ks=kwMatch(q,true).slice(0,10);
    if(!ks.length){box.innerHTML='<div class="small muted" style="padding:8px 10px">Không có từ khoá gợi ý — kết quả tìm theo mô tả biểu thuế đang hiện bên dưới.</div>';box.hidden=false;return}
    box.innerHTML=ks.map(k=>`<button type="button" data-kw="${esc(k.label)}"><strong>${esc(k.label)}</strong> <span class="muted">→ ${k.codes.map(fmtHS).join(', ')}</span>${k.note?'<br><span class="small muted">'+esc(k.note)+'</span>':''}</button>`).join('');box.hidden=false};
  const pick=label=>{kwSel=KW.find(k=>k.label===label)||null;if(kwSel){$('#lkQ').value=kwSel.label;$('#lkSug').hidden=true;run();const c=kwSel.codes.find(row);if(c)show(c)}};
  const show=c=>{cur=c;const o=$('#lkOrigin').value;const y=$('#lkYear').value;const R=rates(c,o,y+'-06-30');const r=row(c);
    const allF=Object.keys(FTA_LABEL).filter(k=>k!=='rcep').map(k=>[FTA_LABEL[k],fld(r,k)]);
    const rc='ABCDEF'.split('').map(sh=>{const p=rcepRate(c,sh,+y);return ['RCEP '+sh,p?p.v:'–']});
    const tt=tt36For(c);const hn=hsnlFor(c);
    $('#lkDetail').innerHTML=`<h2 class="mono">${fmtHS(c)}</h2><p class="small" style="margin:6px 0 12px">${esc(r[1])} <span class="muted">(${esc(r[2])})</span></p>
      <div class="kv"><div><div class="k">NK ưu đãi</div><div class="v">${esc(fld(r,'mfn'))}%</div></div><div><div class="k">NK thông thường</div><div class="v">${esc(fld(r,'nktt'))}%</div></div><div><div class="k">VAT (${y})</div><div class="v">${R.vatSplit?(y>2026?'10%':'8% / 10%'):R.vat+'%'}</div></div><div><div class="k">Tốt nhất cho ${esc(OMAP[o].name)}</div><div class="v">${R.pref?R.pref.v+'%':'–'}</div></div></div>
      <p class="small muted" style="margin:6px 0 0">${R.pref?esc(R.pref.label):'Không có FTA áp dụng'}${R.vatNote?' · '+esc(R.vatNote):''}${R.vatSplit?' · VAT: máy hút ẩm 10% (không được giảm); hàng khác trong mã này, vd máy làm mát ≤20 kg, được 8% đến hết 2026':''}</p>
      <h3 style="margin-top:14px">Các biểu FTA</h3><div class="kv" style="margin-top:6px">${allF.concat(rc).map(x=>`<div><div class="k">${esc(x[0])}</div><div class="v small">${esc(x[1]||'–')}</div></div>`).join('')}</div>
      ${(c===CV10442.heavy||c===CV10442.light)?`<div class="w warn" style="margin-top:12px"><b>CV 10442/TCHQ-TXNK (04/11/2016):</b> máy làm mát không khí bằng bay hơi trên 20 kg → 8479.60.00; không quá 20 kg → 8509.80.90.</div>`:''}<h3 style="margin-top:14px">TT 36/2026 – quản lý chất lượng</h3>${tt.length?tt.map(e=>`<div class="w ${e.a==='I'?'warn':'info'}" style="margin-top:6px"><b>PL ${e.a} ${e.a==='I'?'(rủi ro cao)':'(rủi ro trung bình)'}</b> · ${esc(e.q.join(', ')||'')} · ${esc(e.n)}<br><span class="small">${esc(e.r)}</span> <span class="muted small">(trang ${e.p})</span></div>`).join(''):'<p class="small muted">Không có trong danh mục.</p>'}
      <h3 style="margin-top:14px">QĐ 1725 – hiệu suất năng lượng</h3>${hn.length?hn.map(h=>`<div class="w info" style="margin-top:6px"><b>${esc(h[1])}</b> · ${esc(h[2])}${h[3]?' · '+esc(h[3]):''}</div>`).join(''):'<p class="small muted">Không có trong danh mục.</p>'}
      <h3 style="margin-top:14px">Chính sách mặt hàng (theo file biểu thuế)</h3><p class="small">${esc(DB.pol[r[DB.ci.pol]]||'–')}</p><p class="small muted">${esc(R.vnote)}</p>`;
    run()};
  let t;$('#lkQ').addEventListener('input',()=>{kwSel=null;sug();clearTimeout(t);t=setTimeout(()=>{run();const b=$('#lkRes button[data-c]');if(b&&$('#lkQ').value.trim())show(b.dataset.c)},250)});
  $('#lkQ').addEventListener('focus',sug);
  $('#lkQ').addEventListener('keydown',e=>{if(e.key==='Enter'){const b=$('#lkSug button[data-kw]');if(b&&!$('#lkSug').hidden)pick(b.dataset.kw)}if(e.key==='Escape')$('#lkSug').hidden=true});
  $('#lkQ').addEventListener('blur',()=>setTimeout(()=>{if(!$('#lkSug').contains(document.activeElement))$('#lkSug').hidden=true},150));
  $('#lkSug').addEventListener('click',e=>{const b=e.target.closest('[data-kw]');if(b)pick(b.dataset.kw)});
  $('#lkChips').addEventListener('click',e=>{const b=e.target.closest('[data-kw]');if(b)pick(b.dataset.kw)});
  $('#lkRes').addEventListener('click',e=>{const b=e.target.closest('[data-c]');if(b)show(b.dataset.c)});
  ['#lkOrigin','#lkYear'].forEach(s=>$(s).addEventListener('change',()=>cur&&show(cur)));
  chips();run();show('84796000');
}

/* ---------------- Excel export ---------------- */
function colL(n){let s='';while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s}
async function exportXlsx(){
  if(!window.ExcelJS){toast('Chưa tải được thư viện Excel — kiểm tra kết nối mạng rồi thử lại.');return}
  const R=compute(P,S).filter(r=>!r.incomplete);
  if(!R.length){toast('Chưa có sản phẩm đủ dữ liệu (FOB, MOQ) để xuất.');return}
  const wb=new ExcelJS.Workbook();
  const NAVY='FF1F4E78',GREEN='FFE2EFDA',YEL='FFFFFF00',NUM='#,##0;\\(#,##0\\);\\-';
  const thin={style:'thin',color:{argb:'FFBFBFBF'}},BORDER={top:thin,left:thin,bottom:thin,right:thin};
  const ws=wb.addWorksheet('PA gia',{views:[{state:'frozen',ySplit:4}],pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
  const uniq=a=>[...new Set(a.map(x=>String(x||'').trim()).filter(Boolean))];
  /* Thuế NK: nếu mọi dòng cùng thuế suất + cùng loại C/O thì ghi vào tiêu đề như mẫu, ngược lại ghi ở cột Ghi chú */
  const pct=v=>fmt(v,(v||0)%1?1:0);
  const dutyKey=r=>pct(r.dutyRate)+'|'+(r.useCO&&r.R&&r.R.pref&&!r.R.pref.noGain?r.R.pref.label:'MFN');
  const sameDuty=uniq(R.map(dutyKey)).length===1;
  const coTxt=r=>{const pr=r.useCO&&r.R&&r.R.pref&&!r.R.pref.noGain?r.R.pref.label:null;return pr?'C/O '+pr.replace('ACFTA (Form E)','Form E'):'không C/O'};
  const dutyHead=sameDuty?`Thuế NK ${pct(R[0].dutyRate)}% (${coTxt(R[0])}) / chiếc`:'Thuế NK / chiếc';
  const names=uniq(R.map(r=>r.p.name));
  ws.mergeCells('A1:M1');ws.getCell('A1').value='PHƯƠNG ÁN GIÁ NHẬP KHẨU – '+(names.length<=2?names.join(' / '):names.length+' mã sản phẩm').toUpperCase();
  ws.getCell('A1').font={bold:true,size:14};
  const facs=uniq(R.map(r=>r.p.factory)),pols=uniq(R.map(r=>r.p.pol));
  const packs=uniq(R.map(r=>fmt(pnum(r.p.moq))+' chiếc/'+(r.p.cont==='20'?"20'":"40'")));
  const line2=[facs.length?'Nhà cung cấp: '+facs.join(', '):'',pols.length?'FOB '+pols.join(', '):'',packs.length===1?'Đóng '+packs[0]:'',
    'Tỷ giá '+fmt(S.rate),'Dự kiến thông quan '+S.date.split('-').reverse().join('/')].filter(Boolean).join(' · ');
  ws.mergeCells('A2:M2');ws.getCell('A2').value=line2;ws.getCell('A2').font={italic:true,size:10};
  const H=['STT','Hình ảnh','Model','Thông số kỹ thuật','Mã HS','SL (chiếc)','FOB (USD/chiếc)','Giá FOB quy đổi (VND/chiếc)','Chi phí khai thác hàng hóa / chiếc',dutyHead,'GIÁ VỐN KHÔNG VAT','GIÁ VỐN CÓ VAT','Ghi chú'];
  const W=[5,20,13,58,11,9,10,14,15,14,15,14,34];W.forEach((w,i)=>ws.getColumn(i+1).width=w);
  const hr=ws.getRow(4);hr.values=H;hr.height=42;
  hr.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};c.alignment={wrapText:true,vertical:'middle',horizontal:'center'};c.border=BORDER});
  const bullets=r=>{const out=[];const name=String(r.p.name||'').trim();if(name)out.push('• Sản phẩm: '+name);
    String(r.p.tech||'').split(/\n|;|,(?![^(]*\))/).map(x=>x.trim()).filter(Boolean).forEach(x=>out.push('• '+x.charAt(0).toUpperCase()+x.slice(1)));
    const cr=classRule(r.p),v=pnum(r.p.spec);if(cr&&v>0&&!/suc chua|cong suat|dung tich/.test(norm(r.p.tech)))out.push('• '+cr.desc(v).charAt(0).toUpperCase()+cr.desc(v).slice(1));
    const w=pnum(r.p.weight);if(w>0)out.push('• Trọng lượng: '+fmt(w,w%1?1:0)+' kg/chiếc');
    out.push('• Đóng cont: '+fmt(pnum(r.p.moq))+' chiếc/'+(r.p.cont==='20'?"20'":"40'"));
    return out.join('\n')};
  const note=r=>{const t=[];const c=r.checks;const tests=[c.q04&&'QCVN 4',c.q09&&'QCVN 9',c.hsnl&&'hiệu suất năng lượng',c.attp&&'ATTP'].filter(Boolean);
    if(tests.length)t.push('Cần test '+tests.join(', '));
    if(!sameDuty)t.push('Thuế NK '+pct(r.dutyRate)+'% ('+coTxt(r)+')');
    if(r.p.hsAuto)t.push('Mã HS do tool gợi ý, cần kiểm tra');
    const cr=classRule(r.p),sc=specCode(r.p);if(sc&&sc!==r.hs)t.push('Mã HS chưa khớp '+cr.param.toLowerCase()+' → nên là '+fmtHS(sc));
    if(isAirCooler(r.p)&&cvCode(r.p)&&cvCode(r.p)!==r.hs)t.push('Mã HS chưa khớp trọng lượng (CV 10442) → nên là '+fmtHS(cvCode(r.p)));
    return t.join('. ')};
  const rd=x=>Math.round(x||0);
  R.forEach((r,i)=>{const n=5+i;const p=r.p;const frCIF=r.frV*(S.frPct/100);const other=r.frV+r.insV+r.tests+r.otherU;
    const vals=[i+1,'',String(p.code||'')+(classRule(p)&&pnum(p.spec)>0?'\n'+pct(pnum(p.spec))+' '+classRule(p).unit.split(' ')[0]:''),bullets(r),fmtHS(r.hs),r.q,pnum(p.fob)||0,
      {formula:`G${n}*${S.rate}`,result:r.fobV},
      {formula:[rd(r.frV),rd(r.insV),rd(r.tests),rd(r.otherU)].filter(x=>x).join('+')||'0',result:other},
      {formula:`(H${n}+${rd(frCIF)}+${rd(r.insV)})*${fmt(r.dutyRate,1).replace(',','.')}%`,result:r.duty},
      {formula:`H${n}+I${n}+J${n}`,result:r.land},
      {formula:`K${n}*(1+${r.vat||0}%)`,result:r.land*(1+(r.vat||0)/100)},
      note(r)];
    const row=ws.getRow(n);row.values=vals;row.height=p.img||vals[3].split('\n').length>8?199.5:Math.max(60,15*vals[3].split('\n').length+10);
    row.eachCell({includeEmpty:true},(c,col)=>{if(col>13)return;c.border=BORDER;c.alignment={vertical:'middle',wrapText:true,horizontal:[1,3,5].includes(col)?'center':col===4||col===13?'left':undefined}});
    ws.getCell('C'+n).font={bold:true};
    ['H','I','J','K','L'].forEach(k=>ws.getCell(k+n).numFmt=NUM);ws.getCell('F'+n).numFmt='#,##0';ws.getCell('G'+n).numFmt='#,##0.00';
    ['F','G'].forEach(k=>ws.getCell(k+n).fill={type:'pattern',pattern:'solid',fgColor:{argb:YEL}});
    ['K','L'].forEach(k=>{ws.getCell(k+n).font={bold:true};ws.getCell(k+n).fill={type:'pattern',pattern:'solid',fgColor:{argb:GREEN}}});
    if(p.img){const id=wb.addImage({base64:p.img,extension:'jpeg'});const h=row.height*96/72;const sz=Math.min(140,h-12);ws.addImage(id,{tl:{col:1.05,row:n-1+0.04},ext:{width:sz,height:sz}})}
  });
  /* Sheet ẩn: đủ dữ liệu để "Nhập từ Excel" lại đúng như lúc xuất */
  const hd=wb.addWorksheet('Du lieu nhap lai',{state:'hidden'});
  const IC=IMP_COLS.filter(c=>c[0]!=='img');hd.addRow(IC.map(c=>c[1]));
  R.forEach(r=>{const p=r.p;hd.addRow(IC.map(c=>{const k=c[0];if(k==='hs')return r.hs;if(k==='origin')return (OMAP[p.origin]||{}).name||'';if(k==='co')return p.co==='no'?'Không':'Có';if(k==='desc')return p.descManual?p.desc:'';
    if(['fob','moq','weight','spec','qty','annual'].includes(k)){const v=pnum(p[k]);return isNaN(v)?'':v}return p[k]||''}))});
  const buf=await wb.xlsx.writeBuffer();
  const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const nm=(names.length===1?names[0]:'nhieu-ma').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`PA-gia_${nm}_${new Date().toISOString().slice(0,10)}.xlsx`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);
  $('#xlsMsg').textContent='Đã tạo file '+a.download;
}

/* ---------------- Nhập từ Excel ---------------- */
const IMP_COLS=[
 ['img','Hình ảnh','Chèn ảnh nổi vào ô (Insert › Pictures › Place over cells)',14],
 ['code','Mã SP *','Bắt buộc',14],['name','Tên sản phẩm *','Bắt buộc',30],['tech','Thông số kỹ thuật','vd 220V/50Hz, 180W, bình nước 40L — đưa vào mô tả hàng hoá',34],['fob','Giá FOB (USD) *','Bắt buộc, số',12],['moq','MOQ (sp đầy 1 cont) *','Bắt buộc, số',12],
 ['cont','Loại cont (40/20)','Trống = 40',10],['origin','Xuất xứ','Chọn trong danh sách; trống = Trung Quốc',16],['factory','Tên nhà máy','Tên nhà máy / nhà cung cấp',26],['faddr','Địa chỉ nhà máy','',36],['pol','Cảng đi','Chọn gợi ý hoặc gõ tên cảng khác',16],['co','C/O ưu đãi (Có/Không)','Trống = Có',12],
 ['hs','Mã HS (8 số)','Trống = tool tự gợi ý theo tên',13],['weight','Trọng lượng (kg/chiếc)','Bắt buộc với quạt điều hòa',12],['spec','Thông số phân loại','Máy giặt/sấy: kg vải khô/lần · Quạt: W · Điều hòa: kW lạnh · Tủ lạnh: lít',14],
 ['qty','SL nhập lô này','Trống = MOQ',11],['group','Nhóm ghép cont','Cùng chữ = đi chung cont',11],['annual','SL nhập dự kiến/năm','Trống = SL lô',12],['desc','Mô tả hàng hoá','Trống = tool tự tạo',40]];
const HDR_RULES=[[/^(ma )?hs\b|hs code/,'hs'],[/hinh|^anh|image|photo/,'img'],[/dia chi|address/,'faddr'],[/nha may|factory|supplier|nha cung cap|^ncc/,'factory'],[/^cang|port of loading|^pol\b|loading port/,'pol'],[/ky thuat|specification|technical/,'tech'],[/^ma (sp|san pham|hang)|sku|model|^code|^ma$/,'code'],[/^ten|product|^name/,'name'],
 [/fob|don gia|unit price|^price/,'fob'],[/moq|day 1 cont/,'moq'],[/loai cont|container|^cont/,'cont'],[/xuat xu|origin/,'origin'],[/^c\/?o\b|uu dai/,'co'],
 [/trong luong|weight/,'weight'],[/thong so|suc chua|cong suat|dung tich|spec/,'spec'],[/du kien|\/nam|annual/,'annual'],[/^sl|so luong|qty/,'qty'],[/ghep|group/,'group'],[/^mo ta|description/,'desc']];
const ORG_ALIAS={CN:['tq','china','trung quoc','trung'],TH:['thai','thailand'],MY:['malay','malaysia'],ID:['indo','indonesia'],SG:['singapore'],PH:['phil'],KH:['campuchia','cambodia'],LA:['lao','laos'],MM:['myanmar'],BN:['brunei'],
 KR:['han','han quoc','korea'],JP:['nhat','japan'],TW:['dai loan','taiwan'],HK:['hong kong','hk'],IN:['an do','india'],AU:['uc','australia'],NZ:['new zealand','nz'],
 EU:['eu','duc','y','phap','germany','italy','france','spain','tay ban nha','ha lan'],UK:['anh','uk','england'],US:['my','usa','us','hoa ky'],CA:['canada'],MX:['mexico'],CL:['chile'],PE:['peru'],RU:['nga','russia'],IL:['israel']};
function cellText(v){if(v==null)return '';if(typeof v==='object'){if(v instanceof Date)return v.toISOString().slice(0,10);if('result' in v)return cellText(v.result);if(v.richText)return v.richText.map(x=>x.text).join('');if('text' in v)return String(v.text);if(v.hyperlink)return String(v.hyperlink);return ''}return String(v).trim()}
function matchOrigin(s){const n=norm(s).replace(/[^a-z ]/g,' ').trim();if(!n)return {id:'CN',def:true};
  for(const o of ORIGINS){if(n===norm(o.name)||n===o.id.toLowerCase())return {id:o.id}}
  for(const [id,al] of Object.entries(ORG_ALIAS)){if(al.some(a=>n===a||n.startsWith(a+' ')))return {id}}
  for(const o of ORIGINS){if(norm(o.name).startsWith(n)||n.startsWith(norm(o.name)))return {id:o.id}}
  return {id:'XX',unknown:true}}
function parseCo(s){const n=norm(s).trim();if(!n)return 'yes';if(/^(khong|no|0|false|ko|k)\b/.test(n))return 'no';return 'yes'}
function parseCont(s){const n=String(s||'').replace(/\D/g,'');return n.startsWith('2')?'20':'40'}
function numStr(s){const v=pnum(s);return isNaN(v)?'':String(v)}
/* đọc zip (.xlsx) để lấy ảnh nổi theo dòng */
async function unzipIndex(buf){const u=new Uint8Array(buf),dv=new DataView(buf);let e=-1;for(let i=u.length-22;i>=Math.max(0,u.length-70000);i--){if(dv.getUint32(i,true)===0x06054b50){e=i;break}}
  if(e<0)throw new Error('File không phải định dạng .xlsx');const n=dv.getUint16(e+10,true);let o=dv.getUint32(e+16,true);const ents={};const td=new TextDecoder();
  for(let k=0;k<n;k++){if(dv.getUint32(o,true)!==0x02014b50)break;const m=dv.getUint16(o+10,true),cs=dv.getUint32(o+20,true),nl=dv.getUint16(o+28,true),xl=dv.getUint16(o+30,true),cl=dv.getUint16(o+32,true),lo=dv.getUint32(o+42,true);
    ents[td.decode(u.subarray(o+46,o+46+nl))]={m,cs,lo};o+=46+nl+xl+cl}
  const get=async name=>{const en=ents[name];if(!en)return null;const nl=dv.getUint16(en.lo+26,true),xl=dv.getUint16(en.lo+28,true);const st=en.lo+30+nl+xl;const raw=u.slice(st,st+en.cs);
    if(en.m===0)return raw;const s=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return new Uint8Array(await new Response(s).arrayBuffer())};
  return {get,names:Object.keys(ents)}}
function resolvePath(base,target){if(target.startsWith('/'))return target.slice(1);const parts=base.split('/');parts.pop();for(const seg of target.split('/')){if(seg==='..')parts.pop();else if(seg!=='.')parts.push(seg)}return parts.join('/')}
async function sheetImages(buf,sheetName){
  const out={};try{
  const z=await unzipIndex(buf);const td=new TextDecoder();const xml=async n=>{const b=await z.get(n);return b?new DOMParser().parseFromString(td.decode(b),'application/xml'):null};
  const T=(d,tag)=>Array.from(d.getElementsByTagNameNS('*',tag));const RID='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const wbx=await xml('xl/workbook.xml');const rels=await xml('xl/_rels/workbook.xml.rels');if(!wbx||!rels)return out;
  const sh=T(wbx,'sheet').find(s=>s.getAttribute('name')===sheetName)||T(wbx,'sheet')[0];const rid=sh.getAttributeNS(RID,'id')||sh.getAttribute('r:id');
  const rel=T(rels,'Relationship').find(r=>r.getAttribute('Id')===rid);if(!rel)return out;const sp=resolvePath('xl/workbook.xml',rel.getAttribute('Target'));
  const srels=await xml(sp.replace(/([^/]+)$/,'_rels/$1.rels'));if(!srels)return out;
  for(const dr of T(srels,'Relationship').filter(r=>/\/drawing$/.test(r.getAttribute('Type')))){
    const dp=resolvePath(sp,dr.getAttribute('Target'));const d=await xml(dp);const drels=await xml(dp.replace(/([^/]+)$/,'_rels/$1.rels'));if(!d||!drels)continue;
    const map={};T(drels,'Relationship').forEach(r=>map[r.getAttribute('Id')]=resolvePath(dp,r.getAttribute('Target')));
    for(const a of [...T(d,'twoCellAnchor'),...T(d,'oneCellAnchor'),...T(d,'absoluteAnchor')]){
      const from=T(a,'from')[0];if(!from)continue;const rowEl=T(from,'row')[0];const row=parseInt(rowEl&&rowEl.textContent)+1;
      const blip=T(a,'blip')[0];if(!blip)continue;const emb=blip.getAttributeNS(RID,'embed')||blip.getAttribute('r:embed');const mp=map[emb];if(!mp||out[row])continue;
      const data=await z.get(mp);if(data)out[row]={data,ext:(mp.split('.').pop()||'png').toLowerCase()}}
  }}catch(e){console.warn('img',e)}
  return out}
let IMP=null;
async function readImport(file){
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{type:'array',cellDates:true});
  let best=null;
  wb.SheetNames.forEach(sn=>{const A=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:true,blankrows:true});const off=XLSX.utils.decode_range(wb.Sheets[sn]['!ref']||'A1').s;
    for(let r=0;r<Math.min(15,A.length);r++){const map={};(A[r]||[]).forEach((v,col)=>{const h=norm(cellText(v)).replace(/\([^)]*\)/g,'').replace(/[*]/g,'').replace(/\s+/g,' ').trim();if(!h)return;for(const [re,f] of HDR_RULES){if(re.test(h)){if(!(f in map))map[f]=col;break}}});
      const n=Object.keys(map).length;if((map.code!=null||map.name!=null)&&n>=3&&(!best||n>best.n))best={sn,A,r,map,n,off}}});
  if(!best)throw new Error('Không tìm thấy dòng tiêu đề (cần có cột Mã SP hoặc Tên sản phẩm, Giá FOB, MOQ…). Hãy dùng file mẫu của tool.');
  const {sn,A,r:hr,map,off}=best;
  let imgs=await sheetImages(buf,sn);
  if(!Object.keys(imgs).length&&sn==='Du lieu nhap lai'&&wb.SheetNames.includes('PA gia')){const pi=await sheetImages(buf,'PA gia');imgs={};for(const k in pi)imgs[+k-3]=pi[k]}
  const out=[];
  for(let r=hr+1;r<A.length;r++){const rw=A[r]||[];const g=f=>map[f]!=null?cellText(rw[map[f]]):'';const excelRow=r+off.r+1;
    const code=g('code'),name=g('name');if(!code&&!name)continue;
    const o=matchOrigin(g('origin'));const hsRaw=g('hs').replace(/\D/g,'');
    const p={code,name,tech:g('tech'),factory:g('factory'),faddr:g('faddr'),pol:g('pol'),fob:numStr(g('fob')),moq:numStr(g('moq')),cont:parseCont(g('cont')),origin:o.id,co:parseCo(g('co')),hs:'',weight:numStr(g('weight')),spec:numStr(g('spec')),qty:numStr(g('qty')),group:g('group'),annual:numStr(g('annual')),img:'',man:{}};
    const d=g('desc');if(d){p.desc=d;p.descManual=true}
    const msgs=[];
    if(hsRaw.length===8&&row(hsRaw))p.hs=hsRaw;
    else{const sug=hsSuggestP(p,'');if(sug.length){p.hs=sug[0].c;p.hsAuto=true;msgs.push(['warn',(hsRaw?'Mã HS "'+hsRaw+'" không có trong biểu thuế, ':'')+'tool gợi ý '+fmtHS(p.hs)])}else msgs.push(['bad',hsRaw?'Mã HS "'+hsRaw+'" không hợp lệ':'Chưa có mã HS, tool không đoán được'])}
    if(!(pnum(p.fob)>0))msgs.push(['bad','Thiếu giá FOB']);if(!(pnum(p.moq)>0))msgs.push(['bad','Thiếu MOQ']);
    if(o.unknown)msgs.push(['warn','Không nhận ra xuất xứ "'+g('origin')+'" → tính như nước có MFN']);
    if(isAirCooler(p)&&!(pnum(p.weight)>0))msgs.push(['warn','Quạt điều hòa chưa có trọng lượng']);
    {const cr=classRule(p),sc=specCode(p);if(cr&&!(pnum(p.spec)>0))msgs.push(['warn',cr.label+' chưa có '+cr.param.toLowerCase()+' ('+cr.unit+')']);else if(sc&&sc!==p.hs){if(p.hsAuto)p.hs=sc;else msgs.push(['warn','Mã HS chưa khớp '+cr.param.toLowerCase()+' '+p.spec+' '+cr.unit+' → nên là '+fmtHS(sc)])}}
    if(isAirCooler(p)&&p.hs&&cvCode(p)&&cvCode(p)!==p.hs){if(p.hsAuto){p.hs=cvCode(p)}else msgs.push(['warn','Mã HS chưa khớp trọng lượng theo CV 10442'])}
    out.push({p,msgs,img:imgs[excelRow]||null,row:excelRow});
  }
  if(!out.length)throw new Error('File không có dòng sản phẩm nào dưới dòng tiêu đề.');
  for(const it of out){if(it.img){try{const blob=new Blob([it.img.data],{type:'image/'+(it.img.ext==='jpg'?'jpeg':it.img.ext)});it.p.img=await resizeImage(blob)}catch(e){it.msgs.push(['warn','Không đọc được ảnh (định dạng '+it.img.ext+')'])}}}
  return {items:out,sheet:sn,file:file.name};
}
function renderImport(){
  const box=$('#impPanel');if(!IMP){box.hidden=true;return}
  const it=IMP.items;const bad=it.filter(x=>x.msgs.some(m=>m[0]==='bad')).length;const nimg=it.filter(x=>x.p.img).length;const auto=it.filter(x=>x.p.hsAuto).length;
  box.innerHTML=`<div class="sechead" style="margin-top:0"><h3>Xem trước: ${esc(IMP.file)}</h3><span class="small muted">Sheet "${esc(IMP.sheet)}"</span></div>
   <p class="small" style="margin:0 0 10px">Đọc được <b>${it.length}</b> sản phẩm · ${nimg} có ảnh · ${auto} mã HS do tool gợi ý · <span style="color:var(--bad)">${bad} dòng thiếu dữ liệu</span> (vẫn nhập được, sửa sau trên thẻ).</p>
   <div class="tblwrap" style="max-height:340px;overflow:auto"><table><thead><tr><th>Dòng</th><th>Ảnh</th><th>Mã SP</th><th>Tên</th><th class="n">FOB</th><th class="n">MOQ</th><th>Cont</th><th>Xuất xứ</th><th>C/O</th><th>Mã HS</th><th>Ghi chú</th></tr></thead><tbody>
   ${it.map(x=>`<tr><td>${x.row}</td><td>${x.p.img?`<img alt="" src="${x.p.img}" style="width:36px;height:36px;object-fit:contain">`:''}</td><td class="mono">${esc(x.p.code)}</td><td>${esc(x.p.name)}</td><td class="n">${fmt(pnum(x.p.fob),2)}</td><td class="n">${fmt(pnum(x.p.moq))}</td><td>${x.p.cont}'</td><td>${esc(OMAP[x.p.origin].name)}</td><td>${x.p.co==='no'?'Không':'Có'}</td><td class="mono">${fmtHS(x.p.hs)||'–'}</td><td class="small">${x.msgs.map(m=>`<span style="color:var(--${m[0]==='bad'?'bad':'warn'})">${esc(m[1])}</span>`).join('<br>')}</td></tr>`).join('')}
   </tbody></table></div>
   <div class="actions"><button class="primary" data-imp="append">Thêm ${it.length} sản phẩm vào danh sách</button><button data-imp="replace">Thay toàn bộ danh sách hiện tại</button><button class="ghost" data-imp="cancel">Huỷ</button></div>`;
  box.hidden=false;box.scrollIntoView({block:'nearest'});
}
function applyImport(mode){
  if(!IMP)return;const n=IMP.items.length;
  const items=IMP.items.map(x=>Object.assign({id:nextId++,qty:'',group:'',annual:''},x.p));
  if(mode==='replace')P=items;else{P=P.filter(p=>!p.sample).concat(items)}
  IMP=null;renderImport();save();renderCards();toast('Đã nhập '+n+' sản phẩm');
}
async function buildTemplate(){
  if(!window.ExcelJS){toast('Chưa tải được thư viện Excel — kiểm tra kết nối mạng.');return null}
  const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet('Sản phẩm',{views:[{state:'frozen',xSplit:3,ySplit:3}]});
  const N=IMP_COLS.length,last=colL(N);
  ws.mergeCells(`A1:${last}1`);ws.getCell('A1').value='DANH SÁCH SẢN PHẨM NHẬP KHẨU – mẫu import vào tool Landed Cost';ws.getCell('A1').font={bold:true,size:14};
  ws.mergeCells(`A2:${last}2`);ws.getCell('A2').value='Điền từ dòng 4. Cột có * là bắt buộc. Ảnh: chèn ảnh nổi đặt trong ô cột A của đúng dòng. Không đổi tên dòng tiêu đề (dòng 3). Xem sheet "Hướng dẫn".';ws.getCell('A2').font={italic:true,size:10,color:{argb:'FF5B6876'}};
  const hr=ws.getRow(3);hr.values=IMP_COLS.map(c=>c[1]);hr.height=36;hr.font={bold:true,color:{argb:'FFFFFFFF'}};hr.alignment={wrapText:true,vertical:'middle',horizontal:'center'};
  IMP_COLS.forEach((c,i)=>{const cell=hr.getCell(i+1);cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:/\*/.test(c[1])?'FFC4501B':'FF1F5F7A'}};ws.getColumn(i+1).width=c[3]});
  const L={};IMP_COLS.forEach((c,i)=>L[c[0]]=colL(i+1));
  const dm=wb.addWorksheet('DanhMuc');dm.getCell('A1').value='Xuất xứ';dm.getCell('A1').font={bold:true};ORIGINS.forEach((o,i)=>dm.getCell('A'+(i+2)).value=o.name);dm.getColumn(1).width=26;
  dm.getCell('G1').value='Cảng đi';dm.getCell('G1').font={bold:true};POL_LIST.forEach((x,i)=>dm.getCell('G'+(i+2)).value=x);dm.getColumn(7).width=22;
  dm.getCell('C1').value='Loại cont';dm.getCell('C2').value='40';dm.getCell('C3').value='20';dm.getCell('E1').value='C/O';dm.getCell('E2').value='Có';dm.getCell('E3').value='Không';
  ws.dataValidations.add(`${L.cont}4:${L.cont}503`,{type:'list',allowBlank:true,formulae:['DanhMuc!$C$2:$C$3']});
  ws.dataValidations.add(`${L.pol}4:${L.pol}503`,{type:'list',allowBlank:true,showErrorMessage:false,formulae:[`DanhMuc!$G$2:$G$${POL_LIST.length+1}`]});
  ws.dataValidations.add(`${L.origin}4:${L.origin}503`,{type:'list',allowBlank:true,formulae:[`DanhMuc!$A$2:$A$${ORIGINS.length+1}`]});
  ws.dataValidations.add(`${L.co}4:${L.co}503`,{type:'list',allowBlank:true,formulae:['DanhMuc!$E$2:$E$3']});
  for(let r=4;r<=503;r++){
    ws.getCell(L.hs+r).numFmt='@';['fob'].forEach(k=>ws.getCell(L[k]+r).numFmt='#,##0.00');['moq','qty','annual'].forEach(k=>ws.getCell(L[k]+r).numFmt='#,##0');
    ws.getRow(r).height=48;
  }
  const hd=wb.addWorksheet('Hướng dẫn');hd.getColumn(1).width=26;hd.getColumn(2).width=90;
  [['HƯỚNG DẪN NHẬP FILE',''],['',''],['Bước 1','Điền sản phẩm vào sheet "Sản phẩm" từ dòng 4, mỗi sản phẩm 1 dòng.'],['Bước 2','Ảnh: Insert › Pictures, kéo ảnh nằm gọn trong ô cột A của dòng đó (ảnh dạng nổi). Ảnh kiểu "Place in cell" của Excel 365 tool chưa đọc được.'],['Bước 3','Lưu file .xlsx, mở tool › Tính giá › "Nhập từ Excel", xem trước rồi bấm Thêm hoặc Thay toàn bộ.'],['',''],['CỘT','CÁCH ĐIỀN'],
   ...IMP_COLS.map(c=>[c[1],c[2]]),['',''],['Mẹo','Có thể nhập lại chính file Excel landed cost mà tool đã xuất (tool tự nhận các cột Mã SP, Tên, FOB, MOQ, HS, Xuất xứ, C/O…).'],['Mẹo','Mã HS để trống thì tool gợi ý theo tên sản phẩm; nên kiểm tra lại các dòng được đánh dấu "tool gợi ý".'],['',''],['VÍ DỤ',''],
   ['Ví dụ 1','VD-QDH01 | Quạt điều hòa 40L (ví dụ) | 220V/50Hz, 180W, bình nước 40L | 42 | 300 | 40 | Trung Quốc | Nhà máy ví dụ A | (địa chỉ) | Ningbo | Có | 8479.60.00 | 24 |  |  |  | 1200'],['Ví dụ 2','VD-MG01 | Máy giặt 8kg (ví dụ) | 220V, 1400 vòng/phút | 150 | 120 | 40 | Trung Quốc | Nhà máy ví dụ B | (địa chỉ) | Shanghai | Có | (trống – tool tự chọn theo sức chứa) |  | 8 |  |  | ']]
   .forEach((r,i)=>{const row=hd.getRow(i+1);row.values=r;if(/^(HƯỚNG|CỘT|VÍ DỤ)/.test(r[0]))row.font={bold:true};row.getCell(2).alignment={wrapText:true}});
  return wb;
}
async function downloadTemplate(){const wb=await buildTemplate();if(!wb)return;const buf=await wb.xlsx.writeBuffer();const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));a.download='Mau-Import-San-Pham.xlsx';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)}
function bindImport(){
  $('#impBtn').onclick=()=>$('#impFile').click();
  $('#tplBtn').onclick=()=>downloadTemplate().catch(e=>toast('Không tạo được file mẫu: '+e.message));
  $('#impFile').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;$('#xlsMsg').textContent='Đang đọc '+f.name+'…';
    try{IMP=await readImport(f);$('#xlsMsg').textContent='';renderImport()}catch(err){$('#xlsMsg').textContent='';IMP=null;renderImport();toast(err.message)}});
  $('#impPanel').addEventListener('click',e=>{const b=e.target.closest('[data-imp]');if(!b)return;if(b.dataset.imp==='cancel'){IMP=null;renderImport()}else applyImport(b.dataset.imp)});
}

/* ---------------- tabs & boot ---------------- */
function bindTabs(){document.querySelectorAll('nav.tabs button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('nav.tabs button').forEach(x=>x.setAttribute('aria-selected',x===b));
  document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==b.dataset.tab);LS.set('lc_tab',b.dataset.tab)}));
  const t=LS.get('lc_tab','calc');const b=document.querySelector(`nav.tabs button[data-tab="${t}"]`);if(b)b.click()}
(async function boot(){
  bindTabs();bindSettings();bindCards();bindOvr();bindTariff();bindImport();bindReset();
  $('#polList').innerHTML=POL_LIST.map(x=>`<option value="${x}">`).join('');
  $('#addBtn').onclick=()=>{const last=P[P.length-1];P.push({id:nextId++,code:'',name:'',fob:'',moq:'',cont:last?last.cont:'40',origin:last?last.origin:'CN',co:last&&last.co?last.co:'yes',hs:'',qty:'',group:'',annual:'',img:'',man:{}});save();renderCards();const c=document.querySelector('.pcard:last-child [data-k="code"]');if(c){c.focus();c.scrollIntoView({block:'center'})}};
  $('#clearSamples').onclick=()=>{P=P.filter(p=>!p.sample);if(!P.length)P.push({id:nextId++,code:'',name:'',fob:'',moq:'',cont:'40',origin:'CN',hs:'',qty:'',group:'',annual:'',img:'',man:{}});save();renderCards()};
  $('#xlsBtn').onclick=()=>exportXlsx().catch(e=>{toast('Không xuất được file: '+e.message)});
  $('#plist').innerHTML='<p class="muted">Đang mở biểu thuế…</p>';
  try{const saved=await idb.get('tariff');if(saved&&saved.rows){DB=indexDB(saved);DBsrc=saved._name||'file đã nạp'}else DB=indexDB(await decodeBuiltin())}
  catch(e){console.error('BOOT',e&&e.stack);$('#plist').innerHTML='<p class="w bad">Không giải nén được dữ liệu biểu thuế trên trình duyệt này. Hãy mở bằng Chrome, Edge hoặc Safari bản mới.</p>';return}
  renderSrc();renderOvr();renderCards();bindLookup();
})();

/* ---------------- khung chung Gấu Bép ---------------- */
GauBep.mountLayout({ title: 'Landed Cost Nhập Khẩu', icon: '🚢' });
(function(){ const h1 = document.querySelector('header.top h1'); if (h1) h1.insertAdjacentHTML('afterbegin', GauBep.panda(44)); })();
