import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, buildUrl, getToken, setToken } from "../api/client";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("builds URLs and drops empty query values", () => {
    expect(buildUrl("/records/", { a: 1, b: "", c: null, d: "x y" })).toMatch(/\/records\/\?a=1&d=x\+y$/);
  });

  it("sends the bearer token and parses JSON", async () => {
    setToken("abc");
    const fetchMock = mockFetch(200, { ok: true });
    await expect(api("/auth/me/")).resolves.toEqual({ ok: true });
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer abc");
  });

  it("exposes field errors from validation responses", async () => {
    mockFetch(400, { to_emails: ["Invalid email address: x"], detail: undefined });
    const err = (await api("/recipient-groups/", { method: "POST", body: {} }).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.fieldErrors.to_emails).toEqual(["Invalid email address: x"]);
  });

  it("recognises destructive-change confirmation requests", async () => {
    mockFetch(409, { detail: "Deleting affects config", code: "confirmation_required", impacts: ["Rule A"] });
    const err = (await api("/fields/1/", { method: "DELETE" }).catch((e) => e)) as ApiError;
    expect(err.needsConfirmation).toBe(true);
    expect(err.impacts).toEqual(["Rule A"]);
  });

  it("clears the session and notifies on 401", async () => {
    setToken("expired");
    const listener = vi.fn();
    window.addEventListener("qa:session-expired", listener);
    mockFetch(401, { detail: "Invalid or expired session." });
    await expect(api("/records/")).rejects.toBeInstanceOf(ApiError);
    expect(getToken()).toBeNull();
    expect(listener).toHaveBeenCalled();
  });

  it("reports network failures with a friendly message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = (await api("/health/").catch((e) => e)) as ApiError;
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/Cannot reach the server/);
  });

  it("includes the error reference for server errors without leaking details", async () => {
    mockFetch(500, { detail: "An internal error occurred.", error_id: "abc123" });
    const err = (await api("/x/").catch((e) => e)) as ApiError;
    expect(err.message).toContain("abc123");
  });
});
