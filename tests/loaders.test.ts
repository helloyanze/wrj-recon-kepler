import {afterEach, describe, expect, it, vi} from "vitest";
import {loadJson} from "../src/data/loadJson";
import {loadText} from "../src/data/loadText";

describe("HTTP loaders", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads UTF-8 text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("航迹数据")));
    await expect(loadText("/data/trips.csv")).resolves.toBe("航迹数据");
  });

  it("loads typed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({caseId: "riyue-3d"}), {
          headers: {"Content-Type": "application/json"}
        })
      )
    );
    await expect(loadJson<{caseId: string}>("/data/case.json")).resolves.toEqual({
      caseId: "riyue-3d"
    });
  });

  it("includes URL and status in an HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("missing", {status: 404, statusText: "Not Found"}))
    );
    await expect(loadText("/missing.csv")).rejects.toThrow(
      "加载 /missing.csv 失败：404 Not Found"
    );
  });

  it("reports invalid JSON with its source URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{")));
    await expect(loadJson("/broken.json")).rejects.toThrow(
      "解析 /broken.json 的 JSON 失败"
    );
  });

  it("passes AbortSignal to fetch", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);
    controller.abort();

    await expect(loadText("/slow.csv", controller.signal)).rejects.toMatchObject({
      name: "AbortError"
    });
    expect(fetchMock).toHaveBeenCalledWith("/slow.csv", {signal: controller.signal});
  });
});
