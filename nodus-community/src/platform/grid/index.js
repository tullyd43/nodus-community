/**
 * @file index.js
 * @description Modern grid factory and utilities with configurable drag thresholds
 */
import { ModernGrid } from "./Grid.js";
import { ModernGridBlock } from "./components/GridBlock.js";
import { gridConfig } from "./utils/GridConfigSystem.js";
import {
	getGrid as getCachedGrid,
	saveGrid as saveCachedGrid,
	getKV,
} from "../storage/indexeddb.js";

// Component exports (unchanged)
import { GridTab } from "./components/GridTab.js";
import { GridTabs } from "./components/GridTabs.js";
import { GridCell } from "./components/GridCell.js";

import { GridLayout } from "./utils/GridLayout.js";
import {
	normalizeConfig,
	validateConfig,
	createDefaultConfig,
} from "./utils/GridConfig.js";

// Re-export named bindings
export { ModernGrid, ModernGridBlock, GridTab, GridTabs, GridCell, GridLayout };
export { normalizeConfig, validateConfig, createDefaultConfig };

/**
 * Modern Grid Factory - Primary API
 */
export async function createModernGrid(container, options = {}) {
	const element =
		typeof container === "string"
			? document.querySelector(container)
			: container;

	if (!element) {
		throw new Error(`Modern grid container not found: ${container}`);
	}

	// Initialize config system before creating grid (includes new drag threshold system)
	await gridConfig.initialize();

	const grid = new ModernGrid(element, {
		...options,
		actionDispatcher:
			options.actionDispatcher || window.__nodus?.actionDispatcher,
		orchestrator: options.orchestrator || window.__nodus?.asyncOrchestrator,
	});

	// Process existing widgets in HTML - USE CONFIG DEFAULTS
	const existingItems = element.querySelectorAll(".nodus-grid-item");
	existingItems.forEach((item) => {
		const defaultSize = gridConfig.getDefaultBlockSize();

		const itemData = {
			x: parseInt(item.dataset.gridX) || 0,
			y: parseInt(item.dataset.gridY) || 0,
			w: parseInt(item.dataset.gridW) || defaultSize.w,
			h: parseInt(item.dataset.gridH) || defaultSize.h,
			minW: parseInt(item.dataset.gridMinW) || 1,
			minH: parseInt(item.dataset.gridMinH) || 1,
			maxW: item.dataset.gridMaxW
				? parseInt(item.dataset.gridMaxW)
				: null,
			maxH: item.dataset.gridMaxH
				? parseInt(item.dataset.gridMaxH)
				: null,
			locked: item.dataset.gridLocked === "true",
			noResize: item.dataset.gridNoResize === "true",
			noMove: item.dataset.gridNoMove === "true",
			autoPosition: item.dataset.gridAutoPosition === "true",
			content: item.innerHTML,
		};

		// Remove from DOM and recreate as modern component
		item.remove();
		grid.addWidget(itemData);
	});

	// Load CSS if not already loaded
	loadModernGridCSS();

	// Attempt to load cached grid state for faster startup
	try {
		const cache = await getCachedGrid(grid.gridId);
		if (cache && Array.isArray(cache.widgets) && cache.widgets.length) {
			console.log(
				`[ModernGrid] Loaded ${cache.widgets.length} widgets from cache for grid ${grid.gridId}`
			);
			// Load cached widgets quickly (skip backend registration)
			grid.batchMode = true;
			cache.widgets.forEach((w) => {
				const opts = {
					...w,
					id: w.id || w.serverId || undefined,
					skipBackend: true,
				};
				grid.addWidget(opts);
			});
			grid.batchMode = false;
			grid.updateGridHeight();

			// 🎯 NEW: Restore drag threshold preferences from cache
			if (cache.dragThreshold && cache.dragThreshold.preset) {
				grid.setDragSensitivity(cache.dragThreshold.preset);
			}
		}
	} catch (err) {
		console.warn("[ModernGrid] Failed to load cached grid:", err);
	}

	// In background, fetch authoritative server state and reconcile
	(async () => {
		try {
			const dispatcher =
				options.actionDispatcher || window.__nodus?.actionDispatcher;
			const orchestrator =
				options.orchestrator || window.__nodus?.asyncOrchestrator;
			let serverState = null;

			if (dispatcher) {
				if (orchestrator) {
					const runner = orchestrator.createRunner("load_grid_state");
					serverState = await runner.run(() =>
						dispatcher.dispatch("grid.state.get", {
							gridId: grid.gridId,
						})
					);
				} else {
					serverState = await dispatcher.dispatch("grid.state.get", {
						gridId: grid.gridId,
					});
				}
			}

			if (serverState && Array.isArray(serverState.widgets)) {
				// Simple reconciliation: if server differs, replace local widgets
				const cached = await getCachedGrid(grid.gridId);
				const cachedWidgets = (cached && cached.widgets) || [];
				const same =
					JSON.stringify(cachedWidgets) ===
					JSON.stringify(serverState.widgets);
				if (!same) {
					console.log(
						"[ModernGrid] Server grid state differs from cache – reconciling"
					);
					grid.batchMode = true;
					grid.clear();
					serverState.widgets.forEach((w) => {
						grid.addWidget({ ...w, id: w.id, skipBackend: true });
					});
					grid.batchMode = false;
					grid.updateGridHeight();
					// Persist server state to cache
					await saveCachedGrid(grid.gridId, grid.serialize());
				}
			}

			// Load user's drag threshold preferences from local KV store (fast)
			try {
				const prefs = await getKV("preferences:grid.dragThreshold");
				if (prefs && prefs.preset) {
					grid.setDragSensitivity(prefs.preset);
				}
			} catch (error) {
				console.warn(
					"[ModernGrid] Failed to load cached user prefs:",
					error
				);
			}
		} catch (err) {
			console.warn("[ModernGrid] Error fetching server grid state:", err);
		}
	})();

	return grid;
}

