/** Shuttle App – Google Apps Script backend (JSON API + HTML fallback)
 *  หลังวางโค้ดนี้ ต้อง Deploy > Manage deployments > Edit > Version: New version > Deploy
 *  เพื่อให้ URL เดิมใช้โค้ดใหม่ */
const VEHICLES = [
  { id: 'van',     name: 'รถตู้ร่วม',  desc: '8 ที่นั่ง · 15 นาที',  price: 60,  max: 8 },
  { id: 'bus',     name: 'มินิบัส',    desc: '20 ที่นั่ง · 22 นาที', price: 40,  max: 20 },
  { id: 'private', name: 'รถส่วนตัว', desc: '4 ที่นั่ง · 8 นาที',   price: 150, max: 4 }
];
const DRIVER = { name: 'คุณสมชาย', car: 'รถตู้สีขาว · กข 1234', rating: 4.9 };
const RECENT = [
  { name: 'บ้าน', sub: 'ที่อยู่ที่บันทึกไว้' },
  { name: 'ที่ทำงาน', sub: 'ที่อยู่ที่บันทึกไว้' },
  { name: 'สถานีขนส่ง', sub: 'เดินทางล่าสุด' }
];
const HEAD = ['id', 'เวลา', 'จาก', 'ถึง', 'รถ', 'ที่นั่ง', 'ค่าโดยสาร', 'สถานะ', 'คะแนน', 'ความเห็น'];

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action === 'init') return json_(getInit());
  if (action) return json_({ error: 'unknown action' });
  // ไม่มี action → แสดงหน้า HTML เดิม (ถ้ามีไฟล์ Index)
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('Shuttle')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.action === 'createBooking') return json_(createBooking(d));
    if (d.action === 'updateBooking') return json_({ ok: updateBooking(d.id, d.status, d.rating, d.comment) });
    return json_({ error: 'unknown action' });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function getInit() { return { vehicles: VEHICLES, recent: RECENT, driver: DRIVER }; }

function createBooking(b) {
  const v = VEHICLES.filter(x => x.id === b.vehicle)[0];
  if (!v) throw new Error('ไม่พบประเภทรถ');
  const seats = Math.max(1, Math.min(Number(b.seats) || 1, v.max));
  const fare = v.price * seats;
  const id = 'BK' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMddHHmmss');
  sheet_().appendRow([id, new Date(), b.from, b.to, v.name, seats, fare, 'booked', '', '']);
  return { id: id, fare: fare, seats: seats, vehicle: v.name, driver: DRIVER };
}

function updateBooking(id, status, rating, comment) {
  const sh = sheet_();
  const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (let i = 1; i < ids.length; i++) {
    if (ids[i][0] === id) {
      if (status) sh.getRange(i + 1, 8).setValue(status);
      if (rating) sh.getRange(i + 1, 9).setValue(rating);
      if (comment) sh.getRange(i + 1, 10).setValue(comment);
      return true;
    }
  }
  return false;
}

function sheet_() {
  const props = PropertiesService.getScriptProperties();
  const ssId = props.getProperty('SS_ID');
  let ss;
  if (ssId) { ss = SpreadsheetApp.openById(ssId); }
  else {
    ss = SpreadsheetApp.create('Shuttle Prototype – Bookings');
    props.setProperty('SS_ID', ss.getId());
    ss.getSheets()[0].appendRow(HEAD);
  }
  return ss.getSheets()[0];
}