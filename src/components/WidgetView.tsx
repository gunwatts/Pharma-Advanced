import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint, TableRow, Widget, WidgetResult } from "../api/types";
import { Button, EmptyState, ErrorState } from "./ui";
import { fmtDate } from "../lib/format";

const MAX_SLICES = 6; // part-to-whole charts fold the tail into "Other"
const OTHER = "Other";

interface ChartTokens {
  series: string[];
  grid: string;
  axis: string;
  muted: string;
  surface: string;
  text: string;
}

function readTokens(): ChartTokens {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    series: Array.from({ length: 8 }, (_, i) => v(`--series-${i + 1}`) || "#2a78d6"),
    grid: v("--chart-grid") || "#e1e0d9",
    axis: v("--chart-axis") || "#c3c2b7",
    muted: v("--text-muted") || "#898781",
    surface: v("--surface-1") || "#fcfcfb",
    text: v("--text-primary") || "#0b0b0b",
  };
}

/** Chart colours come from CSS tokens so light/dark themes each use their validated steps. */
function useChartTokens(): ChartTokens {
  const [tokens, setTokens] = useState<ChartTokens>(readTokens);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const update = () => setTokens(readTokens());
    mq?.addEventListener?.("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq?.removeEventListener?.("change", update);
      observer.disconnect();
    };
  }, []);
  return tokens;
}

function foldSlices(series: SeriesPoint[]): SeriesPoint[] {
  if (series.length <= MAX_SLICES) return series;
  const head = series.slice(0, MAX_SLICES - 1);
  const rest = series.slice(MAX_SLICES - 1).reduce((sum, s) => sum + s.count, 0);
  return [...head, { key: OTHER, label: `${OTHER} (${series.length - MAX_SLICES + 1})`, count: rest }];
}

function SeriesTable({ series, total }: { series: SeriesPoint[]; total?: number }) {
  return (
    <table className="table compact">
      <thead><tr><th>Group</th><th className="num">Count</th></tr></thead>
      <tbody>
        {series.map((s) => <tr key={s.key}><td>{s.label}</td><td className="num">{s.count}</td></tr>)}
        {total !== undefined && <tr><td><strong>Total</strong></td><td className="num"><strong>{total}</strong></td></tr>}
      </tbody>
    </table>
  );
}

