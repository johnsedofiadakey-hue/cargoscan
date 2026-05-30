import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import "./App.css";
import TrackingPage from "./TrackingPage";

const API_BASE = import.meta.env.VITE_API_URL || "https://cargoscan-api.onrender.com/api";
const IOS_TESTFLIGHT_URL = import.meta.env.VITE_IOS_TESTFLIGHT_URL || "";
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDj52I2LmZS4RifzDB_EvFwMsg-NWBasUU",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "cargoscan-app-2026.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "cargoscan-app-2026",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "cargoscan-app-2026.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "655859091408",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:655859091408:web:ed821125f7e0605daf5bd5",
};
const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN });
}

const emptyShipment = { code: "", from: "Guangzhou", to: "Tema", cbmCapacity: "67.2" };
const emptyItem = { shipmentId: "", consigneeId: "", assignedOperatorId: "", description: "", length: "", width: "", height: "", isDamaged: false };
const emptyConsignee = { name: "", phone: "", email: "", shipmentId: "", whatsappOptIn: true };
const emptyContainer = { number: "", type: "40HQ", capacityCbm: "67.2", destination: "Tema", vessel: "", bookingNumber: "", sealNumber: "", shipmentId: "" };

function authHeaders() {
  const token = localStorage.getItem("cs_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("cs_refresh_token");
  if (!refreshToken) return null;

  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) return null;

  const token = data?.token || data?.accessToken;
  if (!token) return null;

  localStorage.setItem("cs_token", token);
  if (data.refreshToken) localStorage.setItem("cs_refresh_token", data.refreshToken);
  return token;
}

async function api(path, options = {}, hasRetried = false) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (response.status === 401 && !hasRetried && path !== "/auth/refresh") {
    const token = await refreshAccessToken();
    if (token) return api(path, options, true);
  }
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

function listData(result) {
  return Array.isArray(result) ? result : result?.data || [];
}

function listMeta(result, fallback = []) {
  if (!Array.isArray(result) && result?.meta) return result.meta;
  return { total: fallback.length, page: 1, pageSize: fallback.length || 50 };
}

function Field({ label, value, onChange, type = "text", required = false, placeholder = "" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options, required = false }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} required={required} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Notice({ type = "info", children }) {
  if (!children) return null;
  // error/success demand immediate screen-reader announcement; info/warn are polite
  const live = type === "error" || type === "success" ? "assertive" : "polite";
  const role = type === "error" ? "alert" : "status";
  return (
    <div className={`notice ${type}`} role={role} aria-live={live}>
      {children}
    </div>
  );
}

function StatusPill({ status }) {
  const value = status || "WAITING_FOR_SCAN";
  const icons = {
    OPEN: "○",
    LOADING: "↻",
    SEALED: "🔒",
    IN_TRANSIT: "→",
    ARRIVED: "✓",
    DELIVERED: "✓✓",
    WAITING_FOR_SCAN: "○",
    NEEDS_REVIEW: "!",
    RESCAN_REQUIRED: "↺",
    READY_TO_LOAD: "✓",
    LOADED: "▣",
  };
  return (
    <span className={`status-pill status-${value.toLowerCase()}`} aria-label={value.replaceAll("_", " ")}>
      <span aria-hidden="true">{icons[value] || "•"}</span>
      {value.replaceAll("_", " ")}
    </span>
  );
}

function EmptyState({ title, description, action, onAction }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">▦</div>
      <strong>{title}</strong>
      <span>{description}</span>
      {action && <button className="primary" type="button" onClick={onAction}>{action}</button>}
    </div>
  );
}

