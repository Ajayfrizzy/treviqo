import { cpSync, existsSync } from "node:fs";
// Mirror the deployed standalone artifact, including its browser assets.
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public"))
  cpSync("public", ".next/standalone/public", { recursive: true });
await import("../../.next/standalone/server.js");
