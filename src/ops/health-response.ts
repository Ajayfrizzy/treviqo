// Reject a proxy/login/catch-all 200 response masquerading as a healthy application.
export async function verifyHealthResponse(response: Response, expected: "ok" | "ready") {
  if (response.status !== 200 || !response.headers.get("cache-control")?.includes("no-store")) throw new Error("Invalid health response");
  const body = await response.json();
  if (body?.status !== expected || (expected === "ok" && body?.service !== "treviqo")) throw new Error("Invalid health response");
}