function ConfirmDialog({ confirmState, onCancel, onConfirm }) {
  if (!confirmState) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div className="modal-card confirm-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(event) => event.stopPropagation()}>
        <span className="section-kicker">{confirmState.kicker || "Please confirm"}</span>
        <h2 id="confirm-title">{confirmState.title}</h2>
        <p>{confirmState.message}</p>
        {confirmState.details && <small>{confirmState.details}</small>}
        <div className="button-row confirm-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className={confirmState.danger ? "danger-button" : "primary"} onClick={onConfirm}>
            {confirmState.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadMoreButton({ meta, count, onClick, label = "Load more" }) {
  if (!meta || count >= meta.total) return null;
  return (
    <div className="load-more-row">
      <button type="button" onClick={onClick}>{label}</button>
      <span>{count} of {meta.total} loaded</span>
    </div>
  );
}

function freightCost(item, organization) {
  const rate = Number(item.consignee?.cbmRateOverride || organization?.defaultCbmRate || 85);
  return Number(item.cbm || 0) * rate;
}

function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authNote, setAuthNote] = useState("");
  const [login, setLogin] = useState({ email: "", password: "" });
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [googleOrgToken, setGoogleOrgToken] = useState("");
  const [signup, setSignup] = useState({
    name: "",
    email: "",
    password: "",
    company: "",
    country: "Ghana",
    city: "Accra",
    cbmRate: "85",
  });

  async function googleSignIn() {
    setLoading(true);
    setError("");
    setAuthNote("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(firebaseAuth, provider);
      const idToken = await result.user.getIdToken();
      const data = await api("/auth/firebase", {
        method: "POST",
        body: JSON.stringify({ idToken, mode: "login" }),
      });

      localStorage.setItem("cs_token", data.token);
      if (data.refreshToken) localStorage.setItem("cs_refresh_token", data.refreshToken);
      onLogin({ user: data.user, organization: data.organization });
    } catch (err) {
      if (err.message.includes("No CargoScan account")) {
        const currentUser = firebaseAuth.currentUser;
        const idToken = currentUser ? await currentUser.getIdToken() : "";
        setGoogleOrgToken(idToken);
        setAuthNote("Almost there — tell us about your company.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function finishGoogleSignup(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api("/auth/firebase", {
        method: "POST",
        body: JSON.stringify({
          idToken: googleOrgToken,
          mode: "signup",
          company: signup.company,
          country: signup.country,
          city: signup.city,
          cbmRate: signup.cbmRate,
        }),
      });
      localStorage.setItem("cs_token", data.token);
      if (data.refreshToken) localStorage.setItem("cs_refresh_token", data.refreshToken);
      onLogin({ user: data.user, organization: data.organization });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function requestPasswordReset(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: forgotEmail || login.email }) });
      setForgotOpen(false);
      setAuthNote("Check your email for a secure password reset link.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = mode === "login"
        ? login
        : {
            name: signup.name,
            company: signup.company,
            email: signup.email,
            password: signup.password,
            country: signup.country,
            city: signup.city,
            cbmRate: signup.cbmRate,
          };
      const data = await api(`/auth/${mode === "login" ? "login" : "signup"}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      localStorage.setItem("cs_token", data.token);
      if (data.refreshToken) localStorage.setItem("cs_refresh_token", data.refreshToken);
      onLogin({ user: data.user, organization: data.organization });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-hero" aria-label="CargoScan product overview">
        <div className="auth-orbit">
          <div className="scan-frame">
            <div className="scan-line" />
            <div className="box-wire box-a" />
            <div className="box-wire box-b" />
            <span className="scan-tag tag-top">LiDAR locked</span>
            <span className="scan-tag tag-bottom">76.4% container full</span>
          </div>
        </div>
        <div className="auth-copy">
          <div className="brand-row">
            <div className="brand-mark">CS</div>
            <span>CargoScan Pilot</span>
          </div>
          <h1>Scan cargo, build manifests, and load containers with confidence.</h1>
          <p>Capture dimensions on LiDAR iPhones, review scan quality, assign packages to containers, and keep customers updated from one dashboard.</p>
          <div className="feature-grid">
            <article><strong>LiDAR + AI QC</strong><span>Operator guidance, photos, CBM, and quality scores.</span></article>
            <article><strong>Warehouse inventory</strong><span>Every package tied to image, customer, shipment, and status.</span></article>
            <article><strong>Container loading</strong><span>Move items into containers and watch utilization in real time.</span></article>
            <article><strong>Customer-ready</strong><span>Tracking pages, loading updates, and clean operational handoff.</span></article>
          </div>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card-header">
          <span>{mode === "login" ? "Welcome back" : "Start pilot"}</span>
          <h2>{mode === "login" ? "Sign in to dashboard" : "Create your workspace"}</h2>
        </div>
        <Notice type="error">{error}</Notice>
        <Notice type="info">{authNote}</Notice>
        <button className="google-button" type="button" onClick={googleSignIn}>
          <span className="google-mark">G</span>
          Continue with Google
        </button>
        <div className="auth-divider"><span>or use email</span></div>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <>
              <Field label="Full name" value={signup.name} required onChange={(value) => setSignup({ ...signup, name: value })} />
              <Field label="Company" value={signup.company} required onChange={(value) => setSignup({ ...signup, company: value })} />
              <div className="form-grid">
                <Field label="Country" value={signup.country} required onChange={(value) => setSignup({ ...signup, country: value })} />
                <Field label="City" value={signup.city} required onChange={(value) => setSignup({ ...signup, city: value })} />
              </div>
              <Field label="Default CBM rate" type="number" value={signup.cbmRate} required onChange={(value) => setSignup({ ...signup, cbmRate: value })} />
            </>
          )}
          <Field
            label="Email"
            type="email"
            value={mode === "login" ? login.email : signup.email}
            required
            onChange={(value) => (mode === "login" ? setLogin({ ...login, email: value }) : setSignup({ ...signup, email: value }))}
          />
          <Field
            label="Password"
            type="password"
            value={mode === "login" ? login.password : signup.password}
            required
            onChange={(value) => (mode === "login" ? setLogin({ ...login, password: value }) : setSignup({ ...signup, password: value }))}
          />
          <button className="primary auth-primary" disabled={loading}>{loading ? "Working..." : mode === "login" ? "Enter dashboard" : "Create pilot org"}</button>
        </form>
        {mode === "login" && <button className="link-button" onClick={() => { setForgotEmail(login.email); setForgotOpen(true); }}>Forgot password?</button>}
        <button className="link-button" onClick={() => {
          setError("");
          setAuthNote("");
          setMode(mode === "login" ? "signup" : "login");
        }}>
          {mode === "login" ? "Create a pilot organization" : "Back to sign in"}
        </button>
        <div className="install-strip">
          <strong>Mobile install lives here</strong>
          <span>Operators scan the dashboard QR code to install the LiDAR app through TestFlight.</span>
        </div>
      </section>
      {googleOrgToken && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={finishGoogleSignup}>
            <span className="section-kicker">Google signup</span>
            <h2>Almost there — tell us about your company</h2>
            <p>We found your Google account. Add your freight workspace details and CargoScan will create the pilot organization.</p>
            <Field label="Company" value={signup.company} required onChange={(value) => setSignup({ ...signup, company: value })} />
            <div className="form-grid">
              <Field label="Country" value={signup.country} required onChange={(value) => setSignup({ ...signup, country: value })} />
              <Field label="City" value={signup.city} required onChange={(value) => setSignup({ ...signup, city: value })} />
            </div>
            <Field label="Default CBM rate" type="number" value={signup.cbmRate} required onChange={(value) => setSignup({ ...signup, cbmRate: value })} />
            <div className="button-row">
              <button type="button" onClick={() => setGoogleOrgToken("")}>Cancel</button>
              <button className="primary" disabled={loading}>Create workspace</button>
            </div>
          </form>
        </div>
      )}
      {forgotOpen && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={requestPasswordReset}>
            <h2>Reset your password</h2>
            <p>Enter your account email. We will send a secure reset link if the account exists.</p>
            <Field label="Email" type="email" value={forgotEmail} required onChange={setForgotEmail} />
            <div className="button-row">
              <button type="button" onClick={() => setForgotOpen(false)}>Cancel</button>
              <button className="primary" disabled={loading}>Send reset link</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      setMessage(result.message || "Password updated. You can sign in now.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell reset-shell">
      <section className="auth-card">
        <div className="auth-card-header">
          <span>Password reset</span>
          <h2>Create a new password</h2>
        </div>
        <Notice type="success">{message}</Notice>
        <Notice type="error">{error}</Notice>
        <form onSubmit={submit}>
          <Field label="New password" type="password" value={password} required onChange={setPassword} />
          <button className="primary auth-primary" disabled={loading || !token}>{loading ? "Updating..." : "Update password"}</button>
        </form>
        <a className="link-button" href="/">Back to sign in</a>
      </section>
    </main>
  );
}

function daysRemaining(date) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function BillingCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const status = (params.get("status") || params.get("message") || "").toLowerCase();
  const reference = params.get("reference") || params.get("trxref") || "";
  const isSuccess = status.includes("success") || Boolean(reference);

  return (
    <main className="auth-shell callback-shell">
      <section className="auth-card">
        <div className="auth-card-header">
          <span>Billing</span>
          <h2>{isSuccess ? "Plan upgraded!" : "Payment pending"}</h2>
        </div>
        <p>
          {isSuccess
            ? "Your Paystack payment was received. CargoScan will refresh your plan from the billing webhook."
            : "We are still waiting for payment confirmation. You can return to billing and check again shortly."}
        </p>
        {reference && <small>Reference: {reference}</small>}
        <button className="primary auth-primary" type="button" onClick={() => navigate("/dashboard/billing", { replace: true })}>
          Back to billing
        </button>
      </section>
    </main>
  );
}

export function OperationsCommand({ data, setActive }) {
  const waitingItems = data.items.filter((item) => item.status === "WAITING_FOR_SCAN" || item.status === "SCANNING");
  const reviewItems = data.items.filter((item) => {
    const latestScan = item.scanResults?.[0];
    return item.status === "NEEDS_REVIEW" || item.status === "RESCAN_REQUIRED" || (latestScan?.qualityStatus && latestScan.qualityStatus !== "PASS");
  });
  const readyItems = data.items.filter((item) => item.status === "READY_TO_LOAD");
  const openShipments = data.shipments.filter((shipment) => shipment.status === "OPEN" || shipment.status === "LOADING");

  return (
    <section className="command-center">
      <div className="command-copy">
        <span className="section-kicker">Live warehouse flow</span>
        <h2>Receive, scan, verify, then load.</h2>
        <p>Desktop owns shipments, customers, containers, and review. The iPhone scanner feeds package dimensions, photos, and quality signals back into this workspace.</p>
        <div className="command-actions">
          <button className="primary" onClick={() => setActive("mobile app")}>Install scanner</button>
          <button onClick={() => setActive("containers")}>Load containers</button>
        </div>
      </div>
      <div className="flow-board" aria-label="Warehouse workflow">
        <article>
          <span>1</span>
          <strong>Open shipments</strong>
          <em>{openShipments.length}</em>
        </article>
        <article>
          <span>2</span>
          <strong>Waiting to scan</strong>
          <em>{waitingItems.length}</em>
        </article>
        <article>
          <span>3</span>
          <strong>Need review</strong>
          <em>{reviewItems.length}</em>
        </article>
        <article>
          <span>4</span>
          <strong>Ready to load</strong>
          <em>{readyItems.length}</em>
        </article>
      </div>
    </section>
  );
}

export function WorkQueue({ data }) {
  const queue = data.items
    .filter((item) => !item.containerId && item.status !== "LOADED" && item.status !== "DELIVERED")
    .slice(0, 6);

  return (
    <section className="panel wide queue-panel">
      <div className="panel-title-row">
        <div>
          <span className="section-kicker">Package queue</span>
          <h2>Waiting for container assignment</h2>
        </div>
        <strong>{queue.length} shown</strong>
      </div>
      <div className="queue-list">
        {queue.map((item) => {
          const latestScan = item.scanResults?.[0];
          const statusLabel = item.status || "WAITING_FOR_SCAN";
          return (
            <article key={item.id} className="queue-row">
              <div>
                <strong>{item.description || item.id.slice(0, 8)}</strong>
                <span>{item.shipment?.code || "No shipment"} · {item.consignee?.name || "No customer"}</span>
              </div>
              <span>{item.cbm == null ? "Unmeasured" : `${Number(item.cbm || 0).toFixed(3)} CBM`}</span>
              <span className={`quality-pill quality-${(latestScan?.qualityStatus || "review").toLowerCase()}`}>
                {latestScan?.qualityStatus || statusLabel}
              </span>
            </article>
          );
        })}
        {!queue.length && <p className="empty">No packages are waiting. Create an item or scan from the iPhone app.</p>}
      </div>
    </section>
  );
}

export function ReviewQueue({ data, reload, setMessage, confirm }) {
  const reviewItems = data.items.filter((item) => item.status === "NEEDS_REVIEW" || item.status === "RESCAN_REQUIRED");
  const [photo, setPhoto] = useState("");

  async function setPackageStatus(item, status) {
    await api(`/items/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    setMessage(status === "READY_TO_LOAD" ? "Package approved for loading." : "Package marked for rescan.");
    reload();
  }

  return (
    <section className="panel wide queue-panel">
      <div className="panel-title-row">
        <div>
          <span className="section-kicker">Scan review</span>
          <h2>Exceptions and rescan decisions</h2>
        </div>
        <strong>{reviewItems.length} open</strong>
      </div>
      <div className="queue-list">
        {reviewItems.map((item) => {
          const latestScan = item.scanResults?.[0];
          const reason = latestScan?.qualityReason || "";
          const explanation = reason.toLowerCase().includes("confidence")
            ? "The scan wasn't stable enough. Rescan in better lighting."
            : reason.toLowerCase().includes("outlier")
              ? "Dimensions seem unusual. Verify and rescan."
              : reason.toLowerCase().includes("photo")
                ? "No photo was captured. Rescan to include one."
                : "Review the scan before loading this package.";
          return (
            <article key={item.id} className="queue-row review-row">
              <div>
                <strong>{item.description || item.id.slice(0, 8)}</strong>
                <span>{item.shipment?.code || "No shipment"} · {item.consignee?.name || "No customer"} · {item.status}</span>
                {latestScan?.qualityReason && <small><strong>{latestScan.qualityReason}</strong> — {explanation}</small>}
              </div>
              <span>{item.cbm == null ? "Unmeasured" : `${Number(item.cbm || 0).toFixed(3)} CBM`}</span>
              <div className="button-row">
                {latestScan?.photoUrl && <button onClick={() => setPhoto(latestScan.photoUrl)}>View scan photo</button>}
                <button disabled={item.cbm == null} onClick={() => setPackageStatus(item, "READY_TO_LOAD")}>Approve</button>
                <button onClick={async () => {
                  const ok = await confirm({
                    title: "Reset this scan?",
                    message: "This will reset the scan status and ask the operator to rescan in better lighting.",
                    confirmLabel: "Reset scan",
                  });
                  if (ok) setPackageStatus(item, "RESCAN_REQUIRED");
                }}>Rescan</button>
              </div>
            </article>
          );
        })}
        {!reviewItems.length && <p className="empty">No scan exceptions waiting for supervisor review.</p>}
      </div>
      {photo && <div className="modal-backdrop" onClick={() => setPhoto("")}><div className="modal-card photo-card"><img src={photo} alt="Scan" /></div></div>}
    </section>
  );
}

