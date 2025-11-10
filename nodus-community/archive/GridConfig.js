/**
* @file GridConfig.js
 * @description Normalizes and validates grid runtime configuration with drag threshold support
 * Utility functions integrated with the centralized GridConfigSystem
 */

import { gridConfig } from "../src/platform/grid/utils/GridConfigSystem.js";

/**
 * Normalizes and validates grid configuration input
 * @param {object} input - Raw grid configuration
 * @returns {object} Normalized configuration
 */
export async function normalizeConfig(input = {}) {
	// Ensure config system is initialized
	if (!gridConfig.get) {
		await gridConfig.initialize();
	}

	const cfg = typeof input === "object" && input ? { ...input } : {};

	// Set sensible defaults using centralized config
	cfg.columns =
		Number.isFinite(cfg.columns) && cfg.columns > 0
			? Math.floor(cfg.columns)
			: gridConfig.get("columns");

	cfg.gap =
		Number.isFinite(cfg.gap) && cfg.gap >= 0
			? cfg.gap
			: gridConfig.get("gap");

	cfg.blocks = Array.isArray(cfg.blocks) ? cfg.blocks : [];

	// 🎯 NEW: Normalize drag threshold configuration
	if (input.dragThreshold && typeof input.dragThreshold === "object") {
		cfg.dragThreshold = normalizeDragThreshold(input.dragThreshold);
	} else {
		cfg.dragThreshold = gridConfig.get("dragThreshold");
	}

	/**
	 * Normalize blocks array with validation and constraint enforcement
	 * @param {Array} blocks - Array of block configurations
	 * @returns {Array} Normalized blocks
	 */
	const normalizeBlocks = (blocks) => {
		const out = [];
		const defaultSize = gridConfig.getDefaultBlockSize();

		for (const raw of blocks || []) {
			// Ensure block has valid ID
			const id = String(raw?.id || raw?.blockId || "").trim();
			if (!id) continue;

			// Normalize position and size - USE CENTRALIZED CONFIG DEFAULTS!
			const x = clampInt(raw?.x ?? raw?.position?.x ?? 0, 0);
			const y = clampInt(raw?.y ?? raw?.position?.y ?? 0, 0);
			const w = clampInt(raw?.w ?? raw?.position?.w ?? defaultSize.w, 1);
			const h = clampInt(raw?.h ?? raw?.position?.h ?? defaultSize.h, 1);

			// Normalize type and props
			const type = String(raw?.type || "html");
			const props =
				typeof raw?.props === "object" && raw?.props ? raw.props : {};

			// Apply constraints
			const constraints = {
				minW: clampInt(raw?.constraints?.minW ?? 1, 1),
				minH: clampInt(raw?.constraints?.minH ?? 1, 1),
				maxW: clampInt(raw?.constraints?.maxW ?? cfg.columns, 1),
				maxH: clampInt(raw?.constraints?.maxH ?? 1000, 1),
			};

			// Enforce constraints
			const ww = Math.min(
				Math.max(w, constraints.minW),
				constraints.maxW
			);
			const hh = Math.min(
				Math.max(h, constraints.minH),
				constraints.maxH
			);

			// Skip blocks that don't fit in grid
			if (x + ww > cfg.columns) continue;

			out.push({ id, x, y, w: ww, h: hh, type, props, constraints });
		}

		return out;
	};

	cfg.blocks = normalizeBlocks(cfg.blocks);

	// Handle responsive templates: { xs/sm/md/lg/xl/xxl: { blocks: [...] } }
	const rawTemplates =
		typeof input.templates === "object" && input.templates
			? input.templates
			: null;

	if (rawTemplates) {
		const templates = {};
		for (const [name, t] of Object.entries(rawTemplates)) {
			const tpl = typeof t === "object" && t ? t : {};
			templates[name] = { blocks: normalizeBlocks(tpl.blocks || []) };
		}
		cfg.templates = templates;
	}

	return cfg;
}

/**
 * 🎯 NEW: Normalize drag threshold configuration
 * @param {object} dragThreshold - Raw drag threshold config
 * @returns {object} Normalized drag threshold config
 */
function normalizeDragThreshold(dragThreshold) {
	const normalized = {
		method: "round",
		percentage: 0.5,
		preset: "balanced",
		directional: {
			enabled: false,
			horizontal: 0.5,
			vertical: 0.5,
		},
	};

	if (!dragThreshold || typeof dragThreshold !== "object") {
		return normalized;
	}

	// Validate and normalize method
	const validMethods = ["round", "floor", "ceil", "custom"];
	if (validMethods.includes(dragThreshold.method)) {
		normalized.method = dragThreshold.method;
	}

	// Validate and normalize percentage
	if (Number.isFinite(dragThreshold.percentage)) {
		normalized.percentage = Math.max(
			0,
			Math.min(1, dragThreshold.percentage)
		);
	}

	// Validate and normalize preset
	const validPresets = ["precise", "balanced", "loose", "custom"];
	if (validPresets.includes(dragThreshold.preset)) {
		normalized.preset = dragThreshold.preset;
	}

	// Validate and normalize directional settings
	if (
		dragThreshold.directional &&
		typeof dragThreshold.directional === "object"
	) {
		normalized.directional.enabled = Boolean(
			dragThreshold.directional.enabled
		);

		if (Number.isFinite(dragThreshold.directional.horizontal)) {
			normalized.directional.horizontal = Math.max(
				0,
				Math.min(1, dragThreshold.directional.horizontal)
			);
		}

		if (Number.isFinite(dragThreshold.directional.vertical)) {
			normalized.directional.vertical = Math.max(
				0,
				Math.min(1, dragThreshold.directional.vertical)
			);
		}
	}

	return normalized;
}

