import { expect, it } from "vitest";
import { verifyHealthResponse } from "@/ops/health-response";
it("accepts only the expected uncached Treviqo health responses", async () => {
  await expect(
    verifyHealthResponse(
      Response.json(
        { status: "ok", service: "treviqo" },
        { headers: { "cache-control": "no-store" } },
      ),
      "ok",
    ),
  ).resolves.toBeUndefined();
  await expect(
    verifyHealthResponse(
      Response.json(
        { status: "ready" },
        { headers: { "cache-control": "no-store" } },
      ),
      "ready",
    ),
  ).resolves.toBeUndefined();
});
it("rejects proxy/login 200 pages, unavailable responses, wrong services and cached health", async () => {
  for (const response of [
    new Response("<html>Sign in</html>", {
      headers: { "cache-control": "no-store" },
    }),
    Response.json({ status: "ready" }, { status: 503 }),
    Response.json({ status: "ready" }),
    Response.json(
      { status: "ok", service: "other" },
      { headers: { "cache-control": "no-store" } },
    ),
  ])
    await expect(verifyHealthResponse(response, "ok")).rejects.toThrow();
});
