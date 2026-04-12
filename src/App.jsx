import React, { useState, useMemo, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

if (typeof window !== "undefined") {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png"
  });
}

const MUSIC_OPTIONS = ["salsa", "timba", "son", "bachata", "kizomba", "merengue", "zouk"];
const DANCE_OPTIONS = ["casino", "salsa on1", "salsa on2", "bachata moderna", "bachata sensual", "kizomba", "zouk"];
const EVENT_TYPE_OPTIONS = ["social", "event", "festival"];
const PRICE_OPTIONS = ["free", "paid"];
/** Surface / how it dances (floor type) */
const FLOOR_TYPE_OPTIONS = ["rough", "normal", "slippery"];

const FLOOR_SIZE_LEVELS = [
  { id: "small", label: "small (bar)", rank: 1 },
  { id: "medium", label: "medium (club)", rank: 2 },
  { id: "large", label: "large (hall)", rank: 3 }
];

const DENSITY_LEVELS = [
  { id: "empty", label: "empty", rank: 0 },
  { id: "sparse", label: "sparse", rank: 1 },
  { id: "packed", label: "packed", rank: 2 },
  { id: "overcrowded", label: "overcrowded", rank: 3 }
];

const REGULARITY_TYPE_OPTIONS = ["weekly", "monthly", "one-off/irregular"];
const REGULARITY_DAY_OPTIONS = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" }
];

function capitalizeWeekday(value) {
  if (!value) return "";
  const lower = String(value).toLowerCase();
  const found = REGULARITY_DAY_OPTIONS.find((d) => d.value === lower);
  return found ? found.label : value.charAt(0).toUpperCase() + value.slice(1);
}

function floorSizeRank(id) {
  return FLOOR_SIZE_LEVELS.find((x) => x.id === id)?.rank ?? 0;
}

function densityRank(id) {
  return DENSITY_LEVELS.find((x) => x.id === id)?.rank ?? 0;
}

const DEFAULT_FORM = {
  name: "",
  venue: "",
  city: "",
  type: "social",
  price: "free",
  floor: "normal",
  floorSize: "medium",
  density: "sparse",
  music: [],
  dance: [],
  musicShared: false,
  regularityType: "one-off/irregular",
  regularityDay: "",
  glassOnFloor: false,
  beerOnFloor: false,
  url: "",
  notes: "",
  date: "",
  hoursStart: "",
  hoursEnd: ""
};

function mergeFormFromPin(pin) {
  if (!pin) return { ...DEFAULT_FORM };
  const { music, dance, hoursStart, hoursEnd, floorSize, density, musicShared, ...rest } = pin;
  return {
    ...DEFAULT_FORM,
    ...rest,
    music: music ?? [],
    dance: dance ?? [],
    hoursStart: hoursStart ?? "",
    hoursEnd: hoursEnd ?? "",
    floorSize: floorSize || "medium",
    density: density || "sparse",
    musicShared: Boolean(musicShared)
  };
}

function formatRegularity(pin) {
  if (!pin.regularityType || pin.regularityType === "one-off/irregular") return "one-off/irregular";
  if (pin.regularityDay) return `${pin.regularityType} on ${capitalizeWeekday(pin.regularityDay)}`;
  return pin.regularityType;
}

function validateRequiredEventFields(form) {
  const missing = [];
  if (!String(form.name || "").trim()) missing.push("event name");
  if (!String(form.venue || "").trim()) missing.push("venue name");
  if (!form.hoursStart) missing.push("start time");
  if (!form.hoursEnd) missing.push("end time");
  if (!form.date) missing.push("last updated date");
  return missing;
}

function isDateStaleOverOneYear(isoDate) {
  if (!isoDate) return false;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const msInYear = 365 * 24 * 60 * 60 * 1000;
  return now.getTime() - date.getTime() > msInYear;
}

function formatHoursLabel(pin) {
  if (pin.hoursStart && pin.hoursEnd) return `${pin.hoursStart} – ${pin.hoursEnd}`;
  if (pin.hoursStart) return `${pin.hoursStart} onwards`;
  if (pin.hoursEnd) return `until ${pin.hoursEnd}`;
  return "—";
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
    const data = await res.json();
    return {
      country: data.address?.country || "",
      address: data.display_name || "",
      street: data.address?.road || "",
      city: data.address?.city || data.address?.town || data.address?.village || ""
    };
  } catch {
    return { country: "", address: "", street: "", city: "" };
  }
}

