"use client";

/**
 * Shuttle App – ไฟล์เดียวจบ (หน้า UI + รูปภาพ SVG + สไตล์ + เชื่อม Google Apps Script)
 * ไม่ต้องพึ่ง Tailwind / DaisyUI / ไฟล์รูปใน public
 */
import { useEffect, useRef, useState } from "react";

/* ───────── Types ───────── */
type Vehicle = { id: string; name: string; desc: string; price: number; max: number };
type Driver = { name: string; car: string; rating: number };
type Recent = { name: string; sub: string };
type Booking = { id: string; fare: number; seats: number; vehicle: string; driver: Driver };
type Screen = "home" | "select" | "track" | "done";

/* ───────── Google Apps Script API ───────── */
const GAS_URL =
  process.env.NEXT_PUBLIC_GAS_URL ??
  "https://script.google.com/macros/s/AKfycbw6yXnk3owJGL3rXCA9dbosLeoVI71vcVAL4mNuqZRY1vvNSKBZQ-hD55bJU2_LAaeGXA/exec";

async function gasGet<T>(action: string): Promise<T> {
  const r = await fetch(`${GAS_URL}?action=${action}`);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j as T;
}
async function gasPost<T>(action: string, payload: object): Promise<T> {
  // text/plain = simple request → ไม่ต้องทำ CORS preflight
  const r = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j as T;
}

/* ───────── ข้อมูลสำรอง (เมื่อเชื่อม Apps Script ไม่ได้) ───────── */
const DRIVER: Driver = { name: "คุณสมชาย", car: "รถตู้สีขาว · กข 1234", rating: 4.9 };
const FALLBACK = {
  vehicles: [
    { id: "van", name: "รถตู้ร่วม", desc: "8 ที่นั่ง · 15 นาที", price: 60, max: 8 },
    { id: "bus", name: "มินิบัส", desc: "20 ที่นั่ง · 22 นาที", price: 40, max: 20 },
    { id: "private", name: "รถส่วนตัว", desc: "4 ที่นั่ง · 8 นาที", price: 150, max: 4 },
  ] as Vehicle[],
  recent: [
    { name: "บ้าน", sub: "ที่อยู่ที่บันทึกไว้" },
    { name: "ที่ทำงาน", sub: "ที่อยู่ที่บันทึกไว้" },
    { name: "สถานีขนส่ง", sub: "เดินทางล่าสุด" },
  ] as Recent[],
};
const ETA = 4;
const VEH_COLORS = ["#2563eb", "#f97316", "#16a34a"];
const REC_COLORS = ["#fde68a", "#bbf7d0", "#e9d5ff"];

