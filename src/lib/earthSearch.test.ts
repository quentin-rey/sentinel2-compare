import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSceneData } from "./earthSearch";

function feature(id: string, date: string, tile = "31UDQ") {
  return {
    id,
    bbox: [2, 48, 3, 49],
    properties: { datetime: `${date}T10:00:00Z`, "eo:cloud_cover": 5, "grid:code": `MGRS-${tile}`, "proj:epsg": 32631 },
    assets: { red: { href: `https://x/${id}/B04.tif` } },
  };
}

function page(features: unknown[], next?: string) {
  return { ok: true, json: async () => ({ features, links: next ? [{ rel: "next", href: next }] : [] }) };
}

afterEach(() => vi.unstubAllGlobals());

describe("loadSceneData pagination", () => {
  it("follows next links so the oldest days of the window are not dropped", async () => {
    // Page 1: a full page (100 items) of recent days; page 2: the older day.
    const recent = Array.from({ length: 100 }, (_, i) => feature(`r${i}`, "2026-08-20", `T${i}`));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page(recent, "https://earth-search.example/page2"))
      .mockResolvedValueOnce(page([feature("old", "2026-08-10")]));
    vi.stubGlobal("fetch", fetchMock);

    const { info, dates } = await loadSceneData([2.2, 48.8, 2.5, 48.9], "2026-08-10");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://earth-search.example/page2");
    expect(dates.map((d) => d.date)).toEqual(["2026-08-10", "2026-08-20"]);
    expect(info.bestDate).toBe("2026-08-10");
  });

  it("stops after a short page even if a next link is present", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(page([feature("a", "2026-08-10")], "https://earth-search.example/page2"));
    vi.stubGlobal("fetch", fetchMock);

    await loadSceneData([2.2, 48.8, 2.5, 48.9], "2026-08-10");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
