/**
 * @file GridRuntimeConfig.js
 * @description Normalizes and validates grid runtime configuration for the community release.
 * Pure utility functions with no dependencies - ready for community use.
 */

/**
 * Normalizes and validates grid configuration input
 * @param {object} input - Raw grid configuration
 * @returns {object} Normalized configuration
 */
export function normalizeConfig(input = {}) {
	const cfg = typeof input === "object" && input ? { ...input } : {};

	// Set sensible defaults
	cfg.columns =
		Number.isFinite(cfg.columns) && cfg.columns > 0
			? Math.floor(cfg.columns)
			: 24;
	cfg.gap = Number.isFinite(cfg.gap) && cfg.gap >= 0 ? cfg.gap : 16;
	cfg.blocks = Array.isArray(cfg.blocks) ? cfg.blocks : [];

	/**
	 * Normalize blocks array with validation and constraint enforcement
	 * @param {Array} blocks - Array of block configurations
	 * @returns {Array} Normalized blocks
	 */
	const normalizeBlocks = (blocks) => {
		const out = [];

		for (const raw of blocks || []) {
			// Ensure block has valid ID
			const id = String(raw?.id || raw?.blockId || "").trim();
			if (!id) continue;

			// Normalize position and size
			const x = clampInt(raw?.x ?? raw?.position?.x ?? 0, 0);
			const y = clampInt(raw?.y ?? raw?.position?.y ?? 0, 0);
			const w = clampInt(raw?.w ?? raw?.position?.w ?? 1, 1);
			const h = clampInt(raw?.h ?? raw?.position?.h ?? 1, 1);

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
 * Validate grid configuration
 * @param {object} config - Configuration to validate
 * @returns {object} Validation result with errors array
 */
export function validateConfig(config) {
	const errors = [];

	if (!config || typeof config !== "object") {
		errors.push("Configuration must be an object");
		return { valid: false, errors };
	}

	if (config.columns && (config.columns < 1 || config.columns > 100)) {
		errors.push("Columns must be between 1 and 100");
	}

	if (config.gap && config.gap < 0) {
		errors.push("Gap must be non-negative");
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
 * Create default grid configuration
 * @param {object} overrides - Configuration overrides
 * @returns {object} Default configuration
 */
export function createDefaultConfig(overrides = {}) {
	return normalizeConfig({
		columns: 24,
		gap: 16,
		blocks: [],
		...overrides,
	});
}

export default { normalizeConfig, validateConfig, createDefaultConfig };
