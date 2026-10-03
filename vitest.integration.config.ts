import { defineConfig } from "vitest/config";
import base from "./vitest.config.ts";
export default defineConfig({ ...base, test: { environment: "node", include: ["tests/**/*.integration.test.ts"] } });
