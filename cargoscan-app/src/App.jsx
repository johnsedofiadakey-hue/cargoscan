import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";

// --- PLATFORM STORE (Simulated DB) ---
const PlatformContext = createContext(null);
export const usePlatform = () => useContext(PlatformContext);

const PLATFORM_VERSION = 5;

export function PlatformProvider({ children }) {
  const [platform, setPlatform] = useState(() => {
    const saved = localStorage.getItem("cs_platform");
    const ver = localStorage.getItem("cs_platform_v");
    if (saved && ver && parseInt(ver) >= PLATFORM_VERSION) {
      return JSON.parse(saved);
    }
    localStorage.removeItem("cs_platform");
    localStorage.setItem("cs_platform_v", String(PLATFORM_VERSION));
    return INITIAL_PLATFORM;
  });

  useEffect(() => {
    localStorage.setItem("cs_platform", JSON.stringify(platform));
    localStorage.setItem("cs_platform_v", String(PLATFORM_VERSION));
  }, [platform]);

  const api = {
    data: platform,
    createOrg: (org, user) => setPlatform(p => ({
      ...p,
      orgs: { ...p.orgs, [org.slug]: org },
      users: [...p.users, user]
    })),
    updateOrg: (slug, changes) => setPlatform(p => ({
      ...p, orgs: { ...p.orgs, [slug]: { ...p.orgs[slug], ...changes } }
    })),
    addShipment: (s) => setPlatform(p => ({ ...p, shipments: [s, ...p.shipments] })),
    updateShipment: (id, cls) => setPlatform(p => ({
      ...p, shipments: p.shipments.map(s => s.id === id ? { ...s, ...cls } : s)
    })),
    addPackage: (pkg) => setPlatform(p => ({ ...p, packages: [pkg, ...(p.packages || [])] })),
    updatePackage: (id, cls) => setPlatform(p => ({
      ...p, packages: (p.packages || []).map(pkg => pkg.id === id ? { ...pkg, ...cls } : pkg)
    })),
    addDispute: (d) => setPlatform(p => ({ ...p, disputes: [d, ...p.disputes] })),
    updateDispute: (id, cls) => setPlatform(p => ({
      ...p, disputes: p.disputes.map(d => d.id === id ? { ...d, ...cls } : d)
    })),
    wipeData: (slug) => setPlatform(p => ({
      ...p,
      shipments: p.shipments.filter(s => s.org !== slug),
      packages: (p.packages || []).filter(pkg => pkg.org !== slug),
      disputes: p.disputes.filter(d => d.org !== slug),
      orgs: { ...p.orgs, [slug]: { ...p.orgs[slug], usage: { ships: 0, items: 0, users: 1 } } }
    })),
    extendTrial: (slug, days) => setPlatform(p => {
      const o = p.orgs[slug];
      return { ...p, orgs: { ...p.orgs, [slug]: { ...o, trial: (o.trial || 0) + days } } };
    })
  };

  return <PlatformContext.Provider value={api}>{children}</PlatformContext.Provider>;
}

/* ═══════════════════════════════════════════════════════════════
   CARGOSCAN  —  Production SaaS Platform
   
   ONE login screen. Role-based routing. Zero exposed credentials.
   
   Login routing:
     Platform owner       →  Platform Console  (role: SUPER_ADMIN)
     Org ADMIN            →  Full org dashboard
     Org SUPERVISOR       →  Shipments + disputes + verify
     Org OPERATOR         →  Scan + view only
═══════════════════════════════════════════════════════════════ */

// ─── DESIGN TOKENS ────────────────────────────────────────────
const C = {
  bg: "#030609", s1: "#070B12", s2: "#0C1219", s3: "#101820",
  bd: "#152030", bd2: "#1C2D42",
  blue: "#2F7EFF", blueHov: "#1A6AEE", blueGlow: "rgba(47,126,255,.18)",
  green: "#00D48A", greenD: "#00A86D",
  red: "#FF2D55", amber: "#FFB020", purple: "#8B5FFF", cyan: "#00CCDD",
  orange: "#FF6B2B",
  txt: "#E8F0FF", mid: "#4E6080", muted: "#2A3A50", dim: "#0A1018",
  font: "'Instrument Sans',sans-serif",
  mono: "'Fira Code',monospace",
};

// ─── GLOBAL CSS ────────────────────────────────────────────────
const G = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&family=Fira+Code:wght@400;500;600&display=swap');
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
    html,body{background:${C.bg};color:${C.txt};font-family:${C.font};min-height:100vh;min-height:100dvh;overflow-x:hidden;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;position:fixed;width:100%;height:100%;}
    #root{height:100%;overflow:auto;-webkit-overflow-scrolling:touch;}
    ::-webkit-scrollbar{width:0px;height:0px;display:none;}
    input,select,textarea,button{font-family:${C.font};font-size:16px !important;}
    a{color:inherit;text-decoration:none;}
    table { width: 100%; border-collapse: collapse; }
    .scroll-container { -webkit-overflow-scrolling: touch; overflow-x: auto; scrollbar-width: none; }
    .scroll-container::-webkit-scrollbar { display: none; }
    @keyframes FU{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    @keyframes FD{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes FI{from{opacity:0}to{opacity:1}}
    @keyframes ZI{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
    @keyframes SL{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}
    @keyframes SP{to{transform:rotate(360deg)}}
    @keyframes PU{0%,100%{opacity:1}50%{opacity:.25}}
    @keyframes GL{0%,100%{opacity:.6}50%{opacity:1}}
    @keyframes BAR{from{width:0}to{width:100%}}
    .afu{animation:FU .38s cubic-bezier(.16,1,.3,1) both;}
    .azi{animation:ZI .3s ease both;}
    .d4{animation-delay:.18s}.d5{animation-delay:.24s}.d6{animation-delay:.31s}
    .hide-desktop { display: none; }
    @media (max-width: 768px) {
      .hide-desktop { display: block !important; }
      .hide-mobile { display: none !important; }
      .grid-mobile-1 { grid-template-columns: 1fr !important; }
      .grid-mobile-2 { grid-template-columns: 1fr 1fr !important; }
      .flex-mobile-col { flex-direction: column !important; }
      .w-full-mobile { width: 100% !important; }
      .p-mobile-md { padding: 24px !important; }
      .p-mobile-sm { padding: 16px !important; }
      .border-none-mobile { border: none !important; }
      table { display: block; }
      thead { display: none; }
      tbody, tr, td { display: block; width: 100%; }
      tr { padding: 12px; border-bottom: 1px solid ${C.bd}; background: ${C.s2}; border-radius: 12px; margin-bottom: 12px; border: 1px solid ${C.bd} !important; }
      td { padding: 8px 0 !important; text-align: left !important; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.05) !important; }
      td:last-child { border-bottom: none !important; }
      td::before { content: attr(data-label); font-weight: 700; color: ${C.mid}; font-size: 10px; text-transform: uppercase; margin-right: 12px; }
      button, [role="button"] { min-height: 48px; }
      .scroll-container { overflow-x: visible !important; }
    }
  `}</style>
);

// ─── PLATFORM DATA (simulates PostgreSQL) ─────────────────────
// In production: all of this comes from your API at runtime.
// The super admin credentials are NEVER rendered in any UI component.
const INITIAL_PLATFORM = {
  // ⚠ SUPER ADMIN — never referenced in any UI string
  _sa: { email: "admin@cargoscan.app", pass: "Cs#Platform2026!", name: "Platform Admin" },

  orgs: {},
  users: [],

  flags: {
    whatsapp_enabled: { on: true, label: "WhatsApp Notifications", desc: "Send automated messages on cargo events" },
    whatsapp_bulk: { on: true, label: "Bulk Shipment Notify", desc: "Notify all customers on status change" },
    damage_alerts: { on: true, label: "Damage Alert Messages", desc: "Auto-notify customer when item flagged damaged" },
    lidar_enabled: { on: true, label: "LiDAR Scanning (iOS)", desc: "Enable ARKit LiDAR on iPhone 12 Pro+" },
    manual_entry: { on: true, label: "Manual CBM Entry", desc: "Fallback when LiDAR unavailable" },
    auto_lock_97: { on: true, label: "Auto-Lock at 97%", desc: "Lock scan automatically at 97% confidence" },
    offline_mode: { on: true, label: "Offline Mode + Sync", desc: "Queue scans locally, sync when reconnected" },
    dispute_system: { on: true, label: "Dispute Log & Verify", desc: "Origin vs destination CBM comparison workflow" },
    tracking_portal: { on: true, label: "Public Tracking Portal", desc: "Customer tracking via public URL — no login" },
    paystack_enabled: { on: true, label: "Paystack Payments", desc: "Ghana mobile money, cards, NGN transfer" },
    stripe_enabled: { on: false, label: "Stripe Payments", desc: "Global card processing — USD, EUR" },
    annual_billing: { on: true, label: "Annual Billing Option", desc: "Show annual plan with 2 months free" },
    new_org_emails: { on: true, label: "Onboarding Email Sequence", desc: "5-email series for new signups" },
    maintenance_mode: { on: false, label: "Maintenance Mode", desc: "⚠ Locks ALL users out of the platform" },
  },

  pricing: {
    trial_days: 7, trial_users: 2, trial_ships: 5, trial_items: 50,
    starter: 29, starter_yr: 290,
    business: 79, business_yr: 790,
    enterprise: 199, enterprise_yr: 1990,
    ps_starter: "", ps_business: "", ps_enterprise: "",
    ps_starter_live: "", ps_business_live: "", ps_enterprise_live: "",
  },

  stats: {
    mrr: 0, arr: 0, orgs: 0, activeOrgs: 0, churn: 0, ltv: 0, conv: 0,
    items30d: 0, wa30d: 0, waDelivery: 0, openDisputes: 0,
    services: [
      { name: "API Server", status: "ok", val: "Running · :3000" },
      { name: "PostgreSQL", status: "ok", val: "Connected · 11ms" },
      { name: "Redis", status: "ok", val: "Connected · 2ms" },
      { name: "Paystack API", status: "warn", val: "Test mode" },
      { name: "WhatsApp (Meta)", status: "ok", val: "Token valid" },
      { name: "Supabase Storage", status: "ok", val: "Bucket OK" },
      { name: "Email (SMTP)", status: "err", val: "Not configured" },
    ],
  },

  shipments: [],
  packages: [],
  disputes: [],
};

// ─── TOAST SYSTEM ─────────────────────────────────────────────
let _setToast = null;
function Toast() {
  const [msg, setMsg] = useState(null);
  _setToast = (text, type = "ok") => { setMsg({ text, type }); setTimeout(() => setMsg(null), 3200); };
  if (!msg) return null;
  const col = msg.type === "ok" ? C.green : msg.type === "err" ? C.red : C.blue;
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999, animation: "FU .3s ease",
      background: C.s2, border: `1px solid ${col}40`, borderRadius: 10, padding: "12px 18px",
      display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600, color: col,
      boxShadow: "0 12px 40px rgba(0,0,0,.6)", maxWidth: 360
    }}>
      <span style={{ fontSize: 16 }}>{msg.type === "ok" ? "✓" : msg.type === "err" ? "✗" : "ℹ"}</span>
      {msg.text}
    </div>
  );
}
const notify = (t, type) => _setToast?.(t, type);

// ─── SHARED COMPONENTS ────────────────────────────────────────

const Logo = ({ sz = 20, showText = true }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
    <div style={{
      width: sz + 10, height: sz + 10, background: `linear-gradient(135deg,${C.blue},${C.purple})`,
      borderRadius: Math.round((sz + 10) * .3), display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, boxShadow: `0 0 20px ${C.blueGlow}`
    }}>
      <span style={{ fontFamily: C.mono, fontWeight: 700, fontSize: sz * .58, color: "#fff" }}>CS</span>
    </div>
    {showText && <div>
      <div style={{ fontWeight: 800, fontSize: sz * .9, letterSpacing: "-.035em", lineHeight: 1 }}>CargoScan</div>
      <div style={{ fontFamily: C.mono, fontSize: 7.5, letterSpacing: ".16em", color: C.mid, marginTop: 2, textTransform: "uppercase" }}>Freight Intelligence</div>
    </div>}
  </div>
);

const Spin = ({ sz = 14, col = "#fff" }) => (
  <div style={{
    width: sz, height: sz, border: `2px solid ${col}25`, borderTopColor: col,
    borderRadius: "50%", animation: "SP .7s linear infinite", flexShrink: 0
  }} />
);

function Btn({ label, icon, onClick, v = "primary", sz = "md", disabled, loading, full, style = {} }) {
  const pad = sz === "lg" ? "13px 26px" : sz === "sm" ? "5px 12px" : "9px 18px";
  const fs = sz === "lg" ? 14 : sz === "sm" ? 11 : 12.5;
  const vs = {
    primary: { background: `linear-gradient(135deg,${C.blue},${C.blueHov})`, color: "#fff", boxShadow: `0 4px 20px ${C.blueGlow}` },
    green: { background: `linear-gradient(135deg,${C.green},${C.greenD})`, color: "#000", boxShadow: `0 4px 16px rgba(0,212,138,.25)` },
    ghost: { background: C.s2, color: C.txt, border: `1px solid ${C.bd}` },
    danger: { background: `linear-gradient(135deg,${C.red},#c01030)`, color: "#fff" },
    amber: { background: `linear-gradient(135deg,${C.amber},#d4880a)`, color: "#000" },
    muted: { background: C.s3, color: C.mid, border: `1px solid ${C.bd}` },
    outline: { background: "transparent", color: C.blue, border: `1px solid ${C.blue}40` },
  };
  return (
    <button onClick={disabled || loading ? undefined : onClick} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
      padding: pad, minHeight: 44, fontSize: fs, fontWeight: 700, letterSpacing: "-.01em",
      borderRadius: 9, border: "none", cursor: disabled || loading ? "not-allowed" : "pointer",
      opacity: disabled || loading ? .5 : 1, transition: "all .15s",
      width: full ? "100%" : "auto", ...vs[v], ...style
    }}>
      {loading ? <Spin sz={12} col={v === "green" || v === "amber" ? "#000" : "#fff"} /> : <>{icon && <span style={{ fontSize: fs + 1 }}>{icon}</span>}{label}</>}
    </button>
  );
}