/* ───────── Styles ───────── */
const CSS = `
.sh{--bg:#fff;--fg:#0f172a;--mut:#475569;--line:#93c5fd;--soft:#eff6ff;--p:#2563eb;--pt:#fff;--ok:#16a34a;--or:#f97316;--er:#b91c1c;--page:#e8eefc;box-sizing:border-box;min-height:100dvh;background:var(--page);color:var(--fg);font-size:15px}
@media (prefers-color-scheme:dark){.sh{--bg:#0f172a;--fg:#f1f5f9;--mut:#cbd5e1;--line:#1d4ed8;--soft:#1e293b;--p:#60a5fa;--pt:#0f172a;--ok:#4ade80;--or:#fb923c;--er:#fca5a5;--page:#020617}}
.sh *{box-sizing:border-box}
.app{max-width:390px;margin:0 auto;min-height:100dvh;background:var(--bg);position:relative;overflow:hidden;display:flex;flex-direction:column}
@media(min-width:600px){.app{height:882px;min-height:0;margin:24px auto;border-radius:28px;box-shadow:0 20px 60px #0004}}
.s{display:flex;flex:1;flex-direction:column;min-height:0}
.map{position:relative;flex:none;background:#dbeafe;overflow:hidden}.map svg{position:absolute;inset:0;width:100%;height:100%}
.card{border:1.5px solid var(--line);border-radius:14px;padding:14px 16px;background:var(--bg)}
.row{display:flex;align-items:center;gap:12px}.b{margin-left:auto;font-weight:700}.sub{color:var(--mut);font-size:13px}
.dot{width:16px;height:16px;border-radius:50%;border:2px solid var(--ok);flex:none}.dot.d{background:var(--or);border-color:var(--or)}
.sheet{margin-top:-24px;position:relative;background:var(--bg);border-radius:24px 24px 0 0;border-top:1.5px solid var(--line);padding:20px;display:flex;flex-direction:column;gap:12px;flex:1}
.sh button{font:inherit;cursor:pointer}
.cta{height:52px;border:0;border-radius:12px;background:var(--p);color:var(--pt);font-weight:700;font-size:16px;width:100%}.cta:disabled{opacity:.6}
.gh{height:44px;border-radius:12px;background:var(--bg);border:1.5px solid var(--p);color:var(--p);font-weight:600;font-size:14px;flex:1}
.circ{width:44px;height:44px;border-radius:50%;border:1.5px solid var(--p);background:var(--bg);color:var(--p);font-size:18px;flex:none}
.h{padding:48px 20px 12px;display:flex;align-items:center;gap:12px;font-weight:700;font-size:18px}
.rec{display:flex;align-items:center;gap:12px;padding:8px;border:0;background:none;color:inherit;text-align:left;border-radius:12px;width:100%}.rec:hover{background:var(--soft)}
.ic{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:700;color:#0f172a;flex:none}
.veh{display:flex;align-items:center;gap:12px;border:2px solid var(--line);border-radius:14px;padding:10px 14px;cursor:pointer;position:relative}.veh.on{border-color:var(--p);background:var(--soft)}
.veh input{position:absolute;opacity:0;pointer-events:none}
.nav{display:flex;border-top:1.5px solid var(--line);padding:8px 8px 20px;font-size:12px;color:var(--mut)}.nav div{flex:1;text-align:center}.nav i{display:block;width:24px;height:24px;border-radius:6px;margin:0 auto 4px}
.steps{display:flex;gap:6px}.steps div{flex:1;font-size:11px;text-align:center;color:var(--mut)}.steps div:before{content:"";display:block;height:6px;border-radius:3px;background:#bfdbfe;margin-bottom:4px}.steps .on:before{background:var(--ok)}
.st{font-size:28px;background:none;border:0;color:#cbd5e1;padding:2px}.st.on{color:#f59e0b}
.sh textarea,.sh input.in{font:inherit;color:var(--fg);background:var(--bg)}
.toast{position:absolute;top:16px;left:50%;transform:translateX(-50%);background:#1e3a8a;color:#fff;padding:10px 16px;border-radius:12px;font-size:14px;z-index:9;white-space:nowrap}
.off{background:#f97316;color:#0f172a;font-size:12px;font-weight:600;text-align:center;padding:4px 12px}
`;

