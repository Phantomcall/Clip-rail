import { defineConfig } from "vitest/config";

// Effects skip their RPC reads in tests (see src/effects.ts).
export default defineConfig({ test: { env: { CLIPRAIL_INDEXER_OFFLINE: "1" } } });
