import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  DndContext, closestCenter, PointerSensor,
  useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const SUPABASE_TABLE = "factions_tracker_state";
const BACKUPS_TABLE  = "factions_backups";
const STORAGE_KEY    = "factions-tracker-v7";
const THEME_KEY      = "factions-theme-v3";

const DEPTS = {
  central: { name: "Центральный аппарат", color: "#7c8aa5", short: "ЦА", icon: "🏛" },
  mo:      { name: "Министерство Обороны",       color: "#8c6b61", short: "МО", icon: "⚔️" },
  myu:     { name: "Министерство Юстиций",       color: "#7a6d8c", short: "МЮ", icon: "⚖️" },
  mz:      { name: "Министерство Здравоохранения", color: "#68847d", short: "МЗ", icon: "🏥" },
};

const FACTIONS = {
  gcl:  { name: "ГЦЛ",       color: "#7c8aa5", dept: "central" },
  gov:  { name: "Правительство", color: "#8b93a7", dept: "central" },
  media:{ name: "СМИ",       color: "#7d948f", dept: "central" },
  tsr:  { name: "ТСР",       color: "#8c6b61", dept: "mo" },
  sfa:  { name: "СФа",       color: "#9a7869", dept: "mo" },
  lsa:  { name: "ЛСа",       color: "#7f655d", dept: "mo" },
  lspd: { name: "ЛСПД",      color: "#7a6d8c", dept: "myu" },
  sfpd: { name: "СФПД",      color: "#857897", dept: "myu" },
  fbr:  { name: "ФБР",       color: "#6f8092", dept: "myu" },
  swat: { name: "СВАТ",      color: "#8a7580", dept: "myu" },
  rcsd:{ name: "РКШД",      color: "#7b8fa3", dept: "myu" },
  lsmc: { name: "ЛСМЦ",     color: "#68847d", dept: "mz" },
  lvmc: { name: "ЛВМЦ",     color: "#75908a", dept: "mz" },
  fire: { name: "Пожарные",  color: "#977869", dept: "mz" },
};

const DEPT_FACTIONS = Object.entries(FACTIONS).reduce((acc, [k, v]) => {
  (acc[v.dept] = acc[v.dept] || []).push(k);
  return acc;
}, {});

const INIT_FIELDS = [
  { id: "online",   label: "Онлайн",       type: "number", system: true },
  { id: "afk",      label: "AFK",          type: "number", system: true },
  { id: "deputies", label: "Замов в сети", type: "number", system: true },
  { id: "noForm",   label: "Без формы",    type: "number", system: true },
  { id: "salary",   label: "Качают ЗП",   type: "number", system: true },
  { id: "leader",   label: "Лидер",        type: "bool",   system: true },
  { id: "forum",    label: "Просрочки",    type: "bool",   system: true },
  { id: "activity", label: "Активность",   type: "text",   system: true },
  { id: "leaderAct",label: "Деят. лидера", type: "text",   system: true },
];

const RATING_COLORS = ["#b46d6d","#b88a65","#b8a465","#7e9b76","#5d9a7f"];
const RATING_LABELS = ["Критично","Плохо","Средне","Хорошо","Отлично"];

const ROLES = ["ГС ЦА","ЗГС ЦА","ГС МО","ЗГС МО","ГС МЮ","ЗГС МЮ","ГС МЗ","ЗГС МЗ","🔧"];

const ROLE_FACTIONS = {
  "ГС МЮ":  ["lspd","sfpd","fbr","swat", "rcsd"],
  "ЗГС МЮ": ["lspd","sfpd","fbr","swat", "rcsd"],
  "ГС МЗ":  ["lsmc","lvmc","fire"],
  "ЗГС МЗ": ["lsmc","lvmc","fire"],
  "ГС МО":  ["tsr","sfa","lsa"],
  "ЗГС МО": ["tsr","sfa","lsa"],
  "ГС ЦА":  ["gcl","gov","media"],
  "ЗГС ЦА": ["gcl","gov","media"],
  "🔧": null,
};

const canEditFaction = (role, fk) => {
  if (!role || role === "none") return false;
  if (ROLE_FACTIONS[role] === null) return true;
  return (ROLE_FACTIONS[role] || []).includes(fk);
};

const isAdmin = (role) => role === "🔧";


const DAY_MS = 24 * 60 * 60 * 1000;
const MSK_DAY_0_UTC_MS = Date.UTC(2026, 3, 4, 21, 0, 0); 


const getMskElapsedDays = () =>
  Math.max(0, Math.floor((Date.now() - MSK_DAY_0_UTC_MS) / DAY_MS));


const getMskDateStr = () => {
  const utcMs = Date.UTC(2026, 3, 5) + getMskElapsedDays() * DAY_MS;
  return new Date(utcMs).toISOString().slice(0, 10);
};


const msUntilMskMidnight = () => {
  const elapsed = Date.now() - MSK_DAY_0_UTC_MS;
  const msIntoCurrentDay = ((elapsed % DAY_MS) + DAY_MS) % DAY_MS;
  return DAY_MS - msIntoCurrentDay;
};

const isDayEditable = (dayDate, todayStr) => !!todayStr && dayDate <= todayStr;


const isFactionLockedByAdmin = (day, factionKey) => {
  return day?.adminLock?.[factionKey] === true;
};

const uid = () => Math.random().toString(36).slice(2, 9);
const emptyReport = () => ({ rating: 0, values: {} });

const loginToEmail = (login) => `${login.trim().toLowerCase()}@ft.local`;
const emailToLogin = (email) => email?.replace(/@ft\.local$/, "") ?? email;

const hasMeaningfulValue = (v) =>
  v !== "" && v !== false && v !== null && v !== undefined &&
  !(typeof v === "number" && Number.isNaN(v));

const dayHasAnyData = (day) =>
  Object.values(day?.reports || {}).some(
    (rep) => rep?.rating > 0 || Object.values(rep?.values || {}).some(hasMeaningfulValue)
  );