/* ───────── รูปภาพ (inline SVG) ───────── */
function MapSvg({ van = false }: { van?: boolean }) {
  return (
    <svg viewBox="0 0 390 470" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <path d="M0 380C100 340 200 420 390 360V470H0Z" fill="#93c5fd" />
      <rect x="100" y="130" width="60" height="50" rx="6" fill="#bbf7d0" />
      <rect x="260" y="270" width="60" height="60" rx="6" fill="#fde68a" />
      <rect x="10" y="20" width="70" height="90" rx="6" fill="#bfdbfe" />
      <rect x="180" y="20" width="60" height="90" rx="6" fill="#c7d2fe" />
      <rect x="10" y="200" width="70" height="50" rx="6" fill="#fbcfe8" />
      <g stroke="#fff" strokeWidth="14" fill="none"><path d="M-10 120H400" /><path d="M-10 260H400" /><path d="M90-10V400" /><path d="M250-10V400" /></g>
      <g stroke="#fff" strokeWidth="6"><path d="M-10 190H400" /><path d="M170-10V400" /><path d="M330-10V400" /></g>
      <path d="M100 300C150 260 200 250 270 190" stroke="#f97316" strokeWidth="4" strokeDasharray="8 6" fill="none" />
      <circle cx="100" cy="300" r="10" fill="#16a34a" stroke="#fff" strokeWidth="3" />
      <rect x="261" y="181" width="18" height="18" rx="4" fill="#f97316" stroke="#fff" strokeWidth="3" />
      {van && (
        <g>
          <rect x="-14" y="-9" width="28" height="18" rx="5" fill="#2563eb" stroke="#fff" strokeWidth="2" />
          <rect x="-9" y="-5" width="18" height="6" rx="1.5" fill="#dbeafe" />
          <animateMotion dur="14s" repeatCount="indefinite" path="M270 190C200 250 150 260 100 300" />
        </g>
      )}
    </svg>
  );
}
function VanSvg({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 56 40" width="60" aria-hidden>
      <rect x="3" y="8" width="50" height="22" rx="6" fill={color} />
      <rect x="9" y="12" width="12" height="9" rx="2" fill="#dbeafe" />
      <rect x="24" y="12" width="12" height="9" rx="2" fill="#dbeafe" />
      <rect x="39" y="12" width="10" height="9" rx="2" fill="#dbeafe" />
      <circle cx="16" cy="31" r="5" fill="#0f172a" />
      <circle cx="42" cy="31" r="5" fill="#0f172a" />
    </svg>
  );
}
function DriverSvg() {
  return (
    <svg width="52" height="52" viewBox="0 0 96 96" style={{ borderRadius: "50%", flex: "none" }} role="img" aria-label="รูปคนขับ">
      <rect width="96" height="96" fill="#bfdbfe" />
      <path d="M10 96c3-22 20-30 38-30s35 8 38 30z" fill="#1d4ed8" />
      <rect x="42" y="52" width="12" height="16" rx="4" fill="#d9a066" />
      <ellipse cx="48" cy="40" rx="17" ry="19" fill="#e8b27d" />
      <path d="M30 36c0-14 10-20 18-20s18 6 18 20c-4-8-10-11-18-11s-14 3-18 11z" fill="#1e293b" />
      <circle cx="42" cy="42" r="2" fill="#1e293b" /><circle cx="54" cy="42" r="2" fill="#1e293b" />
    </svg>
  );
}