/**
 * Initialize modern grid with backend integration
 */
export async function initializeModernGrid(container, options = {}) {
	const element =
		typeof container === "string"
			? document.querySelector(container)
			: container;

	if (!element) {
		throw new Error(`Modern grid container not found: ${container}`);
	}

	await gridConfig.initialize();

	const grid = new ModernGrid(element, {
		...options,
		actionDispatcher:
			options.actionDispatcher || window.__nodus?.actionDispatcher,
		orchestrator: options.orchestrator || window.__nodus?.asyncOrchestrator,
	});

	return grid;
}

/**
 * Widget factory functions - USE CONFIG DEFAULTS
 */
export function createWidget(options = {}) {
	const defaultSize = gridConfig.getDefaultBlockSize();

	return new ModernGridBlock({
		// Use config defaults if not specified
		w: options.w ?? defaultSize.w,
		h: options.h ?? defaultSize.h,
		...options,
		actionDispatcher:
			options.actionDispatcher || window.__nodus?.actionDispatcher,
		orchestrator: options.orchestrator || window.__nodus?.asyncOrchestrator,
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

/**
 * Enhanced factory for specific use cases
 */
export async function createDashboardGrid(container, options = {}) {
	await gridConfig.initialize();

	const orchestrator =
		options.orchestrator || window.__nodus?.asyncOrchestrator;

	const gridOptions = {
		...options,
		// Use config defaults but allow overrides
		column: options.column ?? gridConfig.get("columns"),
		cellHeight: options.cellHeight ?? gridConfig.get("cellHeight"),
		animate: options.animate ?? gridConfig.get("animate"),
		float: false, // Override config: dashboards should reflow
		responsive: true,
		oneColumnMode: true,
		acceptWidgets: true,
	};

	if (orchestrator) {
		const runner = orchestrator.createRunner("create_dashboard_grid");

		return runner.run(async () => {
			return createModernGrid(container, gridOptions);
		});
	} else {
		return createModernGrid(container, gridOptions);
	}
}

export async function createKanbanGrid(container, options = {}) {
	await gridConfig.initialize();

	return createModernGrid(container, {
		...options,
		column: options.column ?? 3, // Kanban-specific override
		cellHeight: options.cellHeight ?? 80,
		float: true, // Override config: Kanban doesn't reflow
		acceptWidgets: true,
		removable: ".trash-zone",
	});
}

export async function createStaticGrid(container, options = {}) {
	await gridConfig.initialize();

	return createModernGrid(container, {
		...options,
		staticGrid: true, // Override config: static means no interactions
		disableDrag: true,
		disableResize: true,
		animate: false,
	});
}

// (Migration helpers removed — legacy compatibility support eliminated)

/**
 * Performance and debugging helpers - ENHANCED WITH CONFIG INFO
 */
export const ModernGridDebug = {
	// Get all grid instances
	getAllGrids: () => {
		return Array.from(
			document.querySelectorAll('[data-component="modern-grid"]')
		)
			.map((el) => el.__gridInstance)
			.filter(Boolean);
	},

	// Export grid state INCLUDING CONFIG INFO
	exportGrid: (grid) => {
		return {
			options: {
				column: grid.column,
				cellHeight: grid.cellHeight,
				margin: grid.margin,
				staticGrid: grid.staticGrid,
				float: grid.float,
			},
			// Include current config settings
			config: {
				columns: gridConfig.get("columns"),
				gap: gridConfig.get("gap"),
				defaultBlockSize: gridConfig.getDefaultBlockSize(),
				float: gridConfig.get("float"),
				staticGrid: gridConfig.get("staticGrid"),
				animate: gridConfig.get("animate"),
				maxLiveReflowWidgets: gridConfig.get("maxLiveReflowWidgets"),
				// 🎯 NEW: Include drag threshold configuration
				dragThreshold: gridConfig.getDragThresholdInfo(),
			},
			widgets: Array.from(grid.widgets.values()).map((w) =>
				w.serialize()
			),
		};
	},

	// Performance monitoring
	monitor: (grid) => {
		const observer = new PerformanceObserver((list) => {
			list.getEntries().forEach((entry) => {
				if (entry.name.includes("grid")) {
					console.log(
						`[ModernGrid] ${entry.name}: ${entry.duration.toFixed(
							2
						)}ms`
					);
				}
			});
		});
		observer.observe({ entryTypes: ["measure"] });
	},

	// Memory usage tracking
	trackMemory: () => {
		if (window.performance && window.performance.memory) {
			return {
				used: window.performance.memory.usedJSHeapSize,
				total: window.performance.memory.totalJSHeapSize,
				limit: window.performance.memory.jsHeapSizeLimit,
			};
		}
		return null;
	},

	// Grid statistics INCLUDING CONFIG INFO
	getStats: (grid) => {
		return {
			widgetCount: grid.widgets.size,
			gridHeight: grid.getGridHeight?.() || 0,
			cellWidth: grid.cellWidth || "auto",
			cellHeight: grid.cellHeight,
			staticMode: grid.staticGrid,
			floatMode: grid.float,
			// Config information
			configuredColumns: gridConfig.get("columns"),
			configuredDefaultSize: gridConfig.getDefaultBlockSize(),
			maxReflowWidgets: gridConfig.get("maxLiveReflowWidgets"),
			// 🎯 NEW: Include drag threshold info in stats
			dragThreshold: gridConfig.getDragThresholdInfo(),
		};
	},
};

/**
 * Configuration utilities - ENHANCED WITH DRAG THRESHOLDS
 */
export const ModernGridConfig = {
	// Get current configuration
	getConfig: () => gridConfig,

	// Quick configuration shortcuts
	setDefaultBlockSize: (w, h) => gridConfig.setDefaultBlockSize(w, h),
	setColumns: (columns) => gridConfig.set("columns", columns),
	setGap: (gap) => gridConfig.set("gap", gap),
	enableReflow: () => gridConfig.set("float", false),
	disableReflow: () => gridConfig.set("float", true),
	enableAnimations: () => gridConfig.set("animate", true),
	disableAnimations: () => gridConfig.set("animate", false),

	// 🎯 NEW: Drag threshold configuration shortcuts
	setDragSensitivity: (preset) => gridConfig.setDragSensitivityPreset(preset),
	getDragThreshold: () => gridConfig.getDragThresholdInfo(),
	setCustomThreshold: (percentage) => {
		gridConfig.set("dragThreshold.method", "custom");
		gridConfig.set("dragThreshold.percentage", percentage);
	},

	// Preset configurations
	setSquareBlocks: () => {
		const size = gridConfig.get("defaultBlockSize.w");
		return gridConfig.set("defaultBlockSize.h", size);
	},

	setRectangleBlocks: (w, h) => gridConfig.setDefaultBlockSize(w, h),

	// Performance presets
	setPerformanceMode: (mode) => {
		switch (mode) {
			case "high-performance":
				gridConfig.set("animate", false);
				gridConfig.set("maxLiveReflowWidgets", 20);
				gridConfig.set("reflowThrottleMs", 32);
				break;
			case "smooth":
				gridConfig.set("animate", true);
				gridConfig.set("maxLiveReflowWidgets", 50);
				gridConfig.set("reflowThrottleMs", 16);
				break;
			case "unlimited":
				gridConfig.set("animate", true);
				gridConfig.set("maxLiveReflowWidgets", 200);
				gridConfig.set("reflowThrottleMs", 8);
				break;
		}
	},
};

/**
 * Theme utilities (unchanged)
 */
export const ModernGridThemes = {
	// Apply minimal theme
	minimal: (grid) => {
		grid.element.classList.add("theme-minimal");
	},

	// Apply card theme
	card: (grid) => {
		grid.element.classList.add("theme-card");
	},

	// Apply rounded theme
	rounded: (grid) => {
		grid.element.classList.add("theme-rounded");
	},

	// Custom theme
	custom: (grid, customProperties) => {
		Object.entries(customProperties).forEach(([property, value]) => {
			grid.element.style.setProperty(property, value);
		});
	},

	// Dark mode
	dark: (grid) => {
		grid.element.style.setProperty("--grid-item-bg", "#2a2a2a");
		grid.element.style.setProperty("--grid-item-border", "#555");
		grid.element.style.setProperty(
			"--grid-item-shadow",
			"0 2px 4px rgba(0,0,0,0.3)"
		);
	},
};

/**
 * Plugin system for extensibility (unchanged)
 */
export class ModernGridPlugin {
	constructor(name, config = {}) {
		this.name = name;
		this.config = config;
		this.installed = false;
	}

	install(grid) {
		if (this.installed) return;

		if (this.config.onInstall) {
			this.config.onInstall(grid);
		}

		this.installed = true;
		console.log(`[ModernGrid] Plugin installed: ${this.name}`);
	}

	uninstall(grid) {
		if (!this.installed) return;

		if (this.config.onUninstall) {
			this.config.onUninstall(grid);
		}

		this.installed = false;
		console.log(`[ModernGrid] Plugin uninstalled: ${this.name}`);
	}
}

// Auto-load CSS on import
if (typeof document !== "undefined") {
	loadModernGridCSS();
}

// Default export (explicit, no legacy aliases)
export default {
	ModernGrid,
	ModernGridBlock,
	GridTab,
	GridTabs,
	GridCell,

	// Factories
	createModernGrid,
	initializeModernGrid,
	createWidget,
	createDashboardGrid,
	createKanbanGrid,
	createStaticGrid,

	// Utilities
	ModernGridDebug,
	ModernGridThemes,
	ModernGridPlugin,

	// Configuration utilities
	ModernGridConfig,
};