function RowsTable({ rows, widget, dateColumn }: { rows: TableRow[]; widget: Widget; dateColumn?: boolean }) {
  const extra = (widget.columns ?? []).filter((c) => !["source_id", "title", "status", "category", "unit", "department"].includes(c));
  if (!rows.length) return <EmptyState title={widget.widget_type === "overdue" ? "Nothing overdue." : "No records."} />;
  return (
    <div className="table-wrap">
      <table className="table compact">
        <thead>
          <tr>
            <th>ID</th><th>Title</th><th>Category</th><th>Unit / Dept</th><th>Status</th>
            {dateColumn && <th>Target date</th>}
            {extra.map((c) => <th key={c}>{c.replace(/_/g, " ")}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td data-label="ID"><Link to={`/records/${r.id}`}>{r.source_id}</Link></td>
              <td data-label="Title">{r.title}</td>
              <td data-label="Category">{r.category}</td>
              <td data-label="Unit / Dept">{r.unit} / {r.department}</td>
              <td data-label="Status">{r.status}</td>
              {dateColumn && (
                <td data-label="Target date">
                  {fmtDate(r.target_date)}{" "}
                  <span className={`small ${r.days !== undefined && r.days < 0 ? "danger-text" : "muted"}`}>
                    {r.days === 0 ? "(today)" : r.days !== undefined ? (r.days < 0 ? `(${-r.days}d overdue)` : `(in ${r.days}d)`) : ""}
                  </span>
                </td>
              )}
              {extra.map((c) => <td key={c} data-label={c}>{String(r[c] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WidgetView({ widget, result }: { widget: Widget; result?: WidgetResult }) {
  const navigate = useNavigate();
  const tokens = useChartTokens();
  const [asTable, setAsTable] = useState(false);
  const drill = (group?: string) => navigate(`/records?widget=${widget.id}${group !== undefined ? `&group=${encodeURIComponent(group)}` : ""}&title=${encodeURIComponent(widget.title)}`);

  if (!result) return <div className="widget-body"><div className="skeleton" /></div>;
  if (!result.ok || !result.data) return <ErrorState message={result.error ?? "This widget could not be loaded."} />;
  const data = result.data;
  const isChart = ["pie", "donut", "bar", "line", "area"].includes(widget.widget_type);
  const series = data.series ?? [];
  const axisProps = { stroke: tokens.axis, tick: { fill: tokens.muted, fontSize: 12 }, tickLine: false };

  let body: JSX.Element;
  if (widget.widget_type === "kpi") {
    body = (
      <button type="button" className="kpi" onClick={() => drill()} aria-label={`${widget.title}: ${data.value}. View records`}>
        <span className="kpi-value">{data.value ?? 0}</span>
        <span className="kpi-hint">View records →</span>
      </button>
    );
  } else if (isChart && series.length === 0) {
    body = <EmptyState title="No records match this widget." />;
  } else if (isChart && asTable) {
    body = <SeriesTable series={series} total={data.total} />;
  } else if (widget.widget_type === "pie" || widget.widget_type === "donut") {
    // Colour follows the entity: slices are coloured in a stable (alphabetical) order, not by rank.
    const slices = foldSlices(series);
    const colorOrder = [...slices].map((s) => s.key).sort((a, b) => (a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b)));
    const colorOf = (key: string) => (key === OTHER ? tokens.muted : tokens.series[colorOrder.indexOf(key) % tokens.series.length]);
    body = (
      <div className="donut-wrap">
        <div className="donut-chart">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={slices} dataKey="count" nameKey="label" innerRadius={widget.widget_type === "donut" ? "58%" : 0} outerRadius="92%"
                stroke={tokens.surface} strokeWidth={2} isAnimationActive={false} onClick={(d: { payload?: SeriesPoint }) => d.payload && d.payload.key !== OTHER && drill(d.payload.key)}>
                {slices.map((s) => <Cell key={s.key} fill={colorOf(s.key)} cursor={s.key === OTHER ? "default" : "pointer"} />)}
              </Pie>
              <Tooltip formatter={(value: number, name: string) => [value, name]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="legend" aria-label="Legend">
          {slices.map((s) => (
            <li key={s.key}>
              <button type="button" className="legend-item" disabled={s.key === OTHER} onClick={() => drill(s.key)}>
                <span className="swatch" style={{ background: colorOf(s.key) }} aria-hidden />
                <span className="legend-label">{s.label}</span>
                <span className="legend-value">{s.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (widget.widget_type === "bar") {
    // One series -> one colour (slot 1) for every bar.
    body = (
      <ResponsiveContainer width="100%" height={Math.max(180, series.length * 34)}>
        <BarChart data={series} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={2}>
          <CartesianGrid horizontal={false} stroke={tokens.grid} />
          <XAxis type="number" allowDecimals={false} {...axisProps} />
          <YAxis type="category" dataKey="label" width={130} {...axisProps} />
          <Tooltip cursor={{ fill: tokens.grid, opacity: 0.4 }} />
          <Bar dataKey="count" name="Records" fill={tokens.series[0]} radius={[0, 4, 4, 0]} maxBarSize={22} cursor="pointer" isAnimationActive={false}
            label={{ position: "right", fill: tokens.muted, fontSize: 12 }} onClick={(d: { payload?: SeriesPoint }) => d.payload && drill(d.payload.key)} />
        </BarChart>
      </ResponsiveContainer>
    );
  } else if (widget.widget_type === "line" || widget.widget_type === "area") {
    const Chart = widget.widget_type === "line" ? LineChart : AreaChart;
    const click = (state: { activeLabel?: string | number } | null) => state?.activeLabel !== undefined && drill(String(state.activeLabel));
    body = (
      <ResponsiveContainer width="100%" height={220}>
        <Chart data={series} margin={{ left: 0, right: 16, top: 8, bottom: 4 }} onClick={click}>
          <CartesianGrid vertical={false} stroke={tokens.grid} />
          <XAxis dataKey="key" {...axisProps} />
          <YAxis allowDecimals={false} width={36} {...axisProps} />
          <Tooltip cursor={{ stroke: tokens.axis }} />
          {widget.widget_type === "line" ? (
            <Line type="monotone" dataKey="count" name="Records" stroke={tokens.series[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: tokens.surface }} activeDot={{ r: 5 }} isAnimationActive={false} />
          ) : (
            <Area type="monotone" dataKey="count" name="Records" stroke={tokens.series[0]} strokeWidth={2} fill={tokens.series[0]} fillOpacity={0.18} isAnimationActive={false} />
          )}
        </Chart>
      </ResponsiveContainer>
    );
  } else {
    body = <RowsTable rows={data.rows ?? []} widget={widget} dateColumn={widget.widget_type !== "table"} />;
  }

  return (
    <div className="widget-body">
      {body}
      <div className="widget-foot">
        {data.total !== undefined && <span className="muted small">{data.total} record(s)</span>}
        {isChart && series.length > 0 && <Button variant="ghost" onClick={() => setAsTable(!asTable)}>{asTable ? "Show chart" : "Show table"}</Button>}
        {(widget.widget_type === "upcoming" || widget.widget_type === "overdue" || widget.widget_type === "table") && (data.total ?? 0) > 0 && (
          <Button variant="ghost" onClick={() => drill()}>View all</Button>
        )}
      </div>
    </div>
  );
}
