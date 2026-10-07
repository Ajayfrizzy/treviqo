import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/modules/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/modules/employments/service", () => ({
  listEmployments: mocks.list,
  getEmployment: mocks.get,
  createEmployment: mocks.create,
  updateEmployment: mocks.update,
}));
vi.mock("@/server/rate-limit", () => ({
  limitWorkflow: vi.fn(),
  limitResponse: () => null,
}));
import { employmentRequest } from "@/modules/employments/http";
import { employmentSchema } from "@/modules/employments/validation";
const details = {
  employerName: "Example",
  roleTitle: "Engineer",
  startDate: "2024-01-01",
};
function request(
  method = "GET",
  body?: string,
  origin = "http://localhost:3000",
) {
  return new Request("http://localhost:3000/api/employments", {
    method,
    headers: { origin, "content-type": "application/json" },
    body,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
  mocks.user.mockResolvedValue({ id: "owner" });
});
it("rejects unauthenticated reads and writes before touching records", async () => {
  mocks.user.mockResolvedValue(null);
  for (const method of ["GET", "POST", "PUT"])
    expect((await employmentRequest(request(method))).status).toBe(401);
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("scopes list access to the session user and prevents caching", async () => {
  mocks.list.mockResolvedValue([]);
  const response = await employmentRequest(request());
  expect(mocks.list).toHaveBeenCalledWith("owner");
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("rejects cross-origin writes and oversized or malformed bodies", async () => {
  expect(
    (
      await employmentRequest(
        request("POST", JSON.stringify(details), "https://attacker.test"),
      )
    ).status,
  ).toBe(403);
  for (const body of ["{", "x".repeat(5000)])
    expect((await employmentRequest(request("POST", body))).status).toBe(400);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("uses identical missing/foreign record responses", async () => {
  mocks.get.mockResolvedValue(null);
  mocks.update.mockResolvedValue(null);
  expect((await employmentRequest(request(), "foreign")).status).toBe(404);
  expect(
    (
      await employmentRequest(
        request("PUT", JSON.stringify(details)),
        "foreign",
      )
    ).status,
  ).toBe(404);
  expect(mocks.update).toHaveBeenCalledWith("owner", "foreign", details);
});
it("returns field errors without leaking input or infrastructure failures", async () => {
  mocks.create.mockImplementation(() =>
    employmentSchema.parse({ ...details, employerName: "" }),
  );
  const response = await employmentRequest(
    request("POST", JSON.stringify(details)),
  );
  expect(response.status).toBe(422);
  expect((await response.json()).fields.employerName).toBe(
    "Enter the employer name.",
  );
  mocks.list.mockRejectedValue(new Error("postgresql://secret"));
  const failure = await employmentRequest(request());
  expect(failure.status).toBe(503);
  expect(await failure.text()).not.toContain("secret");
});
