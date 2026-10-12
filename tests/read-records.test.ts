import { expect, it } from "vitest";
import { readRecords } from "@/server/db/read";
import { DocumentError } from "@/modules/documents/validation";
it("redacts unexpected read failures and preserves typed ownership errors", async () => {
  await expect(
    readRecords(async () => {
      throw Object.assign(new Error("P2028 provider:secret"), {
        code: "P2028",
      });
    }),
  ).rejects.toMatchObject({
    status: 503,
    message: "Your records could not load. Please try again in a moment.",
  });
  const denied = new DocumentError("Not found", 404);
  await expect(
    readRecords(async () => {
      throw denied;
    }),
  ).rejects.toBe(denied);
  expect(await readRecords(async () => "ok")).toBe("ok");
});
