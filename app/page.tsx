"use client";

import Image from "next/image";
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
  // text/plain ทำให้เป็น "simple request" ไม่ต้องทำ CORS preflight (Apps Script ไม่รองรับ OPTIONS)
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

/* ───────── ข้อมูลสำรอง (ใช้เมื่อเชื่อมต่อ Apps Script ไม่ได้) ───────── */
const FALLBACK_DRIVER: Driver = { name: "คุณสมชาย", car: "รถตู้สีขาว · กข 1234", rating: 4.9 };
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
  driver: FALLBACK_DRIVER,
};

const ETA = 4;
const VEHICLE_IMG = ["/images/van.svg", "/images/bus.svg", "/images/car.svg"];
const RECENT_COLORS = ["bg-amber-200", "bg-green-200", "bg-purple-200"];

/* ───────── Small components ───────── */
function MapSvg({ van = false }: { van?: boolean }) {
  return (
    <svg viewBox="0 0 390 470" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
      <image href="/images/map.svg" width="390" height="470" />
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

function VehicleImg({ src, alt }: { src: string; alt: string }) {
  return <Image src={src} alt={alt} width={72} height={48} className="h-12 w-[72px] shrink-0 object-contain" />;
}

function RouteCard({ from, to }: { from: string; to: string }) {
  return (
    <div className="card border border-primary/30 bg-base-100">
      <div className="card-body gap-2 p-4">
        <div className="flex items-center gap-3"><span className="h-4 w-4 rounded-full border-2 border-success" />{from}</div>
        <div className="flex items-center gap-3 font-bold"><span className="h-4 w-4 rounded-full bg-warning" />{to}</div>
      </div>
    </div>
  );
}

function BackButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button onClick={onClick} aria-label="ย้อนกลับ" className={`btn btn-circle btn-outline btn-primary ${className}`}>←</button>
  );
}

