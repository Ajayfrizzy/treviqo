import type { PrivateObjectStorage } from "@/server/storage/client";
export class FakeStorage implements PrivateObjectStorage {
  objects = new Map<string, Buffer>();
  failPut = false;
  failDelete = false;
  failSign = false;
  writes = 0;
  signs = 0;
  removals = 0;
  async read(key: string, maxBytes: number) {
    const body = this.objects.get(key);
    if (!body || body.length > maxBytes) throw new Error("Object unavailable");
    return body;
  }
  async checkConnection() {}
  async put(key: string, body: Buffer) {
    this.writes++;
    this.objects.set(key, body);
    if (this.failPut) throw new Error("put failed after acceptance");
  }
  async remove(key: string) {
    this.removals++;
    if (this.failDelete) throw new Error("delete failed");
    this.objects.delete(key);
  }
  async purge(key: string) {
    await this.remove(key);
  }
  async signDownload(
    key: string,
    filename: string,
    mime: string,
    expires: number,
  ) {
    this.signs++;
    if (this.failSign) throw new Error("sign failed");
    return `https://storage.example.test/${key}?expires=${expires}&filename=${filename}&type=${mime}`;
  }
}
