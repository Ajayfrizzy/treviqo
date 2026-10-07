import { expect, it } from "vitest";
import { PrefetchStream } from "./helpers/prefetch-stream";
const encoded = (text: string) => Buffer.from(text).toString("base64");

it("matches a phrase split between the buffered prefix and early live chunks", () => {
  const stream = new PrefetchStream("No exit cases yet");
  stream.append(encoded("cases "));
  stream.append(encoded("yet"));
  expect(stream.matched).toBe(false);
  stream.initialize(encoded("prefix No exit "));
  expect(stream.matched).toBe(true);
  expect(stream.bytes).toBe(Buffer.byteLength("prefix No exit cases yet"));
});

it("matches chunks arriving after initialization without losing an earlier match", () => {
  const stream = new PrefetchStream("No documents yet");
  stream.initialize(encoded("No doc"));
  stream.append(encoded("uments yet"));
  stream.append(encoded(" subsequent content"));
  expect(stream.matched).toBe(true);
});

it("decodes UTF-8 characters split between byte chunks", () => {
  const stream = new PrefetchStream("₦48,000");
  const bytes = Buffer.from("₦48,000");
  stream.append(bytes.subarray(1, 2).toString("base64"));
  stream.initialize(bytes.subarray(0, 1).toString("base64"));
  stream.append(bytes.subarray(2).toString("base64"));
  expect(stream.matched).toBe(true);
});

it("does not mistake a loading shell or a different response for page content", () => {
  const shell = new PrefetchStream("No exit cases yet");
  shell.initialize(encoded("Loading exit checklists… No exit "));
  const other = new PrefetchStream("No exit cases yet");
  other.initialize(encoded("cases yet"));
  expect(shell.matched).toBe(false);
  expect(other.matched).toBe(false);
});
