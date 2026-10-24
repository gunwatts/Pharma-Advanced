import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { Widget, WidgetResult } from "../api/types";
import { ChipsInput } from "../components/ui";
import { WidgetView } from "../components/WidgetView";
import { fmtDate, stateTone, validateEmailList } from "../lib/format";

function Chips() {
  const [v, setV] = useState<string[]>([]);
  return <><ChipsInput value={v} onChange={setV} email placeholder="emails" /><output data-testid="out">{v.join("|")}</output></>;
}

const baseWidget: Widget = { id: 7, dashboard: 1, title: "W", widget_type: "kpi", category: null, filters: [], group_by: "status", date_field: "target_date",
  date_bucket: "month", window_days: 7, columns: [], sort_by: "", sort_desc: false, limit: 10, width: 1, position: 0 };

describe("format helpers", () => {
  it("validates email lists", () => {
    expect(validateEmailList(["a@x.com", "b@x.com"])).toBeNull();
    expect(validateEmailList(["nope"])).toMatch(/Invalid/);
    expect(validateEmailList(["a@x.com", "A@x.com"])).toMatch(/Duplicate/);
  });
  it("maps states to tones", () => {
    expect(stateTone("sent")).toBe("good");
    expect(stateTone("uncertain")).toBe("serious");
    expect(stateTone("failed")).toBe("critical");
  });
  it("formats dates and tolerates empty values", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("2026-10-24")).toMatch(/2026/);
  });
});

describe("ChipsInput", () => {
  it("adds valid emails and rejects invalid or duplicate ones", async () => {
    render(<Chips />);
    const input = screen.getByPlaceholderText("emails");
    await userEvent.type(input, "qa@example.com{enter}bad-address{enter}QA@example.com{enter}");
    expect(screen.getByTestId("out").textContent).toBe("qa@example.com");
    expect(screen.getByText(/already in the list/)).toBeInTheDocument();
  });
});

describe("WidgetView", () => {
  it("renders a KPI tile that drills into records", () => {
    const result: WidgetResult = { id: 7, ok: true, data: { value: 42 } };
    render(<MemoryRouter><WidgetView widget={baseWidget} result={result} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: /42/ })).toBeInTheDocument();
  });

  it("folds donut segments beyond six into Other and shows a legend", () => {
    const series = Array.from({ length: 9 }, (_, i) => ({ key: `S${i}`, label: `S${i}`, count: 10 - i }));
    render(<MemoryRouter><WidgetView widget={{ ...baseWidget, widget_type: "donut" }} result={{ id: 7, ok: true, data: { series, total: 54 } }} /></MemoryRouter>);
    const legend = screen.getByRole("list", { name: "Legend" });
    expect(legend.querySelectorAll("li")).toHaveLength(6);
    expect(screen.getByText("Other (4)")).toBeInTheDocument();
  });

  it("offers a table view for charts", async () => {
    const series = [{ key: "Open", label: "Open", count: 3 }];
    render(<MemoryRouter><WidgetView widget={{ ...baseWidget, widget_type: "bar" }} result={{ id: 7, ok: true, data: { series, total: 3 } }} /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: "Show table" }));
    expect(screen.getByRole("cell", { name: "Open" })).toBeInTheDocument();
  });

  it("shows widget errors", () => {
    render(<MemoryRouter><WidgetView widget={baseWidget} result={{ id: 7, ok: false, error: "Choose a date field." }} /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a date field.");
  });
});
