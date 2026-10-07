import { expect, it, vi } from "vitest";
const evalRedis = vi.hoisted(() => vi.fn());
vi.mock("@/server/redis/client", () => ({
  getRedis: () => ({ eval: evalRedis }),
}));
import {
  limitWorkflow,
  limitResponse,
  WorkflowLimit,
} from "@/server/rate-limit";
it("fails closed on Redis errors and provides retry information without exposing identities", async () => {
  evalRedis.mockRejectedValue(new Error("redis://secret"));
  await expect(limitWorkflow("private-user", "upload")).rejects.toThrow();
  evalRedis.mockResolvedValue([21, 450]);
  let error;
  try {
    await limitWorkflow("private-user", "upload");
  } catch (failure) {
    error = failure;
  }
  expect(error).toBeInstanceOf(WorkflowLimit);
  expect(evalRedis.mock.calls.at(-1)![2]).not.toContain("private-user");
  const response = limitResponse(error)!;
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("450");
  expect(await response.text()).not.toContain("private-user");
});
