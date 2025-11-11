/**
 * @file index.js
 * @description Modern grid factory for the new WASM-hybrid architecture
 */
import { ModernGrid } from "./Grid.js"; // <-- Imports the new hybrid controller
import { gridConfig } from "./utils/GridConfigSystem.js";
import {
	getGrid as getCachedGrid,
	saveGrid as saveCachedGrid,
	getKV,
} from "../storage/indexeddb.js";

// Component exports removed: GridTab, GridTabs, GridCell are no longer used
// Re-export named bindings (only what's still present)
export { ModernGrid };

/**
 * Modern Grid Factory - Primary API
 * This function now creates the new hybrid grid.
 */
export async function createModernGrid(container, options = {}) {
	const element =
		typeof container === "string"
			? document.querySelector(container)
			: container;

	if (!element) {
		throw new Error(`Modern grid container not found: ${container}`);
	}

	// Initialize config system (used for fallbacks and preferences)
	await gridConfig.initialize();

	// Pass the gridId to the constructor
	const gridOptions = {
		...options,
		gridId: options.gridId || element.dataset.gridId || "default",
	};

	const grid = new ModernGrid(element, gridOptions);

	// --- NEW RENDERER REGISTRATION ---
	// Pass any custom renderers from options to the grid instance
	if (options.renderers && typeof options.renderers === "object") {
		for (const [blockType, renderFunction] of Object.entries(
			options.renderers
		)) {
			grid.registerBlockRenderer(blockType, renderFunction);
		}
	}
	// --- END ---

	// The new grid handles its own initialization from the backend
	await grid.initialize();

	// Load CSS if not already loaded
	loadModernGridCSS();

	return grid;
}

// ... (Other factories like createDashboardGrid can remain) ...
// ... (They will now pass the 'renderers' option if provided) ...

export async function createDashboardGrid(container, options = {}) {
	await gridConfig.initialize();
	// ... (other options) ...

	// MODIFIED: Ensure options are passed through
	return createModernGrid(container, {
		...options,
		// ... (dashboard-specific options) ...
	});
}

/**
 * Load modern grid CSS automatically
 */
function loadModernGridCSS() {
	if (document.head.querySelector("#nodus-grid-styles")) return;

	const link = document.createElement("link");
	link.id = "nodus-grid-styles";
	link.rel = "stylesheet";
	link.href = new URL("./Grid.css", import.meta.url).href;
	document.head.appendChild(link);
}

// ... (Keep ModernGridDebug, ModernGridThemes, ModernGridPlugin exports) ...
// ... (Keep CSS auto-load and default export) ...

// Auto-load CSS on import
if (typeof document !== "undefined") {
	loadModernGridCSS();
}

// Default export
export default {
	ModernGrid,
	createModernGrid,
	createDashboardGrid,
	// ... other exports ...
};