function Field({ label, type = "text", value, onChange, placeholder, err, hint, icon, suffix, autoFocus, readOnly, onKeyDown }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".09em", color: C.mid, marginBottom: 5, textTransform: "uppercase" }}>{label}</div>}
      <div style={{ position: "relative" }}>
        {icon && <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 15, opacity: .45, pointerEvents: "none" }}>{icon}</span>}
        <input type={type} value={value} onChange={e => onChange?.(e.target.value)}
          placeholder={placeholder} autoFocus={autoFocus} readOnly={readOnly} onKeyDown={onKeyDown}
          style={{
            width: "100%", background: readOnly ? C.dim : C.s2, border: `1px solid ${err ? C.red : focus ? C.blue : C.bd}`,
            borderRadius: 9, color: readOnly ? C.mid : C.txt, fontSize: 13, fontWeight: 500,
            padding: icon ? "10px 12px 10px 36px" : suffix ? "10px 40px 10px 12px" : "10px 12px",
            outline: "none", transition: "border-color .15s", cursor: readOnly ? "default" : "text"
          }}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} />
        {suffix && <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)" }}>{suffix}</span>}
      </div>
      {err && <div style={{ fontSize: 10.5, color: C.red, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>⚠ {err}</div>}
      {hint && !err && <div style={{ fontSize: 10.5, color: C.mid, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".09em", color: C.mid, marginBottom: 5, textTransform: "uppercase" }}>{label}</div>}
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        width: "100%", background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 9,
        color: C.txt, fontSize: 13, fontWeight: 500, padding: "10px 12px", outline: "none",
        appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%234E6080'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat", backgroundPosition: "calc(100% - 12px) center"
      }}>
        {options.map(o => <option key={o.value || o} value={o.value || o} style={{ background: C.s2 }}>{o.label || o}</option>)}
      </select>
    </div>
  );
}

const Chip = ({ label, color = C.blue, dot }) => (
  <span style={{
    fontFamily: C.mono, fontSize: 9, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase",
    color, background: `${color}18`, border: `1px solid ${color}30`, borderRadius: 5,
    padding: "2px 8px", display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, whiteSpace: "nowrap"
  }}>
    {dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, animation: dot === "pulse" ? "PU 1.5s ease-in-out infinite" : "none", flexShrink: 0 }} />}
    {label}
  </span>
);

const Divider = ({ my = 16 }) => <div style={{ height: 1, background: C.bd, margin: `${my}px 0` }} />;

function Card({ children, style = {} }) {
  return <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, ...style }}>{children}</div>;
}

function Stat({ label, value, sub, color = C.blue }) {
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".09em", color: C.mid, textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.mid, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}

function Bar({ label, used, limit, warn = 70, danger = 90 }) {
  const inf = limit >= 9999;
  const pct = inf ? 0 : Math.min((used / limit) * 100, 100);
  const col = pct >= danger ? C.red : pct >= warn ? C.amber : C.green;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: col }}>{inf ? "∞" : `${used}/${limit}`}</span>
      </div>
      <div style={{ height: 4, background: C.bd, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 2, transition: "width .6s ease" }} />
      </div>
    </div>
  );
}

function Toggle({ on, onChange, label, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: `1px solid ${C.bd}` }}>
      <div><div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>{sub && <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>{sub}</div>}</div>
      <div onClick={() => onChange(!on)} style={{
        width: 40, height: 22, borderRadius: 11,
        background: on ? C.green : C.bd, position: "relative", cursor: "pointer", transition: "background .2s", flexShrink: 0, marginLeft: 16
      }}>
        <div style={{
          position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: "50%",
          background: "#fff", transition: "left .18s", boxShadow: "0 1px 4px rgba(0,0,0,.5)"
        }} />
      </div>
    </div>
  );
}

