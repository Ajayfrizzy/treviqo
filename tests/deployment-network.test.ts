import { expect, it } from "vitest";
import { networkCheck } from "@/ops/network";
const missing = async () => { throw new Error("DNS unavailable"); };
it("reports private DNS limits locally without excusing hosted failures", async () => {
 expect(await networkCheck("postgresql://secret@database.internal/app",true,missing)).toBe("requires_rumpty_network");
 expect(await networkCheck("redis://secret@cache.internal:6379",false,missing)).toBe("dns_failed");
 expect(await networkCheck("redis://cache.example.test",true,missing)).toBe("dns_failed");
});
it("distinguishes configuration and DNS success from authentication", async () => {
 expect(await networkCheck(undefined,true)).toBe("missing");
 expect(await networkCheck("not a URL",true)).toBe("invalid");
 expect(await networkCheck("redis://cache.internal",true,async()=>({}))).toBe("resolved");
});