export function ShipmentsTab({ data, reload, setMessage, organization, confirm, loadMore }) {
  const [form, setForm] = useState(emptyShipment);
  const [item, setItem] = useState(emptyItem);
  const [search, setSearch] = useState("");
  const [itemFilter, setItemFilter] = useState("ALL");
  const [exporting, setExporting] = useState("");

  // Only OPEN/LOADING shipments can receive new items
  const mutableShipmentOptions = useMemo(() => [
    { value: "", label: "Select shipment" },
    ...data.shipments
      .filter((s) => s.status === "OPEN" || s.status === "LOADING")
      .map((s) => ({ value: s.id, label: s.code })),
  ], [data.shipments]);

  const consigneeOptions = useMemo(() => [
    { value: "", label: "No consignee" },
    ...data.consignees.map((consignee) => ({ value: consignee.id, label: consignee.name })),
  ], [data.consignees]);
  const operatorOptions = useMemo(() => [
    { value: "", label: "Assign later" },
    ...data.users.filter((user) => user.active && user.role !== "ADMIN").map((user) => ({ value: user.id, label: user.name })),
  ], [data.users]);

  async function createShipment(event) {
    event.preventDefault();
    await api("/shipments", { method: "POST", body: JSON.stringify({ ...form, cbmCapacity: Number(form.cbmCapacity) }) });
    setForm(emptyShipment);
    setMessage("Shipment created.");
    reload();
  }

  async function createItem(event) {
    event.preventDefault();
    await api("/items", {
      method: "POST",
      body: JSON.stringify({
        ...item,
        consigneeId: item.consigneeId || null,
        assignedOperatorId: item.assignedOperatorId || null,
        length: item.length === "" ? undefined : Number(item.length),
        width: item.width === "" ? undefined : Number(item.width),
        height: item.height === "" ? undefined : Number(item.height),
      }),
    });
    setItem(emptyItem);
    setMessage("Cargo item created.");
    reload();
  }

  async function saveManualScan(cargoItem) {
    if (cargoItem.length == null || cargoItem.width == null || cargoItem.height == null || cargoItem.cbm == null) {
      setMessage("Add dimensions before saving a manual scan.");
      return;
    }
    await api("/scans", {
      method: "POST",
      body: JSON.stringify({
        cargoItemId: cargoItem.id,
        length: Number(cargoItem.length),
        width: Number(cargoItem.width),
        height: Number(cargoItem.height),
        cbm: Number(cargoItem.cbm),
        confidence: 0.8,
        scannerDevice: "Web manual entry",
        source: "MANUAL",
      }),
    });
    setMessage("Manual scan saved.");
    reload();
  }
  async function exportPackingList(shipment) {
    setExporting(shipment.id);
    try {
      const response = await fetch(`${API_BASE}/shipments/${shipment.id}/export`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Could not generate packing list");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${shipment.code}-packing-list.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setExporting("");
    }
  }

  const visibleShipments = data.shipments.filter((shipment) => {
    const haystack = `${shipment.code} ${shipment.status} ${shipment.from} ${shipment.to}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });
  const visibleItems = data.items.filter((cargoItem) => itemFilter === "ALL" || cargoItem.status === itemFilter);

  return (
    <div className="tab-grid">
      <WorkQueue data={data} />
      <ReviewQueue data={data} reload={reload} setMessage={setMessage} confirm={confirm} />
      <section className="panel">
        <h2>Create shipment</h2>
        <form onSubmit={createShipment}>
          <Field label="Code" value={form.code} required placeholder="SHP-2026-002" onChange={(value) => setForm({ ...form, code: value })} />
          <div className="form-grid">
            <Field label="From" value={form.from} required onChange={(value) => setForm({ ...form, from: value })} />
            <Field label="To" value={form.to} required onChange={(value) => setForm({ ...form, to: value })} />
          </div>
          <Field label="CBM capacity" type="number" value={form.cbmCapacity} required onChange={(value) => setForm({ ...form, cbmCapacity: value })} />
          <button className="primary">Create shipment</button>
        </form>
      </section>

      <section className="panel">
        <h2>Create cargo item</h2>
        {mutableShipmentOptions.length <= 1 && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0 0 12px" }}>
            No open shipments. Create a shipment first, or reopen one that&apos;s sealed.
          </p>
        )}
        <form onSubmit={createItem}>
          <SelectField label="Shipment" value={item.shipmentId} required options={mutableShipmentOptions} onChange={(value) => setItem({ ...item, shipmentId: value })} />
          <SelectField label="Consignee" value={item.consigneeId} options={consigneeOptions} onChange={(value) => setItem({ ...item, consigneeId: value })} />
          <SelectField label="Assigned operator" value={item.assignedOperatorId} options={operatorOptions} onChange={(value) => setItem({ ...item, assignedOperatorId: value })} />
          <Field label="Description" value={item.description} onChange={(value) => setItem({ ...item, description: value })} />
          <div className="form-grid">
            <Field label="Length" type="number" value={item.length} placeholder="Scan later" onChange={(value) => setItem({ ...item, length: value })} />
            <Field label="Width" type="number" value={item.width} placeholder="Scan later" onChange={(value) => setItem({ ...item, width: value })} />
            <Field label="Height" type="number" value={item.height} placeholder="Scan later" onChange={(value) => setItem({ ...item, height: value })} />
          </div>
          <button className="primary">Create package</button>
        </form>
      </section>

      <section className="panel wide">
        <h2>Shipments</h2>
        <div className="filter-bar">
          <input placeholder="Search code, status, or route" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Route</th><th>Status</th><th>Items</th><th>CBM</th><th>Cost</th><th>Actions</th></tr></thead>
            <tbody>
              {visibleShipments.map((shipment) => {
                const cost = (shipment.cargoItems || []).reduce((sum, item) => sum + freightCost(item, organization), 0);
                const ready = (shipment.cargoItems || []).filter((i) => i.status === "READY_TO_LOAD").length;
                const review = (shipment.cargoItems || []).filter((i) => i.status === "NEEDS_REVIEW" || i.status === "RESCAN_REQUIRED").length;
                const waiting = (shipment.cargoItems || []).filter((i) => i.status === "WAITING_FOR_SCAN" || i.status === "SCANNING").length;
                const loadedPct = shipment.itemsCount ? Math.round(((shipment.cargoItems || []).filter((i) => i.status === "LOADED").length / shipment.itemsCount) * 100) : 0;
                return (
                <tr key={shipment.id}>
                  <td>{shipment.code}</td>
                  <td>{shipment.from} → {shipment.to}<small>Ready: {ready} · Review: {review} · Waiting: {waiting} — {loadedPct}% loaded</small></td>
                  <td><StatusPill status={shipment.status} /></td>
                  <td>{shipment.itemsCount}</td>
                  <td>{Number(shipment.totalCbm || 0).toFixed(3)}</td>
                  <td>${cost.toFixed(2)}</td>
                  <td className="button-row"><a href={`/tracking/${shipment.trackingCode}`} target="_blank" rel="noreferrer">Track</a><button onClick={() => exportPackingList(shipment)}>{exporting === shipment.id ? "Generating..." : "Export"}</button></td>
                </tr>
              );})}
            </tbody>
          </table>
          {!data.shipments.length && <EmptyState title="No shipments yet" description="Create a shipment to group cargo by route and destination." action="Create your first shipment" />}
        </div>
        <LoadMoreButton meta={data.meta?.shipments} count={data.shipments.length} onClick={() => loadMore("shipments")} label="Load more shipments" />
      </section>

      <section className="panel wide">
        <h2>Cargo items</h2>
        <div className="filter-bar">
          {["ALL", "WAITING_FOR_SCAN", "NEEDS_REVIEW", "READY_TO_LOAD", "LOADED"].map((status) => (
            <button key={status} className={itemFilter === status ? "active" : ""} onClick={() => setItemFilter(status)}>{status.replaceAll("_", " ")}</button>
          ))}
        </div>
        <div className="cards">
          {visibleItems.map((cargoItem) => (
            <article key={cargoItem.id} className="item-card">
              {(() => {
                const latestScan = cargoItem.scanResults?.[0];
                return latestScan?.qualityStatus ? (
                  <span className={`quality-pill quality-${latestScan.qualityStatus.toLowerCase()}`}>
                    {latestScan.qualityStatus} · {Math.round(Number(latestScan.qualityScore || 0) * 100)}%
                  </span>
                ) : null;
              })()}
              <strong>{cargoItem.description || cargoItem.id.slice(0, 8)}</strong>
              <span>{cargoItem.shipment?.code} · {cargoItem.cbm == null ? "Unmeasured" : `${Number(cargoItem.cbm || 0).toFixed(3)} CBM`} · <StatusPill status={cargoItem.status} /></span>
              <span>Cost: ${freightCost(cargoItem, organization).toFixed(2)}</span>
              {cargoItem.assignedOperator && <small>Assigned to {cargoItem.assignedOperator.name}</small>}
              {cargoItem.isDamaged && <span className="damage-badge">Damaged{cargoItem.damagePhotoUrl ? " · photo attached" : ""}</span>}
              {cargoItem.scanResults?.[0]?.qualityReason && (
                <small>{cargoItem.scanResults[0].qualityReason}</small>
              )}
              <div className="button-row">
                <button disabled={cargoItem.length == null || cargoItem.width == null || cargoItem.height == null} onClick={() => saveManualScan(cargoItem)}>Save manual scan</button>
                <a href={`/tracking/${cargoItem.trackingCode}`} target="_blank" rel="noreferrer">Track item</a>
              </div>
            </article>
          ))}
          {!data.items.length && <EmptyState title="No cargo items yet" description="Create a package now, then scan it from the iPhone app when it arrives." action="Create your first cargo item" />}
        </div>
        <LoadMoreButton meta={data.meta?.items} count={data.items.length} onClick={() => loadMore("items")} label="Load more cargo items" />
      </section>
    </div>
  );
}

export function CustomersTab({ data, reload, setMessage, confirm, loadMore }) {
  const [form, setForm] = useState(emptyConsignee);
  const [search, setSearch] = useState("");
  const shipmentOptions = [
    { value: "", label: "No shipment" },
    ...data.shipments.map((shipment) => ({ value: shipment.id, label: shipment.code })),
  ];

  async function createConsignee(event) {
    event.preventDefault();
    await api("/consignees", { method: "POST", body: JSON.stringify({ ...form, shipmentId: form.shipmentId || null }) });
    setForm(emptyConsignee);
    setMessage("Customer created.");
    reload();
  }
  async function deleteConsignee(consignee) {
    const ok = await confirm({
      title: `Remove ${consignee.name}?`,
      message: "Remove this customer from your customer list?",
      confirmLabel: "Remove customer",
      danger: true,
    });
    if (!ok) return;
    await api(`/consignees/${consignee.id}`, { method: "DELETE" });
    setMessage("Customer removed.");
    reload();
  }
  const visibleConsignees = data.consignees.filter((consignee) => `${consignee.name} ${consignee.phone}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="tab-grid">
      <section className="panel">
        <h2>Add customer</h2>
        <form onSubmit={createConsignee}>
          <Field label="Name" value={form.name} required onChange={(value) => setForm({ ...form, name: value })} />
          <Field label="Phone" value={form.phone} required onChange={(value) => setForm({ ...form, phone: value })} />
          <Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
          <SelectField label="Shipment" value={form.shipmentId} options={shipmentOptions} onChange={(value) => setForm({ ...form, shipmentId: value })} />
          <label className="check-row">
            <input type="checkbox" checked={form.whatsappOptIn} onChange={(event) => setForm({ ...form, whatsappOptIn: event.target.checked })} />
            WhatsApp opt-in
          </label>
          <button className="primary">Add customer</button>
        </form>
      </section>
      <section className="panel wide">
        <h2>Customers</h2>
        <div className="filter-bar"><input placeholder="Search by name or phone" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="cards">
          {visibleConsignees.map((consignee) => (
            <article key={consignee.id} className="item-card">
              <strong>{consignee.name}</strong>
              <span>{consignee.phone} · {consignee.email || "No email"} · {consignee.whatsappOptIn ? "WhatsApp enabled" : "WhatsApp off"}</span>
              <button onClick={() => deleteConsignee(consignee)}>Delete</button>
            </article>
          ))}
          {!data.consignees.length && <EmptyState title="No customers yet" description="Customers receive shipment tracking and WhatsApp updates." action="Add your first customer" />}
        </div>
        <LoadMoreButton meta={data.meta?.consignees} count={data.consignees.length} onClick={() => loadMore("consignees")} label="Load more customers" />
      </section>
    </div>
  );
}

export function ContainersTab({ data, reload, setMessage, setError, confirm, loadMore }) {
  const [form, setForm] = useState(emptyContainer);
  const [selectedContainerId, setSelectedContainerId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [search, setSearch] = useState("");

  const shipmentOptions = [
    { value: "", label: "No linked shipment" },
    ...data.shipments.map((shipment) => ({ value: shipment.id, label: shipment.code })),
  ];
  const containerOptions = [
    { value: "", label: "Select container" },
    ...data.containers.map((container) => ({ value: container.id, label: `${container.number} · ${container.type}` })),
  ];
  const availableItems = data.items.filter((item) => !item.containerId && item.status === "READY_TO_LOAD");
  const itemOptions = [
    { value: "", label: "Select scanned package" },
    ...availableItems.map((item) => ({
      value: item.id,
      label: `${item.description || item.id.slice(0, 8)} · ${Number(item.cbm || 0).toFixed(3)} CBM · ${item.consignee?.name || "No customer"}`,
    })),
  ];

  async function createContainer(event) {
    event.preventDefault();
    await api("/containers", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        capacityCbm: Number(form.capacityCbm),
        shipmentId: form.shipmentId || null,
      }),
    });
    setForm(emptyContainer);
    setMessage("Container created.");
    reload();
  }

  async function assignItem(event) {
    event.preventDefault();
    await api(`/containers/${selectedContainerId}/items`, {
      method: "POST",
      body: JSON.stringify({ cargoItemId: selectedItemId }),
    });
    setSelectedItemId("");
    setMessage("Package moved to container.");
    reload();
  }

  async function removeItem(containerId, itemId) {
    const item = data.items.find((entry) => entry.id === itemId);
    const ok = await confirm({
      title: `Remove ${item?.description || "this package"}?`,
      message: "Remove this package from the container manifest?",
      confirmLabel: "Remove package",
      danger: true,
    });
    if (!ok) return;
    await api(`/containers/${containerId}/items/${itemId}`, { method: "DELETE" });
    setMessage("Package removed from container.");
    reload();
  }
  async function sealContainer(container) {
    const reviewCount = (container.cargoItems || []).filter((item) => item.status === "NEEDS_REVIEW" || item.status === "RESCAN_REQUIRED").length;
    const ok = await confirm({
      title: `Seal container ${container.number}?`,
      message: `This locks ${container.cargoItems?.length || 0} packages and queues customer notifications.`,
      details: `${Number(container.totalCbm || 0).toFixed(3)} / ${Number(container.capacityCbm || 0).toFixed(1)} CBM${reviewCount ? ` · ${reviewCount} packages still need review` : ""}`,
      confirmLabel: "Seal container",
    });
    if (!ok) return;
    await api(`/containers/${container.id}/seal`, { method: "POST", body: JSON.stringify({ confirmWithReviewItems: true }) });
    setMessage("Container sealed.");
    reload();
  }
  const visibleContainers = data.containers.filter((container) => `${container.number} ${container.status} ${container.type}`.toLowerCase().includes(search.toLowerCase()));

  async function checkLiveTracking(containerId) {
    try {
      const result = await api(`/containers/${containerId}/tracking`);
      setMessage(result.message || `Tracking status: ${result.status}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="tab-grid">
      <section className="panel">
        <h2>Create container</h2>
        <form onSubmit={createContainer}>
          <Field label="Container number" value={form.number} required placeholder="MSCU1234567" onChange={(value) => setForm({ ...form, number: value.toUpperCase() })} />
          <div className="form-grid">
            <SelectField label="Type" value={form.type} onChange={(value) => setForm({ ...form, type: value, capacityCbm: value === "20FT" ? "28" : value === "40FT" ? "55.8" : "67.2" })} options={[
              { value: "20FT", label: "20ft" },
              { value: "40FT", label: "40ft" },
              { value: "40HQ", label: "40HQ" },
            ]} />
            <Field label="Capacity CBM" type="number" value={form.capacityCbm} required onChange={(value) => setForm({ ...form, capacityCbm: value })} />
          </div>
          <SelectField label="Shipment" value={form.shipmentId} options={shipmentOptions} onChange={(value) => setForm({ ...form, shipmentId: value })} />
          <Field label="Destination" value={form.destination} onChange={(value) => setForm({ ...form, destination: value })} />
          <div className="form-grid">
            <Field label="Vessel" value={form.vessel} onChange={(value) => setForm({ ...form, vessel: value })} />
            <Field label="Booking number" value={form.bookingNumber} onChange={(value) => setForm({ ...form, bookingNumber: value })} />
          </div>
          <Field label="Seal number" value={form.sealNumber} onChange={(value) => setForm({ ...form, sealNumber: value })} />
          <button className="primary">Create container</button>
        </form>
      </section>

      <section className="panel">
        <h2>Move package to container</h2>
        <form onSubmit={assignItem}>
          <SelectField label="Container" value={selectedContainerId} required options={containerOptions} onChange={setSelectedContainerId} />
          <SelectField label="Package" value={selectedItemId} required options={itemOptions} onChange={setSelectedItemId} />
          <button className="primary" disabled={!selectedContainerId || !selectedItemId}>Move package</button>
        </form>
        <p className="empty">{availableItems.length} ready packages waiting for loading.</p>
      </section>

      <section className="panel wide">
        <h2>Containers</h2>
        <div className="filter-bar"><input placeholder="Search containers by number, type, or status" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="cards">
          {visibleContainers.map((container) => (
            <article key={container.id} className="item-card manifest-card">
              <strong>{container.number} · {container.type}</strong>
              <span><StatusPill status={container.status} /> · {Number(container.totalCbm || 0).toFixed(3)} / {Number(container.capacityCbm || 0).toFixed(1)} CBM · {container.utilization || 0}% full</span>
              {container.utilization > 100 && <Notice type="error">Overfilled — remove packages before sealing.</Notice>}
              <div
                className={`progress ${container.utilization > 95 ? "danger" : container.utilization > 80 ? "warn" : ""}`}
                role="progressbar"
                aria-valuenow={Math.min(container.utilization || 0, 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Container ${container.number} — ${container.utilization || 0}% full`}
                title={`${Number(container.totalCbm || 0).toFixed(1)} of ${Number(container.capacityCbm || 0).toFixed(1)} CBM used — room for ~${Math.max(0, Math.floor(((container.capacityCbm || 0) - (container.totalCbm || 0)) / 0.064))} more 40cm packages`}
              >
                <span style={{ width: `${Math.min(container.utilization || 0, 100)}%` }} />
              </div>
              <small>{container.destination || "No destination"} · {container.itemsCount || 0} packages · {container.customerCount || 0} customers</small>
              <div className="button-row">
                <button onClick={() => checkLiveTracking(container.id)}>Live tracking</button>
                <button onClick={() => sealContainer(container)}>Seal container</button>
              </div>
              <div className="manifest-list">
                {(container.cargoItems || []).map((item) => (
                  <div key={item.id} className="manifest-row">
                    <span>{item.description || item.id.slice(0, 8)} · {Number(item.cbm || 0).toFixed(3)} CBM · {item.consignee?.name || "No customer"}</span>
                    <button onClick={() => removeItem(container.id, item.id)}>Remove</button>
                  </div>
                ))}
              </div>
            </article>
          ))}
          {!data.containers.length && <EmptyState title="No containers yet" description="Create a container to start building a loading manifest." action="Create container" />}
        </div>
        <LoadMoreButton meta={data.meta?.containers} count={data.containers.length} onClick={() => loadMore("containers")} label="Load more containers" />
      </section>
    </div>
  );
}

