import { lookup } from "node:dns/promises";
export async function networkCheck(
  raw: string | undefined,
  local: boolean,
  resolve: (host: string) => Promise<unknown> = lookup,
) {
  if (!raw) return "missing";
  let host: string;
  try {
    host = new URL(raw).hostname;
    if (!host) return "invalid";
  } catch {
    return "invalid";
  }
  try {
    await resolve(host);
    return "resolved";
  } catch {
    return local && /\.(internal|local)$/i.test(host)
      ? "requires_rumpty_network"
      : "dns_failed";
  }
}