/**
 * Clamp integer value to minimum
 * @param {number} v - Value to clamp
 * @param {number} min - Minimum value
 * @returns {number} Clamped integer
 */
function clampInt(v, min) {
	const n = Number.isFinite(v) ? Math.floor(v) : min;
	return n < min ? min : n;
}

/**
 * Validate grid configuration (ENHANCED with drag threshold validation)
 * @param {object} config - Configuration to validate
 * @returns {object} Validation result with errors array
 */
export function validateConfig(config) {
	const errors = [];

	if (!config || typeof config !== "object") {
		errors.push("Configuration must be an object");
		return { valid: false, errors };
	}

	// Use centralized config for validation bounds
	const maxColumns = 24; // Could come from gridConfig if needed
	const minColumns = 1;

	if (
		config.columns &&
		(config.columns < minColumns || config.columns > maxColumns)
	) {
		errors.push(`Columns must be between ${minColumns} and ${maxColumns}`);
	}

	if (config.gap && config.gap < 0) {
		errors.push("Gap must be non-negative");
	}

	// 🎯 NEW: Validate drag threshold configuration
	if (config.dragThreshold) {
		const thresholdErrors = validateDragThreshold(config.dragThreshold);
		errors.push(...thresholdErrors);
	}

	if (config.blocks) {
		if (!Array.isArray(config.blocks)) {
			errors.push("Blocks must be an array");
		} else {
			config.blocks.forEach((block, index) => {
				if (!block.id) {
					errors.push(`Block ${index} must have an id`);
				}
				if (block.x < 0 || block.y < 0) {
					errors.push(
						`Block ${
							block.id || index
						} position must be non-negative`
					);
				}
				if (block.w < 1 || block.h < 1) {
					errors.push(
						`Block ${block.id || index} size must be at least 1x1`
					);
				}
			});
		}
	}

	return { valid: errors.length === 0, errors };
}

/**
 * 🎯 NEW: Validate drag threshold configuration
 * @param {object} dragThreshold - Drag threshold config to validate
 * @returns {Array} Array of validation error messages
 */
function validateDragThreshold(dragThreshold) {
	const errors = [];

	if (!dragThreshold || typeof dragThreshold !== "object") {
		return errors; // Not required, so empty object is fine
	}

	// Validate method
	const validMethods = ["round", "floor", "ceil", "custom"];
	if (dragThreshold.method && !validMethods.includes(dragThreshold.method)) {
		errors.push(
			`Drag threshold method must be one of: ${validMethods.join(", ")}`
		);
	}

	// Validate percentage
	if (dragThreshold.percentage !== undefined) {
		if (!Number.isFinite(dragThreshold.percentage)) {
			errors.push("Drag threshold percentage must be a number");
		} else if (
			dragThreshold.percentage < 0 ||
			dragThreshold.percentage > 1
		) {
			errors.push("Drag threshold percentage must be between 0 and 1");
		}
	}

	// Validate preset
	const validPresets = ["precise", "balanced", "loose", "custom"];
	if (dragThreshold.preset && !validPresets.includes(dragThreshold.preset)) {
		errors.push(
			`Drag threshold preset must be one of: ${validPresets.join(", ")}`
		);
	}

	// Validate directional settings
	if (dragThreshold.directional) {
		if (typeof dragThreshold.directional !== "object") {
			errors.push(
				"Drag threshold directional settings must be an object"
			);
		} else {
			const { directional } = dragThreshold;

			if (
				directional.enabled !== undefined &&
				typeof directional.enabled !== "boolean"
			) {
				errors.push(
					"Drag threshold directional.enabled must be a boolean"
				);
			}

			if (directional.horizontal !== undefined) {
				if (!Number.isFinite(directional.horizontal)) {
					errors.push(
						"Drag threshold directional.horizontal must be a number"
					);
				} else if (
					directional.horizontal < 0 ||
					directional.horizontal > 1
				) {
					errors.push(
						"Drag threshold directional.horizontal must be between 0 and 1"
					);
				}
			}

			if (directional.vertical !== undefined) {
				if (!Number.isFinite(directional.vertical)) {
					errors.push(
						"Drag threshold directional.vertical must be a number"
					);
				} else if (
					directional.vertical < 0 ||
					directional.vertical > 1
				) {
					errors.push(
						"Drag threshold directional.vertical must be between 0 and 1"
					);
				}
			}
		}
	}

	return errors;
}

/**
 * Create default grid configuration using centralized config
 * @param {object} overrides - Configuration overrides
 * @returns {object} Default configuration
 */