function FlyToPin({ focus }) {
  const map = useMap();
  useEffect(() => {
    if (!focus?.position) return;
    const [lat, lng] = focus.position;
    map.flyTo([lat, lng], Math.max(map.getZoom(), 11), { duration: 0.7 });
  }, [focus?.id, focus?.position, map]);
  return null;
}

function AddPinHandler({ onMapClick }) {
  useMapEvents({
    click: async (e) => {
      const { lat, lng } = e.latlng;
      onMapClick({ phase: "start", lat, lng });
      const geo = await reverseGeocode(lat, lng);
      onMapClick({ phase: "done", lat, lng, geo });
    }
  });
  return null;
}

function TagSelector({ options, selected, toggle, disabled = false }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map(opt => (
        <div
          key={opt}
          onClick={disabled ? undefined : () => toggle(opt)}
          style={{
            padding: "4px 10px",
            borderRadius: 20,
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.8 : 1,
            background: selected.includes(opt) ? "#333" : "#ddd",
            color: selected.includes(opt) ? "white" : "black",
            fontSize: 12
          }}
        >
          {opt}
        </div>
      ))}
    </div>
  );
}

const FILTER_DEFAULTS = {
  search: "",
  music: [],
  dance: [],
  type: "",
  price: "",
  floor: "",
  floorSizeMin: "",
  densityMax: "",
  country: "",
  city: ""
};

function filterPins(pins, f) {
  const q = f.search.trim().toLowerCase();
  return pins.filter((pin) => {
    if (q) {
      const hay = [pin.name, pin.venue, pin.city, pin.notes, pin.country, pin.street, pin.url]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.music.length && !f.music.some((m) => pin.music?.includes(m))) return false;
    if (f.dance.length && !f.dance.some((d) => pin.dance?.includes(d))) return false;
    if (f.type && pin.type !== f.type) return false;
    if (f.price && pin.price !== f.price) return false;
    if (f.floor && pin.floor !== f.floor) return false;
    if (f.floorSizeMin !== "" && f.floorSizeMin != null) {
      const minR = Number(f.floorSizeMin);
      if (!Number.isNaN(minR) && floorSizeRank(pin.floorSize || "medium") < minR) return false;
    }
    if (f.densityMax !== "" && f.densityMax != null) {
      const maxR = Number(f.densityMax);
      if (!Number.isNaN(maxR) && densityRank(pin.density || "sparse") > maxR) return false;
    }
    if (f.country && pin.country !== f.country) return false;
    if (f.city && pin.city !== f.city) return false;
    return true;
  });
}

