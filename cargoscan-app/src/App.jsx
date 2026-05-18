import { useCallback, useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import "./App.css";
import TrackingPage from "./TrackingPage";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
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

const emptyShipment = { code: "", from: "Guangzhou", to: "Tema", cbmCapacity: "67.2" };
const emptyItem = { shipmentId: "", consigneeId: "", description: "", length: "", width: "", height: "", isDamaged: false };
const emptyConsignee = { name: "", phone: "", email: "", shipmentId: "", whatsappOptIn: true };
const emptyContainer = { number: "", type: "40HQ", capacityCbm: "76", destination: "Tema", vessel: "", bookingNumber: "", sealNumber: "", shipmentId: "" };

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
  return <div className={`notice ${type}`}>{children}</div>;
}

function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authNote, setAuthNote] = useState("");
  const [login, setLogin] = useState({ email: "", password: "" });
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
      if (mode === "signup" && (!signup.company || !signup.country || !signup.city)) {
        setAuthNote("Fill company, country, and city first, then continue with Google to create the pilot organization.");
        return;
      }

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(firebaseAuth, provider);
      const idToken = await result.user.getIdToken();
      const payload = mode === "signup"
        ? {
            idToken,
            mode: "signup",
            company: signup.company,
            country: signup.country,
            city: signup.city,
            cbmRate: signup.cbmRate,
          }
        : { idToken, mode: "login" };

      const data = await api("/auth/firebase", {
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

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = mode === "login" ? login : signup;
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

function OperationsCommand({ data, setActive }) {
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

function WorkQueue({ data }) {
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

function ReviewQueue({ data, reload, setMessage }) {
  const reviewItems = data.items.filter((item) => item.status === "NEEDS_REVIEW" || item.status === "RESCAN_REQUIRED");

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
          return (
            <article key={item.id} className="queue-row review-row">
              <div>
                <strong>{item.description || item.id.slice(0, 8)}</strong>
                <span>{item.shipment?.code || "No shipment"} · {item.consignee?.name || "No customer"} · {item.status}</span>
                {latestScan?.qualityReason && <small>{latestScan.qualityReason}</small>}
              </div>
              <span>{item.cbm == null ? "Unmeasured" : `${Number(item.cbm || 0).toFixed(3)} CBM`}</span>
              <div className="button-row">
                <button disabled={item.cbm == null} onClick={() => setPackageStatus(item, "READY_TO_LOAD")}>Approve</button>
                <button onClick={() => setPackageStatus(item, "RESCAN_REQUIRED")}>Rescan</button>
              </div>
            </article>
          );
        })}
        {!reviewItems.length && <p className="empty">No scan exceptions waiting for supervisor review.</p>}
      </div>
    </section>
  );
}

