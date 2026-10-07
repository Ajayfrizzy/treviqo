import { StringDecoder } from "node:string_decoder";

// CDP can deliver dataReceived before streamResourceContent resolves. The
// buffered prefix must be decoded first, even when live chunks arrived earlier.
export class PrefetchStream {
  private readonly decoder = new StringDecoder("utf8");
  private pending: Buffer[] = [];
  private initialized = false;
  private tail = "";
  matched = false;
  bytes = 0;

  constructor(private readonly expected: string) {}

  append(data: string) {
    const chunk = Buffer.from(data, "base64");
    if (!this.initialized) this.pending.push(chunk);
    else this.consume(chunk);
  }

  initialize(prefix: string) {
    this.initialized = true;
    this.consume(Buffer.from(prefix, "base64"));
    for (const chunk of this.pending) this.consume(chunk);
    this.pending = [];
  }

  private consume(chunk: Buffer) {
    this.bytes += chunk.length;
    const text = this.tail + this.decoder.write(chunk);
    this.matched ||= text.includes(this.expected);
    // Retain only enough text to match across chunk boundaries.
    this.tail = text.slice(-Math.max(1, this.expected.length - 1));
  }
}