/* ───────── Page ───────── */
export default function Page() {
  const [screen, setScreen] = useState<Screen>("home");
  const [vehicles, setVehicles] = useState<Vehicle[]>(FALLBACK.vehicles);
  const [recent, setRecent] = useState<Recent[]>(FALLBACK.recent);
  const [offline, setOffline] = useState(false);
  const [to, setTo] = useState("");
  const [sel, setSel] = useState(0);
  const [seats, setSeats] = useState(1);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [t, setT] = useState(0);
  const [rate, setRate] = useState(5);
  const [comment, setComment] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const from = "ตำแหน่งปัจจุบัน";
  const v = vehicles[sel] ?? vehicles[0];

  const say = (m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  };

  useEffect(() => {
    gasGet<typeof FALLBACK>("init")
      .then((d) => { setVehicles(d.vehicles); setRecent(d.recent); })
      .catch(() => setOffline(true));
  }, []);

  useEffect(() => {
    if (screen !== "track") return;
    setT(0);
    const id = setInterval(() => setT((x) => x + 1), 2000);
    return () => clearInterval(id);
  }, [screen]);

  useEffect(() => {
    if (screen !== "track" || t < ETA + 3) return;
    const id = setTimeout(() => {
      if (booking) gasPost("updateBooking", { id: booking.id, status: "completed" }).catch(() => {});
      setScreen("done");
    }, 1200);
    return () => clearTimeout(id);
  }, [t, screen, booking]);

  const next = () => {
    if (!to.trim()) return say("กรุณาระบุจุดหมาย");
    setScreen("select");
  };

  const confirm = async () => {
    setBusy(true);
    try {
      setBooking(await gasPost<Booking>("createBooking", { from, to, vehicle: v.id, seats }));
    } catch {
      setBooking({ id: "BK" + Date.now().toString().slice(-8), fare: v.price * seats, seats, vehicle: v.name, driver: DRIVER });
      setOffline(true);
    }
    setBusy(false);
    setScreen("track");
  };

  const cancel = () => {
    if (booking) gasPost("updateBooking", { id: booking.id, status: "cancelled" }).catch(() => {});
    say("ยกเลิกการจองแล้ว");
    setScreen("home");
  };

  const finish = async () => {
    if (booking) await gasPost("updateBooking", { id: booking.id, status: "rated", rating: rate, comment }).catch(() => {});
    say("ขอบคุณสำหรับคะแนน!");
    setComment(""); setTo(""); setSeats(1); setRate(5); setScreen("home");
  };

  const status = t < ETA ? `รถถึงใน ${ETA - t} นาที` : t < ETA + 3 ? "กำลังเดินทางไปยังจุดหมาย" : "ถึงที่หมายแล้ว";

  return (
    <div className="sh">
      <style>{CSS}</style>
      <main className="app">
        {offline && <div className="off" role="status">เชื่อมต่อ Apps Script ไม่ได้ · ใช้ข้อมูลตัวอย่าง</div>}

        {/* 1 หน้าหลัก */}
        {screen === "home" && (
          <section className="s">
            <div className="map" style={{ height: 440 }}><MapSvg /></div>
            <div className="card" style={{ position: "absolute", left: 20, right: 20, top: 48, boxShadow: "0 6px 20px #0003", display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="row"><span className="dot" />{from}</div>
              <div style={{ borderTop: "1px solid #bfdbfe" }} />
              <label className="row"><span className="dot d" />
                <input className="in" value={to} onChange={(e) => setTo(e.target.value)} placeholder="คุณจะไปที่ไหน?" aria-label="จุดหมาย"
                  style={{ border: 0, outline: 0, width: "100%", fontWeight: 700 }} />
              </label>
            </div>
            <div className="sheet">
              <b style={{ fontSize: 17 }}>จุดหมายล่าสุด</b>
              <div>
                {recent.map((r, i) => (
                  <button key={r.name} className="rec" onClick={() => setTo(r.name)}>
                    <span className="ic" style={{ background: REC_COLORS[i % 3] }}>{r.name[0]}</span>
                    <span>{r.name}<br /><span className="sub">{r.sub}</span></span>
                  </button>
                ))}
              </div>
              <button className="cta" style={{ marginTop: "auto" }} onClick={next}>จองรถรับส่ง</button>
            </div>
            <nav className="nav" aria-label="เมนูหลัก">
              <div style={{ color: "var(--p)", fontWeight: 700 }}><i style={{ background: "var(--p)" }} />หน้าหลัก</div>
              <div><i style={{ background: "#fdba74" }} />การเดินทาง</div>
              <div><i style={{ background: "#d8b4fe" }} />ตั๋วของฉัน</div>
              <div><i style={{ background: "#5eead4" }} />โปรไฟล์</div>
            </nav>
          </section>
        )}

        {/* 2 เลือกรถ */}
        {screen === "select" && (
          <section className="s">
            <div className="h"><button className="circ" onClick={() => setScreen("home")} aria-label="ย้อนกลับ">←</button>เลือกรถรับส่ง</div>
            <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12, flex: 1, overflowY: "auto" }}>
              <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="row"><span className="dot" />{from}</div>
                <div className="row"><span className="dot d" /><b>{to}</b></div>
              </div>
              <div className="map" style={{ height: 130, borderRadius: 14 }}><MapSvg /></div>
              <b style={{ fontSize: 17 }}>ประเภทรถ</b>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {vehicles.map((x, i) => (
                  <label key={x.id} className={`veh${i === sel ? " on" : ""}`}>
                    <input type="radio" name="v" checked={i === sel} onChange={() => { setSel(i); setSeats((s) => Math.min(s, x.max)); }} />
                    <VanSvg color={VEH_COLORS[i % 3]} />
                    <div><b>{x.name}</b><div className="sub">{x.desc}</div></div>
                    <b className="b">฿{x.price}</b>
                  </label>
                ))}
              </div>
              <div className="row">
                <span>จำนวนที่นั่ง</span>
                <div className="row b" style={{ gap: 14 }}>
                  <button className="circ" aria-label="ลด" style={{ width: 36, height: 36 }} onClick={() => setSeats((s) => Math.max(1, s - 1))}>−</button>
                  <span>{seats}</span>
                  <button className="circ" aria-label="เพิ่ม" style={{ width: 36, height: 36 }}
                    onClick={() => (seats < v.max ? setSeats(seats + 1) : say("ที่นั่งเต็มสำหรับรถประเภทนี้"))}>+</button>
                </div>
              </div>
            </div>
            <div style={{ padding: "16px 20px 28px", borderTop: "1.5px solid var(--line)" }}>
              <button className="cta" disabled={busy} onClick={confirm}>{busy ? "กำลังจอง…" : `ยืนยันการจอง · ฿${v.price * seats}`}</button>
            </div>
          </section>
        )}

        {/* 3 ติดตามรถ */}
        {screen === "track" && booking && (
          <section className="s">
            <div className="map" style={{ height: 400 }}>
              <MapSvg van />
              <button className="circ" onClick={() => setScreen("select")} aria-label="ย้อนกลับ" style={{ position: "absolute", left: 20, top: 48, zIndex: 2 }}>←</button>
            </div>
            <div className="sheet">
              <div className="row"><b style={{ fontSize: 20 }} aria-live="polite">{status}</b><span className="b sub">#{booking.id}</span></div>
              <div className="steps">
                <div className="on">ยืนยัน</div><div className="on">รถกำลังมา</div>
                <div className={t >= ETA ? "on" : ""}>กำลังเดินทาง</div><div className={t >= ETA + 3 ? "on" : ""}>ถึงที่หมาย</div>
              </div>
              <div className="card row">
                <DriverSvg />
                <div><b>{booking.driver.name}</b><div className="sub">{booking.driver.car}</div></div>
                <b className="b" style={{ color: "#b45309" }}>{booking.driver.rating} ★</b>
              </div>
              <div className="row">
                <button className="gh" style={{ color: "var(--ok)", borderColor: "var(--ok)" }} onClick={() => say("กำลังโทรหาคนขับ (จำลอง)")}>โทร</button>
                <button className="gh" style={{ color: "#a855f7", borderColor: "#a855f7" }} onClick={() => say("เปิดแชท (จำลอง)")}>แชท</button>
                <button className="gh" style={{ color: "var(--or)", borderColor: "var(--or)" }} onClick={() => say("คัดลอกลิงก์เส้นทางแล้ว (จำลอง)")}>แชร์เส้นทาง</button>
              </div>
              <button className="gh" style={{ flex: "none", marginTop: "auto", color: "var(--er)", borderColor: "var(--er)" }} onClick={cancel}>ยกเลิกการจอง</button>
            </div>
          </section>
        )}

        {/* 4 ถึงที่หมาย */}
        {screen === "done" && booking && (
          <section className="s">
            <div style={{ textAlign: "center", padding: "64px 0 16px" }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#16a34a", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" aria-hidden><path d="M5 12l5 5 9-10" /></svg>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>ถึงที่หมายแล้ว</div>
              <div className="sub">ขอบคุณที่ใช้บริการ</div>
            </div>
            <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
              <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
                <div className="row">ค่าโดยสาร<b className="b">฿{booking.fare}</b></div>
                <div className="row">รถ · ที่นั่ง<b className="b">{booking.vehicle} · {booking.seats} ที่นั่ง</b></div>
                <div className="row">ชำระด้วย<b className="b">พร้อมเพย์</b></div>
              </div>
              <b style={{ textAlign: "center", fontSize: 17 }}>ให้คะแนนการเดินทาง</b>
              <div style={{ textAlign: "center" }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className={`st${n <= rate ? " on" : ""}`} aria-label={`${n} ดาว`} onClick={() => setRate(n)}>★</button>
                ))}
              </div>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="เขียนความคิดเห็น (ไม่บังคับ)" aria-label="ความคิดเห็น"
                style={{ height: 90, border: "1.5px solid var(--line)", borderRadius: 14, padding: 12, resize: "none" }} />
            </div>
            <div style={{ padding: "16px 20px 28px" }}><button className="cta" onClick={finish}>เสร็จสิ้น</button></div>
          </section>
        )}

        {toast && <div className="toast" role="status">{toast}</div>}
      </main>
    </div>
  );
}