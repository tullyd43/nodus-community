import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
	// Serve the `src` folder as the Vite root so `src/index.html` is the app entry
	root: resolve(__dirname, "src"),
	base: "/",
	resolve: {
		alias: {
			// Map bare specifiers used across the app to the src tree
			"@platform": resolve(__dirname, "src", "platform"),
			"@shared": resolve(__dirname, "src", "shared"),
			"@features": resolve(__dirname, "src", "features"),
			"@app": resolve(__dirname, "src", "app"),
		},
	},
	server: {
		port: 5173,
		strictPort: true,
		// don't auto-open from here; our npm scripts handle opening
		open: false,
	},
	build: {
		// Place built files where Tauri expects them
		outDir: resolve(__dirname, "dist"),
		emptyOutDir: true,
		rollupOptions: {
			input: resolve(__dirname, "src", "index.html"),
		},
	},
});
