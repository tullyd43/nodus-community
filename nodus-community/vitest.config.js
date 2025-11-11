import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	test: {
		environment: "jsdom",
	},
	resolve: {
		alias: {
			"@platform": path.resolve(__dirname, "src/platform"),
		},
	},
});
