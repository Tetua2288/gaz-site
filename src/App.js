import { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
// ═══════════════════════════════════════════════════════════════
// SUPABASE
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "Не найдены REACT_APP_SUPABASE_URL или REACT_APP_SUPABASE_ANON_KEY в .env"
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const SUPABASE_TABLE = "factions_tracker_state";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
const DEPTS = {
  central: { name: "Центральный аппарат", color: "#60a5fa", short: "ЦА", icon: "🏛" },
  mo: { name: "Министерство Обороны", color: "#f87171", short: "МО", icon: "⚔️" },
  myu: { name: "Министерство Юстиций", color: "#a78bfa", short: "МЮ", icon: "⚖️" },
  mz: { name: "Министерство Здравоохранения", color: "#34d399", short: "МЗ", icon: "🏥" },
};

const FACTIONS = {
  gcl: { name: "ГЦЛ", color: "#60a5fa", dept: "central" },
  gov: { name: "Правительство", color: "#c084fc", dept: "central" },
  media: { name: "СМИ", color: "#34d399", dept: "central" },
  tsr: { name: "ТСР", color: "#fb923c", dept: "mo" },
  sfa: { name: "СФа", color: "#fbbf24", dept: "mo" },
  lsa: { name: "ЛСа", color: "#e879f9", dept: "mo" },
  lspd: { name: "ЛСПД", color: "#818cf8", dept: "myu" },
  sfpd: { name: "СФПД", color: "#6ee7b7", dept: "myu" },
  fbr: { name: "ФБР", color: "#93c5fd", dept: "myu" },
  swat: { name: "СВАТ", color: "#fca5a5", dept: "myu" },
  lsmc: { name: "ЛСМЦ", color: "#86efac", dept: "mz" },
  lvmc: { name: "ЛВМЦ", color: "#67e8f9", dept: "mz" },
  fire: { name: "Пожарные", color: "#fdba74", dept: "mz" },
};

const DEPT_FACTIONS = Object.entries(FACTIONS).reduce((acc, [k, v]) => {
  (acc[v.dept] = acc[v.dept] || []).push(k);
  return acc;
}, {});

const INIT_FIELDS = [
  { id: "online", label: "Онлайн", type: "number", system: true },
  { id: "afk", label: "AFK", type: "number", system: true },
  { id: "deputies", label: "Замов в сети", type: "number", system: true },
  { id: "noForm", label: "Без формы", type: "number", system: true },
  { id: "salary", label: "Качают ЗП", type: "number", system: true },
  { id: "leader", label: "Лидер", type: "bool", system: true },
  { id: "forum", label: "Просрочки", type: "bool", system: true },
  { id: "activity", label: "Активность", type: "text", system: true },
  { id: "leaderAct", label: "Деят. лидера", type: "text", system: true },
];

const RATING_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e"];
const RATING_LABELS = ["Критично", "Плохо", "Средне", "Хорошо", "Отлично"];
const STORAGE_KEY = "factions-tracker-v5";

const uid = () => Math.random().toString(36).slice(2, 9);
const emptyReport = () => ({ rating: 0, values: {} });

// ═══════════════════════════════════════════════════════════════
// HELPERS FOR WEEKS
// ═══════════════════════════════════════════════════════════════
const generateWeeks = () => {
  const weeks = [];
  let currentDate = new Date(2026, 3, 2); // 02.04.2026

  // Первая неделя: 02.04 — 05.04 (4 дня)
  const week1Days = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(currentDate);
    week1Days.push({
      id: uid(),
      label: d.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      date: d.toISOString().slice(0, 10),
      reports: Object.fromEntries(Object.keys(FACTIONS).map((k) => [k, emptyReport()])),
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }
  weeks.push({
    id: uid(),
    weekNumber: 1,
    startLabel: "02.04 — 05.04",
    days: week1Days,
  });

  // Остальные недели — полные
  let weekNum = 2;
  while (currentDate.getFullYear() === 2026) {
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentDate);
      weekDays.push({
        id: uid(),
        label: d.toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
        date: d.toISOString().slice(0, 10),
        reports: Object.fromEntries(Object.keys(FACTIONS).map((k) => [k, emptyReport()])),
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    weeks.push({
      id: uid(),
      weekNumber: weekNum++,
      startLabel: `${weekDays[0].label} — ${weekDays[6].label}`,
      days: weekDays,
    });
  }
  return weeks;
};

// ═══════════════════════════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
:root{
  --bg0:#07090f;--bg1:#0d1117;--bg2:#111827;--bg3:#1a2235;
  --blue:#60a5fa;--amber:#f59e0b;--green:#34d399;--red:#f87171;--purple:#a78bfa;
  --t1:#e2e8f0;--t2:#94a3b8;--t3:#4b5875;
  --bd:rgba(255,255,255,0.07);--bd2:rgba(255,255,255,0.13);
}
body{background:var(--bg0);font-family:'IBM Plex Sans',sans-serif;color:var(--t1);}
input,textarea,select{
  background:var(--bg3);border:1px solid var(--bd2);border-radius:8px;
  color:var(--t1);font-family:'IBM Plex Sans',sans-serif;font-size:14px;
  padding:8px 12px;width:100%;transition:border-color .2s;
}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 3px rgba(96,165,250,0.1);}
textarea{resize:vertical;min-height:78px;line-height:1.5;}
input[type=date],input[type=datetime-local]{color-scheme:dark;}
button{font-family:'IBM Plex Sans',sans-serif;cursor:pointer;}
::-webkit-scrollbar{width:5px;height:5px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:3px;}
::-webkit-scrollbar-thumb:hover{background:var(--t3);}
@keyframes fadeUp{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
.fade{animation:fadeUp .22s ease-out;}
`;

// ═══════════════════════════════════════════════════════════════
// SMALL COMPONENTS
// ═══════════════════════════════════════════════════════════════
const SectionLabel = ({ children, color = "var(--t3)" }) => (
  <div
    style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color,
      marginBottom: 10,
    }}
  >
    {children}
  </div>
);

const Toggle = ({ checked, onChange, label }) => (
  <label
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      cursor: "pointer",
      userSelect: "none",
    }}
  >
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 38,
        height: 21,
        borderRadius: 11,
        padding: 2,
        transition: "all .2s",
        background: checked ? "var(--blue)" : "var(--bg3)",
        border: `1px solid ${checked ? "var(--blue)" : "var(--bd2)"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: checked ? "flex-end" : "flex-start",
      }}
    >
      <div style={{ width: 15, height: 15, borderRadius: 8, background: "white" }} />
    </div>
    {label && (
      <span style={{ fontSize: 13, color: checked ? "var(--t1)" : "var(--t2)" }}>
        {label}
      </span>
    )}
    {checked && (
      <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 700 }}>
        ✓ ДА
      </span>
    )}
  </label>
);

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--bg2)",
        border: "1px solid var(--bd2)",
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 12,
      }}
    >
      <div
        style={{
          color: "var(--t3)",
          marginBottom: 8,
          fontWeight: 600,
          fontSize: 11,
        }}
      >
        {label}
      </div>
      {payload.map((p) => (
        <div
          key={p.name}
          style={{ display: "flex", gap: 8, marginBottom: 3, alignItems: "center" }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: p.color,
              display: "inline-block",
            }}
          />
          <span style={{ color: "var(--t2)" }}>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>{p.value ?? "—"}</span>
        </div>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// RATING BAR
// ═══════════════════════════════════════════════════════════════
const RatingBar = ({ value, onChange, compact = false }) => {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  return (
    <div>
      <div style={{ display: "flex", gap: compact ? 4 : 6 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= display;
          const col = display > 0 ? RATING_COLORS[display - 1] : "#4b5875";
          return (
            <div
              key={n}
              onClick={() => onChange(n === value ? 0 : n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              title={RATING_LABELS[n - 1]}
              style={{
                flex: 1,
                height: compact ? 28 : 40,
                borderRadius: compact ? 7 : 9,
                cursor: "pointer",
                transition: "all .18s",
                background: active ? col + "28" : "var(--bg3)",
                border: `1px solid ${active ? col + "99" : "var(--bd2)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: compact ? 14 : 18,
                transform: hover === n ? "translateY(-2px)" : "none",
                boxShadow: active ? `0 0 10px ${col}33` : "none",
              }}
            >
              <span
                style={{
                  opacity: active ? 1 : 0.2,
                  color: active ? col : "var(--t3)",
                  transition: "all .18s",
                }}
              >
                ★
              </span>
            </div>
          );
        })}
      </div>
      {!compact && (
        <div
          style={{
            textAlign: "center",
            fontSize: 11,
            fontWeight: 700,
            marginTop: 6,
            color: display ? RATING_COLORS[display - 1] : "var(--t3)",
            letterSpacing: 0.5,
          }}
        >
          {display ? `${display}/5 — ${RATING_LABELS[display - 1]}` : "Нет оценки — нажмите звезду"}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// FORM VIEW
// ═══════════════════════════════════════════════════════════════
function FormView({ day, factionKey, fields, onUpdate }) {
  if (!day || !factionKey)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--t3)",
        }}
      >
        Выберите день и фракцию
      </div>
    );

  const fac = FACTIONS[factionKey];
  const dept = DEPTS[fac.dept];
  const rep = day.reports[factionKey] || emptyReport();
  const setVal = (fid, val) => onUpdate(factionKey, fid, val);

  const numFields = fields.filter((f) => f.type === "number");
  const textFields = fields.filter((f) => f.type === "text");
  const boolFields = fields.filter((f) => f.type === "bool");

  return (
    <div className="fade" style={{ height: "100%", overflowY: "auto", padding: "22px 26px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 22,
          paddingBottom: 18,
          borderBottom: "1px solid var(--bd)",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 11,
            background: fac.color + "20",
            border: `1px solid ${fac.color}44`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 14, height: 14, borderRadius: 4, background: fac.color }} />
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 10,
              color: dept.color,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: 2,
            }}
          >
            {dept.icon} {dept.name}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              fontFamily: "'Rajdhani',sans-serif",
              color: fac.color,
              letterSpacing: 0.5,
              lineHeight: 1,
            }}
          >
            {fac.name}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--t3)" }}>Запись за</div>
          <div
            style={{
              fontSize: 14,
              fontFamily: "'IBM Plex Mono',monospace",
              color: "var(--t2)",
            }}
          >
            {day.label}
          </div>
        </div>
      </div>

      <div
        style={{
          background: "var(--bg2)",
          border: "1px solid var(--bd)",
          borderRadius: 13,
          padding: "18px 20px",
          marginBottom: 22,
        }}
      >
        <SectionLabel color={fac.color}>⭐ Оценка фракции</SectionLabel>
        <RatingBar value={rep.rating || 0} onChange={(v) => onUpdate(factionKey, "__rating__", v)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div
          style={{
            background: "var(--bg2)",
            border: "1px solid var(--bd)",
            borderRadius: 13,
            padding: "18px 20px",
          }}
        >
          <SectionLabel color={fac.color}>📊 Числовые показатели</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {numFields.map((f) => (
              <div key={f.id}>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--t3)",
                    fontWeight: 600,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    marginBottom: 5,
                  }}
                >
                  {f.label}
                </div>
                <input
                  type="number"
                  min="0"
                  value={rep.values?.[f.id] ?? ""}
                  placeholder="0"
                  onChange={(e) => setVal(f.id, e.target.value)}
                />
              </div>
            ))}
            {boolFields.length > 0 && (
              <div
                style={{
                  borderTop: "1px solid var(--bd)",
                  paddingTop: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {boolFields.map((f) => (
                  <Toggle
                    key={f.id}
                    checked={!!rep.values?.[f.id]}
                    onChange={(v) => setVal(f.id, v)}
                    label={f.label}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            background: "var(--bg2)",
            border: "1px solid var(--bd)",
            borderRadius: 13,
            padding: "18px 20px",
          }}
        >
          <SectionLabel color="var(--purple)">📝 Текстовые данные</SectionLabel>
          {textFields.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--t3)", padding: "20px 0", textAlign: "center" }}>
              Нет текстовых полей.
              <br />
              Добавьте их во вкладке «Поля»
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {textFields.map((f) => (
              <div key={f.id}>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--t3)",
                    fontWeight: 600,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    marginBottom: 5,
                  }}
                >
                  {f.label}
                </div>
                <textarea
                  value={rep.values?.[f.id] ?? ""}
                  placeholder={`Введите ${f.label.toLowerCase()}...`}
                  onChange={(e) => setVal(f.id, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ANALYTICS VIEW
// ═══════════════════════════════════════════════════════════════
function AnalyticsView({ days: allDays, fields }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [groupBy, setGroupBy] = useState("day");
  const [filterMode, setFilterMode] = useState("all");
  const [selDept, setSelDept] = useState("central");
  const [selFactions, setSelFactions] = useState(Object.keys(FACTIONS));
  const [excludedDates, setExcludedDates] = useState([]);

  const days = useMemo(
    () => allDays.filter((d) => !excludedDates.includes(d.date)),
    [allDays, excludedDates]
  );

  const filtered = useMemo(
    () =>
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
          numFields.forEach((f) => {
            e[buildKey(fk, f.label)] = Number(d.reports[fk]?.values?.[f.id]) || 0;
          });
          e[buildKey(fk, "Оценка")] = d.reports[fk]?.rating || 0;
        });
        return e;
      });
    }

    const byM = {};
    filtered.forEach((d) => {
      const m = d.date.slice(0, 7);
      if (!byM[m]) {
        byM[m] = { label: m, _n: 0 };
      }
      byM[m]._n++;
      visible.forEach((fk) => {
        numFields.forEach((f) => {
          byM[m][buildKey(fk, f.label)] =
            (byM[m][buildKey(fk, f.label)] || 0) +
            (Number(d.reports[fk]?.values?.[f.id]) || 0);
        });
        byM[m][buildKey(fk, "Оценка")] =
          (byM[m][buildKey(fk, "Оценка")] || 0) + (d.reports[fk]?.rating || 0);
      });
    });

    return Object.values(byM).map((m) => {
      const res = { label: m.label };
      visible.forEach((fk) => {
        numFields.forEach((f) => {
          res[buildKey(fk, f.label)] = Math.round(m[buildKey(fk, f.label)] / m._n) || 0;
        });
        res[buildKey(fk, "Оценка")] = +(
          (m[buildKey(fk, "Оценка")] / m._n) ||
          0
        ).toFixed(1);
      });
      return res;
    });
  }, [filtered, visible, numFields, groupBy]);

  const Legend = () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
      {visible.map((fk) => (
        <div
          key={fk}
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--t2)" }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: FACTIONS[fk].color,
              display: "block",
            }}
          />
          {FACTIONS[fk].name}
        </div>
      ))}
    </div>
  );

  const Card = ({ title, children }) => (
    <div
      style={{
        background: "var(--bg2)",
        border: "1px solid var(--bd)",
        borderRadius: 13,
        padding: "18px 16px 14px",
        marginBottom: 18,
      }}
    >
      <SectionLabel>{title}</SectionLabel>
      {children}
      <Legend />
    </div>
  );

  if (chartData.length < 2)
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 12,
          color: "var(--t3)",
        }}
      >
        <div style={{ fontSize: 40 }}>📊</div>
        <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 16 }}>
          Добавьте минимум 2 дня для отображения графиков
        </div>
      </div>
    );

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          width: 230,
          borderRight: "1px solid var(--bd)",
          background: "var(--bg1)",
          padding: "14px 12px",
          overflowY: "auto",
          flexShrink: 0,
        }}
      >
        <SectionLabel>Период</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: "var(--t3)" }}>От</div>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <div style={{ fontSize: 11, color: "var(--t3)" }}>До</div>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              style={{
                fontSize: 11,
                color: "var(--red)",
                background: "transparent",
                border: "none",
                textAlign: "left",
                padding: 0,
              }}
            >
              ✕ Сбросить период
            </button>
          )}
        </div>

        <SectionLabel>Исключить дни</SectionLabel>
        <div style={{ marginBottom: 18 }}>
          <select
            multiple
            value={excludedDates}
            onChange={(e) =>
              setExcludedDates(Array.from(e.target.selectedOptions, (opt) => opt.value))
            }
            style={{ height: 140, fontSize: 12 }}
          >
            {allDays.map((d) => (
              <option key={d.date} value={d.date}>
                {d.label}
              </option>
            ))}
          </select>
          {excludedDates.length > 0 && (
            <button
              onClick={() => setExcludedDates([])}
              style={{ marginTop: 6, fontSize: 11, color: "var(--red)" }}
            >
              Сбросить исключения
            </button>
          )}
        </div>

        <SectionLabel>Группировка</SectionLabel>
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {[
            ["day", "По дням"],
            ["month", "По месяцам"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setGroupBy(v)}
              style={{
                flex: 1,
                padding: "7px 6px",
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 500,
                border: `1px solid ${groupBy === v ? "var(--blue)" : "var(--bd2)"}`,
                background: groupBy === v ? "rgba(96,165,250,.12)" : "transparent",
                color: groupBy === v ? "var(--blue)" : "var(--t2)",
              }}
            >
              {l}
            </button>
          ))}
        </div>

        <SectionLabel>Фракции</SectionLabel>
        {[
          ["all", "Все"],
          ["dept", "По отделу"],
          ["faction", "Выбрать"],
        ].map(([v, l]) => (
          <div
            key={v}
            onClick={() => setFilterMode(v)}
            style={{
              padding: "8px 10px",
              borderRadius: 7,
              marginBottom: 3,
              cursor: "pointer",
              fontSize: 13,
              background: filterMode === v ? "rgba(96,165,250,.1)" : "transparent",
              color: filterMode === v ? "var(--blue)" : "var(--t2)",
              border: `1px solid ${filterMode === v ? "rgba(96,165,250,.3)" : "transparent"}`,
            }}
          >
            {l}
          </div>
        ))}

        {filterMode === "dept" && (
          <div style={{ marginTop: 10 }}>
            {Object.entries(DEPTS).map(([dk, dv]) => (
              <div
                key={dk}
                onClick={() => setSelDept(dk)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 7,
                  marginBottom: 3,
                  cursor: "pointer",
                  background: selDept === dk ? dv.color + "18" : "transparent",
                  border: `1px solid ${selDept === dk ? dv.color + "44" : "transparent"}`,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: dv.color }}>{dv.short}</div>
                <div style={{ fontSize: 10, color: "var(--t3)" }}>{dv.name.slice(0, 24)}</div>
              </div>
            ))}
          </div>
        )}

        {filterMode === "faction" && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {Object.entries(FACTIONS).map(([fk, fv]) => (
              <label
                key={fk}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 7,
                  cursor: "pointer",
                  background: selFactions.includes(fk) ? fv.color + "14" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={selFactions.includes(fk)}
                  onChange={(e) =>
                    setSelFactions((p) =>
                      e.target.checked ? [...p, fk] : p.filter((x) => x !== fk)
                    )
                  }
                  style={{ width: 14, height: 14, accentColor: fv.color }}
                />
                <span style={{ fontSize: 12, color: selFactions.includes(fk) ? fv.color : "var(--t2)" }}>
                  {fv.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Rajdhani',sans-serif" }}>
            Аналитика
          </div>
          <span style={{ fontSize: 12, color: "var(--t3)" }}>
            {chartData.length} точек · {visible.length} фракций
          </span>
        </div>

        <Card title="Оценка фракций (1–5)">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid {...{ stroke: "rgba(255,255,255,0.05)", strokeDasharray: "4 4" }} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#4b5875", fontSize: 11, fontFamily: "IBM Plex Mono" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 5]}
                ticks={[1, 2, 3, 4, 5]}
                tick={{ fill: "#4b5875", fontSize: 11, fontFamily: "IBM Plex Mono" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChartTip />} />
              {visible.map((fk) => (
                <Line
                  key={fk}
                  type="monotone"
                  dataKey={buildKey(fk, "Оценка")}
                  stroke={FACTIONS[fk].color}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: FACTIONS[fk].color }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {numFields.map((f) => (
          <Card key={f.id} title={f.label}>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={chartData} barCategoryGap="22%">
                <CartesianGrid {...{ stroke: "rgba(255,255,255,0.05)", strokeDasharray: "4 4" }} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#4b5875", fontSize: 11, fontFamily: "IBM Plex Mono" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#4b5875", fontSize: 11, fontFamily: "IBM Plex Mono" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTip />} />
                {visible.map((fk) => (
                  <Bar
                    key={fk}
                    dataKey={buildKey(fk, f.label)}
                    fill={FACTIONS[fk].color}
                    fillOpacity={0.82}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TABLES VIEW
// ═══════════════════════════════════════════════════════════════
const thS = {
  padding: "9px 13px",
  background: "var(--bg3)",
  color: "var(--t3)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  border: "1px solid var(--bd)",
  whiteSpace: "nowrap",
};

const tdS = {
  padding: "10px 13px",
  border: "1px solid var(--bd)",
  verticalAlign: "top",
  fontSize: 13,
};

function TablesView({ days, fields }) {
  const [selDate, setSelDate] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");

  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
  const target = selDate ? days.find((d) => d.date === selDate) : sorted[0];
  const visFactions = deptFilter === "all" ? Object.keys(FACTIONS) : DEPT_FACTIONS[deptFilter] || [];

  if (!target)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--t3)",
        }}
      >
        Нет данных для отображения
      </div>
    );

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "20px 24px" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 5 }}>Дата</div>
          <select value={selDate} onChange={(e) => setSelDate(e.target.value)} style={{ width: 190 }}>
            <option value="">Последняя запись</option>
            {sorted.map((d) => (
              <option key={d.id} value={d.date}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 5 }}>Отдел</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={() => setDeptFilter("all")}
              style={{
                padding: "7px 12px",
                borderRadius: 7,
                fontSize: 12,
                border: `1px solid ${deptFilter === "all" ? "var(--blue)" : "var(--bd2)"}`,
                background: deptFilter === "all" ? "rgba(96,165,250,.12)" : "transparent",
                color: deptFilter === "all" ? "var(--blue)" : "var(--t2)",
              }}
            >
              Все
            </button>
            {Object.entries(DEPTS).map(([dk, dv]) => (
              <button
                key={dk}
                onClick={() => setDeptFilter(dk)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 7,
                  fontSize: 12,
                  border: `1px solid ${deptFilter === dk ? dv.color : "var(--bd2)"}`,
                  background: deptFilter === dk ? dv.color + "18" : "transparent",
                  color: deptFilter === dk ? dv.color : "var(--t2)",
                }}
              >
                {dv.short}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 14, color: "var(--t2)" }}>
          Отчёт:{" "}
          <strong style={{ color: "var(--t1)", fontFamily: "'IBM Plex Mono',monospace" }}>
            {target.label}
          </strong>
        </div>
      </div>

      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--bd)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th
                style={{
                  ...thS,
                  textAlign: "left",
                  minWidth: 140,
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                  background: "var(--bg3)",
                }}
              >
                Фракция
              </th>
              <th style={thS}>Оценка</th>
              {fields.map((f) => (
                <th key={f.id} style={thS}>
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visFactions.map((fk, i) => {
              const fac = FACTIONS[fk];
              const rep = target.reports[fk] || emptyReport();
              const rowBg = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)";
              return (
                <tr key={fk} style={{ background: rowBg }}>
                  <td
                    style={{
                      ...tdS,
                      position: "sticky",
                      left: 0,
                      background: i % 2 === 0 ? "var(--bg1)" : "var(--bg2)",
                      zIndex: 1,
                      minWidth: 140,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{ width: 8, height: 8, borderRadius: 2, background: fac.color, flexShrink: 0 }}
                      />
                      <span style={{ color: fac.color, fontWeight: 700 }}>{fac.name}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>
                      {DEPTS[fac.dept].short}
                    </div>
                  </td>
                  <td style={{ ...tdS, textAlign: "center" }}>
                    {rep.rating > 0 ? (
                      <span
                        style={{
                          color: RATING_COLORS[rep.rating - 1],
                          fontWeight: 700,
                          letterSpacing: 1,
                        }}
                      >
                        {"★".repeat(rep.rating)}
                        {"☆".repeat(5 - rep.rating)}
                      </span>
                    ) : (
                      <span style={{ color: "var(--t3)" }}>—</span>
                    )}
                  </td>
                  {fields.map((f) => {
                    const v = rep.values?.[f.id];
                    let display;
                    if (f.type === "bool") {
                      display = v ? (
                        <span style={{ color: "var(--green)", fontWeight: 600 }}>✓ Да</span>
                      ) : (
                        <span style={{ color: "var(--t3)" }}>✗ Нет</span>
                      );
                    } else if (v !== undefined && v !== "" && v !== null) {
                      display = (
                        <span
                          style={{
                            color: f.type === "number" ? "var(--t1)" : "var(--t2)",
                            fontFamily: f.type === "number" ? "'IBM Plex Mono',monospace" : "inherit",
                          }}
                        >
                          {v}
                        </span>
                      );
                    } else {
                      display = <span style={{ color: "var(--t3)" }}>—</span>;
                    }
                    return (
                      <td key={f.id} style={tdS}>
                        {display}
                      </td>
                    );
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

// ═══════════════════════════════════════════════════════════════
// FIELDS VIEW
// ═══════════════════════════════════════════════════════════════
function SortableField({ f, i, fields, onFieldsChange, typeColor, typeName }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: f.id });

  const style = {
    transform: DndCSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        background: "var(--bg2)",
        border: "1px solid var(--bd)",
        borderRadius: 11,
      }}
    >
      <div
        {...attributes}
        {...listeners}
        style={{
          cursor: "grab",
          color: "var(--t3)",
          fontSize: 16,
          padding: "0 4px",
          userSelect: "none",
        }}
        title="Перетащить"
      >
        ⠿
      </div>
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          background: (typeColor[f.type] || "var(--t3)") + "20",
          border: `1px solid ${(typeColor[f.type] || "var(--t3)") + "44"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          color: typeColor[f.type] || "var(--t3)",
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {i + 1}
      </div>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)" }}>{f.label}</span>
        {f.system && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 10,
              color: "var(--t3)",
              background: "var(--bg3)",
              padding: "1px 8px",
              borderRadius: 10,
            }}
          >
            системное
          </span>
        )}
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: typeColor[f.type] || "var(--t3)",
          background: (typeColor[f.type] || "var(--t3)") + "18",
          border: `1px solid ${(typeColor[f.type] || "var(--t3)") + "44"}`,
          padding: "2px 10px",
          borderRadius: 20,
        }}
      >
        {typeName[f.type] || f.type}
      </span>
      {f.system ? (
        <div style={{ width: 28 }} />
      ) : (
        <button
          onClick={() => onFieldsChange(fields.filter((x) => x.id !== f.id))}
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            border: "1px solid var(--bd2)",
            background: "transparent",
            color: "var(--t3)",
            fontSize: 13,
          }}
          title="Удалить"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function FieldsView({ fields, onFieldsChange }) {
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("number");

  const sensors = useSensors(useSensor(PointerSensor));

  const addField = () => {
    if (!newLabel.trim()) return;
    onFieldsChange([
      ...fields,
      { id: uid(), label: newLabel.trim(), type: newType, system: false },
    ]);
    setNewLabel("");
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      onFieldsChange(arrayMove(fields, oldIndex, newIndex));
    }
  };

  const typeColor = { number: "var(--blue)", text: "var(--purple)", bool: "var(--green)" };
  const typeName = { number: "Число", text: "Текст", bool: "Да/Нет" };

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "24px 28px", maxWidth: 680 }}>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Rajdhani',sans-serif", marginBottom: 4 }}>
        Управление полями
      </div>
      <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 24 }}>
        Поля отображаются для каждой фракции.{" "}
        <span style={{ color: "var(--blue)" }}>Числовые поля</span> строятся на графиках.
      </div>

      <div
        style={{
          background: "var(--bg2)",
          border: "1px solid var(--bd)",
          borderRadius: 13,
          padding: 20,
          marginBottom: 22,
        }}
      >
        <SectionLabel>+ Добавить новое поле</SectionLabel>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 5 }}>Название поля</div>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder='Например: "Нарушения"'
              onKeyDown={(e) => e.key === "Enter" && addField()}
            />
          </div>
          <div style={{ width: 150 }}>
            <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 5 }}>Тип данных</div>
            <select value={newType} onChange={(e) => setNewType(e.target.value)}>
              <option value="number">Число (для графиков)</option>
              <option value="text">Текст</option>
              <option value="bool">Да / Нет</option>
            </select>
          </div>
          <button
            onClick={addField}
            disabled={!newLabel.trim()}
            style={{
              padding: "9px 22px",
              borderRadius: 9,
              border: "1px solid var(--blue)",
              background: newLabel.trim() ? "rgba(96,165,250,.15)" : "rgba(96,165,250,.04)",
              color: newLabel.trim() ? "var(--blue)" : "var(--t3)",
              fontWeight: 700,
              fontSize: 13,
              transition: "all .15s",
              flexShrink: 0,
            }}
          >
            + Добавить
          </button>
        </div>
      </div>

      <SectionLabel>Все поля ({fields.length})</SectionLabel>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {fields.map((f, i) => (
              <SortableField
                key={f.id}
                f={f}
                i={i}
                fields={fields}
                onFieldsChange={onFieldsChange}
                typeColor={typeColor}
                typeName={typeName}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WEEK VIEW
// ═══════════════════════════════════════════════════════════════
function WeekView({
  weeks,
  selectedDayId,
  setSelectedDayId,
  setView,
  activeFaction,
  setActiveFaction,
  expandedWeeks,
  setExpandedWeeks,
  selectedDay,
  fields,
}) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentWeekRef = useRef(null);

  const currentWeek = weeks.find((w) => w.days.some((d) => d.date === todayStr));

  const toggleWeek = (weekId) => {
    setExpandedWeeks((prev) => ({ ...prev, [weekId]: !prev[weekId] }));
  };

  const selectDay = (day) => {
    setSelectedDayId(day.id);
    setView("form");
  };

  const scrollToCurrent = () => {
    if (currentWeek) {
      setExpandedWeeks((prev) => ({ ...prev, [currentWeek.id]: true }));
      setTimeout(() => {
        currentWeekRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 10px" }}>
      {weeks.map((week) => {
        const isExpanded = expandedWeeks[week.id] ?? false;
        const isCurrent = currentWeek?.id === week.id;
        const hasDataInWeek = week.days.some((day) =>
          Object.values(day.reports || {}).some(
            (rep) =>
              rep.rating > 0 ||
              Object.values(rep.values || {}).some((v) => v !== "" && v !== false && v !== null)
          )
        );

        return (
          <div key={week.id} data-weekid={week.id} style={{ marginBottom: 8 }} ref={isCurrent ? currentWeekRef : null}>
            <div
              onClick={() => toggleWeek(week.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 10,
                cursor: "pointer",
                background: isCurrent ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.025)",
                border: `1px solid ${isCurrent ? "rgba(245,158,11,0.4)" : "var(--bd)"}`,
                transition: "all .15s",
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: isExpanded ? (isCurrent ? "var(--amber)" : "var(--blue)") : "var(--t3)",
                  transition: "transform .2s",
                  transform: isExpanded ? "rotate(90deg)" : "none",
                }}
              >
                ▶
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: isCurrent ? "var(--amber)" : (isExpanded ? "var(--blue)" : "var(--t1)") }}>
                  {isCurrent && <span style={{ fontSize: 9, marginRight: 5 }}>●</span>}
                  Неделя {week.weekNumber} — {week.startLabel}
                </div>
                <div style={{ fontSize: 10, color: "var(--t3)" }}>{week.days.length} дней</div>
              </div>
              {hasDataInWeek && <span style={{ color: "var(--green)", fontSize: 11 }}>●</span>}
            </div>

            {isExpanded && (
              <div style={{ paddingLeft: 18, paddingTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                {week.days.map((day) => {
                  const isSelected = day.id === selectedDayId;
                  const isToday = day.date === todayStr;
                  const hasData = Object.values(day.reports || {}).some(
                    (rep) => rep.rating > 0 || Object.values(rep.values || {}).some((v) => !!v)
                  );

                  return (
                    <div
                      key={day.id}
                      onClick={() => selectDay(day)}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 8,
                        cursor: "pointer",
                        background: isSelected ? "rgba(96,165,250,.12)" : isToday ? "rgba(245,158,11,0.06)" : "transparent",
                        border: `1px solid ${isSelected ? "var(--blue)" : isToday ? "rgba(245,158,11,0.3)" : "transparent"}`,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          background: hasData ? "#34d399" : "var(--t3)",
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          fontSize: 12.5,
                          color: isSelected ? "var(--blue)" : isToday ? "var(--amber)" : "var(--t2)",
                          fontFamily: "'IBM Plex Mono',monospace",
                        }}
                      >
                        {day.label}
                        {isToday && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--amber)" }}>сегодня</span>}
                      </span>
                      {isSelected && <span style={{ color: "var(--blue)", fontSize: 11 }}>выбрано</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [weeks, setWeeks] = useState([]);
  const [fields, setFields] = useState(INIT_FIELDS);
  const [selectedDayId, setSelectedDayId] = useState(null);
  const [activeFaction, setActiveFaction] = useState("gcl");
  const [view, setView] = useState("form");
  const [expandedDepts, setExpandedDepts] = useState({
    central: true,
    mo: false,
    myu: false,
    mz: false,
  });
  const [expandedWeeks, setExpandedWeeks] = useState({});
  const [editingDayId, setEditingDayId] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");

  // ── Load from Supabase
  useEffect(() => {
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
          setWeeks(payload.weeks);
          if (payload.weeks[0]?.days?.length) {
            setSelectedDayId(payload.weeks[0].days[0].id);
          }
        }

        if (payload?.fields?.length) {
          setFields(payload.fields);
        }
      } catch (err) {
        console.error("Ошибка загрузки из Supabase:", err);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // ── Init weeks if empty
  useEffect(() => {
    if (loaded && weeks.length === 0) {
      const initialWeeks = generateWeeks();
      setWeeks(initialWeeks);
      if (initialWeeks[0]?.days?.length) {
        setSelectedDayId(initialWeeks[0].days[0].id);
      }
    }
  }, [loaded, weeks.length]);

  // Flatten all days for compatibility with old views
  const allDays = useMemo(() => weeks.flatMap((w) => w.days), [weeks]);

  const selectedDay = allDays.find((d) => d.id === selectedDayId);

  // ── Save to Supabase
  const save = async () => {
    setSaveStatus("saving");
    try {
      const payload = { weeks, fields };

      const { error } = await supabase
        .from(SUPABASE_TABLE)
        .upsert(
          {
            id: STORAGE_KEY,
            data: payload,
          },
          { onConflict: "id" }
        );

      if (error) throw error;

      setSaveStatus("saved");
    } catch (err) {
      console.error("Ошибка сохранения в Supabase:", err);
      setSaveStatus("error");
    }

    setTimeout(() => setSaveStatus("idle"), 2200);
  };

  // ── Mutations
  const updateReport = (factionKey, fieldId, value) => {
    setWeeks((p) =>
      p.map((week) => ({
        ...week,
        days: week.days.map((day) => {
          if (day.id !== selectedDayId) return day;
          const rep = day.reports[factionKey] || emptyReport();

          if (fieldId === "__rating__") {
            return {
              ...day,
              reports: {
                ...day.reports,
                [factionKey]: { ...rep, rating: value },
              },
            };
          }

          return {
            ...day,
            reports: {
              ...day.reports,
              [factionKey]: {
                ...rep,
                values: { ...rep.values, [fieldId]: value },
              },
            },
          };
        }),
      }))
    );
  };

  const selectFaction = (fk) => {
    setActiveFaction(fk);
    setView("form");
    setExpandedDepts((p) => ({ ...p, [FACTIONS[fk].dept]: true }));
  };

  const toggleDept = (dk) => setExpandedDepts((p) => ({ ...p, [dk]: !p[dk] }));

  const saveBtnColor =
    saveStatus === "saved"
      ? "var(--green)"
      : saveStatus === "error"
      ? "var(--red)"
      : "var(--amber)";
  const saveBtnLabel =
    saveStatus === "saving"
      ? "⏳ Сохранение..."
      : saveStatus === "saved"
      ? "✓ Сохранено"
      : saveStatus === "error"
      ? "✕ Ошибка"
      : "💾 Сохранить";

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--bg0)",
      }}
    >
      <style>{CSS}</style>

      {/* TOP BAR */}
      <div
        style={{
          height: 54,
          borderBottom: "1px solid var(--bd)",
          background: "var(--bg1)",
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          gap: 14,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginRight: 4 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg,#1e3a8a,#1e40af)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 800,
              fontFamily: "'Rajdhani',sans-serif",
              color: "#93c5fd",
              border: "1px solid #1d4ed8",
            }}
          >
            ФТ
          </div>
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "'Rajdhani',sans-serif",
                letterSpacing: 0.5,
              }}
            >
              Трекер Фракций
            </div>
            <div style={{ fontSize: 9, color: "var(--t3)", letterSpacing: 0.5 }}>
              КОМАНДНЫЙ ЦЕНТР
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 3 }}>
          {[
            ["form", "📋 Данные"],
            ["analytics", "📊 Графики"],
            ["tables", "📑 Таблицы"],
            ["fields", "⚙️ Поля"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "6px 13px",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 500,
                border: `1px solid ${view === v ? "var(--blue)" : "var(--bd)"}`,
                background: view === v ? "rgba(96,165,250,.12)" : "transparent",
                color: view === v ? "var(--blue)" : "var(--t2)",
              }}
            >
              {l}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {allDays.length > 0 && (
          <select
            value={selectedDayId || ""}
            onChange={(e) => {
              setSelectedDayId(e.target.value);
              if (view !== "analytics" && view !== "tables" && view !== "fields") {
                setView("form");
              }
            }}
            style={{ width: 170, fontSize: 12, padding: "5px 10px" }}
          >
            {allDays
              .slice()
              .reverse()
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
          </select>
        )}

        <button
          onClick={save}
          style={{
            padding: "7px 18px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            border: `1px solid ${saveBtnColor}`,
            background: saveBtnColor + "18",
            color: saveBtnColor,
            transition: "all .3s",
            minWidth: 110,
          }}
        >
          {saveBtnLabel}
        </button>
      </div>

      {/* BODY */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* LEFT SIDEBAR */}
        <div
          style={{
            width: 216,
            borderRight: "1px solid var(--bd)",
            background: "var(--bg1)",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          <div style={{ padding: "12px 10px 10px", borderBottom: "1px solid var(--bd)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
  <span
    style={{
      fontSize: 9,
      fontWeight: 700,
      color: "var(--t3)",
      letterSpacing: 1,
      textTransform: "uppercase",
    }}
  >
    Недели ({weeks.length})
  </span>
  <button
    onClick={() => {
      const todayStr = new Date().toLocaleDateString("sv-SE");
      const cw = weeks.find((w) => w.days.some((d) => d.date === todayStr));
      if (cw) {
        setExpandedWeeks((prev) => ({ ...prev, [cw.id]: true }));
        setTimeout(() => {
          document.querySelector(`[data-weekid="${cw.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
      }
    }}
    style={{
      fontSize: 10,
      padding: "3px 8px",
      borderRadius: 6,
      border: "1px solid rgba(245,158,11,0.4)",
      background: "rgba(245,158,11,0.08)",
      color: "var(--amber)",
      fontWeight: 600,
      cursor: "pointer",
    }}
  >
    сегодня
  </button>
</div>
            </div>
          </div>

          <WeekView
            weeks={weeks}
            selectedDayId={selectedDayId}
            setSelectedDayId={setSelectedDayId}
            setView={setView}
            activeFaction={activeFaction}
            setActiveFaction={setActiveFaction}
            expandedWeeks={expandedWeeks}
            setExpandedWeeks={setExpandedWeeks}
            selectedDay={selectedDay}
            fields={fields}
          />

          <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px", borderTop: "1px solid var(--bd)" }}>
            {Object.entries(DEPTS).map(([dk, dv]) => (
              <div key={dk} style={{ marginBottom: 5 }}>
                <div
                  onClick={() => toggleDept(dk)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid var(--bd)",
                    marginBottom: 3,
                  }}
                >
                  <span
                    style={{
                      fontSize: 7,
                      color: dv.color,
                      transition: "transform .15s",
                      transform: expandedDepts[dk] ? "rotate(90deg)" : "none",
                      display: "block",
                    }}
                  >
                    ▶
                  </span>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: dv.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: dv.color }}>{dv.short}</div>
                    <div
                      style={{
                        fontSize: 9,
                        color: "var(--t3)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        lineHeight: 1.2,
                      }}
                    >
                      {dv.name}
                    </div>
                  </div>
                </div>
                {expandedDepts[dk] && (
                  <div style={{ paddingLeft: 10, display: "flex", flexDirection: "column", gap: 2, marginBottom: 4 }}>
                    {(DEPT_FACTIONS[dk] || []).map((fk) => {
                      const fac = FACTIONS[fk];
                      const isAct = activeFaction === fk && view === "form";
                      const rep = selectedDay?.reports[fk];
                      const hasDots =
                        rep &&
                        Object.values(rep.values || {}).some(
                          (v) => v !== "" && v !== false && v !== null && v !== undefined
                        );
                      return (
                        <div
                          key={fk}
                          onClick={() => selectFaction(fk)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "7px 10px",
                            borderRadius: 8,
                            cursor: "pointer",
                            transition: "all .13s",
                            background: isAct ? fac.color + "18" : "transparent",
                            border: `1px solid ${isAct ? fac.color + "44" : "transparent"}`,
                          }}
                        >
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: 2,
                              background: hasDots ? fac.color : "var(--t3)",
                              flexShrink: 0,
                              opacity: hasDots ? 1 : 0.4,
                            }}
                          />
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: isAct ? 700 : 400,
                              color: isAct ? fac.color : "var(--t2)",
                              flex: 1,
                            }}
                          >
                            {fac.name}
                          </span>
                          {rep?.rating > 0 && (
                            <span
                              style={{
                                fontSize: 10,
                                color: RATING_COLORS[rep.rating - 1],
                                letterSpacing: -0.5,
                                marginLeft: "auto",
                              }}
                            >
                              {"★".repeat(rep.rating)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {view === "form" && (
            <>
              <OverviewPanel
                day={selectedDay}
                fields={fields}
                onSelectFaction={selectFaction}
                activeFaction={activeFaction}
              />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <FormView day={selectedDay} factionKey={activeFaction} fields={fields} onUpdate={updateReport} />
              </div>
            </>
          )}
          {view === "analytics" && <AnalyticsView days={allDays} fields={fields} />}
          {view === "tables" && <TablesView days={allDays} fields={fields} />}
          {view === "fields" && <FieldsView fields={fields} onFieldsChange={setFields} />}
        </div>
      </div>
    </div>
  );
}

// OverviewPanel
function OverviewPanel({ day, fields, onSelectFaction, activeFaction }) {
  if (!day) return null;
  const numFields = fields.filter((f) => f.type === "number").slice(0, 3);

  return (
    <div
      style={{
        borderBottom: "1px solid var(--bd)",
        padding: "12px 24px",
        background: "rgba(255,255,255,0.015)",
        display: "flex",
        gap: 14,
        overflowX: "auto",
        flexShrink: 0,
      }}
    >
      {Object.entries(DEPTS).map(([dk, dv]) => (
        <div
          key={dk}
          style={{
            flexShrink: 0,
            background: "var(--bg2)",
            border: "1px solid var(--bd)",
            borderRadius: 11,
            padding: "10px 14px",
            minWidth: 180,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: dv.color,
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            {dv.icon} {dv.short} — {dv.name}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {(DEPT_FACTIONS[dk] || []).map((fk) => {
              const fac = FACTIONS[fk];
              const rep = day.reports[fk] || emptyReport();
              const isAct = activeFaction === fk;
              return (
                <div
                  key={fk}
                  onClick={() => onSelectFaction(fk)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 8px",
                    borderRadius: 7,
                    cursor: "pointer",
                    background: isAct ? fac.color + "20" : "transparent",
                    border: `1px solid ${isAct ? fac.color + "44" : "transparent"}`,
                    transition: "all .15s",
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: fac.color, flexShrink: 0 }} />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: isAct ? 700 : 400,
                      color: isAct ? fac.color : "var(--t2)",
                      flex: 1,
                    }}
                  >
                    {fac.name}
                  </span>
                  {rep.rating > 0 && (
                    <span style={{ fontSize: 11, color: RATING_COLORS[rep.rating - 1], letterSpacing: 0 }}>
                      {"★".repeat(rep.rating)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}