import { defineConfig } from "vitest/config";
import base from "./vitest.config.ts";
// Shared-database files run sequentially to avoid incidental SSI predicate-lock conflicts.
// Tests that deliberately exercise concurrent writes still run those writes together.
export default defineConfig({ ...base, test: { fileParallelism: false, environment: "node", include: ["tests/**/*.integration.test.ts"] } });