const generateWeeks = () => {
  const weeks = [];

  let curUtcMs = Date.UTC(2026, 3, 2); 

  const utcDateToLabel = (utcMs) => {
    const d = new Date(utcMs);
    const day   = String(d.getUTCDate()).padStart(2, "0");
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const year  = d.getUTCFullYear();
    return `${day}.${month}.${year}`;
  };

  const makeDay = (utcMs) => ({
    id: uid(),
    label: utcDateToLabel(utcMs),
    date: new Date(utcMs).toISOString().slice(0, 10),
    reports: Object.fromEntries(Object.keys(FACTIONS).map((k) => [k, emptyReport()])),
    adminLock: {},
  });

  const w1days = [];
  for (let i = 0; i < 4; i++) {
    w1days.push(makeDay(curUtcMs));
    curUtcMs += DAY_MS;
  }
  weeks.push({ id: uid(), weekNumber: 1, startLabel: "02.04 — 05.04", days: w1days });

  let weekNum = 2;
  while (new Date(curUtcMs).getUTCFullYear() === 2026) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(makeDay(curUtcMs));
      curUtcMs += DAY_MS;
    }
    weeks.push({
      id: uid(),
      weekNumber: weekNum++,
      startLabel: `${days[0].label} — ${days[6].label}`,
      days,
    });
  }
  return weeks;
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
:root{--r-xs:10px;--r-sm:14px;--r-md:18px;--r-lg:24px;--ease:cubic-bezier(.22,1,.36,1);--fast:140ms;--mid:220ms;--slow:420ms;}
html,body,#root{height:100%;}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);transition:background var(--slow) var(--ease),color var(--slow) var(--ease);}
body[data-theme="dark"]{--bg:#0f1115;--bg-soft:#151922;--bg-elev:#1a1f2b;--panel:#171b24;--panel-2:#1c2230;--panel-3:#202736;--line:rgba(255,255,255,.07);--line-2:rgba(255,255,255,.12);--text:#f3f5f8;--text-2:#b5bcc8;--text-3:#7f8793;--accent:#8b95a7;--accent-strong:#a6afbf;--ok:#6e9c84;--warn:#b59a6c;--bad:#b97878;--shadow-1:0 8px 22px rgba(0,0,0,.18);--shadow-2:0 18px 50px rgba(0,0,0,.24);--page:radial-gradient(circle at top left,rgba(255,255,255,.03),transparent 26%),radial-gradient(circle at top right,rgba(255,255,255,.02),transparent 18%),linear-gradient(180deg,#0f1115 0%,#11141b 100%);}
body[data-theme="light"]{--bg:#f4f6f9;--bg-soft:#eef2f7;--bg-elev:#ffffff;--panel:#ffffff;--panel-2:#f8fafc;--panel-3:#eef3f8;--line:rgba(15,23,42,.08);--line-2:rgba(15,23,42,.12);--text:#161c26;--text-2:#4f5b6c;--text-3:#8a95a7;--accent:#667289;--accent-strong:#515c70;--ok:#5e8d73;--warn:#a88d5f;--bad:#aa6b6b;--shadow-1:0 8px 22px rgba(15,23,42,.06);--shadow-2:0 18px 40px rgba(15,23,42,.10);--page:radial-gradient(circle at top left,rgba(15,23,42,.025),transparent 24%),radial-gradient(circle at top right,rgba(15,23,42,.02),transparent 18%),linear-gradient(180deg,#f4f6f9 0%,#edf1f6 100%);}
body{background:var(--page);background-attachment:fixed;}
input,textarea,select,button{font-family:'Inter',sans-serif;}
input,textarea,select{width:100%;border:1px solid var(--line);background:var(--panel-2);color:var(--text);border-radius:14px;padding:11px 13px;font-size:14px;outline:none;transition:border-color var(--mid) var(--ease),background var(--mid) var(--ease),transform var(--fast) var(--ease),box-shadow var(--mid) var(--ease);}
input:hover,textarea:hover,select:hover{border-color:var(--line-2);}
input:focus,textarea:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 4px rgba(127,135,147,.12);transform:translateY(-1px);}
textarea{resize:vertical;min-height:96px;line-height:1.55;}
button{cursor:pointer;}
input[type="date"]{color-scheme:light dark;}
::-webkit-scrollbar{width:8px;height:8px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:rgba(127,135,147,.45);border-radius:999px;}
::-webkit-scrollbar-thumb:hover{background:rgba(127,135,147,.62);}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
@keyframes popIn{from{opacity:0;transform:scale(.985);}to{opacity:1;transform:scale(1);}}
@keyframes slideDown{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:translateY(0);}}
@keyframes pulseGlow{0%{box-shadow:0 0 0 0 rgba(255,255,255,0);}50%{box-shadow:0 0 0 6px rgba(127,135,147,.08);}100%{box-shadow:0 0 0 0 rgba(255,255,255,0);}}
@keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
@keyframes linkReveal{0%{opacity:0;transform:translateY(6px) scale(.97);}100%{opacity:1;transform:translateY(0) scale(1);}}
@keyframes weekUnlock{0%{opacity:0;transform:translateY(10px) scale(.98);}60%{transform:translateY(-2px) scale(1.005);}100%{opacity:1;transform:translateY(0) scale(1);}}
.fade{animation:fadeUp .34s var(--ease);}
.pop{animation:popIn .22s var(--ease);}
.slide-down{animation:slideDown .22s var(--ease);}
.week-unlock{animation:weekUnlock .5s var(--ease);}
.page-shell{height:100vh;display:flex;flex-direction:column;overflow:hidden;}
.topbar{height:64px;display:flex;align-items:center;gap:12px;padding:0 18px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--panel) 90%,transparent);backdrop-filter:blur(10px);flex-shrink:0;}
.brand{display:flex;align-items:center;gap:12px;min-width:0;}
.brand-mark{width:38px;height:38px;border-radius:12px;background:var(--panel-3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;letter-spacing:.04em;box-shadow:var(--shadow-1);}
.brand-title{font-size:15px;font-weight:800;letter-spacing:-.02em;}
.brand-sub{font-size:10px;color:var(--text-3);margin-top:2px;}
.main{flex:1;display:flex;min-height:0;}
.sidebar{width:270px;border-right:1px solid var(--line);background:color-mix(in srgb,var(--panel) 92%,transparent);display:flex;flex-direction:column;min-height:0;flex-shrink:0;}
.sidebar-head{padding:14px 14px 10px;border-bottom:1px solid var(--line);}
.sidebar-scroll{flex:1;min-height:0;overflow:auto;padding:10px;}
.section{background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow-1);}
.section-hover{transition:transform var(--mid) var(--ease),box-shadow var(--mid) var(--ease),border-color var(--mid) var(--ease),background var(--mid) var(--ease);}
.section-hover:hover{transform:translateY(-1px);box-shadow:var(--shadow-2);border-color:var(--line-2);}
.content{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;}
.content-scroll{flex:1;min-height:0;overflow:auto;}
.btn{border:1px solid var(--line);background:var(--panel-2);color:var(--text);border-radius:12px;padding:9px 14px;font-size:13px;font-weight:700;transition:transform var(--fast) var(--ease),background var(--mid) var(--ease),border-color var(--mid) var(--ease),box-shadow var(--mid) var(--ease),color var(--mid) var(--ease),opacity var(--mid) var(--ease);white-space:nowrap;}
.btn:hover{transform:translateY(-1px);border-color:var(--line-2);}
.btn:active{transform:translateY(0) scale(.985);}
.btn-primary{background:var(--text);color:var(--bg);border-color:transparent;box-shadow:var(--shadow-1);}
.btn-primary:hover{box-shadow:var(--shadow-2);}
.btn-soft{background:var(--panel-3);}
.btn-ghost{background:transparent;}
.btn-success{background:rgba(110,156,132,.14);color:var(--ok);border-color:rgba(110,156,132,.24);}
.btn-danger{background:rgba(185,120,120,.14);color:var(--bad);border-color:rgba(185,120,120,.24);}
.btn-warn{background:rgba(181,154,108,.14);color:var(--warn);border-color:rgba(181,154,108,.24);}
.tabbar{display:flex;gap:6px;}
.tab{padding:9px 12px;border-radius:12px;font-size:12px;font-weight:700;border:1px solid transparent;background:transparent;color:var(--text-2);transition:all var(--mid) var(--ease);}
.tab:hover{background:var(--panel-2);color:var(--text);}
.tab.active{background:var(--panel-3);color:var(--text);border-color:var(--line);box-shadow:var(--shadow-1);}
.badge{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid var(--line);background:var(--panel-2);}
.badge-lock{color:var(--warn);}
.kicker{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3);}
.title-lg{font-size:26px;font-weight:800;letter-spacing:-.03em;}
.title-md{font-size:20px;font-weight:800;letter-spacing:-.02em;}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;}
.user-pill{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:14px;border:1px solid var(--line);background:var(--panel);}
.user-avatar{width:24px;height:24px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;background:var(--panel-3);border:1px solid var(--line);}
.selector-item{border:1px solid transparent;border-radius:14px;padding:10px 12px;transition:all var(--mid) var(--ease);cursor:pointer;}
.selector-item:hover{background:var(--panel-2);border-color:var(--line);}
.selector-item.active{background:var(--panel-3);border-color:var(--line-2);box-shadow:var(--shadow-1);}
.selector-item.muted{opacity:.56;}
.overview-strip{padding:14px 20px;border-bottom:1px solid var(--line);overflow:auto;flex-shrink:0;}
.overview-grid{display:grid;grid-auto-flow:column;grid-auto-columns:240px;gap:12px;}
.dept-card{padding:14px;border-radius:18px;border:1px solid var(--line);background:var(--panel);box-shadow:var(--shadow-1);transition:transform var(--mid) var(--ease),box-shadow var(--mid) var(--ease),border-color var(--mid) var(--ease);}
.dept-card:hover{transform:translateY(-1px);box-shadow:var(--shadow-2);border-color:var(--line-2);}
.metric-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
.stack{display:flex;flex-direction:column;gap:10px;}
.card-pad{padding:18px;}
.login-shell{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:22px;}
.login-card{width:100%;max-width:420px;padding:28px;border-radius:24px;}
.theme-toggle{width:40px;height:40px;padding:0;display:flex;align-items:center;justify-content:center;}
.week-list{display:flex;flex-direction:column;gap:8px;}
.week-card{padding:10px;}
.week-days{margin-top:8px;display:flex;flex-direction:column;gap:4px;}
.day-row{padding:9px 10px;border-radius:12px;border:1px solid transparent;transition:all var(--mid) var(--ease);cursor:pointer;display:flex;align-items:center;gap:8px;}
.day-row:hover{background:var(--panel-2);border-color:var(--line);}
.day-row.active{background:var(--panel-3);border-color:var(--line-2);box-shadow:var(--shadow-1);}
.day-row.future{opacity:.38;cursor:default;}
.dot{width:8px;height:8px;border-radius:999px;flex-shrink:0;}
.rating-row{display:flex;gap:8px;}
.rating-pill{flex:1;height:42px;border-radius:14px;border:1px solid var(--line);background:var(--panel-2);display:flex;align-items:center;justify-content:center;font-weight:800;transition:all var(--mid) var(--ease);cursor:pointer;}
.rating-pill:hover{transform:translateY(-1px);}
.table-shell{overflow:auto;border-radius:18px;border:1px solid var(--line);background:var(--panel);box-shadow:var(--shadow-1);}
th,td{transition:background var(--mid) var(--ease);}
.quick-appear{animation:fadeUp .28s var(--ease);}
.pulse{animation:pulseGlow 1.2s var(--ease);}
.invite-link-reveal{animation:linkReveal .32s var(--ease);}
.invite-spinner{animation:spin .8s linear infinite;display:inline-block;}
.locked-week{opacity:.42;pointer-events:none;filter:blur(.4px);}
.week-locked-badge{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--text-3);padding:4px 8px;border-radius:8px;background:var(--panel-2);border:1px solid var(--line);margin-top:6px;}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;}
.modal-card{background:var(--panel);border:1px solid var(--line-2);border-radius:24px;padding:28px;max-width:520px;width:100%;box-shadow:var(--shadow-2);animation:popIn .22s var(--ease);}
`;

const SectionLabel = ({ children, color = "var(--text-3)" }) => (
  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color, marginBottom: 12 }}>
    {children}
  </div>
);

const ThemeToggle = ({ theme, onToggle }) => (
  <button onClick={onToggle} className="btn btn-ghost theme-toggle" title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}>
    <span style={{ fontSize: 16 }}>{theme === "dark" ? "☀️" : "🌙"}</span>
  </button>
);

const Toggle = ({ checked, onChange, label, disabled }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1, userSelect: "none" }}>
    <div onClick={() => !disabled && onChange(!checked)} style={{ width: 42, height: 24, borderRadius: 999, border: "1px solid var(--line)", background: checked ? "var(--text)" : "var(--panel-2)", display: "flex", alignItems: "center", justifyContent: checked ? "flex-end" : "flex-start", padding: 2, transition: "all var(--mid) var(--ease)" }}>
      <div style={{ width: 18, height: 18, borderRadius: 999, background: checked ? "var(--bg)" : "var(--text-3)", transition: "all var(--mid) var(--ease)" }} />
    </div>
    {label && <span style={{ fontSize: 13, color: checked ? "var(--text)" : "var(--text-2)" }}>{label}</span>}
    {checked && <span className="badge">Да</span>}
  </label>
);

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="section" style={{ padding: "12px 14px", borderRadius: 14, minWidth: 180 }}>
      <div style={{ color: "var(--text-3)", marginBottom: 8, fontWeight: 700, fontSize: 11 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "center", fontSize: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: p.color, display: "inline-block", flexShrink: 0 }} />
          <span style={{ color: "var(--text-2)" }}>{p.name}:</span>
          <span style={{ fontWeight: 800, color: "var(--text)" }}>{p.value ?? "—"}</span>
        </div>
      ))}
    </div>
  );
};


const RatingBar = ({ value, onChange, compact = false, disabled = false }) => {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  return (
    <div style={{ opacity: disabled ? 0.55 : 1 }}>
      <div className="rating-row">
        {[1,2,3,4,5].map((n) => {
          const active = n <= display;
          const color = display > 0 ? RATING_COLORS[display - 1] : "var(--text-3)";
          return (
            <div
              key={n}
              className="rating-pill"
              onClick={() => !disabled && onChange(n === value ? 0 : n)}
              onMouseEnter={() => !disabled && setHover(n)}
              onMouseLeave={() => setHover(0)}
              title={disabled ? "" : RATING_LABELS[n - 1]}
              style={{
                height: compact ? 34 : 42,
                background: active ? color : "var(--panel-2)",
                borderColor: active ? color : "var(--line)",
                color: active ? "#fff" : "var(--text-3)",
                boxShadow: active ? `0 10px 24px ${color}33` : "none",
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {n}
            </div>
          );
        })}
      </div>
      {!compact && (
        <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, marginTop: 8, color: display ? RATING_COLORS[display - 1] : "var(--text-3)" }}>
          {display ? `${display}/5 · ${RATING_LABELS[display - 1]}` : "Поставьте оценку"}
        </div>
      )}
    </div>
  );
};

function ConfirmModal({ title, message, onConfirm, onCancel, confirmLabel = "Подтвердить", danger = false }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="title-md" style={{ marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 22 }}>{message}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} className="btn btn-soft">Отмена</button>
          <button onClick={onConfirm} className={`btn ${danger ? "btn-danger" : "btn-primary"}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function LoginView({ inviteToken }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteValid, setInviteValid] = useState(null);
  const [isRegMode, setIsRegMode] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);

  useEffect(() => {
    if (!inviteToken) return;
    (async () => {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from("invitations")
        .select("id, expires_at, used")
        .eq("token", inviteToken)
        .single();
      if (data && !data.used && data.expires_at > now) {
        setInviteValid(true);
        setIsRegMode(true);
      } else {
        setInviteValid(false);
      }
    })();
  }, [inviteToken]);

  const handleLogin = async () => {
    if (!login.trim() || !password.trim()) return;
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: loginToEmail(login), password });
    if (error) setError("Неверный логин или пароль");
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!login.trim() || !password.trim()) return;
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signUp({ email: loginToEmail(login), password });
    if (error) {
      if (error.message.toLowerCase().includes("already")) setError("Этот логин уже занят");
      else setError(error.message);
      setLoading(false);
      return;
    }
    await supabase.from("invitations").update({ used: true }).eq("token", inviteToken);
    const url = new URL(window.location.href);
    url.searchParams.delete("invite");
    window.history.replaceState({}, "", url.toString());
    setRegSuccess(true);
    setLoading(false);
  };

  if (inviteToken && inviteValid === null) {
    return (
      <div className="login-shell">
        <style>{CSS}</style>
        <div style={{ color: "var(--text-3)", fontSize: 13 }}>⏳ Проверка приглашения...</div>
      </div>
    );
  }

  if (inviteToken && inviteValid === false) {
    return (
      <div className="login-shell">
        <style>{CSS}</style>
        <div className="section login-card pop" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>❌</div>
          <div className="title-md" style={{ marginBottom: 8 }}>Ссылка недействительна</div>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 18 }}>Приглашение истекло или уже было использовано.</div>
          <button onClick={() => window.history.replaceState({}, "", window.location.pathname)} className="btn btn-soft">На страницу входа</button>
        </div>
      </div>
    );
  }

  if (regSuccess) {
    return (
      <div className="login-shell">
        <style>{CSS}</style>
        <div className="section login-card pop" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
          <div className="title-md" style={{ marginBottom: 8 }}>Аккаунт создан</div>
          <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
            Войдите с логином <strong style={{ color: "var(--text)" }}>{login}</strong>.<br />
            После входа ожидайте назначения роли.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <style>{CSS}</style>
      <div className="section login-card pop">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div className="brand-mark">ФТ</div>
          <div>
            <div className="brand-title">Трекер Фракций</div>
            <div className="brand-sub">{isRegMode ? "Регистрация по приглашению" : "Командный центр"}</div>
          </div>
        </div>
        <div className="stack">
          <div>
            <div className="kicker" style={{ marginBottom: 6 }}>Логин</div>
            <input type="text" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Ваш логин" autoComplete="username" onKeyDown={(e) => e.key === "Enter" && (isRegMode ? handleRegister() : handleLogin())} />
          </div>
          <div>
            <div className="kicker" style={{ marginBottom: 6 }}>Пароль</div>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={isRegMode ? "new-password" : "current-password"} onKeyDown={(e) => e.key === "Enter" && (isRegMode ? handleRegister() : handleLogin())} />
          </div>
          {error && (
            <div className="section quick-appear" style={{ padding: "12px 14px", color: "var(--bad)", background: "rgba(185,120,120,.10)", borderColor: "rgba(185,120,120,.20)" }}>
              {error}
            </div>
          )}
          {isRegMode && (
            <div className="section" style={{ padding: "12px 14px", color: "var(--ok)", background: "rgba(110,156,132,.10)", borderColor: "rgba(110,156,132,.20)", fontSize: 13 }}>
              🎟 Приглашение действительно. Создайте аккаунт.
            </div>
          )}
          <button
            onClick={isRegMode ? handleRegister : handleLogin}
            disabled={loading || !login.trim() || !password.trim()}
            className={`btn ${!login.trim() || !password.trim() ? "btn-soft" : "btn-primary"}`}
            style={{ width: "100%", marginTop: 4, padding: "12px 14px" }}
          >
            {loading ? "⏳ Загрузка..." : isRegMode ? "Создать аккаунт" : "Войти"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NoRoleView({ email, onLogout }) {
  return (
    <div className="login-shell">
      <style>{CSS}</style>
      <div className="section pop" style={{ padding: 30, maxWidth: 460, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>🔒</div>
        <div className="title-md" style={{ marginBottom: 8 }}>Ожидание доступа</div>
        <div style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 18 }}>
          Аккаунт <span style={{ color: "var(--text)", fontWeight: 700 }}>{emailToLogin(email)}</span> зарегистрирован, но роль ещё не назначена.
        </div>
        <button onClick={onLogout} className="btn btn-soft">Выйти</button>
      </div>
    </div>
  );
}

function BackupsView({ weeks, fields, unlockedWeeks, onRestore, currentUserEmail }) {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [backupName, setBackupName] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [status, setStatus] = useState("");

  const fetchBackups = async () => {
    setLoading(true);
    const { data } = await supabase
      .from(BACKUPS_TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    setBackups(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchBackups(); }, []);

  const createBackup = async () => {
    const name = backupName.trim() || `Бекап ${new Date().toLocaleString("ru-RU")}`;
    setCreating(true);
    setStatus("");
    try {
      const { error } = await supabase.from(BACKUPS_TABLE).insert({
        name,
        created_by_email: currentUserEmail,
        data: { weeks, fields },
      });
      if (error) throw error;
      setBackupName("");
      setStatus("ok");
      await fetchBackups();
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
    setCreating(false);
    setTimeout(() => setStatus(""), 2500);
  };

  const deleteBackup = async (id) => {
    await supabase.from(BACKUPS_TABLE).delete().eq("id", id);
    setConfirmDelete(null);
    await fetchBackups();
  };

  const restoreBackup = async (backup) => {
    try {
      const payload = backup.data;
      if (!payload?.weeks?.length) throw new Error("Нет данных");
      onRestore(payload);
      setConfirmRestore(null);
    } catch (e) {
      console.error(e);
    }
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const getBackupStats = (data) => {
    const w = data?.weeks?.length || 0;
    const days = data?.weeks?.reduce((a, wk) => a + (wk.days?.length || 0), 0) || 0;
    return `${w} нед. · ${days} дней`;
  };

  return (
    <div className="content-scroll" style={{ padding: "24px 24px 28px" }}>
      {confirmRestore && (
        <ConfirmModal
          title="Восстановить бекап?"
          message={`Все текущие данные будут заменены данными из бекапа "${confirmRestore.name}". Это действие необратимо (если нет другого бекапа).`}
          confirmLabel="Восстановить"
          danger
          onConfirm={() => restoreBackup(confirmRestore)}
          onCancel={() => setConfirmRestore(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          title="Удалить бекап?"
          message={`Бекап "${confirmDelete.name}" будет удалён без возможности восстановления.`}
          confirmLabel="Удалить"
          danger
          onConfirm={() => deleteBackup(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <div style={{ maxWidth: 760 }}>
        <div className="title-lg" style={{ marginBottom: 6 }}>Бекапы</div>
        <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 20 }}>
          Создание и восстановление резервных копий всех данных трекера. Доступно только ГС ГОС.
        </div>

        {/* Create backup */}
        <div className="section card-pad quick-appear" style={{ marginBottom: 22 }}>
          <SectionLabel>Создать бекап</SectionLabel>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="kicker" style={{ marginBottom: 6 }}>Название (необязательно)</div>
              <input
                value={backupName}
                onChange={(e) => setBackupName(e.target.value)}
                placeholder={`Бекап ${new Date().toLocaleString("ru-RU")}`}
                onKeyDown={(e) => e.key === "Enter" && createBackup()}
              />
            </div>
            <button
              onClick={createBackup}
              disabled={creating}
              className={`btn ${status === "ok" ? "btn-success" : status === "error" ? "btn-danger" : "btn-primary"}`}
              style={{ minWidth: 160 }}
            >
              {creating ? "⏳ Создание..." : status === "ok" ? "✓ Создан" : status === "error" ? "✕ Ошибка" : "💾 Создать бекап"}
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 10, lineHeight: 1.6 }}>
            Бекап сохраняет все недели, поля и статус разблокировки. Восстановление полностью заменяет текущие данные.
          </div>
        </div>

        <SectionLabel>Список бекапов ({backups.length})</SectionLabel>

        {loading ? (
          <div style={{ color: "var(--text-3)", fontSize: 13 }}>⏳ Загрузка...</div>
        ) : backups.length === 0 ? (
          <div className="section" style={{ padding: "28px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
            <div style={{ fontSize: 14, color: "var(--text-3)" }}>Бекапов пока нет</div>
          </div>
        ) : (
          <div className="stack">
            {backups.map((b) => (
              <div key={b.id} className="section section-hover quick-appear" style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--panel-3)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                  💾
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b.name}
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-3)" }}>
                    <span>📅 {formatDate(b.created_at)}</span>
                    <span>👤 {emailToLogin(b.created_by_email)}</span>
                    <span>📊 {getBackupStats(b.data)}</span>
                  </div>
                </div>
                <button
                  onClick={() => setConfirmRestore(b)}
                  className="btn btn-warn"
                  style={{ fontSize: 12, padding: "8px 12px" }}
                >
                  ↩ Восстановить
                </button>
                <button
                  onClick={() => setConfirmDelete(b)}
                  className="btn btn-danger"
                  style={{ width: 34, height: 34, padding: 0, borderRadius: 10 }}
                  title="Удалить"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsView({ currentUserId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [inviteState, setInviteState] = useState("idle");
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase.from("user_roles").select("*").order("created_at");
    setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const setUserRole = async (userId, role) => {
    setSaving((p) => ({ ...p, [userId]: true }));
    await supabase.from("user_roles").update({ role, updated_at: new Date().toISOString() }).eq("user_id", userId);
    setSaving((p) => ({ ...p, [userId]: false }));
    await fetchUsers();
  };

  const generateInvite = async () => {
    setInviteState("generating");
    setInviteLink("");
    setCopied(false);
    try {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("invitations").insert({ token, expires_at: expiresAt, used: false });
      if (error) throw error;
      const link = `${window.location.origin}${window.location.pathname}?invite=${token}`;
      setInviteLink(link);
      setInviteState("done");
    } catch (e) {
      console.error(e);
      setInviteState("error");
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const roleColor = (role) => {
    if (role === "🔧") return "var(--warn)";
    if (role === "none") return "var(--text-3)";
    if (role.includes("ЦА")) return DEPTS.central.color;
    if (role.includes("МО")) return DEPTS.mo.color;
    if (role.includes("МЮ")) return DEPTS.myu.color;
    if (role.includes("МЗ")) return DEPTS.mz.color;
    return "var(--text-2)";
  };

  return (
    <div className="content-scroll" style={{ padding: "24px 24px 28px" }}>
      <div style={{ maxWidth: 840 }}>
        <div className="title-lg" style={{ marginBottom: 6 }}>Пользователи</div>
        <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 20 }}>Назначение ролей и доступов.</div>

        {/* Invite */}
        <div className="section card-pad quick-appear" style={{ marginBottom: 22 }}>
          <SectionLabel>Пригласить пользователя</SectionLabel>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 14, lineHeight: 1.6 }}>
            Генерирует одноразовую ссылку, действующую <strong style={{ color: "var(--text)" }}>1 час</strong>.
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={generateInvite} disabled={inviteState === "generating"} className="btn btn-primary" style={{ minWidth: 180 }}>
              {inviteState === "generating" ? <><span className="invite-spinner">⚙</span> Генерация...</> : "🎟 Создать приглашение"}
            </button>
            {inviteState === "error" && <span style={{ fontSize: 12, color: "var(--bad)" }}>Ошибка. Проверьте таблицу invitations.</span>}
          </div>
          {inviteState === "done" && inviteLink && (
            <div className="invite-link-reveal" style={{ marginTop: 16 }}>
              <div className="kicker" style={{ marginBottom: 8 }}>Ссылка (действует 1 час)</div>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <div className="section" style={{ flex: 1, padding: "10px 14px", background: "var(--panel-2)", borderRadius: 12, fontSize: 12, fontFamily: "ui-monospace,monospace", color: "var(--text-2)", wordBreak: "break-all", lineHeight: 1.5 }}>
                  {inviteLink}
                </div>
                <button onClick={copyLink} className={`btn ${copied ? "btn-success" : "btn-soft"}`} style={{ minWidth: 80, alignSelf: "stretch" }}>
                  {copied ? "✓ Скопировано" : "Копировать"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Role legend */}
        <div className="section card-pad quick-appear" style={{ marginBottom: 22 }}>
          <SectionLabel>Роли и доступ</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              ["ГС ЦА / ЗГС ЦА", "ГЦЛ, Правительство, СМИ", DEPTS.central.color],
              ["ГС МО / ЗГС МО", "ТСР, СФа, ЛСа", DEPTS.mo.color],
              ["ГС МЮ / ЗГС МЮ", "ЛСПД, СФПД, ФБР, СВАТ", DEPTS.myu.color],
              ["ГС МЗ / ЗГС МЗ", "ЛСМЦ, ЛВМЦ, Пожарные", DEPTS.mz.color],
              ["🔧 Администратор", "Полный доступ", "var(--warn)"],
            ].map(([role, perms, col]) => (
              <div key={role} className="section" style={{ padding: "12px 14px", background: "var(--panel-2)" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: col, marginBottom: 4 }}>{role}</div>
                <div style={{ fontSize: 12, color: "var(--text-2)" }}>{perms}</div>
              </div>
            ))}
          </div>
        </div>

        <SectionLabel>Список ({users.length})</SectionLabel>
        {loading ? (
          <div style={{ color: "var(--text-3)", fontSize: 13 }}>⏳ Загрузка...</div>
        ) : users.length === 0 ? (
          <div style={{ color: "var(--text-3)", fontSize: 13 }}>Нет пользователей</div>
        ) : (
          <div className="stack">
            {users.map((u) => (
              <div key={u.user_id} className="section section-hover quick-appear" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--panel-3)", border: "1px solid var(--line)", color: roleColor(u.role), fontWeight: 800, flexShrink: 0 }}>
                  {u.role === "🔧" ? "🔧" : emailToLogin(u.email)?.[0]?.toUpperCase() || "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emailToLogin(u.email)}</span>
                    {u.user_id === currentUserId && <span className="badge">вы</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{new Date(u.created_at).toLocaleDateString("ru-RU")}</div>
                </div>
                <span className="badge" style={{ color: roleColor(u.role), borderColor: "var(--line)", background: "var(--panel-2)" }}>
                  {u.role === "none" ? "Нет роли" : u.role}
                </span>
                <select value={u.role} onChange={(e) => setUserRole(u.user_id, e.target.value)} disabled={saving[u.user_id]} style={{ width: 160, fontSize: 12 }}>
                  <option value="none">— Без роли —</option>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                {saving[u.user_id] && <span style={{ fontSize: 13, color: "var(--warn)" }}>⏳</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FormView({ day, factionKey, fields, onUpdate, userRole, todayStr }) {
  if (!day || !factionKey) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-3)" }}>Выберите день и фракцию</div>;
  }

  const fac = FACTIONS[factionKey];
  const dept = DEPTS[fac.dept];
  const rep = day.reports[factionKey] || emptyReport();
  const hasPermission = canEditFaction(userRole, factionKey);

  const isFuture = !isDayEditable(day.date, todayStr);

  const adminLocked = isFactionLockedByAdmin(day, factionKey) && !isAdmin(userRole);

  const canEdit = hasPermission && !isFuture && !adminLocked;

  const setVal = (fid, val) => {
    if (canEdit) onUpdate(factionKey, fid, val, day.date);
  };

  const numFields = fields.filter((f) => f.type === "number");
  const textFields = fields.filter((f) => f.type === "text");
  const boolFields = fields.filter((f) => f.type === "bool");

  return (
    <div className="content-scroll" style={{ padding: "24px 24px 28px" }}>
      <div className="quick-appear">
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <div className="section pulse" style={{ width: 54, height: 54, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--panel-2)", borderColor: "var(--line-2)" }}>
            <div style={{ width: 16, height: 16, borderRadius: 6, background: fac.color }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="kicker" style={{ color: dept.color, marginBottom: 5 }}>{dept.icon} {dept.name}</div>
            <div className="title-lg" style={{ color: "var(--text)" }}>{fac.name}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="kicker" style={{ marginBottom: 5 }}>Дата</div>
            <div className="mono" style={{ fontSize: 14, color: "var(--text-2)" }}>{day.label}</div>
            {isFuture && <div style={{ marginTop: 8 }}><span className="badge" style={{ color: "var(--text-3)" }}>📅 Будущий день</span></div>}
            {!hasPermission && !isFuture && <div style={{ marginTop: 8 }}><span className="badge badge-lock">🔒 Только просмотр</span></div>}
            {adminLocked && <div style={{ marginTop: 8 }}><span className="badge" style={{ color: "var(--warn)" }}>🔧 Заполнено админом</span></div>}
          </div>
        </div>

        {isFuture && (
          <div className="section" style={{ padding: "13px 14px", marginBottom: 18, color: "var(--text-3)", background: "rgba(127,135,147,.08)", borderColor: "rgba(127,135,147,.15)" }}>
            📅 Этот день ещё не наступил. Редактирование недоступно.
          </div>
        )}
        {!isFuture && !hasPermission && (
          <div className="section" style={{ padding: "13px 14px", marginBottom: 18, color: "var(--warn)", background: "rgba(181,154,108,.10)", borderColor: "rgba(181,154,108,.18)" }}>
            У вас нет прав на редактирование этой фракции.
          </div>
        )}
        {!isFuture && adminLocked && (
          <div className="section" style={{ padding: "13px 14px", marginBottom: 18, color: "var(--warn)", background: "rgba(181,154,108,.10)", borderColor: "rgba(181,154,108,.18)" }}>
            🔧 Данные заполнены ГС ГОСом и защищены от изменений.
          </div>
        )}

        <div className="section card-pad section-hover" style={{ marginBottom: 18 }}>
          <SectionLabel color={fac.color}>Оценка фракции</SectionLabel>
          <RatingBar
            value={rep.rating || 0}
            onChange={(v) => canEdit && onUpdate(factionKey, "__rating__", v, day.date)}
            disabled={!canEdit}
          />
        </div>

        <div className="metric-grid">
          <div className="section card-pad section-hover">
            <SectionLabel color={fac.color}>Числовые показатели</SectionLabel>
            <div className="stack">
              {numFields.map((f) => (
                <div key={f.id}>
                  <div className="kicker" style={{ marginBottom: 6 }}>{f.label}</div>
                  <input
                    type="number"
                    min="0"
                    value={rep.values?.[f.id] ?? ""}
                    placeholder="0"
                    disabled={!canEdit}
                    onChange={(e) => setVal(f.id, e.target.value)}
                  />
                </div>
              ))}
              {boolFields.length > 0 && (
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                  {boolFields.map((f) => (
                    <Toggle
                      key={f.id}
                      checked={!!rep.values?.[f.id]}
                      onChange={(v) => setVal(f.id, v)}
                      label={f.label}
                      disabled={!canEdit}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="section card-pad section-hover">
            <SectionLabel>Текстовые данные</SectionLabel>
            {textFields.length === 0 && <div style={{ fontSize: 12, color: "var(--text-3)", padding: "18px 0" }}>Нет текстовых полей.</div>}
            <div className="stack">
              {textFields.map((f) => (
                <div key={f.id}>
                  <div className="kicker" style={{ marginBottom: 6 }}>{f.label}</div>
                  <textarea
                    value={rep.values?.[f.id] ?? ""}
                    placeholder={canEdit ? `Введите ${f.label.toLowerCase()}...` : "—"}
                    disabled={!canEdit}
                    onChange={(e) => setVal(f.id, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsView({ days: allDays, fields }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [groupBy, setGroupBy] = useState("day");
  const [filterMode, setFilterMode] = useState("all");
  const [selDept, setSelDept] = useState("central");
  const [selFactions, setSelFactions] = useState(Object.keys(FACTIONS));
  const [excludedDates, setExcludedDates] = useState([]);

  const days = useMemo(() => allDays.filter((d) => !excludedDates.includes(d.date)), [allDays, excludedDates]);

  const filtered = useMemo(() =>
    [...days]
      .filter((d) => (!dateFrom || d.date >= dateFrom) && (!dateTo || d.date <= dateTo))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [days, dateFrom, dateTo]
  );

  const visible = useMemo(() => {
    if (filterMode === "all") return Object.keys(FACTIONS);
    if (filterMode === "dept") return DEPT_FACTIONS[selDept] || [];
    return selFactions;
  }, [filterMode, selDept, selFactions]);

  const numFields = fields.filter((f) => f.type === "number");
  const buildKey = (fk, label) => `${FACTIONS[fk].name}/${label}`;

  const chartData = useMemo(() => {
    if (groupBy === "day") {
      return filtered.map((d) => {
        const e = { label: d.label };
        visible.forEach((fk) => {
          numFields.forEach((f) => { e[buildKey(fk, f.label)] = Number(d.reports[fk]?.values?.[f.id]) || 0; });
          e[buildKey(fk, "Оценка")] = d.reports[fk]?.rating || 0;
        });
        return e;
      });
    }
    const byM = {};
    filtered.forEach((d) => {
      const m = d.date.slice(0, 7);
      if (!byM[m]) byM[m] = { label: m, _n: 0 };
      byM[m]._n++;
      visible.forEach((fk) => {
        numFields.forEach((f) => { byM[m][buildKey(fk, f.label)] = (byM[m][buildKey(fk, f.label)] || 0) + (Number(d.reports[fk]?.values?.[f.id]) || 0); });
        byM[m][buildKey(fk, "Оценка")] = (byM[m][buildKey(fk, "Оценка")] || 0) + (d.reports[fk]?.rating || 0);
      });
    });
    return Object.values(byM).map((m) => {
      const res = { label: m.label };
      visible.forEach((fk) => {
        numFields.forEach((f) => { res[buildKey(fk, f.label)] = Math.round(m[buildKey(fk, f.label)] / m._n) || 0; });
        res[buildKey(fk, "Оценка")] = +((m[buildKey(fk, "Оценка")] / m._n) || 0).toFixed(1);
      });
      return res;
    });
  }, [filtered, visible, numFields, groupBy]);

  const Legend = () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
      {visible.map((fk) => (
        <div key={fk} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-2)" }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: FACTIONS[fk].color, display: "block" }} />
          {FACTIONS[fk].name}
        </div>
      ))}
    </div>
  );

  const Card = ({ title, children }) => (
    <div className="section card-pad section-hover quick-appear" style={{ marginBottom: 16 }}>
      <SectionLabel>{title}</SectionLabel>
      {children}
      <Legend />
    </div>
  );

  if (chartData.length < 2) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "var(--text-3)" }}>
        <div style={{ fontSize: 40 }}>📊</div>
        <div className="title-md">Добавьте минимум 2 дня</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <div style={{ width: 250, borderRight: "1px solid var(--line)", padding: "16px 14px", overflow: "auto", flexShrink: 0, background: "color-mix(in srgb, var(--panel) 92%, transparent)" }}>
        <SectionLabel>Период</SectionLabel>
        <div className="stack" style={{ marginBottom: 20 }}>
          <div>
            <div className="kicker" style={{ marginBottom: 6 }}>От</div>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <div className="kicker" style={{ marginBottom: 6 }}>До</div>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="btn btn-soft">Сбросить период</button>}
        </div>

        <SectionLabel>Исключить дни</SectionLabel>
        <div style={{ marginBottom: 20 }}>
          <select multiple value={excludedDates} onChange={(e) => setExcludedDates(Array.from(e.target.selectedOptions, (o) => o.value))} style={{ height: 126, fontSize: 12 }}>
            {allDays.map((d) => <option key={d.date} value={d.date}>{d.label}</option>)}
          </select>
          {excludedDates.length > 0 && <button onClick={() => setExcludedDates([])} className="btn btn-soft" style={{ marginTop: 8, width: "100%" }}>Очистить</button>}
        </div>

        <SectionLabel>Группировка</SectionLabel>
        <div className="tabbar" style={{ marginBottom: 20 }}>
          {[["day","По дням"],["month","По месяцам"]].map(([v, l]) => (
            <button key={v} onClick={() => setGroupBy(v)} className={`tab ${groupBy === v ? "active" : ""}`} style={{ flex: 1 }}>{l}</button>
          ))}
        </div>

        <SectionLabel>Фильтр</SectionLabel>
        <div className="stack" style={{ marginBottom: 14 }}>
          {[["all","Все"],["dept","По отделу"],["faction","Выбрать"]].map(([v, l]) => (
            <div key={v} className={`selector-item ${filterMode === v ? "active" : ""}`} onClick={() => setFilterMode(v)}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{l}</div>
            </div>
          ))}
        </div>
        {filterMode === "dept" && (
          <div className="slide-down stack">
            {Object.entries(DEPTS).map(([dk, dv]) => (
              <div key={dk} className={`selector-item ${selDept === dk ? "active" : ""}`} onClick={() => setSelDept(dk)}>
                <div style={{ fontSize: 12, fontWeight: 800, color: dv.color }}>{dv.short}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{dv.name}</div>
              </div>
            ))}
          </div>
        )}
        {filterMode === "faction" && (
          <div className="slide-down stack">
            {Object.entries(FACTIONS).map(([fk, fv]) => (
              <label key={fk} className="selector-item" style={{ display: "flex", alignItems: "center", gap: 8, background: selFactions.includes(fk) ? "var(--panel-3)" : undefined, borderColor: selFactions.includes(fk) ? "var(--line-2)" : undefined }}>
                <input type="checkbox" checked={selFactions.includes(fk)} onChange={(e) => setSelFactions((p) => e.target.checked ? [...p, fk] : p.filter((x) => x !== fk))} style={{ width: 14, height: 14, accentColor: fv.color }} />
                <span style={{ fontSize: 12, color: selFactions.includes(fk) ? "var(--text)" : "var(--text-2)" }}>{fv.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="content-scroll" style={{ padding: "20px 22px 28px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16 }}>
          <div className="title-md">Аналитика</div>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>{chartData.length} точек · {visible.length} фракций</span>
        </div>
        <Card title="Оценка фракций">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="rgba(127,135,147,.14)" strokeDasharray="4 4" />
              <XAxis dataKey="label" tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0,5]} ticks={[1,2,3,4,5]} tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              {visible.map((fk) => <Line key={fk} type="monotone" dataKey={buildKey(fk,"Оценка")} stroke={FACTIONS[fk].color} strokeWidth={2.4} dot={{ r: 3.2, fill: FACTIONS[fk].color }} activeDot={{ r: 5 }} />)}
            </LineChart>
          </ResponsiveContainer>
        </Card>
        {numFields.map((f) => (
          <Card key={f.id} title={f.label}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barCategoryGap="22%">
                <CartesianGrid stroke="rgba(127,135,147,.14)" strokeDasharray="4 4" />
                <XAxis dataKey="label" tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                {visible.map((fk) => <Bar key={fk} dataKey={buildKey(fk, f.label)} fill={FACTIONS[fk].color} fillOpacity={0.9} radius={[8,8,0,0]} />)}
              </BarChart>
            </ResponsiveContainer>
          </Card>
        ))}
      </div>
    </div>
  );
}

const thS = { padding: "12px 14px", background: "var(--panel-2)", color: "var(--text-3)", fontSize: 10, fontWeight: 800, letterSpacing: ".10em", textTransform: "uppercase", border: "1px solid var(--line)", whiteSpace: "nowrap" };
const tdS = { padding: "12px 14px", border: "1px solid var(--line)", verticalAlign: "top", fontSize: 13, color: "var(--text)" };

function TablesView({ days, fields }) {
  const [selDate, setSelDate] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
  const target = selDate ? days.find((d) => d.date === selDate) : sorted[0];
  const visFactions = deptFilter === "all" ? Object.keys(FACTIONS) : DEPT_FACTIONS[deptFilter] || [];

  if (!target) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-3)" }}>Нет данных</div>;
  }

  return (
    <div className="content-scroll" style={{ padding: "20px 22px 28px" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <div className="kicker" style={{ marginBottom: 6 }}>Дата</div>
          <select value={selDate} onChange={(e) => setSelDate(e.target.value)} style={{ width: 200 }}>
            <option value="">Последняя запись</option>
            {sorted.map((d) => <option key={d.id} value={d.date}>{d.label}</option>)}
          </select>
        </div>
        <div>
          <div className="kicker" style={{ marginBottom: 6 }}>Отдел</div>
          <div className="tabbar">
            <button onClick={() => setDeptFilter("all")} className={`tab ${deptFilter === "all" ? "active" : ""}`}>Все</button>
            {Object.entries(DEPTS).map(([dk, dv]) => (
              <button key={dk} onClick={() => setDeptFilter(dk)} className={`tab ${deptFilter === dk ? "active" : ""}`}>{dv.short}</button>
            ))}
          </div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 14, color: "var(--text-2)" }}>
          Отчёт: <strong className="mono" style={{ color: "var(--text)" }}>{target.label}</strong>
        </div>
      </div>

      <div className="table-shell quick-appear">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thS, textAlign: "left", minWidth: 160, position: "sticky", left: 0, zIndex: 2, background: "var(--panel-2)" }}>Фракция</th>
              <th style={thS}>Оценка</th>
              {fields.map((f) => <th key={f.id} style={thS}>{f.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {visFactions.map((fk, i) => {
              const fac = FACTIONS[fk];
              const rep = target.reports[fk] || emptyReport();
              const rowBg = i % 2 === 0 ? "transparent" : "rgba(127,135,147,.03)";
              const adminLock = isFactionLockedByAdmin(target, fk);
              return (
                <tr key={fk} style={{ background: rowBg }}>
                  <td style={{ ...tdS, position: "sticky", left: 0, background: i % 2 === 0 ? "var(--panel)" : "var(--panel-2)", zIndex: 1, minWidth: 160 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 999, background: fac.color, flexShrink: 0 }} />
                      <span style={{ color: "var(--text)", fontWeight: 700 }}>{fac.name}</span>
                      {adminLock && <span style={{ fontSize: 10, color: "var(--warn)" }} title="Заполнено ГС ГОС">🔧</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{DEPTS[fac.dept].short}</div>
                  </td>
                  <td style={{ ...tdS, textAlign: "center" }}>
                    {rep.rating > 0
                      ? <span style={{ color: RATING_COLORS[rep.rating - 1], fontWeight: 800 }}>{rep.rating}/5</span>
                      : <span style={{ color: "var(--text-3)" }}>—</span>}
                  </td>
                  {fields.map((f) => {
                    const v = rep.values?.[f.id];
                    let display;
                    if (f.type === "bool") display = v ? <span style={{ color: "var(--ok)", fontWeight: 700 }}>✓ Да</span> : <span style={{ color: "var(--text-3)" }}>✗ Нет</span>;
                    else if (v !== undefined && v !== "" && v !== null) display = <span style={{ color: f.type === "number" ? "var(--text)" : "var(--text-2)" }}>{v}</span>;
                    else display = <span style={{ color: "var(--text-3)" }}>—</span>;
                    return <td key={f.id} style={tdS}>{display}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableField({ f, i, fields, onFieldsChange, typeColor, typeName, canManage }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.id });
  const style = { transform: DndCSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} className="section section-hover" style={{ ...style, display: "flex", alignItems: "center", gap: 14, padding: "13px 16px" }}>
      <div {...attributes} {...listeners} style={{ cursor: canManage ? "grab" : "default", color: "var(--text-3)", fontSize: 16, padding: "0 4px", userSelect: "none", opacity: canManage ? 1 : 0.35 }} title="Перетащить">⠿</div>
      <div style={{ width: 24, height: 24, borderRadius: 8, background: "var(--panel-3)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: typeColor[f.type] || "var(--text-3)", fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{f.label}</span>
        {f.system && <span className="badge" style={{ marginLeft: 8 }}>системное</span>}
      </div>
      <span className="badge" style={{ color: typeColor[f.type] || "var(--text-2)" }}>{typeName[f.type] || f.type}</span>
      {!f.system && canManage
        ? <button onClick={() => onFieldsChange(fields.filter((x) => x.id !== f.id))} className="btn btn-danger" style={{ width: 34, height: 34, padding: 0, borderRadius: 10 }} title="Удалить">✕</button>
        : <div style={{ width: 34 }} />}
    </div>
  );
}

function FieldsView({ fields, onFieldsChange, userRole }) {
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("number");
  const sensors = useSensors(useSensor(PointerSensor));
  const canManage = isAdmin(userRole);

  const addField = () => {
    if (!newLabel.trim() || !canManage) return;
    onFieldsChange([...fields, { id: uid(), label: newLabel.trim(), type: newType, system: false }]);
    setNewLabel("");
  };

  const handleDragEnd = ({ active, over }) => {
    if (!canManage || !over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    onFieldsChange(arrayMove(fields, oldIndex, newIndex));
  };

  const typeColor = { number: DEPTS.central.color, text: DEPTS.myu.color, bool: DEPTS.mz.color };
  const typeName = { number: "Число", text: "Текст", bool: "Да/Нет" };

  return (
    <div className="content-scroll" style={{ padding: "24px 24px 28px", maxWidth: 760 }}>
      <div className="title-lg" style={{ marginBottom: 6 }}>Поля</div>
      <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 20 }}>Управление отображаемыми полями.</div>
      {canManage && (
        <div className="section card-pad quick-appear" style={{ marginBottom: 20 }}>
          <SectionLabel>Новое поле</SectionLabel>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <div className="kicker" style={{ marginBottom: 6 }}>Название</div>
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Например: Нарушения" onKeyDown={(e) => e.key === "Enter" && addField()} />
            </div>
            <div style={{ width: 170 }}>
              <div className="kicker" style={{ marginBottom: 6 }}>Тип</div>
              <select value={newType} onChange={(e) => setNewType(e.target.value)}>
                <option value="number">Число</option>
                <option value="text">Текст</option>
                <option value="bool">Да / Нет</option>
              </select>
            </div>
            <button onClick={addField} disabled={!newLabel.trim()} className={`btn ${newLabel.trim() ? "btn-primary" : "btn-soft"}`}>Добавить</button>
          </div>
        </div>
      )}
      <SectionLabel>Список ({fields.length})</SectionLabel>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="stack">
            {fields.map((f, i) => (
              <SortableField key={f.id} f={f} i={i} fields={fields} onFieldsChange={onFieldsChange} typeColor={typeColor} typeName={typeName} canManage={canManage} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function WeekView({ visibleWeeks, allWeeksCount, weeks, selectedDayId, setSelectedDayId, setView, expandedWeeks, setExpandedWeeks, todayStr }) {
  const currentWeek = visibleWeeks.find((w) => w.days.some((d) => d.date === todayStr));
  const toggleWeek = (weekId) => setExpandedWeeks((p) => ({ ...p, [weekId]: !p[weekId] }));

  const selectDay = (day) => {
    setSelectedDayId(day.id);
    setView("form");
  };

  const lockedCount = allWeeksCount - visibleWeeks.length;

  return (
    <div className="week-list">
      {visibleWeeks.map((week, wi) => {
        const isExpanded = expandedWeeks[week.id] ?? false;
        const isCurrent = currentWeek?.id === week.id;
        const hasDataInWeek = week.days.some(dayHasAnyData);
        const isLastVisible = wi === visibleWeeks.length - 1;
        const lastDay = week.days[week.days.length - 1];

        return (
          <div key={week.id} data-weekid={week.id} className="section week-card">
            <div onClick={() => toggleWeek(week.id)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <span style={{ fontSize: 9, color: isExpanded ? "var(--text)" : "var(--text-3)", transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform var(--mid) var(--ease)" }}>▶</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Неделя {week.weekNumber}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{week.startLabel}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {hasDataInWeek && <span className="dot" style={{ background: "var(--ok)" }} />}
                {isCurrent && <span className="badge">текущая</span>}
              </div>
            </div>
            {isExpanded && (
              <div className="week-days slide-down">
                {week.days.map((day) => {
                  const isSelected = day.id === selectedDayId;
                  const isToday = day.date === todayStr;
                  const hasData = dayHasAnyData(day);
                  const isFuture = !isDayEditable(day.date, todayStr);

                  return (
                    <div
                      key={day.id}
                      className={`day-row ${isSelected ? "active" : ""} ${isFuture ? "future" : ""}`}
                      onClick={() => selectDay(day)}
                    >
                      <span className="dot" style={{ background: isFuture ? "var(--line-2)" : hasData ? "var(--ok)" : "var(--text-3)", opacity: hasData ? 1 : 0.4 }} />
                      <span style={{ flex: 1, fontSize: 12.5, color: isFuture ? "var(--text-3)" : isSelected ? "var(--text)" : "var(--text-2)", fontWeight: isSelected ? 700 : 500 }}>{day.label}</span>
                      {isToday && <span className="badge">сегодня</span>}
                      {isFuture && <span style={{ fontSize: 10, color: "var(--text-3)" }}>📅</span>}
                    </div>
                  );
                })}
              </div>
            )}
            {isLastVisible && lockedCount > 0 && (() => {
              const nextWeek = weeks[wi + 1];
              const unlockDate = nextWeek?.days?.[0]?.date;
              if (!unlockDate) return null;
              const d = new Date(unlockDate + "T00:00:00Z");
              const label = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
              return (
                <div className="week-locked-badge" style={{ marginTop: 8 }}>
                  🔒 Следующая неделя откроется {label} в 00:00 МСК
                </div>
              );
            })()}
          </div>
        );
      })}
      {lockedCount > 0 && (
        <div className="section week-card" style={{ opacity: 0.35, borderStyle: "dashed" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14 }}>🔒</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>
                {lockedCount} {lockedCount === 1 ? "неделя" : lockedCount < 5 ? "недели" : "недель"} заблокировано
              </div>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>Открываются по мере заполнения</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewPanel({ day, onSelectFaction, activeFaction, userRole, todayStr }) {
  if (!day) return null;
  const isFuture = !isDayEditable(day.date, todayStr);

  return (
    <div className="overview-strip">
      {isFuture && (
        <div style={{ marginBottom: 10, padding: "8px 14px", borderRadius: 12, background: "rgba(127,135,147,.08)", border: "1px solid var(--line)", fontSize: 12, color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          📅 Будущий день — только просмотр
        </div>
      )}
      <div className="overview-grid">
        {Object.entries(DEPTS).map(([dk, dv]) => (
          <div key={dk} className="dept-card">
            <div className="kicker" style={{ color: dv.color, marginBottom: 8 }}>{dv.icon} {dv.short}</div>
            <div className="stack" style={{ gap: 6 }}>
              {(DEPT_FACTIONS[dk] || []).map((fk) => {
                const fac = FACTIONS[fk];
                const rep = day.reports[fk] || emptyReport();
                const isAct = activeFaction === fk;
                const locked = !canEditFaction(userRole, fk);
                const adminLock = isFactionLockedByAdmin(day, fk) && !isAdmin(userRole);

                return (
                  <div
                    key={fk}
                    className={`selector-item ${isAct ? "active" : ""} ${(locked || isFuture) ? "muted" : ""}`}
                    onClick={() => onSelectFaction(fk)}
                    style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: fac.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{fac.name}</span>
                    {adminLock && <span style={{ fontSize: 10, color: "var(--warn)" }}>🔧</span>}
                    {locked && !adminLock && <span style={{ fontSize: 10, color: "var(--text-3)" }}>🔒</span>}
                    {rep.rating > 0 && <span style={{ fontSize: 11, color: RATING_COLORS[rep.rating - 1], fontWeight: 700 }}>{rep.rating}/5</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "dark");
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [weeks, setWeeks] = useState([]);
  const [fields, setFields] = useState(INIT_FIELDS);
  const [unlockedWeeks, setUnlockedWeeks] = useState(1);
  const [selectedDayId, setSelectedDayId] = useState(null);
  const [activeFaction, setActiveFaction] = useState("gcl");
  const [view, setView] = useState("form");
  const [expandedDepts, setExpandedDepts] = useState({ central: true, mo: false, myu: false, mz: false });
  const [expandedWeeks, setExpandedWeeks] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");


  const [todayStr, setTodayStr] = useState(getMskDateStr);

  const todayStrRef = useRef(todayStr);
  useEffect(() => { todayStrRef.current = todayStr; }, [todayStr]);

  useEffect(() => {
    let dailyInterval = null;

    const onMidnight = () => {
      const next = getMskDateStr();
      setTodayStr(next);
      todayStrRef.current = next;
      dailyInterval = setInterval(() => {
        const n = getMskDateStr();
        setTodayStr(n);
        todayStrRef.current = n;
      }, 24 * 60 * 60 * 1000);
    };

    const msLeft = msUntilMskMidnight();
    const t = setTimeout(onMidnight, msLeft);

    return () => { clearTimeout(t); if (dailyInterval) clearInterval(dailyInterval); };
  }, []);

  const inviteToken = useMemo(() => new URLSearchParams(window.location.search).get("invite"), []);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserRole(session.user.id);
      else setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchUserRole(session.user.id);
      else { setUserRole(null); setAuthLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId) => {
    try {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).single();
      setUserRole(data?.role || "none");
    } catch {
      setUserRole("none");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setView("form");
    setLoaded(false);
  };

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from(SUPABASE_TABLE)
          .select("data")
          .eq("id", STORAGE_KEY)
          .limit(1);
        if (error) throw error;
        const payload = data?.[0]?.data;
        if (payload?.weeks?.length) {
          const migratedWeeks = payload.weeks.map((w) => ({
            ...w,
            days: w.days.map((d) => ({ ...d, adminLock: d.adminLock || {} })),
          }));
          setWeeks(migratedWeeks);
          if (migratedWeeks[0]?.days?.length) setSelectedDayId(migratedWeeks[0].days[0].id);
        }
        if (payload?.fields?.length) setFields(payload.fields);
      } catch (err) {
        console.error("Ошибка загрузки:", err);
      } finally {
        setLoaded(true);
      }
    })();
  }, [session]);

  useEffect(() => {
    if (loaded && weeks.length === 0) {
      const initialWeeks = generateWeeks();
      setWeeks(initialWeeks);
      if (initialWeeks[0]?.days?.length) setSelectedDayId(initialWeeks[0].days[0].id);
    }
  }, [loaded, weeks.length]);


  useEffect(() => {
    if (!loaded || weeks.length === 0 || !todayStr) return;
    let unlocked = 0;
    for (const week of weeks) {
      if (week.days[0]?.date <= todayStr) unlocked++;
      else break;
    }
    setUnlockedWeeks(Math.max(1, unlocked));
  }, [weeks, todayStr, loaded]);

  const allDays = useMemo(() => weeks.flatMap((w) => w.days), [weeks]);
  const visibleWeeks = useMemo(() => weeks.slice(0, unlockedWeeks), [weeks, unlockedWeeks]);
  const visibleDays = useMemo(() => visibleWeeks.flatMap((w) => w.days), [visibleWeeks]);
  const selectedDay = allDays.find((d) => d.id === selectedDayId);

  const save = async () => {
    setSaveStatus("saving");
    try {
      const { error } = await supabase
        .from(SUPABASE_TABLE)
        .upsert({ id: STORAGE_KEY, data: { weeks, fields } }, { onConflict: "id" });
      if (error) throw error;
      setSaveStatus("saved");
    } catch (err) {
      console.error("Ошибка сохранения:", err);
      setSaveStatus("error");
    }
    setTimeout(() => setSaveStatus("idle"), 2200);
  };

  const updateReport = (factionKey, fieldId, value, dayDate) => {
    if (!canEditFaction(userRole, factionKey)) return;
    if (!isDayEditable(dayDate, todayStrRef.current)) return; 

    setWeeks((p) =>
      p.map((week) => ({
        ...week,
        days: week.days.map((day) => {
          if (day.id !== selectedDayId) return day;

          if (isFactionLockedByAdmin(day, factionKey) && !isAdmin(userRole)) return day;

          const rep = day.reports[factionKey] || emptyReport();

          const newAdminLock = isAdmin(userRole)
            ? { ...(day.adminLock || {}), [factionKey]: true }
            : (day.adminLock || {});

          if (fieldId === "__rating__") {
            return {
              ...day,
              adminLock: newAdminLock,
              reports: { ...day.reports, [factionKey]: { ...rep, rating: value } },
            };
          }
          return {
            ...day,
            adminLock: newAdminLock,
            reports: { ...day.reports, [factionKey]: { ...rep, values: { ...rep.values, [fieldId]: value } } },
          };
        }),
      }))
    );
  };

  const handleRestore = (payload) => {
    const migratedWeeks = (payload.weeks || []).map((w) => ({
      ...w,
      days: w.days.map((d) => ({ ...d, adminLock: d.adminLock || {} })),
    }));
    setWeeks(migratedWeeks);
    if (payload.fields?.length) setFields(payload.fields);
    if (migratedWeeks[0]?.days?.length) setSelectedDayId(migratedWeeks[0].days[0].id);
    setTimeout(() => save(), 300);
  };

  const selectFaction = (fk) => {
    setActiveFaction(fk);
    setView("form");
    setExpandedDepts((p) => ({ ...p, [FACTIONS[fk].dept]: true }));
  };

  const toggleDept = (dk) => setExpandedDepts((p) => ({ ...p, [dk]: !p[dk] }));

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page)", flexDirection: "column", gap: 12 }}>
        <style>{CSS}</style>
        <div style={{ fontSize: 32, animation: "spin 1s linear infinite" }}>⚙</div>
        <div style={{ fontSize: 13, color: "var(--text-3)" }}>Загрузка...</div>
      </div>
    );
  }

  if (!session) return <LoginView inviteToken={inviteToken} />;
  if (!userRole || userRole === "none") return <NoRoleView email={session.user.email} onLogout={handleLogout} />;

  const saveBtnLabel =
    saveStatus === "saving" ? "⏳ Сохранение..." :
    saveStatus === "saved"  ? "✓ Сохранено" :
    saveStatus === "error"  ? "✕ Ошибка" : "Сохранить";

  const navTabs = [
    ["form",     "Данные"],
    ["analytics","Графики"],
    ["tables",   "Таблицы"],
    ["fields",   "Поля"],
    ...(isAdmin(userRole) ? [
      ["backups",   "Бекапы"],
      ["settings",  "Пользователи"],
    ] : []),
  ];

  return (
    <div className="page-shell">
      <style>{CSS}</style>

      {/* Topbar */}
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">ФТ</div>
          <div>
            <div className="brand-title">Трекер Фракций</div>
          </div>
        </div>

        <div className="tabbar">
          {navTabs.map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} className={`tab ${view === v ? "active" : ""}`}>{l}</button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div className="user-pill">
          <div className="user-avatar">
            {userRole === "🔧" ? "🔧" : emailToLogin(session.user.email)?.[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-2)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {emailToLogin(session.user.email)}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 700 }}>{userRole}</div>
          </div>
        </div>

        {visibleDays.length > 0 && (
          <select
            value={selectedDayId || ""}
            onChange={(e) => {
              setSelectedDayId(e.target.value);
              if (!["analytics","tables","fields","settings","backups"].includes(view)) setView("form");
            }}
            style={{ width: 170, fontSize: 12 }}
          >
            {visibleDays.slice().reverse().map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}{!isDayEditable(d.date, todayStr) ? " 📅" : ""}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={save}
          className={`btn ${saveStatus === "saved" ? "btn-success" : saveStatus === "error" ? "btn-danger" : "btn-primary"}`}
        >
          {saveBtnLabel}
        </button>

        <ThemeToggle theme={theme} onToggle={() => setTheme((p) => p === "dark" ? "light" : "dark")} />
        <button onClick={handleLogout} className="btn btn-soft">Выйти</button>
      </div>

      <div className="main">
        {/* Sidebar */}
        <div className="sidebar">
          <div className="sidebar-head">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="kicker">
                Недели ({visibleWeeks.length}{weeks.length > visibleWeeks.length ? `/${weeks.length}` : ""})
              </span>
              <button
                onClick={() => {
                  const cw = visibleWeeks.find((w) => w.days.some((d) => d.date === todayStr));
                  if (cw) {
                    setExpandedWeeks((prev) => ({ ...prev, [cw.id]: true }));
                    setTimeout(() => document.querySelector(`[data-weekid="${cw.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                  }
                }}
                className="btn btn-soft"
                style={{ padding: "7px 10px", fontSize: 11 }}
              >
                Сегодня
              </button>
            </div>
          </div>

          <div className="sidebar-scroll">
            <WeekView
              visibleWeeks={visibleWeeks}
              allWeeksCount={weeks.length}
              weeks={weeks}
              selectedDayId={selectedDayId}
              setSelectedDayId={setSelectedDayId}
              setView={setView}
              expandedWeeks={expandedWeeks}
              setExpandedWeeks={setExpandedWeeks}
              todayStr={todayStr}
            />

            <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div className="stack">
                {Object.entries(DEPTS).map(([dk, dv]) => (
                  <div key={dk}>
                    <div className="selector-item" onClick={() => toggleDept(dk)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 8, color: dv.color, transform: expandedDepts[dk] ? "rotate(90deg)" : "none", transition: "transform var(--mid) var(--ease)" }}>▶</span>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: dv.color, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 800 }}>{dv.short}</div>
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{dv.name}</div>
                      </div>
                    </div>
                    {expandedDepts[dk] && (
                      <div className="slide-down stack" style={{ marginTop: 6, paddingLeft: 10 }}>
                        {(DEPT_FACTIONS[dk] || []).map((fk) => {
                          const fac = FACTIONS[fk];
                          const isAct = activeFaction === fk && view === "form";
                          const locked = !canEditFaction(userRole, fk);
                          const rep = selectedDay?.reports[fk];
                          const hasData = rep && (rep.rating > 0 || Object.values(rep.values || {}).some(hasMeaningfulValue));
                          const adminLock = selectedDay && isFactionLockedByAdmin(selectedDay, fk) && !isAdmin(userRole);

                          return (
                            <div
                              key={fk}
                              className={`selector-item ${isAct ? "active" : ""} ${locked ? "muted" : ""}`}
                              onClick={() => selectFaction(fk)}
                              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}
                            >
                              <span className="dot" style={{ background: fac.color, opacity: hasData ? 1 : 0.38 }} />
                              <span style={{ flex: 1, fontSize: 12.5, fontWeight: isAct ? 700 : 500 }}>{fac.name}</span>
                              {adminLock && <span style={{ fontSize: 10, color: "var(--warn)" }}>🔧</span>}
                              {locked && !adminLock && <span style={{ fontSize: 10, color: "var(--text-3)" }}>🔒</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="content">
          {view === "form" && (
            <>
              <OverviewPanel day={selectedDay} onSelectFaction={selectFaction} activeFaction={activeFaction} userRole={userRole} todayStr={todayStr} />
              <FormView day={selectedDay} factionKey={activeFaction} fields={fields} onUpdate={updateReport} userRole={userRole} todayStr={todayStr} />
            </>
          )}
          {view === "analytics" && <AnalyticsView days={visibleDays} fields={fields} />}
          {view === "tables"    && <TablesView    days={visibleDays} fields={fields} />}
          {view === "fields"    && <FieldsView    fields={fields} onFieldsChange={setFields} userRole={userRole} />}
          {view === "backups" && isAdmin(userRole) && (
            <BackupsView
              weeks={weeks}
              fields={fields}
              unlockedWeeks={unlockedWeeks}
              onRestore={handleRestore}
              currentUserEmail={session.user.email}
            />
          )}
          {view === "settings" && isAdmin(userRole) && <SettingsView currentUserId={session.user.id} />}
          {(view === "backups" || view === "settings") && !isAdmin(userRole) && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12, color: "var(--text-3)" }}>
              <div style={{ fontSize: 34 }}>🔒</div>
              <div>Доступ только для ГС ГОС</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