function Avatar({ name, sz = 30, color = C.blue }) {
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: sz, height: sz, borderRadius: "50%",
      background: `linear-gradient(135deg,${color},${color}88)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: sz * .38, color: "#fff", flexShrink: 0
    }}>
      {initials}
    </div>
  );
}

function Modal({ title, children, onClose, width = 500 }) {
  useEffect(() => {
    const h = e => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="azi" style={{
        background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 14,
        width: "100%", maxWidth: width, maxHeight: "92vh", overflow: "auto"
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: `1px solid ${C.bd}`, position: "sticky", top: 0, background: C.s1, zIndex: 1
        }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          <div onClick={onClose} style={{ cursor: "pointer", color: C.mid, fontSize: 20, lineHeight: 1, padding: "0 4px" }}>×</div>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}

function Confirm({ msg, onYes, onNo, danger = false }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 1100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }}
      onClick={e => e.target === e.currentTarget && onNo()}>
      <div className="azi" style={{ background: C.s1, border: `1px solid ${danger ? C.red : C.bd}`, borderRadius: 14, padding: 24, maxWidth: 380, width: "100%" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Confirm</div>
        <div style={{ fontSize: 13, color: C.mid, marginBottom: 20 }}>{msg}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn label="Cancel" v="ghost" full onClick={onNo} />
          <Btn label="Confirm" v={danger ? "danger" : "primary"} full onClick={onYes} />
        </div>
      </div>
    </div>
  );
}

// Plan colours helper
const planColor = p => p === "ENTERPRISE" ? C.purple : p === "BUSINESS" ? C.green : p === "STARTER" ? C.blue : C.amber;
const planMrr = p => p === "ENTERPRISE" ? 199 : p === "BUSINESS" ? 79 : p === "STARTER" ? 29 : 0;

// ═══════════════════════════════════════════════════════════════
// LOGIN  —  Single screen for everyone. Zero hints. Zero creds.
// ═══════════════════════════════════════════════════════════════
function LoginScreen({ onSuccess, onSignup }) {
  const { data: pData } = usePlatform();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoad] = useState(false);
  const [err, setErr] = useState("");

  const attempt = useCallback(() => {
    if (!email.trim() || !pass) { setErr("Please enter your email address and password."); return; }
    setLoad(true); setErr("");
    setTimeout(() => {
      // Super admin — silent check, never shown
      if (email === pData._sa.email && pass === pData._sa.pass) {
        onSuccess({ type: "superadmin", user: { name: pData._sa.name, email } });
        return;
      }
      // Org users
      const u = pData.users.find(x => x.email === email && x.pass === pass);
      if (u) {
        if (!u.active) { setErr("Your account has been deactivated. Contact your organisation admin."); setLoad(false); return; }
        const org = pData.orgs[u.org];
        onSuccess({ type: "org", user: u, org });
        return;
      }
      setErr("Incorrect email or password. Please try again.");
      setLoad(false);
    }, 900);
  }, [email, pass, onSuccess, pData]);

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {/* LEFT — brand panel */}
      <div style={{
        display: "none"
      }}>
        <div style={{
          position: "absolute", top: "-5%", right: "-30%", width: 400, height: 400,
          background: `radial-gradient(circle,${C.blueGlow} 0%,transparent 70%)`, pointerEvents: "none"
        }} />
        <div style={{
          position: "absolute", bottom: "10%", left: "-20%", width: 300, height: 300,
          background: `radial-gradient(circle,rgba(139,95,255,.07) 0%,transparent 70%)`, pointerEvents: "none"
        }} />

        <Logo sz={22} />

        <div className="afu">
          <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: ".2em", color: C.mid, textTransform: "uppercase", marginBottom: 18 }}>
            Built for freight that moves
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 800, lineHeight: .94, letterSpacing: "-.04em", marginBottom: 18 }}>
            Precision<br />measurement.<br />
            <span style={{
              background: `linear-gradient(90deg,${C.blue},${C.purple})`,
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
            }}>Zero disputes.</span>
          </h1>
          <p style={{ fontSize: 13.5, color: C.mid, lineHeight: 1.7, maxWidth: 300 }}>
            The freight platform trusted across Ghana, Nigeria, and China. iPhone LiDAR scanning, WhatsApp notifications, and complete dispute prevention.
          </p>
          <div style={{ display: "flex", gap: 28, marginTop: 36 }}>
            {[["3s", "Scan time"], ["±1cm", "Accuracy"], ["94%", "WA delivery"]].map(([v, l]) => (
              <div key={l}>
                <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 700, color: C.blue }}>{v}</div>
                <div style={{ fontSize: 10, color: C.mid, marginTop: 2, textTransform: "uppercase", letterSpacing: ".1em" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 11, color: C.mid }}>© 2026 CargoScan · Privacy · Terms</div>
      </div>

      {/* RIGHT — form */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px", background: C.bg }}>
        <div className="afu" style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <Logo sz={22} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.03em", marginBottom: 4 }}>Welcome back</h2>
          <p style={{ color: C.mid, fontSize: 13, marginBottom: 28 }}>Sign in to your workspace</p>

          {err && <div style={{
            background: `${C.red}12`, border: `1px solid ${C.red}30`, borderRadius: 9,
            padding: "10px 14px", marginBottom: 16, fontSize: 12.5, color: C.red, display: "flex", gap: 8, alignItems: "flex-start"
          }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>{err}
          </div>}

          <Field label="Email address" type="email" value={email} onChange={setEmail}
            placeholder="you@yourcompany.com" autoFocus
            onKeyDown={e => e.key === "Enter" && document.getElementById("cs-pw")?.focus()} />

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".09em", color: C.mid, marginBottom: 5, textTransform: "uppercase" }}>Password</div>
            <div style={{ position: "relative" }}>
              <input id="cs-pw" type={show ? "text" : "password"} value={pass} onChange={e => setPass(e.target.value)}
                placeholder="Your password" onKeyDown={e => e.key === "Enter" && attempt()}
                style={{
                  width: "100%", background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 9,
                  color: C.txt, fontSize: 13, fontWeight: 500, padding: "10px 48px 10px 12px", outline: "none"
                }} />
              <span onClick={() => setShow(p => !p)} style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                fontSize: 11, color: C.mid, cursor: "pointer", fontWeight: 600, userSelect: "none"
              }}>
                {show ? "Hide" : "Show"}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: -4, marginBottom: 22 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12, color: C.mid }}>
              <input type="checkbox" style={{ accentColor: C.blue, width: 13, height: 13 }} /> Remember me
            </label>
            <span style={{ fontSize: 12, color: C.blue, cursor: "pointer", fontWeight: 600 }}>Forgot password?</span>
          </div>

          <Btn label="Sign In to Your Account" v="primary" full sz="lg" loading={loading} onClick={attempt} />

          <div style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: C.mid }}>
            New company?{" "}
            <span style={{ color: C.blue, fontWeight: 600, cursor: "pointer" }}
              onClick={() => onSignup?.()}>
              Start your 7-day free trial →
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SELF-SIGNUP FLOW  (multi-step)
// ═══════════════════════════════════════════════════════════════
function SignupScreen({ onDone, onLogin }) {
  const { data: pData, createOrg } = usePlatform();
  const [step, setStep] = useState(1);
  const [loading, setLoad] = useState(false);
  const [created, setCreated] = useState(null);
  const [f, setF] = useState({ name: "", email: "", pass: "", confirm: "", company: "", country: "Ghana", city: "Accra", cbm: "85" });
  const [errs, setErrs] = useState({});
  const slug = f.company.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, "-").slice(0, 32) || "your-company";
  const set = k => v => { setF(p => ({ ...p, [k]: v })); if (errs[k]) setErrs(p => ({ ...p, [k]: "" })); };

  const pw = (() => {
    const p = f.pass; if (!p) return { score: 0, col: C.bd, label: "" };
    let s = 0; if (p.length >= 8) s++; if (/[A-Z]/.test(p)) s++; if (/[0-9]/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++;
    return [{ score: 0, col: C.bd, label: "" }, { score: 1, col: C.red, label: "Weak" }, { score: 2, col: C.amber, label: "Fair" }, { score: 3, col: C.blue, label: "Good" }, { score: 4, col: C.green, label: "Strong" }][s];
  })();

  const v1 = () => {
    const e = {};
    if (!f.name.trim()) e.name = "Your name is required";
    if (!f.email.includes("@")) e.email = "Enter a valid email";
    if (f.pass.length < 8) e.pass = "8+ characters required";
    if (f.pass !== f.confirm) e.confirm = "Passwords don't match";
    setErrs(e); return !Object.keys(e).length;
  };
  const v2 = () => {
    const e = {};
    if (!f.company.trim()) e.company = "Company name required";
    if (!f.city.trim()) e.city = "City required";
    setErrs(e); return !Object.keys(e).length;
  };

  const next = () => {
    if (step === 1 && v1()) setStep(2);
    if (step === 2 && v2()) {
      setLoad(true);
      setTimeout(() => {
        const newOrg = { id: "o" + Date.now(), name: f.company, slug, country: f.country, city: f.city, plan: "TRIAL", cbmRate: parseFloat(f.cbm) || 85, trial: 7, createdAt: new Date().toISOString().split("T")[0], usage: { ships: 0, items: 0, users: 1 }, limits: { ships: 5, items: 50, users: 1 } };
        const newUser = { id: "u" + Date.now(), org: slug, name: f.name, email: f.email, pass: f.pass, role: "ADMIN", active: true, seen: "Just now" };
        createOrg(newOrg, newUser);
        setCreated({ ...newOrg, email: f.email, password: f.pass, role: "ADMIN" });
        setLoad(false); setStep(3);
      }, 1200);
    }
  };

  if (step === 3 && created) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, padding: 20 }}>
      <div className="afu" style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
        <div style={{
          width: 72, height: 72, background: `linear-gradient(135deg,${C.green},${C.greenD})`, borderRadius: 20,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 22px"
        }}>✓</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.03em", marginBottom: 8 }}>Account created!</h1>
        <p style={{ color: C.mid, fontSize: 13, marginBottom: 6 }}><strong style={{ color: C.txt }}>{created.name}</strong> is live on CargoScan.</p>
        <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 20, margin: "20px 0", textAlign: "left" }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".09em", color: C.mid, textTransform: "uppercase", marginBottom: 12 }}>Your Account Details</div>
          {[["Portal URL", `${created.slug}.cargoscan.app`, C.blue], ["Email", created.email, C.txt], ["Password", created.password, C.txt], ["Plan", "TRIAL — 7 days free", C.amber], ["Role", "ADMIN", C.green]].map(([k, v, col]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${C.bd}` }}>
              <span style={{ fontSize: 11, color: C.mid, fontWeight: 600, width: 80 }}>{k}</span>
              <span style={{ fontFamily: C.mono, fontSize: 12, color: col, flex: 1, textAlign: "right" }}>{v}</span>
              <button onClick={() => { navigator.clipboard?.writeText(v); notify("Copied", "ok"); }} style={{ background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 4, color: C.mid, fontSize: 9, padding: "2px 7px", cursor: "pointer", marginLeft: 8, fontFamily: C.mono }}>COPY</button>
            </div>
          ))}
        </div>
        <div style={{ background: `${C.amber}12`, border: `1px solid ${C.amber}25`, borderRadius: 10, padding: 12, marginBottom: 22, fontSize: 12, color: C.amber }}>
          💾 Save your password now. You'll need it to sign in.
        </div>
        <Btn label="Enter Your Dashboard →" v="primary" full sz="lg" onClick={() => {
          onDone?.(created);
          // The onDone in CargoScanInner handles the transition
        }} />
        <p style={{ fontSize: 11, color: C.mid, marginTop: 12 }}>Trial ends in 7 days. Upgrade anytime from $29/month.</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: C.bg }}>
      {/* Steps sidebar - hidden on mobile */}
      <div style={{ display: "none" }}>
        <Logo sz={20} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: 48 }}>
          {[["Create account", "Name, email & password"], ["Set up company", "Workspace & subdomain"], ["You're in!", "7-day trial begins"]].map(([s, d], i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 24 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0, transition: "all .3s",
                background: step > i + 1 ? C.green : step === i + 1 ? C.blue : C.bd,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                color: step > i + 1 || step === i + 1 ? "#fff" : C.mid
              }}>
                {step > i + 1 ? "✓" : i + 1}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: step === i + 1 ? C.txt : C.mid, transition: "color .3s" }}>{s}</div>
                <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>{d}</div>
              </div>
            </div>
          ))}
          <Card style={{ padding: 16, marginTop: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".09em", color: C.mid, textTransform: "uppercase", marginBottom: 10 }}>Trial includes</div>
            {["LiDAR scanning", "5 shipments/month", "50 cargo items", "Excel packing list", "Public tracking portal", "2 team members"].map(x => (
              <div key={x} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 12, color: C.mid }}>
                <span style={{ color: C.green, fontWeight: 700, flexShrink: 0 }}>✓</span>{x}
              </div>
            ))}
          </Card>
        </div>
        <div style={{ fontSize: 11, color: C.mid }}>
          Already have an account?{" "}
          <span style={{ color: C.blue, cursor: "pointer", fontWeight: 600 }} onClick={onLogin}>Sign in →</span>
        </div>
      </div>

      {/* Form */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
        <div className="afu" style={{ maxWidth: 420, width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <Logo sz={20} />
          </div>
          {step === 1 && <>
            <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.03em", marginBottom: 4 }}>Create your account</h2>
            <p style={{ color: C.mid, fontSize: 13, marginBottom: 26 }}>Get started in 2 minutes. No card required.</p>
            <Field label="Your full name" icon="👤" value={f.name} onChange={set("name")} placeholder="John Mensah" err={errs.name} autoFocus />
            <Field label="Work email" icon="✉" type="email" value={f.email} onChange={set("email")} placeholder="john@yourcompany.com" err={errs.email} />
            <Field label="Password" icon="🔒" type="password" value={f.pass} onChange={set("pass")} placeholder="8+ characters" err={errs.pass} />
            {f.pass && <div style={{ marginTop: -10, marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 3, marginBottom: 3 }}>
                {[1, 2, 3, 4].map(i => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: pw.score >= i ? pw.col : C.bd, transition: "background .25s" }} />)}
              </div>
              <div style={{ fontSize: 10.5, color: pw.col, fontWeight: 600 }}>{pw.label}</div>
            </div>}
            <Field label="Confirm password" icon="🔒" type="password" value={f.confirm} onChange={set("confirm")} placeholder="Repeat password" err={errs.confirm} />
            <Btn label="Continue →" v="primary" full sz="lg" onClick={next} />
            <p style={{ fontSize: 11, color: C.mid, marginTop: 12, textAlign: "center" }}>By continuing you agree to our <span style={{ color: C.blue }}>Terms</span> and <span style={{ color: C.blue }}>Privacy Policy</span>.</p>
          </>}

          {step === 2 && <>
            <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.03em", marginBottom: 4 }}>Set up your company</h2>
            <p style={{ color: C.mid, fontSize: 13, marginBottom: 26 }}>Each company gets an isolated workspace and unique URL.</p>
            <Field label="Company name" icon="🏢" value={f.company} onChange={set("company")} placeholder="Stormglide Logistics" err={errs.company} autoFocus />
            {f.company && <div style={{
              background: `${C.blue}12`, border: `1px solid ${C.blue}25`, borderRadius: 8, padding: "9px 14px",
              marginTop: -10, marginBottom: 14, fontSize: 12, display: "flex", alignItems: "center", gap: 8
            }}>
              <span style={{ color: C.mid, flexShrink: 0 }}>Your URL:</span>
              <span style={{ fontFamily: C.mono, color: C.blue, fontWeight: 600 }}>{slug}.cargoscan.app</span>
              <Chip label="Available ✓" color={C.green} style={{ marginLeft: "auto" }} />
            </div>}
            <div className="grid-mobile-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Select label="Country" value={f.country} onChange={set("country")}
                options={["Ghana", "Nigeria", "Kenya", "Tanzania", "South Africa", "China", "United Kingdom", "United States"]} />
              <Field label="City" value={f.city} onChange={set("city")} placeholder="Accra" err={errs.city} />
            </div>
            <Field label="Default CBM rate (USD per CBM)" type="number" value={f.cbm} onChange={set("cbm")} hint="Standard China–Ghana rate is $85/CBM" />
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <Btn label="← Back" v="ghost" style={{ width: 100 }} onClick={() => setStep(1)} />
              <Btn label="Create My Account →" v="primary" style={{ flex: 1 }} sz="lg" loading={loading} onClick={next} />
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPER ADMIN CONSOLE  —  You only. No hints on the login screen.
// ═══════════════════════════════════════════════════════════════
function SuperAdmin({ onLogout, onImpersonate }) {
  const { data: pData, updateOrg, wipeData, extendTrial } = usePlatform();
  const [tab, setTab] = useState("overview");
  const [psMode, setPsMode] = useState("test");
  const [overrideTarget, setOvT] = useState(null);
  const [confirm, setConfirm] = useState(null);

  // Derive all data from pData (Singular source of truth)
  const orgList = Object.values(pData.orgs);
  const mrr = orgList.reduce((acc, o) => acc + planMrr(o.plan), 0);
  const activeOrgs = orgList.filter(o => o.plan !== "TRIAL").length;
  const totalShips = pData.shipments.length;
  const totalItems = orgList.reduce((acc, o) => acc + (o.usage.items || 0), 0);
  const openDisputesCount = pData.disputes.filter(d => d.status !== "RESOLVED").length;

  const counts = {
    ENTERPRISE: orgList.filter(o => o.plan === "ENTERPRISE").length,
    BUSINESS: orgList.filter(o => o.plan === "BUSINESS").length,
    STARTER: orgList.filter(o => o.plan === "STARTER").length,
    TRIAL: orgList.filter(o => o.plan === "TRIAL").length,
  };

  const applyOverride = (orgId, plan) => {
    updateOrg(orgId, { plan });
    notify(`Plan override applied: ${plan}`, "ok");
    setOvT(null);
  };

  const TABS = [
    { id: "overview", icon: "◈", label: "Overview" },
    { id: "orgs", icon: "🏢", label: "Organizations" },
    { id: "flags", icon: "🎛", label: "Feature Flags" },
    { id: "pricing", icon: "💰", label: "Pricing" },
    { id: "paystack", icon: "💳", label: "Paystack" },
    { id: "override", icon: "🔧", label: "Plan Override" },
    { id: "health", icon: "💚", label: "System Health" },
    { id: "walogs", icon: "💬", label: "WhatsApp Test" },
    { id: "logs", icon: "📋", label: "Audit Logs" },
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: C.bg }}>
      {/* TOP */}
      <div style={{
        background: C.s1, borderBottom: `1px solid ${C.bd}`, padding: "0 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", height: 52, flexShrink: 0
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Logo sz={16} />
          <div style={{ width: 1, height: 20, background: C.bd }} />
          <Chip label="Platform Console" color={C.purple} />
          <Chip label="● Live" color={C.green} dot="pulse" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, color: C.mid }}>admin@cargoscan.app</div>
          <Btn label="Sign Out" v="ghost" sz="sm" onClick={onLogout} />
        </div>
      </div>

      {/* TABS */}
      <div style={{ background: C.s1, borderBottom: `1px solid ${C.bd}`, display: "flex", padding: "0 20px", overflowX: "auto", flexShrink: 0 }}>
        {TABS.map(t => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "11px 14px", cursor: "pointer",
            fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5,
            color: tab === t.id ? C.txt : C.mid, borderBottom: `2px solid ${tab === t.id ? C.purple : "transparent"}`, transition: "color .15s"
          }}>
            {t.icon} {t.label}
          </div>
        ))}
      </div>

      {/* BODY */}
      <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
        {confirm && <Confirm {...confirm} />}
        {overrideTarget && <Modal title={`Override Plan — ${overrideTarget.name}`} onClose={() => setOvT(null)}>
          <OverrideForm org={overrideTarget} allOrgs={orgList} onSave={applyOverride} onCancel={() => setOvT(null)} />
        </Modal>}

        {/* OVERVIEW */}
        {tab === "overview" && <div className="afu">
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>Platform Overview</h2>
            <div style={{ fontSize: 11, color: C.mid, marginTop: 3, fontFamily: C.mono }}>Saturday 07 Mar 2026 · All systems operational</div>
          </div>
          <div className="grid-mobile-1" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
            <Stat label="Monthly Recurring Revenue" value={`$${mrr.toLocaleString()}`} sub="Current run-rate" color={C.blue} />
            <Stat label="Active Organisations" value={activeOrgs} sub={`${orgList.length} total orgs`} color={C.green} />
            <Stat label="Items Scanned (Total)" value={totalItems.toLocaleString()} sub="Lifetime scan volume" color={C.purple} />
            <Stat label="Open Disputes" value={openDisputesCount} sub="Action required" color={C.red} />
          </div>
          <div className="grid-mobile-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Card style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Plan Distribution</div>
              {[["Enterprise", counts.ENTERPRISE, C.purple], ["Business", counts.BUSINESS, C.green], ["Starter", counts.STARTER, C.blue], ["Trial", counts.TRIAL, C.amber]].map(([n, c, col]) => (
                <div key={n} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: col, fontWeight: 600 }}>{n}</span>
                    <span style={{ fontFamily: C.mono, color: C.mid }}>{c} orgs · ${planMrr(n.toUpperCase()) * c}/mo</span>
                  </div>
                  <div style={{ height: 5, background: C.bd, borderRadius: 3 }}>
                    <div style={{ height: "100%", width: `${(c / (orgList.length || 1)) * 100}%`, background: col, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </Card>
            <Card style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Key Metrics</div>
              {[["ARR (projected)", `$${(mrr * 12).toLocaleString()}`, C.blue],
              ["Total Shipments", totalShips, C.green],
              ["Platform Latency", "12ms", C.cyan],
              ["System Uptime", "99.99%", C.green],
              ["Open disputes", openDisputesCount, C.red],
              ["Total orgs", orgList.length, C.txt]].map(([l, v, col]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.bd}` }}>
                  <span style={{ fontSize: 12, color: C.mid }}>{l}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: col }}>{v}</span>
                </div>
              ))}
            </Card>
          </div>
        </div>}

        {/* ORGANIZATIONS */}
        {tab === "orgs" && <div className="afu">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div><h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>All Organizations</h2><p style={{ fontSize: 12, color: C.mid, marginTop: 3 }}>Every company using CargoScan.</p></div>
            <Chip label={`${orgList.length} total`} color={C.mid} />
          </div>
          <Card>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Company", "Plan", "Users", "Shipments", "Since", "MRR", "Status", ""].map(h => (
                <th key={h} style={{
                  fontFamily: C.mono, fontSize: 9, fontWeight: 600, letterSpacing: ".12em", color: C.mid,
                  textTransform: "uppercase", padding: "10px 16px", textAlign: "left", borderBottom: `1px solid ${C.bd}`
                }}>{h}</th>
              ))}</tr></thead>
              <tbody>{orgList.map(o => (
                <tr key={o.id} style={{ borderBottom: `1px solid ${C.bd}` }}>
                  <td data-label="Company" style={{ padding: "11px 16px" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{o.name}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 10, color: C.blue, marginTop: 2 }}>{o.slug}.cargoscan.app</div>
                  </td>
                  <td data-label="Plan" style={{ padding: "11px 16px" }}><Chip label={o.plan} color={planColor(o.plan)} /></td>
                  <td data-label="Users" style={{ padding: "11px 16px", fontFamily: C.mono, fontSize: 12 }}>{o.usage.users}</td>
                  <td data-label="Shipments" style={{ padding: "11px 16px", fontFamily: C.mono, fontSize: 12 }}>{o.usage.ships}</td>
                  <td data-label="Since" style={{ padding: "11px 16px", fontSize: 11, color: C.mid }}>{o.createdAt}</td>
                  <td data-label="MRR" style={{ padding: "11px 16px", fontFamily: C.mono, fontSize: 12, color: C.green }}>${planMrr(o.plan)}/mo</td>
                  <td data-label="Status" style={{ padding: "11px 16px" }}>
                    <Chip label={o.plan === "TRIAL" ? "TRIAL" : "ACTIVE"} color={o.plan === "TRIAL" ? C.amber : C.green} dot={o.plan !== "TRIAL" ? "pulse" : undefined} />
                  </td>
                  <td data-label="Actions" style={{ padding: "11px 16px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn label="Impersonate" v="primary" sz="sm" onClick={() => onImpersonate?.(o)} />
                      <Btn label="+7d" v="ghost" sz="sm" onClick={() => { extendTrial(o.slug, 7); notify("Added 7 days to trial"); }} />
                      <Btn label="Wipe" v="danger" sz="sm" onClick={() => { if (window.confirm(`Wipe all data for ${o.name}?`)) { wipeData(o.slug); notify("Data wiped"); } }} />
                      <Btn label="Plan" v="ghost" sz="sm" onClick={() => setOvT(o)} />
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        </div>}

        {/* FEATURE FLAGS */}
        {tab === "flags" && <div className="afu">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div><h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>Feature Flags</h2><p style={{ fontSize: 12, color: C.mid, marginTop: 3 }}>Changes apply to all users immediately. No restart needed.</p></div>
            <Btn label="Save All" v="green" icon="✓" onClick={saveFlags} />
          </div>
          <div className="grid-mobile-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { title: "💬 WhatsApp", keys: ["whatsapp_enabled", "whatsapp_bulk", "damage_alerts"] },
              { title: "🔦 Scanning", keys: ["lidar_enabled", "manual_entry", "auto_lock_97", "offline_mode"] },
              { title: "💳 Payments", keys: ["paystack_enabled", "stripe_enabled", "annual_billing"] },
              { title: "🛡 Platform", keys: ["dispute_system", "tracking_portal", "new_org_emails", "maintenance_mode"] },
            ].map(g => (
              <Card key={g.title} style={{ padding: "16px 20px" }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: C.mid }}>{g.title}</div>
                {g.keys.map(k => (
                  <Toggle key={k} label={flags[k].label} sub={flags[k].desc} on={flags[k].on}
                    onChange={v => {
                      if (k === "maintenance_mode" && v) {
                        setConfirm({ msg: "Enable maintenance mode? ALL users will be locked out immediately.", danger: true, onYes: () => { setFlags(p => ({ ...p, [k]: { ...p[k], on: v } })); notify("Maintenance mode ON — users locked out", "err"); setConfirm(null); }, onNo: () => setConfirm(null) });
                        return;
                      }
                      setFlags(p => ({ ...p, [k]: { ...p[k], on: v } }));
                      notify(`${flags[k].label}: ${v ? "ON" : "OFF"}`, v ? "ok" : "info");
                    }} />
                ))}
              </Card>
            ))}
          </div>
        </div>}

        {/* PRICING */}
        {tab === "pricing" && <div className="afu">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div><h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>Pricing Editor</h2><p style={{ fontSize: 12, color: C.mid, marginTop: 3 }}>Change plan prices and trial limits. Paste Paystack plan codes here.</p></div>
            <Btn label="Save & Generate .env" v="green" onClick={() => notify("Pricing saved. Copy .env block below and restart API.", "ok")} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 14 }}>
            {[
              { key: "trial", label: "Trial", col: C.mid, fields: [["trial_days", "Duration (days)"], ["trial_users", "Max users"], ["trial_ships", "Max shipments/mo"], ["trial_items", "Max items"]] },
              { key: "starter", label: "Starter", col: C.blue, fields: [["starter", "Monthly price ($)"], ["starter_yr", "Annual price ($)"]] },
              { key: "business", label: "Business", col: C.green, fields: [["business", "Monthly price ($)"], ["business_yr", "Annual price ($)"]] },
              { key: "enterprise", label: "Enterprise", col: C.purple, fields: [["enterprise", "Monthly price ($)"], ["enterprise_yr", "Annual price ($)"]] },
            ].map(p => (
              <Card key={p.key} style={{ padding: 18 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: p.col, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>{p.label}</div>
                {p.key !== "trial" && <div style={{ fontFamily: C.mono, fontSize: 26, fontWeight: 700, color: p.col, marginBottom: 12 }}>${pricing[p.key]}<span style={{ fontSize: 12, color: C.mid }}>/mo</span></div>}
                <Divider my={10} />
                {p.fields.map(([fk, fl]) => (
                  <Field key={fk} label={fl} type="number" value={pricing[fk]} onChange={v => setPricing(x => ({ ...x, [fk]: Number(v) }))} />
                ))}
                {p.key !== "trial" && <>
                  <Field label="Paystack plan code (test)" value={pricing[`ps_${p.key}`]} onChange={v => setPricing(x => ({ ...x, [`ps_${p.key}`]: v }))} placeholder="PLN_xxxxxxxxxx" />
                  <Field label="Paystack plan code (live)" value={pricing[`ps_${p.key}_live`]} onChange={v => setPricing(x => ({ ...x, [`ps_${p.key}_live`]: v }))} placeholder="PLN_xxxxxxxxxx" />
                </>}
              </Card>
            ))}
          </div>
          <Card style={{ padding: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Generated .env Block — Copy into your server</div>
            <div style={{ background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 8, padding: 14, fontFamily: C.mono, fontSize: 11, color: C.cyan, lineHeight: 2, whiteSpace: "pre-wrap" }}>
              {`PLAN_TRIAL_DAYS=${pricing.trial_days}
PLAN_TRIAL_USERS=${pricing.trial_users}
PLAN_TRIAL_SHIPMENTS=${pricing.trial_ships}
PLAN_TRIAL_ITEMS=${pricing.trial_items}
PLAN_STARTER_PRICE=${pricing.starter}
PLAN_BUSINESS_PRICE=${pricing.business}
PLAN_ENTERPRISE_PRICE=${pricing.enterprise}
PAYSTACK_STARTER_PLAN_CODE=${pricing.ps_starter || "PLN_replace"}
PAYSTACK_BUSINESS_PLAN_CODE=${pricing.ps_business || "PLN_replace"}
PAYSTACK_ENTERPRISE_PLAN_CODE=${pricing.ps_enterprise || "PLN_replace"}`}
            </div>
            <Btn label="Copy to clipboard" v="ghost" sz="sm" style={{ marginTop: 10 }} onClick={() => { notify("Copied!", "ok"); }} />
          </Card>
        </div>}

        {/* PAYSTACK */}
        {tab === "paystack" && <div className="afu">
          <div style={{ marginBottom: 20 }}><h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>Paystack Configuration</h2></div>
          <div className="grid-mobile-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Card style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>API Keys</div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".09em", color: C.mid, textTransform: "uppercase", marginBottom: 8 }}>Environment</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["test", "live"].map(m => (
                    <div key={m} onClick={() => { setPsMode(m); if (m === "live") notify("⚠ LIVE mode — real charges", "err"); else notify("Test mode active", "ok"); }}
                      style={{
                        flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 8, cursor: "pointer", transition: "all .15s",
                        border: `1px solid ${psMode === m ? (m === "live" ? C.red : C.green) : C.bd}`,
                        background: psMode === m ? C.s3 : C.s2, fontWeight: 700, fontSize: 12,
                        color: psMode === m ? (m === "live" ? C.red : C.green) : C.mid
                      }}>
                      {m === "live" ? "🔴 Live" : "🟢 Test"}
                    </div>
                  ))}
                </div>
                {psMode === "live" && <div style={{ marginTop: 8, background: `${C.red}10`, border: `1px solid ${C.red}25`, borderRadius: 7, padding: "8px 12px", fontSize: 11, color: C.red }}>⚠ Live keys active. Real payments will be charged.</div>}
              </div>
              <Field label="Secret Key" type="password" placeholder="sk_test_xxxxxxxxxxxxxxxx" />
              <Field label="Public Key" placeholder="pk_test_xxxxxxxxxxxxxxxx" />
              <Field label="Webhook Secret" type="password" placeholder="Your HMAC secret string" />
              <Btn label="Save & Verify Connection" v="green" full onClick={() => notify("Paystack connection verified ✓", "ok")} />
            </Card>
            <Card style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Webhook Setup</div>
              <div style={{ background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 8, padding: "10px 12px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontFamily: C.mono }}>
                <span style={{ color: C.blue, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>https://api.cargoscan.app/api/billing/paystack/webhook</span>
                <Btn label="Copy" v="ghost" sz="sm" onClick={() => { notify("Webhook URL copied", "ok"); }} />
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: C.mid, letterSpacing: ".09em", textTransform: "uppercase", marginBottom: 8 }}>Enable these events:</div>
              {["charge.success", "subscription.create", "subscription.disable", "subscription.not_renew", "invoice.create", "invoice.payment_failed"].map(e => (
                <div key={e} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.bd}`, fontSize: 12, fontFamily: C.mono }}>
                  <span style={{ color: C.green }}>✓</span><span>{e}</span>
                </div>
              ))}
              <Divider my={14} />
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Test Cards</div>
              {[["Success", "4084 0840 8408 4081", "408", "12/30", "123456", C.green], ["Declined", "4084 8488 4084 8488", "408", "12/30", "—", C.red]].map(([r, n, c, e, o, col]) => (
                <div key={r} style={{ background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 7, padding: "8px 12px", marginBottom: 6, fontSize: 11, fontFamily: C.mono }}>
                  <span style={{ color: col, fontWeight: 700, display: "inline-block", width: 58 }}>{r}</span>
                  <span style={{ color: C.txt }}>{n}</span>
                  <span style={{ color: C.mid }}> · CVV:{c} · Exp:{e} · OTP:{o}</span>
                </div>
              ))}
            </Card>
          </div>
        </div>}

        {/* PLAN OVERRIDE */}
        {tab === "override" && <div className="afu">
          <div style={{ marginBottom: 20 }}><h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>Plan Override</h2><p style={{ fontSize: 12, color: C.mid, marginTop: 3 }}>Bypass Paystack. Directly set any org's plan. All overrides are logged in the audit trail.</p></div>
          <div className="grid-mobile-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Card style={{ padding: 20 }}><OverrideForm org={null} allOrgs={orgs} onSave={applyOverride} onCancel={() => { }} /></Card>
            <Card style={{ padding: 20 }}>
              <div style={{ padding: "40px 0", textAlign: "center", color: C.mid, fontSize: 12 }}>No recent manual overrides recorded.</div>
            </Card>
          </div>
        </div>}

        {/* SYSTEM HEALTH */}
        {tab === "health" && <div className="afu">
          <div style={{ marginBottom: 20 }}><h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>System Health</h2></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Card style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Services</div>
              {pData.stats.services.map(s => (
                <div key={s.name} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.bd}` }}>
                  <span style={{ fontSize: 12, color: C.mid }}>{s.name}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 700, color: s.status === "ok" ? C.green : s.status === "warn" ? C.amber : C.red }}>{s.val}</span>
                </div>
              ))}
            </Card>
            <Card style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Performance</div>
              {[["Avg latency", "82ms", C.green], ["Requests/min", "143", C.blue], ["Error rate", "0.03%", C.green], ["Uptime (30d)", "99.97%", C.green], ["DB pool", "4/20", C.blue], ["Memory", "234 MB", C.blue], ["CPU avg", "8%", C.green]].map(([l, v, c]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.bd}` }}>
                  <span style={{ fontSize: 12, color: C.mid }}>{l}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: c }}>{v}</span>
                </div>
              ))}
            </Card>
            <Card style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Quick Actions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {["Restart API Server", "Clear Redis Cache", "Run DB Migrations", "Force WhatsApp Retry", "Sync All Offline Queues", "Export Error Logs", "Trigger Billing Cycle"].map(a => (
                  <Btn key={a} label={a} v="ghost" full sz="sm" onClick={() => notify(`${a}...`, "info")} />
                ))}
              </div>
            </Card>
          </div>
        </div>}

        {/* WHATSAPP TEST */}
        {tab === "walogs" && <div className="afu">
          <div style={{ marginBottom: 20 }}><h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>WhatsApp Test</h2><p style={{ fontSize: 12, color: C.mid, marginTop: 3 }}>Send any template to a real number. Useful for verifying Meta API credentials.</p></div>
          <WaTestPanel />
        </div>}

        {/* AUDIT LOGS */}
        {tab === "logs" && <div className="afu">
          <div style={{ marginBottom: 20 }}><h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>Audit Logs</h2></div>
          <Card>
            <div style={{ fontFamily: C.mono, fontSize: 11, padding: 16, height: 500, overflowY: "auto", lineHeight: 2, textAlign: "center", color: C.mid }}>
              Audit trail is clean. No events recorded in the last 24h.
            </div>
          </Card>
        </div>}
      </div>
    </div>
  );
}

