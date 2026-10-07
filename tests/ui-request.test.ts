import { afterEach, expect, it, vi } from "vitest";
import { uiRequest } from "@/components/ui-request";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("bounds a stalled response body and warns about uncertain saves without retrying", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(
    async (_input: string, init: RequestInit) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init.signal!.addEventListener("abort", () =>
              controller.error(new DOMException("Aborted", "AbortError")),
            );
          },
        }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const pending = expect(
    uiRequest("/api/employments", { method: "POST" }, 1000),
  ).rejects.toThrow("Check your records before retrying");
  await vi.advanceTimersByTimeAsync(1001);
  await pending;
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("preserves API error status and JSON for inline recovery", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "Check the date" }, { status: 400 }),
      ),
  );
  const response = await uiRequest("/api/employments");
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Check the date" });
});
