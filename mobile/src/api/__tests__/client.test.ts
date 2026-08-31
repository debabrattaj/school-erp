import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ApiError,
  DEFAULT_API_BASE_URL,
  api,
  fetchRecord,
  normaliseBaseUrl,
  onUnauthorized,
  setApiBase,
} from "../client";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body === undefined ? "" : JSON.stringify(body)),
  } as unknown as Response;
}

function rawResponse(status: number, text: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

const fetchMock = jest.fn();

beforeEach(async () => {
  fetchMock.mockReset();
  (global as any).fetch = fetchMock;
  (AsyncStorage as any).__reset?.();
  await setApiBase(DEFAULT_API_BASE_URL);
});

describe("normaliseBaseUrl", () => {
  it("strips trailing slashes so paths do not double up", () => {
    // "https://host/api/" + "/auth/login" produced "https://host/api//auth/login".
    expect(normaliseBaseUrl("https://host/api/")).toBe("https://host/api");
    expect(normaliseBaseUrl("  https://host/api///  ")).toBe("https://host/api");
  });
});

describe("apiRequest error handling", () => {
  it("does not throw a raw SyntaxError on a non-JSON body", async () => {
    // A proxy's HTML gateway page used to blow past every screen's
    // `instanceof ApiError` check as "Unexpected token <".
    fetchMock.mockResolvedValue(rawResponse(502, "<html><body>Bad Gateway</body></html>"));
    await expect(api.get("/students/")).rejects.toBeInstanceOf(ApiError);
    await expect(api.get("/students/")).rejects.toMatchObject({ status: 502 });
  });

  it("flattens a FastAPI validation list into readable text", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, { detail: [{ loc: ["body", "admission_no"], msg: "field required" }] })
    );
    await expect(api.post("/students/", {})).rejects.toMatchObject({
      message: "admission_no: field required",
    });
  });

  it("reports an unreachable server as an ApiError, not a raw TypeError", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    const err: unknown = await api.get("/students/").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect(String((err as ApiError).message)).toMatch(/Could not reach the server/);
  });

  it("notifies listeners once the token is rejected", async () => {
    const onExpired = jest.fn();
    const stop = onUnauthorized(onExpired);
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: "Not authenticated" }));
    await expect(api.get("/students/")).rejects.toBeInstanceOf(ApiError);
    expect(onExpired).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not tear down the session for a failed login", async () => {
    const onExpired = jest.fn();
    const stop = onUnauthorized(onExpired);
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: "MFA_REQUIRED" }));
    await expect(
      api.post("/auth/login", { email: "a" }, { skipAuth: true })
    ).rejects.toMatchObject({ detail: "MFA_REQUIRED" });
    expect(onExpired).not.toHaveBeenCalled();
    stop();
  });

  it("omits empty query parameters", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    await api.get("/marks/", { exam_id: 1, subject: "", missing: undefined });
    expect(fetchMock.mock.calls[0][0]).toBe(`${DEFAULT_API_BASE_URL}/marks/?exam_id=1`);
  });
});

describe("fetchRecord", () => {
  it("uses the detail route when the backend has one", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 7, name: "Asha" }));
    await expect(fetchRecord("/students", 7)).resolves.toMatchObject({ id: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the list when the detail route answers 405", async () => {
    // 32 of this backend's 46 CRUD modules expose only GET /thing/, so asking
    // for /thing/{id} answers 405 Method Not Allowed.
    fetchMock
      .mockResolvedValueOnce(jsonResponse(405, { detail: "Method Not Allowed" }))
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 1 }, { id: 2, title: "wanted" }]));
    await expect(fetchRecord("/homework", 2)).resolves.toMatchObject({ id: 2, title: "wanted" });
    expect(fetchMock.mock.calls[1][0]).toBe(`${DEFAULT_API_BASE_URL}/homework/`);
  });

  it("falls back on 404 too", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(404, { detail: "Not Found" }))
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 3 }]));
    await expect(fetchRecord("/timetable", 3)).resolves.toMatchObject({ id: 3 });
  });

  it("skips the detail request entirely when the module declares it has none", async () => {
    // /master-data/{id} is the by-category route and answers 400, which no
    // 404/405 fallback would catch.
    fetchMock.mockResolvedValue(jsonResponse(200, [{ id: 5, value: "Ruby" }]));
    await expect(fetchRecord("/master-data", 5, false)).resolves.toMatchObject({ value: "Ruby" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${DEFAULT_API_BASE_URL}/master-data/`);
  });

  it("does not mask a real failure as a missing route", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { detail: "This module is not enabled for your school." }));
    await expect(fetchRecord("/hostel/blocks", 1)).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a genuinely missing record", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(405, {}))
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 1 }]));
    await expect(fetchRecord("/homework", 999)).rejects.toMatchObject({ status: 404 });
  });
});