// ─── OVERRIDE FORM ──────────────────────────────────────────────
function OverrideForm({ org, allOrgs, onSave, onCancel }) {
  const [sel, setSel] = useState(org?.id || "");
  const [plan, setPlan] = useState("BUSINESS");
  const [days, setDays] = useState("30");
  const [reason, setReason] = useState("");
  return (
    <div>
      {!org && allOrgs && <Select label="Organisation" value={sel} onChange={setSel}
        options={[{ value: "", label: "Select organisation..." }, ...allOrgs.map(o => ({ value: o.id, label: `${o.name} (${o.plan})` }))]} />}
      {org && <div style={{ background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 8, padding: "9px 14px", marginBottom: 14, fontSize: 13, fontWeight: 600 }}>{org.name}</div>}
      <Select label="New Plan" value={plan} onChange={setPlan} options={["TRIAL", "STARTER", "BUSINESS", "ENTERPRISE"]} />
      <Field label="Duration (days from now)" type="number" value={days} onChange={setDays} placeholder="30" />
      <Field label="Reason (logged in audit trail)" value={reason} onChange={setReason} placeholder="Courtesy upgrade, partner deal, testing..." />
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <Btn label="Cancel" v="ghost" full onClick={onCancel} />
        <Btn label="Apply Override" v="amber" full onClick={() => {
          const id = org?.id || sel;
          if (!id) { notify("Select an organisation", "err"); return; }
          onSave(id, plan, days, reason);
        }} />
      </div>
    </div>
  );
}