export default function App() {
  const [pins, setPins] = useState([]);
  const [selectedPin, setSelectedPin] = useState(null);
  const [editing, setEditing] = useState(false);
  const [pendingPin, setPendingPin] = useState(null);
  const [editForm, setEditForm] = useState(DEFAULT_FORM);
  const [newPinForm, setNewPinForm] = useState(DEFAULT_FORM);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filters, setFilters] = useState(FILTER_DEFAULTS);
  const [mapFocus, setMapFocus] = useState(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [newPinGeoLoading, setNewPinGeoLoading] = useState(false);
  const [editSubmitAttempted, setEditSubmitAttempted] = useState(false);
  const [newSubmitAttempted, setNewSubmitAttempted] = useState(false);

  const filteredPins = useMemo(() => filterPins(pins, filters), [pins, filters]);

  const filterCountries = useMemo(
    () =>
      [...new Set(pins.map((p) => p.country).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      ),
    [pins]
  );

  const filterCities = useMemo(() => {
    const base = filters.country ? pins.filter((p) => p.country === filters.country) : [];
    return [...new Set(base.map((p) => p.city).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [pins, filters.country]);

  function setFilterField(field, value) {
    setFilters((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "country") next.city = "";
      return next;
    });
  }

  function toggleFilterTag(field, value) {
    setFilters((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value]
    }));
  }

  function handleMapClickForNewPin(payload) {
    if (payload.phase === "start") {
      setNewPinForm({ ...DEFAULT_FORM });
      setNewSubmitAttempted(false);
      setPendingPin({ lat: payload.lat, lng: payload.lng, geo: null });
      setNewPinGeoLoading(true);
      return;
    }
    setNewPinGeoLoading(false);
    setPendingPin((prev) =>
      prev && prev.lat === payload.lat && prev.lng === payload.lng
        ? { ...prev, geo: payload.geo }
        : prev
    );
  }

  function toggleMulti(field, value) {
    setEditForm(f => ({
      ...f,
      [field]: f[field].includes(value)
        ? f[field].filter(v => v !== value)
        : [...f[field], value]
    }));
  }

  function toggleNewPinMulti(field, value) {
    setNewPinForm((f) => ({
      ...f,
      [field]: f[field].includes(value)
        ? f[field].filter((v) => v !== value)
        : [...f[field], value]
    }));
  }

  function savePin() {
    setNewSubmitAttempted(true);
    const missing = validateRequiredEventFields(newPinForm);
    if (missing.length) return;
    const g = pendingPin.geo || {};
    const newPin = {
      id: Date.now(),
      position: [pendingPin.lat, pendingPin.lng],
      ...newPinForm,
      city: g.city || "",
      country: g.country || "",
      street: g.street || "",
      address: g.address || ""
    };
    setPins((p) => [...p, newPin]);
    setPendingPin(null);
    setNewPinGeoLoading(false);
    setNewPinForm({ ...DEFAULT_FORM });
    setNewSubmitAttempted(false);
  }

  function updatePin() {
    setEditSubmitAttempted(true);
    const missing = validateRequiredEventFields(editForm);
    if (missing.length) return;
    setPins(pins.map(p => p.id === selectedPin.id ? { ...p, ...editForm } : p));
    setSelectedPin({ ...selectedPin, ...editForm });
    setEditing(false);
    setEditSubmitAttempted(false);
  }

  function Field(label, value, editor, readOnly=false) {
    return (
      <>
        <b style={{ textAlign: "right" }}>{label}</b>
        {readOnly ? <span>{value || "-"}</span> : (editing ? editor : <span>{value || "-"}</span>)}
      </>
    );
  }

  function openEventFromList(pin) {
    setSelectedPin(pin);
    setEditForm(mergeFormFromPin(pin));
    setEditSubmitAttempted(false);
    setMapFocus({ id: pin.id, position: pin.position });
  }

  const timelinePins = useMemo(() => {
    return [...pins].sort((a, b) => {
      const ad = a.date ? new Date(a.date).getTime() : NaN;
      const bd = b.date ? new Date(b.date).getTime() : NaN;
      const aOk = !Number.isNaN(ad);
      const bOk = !Number.isNaN(bd);
      if (aOk && bOk && ad !== bd) return ad - bd;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
    });
  }, [pins]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100">

      {/* SIDEBAR */}
      {sidebarOpen ? (
        <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white/95 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <h2 className="text-sm font-semibold tracking-tight text-slate-800">Filters</h2>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
              onClick={() => setSidebarOpen(false)}
              aria-label="Collapse sidebar"
            >
              Hide
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            <label className="block text-xs font-medium text-slate-500">Search</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-slate-400"
              placeholder="Name, venue, notes…"
              value={filters.search}
              onChange={(e) => setFilterField("search", e.target.value)}
            />

            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-500">Country</label>
              <select
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                value={filters.country}
                onChange={(e) => setFilterField("country", e.target.value)}
              >
                <option value="">All countries</option>
                {filterCountries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-500">City</label>
              <select
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm disabled:opacity-50"
                value={filters.city}
                onChange={(e) => setFilterField("city", e.target.value)}
                disabled={!filters.country}
              >
                <option value="">{filters.country ? "All cities in country" : "Select a country first"}</option>
                {filterCities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3">
              <span className="text-xs font-medium text-slate-500">Music (any)</span>
              <div className="mt-1">
                <TagSelector
                  options={MUSIC_OPTIONS}
                  selected={filters.music}
                  toggle={(v) => toggleFilterTag("music", v)}
                />
              </div>
            </div>

            <div className="mt-3">
              <span className="text-xs font-medium text-slate-500">Dance (any)</span>
              <div className="mt-1">
                <TagSelector
                  options={DANCE_OPTIONS}
                  selected={filters.dance}
                  toggle={(v) => toggleFilterTag("dance", v)}
                />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-500">Type</label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 px-1 py-1 text-xs"
                  value={filters.type}
                  onChange={(e) => setFilterField("type", e.target.value)}
                >
                  <option value="">All</option>
                  {EVENT_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Price</label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 px-1 py-1 text-xs"
                  value={filters.price}
                  onChange={(e) => setFilterField("price", e.target.value)}
                >
                  <option value="">All</option>
                  {PRICE_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Floor type</label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 px-1 py-1 text-xs"
                  value={filters.floor}
                  onChange={(e) => setFilterField("floor", e.target.value)}
                >
                  <option value="">All</option>
                  {FLOOR_TYPE_OPTIONS.map((fl) => (
                    <option key={fl} value={fl}>
                      {fl}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Floor size (at least)</label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 px-1 py-1 text-xs"
                  value={filters.floorSizeMin}
                  onChange={(e) => setFilterField("floorSizeMin", e.target.value)}
                >
                  <option value="">Any</option>
                  {FLOOR_SIZE_LEVELS.map((lvl) => (
                    <option key={lvl.id} value={String(lvl.rank)}>
                      {lvl.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-500">Density (at most)</label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 px-1 py-1 text-xs"
                  value={filters.densityMax}
                  onChange={(e) => setFilterField("densityMax", e.target.value)}
                >
                  <option value="">Any</option>
                  {DENSITY_LEVELS.map((lvl) => (
                    <option key={lvl.id} value={String(lvl.rank)}>
                      {lvl.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              className="mt-3 text-xs text-slate-500 underline decoration-slate-300 hover:text-slate-700"
              onClick={() => setFilters({ ...FILTER_DEFAULTS })}
            >
              Clear filters
            </button>

            <p className="mt-4 text-xs text-slate-500">
              Showing <span className="font-medium text-slate-700">{filteredPins.length}</span>
              {pins.length !== filteredPins.length ? (
                <span> of {pins.length}</span>
              ) : null}
            </p>

            <ul className="mt-2 space-y-2 pb-4">
              {filteredPins.length === 0 ? (
                <li className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                  No events match these filters.
                </li>
              ) : (
                filteredPins.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition hover:border-slate-300 hover:bg-slate-50 ${
                        selectedPin?.id === p.id
                          ? "border-slate-400 bg-slate-100"
                          : "border-slate-200 bg-white"
                      }`}
                      onClick={() => openEventFromList(p)}
                    >
                      <div className="font-medium text-slate-900">{p.name || "Untitled"}</div>
                      <div className="text-xs text-slate-500">
                        {[p.date, p.city, p.venue].filter(Boolean).join(" · ") || "No date or place"}
                      </div>
                      {(p.music?.length || p.dance?.length) ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.music?.map((m) => (
                            <span key={m} className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] text-slate-700">
                              {m}
                            </span>
                          ))}
                          {p.dance?.map((d) => (
                            <span key={d} className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-800">
                              {d}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </aside>
      ) : null}

      <div className="relative min-h-0 min-w-0 flex-1">
        {/* TOP BUTTONS */}
        <div
          className="absolute z-[1000] flex gap-2"
          style={{ top: 20, left: 72 }}
        >
          <button
            type="button"
            className="rounded-md border border-slate-200 bg-white/90 px-3 py-1.5 text-sm shadow-sm backdrop-blur-sm hover:bg-white"
            onClick={() => setShowTimeline((v) => !v)}
          >
            Timeline
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-200 bg-white/90 px-3 py-1.5 text-sm shadow-sm backdrop-blur-sm hover:bg-white"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-expanded={sidebarOpen}
          >
            Filter
          </button>
        </div>

        {/* MAP */}
        <MapContainer
          center={[20, 0]}
          zoom={2}
          minZoom={2}
          maxBounds={[[-85, -180], [85, 180]]}
          maxBoundsViscosity={1.0}
          worldCopyJump
          className="h-full w-full min-h-0"
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FlyToPin focus={mapFocus} />
          <AddPinHandler onMapClick={handleMapClickForNewPin} />

          {pins.map((p) => (
            <Marker
              key={p.id}
              position={p.position}
              eventHandlers={{
                click: () => {
                  setSelectedPin(p);
                  setEditForm(mergeFormFromPin(p));
                  setEditSubmitAttempted(false);
                }
              }}
            />
          ))}
        </MapContainer>

      {/* INFO PANEL */}
      {selectedPin && (
        <div style={{ position:"absolute", top:20, right:20, backdropFilter:"blur(12px)", background:"rgba(255,255,255,0.8)", padding:16, borderRadius:16, zIndex:1000, maxWidth:360 }}>
          <button
            type="button"
            onClick={() => {
              if (editing) {
                setEditForm(mergeFormFromPin(selectedPin));
                setEditing(false);
                setEditSubmitAttempted(false);
                return;
              }
              setEditing(true);
            }}
            style={{
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 14px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            {editing ? "Cancel" : "Edit"}
          </button>

          <div style={{ display:"grid", gridTemplateColumns:"minmax(100px,auto) 1fr", gap:"10px 12px", marginTop:10, alignItems:"center" }}>
            {Field("Name", selectedPin.name, <input required style={editing && editSubmitAttempted && !String(editForm.name || "").trim() ? { borderColor: "#dc2626", background: "#fef2f2" } : undefined} value={editForm.name} onChange={e=>setEditForm({...editForm,name:e.target.value})}/>)}
            {Field(
              "Type",
              selectedPin.type,
              <select value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}>
                {EVENT_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
            {Field("Venue", selectedPin.venue, <input required style={editing && editSubmitAttempted && !String(editForm.venue || "").trim() ? { borderColor: "#dc2626", background: "#fef2f2" } : undefined} value={editForm.venue} onChange={e=>setEditForm({...editForm,venue:e.target.value})}/>)}
            {Field("Street", selectedPin.street, null, true)}
            {Field("City", selectedPin.city, null, true)}
            {Field("Country", selectedPin.country, null, true)}
            {Field(
              "Hours",
              formatHoursLabel(selectedPin),
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <input
                  type="time"
                  step={300}
                  required
                  style={editing && editSubmitAttempted && !editForm.hoursStart ? { borderColor: "#dc2626", background: "#fef2f2" } : undefined}
                  value={editForm.hoursStart}
                  onChange={(e) => setEditForm({ ...editForm, hoursStart: e.target.value })}
                  aria-label="Start time"
                />
                <span style={{ color: "#666" }}>to</span>
                <input
                  type="time"
                  step={300}
                  required
                  style={editing && editSubmitAttempted && !editForm.hoursEnd ? { borderColor: "#dc2626", background: "#fef2f2" } : undefined}
                  value={editForm.hoursEnd}
                  onChange={(e) => setEditForm({ ...editForm, hoursEnd: e.target.value })}
                  aria-label="End time"
                />
              </div>
            )}
            {Field(
              "Regularity",
              formatRegularity(selectedPin),
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <select value={editForm.regularityType} onChange={(e) => setEditForm({ ...editForm, regularityType: e.target.value })}>
                  {REGULARITY_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <select
                  value={editForm.regularityDay}
                  onChange={(e) => setEditForm({ ...editForm, regularityDay: e.target.value })}
                >
                  <option value="">no fixed day</option>
                  {REGULARITY_DAY_OPTIONS.map((day) => (
                    <option key={day.value} value={day.value}>{day.label}</option>
                  ))}
                </select>
              </div>
            )}

            <b style={{ textAlign: "right", alignSelf: "start", paddingTop: 4 }}>Music</b>
            <div>
              <TagSelector options={MUSIC_OPTIONS} selected={editing ? editForm.music : (selectedPin.music || [])} toggle={(v)=>toggleMulti("music",v)} disabled={!editing}/>
              {(editing ? editForm.music.length : (selectedPin.music || []).length) > 1 ? (
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, cursor: editing ? "pointer" : "default" }}>
                  <input
                    type="checkbox"
                    checked={editing ? editForm.musicShared : Boolean(selectedPin.musicShared)}
                    disabled={!editing}
                    onChange={(e) => setEditForm({ ...editForm, musicShared: e.target.checked })}
                  />
                  <span>Shared floor for all music</span>
                </label>
              ) : null}
            </div>

            <b style={{ textAlign: "right", alignSelf: "start", paddingTop: 4 }}>Dance</b>
            <TagSelector options={DANCE_OPTIONS} selected={editing ? editForm.dance : (selectedPin.dance || [])} toggle={(v)=>toggleMulti("dance",v)} disabled={!editing}/>

            {Field(
              "Floor size",
              FLOOR_SIZE_LEVELS.find((l) => l.id === (selectedPin.floorSize || "medium"))?.label ?? "—",
              <select value={editForm.floorSize} onChange={(e) => setEditForm({ ...editForm, floorSize: e.target.value })}>
                {FLOOR_SIZE_LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            )}
            <b style={{ textAlign: "right", alignSelf: "start" }}>Floor type</b>
            <div>
              {editing ? (
                <>
                  <select value={editForm.floor} onChange={(e) => setEditForm({ ...editForm, floor: e.target.value })}>
                    {FLOOR_TYPE_OPTIONS.map((fl) => (
                      <option key={fl} value={fl}>{fl}</option>
                    ))}
                  </select>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(editForm.glassOnFloor)}
                      onChange={(e) => setEditForm({ ...editForm, glassOnFloor: e.target.checked })}
                    />
                    <span>glass on floor</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(editForm.beerOnFloor)}
                      onChange={(e) => setEditForm({ ...editForm, beerOnFloor: e.target.checked })}
                    />
                    <span>beer on floor</span>
                  </label>
                </>
              ) : (
                <>
                  <span>{selectedPin.floor || "—"}</span>
                  {(selectedPin.glassOnFloor || selectedPin.beerOnFloor) ? (
                    <div style={{ fontSize: 11, color: "#b45309", marginTop: 4, lineHeight: 1.35 }}>
                      {selectedPin.glassOnFloor ? <div>⚠️ glass on floor</div> : null}
                      {selectedPin.beerOnFloor ? <div>⚠️ beer on floor</div> : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>
            {Field(
              "Density",
              DENSITY_LEVELS.find((l) => l.id === (selectedPin.density || "sparse"))?.label ?? "—",
              <select value={editForm.density} onChange={(e) => setEditForm({ ...editForm, density: e.target.value })}>
                {DENSITY_LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            )}
            {Field(
              "Price",
              selectedPin.price,
              <select value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}>
                {PRICE_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}
            <b style={{ textAlign: "right", alignSelf: "start" }}>Last verified</b>
            <div>
              {!editing ? (
                <>
                  <span>{selectedPin.date || "—"}</span>
                  {isDateStaleOverOneYear(selectedPin.date) ? (
                    <div style={{ fontSize: 11, color: "#b45309", marginTop: 4, lineHeight: 1.35 }}>
                      ⚠️ Info may be stale (over a year old).
                    </div>
                  ) : null}
                </>
              ) : (
                <div>
                  <input
                    type="date"
                    required
                    style={editSubmitAttempted && !editForm.date ? { borderColor: "#dc2626", background: "#fef2f2" } : undefined}
                    value={editForm.date}
                    onChange={e=>setEditForm({...editForm,date:e.target.value})}
                  />
                  {isDateStaleOverOneYear(editForm.date) ? (
                    <div style={{ fontSize: 11, color: "#b45309", marginTop: 4, lineHeight: 1.35 }}>
                      ⚠️ Information may be stale (over 1 year ago).
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            {Field(
              "URL",
              selectedPin.url,
              <input
                type="url"
                placeholder="https://example.org/event"
                value={editForm.url}
                onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
              />
            )}
          </div>

          {editing && (
            <button
              style={{ marginTop:10, background:"#2563eb", color:"#fff", border:"none", borderRadius:8, padding:"8px 14px", fontWeight:600, cursor:"pointer" }}
              onClick={updatePin}
            >
              Save
            </button>
          )}
        </div>
      )}

      {/* MODAL */}
      {pendingPin && (
        <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000 }}>
          <div
            style={{
              background: "white",
              borderRadius: 16,
              width: 380,
              maxHeight: "94vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)"
            }}
          >
            <div
              style={{
                flex: 1,
                minHeight: 0,
                maxHeight: "min(76vh, 760px)",
                overflowY: "auto",
                padding: 20,
                paddingBottom: 12
              }}
            >
            <h3 style={{ marginTop: 0 }}>New Event</h3>

            <label style={{ fontSize: 12, color: "#64748b" }}>Name</label>
            <input required style={{ width: "100%", boxSizing: "border-box", ...(newSubmitAttempted && !String(newPinForm.name || "").trim() ? { borderColor: "#dc2626", background: "#fef2f2" } : {}) }} placeholder="Event name" value={newPinForm.name} onChange={e=>setNewPinForm({...newPinForm,name:e.target.value})}/>

            <label style={{ fontSize: 12, color: "#64748b", marginTop: 8, display: "block" }}>Type</label>
            <select style={{ width: "100%" }} value={newPinForm.type} onChange={(e) => setNewPinForm({ ...newPinForm, type: e.target.value })}>
              {EVENT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <div style={{ marginTop:10 }}>
              <b>Place and Time</b>
            </div>

            <label style={{ fontSize: 12, color: "#64748b", marginTop: 8, display: "block" }}>Venue</label>
            <input required style={{ width: "100%", boxSizing: "border-box", ...(newSubmitAttempted && !String(newPinForm.venue || "").trim() ? { borderColor: "#dc2626", background: "#fef2f2" } : {}) }} placeholder="Venue name" value={newPinForm.venue} onChange={e=>setNewPinForm({...newPinForm,venue:e.target.value})}/>

            <div style={{ marginTop: 10, padding: 10, background: "#f8fafc", borderRadius: 8, fontSize: 13 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "#94a3b8", marginBottom: 6 }}>From map (geocode)</div>
              {newPinGeoLoading ? (
                <div style={{ color: "#64748b" }}>Loading…</div>
              ) : (
                <>
                  <div><b style={{ color: "#475569" }}>Street</b> {pendingPin.geo?.street || "—"}</div>
                  <div><b style={{ color: "#475569" }}>City</b> {pendingPin.geo?.city || "—"}</div>
                  <div><b style={{ color: "#475569" }}>Country</b> {pendingPin.geo?.country || "—"}</div>
                </>
              )}
            </div>

            <label style={{ fontSize: 12, color: "#64748b", marginTop: 10, display: "block" }}>Hours</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#444" }}>From</span>
              <input required type="time" step={300} style={newSubmitAttempted && !newPinForm.hoursStart ? { borderColor: "#dc2626", background: "#fef2f2" } : undefined} value={newPinForm.hoursStart} onChange={e=>setNewPinForm({...newPinForm,hoursStart:e.target.value})} aria-label="Start time" />
              <span style={{ fontSize: 12, color: "#444" }}>to</span>
              <input required type="time" step={300} style={newSubmitAttempted && !newPinForm.hoursEnd ? { borderColor: "#dc2626", background: "#fef2f2" } : undefined} value={newPinForm.hoursEnd} onChange={e=>setNewPinForm({...newPinForm,hoursEnd:e.target.value})} aria-label="End time" />
            </div>

            <label style={{ fontSize: 12, color: "#64748b", marginTop: 8, display: "block" }}>Regularity</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select style={{ width: "55%" }} value={newPinForm.regularityType} onChange={(e) => setNewPinForm({ ...newPinForm, regularityType: e.target.value })}>
                {REGULARITY_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <select
                style={{ width: "45%" }}
                value={newPinForm.regularityDay}
                onChange={(e) => setNewPinForm({ ...newPinForm, regularityDay: e.target.value })}
              >
                <option value="">no fixed day</option>
                {REGULARITY_DAY_OPTIONS.map((day) => (
                  <option key={day.value} value={day.value}>{day.label}</option>
                ))}
              </select>
            </div>

            <div style={{ marginTop:10 }}>
              <b>Music</b>
              <TagSelector options={MUSIC_OPTIONS} selected={newPinForm.music} toggle={(v)=>toggleNewPinMulti("music",v)}/>
              {newPinForm.music.length > 1 ? (
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={newPinForm.musicShared}
                    onChange={(e) => setNewPinForm({ ...newPinForm, musicShared: e.target.checked })}
                  />
                  <span>Shared floor for all musical styles</span>
                </label>
              ) : null}
            </div>

            <div style={{ marginTop:10 }}>
              <b>Dance</b>
              <TagSelector options={DANCE_OPTIONS} selected={newPinForm.dance} toggle={(v)=>toggleNewPinMulti("dance",v)}/>
            </div>


            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ fontSize: 12, color: "#64748b", marginTop: 8, display: "block", width: "50%" }}>Floor size</label>
              <label style={{ fontSize: 12, color: "#64748b", marginTop: 8, display: "block", width: "50%" }}>Floor type</label>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <select style={{ width: "50%" }} value={newPinForm.floorSize} onChange={(e) => setNewPinForm({ ...newPinForm, floorSize: e.target.value })}>
                {FLOOR_SIZE_LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
              <select style={{ width: "50%" }} value={newPinForm.floor} onChange={(e) => setNewPinForm({ ...newPinForm, floor: e.target.value })}>
                {FLOOR_TYPE_OPTIONS.map((fl) => (
                  <option key={fl} value={fl}>{fl}</option>
                ))}
              </select>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={Boolean(newPinForm.glassOnFloor)}
                onChange={(e) => setNewPinForm({ ...newPinForm, glassOnFloor: e.target.checked })}
              />
              <span>glass on floor</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={Boolean(newPinForm.beerOnFloor)}
                onChange={(e) => setNewPinForm({ ...newPinForm, beerOnFloor: e.target.checked })}
              />
              <span>beer on floor</span>
            </label>

            <label style={{ fontSize: 12, color: "#64748b", marginTop: 8, display: "block" }}>Density</label>
            <select style={{ width: "100%" }} value={newPinForm.density} onChange={(e) => setNewPinForm({ ...newPinForm, density: e.target.value })}>
              {DENSITY_LEVELS.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>

            <label style={{ fontSize: 12, color: "#64748b", marginTop: 8, display: "block" }}>Price</label>
            <select style={{ width: "100%" }} value={newPinForm.price} onChange={(e) => setNewPinForm({ ...newPinForm, price: e.target.value })}>
              {PRICE_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <label style={{ fontSize: 12, color: "#64748b", marginTop: 8, display: "block" }}>Date verified</label>
            <input required type="date" style={{ width: "100%", boxSizing: "border-box", ...(newSubmitAttempted && !newPinForm.date ? { borderColor: "#dc2626", background: "#fef2f2" } : {}) }} value={newPinForm.date} onChange={e=>setNewPinForm({...newPinForm,date:e.target.value})}/>
            <label style={{ fontSize: 12, color: "#64748b", marginTop: 8, display: "block" }}>URL for reference</label>
            <input
              type="url"
              style={{ width: "100%", boxSizing: "border-box" }}
              placeholder="https://example.org/event"
              value={newPinForm.url}
              onChange={(e)=>setNewPinForm({...newPinForm,url:e.target.value})}
            />

            </div>
            <div
              style={{
                flexShrink: 0,
                borderTop: "1px solid #e2e8f0",
                padding: "12px 20px",
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                background: "#f8fafc"
              }}
            >
              <button
                type="button"
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 14
                }}
                onClick={() => { setPendingPin(null); setNewPinGeoLoading(false); setNewSubmitAttempted(false); }}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 14
                }}
                onClick={savePin}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TIMELINE */}
      {showTimeline && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            minHeight: 120,
            maxHeight: "32vh",
            backdropFilter: "blur(10px)",
            background: "rgba(255,255,255,0.92)",
            zIndex: 1000,
            borderTop: "1px solid rgba(0,0,0,0.08)",
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box"
          }}
        >
          <div style={{ padding: "8px 12px 0", fontSize: 12, color: "#64748b" }}>
            {timelinePins.length === 0
              ? "No events yet — add pins on the map."
              : "Chronological (events without a date appear at the end). Click a card to focus on the map."}
          </div>
          <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", display: "flex", gap: 10, padding: 10, alignItems: "stretch" }}>
            {timelinePins.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => openEventFromList(p)}
                style={{
                  minWidth: 140,
                  maxWidth: 200,
                  flex: "0 0 auto",
                  padding: 10,
                  background: selectedPin?.id === p.id ? "#e2e8f0" : "#f1f5f9",
                  borderRadius: 10,
                  border: "1px solid #cbd5e1",
                  cursor: "pointer",
                  textAlign: "left",
                  font: "inherit"
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{p.name || "Untitled"}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{p.date || "No date"}</div>
                {(p.city || p.venue) ? (
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[p.city, p.venue].filter(Boolean).join(" · ")}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