function ShipmentsTab({ data, reload, setMessage }) {
  const [form, setForm] = useState(emptyShipment);
  const [item, setItem] = useState(emptyItem);

  const shipmentOptions = useMemo(() => [
    { value: "", label: "Select shipment" },
    ...data.shipments.map((shipment) => ({ value: shipment.id, label: shipment.code })),
  ], [data.shipments]);

  const consigneeOptions = useMemo(() => [
    { value: "", label: "No consignee" },
    ...data.consignees.map((consignee) => ({ value: consignee.id, label: consignee.name })),
  ], [data.consignees]);

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

  return (
    <div className="tab-grid">
      <WorkQueue data={data} />
      <ReviewQueue data={data} reload={reload} setMessage={setMessage} />
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
        <form onSubmit={createItem}>
          <SelectField label="Shipment" value={item.shipmentId} required options={shipmentOptions} onChange={(value) => setItem({ ...item, shipmentId: value })} />
          <SelectField label="Consignee" value={item.consigneeId} options={consigneeOptions} onChange={(value) => setItem({ ...item, consigneeId: value })} />
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
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Route</th><th>Status</th><th>Items</th><th>CBM</th><th>Tracking</th></tr></thead>
            <tbody>
              {data.shipments.map((shipment) => (
                <tr key={shipment.id}>
                  <td>{shipment.code}</td>
                  <td>{shipment.from} → {shipment.to}</td>
                  <td>{shipment.status}</td>
                  <td>{shipment.itemsCount}</td>
                  <td>{Number(shipment.totalCbm || 0).toFixed(3)}</td>
                  <td><a href={`/tracking/${shipment.trackingCode}`} target="_blank" rel="noreferrer">Open</a></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.shipments.length && <p className="empty">No shipments yet.</p>}
        </div>
      </section>

      <section className="panel wide">
        <h2>Cargo items</h2>
        <div className="cards">
          {data.items.map((cargoItem) => (
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
              <span>{cargoItem.shipment?.code} · {cargoItem.cbm == null ? "Unmeasured" : `${Number(cargoItem.cbm || 0).toFixed(3)} CBM`} · {cargoItem.status}</span>
              {cargoItem.scanResults?.[0]?.qualityReason && (
                <small>{cargoItem.scanResults[0].qualityReason}</small>
              )}
              <div className="button-row">
                <button disabled={cargoItem.length == null || cargoItem.width == null || cargoItem.height == null} onClick={() => saveManualScan(cargoItem)}>Save manual scan</button>
                <a href={`/tracking/${cargoItem.trackingCode}`} target="_blank" rel="noreferrer">Track item</a>
              </div>
            </article>
          ))}
          {!data.items.length && <p className="empty">No cargo items yet.</p>}
        </div>
      </section>
    </div>
  );
}

function CustomersTab({ data, reload, setMessage }) {
  const [form, setForm] = useState(emptyConsignee);
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
        <div className="cards">
          {data.consignees.map((consignee) => (
            <article key={consignee.id} className="item-card">
              <strong>{consignee.name}</strong>
              <span>{consignee.phone} · {consignee.email || "No email"} · {consignee.whatsappOptIn ? "WhatsApp enabled" : "WhatsApp off"}</span>
            </article>
          ))}
          {!data.consignees.length && <p className="empty">No customers yet.</p>}
        </div>
      </section>
    </div>
  );
}

function ContainersTab({ data, reload, setMessage, setError }) {
  const [form, setForm] = useState(emptyContainer);
  const [selectedContainerId, setSelectedContainerId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");

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
    await api(`/containers/${containerId}/items/${itemId}`, { method: "DELETE" });
    setMessage("Package removed from container.");
    reload();
  }

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
            <SelectField label="Type" value={form.type} onChange={(value) => setForm({ ...form, type: value, capacityCbm: value === "20FT" ? "33" : value === "40FT" ? "67" : "76" })} options={[
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
        <div className="cards">
          {data.containers.map((container) => (
            <article key={container.id} className="item-card manifest-card">
              <strong>{container.number} · {container.type}</strong>
              <span>{container.status} · {Number(container.totalCbm || 0).toFixed(3)} / {Number(container.capacityCbm || 0).toFixed(1)} CBM · {container.utilization || 0}% full</span>
              <div className="progress"><span style={{ width: `${Math.min(container.utilization || 0, 100)}%` }} /></div>
              <small>{container.destination || "No destination"} · {container.itemsCount || 0} packages · {container.customerCount || 0} customers</small>
              <div className="button-row">
                <button onClick={() => checkLiveTracking(container.id)}>Live tracking</button>
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
          {!data.containers.length && <p className="empty">No containers yet.</p>}
        </div>
      </section>
    </div>
  );
}

function TeamTab({ data, reload, setMessage }) {
  const [form, setForm] = useState({ name: "", email: "", role: "OPERATOR" });

  async function createUser(event) {
    event.preventDefault();
    const result = await api("/users", { method: "POST", body: JSON.stringify(form) });
    setForm({ name: "", email: "", role: "OPERATOR" });
    setMessage(`User created. Temporary password: ${result.tempPassword}`);
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
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MobileAppTab({ session }) {
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

function BillingTab({ organization, setMessage }) {
  async function upgrade(plan) {
    const result = await api("/billing/init", { method: "POST", body: JSON.stringify({ plan }) });
    setMessage(`Paystack checkout initialized for ${plan}.`);
    if (result.authorization_url) window.location.href = result.authorization_url;
  }

  return (
    <section className="panel">
      <h2>Billing</h2>
      <p>Your current plan is <strong>{organization?.plan || "TRIAL"}</strong>.</p>
      <div className="cards three">
        {["STARTER", "BUSINESS", "ENTERPRISE"].map((plan) => (
          <article key={plan} className="price-card">
            <strong>{plan}</strong>
            <span>{plan === "STARTER" ? "$29" : plan === "BUSINESS" ? "$79" : "$199"} / month</span>
            <small>{plan === "ENTERPRISE" ? "Includes live container tracking and custom integrations." : plan === "BUSINESS" ? "Includes WhatsApp, disputes, and higher limits." : "For small pilot teams."}</small>
            <button onClick={() => upgrade(plan)}>Upgrade</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function PlatformControlCenter({ session, onLogout }) {
  const [orgs, setOrgs] = useState([]);
  const [subs, setSubs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [health, setHealth] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [planOverride, setPlanOverride] = useState({ orgId: "", plan: "BUSINESS", days: "30" });

  const load = useCallback(async () => {
    const [orgRes, subRes, auditRes, healthRes] = await Promise.allSettled([
      api("/admin/organizations"),
      api("/admin/subscriptions"),
      api("/admin/audit-logs"),
      fetch(`${API_BASE}/health`, { headers: authHeaders() }).then(async (response) => {
        const text = await response.text();
        return text ? JSON.parse(text) : null;
      }),
    ]);

    if (orgRes.status === "fulfilled") setOrgs(orgRes.value);
    if (subRes.status === "fulfilled") setSubs(subRes.value);
    if (auditRes.status === "fulfilled") setAuditLogs(auditRes.value);
    if (healthRes.status === "fulfilled") setHealth(healthRes.value);

    const firstError = [orgRes, subRes, auditRes, healthRes].find((result) => result.status === "rejected");
    setError(firstError ? firstError.reason.message : "");
  }, []);

  useEffect(() => { load(); }, [load]);

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
            <span>Webhook dispatcher: queued</span>
            <span>Release notes: Coming soon</span>
          </div>
        </section>

        <section className="panel">
          <span className="section-kicker">Platform API</span>
          <h2>Integration oversight</h2>
          <div className="install-checklist">
            <span>API keys: Coming after platform API</span>
            <span>Webhook catalog: Coming after platform API</span>
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
            <span>Current release: 0.0.0</span>
            <span>Release notes: Placeholder</span>
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
          </div>
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
          </div>
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
            {!auditLogs.length && <p className="empty">No audit logs available.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}

function Dashboard({ session, setSession }) {
  const [active, setActive] = useState("shipments");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState({ shipments: [], items: [], consignees: [], containers: [], users: [] });

  const isAdmin = session.user.role === "ADMIN";

  const load = useCallback(async () => {
    try {
      const baseCalls = [api("/shipments"), api("/items"), api("/consignees"), api("/containers")];
      const adminCalls = isAdmin ? [api("/users")] : [Promise.resolve([])];
      const [shipments, items, consignees, containers, users] = await Promise.all([...baseCalls, ...adminCalls]);
      setData({ shipments, items, consignees, containers, users });
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  function logout() {
    localStorage.removeItem("cs_token");
    localStorage.removeItem("cs_refresh_token");
    setSession(null);
  }

  const navItems = [
    { id: "shipments", label: "Operations", icon: "01" },
    { id: "containers", label: "Containers", icon: "02" },
    { id: "customers", label: "Customers", icon: "03" },
    { id: "mobile app", label: "Mobile App", icon: "04" },
    ...(isAdmin ? [
      { id: "team", label: "Team", icon: "05" },
      { id: "billing", label: "Billing", icon: "06" },
    ] : []),
  ];

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
              <span className="nav-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
        <button className="logout-button" onClick={logout}>Logout</button>
      </aside>

      <section className="portal-main">
        <header className="portal-topbar">
          <div>
            <span className="section-kicker">{session.organization?.name || "CargoScan"}</span>
            <h1>{active === "shipments" ? "Warehouse Operations" : navItems.find((item) => item.id === active)?.label}</h1>
          </div>
          <div className="user-pill">
            <strong>{session.user.name}</strong>
            <span>{session.user.role}</span>
          </div>
        </header>

        <section className="portal-hero">
          <div>
            <strong>{data.items.filter((item) => !item.containerId).length} packages waiting</strong>
            <span>Scan cargo, assign customers, and load containers from one desktop workspace.</span>
          </div>
          <button onClick={() => setActive("mobile app")}>Install iPhone scanner</button>
        </section>

        <OperationsCommand data={data} setActive={setActive} />

        <section className="metrics">
          <Metric label="Shipments" value={data.shipments.length} />
          <Metric label="Cargo items" value={data.items.length} />
          <Metric label="Containers" value={data.containers.length} />
          <Metric label="Customers" value={data.consignees.length} />
        </section>

        <Notice type="success">{message}</Notice>
        <Notice type="error">{error}</Notice>

        {active === "shipments" && <ShipmentsTab data={data} reload={load} setMessage={setMessage} />}
        {active === "containers" && <ContainersTab data={data} reload={load} setMessage={setMessage} setError={setError} />}
        {active === "customers" && <CustomersTab data={data} reload={load} setMessage={setMessage} />}
        {active === "mobile app" && <MobileAppTab session={session} />}
        {active === "team" && isAdmin && <TeamTab data={data} reload={load} setMessage={setMessage} />}
        {active === "billing" && isAdmin && <BillingTab organization={session.organization} setMessage={setMessage} />}
      </section>
    </main>
  );
}

export default function App() {
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

  if (window.location.pathname.startsWith("/tracking/") || window.location.pathname.startsWith("/track/")) {
    return <TrackingPage apiBase={API_BASE} />;
  }

  if (checking) return <main className="auth-shell"><p>Loading CargoScan...</p></main>;
  if (!session) return <Login onLogin={setSession} />;
  if (session.user.role === "SUPER_ADMIN") return <PlatformControlCenter session={session} onLogout={() => setSession(null)} />;
  return <Dashboard session={session} setSession={setSession} />;
}