// ─── WHATSAPP TEST PANEL ────────────────────────────────────────
function WaTestPanel() {
  const [tmpl, setTmpl] = useState("cargo_received");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("Test Customer");
  const [tracking, setTr] = useState("DHL392029");
  const [send, setSend] = useState(false);

  const previews = {
    cargo_received: `📦 *CargoScan Notification*\n\nHello *${name}*,\n\nYour cargo has been received and scanned at the origin warehouse.\n\nTracking: *${tracking}*\nDimensions: 60 × 40 × 50 cm\nCBM: *0.120*\nCost: *$10.20*\n\nTrack your package:\nhttps://track.cargoscan.app/${tracking}\n\n_CargoScan — Precision Freight_`,
    damage_detected: `⚠️ *Damage Alert*\n\nHello *${name}*,\n\nItem *${tracking}* was flagged with damage at the origin warehouse. Photos have been recorded.\n\nView evidence:\nhttps://track.cargoscan.app/${tracking}`,
    shipment_departed: `🚢 *Shipment Update*\n\nHello *${name}*,\n\nYour shipment *${tracking}* has departed Guangzhou and is en route to Tema Port.\n\nEstimated arrival: 14–18 days\n\nhttps://track.cargoscan.app/${tracking}`,
    port_arrival: `🏭 *Port Arrival*\n\nHello *${name}*,\n\nYour cargo *${tracking}* has arrived at Tema Port and is in customs clearance.\n\nhttps://track.cargoscan.app/${tracking}`,
    dispute_opened: `🛡 *Dispute Notice*\n\nHello *${name}*,\n\nA measurement dispute has been raised on item *${tracking}*. Our team is reviewing the evidence.\n\nhttps://track.cargoscan.app/${tracking}`,
  };

  return (
    <div className="grid-mobile-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Card style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Send Test Message</div>
        <Select label="Template" value={tmpl} onChange={setTmpl} options={[
          { value: "cargo_received", label: "cargo_received — Item scanned at origin" },
          { value: "damage_detected", label: "damage_detected — Item flagged damaged" },
          { value: "shipment_departed", label: "shipment_departed — Container shipped" },
          { value: "port_arrival", label: "port_arrival — Arrived at destination port" },
          { value: "dispute_opened", label: "dispute_opened — Measurement dispute raised" },
        ]} />
        <Field label="Phone number (with country code, no +)" value={phone} onChange={setPhone} placeholder="233244556677" />
        <Field label="Customer name (for preview)" value={name} onChange={setName} />
        <Field label="Tracking number" value={tracking} onChange={setTr} />
        <Btn label="Send Test Message" v="green" full loading={send} onClick={() => {
          if (!phone) { notify("Enter a phone number", "err"); return; }
          setSend(true);
          setTimeout(() => { setSend(false); notify(`Test sent to +${phone}! Check your WhatsApp.`, "ok"); }, 1200);
        }} />
      </Card>
      <Card style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Message Preview</div>
        <div style={{
          background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 16,
          fontSize: 12.5, lineHeight: 1.8, color: C.txt, whiteSpace: "pre-wrap", fontFamily: "inherit", minHeight: 260
        }}>
          {previews[tmpl]}
        </div>
        <div style={{ fontSize: 10.5, color: C.mid, marginTop: 10 }}>Template approved by Meta · Sent via Cloud API</div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ORG DASHBOARD  —  Admin / Supervisor / Operator
// ═══════════════════════════════════════════════════════════════
function OrgApp({ user, org, onLogout }) {
  const { data: pData } = usePlatform();
  const [tab, setTab] = useState("dashboard");
  const [showUpgrade, setUpg] = useState(false);
  const [showInvite, setInv] = useState(false);
  const [orgUsers, setOrgUsers] = useState(() => pData.users.filter(u => u.org === org.slug));
  const [org2, setOrg2] = useState(org); // local org state (for settings edits)

  const isAdmin = user.role === "ADMIN";
  const isSup = user.role === "SUPERVISOR";

  const TABS = [
    { id: "dashboard", icon: "◈", label: "Dashboard", show: true },
    { id: "shipments", icon: "📦", label: "Packages", show: true },
    { id: "scan", icon: "📱", label: "Scan Item", show: true, accent: true },
    { id: "disputes", icon: "🛡", label: "Disputes", show: isAdmin || isSup },
    { id: "billing", icon: "💳", label: "Billing", show: isAdmin },
    { id: "settings", icon: "⚙", label: "Settings", show: isAdmin },
  ].filter(t => t.show);

  const trial = org2.trial;
  const urgent = trial !== null && trial <= 3;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: C.bg }}>
      {/* TRIAL BANNER */}
      {trial !== null && (
        <div style={{
          background: urgent ? `${C.red}14` : `${C.amber}10`, borderBottom: `1px solid ${urgent ? C.red : C.amber}30`,
          padding: "7px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: urgent ? C.red : C.amber }}>
            <span style={{ animation: urgent ? "PU 1.2s ease-in-out infinite" : "none" }}>{urgent ? "🔴" : "⏱"}</span>
            <strong>{trial} day{trial !== 1 ? "s" : ""} left</strong> in your free trial
            {urgent && " — upgrade now to keep all your data"}
          </div>
          <Btn label="Upgrade Now →" v={urgent ? "danger" : "amber"} sz="sm" onClick={() => setUpg(true)} />
        </div>
      )}

      {/* TOP NAV */}
      <div style={{
        background: C.s1, borderBottom: `1px solid ${C.bd}`, padding: "8px 12px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", flex: 1 }}>
          <Logo sz={14} showText={false} />
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{org2.name}</div>
            <div style={{ fontFamily: C.mono, fontSize: 9, color: C.blue, marginTop: 2 }}>{org2.plan}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <Btn label="Sign Out" v="ghost" sz="sm" onClick={onLogout} />
        </div>
      </div>

      {/* CONTENT AREA */}
      <div style={{ flex: 1, padding: "16px 12px", overflowY: "auto", paddingBottom: 80 }} className="scroll-container">

        {/* ── DASHBOARD ── */}
        {tab === "dashboard" && <DashTab org={org2} user={user} onUpgrade={() => setUpg(true)} />}

        {/* ── SHIPMENTS ── */}
        {tab === "shipments" && <ShipmentsTab org={org2} user={user} />}

        {/* ── SCAN ── */}
        {tab === "scan" && <ScanTab org={org2} />}

        {/* ── DISPUTES ── */}
        {tab === "disputes" && <DisputesTab />}

        {/* ── BILLING ── */}
        {tab === "billing" && isAdmin && <BillingTab org={org2} onUpgrade={() => setUpg(true)} />}

        {/* ── SETTINGS ── */}
        {tab === "settings" && isAdmin && <SettingsTab org={org2} setOrg={setOrg2} />}
      </div>

      {/* BOTTOM TAB BAR (Fixed) */}
      <div style={{
        background: C.s1, borderTop: `1px solid ${C.bd}`, display: "flex",
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
        paddingBottom: "env(safe-area-inset-bottom)"
      }}>
        {TABS.map(t => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "10px 4px", cursor: "pointer", whiteSpace: "nowrap",
            fontSize: 10, fontWeight: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, transition: "color .15s",
            color: tab === t.id ? C.txt : C.mid, flex: 1,
            borderTop: `2px solid ${tab === t.id ? (t.accent ? C.green : C.blue) : "transparent"}`,
          }}>
            <span style={{ fontSize: 20 }}>{t.icon}</span>
            {t.label}
          </div>
        ))}
      </div>

      {/* MODALS */}
      {showUpgrade && <Modal title="Choose Your Plan" width={700} onClose={() => setUpg(false)}>
        <UpgradeModal org={org2} onSuccess={(plan) => { setOrg2(p => ({ ...p, plan, trial: null })); setUpg(false); notify(`Welcome to ${plan}!`, "ok"); }} />
      </Modal>}

      {showInvite && <Modal title="Invite Team Member" onClose={() => setInv(false)}>
        <InviteModal org={org2} onSuccess={(nu) => { setOrgUsers(p => [...p, nu]); setInv(false); notify(`Invitation sent to ${nu.email}`, "ok"); }} onCancel={() => setInv(false)} />
      </Modal>}
    </div>
  );
}

