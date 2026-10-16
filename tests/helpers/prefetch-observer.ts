import type { Page } from "@playwright/test";
import { PrefetchStream } from "./prefetch-stream";

export async function observePrefetch(
  page: Page,
  content: Record<string, string>,
) {
  const network = await page.context().newCDPSession(page);
  await network.send("Network.enable");
  if (process.env.NAVIGATION_SLOW_NETWORK === "1") {
    await network.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 100,
      downloadThroughput: 200 * 1024,
      uploadThroughput: 100 * 1024,
    });
  }
  const streams = new Map<
    string,
    {
      path: string;
      status: number;
      stream: PrefetchStream;
      observationError?: string;
      completedBodyError?: string;
      recoveredCompletedBody?: boolean;
      requestFailure?: string;
    }
  >();
  network.on("Network.dataReceived", (event) => {
    if (event.data) streams.get(event.requestId)?.stream.append(event.data);
  });
  network.on("Network.loadingFailed", (event) => {
    const entry = streams.get(event.requestId);
    if (entry) entry.requestFailure = event.errorText;
  });
  network.on("Network.responseReceived", async (event) => {
    const url = new URL(event.response.url);
    const expected = content[url.pathname];
    if (!expected || !url.searchParams.has("_rsc")) return;
    const entry = {
      path: url.pathname,
      status: event.response.status,
      stream: new PrefetchStream(expected),
      observationError: undefined as string | undefined,
      completedBodyError: undefined as string | undefined,
      recoveredCompletedBody: false,
    };
    streams.set(event.requestId, entry);
    try {
      const result = await network.send("Network.streamResourceContent", {
        requestId: event.requestId,
      });
      entry.stream.initialize(result.bufferedData);
    } catch (error) {
      entry.observationError =
        error instanceof Error ? error.message : String(error);
      // Fast responses can finish before CDP enables streaming. Read the same
      // request's completed body, never refetch it or combine separate payloads.
      try {
        const result = await network.send("Network.getResponseBody", {
          requestId: event.requestId,
        });
        const completed = new PrefetchStream(expected);
        completed.initialize(
          result.base64Encoded
            ? result.body
            : Buffer.from(result.body).toString("base64"),
        );
        entry.stream = completed;
        entry.recoveredCompletedBody = true;
      } catch (bodyError) {
        entry.completedBodyError =
          bodyError instanceof Error ? bodyError.message : String(bodyError);
      }
    }
  });
  const missing = () =>
    Object.keys(content).filter(
      (path) =>
        ![...streams.values()].some(
          (entry) =>
            entry.path === path && entry.status === 200 && entry.stream.matched,
        ),
    );
  return {
    missing,
    diagnostics: () => ({
      missing: missing(),
      requests: [...streams.values()].map(
        ({
          path,
          status,
          stream,
          observationError,
          completedBodyError,
          recoveredCompletedBody,
          requestFailure,
        }) => ({
          path,
          status,
          bytes: stream.bytes,
          matched: stream.matched,
          observationError,
          completedBodyError,
          recoveredCompletedBody,
          requestFailure,
        }),
      ),
    }),
    dispose: () => network.detach(),
  };
}
