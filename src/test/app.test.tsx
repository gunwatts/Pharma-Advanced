import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../App";
import type { Me } from "../api/types";
import { setToken } from "../api/client";
import { AuthProvider } from "../auth/AuthContext";
import { FeedbackProvider } from "../components/feedback";

const viewer: Me = { id: 2, username: "viewer1", name: "Viewer One", email: "", role: "Department Viewer", permissions: ["records.view", "dashboards.view"],
  all_data_scope: false, scopes: [], default_dashboard_id: null };

function respond(routes: Record<string, unknown>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url, "http://x").pathname.replace(/^\/api/, "");
    if (path === "/auth/login/" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      return body.password === "good"
        ? new Response(JSON.stringify({ token: "t", expires_at: "", user: viewer }), { status: 200 })
        : new Response(JSON.stringify({ detail: "Invalid username or password." }), { status: 401 });
    }
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    return key ? new Response(JSON.stringify(routes[key]), { status: 200 }) : new Response(JSON.stringify({ detail: "Not found." }), { status: 404 });
  });
}

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider><FeedbackProvider><AppRoutes /></FeedbackProvider></AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("authentication flow", () => {
  it("redirects unauthenticated users to sign in", async () => {
    vi.stubGlobal("fetch", respond({}));
    renderApp("/records");
    expect(await screen.findByRole("heading", { name: "QA Reminder System" })).toBeInTheDocument();
  });

  it("shows a generic error on bad credentials", async () => {
    vi.stubGlobal("fetch", respond({}));
    renderApp("/login");
    await userEvent.type(screen.getByLabelText("Username"), "viewer1");
    await userEvent.type(screen.getByLabelText("Password"), "bad");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Invalid username or password.")).toBeInTheDocument();
  });

  it("signs in and lands on the home page", async () => {
    vi.stubGlobal("fetch", respond({ "/dashboards/": { count: 0, next: null, previous: null, results: [] } }));
    renderApp("/login");
    await userEvent.type(screen.getByLabelText("Username"), "viewer1");
    await userEvent.type(screen.getByLabelText("Password"), "good");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/No dashboard has been assigned/)).toBeInTheDocument();
  });
});

describe("permission guards", () => {
  it("shows access denied for admin pages without permission and hides admin navigation", async () => {
    setToken("t");
    vi.stubGlobal("fetch", respond({ "/auth/me/": viewer, "/dashboards/": { count: 0, next: null, previous: null, results: [] } }));
    renderApp("/admin/quick-start");
    expect(await screen.findByText("Access denied")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("link", { name: "Quick Start" })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Records" })).toBeInTheDocument();
  });
});
