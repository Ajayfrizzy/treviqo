import { expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import { observePrefetch } from "./helpers/prefetch-observer";

async function fixture(
  options: {
    streaming?: boolean;
    body?: string;
    base64Encoded?: boolean;
    bodyFailure?: boolean;
    status?: number;
  } = {},
) {
  const handlers = new Map<string, (event: unknown) => Promise<void>>();
  const send = vi.fn(async (method: string) => {
    if (method === "Network.streamResourceContent") {
      if (!options.streaming)
        throw new Error("Request has already finished loading");
      return {
        bufferedData: Buffer.from("Add an employment first").toString("base64"),
      };
    }
    if (method === "Network.getResponseBody") {
      if (options.bodyFailure) throw new Error("Body unavailable");
      return {
        body: options.body ?? "Add an employment first",
        base64Encoded: options.base64Encoded ?? false,
      };
    }
    return {};
  });
  const page = {
    context: () => ({
      newCDPSession: async () => ({
        send,
        on: (name: string, handler: (event: unknown) => Promise<void>) =>
          handlers.set(name, handler),
        detach: vi.fn(),
      }),
    }),
  } as unknown as Page;
  const observer = await observePrefetch(page, {
    "/documents": "Add an employment first",
  });
  const response = async (requestId = "original-request") => {
    await handlers.get("Network.responseReceived")!({
      requestId,
      response: {
        url: "https://fixture.test/documents?_rsc=fixture",
        status: options.status ?? 200,
      },
    });
  };
  return { observer, send, response };
}

it("recovers a completed UTF-8 response when streaming starts too late", async () => {
  const { observer, send, response } = await fixture();
  await response();
  expect(observer.missing()).toEqual([]);
  expect(send).toHaveBeenCalledWith("Network.getResponseBody", {
    requestId: "original-request",
  });
  expect(observer.diagnostics().requests[0]).toMatchObject({
    recoveredCompletedBody: true,
    matched: true,
  });
  expect(send.mock.calls.map(([method]) => method)).toEqual([
    "Network.enable",
    "Network.streamResourceContent",
    "Network.getResponseBody",
  ]);
});

it("decodes a completed base64 response", async () => {
  const { observer, response } = await fixture({
    body: Buffer.from("Add an employment first").toString("base64"),
    base64Encoded: true,
  });
  await response();
  expect(observer.missing()).toEqual([]);
});

it("keeps using streamed content without a body fallback when streaming works", async () => {
  const { observer, response, send } = await fixture({ streaming: true });
  await response();
  expect(observer.missing()).toEqual([]);
  expect(send).not.toHaveBeenCalledWith(
    "Network.getResponseBody",
    expect.anything(),
  );
});

it.each([
  { body: "Loading documents…" },
  { bodyFailure: true },
  { status: 503 },
])(
  "does not accept a shell, missing body or unsuccessful response: %j",
  async (options) => {
    const { observer, response } = await fixture(options);
    await response();
    expect(observer.missing()).toEqual(["/documents"]);
  },
);

it("does not combine fragments from different completed responses", async () => {
  const { observer, response, send } = await fixture({
    body: "Add an employment ",
  });
  await response("first");
  send
    .mockImplementationOnce(async () => {
      throw new Error("Request has already finished loading");
    })
    .mockResolvedValueOnce({ body: "first", base64Encoded: false });
  await response("second");
  expect(observer.missing()).toEqual(["/documents"]);
});