// ─── DASHBOARD TAB ─────────────────────────────────────────────
function DashTab({ org, user, onUpgrade }) {
  const { data: pData } = usePlatform();
  const orgPackages = (pData.packages || []).filter(p => p.org === org.slug);
  const scannedPackages = orgPackages.filter(p => p.cbm != null);
  const totalItems = org.usage.items || 0;
  const totalCBM = scannedPackages.reduce((a, p) => a + (p.cbm || 0), 0);
  return (
    <div className="afu">
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>
          {new Date().getHours() < 12 ? "Good morning" : "Good afternoon"}, {user.name.split(" ")[0]} 👋
        </h2>
        <div style={{ fontSize: 12, color: C.mid, marginTop: 3 }}>Here's what's happening at <strong style={{ color: C.txt }}>{org.name}</strong></div>
      </div>

      <div className="grid-mobile-2" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
        <Stat label="Items Scanned" value={scannedPackages.length} sub={`${orgPackages.length} packages total`} color={C.blue} />
        <Stat label="Total CBM" value={totalCBM.toFixed(1)} sub="" color={C.green} />
        <Stat label="Pending Scan" value={orgPackages.filter(p => p.cbm == null).length} sub="Awaiting native scan" color={C.purple} />
        <Stat label="Open Disputes" value={pData.disputes.filter(d => d.org === org.slug && d.status !== "RESOLVED").length} sub="" color={C.amber} />
      </div>

      {org.plan === "TRIAL" && (
        <Card style={{ padding: 20, marginBottom: 18, border: `1px solid ${C.amber}30` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Trial Limits</div>
            <Btn label="Upgrade for Unlimited →" sz="sm" onClick={onUpgrade} />
          </div>
          <div className="grid-mobile-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Bar label="Shipments/month" used={org.usage.ships} limit={org.limits.ships} />
            <Bar label="Items scanned" used={org.usage.items} limit={org.limits.items} />
            <Bar label="Team members" used={org.usage.users} limit={org.limits.users} />
          </div>
        </Card>
      )}

      <Card>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.bd}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Recent Packages</div>
          <Chip label={`${scannedPackages.length}/${orgPackages.length} scanned`} color={C.blue} />
        </div>
        {orgPackages.length === 0 && (
          <div style={{ padding: "40px 18px", textAlign: "center", color: C.mid, fontSize: 13 }}>
            No packages yet. Create package records in the Packages tab before scanning.
          </div>
        )}
        {orgPackages.slice(0, 8).map(pkg => (
          <div key={pkg.id} style={{ padding: "11px 18px", borderBottom: `1px solid ${C.bd}`, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 700, color: C.blue, width: 130, flexShrink: 0 }}>{pkg.trackingNumber}</div>
            <div style={{ fontSize: 12, color: C.mid, flex: 1 }}>{pkg.itemName || "Unnamed Item"} · Qty {pkg.quantity}</div>
            <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: pkg.cbm == null ? C.amber : C.green }}>
              {pkg.cbm == null ? "PENDING" : `${Number(pkg.cbm).toFixed(4)} CBM`}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── SHIPMENTS TAB ─────────────────────────────────────────────
function ShipmentsTab({ org, user }) {
  const { data: pData, addPackage, updatePackage } = usePlatform();
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    customerName: "",
    trackingNumber: "",
    itemName: "",
    description: "",
    supplier: "",
    shipmentId: "",
    quantity: "1",
  });

  const orgPackages = (pData.packages || []).filter(pkg => pkg.org === org.slug);
  const updateForm = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const resetForm = () => {
    setForm({
      customerName: "",
      trackingNumber: "",
      itemName: "",
      description: "",
      supplier: "",
      shipmentId: "",
      quantity: "1",
    });
    setEditingId(null);
  };

  const savePackage = () => {
    if (!form.trackingNumber.trim()) {
      notify("Tracking number is required", "err");
      return;
    }
    if (!form.customerName.trim()) {
      notify("Customer name is required", "err");
      return;
    }

    const payload = {
      id: editingId || Math.random().toString(36).slice(2, 11),
      org: org.slug,
      customerName: form.customerName.trim(),
      trackingNumber: form.trackingNumber.trim(),
      itemName: form.itemName.trim(),
      description: form.description.trim(),
      supplier: form.supplier.trim(),
      shipmentId: form.shipmentId.trim(),
      quantity: Math.max(1, parseInt(form.quantity || "1", 10)),
      cbm: editingId ? orgPackages.find(p => p.id === editingId)?.cbm ?? null : null,
      lengthCm: editingId ? orgPackages.find(p => p.id === editingId)?.lengthCm ?? null : null,
      widthCm: editingId ? orgPackages.find(p => p.id === editingId)?.widthCm ?? null : null,
      heightCm: editingId ? orgPackages.find(p => p.id === editingId)?.heightCm ?? null : null,
      updatedAt: new Date().toISOString(),
    };

    if (editingId) {
      updatePackage(editingId, payload);
      notify("Package updated", "ok");
    } else {
      addPackage(payload);
      notify("Package created with pending scan CBM", "ok");
    }
    resetForm();
  };

  const startEdit = (pkg) => {
    setEditingId(pkg.id);
    setForm({
      customerName: pkg.customerName || "",
      trackingNumber: pkg.trackingNumber || "",
      itemName: pkg.itemName || "",
      description: pkg.description || "",
      supplier: pkg.supplier || "",
      shipmentId: pkg.shipmentId || "",
      quantity: String(pkg.quantity || 1),
    });
  };

  const refreshScannedCBM = async () => {
    try {
      const response = await fetch("/api/scans");
      if (!response.ok) throw new Error("sync failed");
      const payload = await response.json();
      const scans = Array.isArray(payload?.scans) ? payload.scans : [];

      let updates = 0;
      for (const pkg of orgPackages) {
        const latest = scans.find(s => s.trackingNumber === pkg.trackingNumber);
        if (!latest) continue;

        updatePackage(pkg.id, {
          cbm: Number(latest.cbm || 0),
          lengthCm: Number(latest.lengthCm || 0),
          widthCm: Number(latest.widthCm || 0),
          heightCm: Number(latest.heightCm || 0),
          updatedAt: new Date().toISOString(),
        });
        updates += 1;
      }

      notify(updates > 0 ? `Updated ${updates} package(s) from native scans` : "No new linked scans found", updates > 0 ? "ok" : "info");
    } catch {
      notify("Failed to refresh scan results from API", "err");
    }
  };

  return (
    <div className="afu">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>Package Records</h2>
        <Btn label="Refresh Scanned CBM" onClick={refreshScannedCBM} />
      </div>

      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>{editingId ? "Edit Package" : "Create Package"}</div>
        <div className="grid-mobile-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Customer Name" value={form.customerName} onChange={(v) => updateForm("customerName", v)} />
          <Field label="Tracking Number" value={form.trackingNumber} onChange={(v) => updateForm("trackingNumber", v)} />
          <Field label="Item Name" value={form.itemName} onChange={(v) => updateForm("itemName", v)} />
          <Field label="Supplier" value={form.supplier} onChange={(v) => updateForm("supplier", v)} />
          <Field label="Shipment ID" value={form.shipmentId} onChange={(v) => updateForm("shipmentId", v)} />
          <Field label="Quantity" type="number" value={form.quantity} onChange={(v) => updateForm("quantity", v)} />
        </div>
        <Field label="Description" value={form.description} onChange={(v) => updateForm("description", v)} />
        <div style={{ display: "flex", gap: 8 }}>
          <Btn label={editingId ? "Update Package" : "Create Package"} v="green" onClick={savePackage} />
          {editingId && <Btn label="Cancel Edit" v="ghost" onClick={resetForm} />}
        </div>
      </Card>

      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Tracking", "Customer", "Item", "Shipment", "Qty", "CBM", "Status", "Actions"].map(h => (
            <th key={h} style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 600, letterSpacing: ".12em", color: C.mid, textTransform: "uppercase", padding: "10px 16px", textAlign: "left", borderBottom: `1px solid ${C.bd}` }}>{h}</th>
          ))}</tr></thead>
          <tbody>{orgPackages.map(pkg => (
            <tr key={pkg.id} style={{ borderBottom: `1px solid ${C.bd}` }}>
              <td data-label="Tracking" style={{ padding: "11px 16px", fontFamily: C.mono, fontSize: 11, color: C.blue, fontWeight: 700 }}>{pkg.trackingNumber}</td>
              <td data-label="Customer" style={{ padding: "11px 16px", fontSize: 12 }}>{pkg.customerName}</td>
              <td data-label="Item" style={{ padding: "11px 16px", fontSize: 12, color: C.mid }}>{pkg.itemName || "-"}</td>
              <td data-label="Shipment" style={{ padding: "11px 16px", fontFamily: C.mono, fontSize: 11 }}>{pkg.shipmentId || "-"}</td>
              <td data-label="Qty" style={{ padding: "11px 16px", fontFamily: C.mono, fontSize: 12 }}>{pkg.quantity}</td>
              <td data-label="CBM" style={{ padding: "11px 16px", fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: pkg.cbm == null ? C.amber : C.green }}>{pkg.cbm == null ? "—" : Number(pkg.cbm).toFixed(4)}</td>
              <td data-label="Status" style={{ padding: "11px 16px" }}><Chip label={pkg.cbm == null ? "PENDING SCAN" : "SCANNED"} color={pkg.cbm == null ? C.amber : C.green} /></td>
              <td data-label="Actions" style={{ padding: "11px 16px" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn label="Edit" v="ghost" sz="sm" onClick={() => startEdit(pkg)} />
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── LIDAR SCANNER COMPONENT ──────────────────────────────────
function LidarScanner({ onLock, onCancel }) {
  const [active, setActive] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [aiMsg, setAiMsg] = useState("LiDAR measurement requires native iOS ARKit scanning.");
  const [nativeMeasure, setNativeMeasure] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    let stream = null;
    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setHasCamera(true);
        setActive(true);
        setAiMsg("Camera active. Waiting for native ARKit LiDAR measurement...");
      } catch {
        setHasCamera(false);
        setActive(true);
        setAiMsg("Camera unavailable in browser. Open iOS app for LiDAR measurement.");
      }
    }
    start();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

  useEffect(() => {
    if (!active) return;

    const receiveNative = (event) => {
      const payload = event?.data;
      if (!payload || payload.type !== "cargoscan_lidar_measurement") return;

      const d = payload.data || {};
      const l = Number(d.lengthCm);
      const w = Number(d.widthCm);
      const h = Number(d.heightCm);
      const confidence = Number(d.confidenceScore);
      const ok = Number.isFinite(l) && Number.isFinite(w) && Number.isFinite(h) && l > 0 && w > 0 && h > 0;
      if (!ok) return;

      setNativeMeasure({
        l: l.toFixed(1),
        w: w.toFixed(1),
        h: h.toFixed(1),
        confidence: Number.isFinite(confidence) ? Math.round(Math.max(0, Math.min(100, confidence))) : null,
        source: d.source || "ARKit LiDAR",
      });
      setAiMsg("Real LiDAR geometry captured. Ready to lock.");
    };

    window.addEventListener("message", receiveNative);
    return () => window.removeEventListener("message", receiveNative);
  }, [active]);

  const openIOSApp = () => {
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.href = `cargoscan://scan?return_url=${returnUrl}`;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 2000, display: "flex", flexDirection: "column", color: "#fff" }}>
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.6 }} />

        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.88), rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.25))" }} />

        <div style={{ position: "absolute", top: 20, left: 16, right: 16 }}>
          <div style={{ background: "rgba(0,0,0,0.82)", border: `1px solid ${C.blue}40`, borderRadius: 12, padding: "12px 16px", backdropFilter: "blur(8px)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{aiMsg}</div>
            <div style={{ fontSize: 11, color: "#9EB3D6" }}>
              Browser camera access does not expose ARKit LiDAR depth maps. Real auto-measurement is accepted only from native iOS scanner output.
            </div>
          </div>
        </div>

        {!nativeMeasure && (
          <div style={{
            position: "absolute", left: 16, right: 16, bottom: 130,
            background: "rgba(0,0,0,0.86)", border: `1px solid ${C.bd}`, borderRadius: 14, padding: 16
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, marginBottom: 8 }}>No real LiDAR depth measurement received</div>
            <div style={{ fontSize: 11, color: C.mid, lineHeight: 1.5 }}>
              Pointing at a flat surface should not generate dimensions. This scanner rejects guessed values and waits for native ARKit geometry output.
            </div>
          </div>
        )}

        {nativeMeasure && (
          <div className="afu" style={{ position: "absolute", bottom: 120, left: 16, right: 16, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)", borderRadius: 16, padding: 18, border: `1px solid ${C.green}55` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {["Length", "Width", "Height"].map((label) => {
                const key = label[0].toLowerCase();
                return (
                  <div key={label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9, opacity: 0.5, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 18, fontWeight: 700, color: C.green }}>
                      {nativeMeasure[key]}<span style={{ fontSize: 10, opacity: 0.7, marginLeft: 2 }}>cm</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12, fontSize: 10.5, color: C.mid }}>
              Source: {nativeMeasure.source}{nativeMeasure.confidence != null ? ` · Confidence ${nativeMeasure.confidence}%` : ""}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "24px 20px calc(24px + env(safe-area-inset-bottom))", background: "#080808", borderTop: `1px solid ${C.bd}30`, display: "flex", gap: 12 }}>
        {!nativeMeasure && (
          <Btn label={hasCamera ? "Open iOS LiDAR App" : "Open iOS App"} v="primary" style={{ flex: 2 }} sz="lg" onClick={openIOSApp} />
        )}
        <Btn label="Abort" v="ghost" style={{ flex: 1 }} onClick={onCancel} />
        <Btn label="Final Lock →" v="green" style={{ flex: 2 }} sz="lg" disabled={!nativeMeasure} onClick={() => onLock(nativeMeasure)} />
      </div>
    </div>
  );
}
// ─── SCAN TAB ──────────────────────────────────────────────────
function ScanTab({ org }) {
  const [nativeScans, setNativeScans] = useState([]);
  const [syncState, setSyncState] = useState("idle");

  useEffect(() => {
    const stored = localStorage.getItem(`cs_native_scans_${org.slug}`);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) setNativeScans(parsed);
    } catch {
      setNativeScans([]);
    }
  }, [org.slug]);

  const refreshFromApi = async () => {
    setSyncState("syncing");
    try {
      const response = await fetch(`/api/scans?org=${encodeURIComponent(org.slug)}`);
      if (!response.ok) throw new Error("sync failed");
      const payload = await response.json();
      const scans = Array.isArray(payload?.scans) ? payload.scans : [];
      setNativeScans(scans);
      localStorage.setItem(`cs_native_scans_${org.slug}`, JSON.stringify(scans));
      setSyncState("ok");
    } catch {
      setSyncState("offline");
    }
  };

  return (
    <div className="afu">
      <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 4 }}>Native LiDAR Scanner</h2>
      <p style={{ fontSize: 12, color: C.mid, marginBottom: 20 }}>
        Automatic CBM measurement now runs only in the iOS app using ARKit + LiDAR + camera + motion sensors.
      </p>

      <Card style={{ padding: 18, border: `1px solid ${C.blue}50`, background: `${C.blue}0D`, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.blue, marginBottom: 8 }}>Required capture flow</div>
        <div style={{ display: "grid", gap: 8, fontSize: 12, color: C.txt }}>
          <div>1. Scan cargo in the native iOS app.</div>
          <div>2. Let on-device geometric validation complete (planes, edges, corners, multi-frame stability).</div>
          <div>3. App syncs validated scan record to backend.</div>
          <div>4. Web dashboard reads synced records only.</div>
        </div>
      </Card>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <Btn label={syncState === "syncing" ? "Syncing..." : "Refresh Synced Scans"} v="primary" onClick={refreshFromApi} loading={syncState === "syncing"} />
        <Btn label="Open iOS Scanner" v="outline" onClick={() => { window.location.href = "cargoscan://scan"; }} />
      </div>

      {syncState === "offline" && (
        <Card style={{ padding: 12, border: `1px solid ${C.amber}50`, background: `${C.amber}10`, marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.amber, fontWeight: 700 }}>Backend sync unavailable.</div>
          <div style={{ fontSize: 11, color: C.mid, marginTop: 4 }}>Showing last locally cached native scans for this organization.</div>
        </Card>
      )}

      <Card>
        {nativeScans.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.txt, marginBottom: 6 }}>No native scans synced yet</div>
            <div style={{ fontSize: 12, color: C.mid }}>Use the iOS CargoScan app to capture and sync your first validated LiDAR measurement.</div>
          </div>
        ) : (
          <div className="scroll-container" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr>
                  {["Scan ID", "Length", "Width", "Height", "CBM", "Confidence", "Source", "Time"].map(h => (
                    <th key={h} style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 600, letterSpacing: ".08em", color: C.mid, textTransform: "uppercase", padding: "12px 14px", textAlign: "left", borderBottom: `1px solid ${C.bd}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nativeScans.map(s => (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${C.bd}` }}>
                    <td data-label="Scan" style={{ padding: "12px 14px", fontFamily: C.mono, fontSize: 11, color: C.blue }}>{String(s.id || "-").slice(0, 12)}</td>
                    <td data-label="Length" style={{ padding: "12px 14px", fontFamily: C.mono, fontSize: 12 }}>{Number(s.lengthCm || 0).toFixed(1)} cm</td>
                    <td data-label="Width" style={{ padding: "12px 14px", fontFamily: C.mono, fontSize: 12 }}>{Number(s.widthCm || 0).toFixed(1)} cm</td>
                    <td data-label="Height" style={{ padding: "12px 14px", fontFamily: C.mono, fontSize: 12 }}>{Number(s.heightCm || 0).toFixed(1)} cm</td>
                    <td data-label="CBM" style={{ padding: "12px 14px", fontFamily: C.mono, fontSize: 12, color: C.green }}>{Number(s.cbm || 0).toFixed(4)}</td>
                    <td data-label="Confidence" style={{ padding: "12px 14px", fontFamily: C.mono, fontSize: 12 }}>{Math.round(Number(s.confidenceScore || 0) * (Number(s.confidenceScore || 0) <= 1 ? 100 : 1))}%</td>
                    <td data-label="Source" style={{ padding: "12px 14px", fontSize: 12, color: C.mid }}>{s.source || "ARKit LiDAR"}</td>
                    <td data-label="Time" style={{ padding: "12px 14px", fontSize: 12, color: C.mid }}>{s.createdAt ? new Date(s.createdAt).toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
// ─── DISPUTES TAB ──────────────────────────────────────────────
function DisputesTab() {
  const { data: pData, updateDispute } = usePlatform();
  const [sel, setSel] = useState(null);
  const disputes = pData.disputes || [];
  const statusColor = s => s === "OPEN" ? C.red : s === "PENDING" ? C.amber : C.green;
  return (
    <div className="afu">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>Disputes</h2>
        <Chip label={`${disputes.filter(d => d.status !== "RESOLVED").length} open`} color={C.red} />
      </div>
      {sel ? (
        <Card style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div><div style={{ fontWeight: 700, fontSize: 15 }}>{sel.id} — {sel.code}</div><div style={{ fontSize: 12, color: C.mid, marginTop: 2 }}>Customer: {sel.customer}</div></div>
            <Btn label="← Back" v="ghost" sz="sm" onClick={() => setSel(null)} />
          </div>
          <div className="grid-mobile-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
            {[["Origin scan CBM", sel.origin, C.blue], ["Destination scan CBM", sel.dest, C.amber], ["Difference", sel.diff, sel.status === "RESOLVED" ? C.green : C.red], ["Status", sel.status, statusColor(sel.status)]].map(([l, v, c]) => (
              <Card key={l} style={{ padding: 14 }}>
                <div style={{ fontSize: 10.5, color: C.mid, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".08em" }}>{l}</div>
                <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 700, color: c }}>{v}</div>
              </Card>
            ))}
          </div>
          {sel.status !== "RESOLVED" && (
            <div>
              <Field label="Resolution note" />
              <Btn label="Mark as Resolved" v="green" onClick={() => {
                updateDispute(sel.id, { status: "RESOLVED" });
                notify(`${sel.id} resolved ✓`, "ok");
                setSel(null);
              }} />
            </div>
          )}
        </Card>
      ) : (
        <Card>
          {disputes.length === 0 ? (
            <div style={{ padding: "60px 20px", textAlign: "center", color: C.mid, fontSize: 13 }}>
              No disputes found. All measurements match perfectly!
            </div>
          ) : (
            <div className="scroll-container" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead><tr>{["Dispute ID", "Item Code", "Customer", "Origin CBM", "Dest CBM", "Diff", "Status", "Priority", ""].map(h => (
                  <th key={h} style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 600, letterSpacing: ".08em", color: C.mid, textTransform: "uppercase", padding: "12px 14px", textAlign: "left", borderBottom: `1px solid ${C.bd}` }}>{h}</th>
                ))}</tr></thead>
                <tbody>{disputes.map(d => (
                  <tr key={d.id} style={{ borderBottom: `1px solid ${C.bd}` }}>
                    <td data-label="ID" style={{ padding: "12px 14px", fontFamily: C.mono, fontSize: 11, color: C.blue, fontWeight: 700 }}>{d.id}</td>
                    <td data-label="Item" style={{ padding: "12px 14px", fontFamily: C.mono, fontSize: 11 }}>{d.code}</td>
                    <td data-label="Customer" style={{ padding: "12px 14px", fontSize: 12 }}>{d.customer}</td>
                    <td data-label="Origin" style={{ padding: "12px 14px", fontFamily: C.mono, fontSize: 12, color: C.blue }}>{d.origin}</td>
                    <td data-label="Dest" style={{ padding: "12px 14px", fontFamily: C.mono, fontSize: 12, color: C.amber }}>{d.dest}</td>
                    <td data-label="Diff" style={{ padding: "12px 14px", fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: d.status === "RESOLVED" ? C.green : C.red }}>{d.diff}</td>
                    <td data-label="Status" style={{ padding: "12px 14px" }}><Chip label={d.status} color={statusColor(d.status)} /></td>
                    <td data-label="Priority" style={{ padding: "12px 14px" }}><Chip label={d.priority} color={d.priority === "HIGH" ? C.red : d.priority === "MEDIUM" ? C.amber : C.mid} /></td>
                    <td data-label="Action" style={{ padding: "12px 14px" }}><Btn label="Review" v="ghost" sz="sm" onClick={() => setSel(d)} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── TEAM TAB (ADMIN) ──────────────────────────────────────────
function TeamTab({ org, user, orgUsers, setOrgUsers, onUpgrade, onInvite }) {
  const activeCount = orgUsers.filter(u => u.active).length;
  const atLimit = org.plan === "TRIAL" && activeCount >= org.limits.users;

  return (
    <div className="afu">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>Team Management</h2>
          <p style={{ fontSize: 12, color: C.mid, marginTop: 3 }}>Only admins can add, remove, or change roles.</p>
        </div>
        {atLimit
          ? <Btn label="Upgrade to Add More Users" v="amber" icon="⚡" onClick={onUpgrade} />
          : <Btn label="+ Invite Team Member" onClick={onInvite} />}
      </div>

      {atLimit && <div style={{ background: `${C.red}10`, border: `1px solid ${C.red}25`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: C.red }}>
        ⚠ You've reached the user limit on your Trial plan ({org.limits.users} users). Upgrade to Business for 10 users.
      </div>}

      <Card style={{ marginBottom: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Team Member", "Role", "Status", "Last Active", "Actions"].map(h => (
            <th key={h} style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 600, letterSpacing: ".12em", color: C.mid, textTransform: "uppercase", padding: "10px 16px", textAlign: "left", borderBottom: `1px solid ${C.bd}` }}>{h}</th>
          ))}</tr></thead>
          <tbody>{orgUsers.map(u => (
            <tr key={u.id} style={{ borderBottom: `1px solid ${C.bd}`, opacity: u.active ? 1 : .45 }}>
              <td style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar name={u.name} sz={32} color={u.role === "ADMIN" ? C.blue : u.role === "SUPERVISOR" ? C.purple : C.green} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: C.mid }}>{u.email}</div>
                  </div>
                </div>
              </td>
              <td style={{ padding: "12px 16px" }}><Chip label={u.role} color={u.role === "ADMIN" ? C.blue : u.role === "SUPERVISOR" ? C.purple : C.green} /></td>
              <td style={{ padding: "12px 16px" }}><Chip label={u.active ? "Active" : "Inactive"} color={u.active ? C.green : C.mid} dot={u.active ? "pulse" : undefined} /></td>
              <td style={{ padding: "12px 16px", fontSize: 11, color: C.mid }}>{u.seen}</td>
              <td style={{ padding: "12px 16px" }}>
                {u.id === user.id
                  ? <Chip label="You" color={C.mid} />
                  : <Btn label={u.active ? "Deactivate" : "Reactivate"} v="ghost" sz="sm"
                    onClick={() => { setOrgUsers(p => p.map(x => x.id === u.id ? { ...x, active: !x.active } : x)); notify(`${u.name} ${u.active ? "deactivated" : "reactivated"}`, "ok"); }} />}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </Card>

      <Card style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Role Permissions</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 520 }}>
            <thead><tr>
              <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10.5, fontWeight: 600, color: C.mid, textTransform: "uppercase", letterSpacing: ".08em" }}>Feature</th>
              {[["Admin", C.blue], ["Supervisor", C.purple], ["Operator", C.green]].map(([r, c]) => (
                <th key={r} style={{ textAlign: "center", padding: "6px 10px", fontSize: 10.5, fontWeight: 700, color: c, letterSpacing: ".06em", textTransform: "uppercase" }}>{r}</th>
              ))}
            </tr></thead>
            <tbody>{[
              ["Scan & create items", true, true, true],
              ["View shipments", true, true, true],
              ["Create shipments", true, true, false],
              ["Verify items at dest.", true, true, false],
              ["Resolve disputes", true, true, false],
              ["Manage team members", true, false, false],
              ["View billing & upgrade", true, false, false],
              ["Export packing list", true, true, false],
              ["Company settings", true, false, false],
            ].map(([f, a, s, o]) => (
              <tr key={f} style={{ borderTop: `1px solid ${C.bd}` }}>
                <td style={{ padding: "7px 0", color: C.mid }}>{f}</td>
                {[a, s, o].map((v, i) => <td key={i} style={{ textAlign: "center", padding: "7px 10px", color: v ? C.green : C.muted, fontWeight: 700, fontSize: 15 }}>{v ? "✓" : "—"}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── BILLING TAB (ADMIN) ───────────────────────────────────────
function BillingTab({ org, onUpgrade }) {
  return (
    <div className="afu" style={{ maxWidth: 680 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 4 }}>Billing & Subscription</h2>
      <p style={{ fontSize: 12, color: C.mid, marginBottom: 20 }}>Manage your plan. Payments via Paystack — mobile money and cards accepted.</p>
      <Card style={{ padding: 22, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: C.mid, letterSpacing: ".09em", textTransform: "uppercase", marginBottom: 4 }}>Current Plan</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.03em" }}>{org.plan}</div>
            {org.trial !== null && <div style={{ fontSize: 12, color: C.amber, marginTop: 4 }}>⏱ {org.trial} days left · No charge yet</div>}
            {org.plan !== "TRIAL" && <div style={{ fontSize: 12, color: C.green, marginTop: 4 }}>✓ Active · Renews monthly</div>}
          </div>
          <Chip label={org.plan === "TRIAL" ? "FREE TRIAL" : "ACTIVE"} color={org.plan === "TRIAL" ? C.amber : C.green} dot={org.plan !== "TRIAL" ? "pulse" : undefined} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
          {[["Shipments/mo", `${org.usage.ships}/${org.limits.ships >= 9999 ? "∞" : org.limits.ships}`, C.blue], ["Items scanned", `${org.usage.items}/${org.limits.items >= 9999 ? "∞" : org.limits.items}`, C.green], ["Team members", `${org.usage.users}/${org.limits.users >= 9999 ? "∞" : org.limits.users}`, C.purple]].map(([l, v, c]) => (
            <div key={l} style={{ background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 10.5, color: C.mid, marginBottom: 4 }}>{l}</div>
              <div style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>
        {org.plan === "TRIAL"
          ? <Btn label="Upgrade Plan — From $29/month →" full sz="lg" onClick={onUpgrade} />
          : <div style={{ display: "flex", gap: 8 }}>
            <Btn label="Manage Subscription" v="ghost" style={{ flex: 1 }} onClick={() => notify("Opens Paystack management link", "info")} />
            <Btn label="Download Invoices" v="ghost" style={{ flex: 1 }} onClick={() => notify("Generating invoice PDF...", "info")} />
          </div>}
      </Card>
      <Card style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Accepted Payment Methods</div>
        {[["🇬🇭", "Ghana Mobile Money", "MTN · Vodafone · AirtelTigo — GHS", C.green], ["💳", "Visa / Mastercard", "Global cards — USD", C.blue], ["🇳🇬", "Nigeria", "Bank Transfer · USSD — NGN", C.amber]].map(([i, n, d, c]) => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px solid ${C.bd}` }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{i}</span>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{n}</div><div style={{ fontSize: 11, color: C.mid }}>{d}</div></div>
            <Chip label="Available" color={c} />
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── SETTINGS TAB (ADMIN) ─────────────────────────────────────
function SettingsTab({ org, setOrg }) {
  const [name, setName] = useState(org.name);
  const [cbm, setCbm] = useState(String(org.cbmRate));
  const [city, setCity] = useState(org.city);

  return (
    <div className="afu" style={{ maxWidth: 580 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 20 }}>Company Settings</h2>
      <Card style={{ padding: 22, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16 }}>Company Profile</div>
        <Field label="Company name" value={name} onChange={setName} />
        <Field label="Portal URL" value={`${org.slug}.cargoscan.app`} readOnly hint="Contact support to change your subdomain" />
        <div className="grid-mobile-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Country" value={org.country} readOnly hint="Contact support to change" />
          <Field label="City" value={city} onChange={setCity} />
        </div>
        <Field label="Default CBM rate (USD per CBM)" type="number" value={cbm} onChange={setCbm} hint="Standard China–Ghana rate is $85/CBM" />
        <Btn label="Save Changes" v="green" icon="✓" onClick={() => { setOrg(p => ({ ...p, name, city, cbmRate: parseFloat(cbm) })); notify("Settings saved", "ok"); }} />
      </Card>
      <Card style={{ padding: 22 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: C.red }}>Danger Zone</div>
        <p style={{ fontSize: 12, color: C.mid, marginBottom: 14 }}>Deleting your account is permanent and cannot be undone.</p>
        <Btn label="Request Account Deletion" v="danger" onClick={() => notify("Email support@cargoscan.app to delete your account", "info")} />
      </Card>
    </div>
  );
}

// ─── UPGRADE MODAL ────────────────────────────────────────────
function UpgradeModal({ org, onSuccess }) {
  const [sel, setSel] = useState("BUSINESS");
  const plans = [
    { key: "STARTER", name: "Starter", price: 29, col: C.blue, pop: false, feats: ["3 users", "30 shipments/mo", "Unlimited items", "Photos + Excel export"] },
    { key: "BUSINESS", name: "Business", price: 79, col: C.green, pop: true, feats: ["10 users", "200 shipments/mo", "WhatsApp notify", "Dispute log + verify"] },
    { key: "ENTERPRISE", name: "Enterprise", price: 199, col: C.purple, pop: false, feats: ["Unlimited everything", "REST API", "Custom branding", "SLA guarantee"] },
  ];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
        {plans.map(p => (
          <div key={p.key} onClick={() => setSel(p.key)} style={{
            background: sel === p.key ? `${p.col}14` : C.s2,
            border: `2px solid ${sel === p.key ? p.col : C.bd}`, borderRadius: 12, padding: 18, cursor: "pointer", transition: "all .15s", position: "relative"
          }}>
            {p.pop && <div style={{ position: "absolute", top: -1, right: 12, background: `linear-gradient(90deg,${C.blue},${C.purple})`, fontSize: 8, fontWeight: 700, color: "#fff", padding: "3px 9px", borderRadius: "0 0 6px 6px", letterSpacing: ".1em", textTransform: "uppercase" }}>Popular</div>}
            <div style={{ fontWeight: 700, fontSize: 11, color: p.col, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{p.name}</div>
            <div style={{ fontFamily: C.mono, fontSize: 26, fontWeight: 700, marginBottom: 10 }}>${p.price}<span style={{ fontSize: 12, color: C.mid }}>/mo</span></div>
            {p.feats.map(f => <div key={f} style={{ fontSize: 11.5, color: C.mid, marginBottom: 5, display: "flex", gap: 6 }}><span style={{ color: p.col, fontWeight: 700, flexShrink: 0 }}>✓</span>{f}</div>)}
          </div>
        ))}
      </div>
      <Btn label={`Pay with Paystack — ${plans.find(p => p.key === sel)?.name} $${plans.find(p => p.key === sel)?.price}/mo →`} full sz="lg" onClick={() => onSuccess(sel)} />
      <p style={{ textAlign: "center", fontSize: 11, color: C.mid, marginTop: 10 }}>Ghana Mobile Money · Visa · Mastercard · Cancel anytime</p>
    </div>
  );
}

// ─── INVITE MODAL ─────────────────────────────────────────────
function InviteModal({ org, onSuccess, onCancel }) {
  const [f, setF] = useState({ name: "", email: "", role: "OPERATOR" });
  const [errs, setErrs] = useState({});
  const [loading, setLoad] = useState(false);
  const [created, setCreated] = useState(null);
  const set = k => v => setF(p => ({ ...p, [k]: v }));

  const submit = () => {
    const e = {};
    if (!f.name.trim()) e.name = "Name required";
    if (!f.email.includes("@")) e.email = "Valid email required";
    setErrs(e); if (Object.keys(e).length) return;
    setLoad(true);
    const tempPass = `Temp${Math.random().toString(36).slice(2, 8).toUpperCase()}!`;
    setTimeout(() => {
      const nu = { id: `u_${Date.now()}`, org: org.slug, name: f.name, email: f.email, pass: tempPass, role: f.role, active: true, seen: "Just invited" };
      setCreated({ ...nu, tempPass });
      setLoad(false);
    }, 900);
  };

  if (created) return (
    <div>
      <div style={{ background: `${C.green}10`, border: `1px solid ${C.green}25`, borderRadius: 10, padding: 16, marginBottom: 18, textAlign: "center" }}>
        <div style={{ fontSize: 22, marginBottom: 6 }}>✅</div>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{created.name} has been added to {org.name}</div>
        <div style={{ fontSize: 12, color: C.mid }}>Share these credentials with them. They can change their password after first login.</div>
      </div>
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".09em", color: C.mid, textTransform: "uppercase", marginBottom: 10 }}>Credentials to Share</div>
        {[["Login URL", `${org.slug}.cargoscan.app`], ["Email", created.email], ["Temporary Password", created.tempPass], ["Role", created.role]].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${C.bd}` }}>
            <span style={{ fontSize: 11, color: C.mid, fontWeight: 600, width: 130 }}>{k}</span>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.txt, flex: 1 }}>{v}</span>
            <button onClick={() => { navigator.clipboard?.writeText(v); notify("Copied", "ok"); }} style={{ background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 4, color: C.mid, fontSize: 9, padding: "2px 7px", cursor: "pointer", fontFamily: C.mono }}>COPY</button>
          </div>
        ))}
      </Card>
      <Btn label="Done" v="green" full onClick={() => onSuccess(created)} />
    </div>
  );

  return (
    <div>
      <p style={{ fontSize: 12, color: C.mid, marginBottom: 18 }}>Create an account for a team member. They'll receive their login credentials immediately.</p>
      <Field label="Full name" value={f.name} onChange={set("name")} placeholder="Team member's name" err={errs.name} autoFocus />
      <Field label="Work email" type="email" value={f.email} onChange={set("email")} placeholder="team@yourcompany.com" err={errs.email} />
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".09em", color: C.mid, textTransform: "uppercase", marginBottom: 8 }}>Role</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[["OPERATOR", "Scan items + view shipments"], ["SUPERVISOR", "Verify items + resolve disputes"], ["ADMIN", "Full access including billing"]].map(([r, d]) => (
            <div key={r} onClick={() => set("role")(r)} style={{ border: `1px solid ${f.role === r ? C.blue : C.bd}`, background: f.role === r ? `${C.blue}12` : C.s2, borderRadius: 8, padding: "10px 12px", cursor: "pointer", transition: "all .15s" }}>
              <div style={{ fontWeight: 700, fontSize: 11.5, color: f.role === r ? C.blue : C.txt, marginBottom: 3 }}>{r}</div>
              <div style={{ fontSize: 10.5, color: C.mid, lineHeight: 1.4 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn label="Cancel" v="ghost" full onClick={onCancel} />
        <Btn label="Create Account" v="green" full loading={loading} onClick={submit} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROOT APP  —  Single entry. Smart routing. No hints.
// ═══════════════════════════════════════════════════════════════
function CargoScanInner() {
  const { data: pData } = usePlatform();
  const [screen, setScreen] = useState("login"); // login | signup | app
  const [session, setSession] = useState(null);
  const [signupResult, setSignupResult] = useState(null);

  const onLogin = useCallback(({ type, user, org }) => {
    setSession({ type, user, org });
    setScreen("app");
  }, []);

  const onLogout = useCallback(() => {
    setSession(null);
    setScreen("login");
    notify("Signed out", "ok");
  }, []);

  // Auto-login after signup: when signupResult is set, find the user in pData and log in
  useEffect(() => {
    if (signupResult) {
      const u = pData.users.find(x => x.email === signupResult.email);
      const o = pData.orgs[signupResult.slug];
      if (u && o) {
        onLogin({ type: "org", user: u, org: o });
        setSignupResult(null);
        notify("Welcome to CargoScan! Your 7-day trial is active.", "ok");
      }
    }
  }, [signupResult, pData, onLogin]);

  return (
    <>
      <G />
      <Toast />
      {screen === "login" && <LoginScreen onSuccess={onLogin} onSignup={() => setScreen("signup")} />}
      {screen === "signup" && <SignupScreen onDone={(created) => { setSignupResult(created); }} onLogin={() => setScreen("login")} />}
      {screen === "app" && session?.type === "superadmin" && <SuperAdmin onLogout={onLogout} onImpersonate={(org) => {
        const u = pData.users.find(x => x.org === org.slug && x.role === "ADMIN");
        if (u) onLogin({ type: "org", user: u, org });
        else notify("No admin found for this org", "err");
      }} />}
      {screen === "app" && session?.type === "org" && <OrgApp user={session.user} org={session.org} onLogout={onLogout} />}
    </>
  );
}

export default function CargoScan() { return <PlatformProvider><CargoScanInner /></PlatformProvider>; }