export async function createDefaultConfig(overrides = {}) {
	// Ensure config system is initialized
	if (!gridConfig.get) {
		await gridConfig.initialize();
	}

	return normalizeConfig({
		// Use centralized defaults instead of hardcoded values
		columns: gridConfig.get("columns"),
		gap: gridConfig.get("gap"),
		blocks: [],
		// 🎯 NEW: Include default drag threshold configuration
		dragThreshold: gridConfig.get("dragThreshold"),
		...overrides,
	});
}

/**
 * Create a new widget configuration using centralized defaults
 * @param {object} overrides - Widget property overrides
 * @returns {object} Widget configuration
 */
export function createDefaultWidget(overrides = {}) {
	const defaultSize = gridConfig.getDefaultBlockSize();

	return {
		id: overrides.id || crypto.randomUUID(),
		x: overrides.x ?? 0,
		y: overrides.y ?? 0,
		w: overrides.w ?? defaultSize.w,
		h: overrides.h ?? defaultSize.h,
		type: overrides.type || "html",
		props: overrides.props || {},
		constraints: {
			minW: overrides.minW ?? 1,
			minH: overrides.minH ?? 1,
			maxW: overrides.maxW ?? gridConfig.get("columns"),
			maxH: overrides.maxH ?? null,
		},
		...overrides,
	};
}

/**
 * Update widget size to use current default if it matches old default
 * Useful when user changes default block size configuration
 * @param {object} widget - Widget to potentially update
 * @param {object} oldDefault - Previous default size {w, h}
 * @param {object} newDefault - New default size {w, h}
 * @returns {object} Updated widget (or original if no change needed)
 */
export function updateWidgetDefaultSize(widget, oldDefault, newDefault) {
	// Only update if widget is currently using the old default
	if (widget.w === oldDefault.w && widget.h === oldDefault.h) {
		return {
			...widget,
			w: newDefault.w,
			h: newDefault.h,
		};
	}
	return widget;
}

/**
 * Batch update widgets when default size changes
 * @param {Array} widgets - Array of widgets to check
 * @param {object} oldDefault - Previous default size
 * @param {object} newDefault - New default size
 * @returns {Array} Updated widgets array
 */
export function batchUpdateWidgetDefaults(widgets, oldDefault, newDefault) {
	return widgets.map((widget) =>
		updateWidgetDefaultSize(widget, oldDefault, newDefault)
	);
}

/**
 * Get responsive configuration for current viewport
 * @param {object} config - Base configuration
 * @param {number} viewportWidth - Current viewport width
 * @returns {object} Responsive configuration
 */
export function getResponsiveConfig(config, viewportWidth) {
	if (!config.templates) return config;

	// Define breakpoints (could come from gridConfig if needed)
	const breakpoints = {
		xs: 0,
		sm: 576,
		md: 768,
		lg: 992,
		xl: 1200,
		xxl: 1400,
	};

	// Find the appropriate breakpoint
	let activeBreakpoint = "xs";
	for (const [name, minWidth] of Object.entries(breakpoints)) {
		if (viewportWidth >= minWidth) {
			activeBreakpoint = name;
		}
	}

	// Return config with responsive template if available
	const responsiveTemplate = config.templates[activeBreakpoint];
	if (responsiveTemplate) {
		return {
			...config,
			blocks: responsiveTemplate.blocks,
		};
	}

	return config;
}

/**
 * Configuration change listener setup (ENHANCED with drag threshold support)
 * Allows GridConfig utilities to respond to centralized config changes
 */
export function setupConfigurationListeners() {
	window.addEventListener("nodus-grid-config-changed", (e) => {
		const { path, value, config } = e.detail;

		// Log configuration changes for debugging
		console.log(
			`[GridConfig] Configuration changed: ${path} = ${JSON.stringify(
				value
			)}`
		);

		// Could trigger additional validation or normalization here
		if (path.includes("defaultBlockSize")) {
			console.log(
				"[GridConfig] Default block size changed, existing widgets may need updates"
			);
		}

		if (path === "columns") {
			console.log(
				"[GridConfig] Grid columns changed, layouts may need reflow"
			);
		}

		// 🎯 NEW: Handle drag threshold configuration changes
		if (path.startsWith("dragThreshold")) {
			console.log(
				"[GridConfig] Drag threshold configuration changed, grids may need recalibration"
			);

			// Validate new threshold configuration
			const thresholdConfig = gridConfig.get("dragThreshold");
			const errors = validateDragThreshold(thresholdConfig);
			if (errors.length > 0) {
				console.warn(
					"[GridConfig] Invalid drag threshold configuration:",
					errors
				);
			}
		}
	});
}

// Auto-setup listeners when module loads
if (typeof window !== "undefined") {
	setupConfigurationListeners();
}

export default {
	normalizeConfig,
	validateConfig,
	createDefaultConfig,
	createDefaultWidget,
	updateWidgetDefaultSize,
	batchUpdateWidgetDefaults,
	getResponsiveConfig,
	setupConfigurationListeners,
	// 🎯 NEW: Export drag threshold utilities
	normalizeDragThreshold,
	validateDragThreshold,
};