export function TeamTab({ data, reload, setMessage, confirm, loadMore }) {
  const [form, setForm] = useState({ name: "", email: "", role: "OPERATOR" });

  async function createUser(event) {
    event.preventDefault();
    await api("/users", { method: "POST", body: JSON.stringify(form) });
    const invitedEmail = form.email;
    setForm({ name: "", email: "", role: "OPERATOR" });
    setMessage(`Invite sent — they'll receive login instructions by email. Invite sent to ${invitedEmail}.`);
    reload();
  }
  async function toggleUser(user) {
    const ok = await confirm({
      title: `${user.active ? "Deactivate" : "Reactivate"} ${user.name}?`,
      message: user.active ? "They won't be able to log in until reactivated." : "They will regain access to CargoScan.",
      confirmLabel: user.active ? "Deactivate" : "Reactivate",
      danger: user.active,
    });
    if (!ok) return;
    await api(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ active: !user.active }) });
    setMessage(user.active ? "Team member deactivated." : "Team member reactivated.");
    reload();
  }

  return (
    <div className="tab-grid">
      <section className="panel">
        <h2>Invite team member</h2>
        <form onSubmit={createUser}>
          <Field label="Name" value={form.name} required onChange={(value) => setForm({ ...form, name: value })} />
          <Field label="Email" type="email" value={form.email} required onChange={(value) => setForm({ ...form, email: value })} />
          <SelectField label="Role" value={form.role} onChange={(value) => setForm({ ...form, role: value })} options={[
            { value: "OPERATOR", label: "Operator" },
            { value: "SUPERVISOR", label: "Supervisor" },
            { value: "ADMIN", label: "Admin" },
          ]} />
          <button className="primary">Create user</button>
        </form>
      </section>
      <section className="panel wide">
        <h2>Team</h2>
        <div className="cards">
          {data.users.map((user) => (
            <article key={user.id} className="item-card">
              <strong>{user.name}</strong>
              <span>{user.email} · {user.role} · {user.active ? "Active" : "Disabled"}</span>
              <button onClick={() => toggleUser(user)}>{user.active ? "Deactivate" : "Reactivate"}</button>
            </article>
          ))}
          {!data.users.length && <EmptyState title="No team members yet" description="Invite operators so they can sign in and scan packages." action="Invite operator" />}
        </div>
        <LoadMoreButton meta={data.meta?.users} count={data.users.length} onClick={() => loadMore("users")} label="Load more team members" />
      </section>
    </div>
  );
}