/* ───────── Page ───────── */
export default function Page() {
  const [screen, setScreen] = useState<Screen>("home");
  const [vehicles, setVehicles] = useState<Vehicle[]>(FALLBACK.vehicles);
  const [recent, setRecent] = useState<Recent[]>(FALLBACK.recent);
  const [offline, setOffline] = useState(false);
  const [from] = useState("ตำแหน่งปัจจุบัน");
  const [to, setTo] = useState("");
  const [sel, setSel] = useState("van");
  const [seats, setSeats] = useState(1);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [t, setT] = useState(0);
  const [rate, setRate] = useState(5);
  const [comment, setComment] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  };

  const vehicle = vehicles.find((v) => v.id === sel) ?? vehicles[0];

  /* โหลดข้อมูลเริ่มต้นจาก Apps Script */
  useEffect(() => {
    gasGet<typeof FALLBACK>("init")
      .then((d) => { setVehicles(d.vehicles); setRecent(d.recent); })
      .catch(() => setOffline(true));
  }, []);

  /* จำลองการเดินทาง: นับถอยหลัง ETA แล้วเดินทางต่อจนถึงที่หมาย */
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

  const goSelect = () => {
    if (!to.trim()) return showToast("กรุณาระบุจุดหมาย");
    setScreen("select");
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const b = await gasPost<Booking>("createBooking", { from, to, vehicle: vehicle.id, seats });
      setBooking(b);
    } catch {
      // เชื่อมต่อไม่ได้ → สร้างการจองจำลองในเครื่อง
      setBooking({ id: "BK" + Date.now().toString().slice(-8), fare: vehicle.price * seats, seats, vehicle: vehicle.name, driver: FALLBACK_DRIVER });
      setOffline(true);
    }
    setBusy(false);
    setScreen("track");
  };

  const cancel = () => {
    if (booking) gasPost("updateBooking", { id: booking.id, status: "cancelled" }).catch(() => {});
    showToast("ยกเลิกการจองแล้ว");
    setScreen("home");
  };

  const finish = async () => {
    if (booking) await gasPost("updateBooking", { id: booking.id, status: "rated", rating: rate, comment }).catch(() => {});
    showToast("ขอบคุณสำหรับคะแนน!");
    setComment(""); setTo(""); setSeats(1); setRate(5); setScreen("home");
  };

  const status = t < ETA ? `รถถึงใน ${ETA - t} นาที` : t < ETA + 3 ? "กำลังเดินทางไปยังจุดหมาย" : "ถึงที่หมายแล้ว";

  return (
    <main className="mx-auto my-0 flex min-h-dvh w-full max-w-[390px] flex-col overflow-hidden bg-base-100 sm:my-6 sm:h-[882px] sm:min-h-0 sm:rounded-3xl sm:shadow-2xl">
      {offline && (
        <div role="status" className="bg-warning px-4 py-1 text-center text-xs font-semibold text-warning-content">
          เชื่อมต่อ Apps Script ไม่ได้ · ใช้ข้อมูลตัวอย่าง
        </div>
      )}

      {/* ── 1 หน้าหลัก ── */}
      {screen === "home" && (
        <section className="relative flex flex-1 flex-col">
          <div className="relative h-[440px] shrink-0 bg-base-300"><MapSvg /></div>
          <div className="card absolute left-5 right-5 top-12 border border-primary/30 bg-base-100 shadow-lg">
            <div className="card-body gap-2 p-4">
              <div className="flex items-center gap-3"><span className="h-4 w-4 rounded-full border-2 border-success" />{from}</div>
              <div className="divider my-0" />
              <label className="flex items-center gap-3">
                <span className="h-4 w-4 rounded-full bg-warning" />
                <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="คุณจะไปที่ไหน?" aria-label="จุดหมาย"
                  className="input input-ghost input-sm w-full px-0 font-bold focus:outline-none" />
              </label>
            </div>
          </div>
          <div className="relative -mt-6 flex flex-1 flex-col gap-3 rounded-t-3xl border-t border-primary/30 bg-base-100 p-5">
            <h2 className="font-bold">จุดหมายล่าสุด</h2>
            {recent.map((r, i) => (
              <button key={r.name} onClick={() => setTo(r.name)} className="flex items-center gap-3 rounded-xl p-2 text-left hover:bg-base-200">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl font-bold ${RECENT_COLORS[i % 3]}`}>{r.name[0]}</span>
                <span><span className="block">{r.name}</span><span className="block text-xs text-slate-600">{r.sub}</span></span>
              </button>
            ))}
            <button onClick={goSelect} className="btn btn-primary mt-auto">จองรถรับส่ง</button>
          </div>
          <nav className="flex border-t border-primary/30 px-2 pb-6 pt-2 text-xs text-slate-600" aria-label="เมนูหลัก">
            {[["หน้าหลัก", "bg-primary"], ["การเดินทาง", "bg-orange-300"], ["ตั๋วของฉัน", "bg-purple-300"], ["โปรไฟล์", "bg-teal-300"]].map(([n, c], i) => (
              <div key={n} className={`flex flex-1 flex-col items-center gap-1 ${i === 0 ? "font-bold text-primary" : ""}`}>
                <i className={`block h-6 w-6 rounded-md ${c}`} />{n}
              </div>
            ))}
          </nav>
        </section>
      )}

      {/* ── 2 เลือกรถ ── */}
      {screen === "select" && (
        <section className="flex flex-1 flex-col">
          <header className="flex items-center gap-3 px-5 pb-3 pt-12">
            <BackButton onClick={() => setScreen("home")} />
            <h1 className="text-lg font-bold">เลือกรถรับส่ง</h1>
          </header>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5">
            <RouteCard from={from} to={to} />
            <div className="relative h-[130px] overflow-hidden rounded-2xl bg-base-300"><MapSvg /></div>
            <h2 className="font-bold">ประเภทรถ</h2>
            {vehicles.map((v, i) => (
              <label key={v.id} className={`card cursor-pointer border-2 ${v.id === sel ? "border-primary bg-base-200" : "border-primary/30"}`}>
                <input type="radio" name="veh" className="sr-only" checked={v.id === sel}
                  onChange={() => { setSel(v.id); setSeats((s) => Math.min(s, v.max)); }} />
                <div className="card-body flex-row items-center gap-3 p-3">
                  <VehicleImg src={VEHICLE_IMG[i % 3]} alt={v.name} />
                  <div><b>{v.name}</b><div className="text-xs text-slate-600">{v.desc}</div></div>
                  <b className="ml-auto">฿{v.price}</b>
                </div>
              </label>
            ))}
            <div className="flex items-center justify-between pb-2">
              <span>จำนวนที่นั่ง</span>
              <div className="flex items-center gap-3">
                <button aria-label="ลด" className="btn btn-circle btn-outline btn-warning btn-sm" onClick={() => setSeats((s) => Math.max(1, s - 1))}>−</button>
                <span className="w-6 text-center font-bold">{seats}</span>
                <button aria-label="เพิ่ม" className="btn btn-circle btn-outline btn-warning btn-sm"
                  onClick={() => (seats < vehicle.max ? setSeats(seats + 1) : showToast("ที่นั่งเต็มสำหรับรถประเภทนี้"))}>+</button>
              </div>
            </div>
          </div>
          <div className="border-t border-primary/30 p-5 pb-8">
            <button onClick={confirm} disabled={busy} className="btn btn-primary w-full">
              {busy && <span className="loading loading-spinner loading-sm" />}
              ยืนยันการจอง · ฿{vehicle.price * seats}
            </button>
          </div>
        </section>
      )}

      {/* ── 3 ติดตามรถ ── */}
      {screen === "track" && booking && (
        <section className="flex flex-1 flex-col">
          <div className="relative h-[400px] shrink-0 bg-base-300">
            <MapSvg van />
            <BackButton onClick={() => setScreen("select")} className="absolute left-5 top-12 z-10 bg-base-100" />
          </div>
          <div className="relative -mt-6 flex flex-1 flex-col gap-3 rounded-t-3xl border-t border-primary/30 bg-base-100 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-bold" aria-live="polite">{status}</h2>
              <span className="text-sm text-slate-600">#{booking.id}</span>
            </div>
            <ul className="steps w-full text-xs">
              <li className="step step-success">ยืนยัน</li>
              <li className="step step-success">รถกำลังมา</li>
              <li className={`step ${t >= ETA ? "step-success" : ""}`}>กำลังเดินทาง</li>
              <li className={`step ${t >= ETA + 3 ? "step-success" : ""}`}>ถึงที่หมาย</li>
            </ul>
            <div className="card border border-primary/30">
              <div className="card-body flex-row items-center gap-3 p-3">
                <Image src="/images/driver.svg" alt={`รูปคนขับ ${booking.driver.name}`} width={48} height={48} className="h-12 w-12 shrink-0 rounded-full object-cover" />
                <div><b>{booking.driver.name}</b><div className="text-sm text-slate-600">{booking.driver.car}</div></div>
                <b className="ml-auto text-amber-700">{booking.driver.rating} ★</b>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button className="btn btn-outline btn-success btn-sm" onClick={() => showToast("กำลังโทรหาคนขับ (จำลอง)")}>โทร</button>
              <button className="btn btn-outline btn-secondary btn-sm" onClick={() => showToast("เปิดแชท (จำลอง)")}>แชท</button>
              <button className="btn btn-outline btn-warning btn-sm" onClick={() => showToast("คัดลอกลิงก์เส้นทางแล้ว (จำลอง)")}>แชร์เส้นทาง</button>
            </div>
            <button onClick={cancel} className="btn btn-outline btn-error mb-3 mt-auto">ยกเลิกการจอง</button>
          </div>
        </section>
      )}

      {/* ── 4 ถึงที่หมาย ── */}
      {screen === "done" && booking && (
        <section className="flex flex-1 flex-col">
          <div className="flex flex-col items-center gap-1 pb-4 pt-16">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-success">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#fff" strokeWidth="3" aria-hidden><path d="M5 12l5 5 9-10" /></svg>
            </div>
            <h1 className="mt-2 text-2xl font-bold">ถึงที่หมายแล้ว</h1>
            <p className="text-sm text-slate-600">ขอบคุณที่ใช้บริการ</p>
          </div>
          <div className="flex flex-1 flex-col gap-4 px-5">
            <div className="card border border-primary/30">
              <div className="card-body gap-2 p-4 text-sm">
                <div className="flex justify-between"><span>ค่าโดยสาร</span><b>฿{booking.fare}</b></div>
                <div className="flex justify-between"><span>รถ · ที่นั่ง</span><b>{booking.vehicle} · {booking.seats} ที่นั่ง</b></div>
                <div className="flex justify-between"><span>ชำระด้วย</span><b>พร้อมเพย์</b></div>
              </div>
            </div>
            <h2 className="text-center font-bold">ให้คะแนนการเดินทาง</h2>
            <div className="rating rating-lg justify-center">
              {[1, 2, 3, 4, 5].map((n) => (
                <input key={n} type="radio" name="rate" aria-label={`${n} ดาว`} className="mask mask-star-2 bg-warning"
                  checked={rate === n} onChange={() => setRate(n)} />
              ))}
            </div>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="เขียนความคิดเห็น (ไม่บังคับ)"
              className="textarea h-24 w-full border-primary/40" />
          </div>
          <div className="p-5 pb-8"><button onClick={finish} className="btn btn-primary w-full">เสร็จสิ้น</button></div>
        </section>
      )}

      {toast && (
        <div className="toast toast-center toast-top z-50" role="status">
          <div className="alert alert-info text-sm">{toast}</div>
        </div>
      )}
    </main>
  );
}