export function MobileAppTab({ session }) {
  useEffect(() => {
    localStorage.setItem("cs_mobile_seen", "1");
  }, []);
  const installUrl = IOS_TESTFLIGHT_URL;
  const qrUrl = installUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=14&data=${encodeURIComponent(installUrl)}`
    : "";

  return (
    <div className="tab-grid install-grid">
      <section className="panel install-hero-panel">
        <div>
          <span className="section-kicker">Operator app</span>
          <h2>Install CargoScan LiDAR on warehouse iPhones</h2>
          <p>The mobile app is for operators scanning cargo. The desktop dashboard stays here for admins, manifests, customers, containers, billing, and team setup.</p>
        </div>
        <div className="install-status-row">
          <span className="status-dot live" /> Dashboard connected
          <span className="status-dot pending" /> TestFlight pending
        </div>
      </section>

      <section className="panel qr-panel">
        <h2>Download QR</h2>
        {qrUrl ? (
          <>
            <img className="qr-code" src={qrUrl} alt="CargoScan iOS TestFlight QR code" />
            <a className="primary install-link" href={installUrl} target="_blank" rel="noreferrer">Open TestFlight link</a>
          </>
        ) : (
          <div className="qr-placeholder" aria-label="TestFlight QR code not configured">
            <span />
            <strong>QR appears after TestFlight setup</strong>
          </div>
        )}
        <small>{installUrl ? "Operators scan this with a LiDAR-enabled iPhone." : "No public download link exists yet. Today we install from Xcode; the next release step is TestFlight."}</small>
      </section>

      <section className="panel download-card">
        <span className="section-kicker">Current install method</span>
        <h2>Install on your iPhone now</h2>
        <p>Connect your LiDAR iPhone to this Mac, open the Xcode project, select your phone, and press Run.</p>
        <code>/Users/truth/cargoscan/cargoscan-ios-project/Cargoscan.xcodeproj</code>
        <small>After TestFlight is ready, this panel becomes a QR download link for operators.</small>
      </section>

      <section className="panel">
        <h2>Supported devices</h2>
        <div className="install-checklist">
          <span>iPhone Pro with LiDAR, iPhone 12 Pro or newer Pro models</span>
          <span>Camera and motion permissions enabled</span>
          <span>Operator has a CargoScan user account</span>
          <span>Backend API points to Render production</span>
        </div>
      </section>

      <section className="panel">
        <h2>Install flow</h2>
        <div className="install-steps">
          <span>1. Admin opens this dashboard page.</span>
          <span>2. Operator scans the QR code.</span>
          <span>3. TestFlight installs CargoScan Mobile.</span>
          <span>4. Operator logs in and scans linked cargo items.</span>
        </div>
      </section>

      <section className="panel wide">
        <h2>Workspace install profile</h2>
        <div className="cards three">
          <article className="item-card">
            <strong>{session.organization?.name || "CargoScan"}</strong>
            <span>Tenant workspace</span>
          </article>
          <article className="item-card">
            <strong>{session.organization?.plan || "TRIAL"}</strong>
            <span>Current plan</span>
          </article>
          <article className="item-card">
            <strong>iOS Pilot</strong>
            <span>{installUrl ? "Ready for operator install" : "Waiting for TestFlight link"}</span>
          </article>
        </div>
      </section>
    </div>
  );
}

export function BillingTab({ organization, setMessage, confirm }) {
  useEffect(() => {
    if (window.location.search.includes("upgraded=true")) setMessage("Plan upgraded!");
  }, [setMessage]);
  async function upgrade(plan) {
    const price = plan === "STARTER" ? "$29" : plan === "BUSINESS" ? "$79" : "$199";
    const ok = await confirm({
      title: `Upgrade to ${plan}?`,
      message: `Upgrade to ${plan} for ${price}/month.`,
      details: "Includes higher limits, team workflows, customer visibility, and integrations based on plan.",
      confirmLabel: "Continue to Paystack",
    });
    if (!ok) return;
    const result = await api("/billing/init", { method: "POST", body: JSON.stringify({ plan }) });
    setMessage(`Paystack checkout initialized for ${plan}.`);
    if (result.authorization_url) window.location.href = result.authorization_url;
  }

  return (
    <section className="panel">
      <h2>Billing</h2>
      <p>Your current plan is <strong>{organization?.plan || "TRIAL"}</strong>.</p>
      {organization?.plan !== "TRIAL" && <p>Next billing date: {organization?.planExpiresAt ? new Date(organization.planExpiresAt).toLocaleDateString() : "Not available"}</p>}
      <div className="cards three">
        {["STARTER", "BUSINESS", "ENTERPRISE"].map((plan) => (
          <article key={plan} className="price-card">
            <strong>{plan}</strong>
            <span>{plan === "STARTER" ? "$29" : plan === "BUSINESS" ? "$79" : "$199"} / month</span>
            <small>{plan === "ENTERPRISE" ? "Includes live container tracking and custom integrations." : plan === "BUSINESS" ? "Includes WhatsApp, disputes, and higher limits." : "For small pilot teams."}</small>
            <button onClick={() => upgrade(plan)}>Upgrade</button>
            {plan === "ENTERPRISE" && <a href="mailto:sales@cargoscan.app">Contact us for custom pricing</a>}
          </article>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Feature</th><th>Starter</th><th>Business</th><th>Enterprise</th></tr></thead>
          <tbody>
            <tr><td>Shipments</td><td>Small pilot</td><td>Growing warehouse</td><td>Multi-site</td></tr>
            <tr><td>WhatsApp updates</td><td>Limited</td><td>Included</td><td>Included</td></tr>
            <tr><td>Container tracking</td><td>Manual</td><td>Manual</td><td>Live provider-ready</td></tr>
            <tr><td>Integrations</td><td>API keys</td><td>API + webhooks</td><td>Custom support</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SettingsTab({ session, setSession, data, reload, setMessage, confirm, loadMore }) {
  const [orgForm, setOrgForm] = useState({
    name: session.organization?.name || "",
    country: session.organization?.country || "",
    city: session.organization?.city || "",
    defaultCbmRate: session.organization?.defaultCbmRate || 85,
    logoUrl: session.organization?.logoUrl || "",
  });
  const [keyForm, setKeyForm] = useState({ name: "", scopes: ["items:read", "shipments:read"] });
  const [newKey, setNewKey] = useState("");
  const [webhookForm, setWebhookForm] = useState({ name: "", url: "", events: ["scan.created"] });
  const [calc, setCalc] = useState({ cbm: "12", rate: orgForm.defaultCbmRate || "85" });

  async function saveOrg(event) {
    event.preventDefault();
    const organization = await api("/auth/organization", { method: "PUT", body: JSON.stringify(orgForm) });
    setSession({ ...session, organization });
    setMessage("Organization settings saved.");
  }

  async function createKey(event) {
    event.preventDefault();
    const created = await api("/keys", { method: "POST", body: JSON.stringify(keyForm) });
    setNewKey(created.secret);
    setKeyForm({ name: "", scopes: ["items:read", "shipments:read"] });
    reload();
  }

  async function revokeKey(id) {
    const ok = await confirm({
      title: "Revoke this API key?",
      message: "Integrations using it will stop working immediately.",
      confirmLabel: "Revoke key",
      danger: true,
    });
    if (!ok) return;
    await api(`/keys/${id}`, { method: "DELETE" });
    setMessage("API key revoked.");
    reload();
  }

  async function createWebhook(event) {
    event.preventDefault();
    await api("/webhooks", { method: "POST", body: JSON.stringify(webhookForm) });
    setWebhookForm({ name: "", url: "", events: ["scan.created"] });
    setMessage("Webhook added.");
    reload();
  }

  const revenue = Number(calc.cbm || 0) * Number(calc.rate || 0);

  return (
    <div className="tab-grid">
      <section className="panel">
        <h2>Organization settings</h2>
        <form onSubmit={saveOrg}>
          <Field label="Company name" value={orgForm.name} required onChange={(value) => setOrgForm({ ...orgForm, name: value })} />
          <div className="form-grid">
            <Field label="Country" value={orgForm.country} required onChange={(value) => setOrgForm({ ...orgForm, country: value })} />
            <Field label="City" value={orgForm.city} required onChange={(value) => setOrgForm({ ...orgForm, city: value })} />
          </div>
          <Field label="Default CBM rate" type="number" value={orgForm.defaultCbmRate} required onChange={(value) => setOrgForm({ ...orgForm, defaultCbmRate: value })} />
          <Field label="Logo URL" value={orgForm.logoUrl} onChange={(value) => setOrgForm({ ...orgForm, logoUrl: value })} />
          <button className="primary">Save settings</button>
        </form>
      </section>

      <section className="panel">
        <h2>CBM rate calculator</h2>
        <div className="form-grid">
          <Field label="CBM" type="number" value={calc.cbm} onChange={(value) => setCalc({ ...calc, cbm: value })} />
          <Field label="Rate" type="number" value={calc.rate} onChange={(value) => setCalc({ ...calc, rate: value })} />
        </div>
        <div className="metric"><span>Estimated revenue</span><strong>${revenue.toFixed(2)}</strong></div>
      </section>

      <section className="panel wide">
        <h2>API keys</h2>
        {newKey && <Notice type="success">This key will not be shown again: {newKey}</Notice>}
        <form onSubmit={createKey} className="inline-form">
          <Field label="Key name" value={keyForm.name} required onChange={(value) => setKeyForm({ ...keyForm, name: value })} />
          <button className="primary">Create API key</button>
        </form>
        <div className="cards">
          {data.apiKeys.map((key) => (
            <article key={key.id} className="item-card">
              <strong>{key.name}</strong>
              <span>{key.prefix} · {key.scopes} · Last used {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "never"}</span>
              <button onClick={() => revokeKey(key.id)}>Revoke</button>
            </article>
          ))}
          {!data.apiKeys.length && <EmptyState title="No API keys yet" description="Create a key when a scanner, partner, or internal tool needs API access." action="Create API key" />}
        </div>
        <LoadMoreButton meta={data.meta?.apiKeys} count={data.apiKeys.length} onClick={() => loadMore("apiKeys")} label="Load more API keys" />
      </section>

      <section className="panel wide">
        <h2>Webhooks</h2>
        <form onSubmit={createWebhook}>
          <Field label="Name" value={webhookForm.name} required onChange={(value) => setWebhookForm({ ...webhookForm, name: value })} />
          <Field label="Endpoint URL" value={webhookForm.url} required onChange={(value) => setWebhookForm({ ...webhookForm, url: value })} />
          <button className="primary">Add webhook</button>
        </form>
        <div className="cards">
          {data.webhooks.map((webhook) => (
            <article key={webhook.id} className="item-card">
              <strong>{webhook.name}</strong>
              <span>{webhook.url} · {webhook.eventFilter} · failures {webhook.failureCounter}</span>
            </article>
          ))}
          {!data.webhooks.length && <EmptyState title="No webhooks yet" description="Send scan and shipment events to your own systems." action="Add webhook" />}
        </div>
        <LoadMoreButton meta={data.meta?.webhooks} count={data.webhooks.length} onClick={() => loadMore("webhooks")} label="Load more webhooks" />
      </section>

      <section className="panel wide">
        <h2>Activity</h2>
        <div className="queue-list">
          {data.auditLogs.map((log) => (
            <article key={log.id} className="queue-row">
              <div>
                <strong>{log.action} · {log.target || "System"}</strong>
                <span>{new Date(log.createdAt).toLocaleString()}</span>
              </div>
              <span>{log.targetId || "n/a"}</span>
            </article>
          ))}
          {!data.auditLogs.length && <EmptyState title="No activity yet" description="Actions by admins and operators will appear here." />}
        </div>
        <LoadMoreButton meta={data.meta?.auditLogs} count={data.auditLogs.length} onClick={() => loadMore("auditLogs")} label="Load more activity" />
      </section>
    </div>
  );
}

export function PlatformControlCenter({ session, onLogout }) {
  const [orgs, setOrgs] = useState([]);
  const [subs, setSubs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [meta, setMeta] = useState({});
  const [health, setHealth] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [planOverride, setPlanOverride] = useState({ orgId: "", plan: "BUSINESS", days: "30" });

  const load = useCallback(async () => {
    const [orgRes, subRes, auditRes, healthRes] = await Promise.allSettled([
      api("/admin/organizations?page=1&pageSize=50"),
      api("/admin/subscriptions?page=1&pageSize=50"),
      api("/admin/audit-logs?page=1&pageSize=50"),
      fetch(`${API_BASE}/health`, { headers: authHeaders() }).then(async (response) => {
        const text = await response.text();
        return text ? JSON.parse(text) : null;
      }),
    ]);

    if (orgRes.status === "fulfilled") {
      const rows = listData(orgRes.value);
      setOrgs(rows);
      setMeta((current) => ({ ...current, orgs: listMeta(orgRes.value, rows) }));
    }
    if (subRes.status === "fulfilled") {
      const rows = listData(subRes.value);
      setSubs(rows);
      setMeta((current) => ({ ...current, subs: listMeta(subRes.value, rows) }));
    }
    if (auditRes.status === "fulfilled") {
      const rows = listData(auditRes.value);
      setAuditLogs(rows);
      setMeta((current) => ({ ...current, auditLogs: listMeta(auditRes.value, rows) }));
    }
    if (healthRes.status === "fulfilled") setHealth(healthRes.value);

    const firstError = [orgRes, subRes, auditRes, healthRes].find((result) => result.status === "rejected");
    setError(firstError ? firstError.reason.message : "");
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadMorePlatform(kind) {
    const config = {
      orgs: { path: "/admin/organizations", rows: orgs, setRows: setOrgs },
      subs: { path: "/admin/subscriptions", rows: subs, setRows: setSubs },
      auditLogs: { path: "/admin/audit-logs", rows: auditLogs, setRows: setAuditLogs },
    }[kind];
    const current = meta[kind];
    if (!config || !current || config.rows.length >= current.total) return;
    try {
      const result = await api(`${config.path}?page=${current.page + 1}&pageSize=${current.pageSize}`);
      const rows = listData(result);
      config.setRows([...config.rows, ...rows]);
      setMeta((existing) => ({ ...existing, [kind]: listMeta(result, rows) }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function overridePlan(event) {
    event.preventDefault();
    if (!planOverride.orgId) return;
    try {
      const result = await api("/billing/override", {
        method: "POST",
        body: JSON.stringify({
          orgId: planOverride.orgId,
          plan: planOverride.plan,
          days: planOverride.days === "" ? undefined : Number(planOverride.days),
        }),
      });
      setMessage(result.message || "Plan override applied.");
      setPlanOverride({ orgId: "", plan: "BUSINESS", days: "30" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="app-shell platform-shell">
      <header className="topbar">
        <div>
          <strong>Platform Control Center</strong>
          <span>{session.user.email}</span>
        </div>
        <button onClick={onLogout}>Logout</button>
      </header>
      <Notice type="error">{error}</Notice>
      <Notice type="info">{message}</Notice>
      <section className="metrics">
        <Metric label="Organizations" value={orgs.length} />
        <Metric label="Subscriptions" value={subs.length} />
        <Metric label="Active pilots" value={orgs.filter((org) => org.plan !== "TRIAL").length} />
        <Metric label="API status" value={health?.status === "ok" ? "Healthy" : "Degraded"} />
      </section>
      <div className="tab-grid">
        <section className="panel">
          <span className="section-kicker">System health</span>
          <h2>Runtime status</h2>
          <div className="install-checklist">
            <span>Database: {health?.checks?.database?.status || "unknown"}</span>
            <span>Redis: {health?.checks?.redis?.status || "unknown"}</span>
            <span>Notification worker: Render worker service</span>
            <span>Queue delivery: Redis backed</span>
          </div>
        </section>

        <section className="panel">
          <span className="section-kicker">Platform API</span>
          <h2>Integration oversight</h2>
          <div className="install-checklist">
            <span>Organizations loaded: {orgs.length}{meta.orgs?.total ? ` / ${meta.orgs.total}` : ""}</span>
            <span>Subscriptions loaded: {subs.length}{meta.subs?.total ? ` / ${meta.subs.total}` : ""}</span>
            <span>Tenant secret access: Disabled</span>
            <span>Audit visibility: Use platform audit log feed below</span>
          </div>
        </section>

        <section className="panel">
          <span className="section-kicker">Plan control</span>
          <h2>Tenant plan override</h2>
          <form onSubmit={overridePlan}>
            <SelectField
              label="Tenant"
              value={planOverride.orgId}
              required
              options={[
                { value: "", label: "Select tenant" },
                ...orgs.map((org) => ({ value: org.id, label: `${org.name} · ${org.plan}` })),
              ]}
              onChange={(value) => setPlanOverride({ ...planOverride, orgId: value })}
            />
            <div className="form-grid">
              <SelectField
                label="Plan"
                value={planOverride.plan}
                onChange={(value) => setPlanOverride({ ...planOverride, plan: value })}
                options={[
                  { value: "TRIAL", label: "Trial" },
                  { value: "STARTER", label: "Starter" },
                  { value: "BUSINESS", label: "Business" },
                  { value: "ENTERPRISE", label: "Enterprise" },
                ]}
              />
              <Field
                label="Days"
                type="number"
                value={planOverride.days}
                onChange={(value) => setPlanOverride({ ...planOverride, days: value })}
              />
            </div>
            <button className="primary">Apply override</button>
          </form>
        </section>

        <section className="panel">
          <span className="section-kicker">Release</span>
          <h2>Version and notes</h2>
          <div className="install-checklist">
            <span>Current release: CargoScan production build</span>
            <span>Worker service: npm run worker</span>
            <span>Deployment channel: Render + Firebase</span>
            <span>TestFlight: Managed separately</span>
          </div>
        </section>

        <section className="panel wide">
          <h2>Organizations</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Slug</th><th>Plan</th><th>Users</th><th>Shipments</th></tr></thead>
              <tbody>
                {orgs.map((org) => (
                  <tr key={org.id}><td>{org.name}</td><td>{org.slug}</td><td>{org.plan}</td><td>{org.usage?.users}</td><td>{org.usage?.ships}</td></tr>
                ))}
              </tbody>
            </table>
            {!orgs.length && <EmptyState title="No organizations yet" description="Tenant organizations will appear here after signup." />}
          </div>
          <LoadMoreButton meta={meta.orgs} count={orgs.length} onClick={() => loadMorePlatform("orgs")} label="Load more organizations" />
        </section>

        <section className="panel wide">
          <h2>Subscriptions</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tenant</th><th>Plan</th><th>Status</th><th>Provider</th><th>Created</th></tr></thead>
              <tbody>
                {subs.map((sub) => (
                  <tr key={sub.id}>
                    <td>{sub.organization?.name || sub.organizationId}</td>
                    <td>{sub.planCode}</td>
                    <td>{sub.status}</td>
                    <td>{sub.provider}</td>
                    <td>{new Date(sub.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!subs.length && <EmptyState title="No subscriptions yet" description="Paid plan subscriptions will appear here after billing events are processed." />}
          </div>
          <LoadMoreButton meta={meta.subs} count={subs.length} onClick={() => loadMorePlatform("subs")} label="Load more subscriptions" />
        </section>

        <section className="panel wide">
          <h2>Audit logs</h2>
          <div className="queue-list">
            {auditLogs.map((log) => (
              <article key={log.id} className="queue-row">
                <div>
                  <strong>{log.action} · {log.target}</strong>
                  <span>{log.organization?.name || "Platform"} · {new Date(log.createdAt).toLocaleString()}</span>
                </div>
                <span>{log.targetId || "n/a"}</span>
                <span className="quality-pill quality-review">Read only</span>
              </article>
            ))}
            {!auditLogs.length && <EmptyState title="No platform activity yet" description="Platform-wide audit events will appear here." />}
          </div>
          <LoadMoreButton meta={meta.auditLogs} count={auditLogs.length} onClick={() => loadMorePlatform("auditLogs")} label="Load more audit logs" />
        </section>
      </div>
    </main>
  );
}

export function Dashboard({ session, setSession }) {
  const location = useLocation();
  const navigate = useNavigate();
  const routeToTab = useMemo(() => ({
    "/dashboard/operations": "shipments",
    "/dashboard/containers": "containers",
    "/dashboard/customers": "customers",
    "/dashboard/mobile": "mobile app",
    "/dashboard/team": "team",
    "/dashboard/billing": "billing",
    "/dashboard/settings": "settings",
  }), []);
  const tabToRoute = useMemo(() => Object.fromEntries(Object.entries(routeToTab).map(([path, tab]) => [tab, path])), [routeToTab]);
  const active = routeToTab[location.pathname] || "shipments";
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastSynced, setLastSynced] = useState(null);
  const [toast, setToast] = useState("");
  const [confirmState, setConfirmState] = useState(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(localStorage.getItem("cs_onboarding_done") === "1");
  const [data, setData] = useState({
    shipments: [],
    items: [],
    consignees: [],
    containers: [],
    users: [],
    auditLogs: [],
    apiKeys: [],
    webhooks: [],
    meta: {},
  });

  const isAdmin = session.user.role === "ADMIN";
  const NAV_ICONS = {
    shipments: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/>
        <path d="M16.5 9.4 7.55 4.24"/><polyline points="3.29 7 12 12 20.71 7"/>
        <line x1="12" y1="22" x2="12" y2="12"/>
        <circle cx="18.5" cy="18.5" r="3.5"/><path d="m20.27 16.73-2.31 2.31-1.23-1.23"/>
      </svg>
    ),
    containers: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 20V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12"/><path d="M2 20h20"/><path d="M7 20V8"/><path d="M17 20V8"/><path d="M2 14h20"/>
      </svg>
    ),
    customers: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    "mobile app": (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
      </svg>
    ),
    team: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    billing: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
    ),
    settings: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.07 4.93A10 10 0 0 0 4.93 19.07M19.07 4.93l-2.12 2.12M6.05 17.95l-2.12 2.12M19.07 19.07A10 10 0 0 0 4.93 4.93M19.07 19.07l-2.12-2.12M6.05 6.05 3.93 3.93"/>
      </svg>
    ),
  };

  const navItems = useMemo(() => [
    { id: "shipments", label: "Operations" },
    { id: "containers", label: "Containers" },
    { id: "customers", label: "Customers" },
    { id: "mobile app", label: "Mobile App" },
    ...(isAdmin ? [
      { id: "team", label: "Team" },
      { id: "billing", label: "Billing" },
      { id: "settings", label: "Settings" },
    ] : []),
  ], [isAdmin]);

  const setActive = useCallback((tab) => {
    const route = tabToRoute[tab] || "/dashboard/operations";
    if (location.pathname !== route) navigate(route);
  }, [location.pathname, navigate, tabToRoute]);

  const confirm = useCallback((config) => new Promise((resolve) => {
    setConfirmState({ ...config, resolve });
  }), []);

  const closeConfirm = useCallback((result) => {
    setConfirmState((current) => {
      if (current?.resolve) current.resolve(result);
      return null;
    });
  }, []);

  const listPaths = useMemo(() => ({
    shipments: "/shipments",
    items: "/items",
    consignees: "/consignees",
    containers: "/containers",
    users: "/users",
    auditLogs: "/audit-logs",
    apiKeys: "/keys",
    webhooks: "/webhooks",
  }), []);

  const load = useCallback(async () => {
    try {
      const baseCalls = [api("/shipments?page=1&pageSize=50"), api("/items?page=1&pageSize=50"), api("/consignees?page=1&pageSize=50"), api("/containers?page=1&pageSize=50")];
      const adminCalls = isAdmin ? [api("/users?page=1&pageSize=50"), api("/audit-logs?page=1&pageSize=50"), api("/keys?page=1&pageSize=50"), api("/webhooks?page=1&pageSize=50")] : [Promise.resolve([]), Promise.resolve([]), Promise.resolve([]), Promise.resolve([])];
      const [shipments, items, consignees, containers, users, auditLogs, apiKeys, webhooks] = await Promise.all([...baseCalls, ...adminCalls]);
      const nextItems = listData(items);
      const nextShipments = listData(shipments);
      const nextConsignees = listData(consignees);
      const nextContainers = listData(containers);
      const nextUsers = listData(users);
      const nextAuditLogs = listData(auditLogs);
      const nextApiKeys = listData(apiKeys);
      const nextWebhooks = listData(webhooks);
      setData((previous) => {
        const previousIds = new Set(previous.items.map((item) => item.id));
        const newItem = previous.items.length ? nextItems.find((item) => !previousIds.has(item.id)) : null;
        if (newItem) {
          setToast(`New package scanned — ${newItem.shipment?.code || newItem.trackingCode} ready for review`);
          setTimeout(() => setToast(""), 5000);
        }
        return {
          shipments: nextShipments,
          items: nextItems,
          consignees: nextConsignees,
          containers: nextContainers,
          users: nextUsers,
          auditLogs: nextAuditLogs,
          apiKeys: nextApiKeys,
          webhooks: nextWebhooks,
          meta: {
            shipments: listMeta(shipments, nextShipments),
            items: listMeta(items, nextItems),
            consignees: listMeta(consignees, nextConsignees),
            containers: listMeta(containers, nextContainers),
            users: listMeta(users, nextUsers),
            auditLogs: listMeta(auditLogs, nextAuditLogs),
            apiKeys: listMeta(apiKeys, nextApiKeys),
            webhooks: listMeta(webhooks, nextWebhooks),
          },
        };
      });
      setLastSynced(new Date());
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [isAdmin]);

  const loadMore = useCallback(async (kind) => {
    const meta = data.meta?.[kind];
    const path = listPaths[kind];
    if (!meta || !path || data[kind].length >= meta.total) return;
    try {
      const result = await api(`${path}?page=${meta.page + 1}&pageSize=${meta.pageSize}`);
      const rows = listData(result);
      setData((previous) => ({
        ...previous,
        [kind]: [...previous[kind], ...rows],
        meta: {
          ...previous.meta,
          [kind]: listMeta(result, rows),
        },
      }));
      setLastSynced(new Date());
    } catch (err) {
      setError(err.message);
    }
  }, [data, listPaths]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 12000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.target?.tagName === "INPUT" || event.target?.tagName === "TEXTAREA") return;
      if (event.key === "n" || event.key === "N" || event.key === "i" || event.key === "I") setActive("shipments");
      if (event.key === "c" || event.key === "C") setActive("containers");
      if (event.key === "/") {
        event.preventDefault();
        document.querySelector(".filter-bar input")?.focus();
      }
      const index = Number(event.key);
      if (index >= 1 && index <= navItems.length) setActive(navItems[index - 1].id);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navItems, setActive]);

  async function logout() {
    await api("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken: localStorage.getItem("cs_refresh_token") }) }).catch(() => {});
    localStorage.removeItem("cs_token");
    localStorage.removeItem("cs_refresh_token");
    setSession(null);
  }

  const planDays = daysRemaining(session.organization?.planExpiresAt);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const cbmThisMonth = data.items
    .filter((item) => new Date(item.createdAt) >= monthStart)
    .reduce((sum, item) => sum + Number(item.cbm || 0), 0);
  const scannedToday = data.items.filter((item) => {
    const updated = new Date(item.updatedAt);
    const today = new Date();
    return item.cbm != null && updated.toDateString() === today.toDateString();
  }).length;
  const onboardingSteps = [
    { label: "Create your first shipment", done: data.shipments.length > 0, tab: "shipments" },
    { label: "Invite an operator to the team", done: data.users.length > 1, tab: "team" },
    { label: "Install the iPhone scanner app", done: localStorage.getItem("cs_mobile_seen") === "1", tab: "mobile app" },
    { label: "Create your first cargo item", done: data.items.length > 0, tab: "shipments" },
  ];
  const onboardingDone = onboardingSteps.every((step) => step.done);
  useEffect(() => {
    if (onboardingDone) {
      localStorage.setItem("cs_onboarding_done", "1");
      setOnboardingDismissed(true);
    }
  }, [onboardingDone]);

  return (
    <main className="portal-shell">
      <aside className="portal-sidebar">
        <div className="portal-brand">
          <div className="brand-mark">CS</div>
          <div>
            <strong>CargoScan</strong>
            <span>{session.organization?.plan || "TRIAL"} workspace</span>
          </div>
        </div>
        <nav className="portal-nav">
          {navItems.map((tab) => (
            <button key={tab.id} className={active === tab.id ? "active" : ""} onClick={() => setActive(tab.id)}>
              <span className="nav-icon">{NAV_ICONS[tab.id]}</span>
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <div
            className="user-avatar"
            aria-label={`${session.user.name || "User"} (${session.user.role})`}
            title={session.user.name}
          >
            {session.user.name ? session.user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) : "U"}
          </div>
          <div className="sidebar-user-info">
            <strong>{session.user.name}</strong>
            <span>{session.user.role}</span>
          </div>
          <button className="logout-icon" onClick={logout} title="Sign out">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </aside>

      <section className="portal-main">
        <header className="portal-topbar">
          <div>
            <span className="section-kicker">{session.organization?.name || "CargoScan"}</span>
            <h1>{active === "shipments" ? "Warehouse Operations" : navItems.find((item) => item.id === active)?.label}</h1>
          </div>
          <div className="user-pill">
            <span className="live-chip"><i />Live {lastSynced ? `· ${lastSynced.toLocaleTimeString()}` : ""}</span>
            <span className="plan-chip">{session.organization?.plan || "TRIAL"}{planDays !== null ? ` · ${planDays}d` : ""}</span>
            <div
              className="topbar-avatar"
              aria-label={session.user.name || "User"}
              title={`${session.user.name} · ${session.user.role}`}
            >
              {session.user.name ? session.user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) : "U"}
            </div>
          </div>
        </header>
        {session.organization?.plan === "TRIAL" && planDays !== null && planDays < 3 && (
          <Notice type="error">Trial expires in {planDays} days — upgrade now.</Notice>
        )}

        <section className="portal-hero">
          <div>
            <strong>{data.items.filter((item) => !item.containerId).length} packages waiting</strong>
            <span>Scan cargo, assign customers, and load containers from one desktop workspace.</span>
          </div>
          <button onClick={() => setActive("mobile app")}>Install iPhone scanner</button>
        </section>

        <OperationsCommand data={data} setActive={setActive} />

        {!onboardingDismissed && (
          <section className="panel onboarding-card">
            <div className="panel-title-row">
              <div>
                <span className="section-kicker">First workspace setup</span>
                <h2>Four steps to a live cargo flow</h2>
              </div>
              <button onClick={() => { localStorage.setItem("cs_onboarding_done", "1"); setOnboardingDismissed(true); }}>Dismiss</button>
            </div>
            <div className="cards four">
              {onboardingSteps.map((step) => (
                <button key={step.label} className={`check-card ${step.done ? "done" : ""}`} onClick={() => setActive(step.tab)}>
                  <span>{step.done ? "✓" : "□"}</span>
                  {step.label}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="metrics">
          <Metric label="Shipments" value={data.shipments.length} />
          <Metric label="Cargo items" value={data.items.length} />
          <Metric label="Containers" value={data.containers.length} />
          <Metric label="Customers" value={data.consignees.length} />
          <Metric label="CBM this month" value={cbmThisMonth.toFixed(3)} />
          <Metric label="Scanned today" value={scannedToday} />
        </section>

        <Notice type="success">{message}</Notice>
        <Notice type="error">{error}</Notice>

        {active === "shipments" && <ShipmentsTab data={data} reload={load} setMessage={setMessage} organization={session.organization} confirm={confirm} loadMore={loadMore} />}
        {active === "containers" && <ContainersTab data={data} reload={load} setMessage={setMessage} setError={setError} confirm={confirm} loadMore={loadMore} />}
        {active === "customers" && <CustomersTab data={data} reload={load} setMessage={setMessage} confirm={confirm} loadMore={loadMore} />}
        {active === "mobile app" && <MobileAppTab session={session} />}
        {active === "team" && isAdmin && <TeamTab data={data} reload={load} setMessage={setMessage} confirm={confirm} loadMore={loadMore} />}
        {active === "billing" && isAdmin && <BillingTab organization={session.organization} setMessage={setMessage} confirm={confirm} />}
        {active === "settings" && isAdmin && <SettingsTab session={session} setSession={setSession} data={data} reload={load} setMessage={setMessage} confirm={confirm} loadMore={loadMore} />}
        {toast && (
          <button
            className="toast"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            onClick={() => setActive("shipments")}
          >
            {toast}
          </button>
        )}
        <ConfirmDialog confirmState={confirmState} onCancel={() => closeConfirm(false)} onConfirm={() => closeConfirm(true)} />
      </section>
    </main>
  );
}

export default function App() {
  const location = useLocation();
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("cs_token");
    if (!token) {
      setChecking(false);
      return;
    }
    api("/auth/me")
      .then((data) => setSession({ user: data.user, organization: data.organization }))
      .catch(() => {
        localStorage.removeItem("cs_token");
        localStorage.removeItem("cs_refresh_token");
      })
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <main className="auth-shell"><p>Loading CargoScan...</p></main>;
  if (location.pathname.startsWith("/tracking/") || location.pathname.startsWith("/track/")) {
    return <TrackingPage apiBase={API_BASE} />;
  }
  if (location.pathname.startsWith("/reset-password")) {
    return <ResetPasswordPage />;
  }
  if (location.pathname.startsWith("/billing/callback")) {
    return <BillingCallback />;
  }
  if (!session) return <Login onLogin={setSession} />;
  if (session.user.role === "SUPER_ADMIN") return <PlatformControlCenter session={session} onLogout={() => setSession(null)} />;

  return (
    <Routes>
      <Route path="/billing/callback" element={<BillingCallback />} />
      <Route path="/dashboard/:section" element={<Dashboard session={session} setSession={setSession} />} />
      <Route path="/dashboard" element={<Navigate to="/dashboard/operations" replace />} />
      <Route path="*" element={<Navigate to="/dashboard/operations" replace />} />
    </Routes>
  );
}
