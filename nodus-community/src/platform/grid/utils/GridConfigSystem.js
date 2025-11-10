/**
 * GridConfigSystem
 * Lightweight centralized configuration with an extensible drag threshold system
 */

import { getKV, setKV } from "../../storage/indexeddb.js";

const DEFAULTS = {
	columns: 12,
	gap: 8,
	cellHeight: 80,
	float: false,
	staticGrid: false,
	animate: true,
	maxLiveReflowWidgets: 50,
	reflowThrottleMs: 32,
	defaultBlockSize: { w: 2, h: 2 },

	// 🎯 NEW: Configurable drag threshold system
	dragThreshold: {
		// Calculation method: 'round' (50%), 'floor' (33%), 'ceil' (67%), 'custom'
		method: "round",

		// Custom threshold percentage (0.0-1.0) when method === 'custom'
		percentage: 0.5,

		// Per-direction sensitivity (advanced users)
		directional: {
			enabled: false,
			horizontal: 0.5, // Left-right threshold
			vertical: 0.5, // Up-down threshold
		},

		// User preference presets
		preset: "balanced", // 'precise', 'balanced', 'loose', 'custom'

		// Plugin extension point
		customCalculator: null, // Function(relativePos, cellSize) => gridIndex
	},

	// Performance and user experience settings
	dragSensitivity: {
		enabled: true,
		deadZone: 3, // Pixels before drag starts
		snapDistance: 8, // Pixels for magnetic snap
	},
};

class GridConfigSystem {
	// Instance-private configuration store
	#config = { ...DEFAULTS };
	#pluginCalculators = new Map(); // Plugin registry

	async initialize() {
		// Load user preferences from backend/storage
		try {
			const userConfig = await this.#loadUserPreferences();
			if (userConfig) {
				this.#mergeConfig(userConfig);
			}
		} catch (error) {
			console.warn(
				"[GridConfig] Failed to load user preferences:",
				error
			);
		}

		return Promise.resolve();
	}

	get(path) {
		if (!path) return this.#config;
		// Support nested keys like 'dragThreshold.method'
		const parts = path.split(".");
		let cur = this.#config;
		for (const p of parts) {
			if (cur == null) return undefined;
			cur = cur[p];
		}
		return cur;
	}

	set(path, value) {
		const parts = path.split(".");
		let cur = this.#config;
		for (let i = 0; i < parts.length - 1; i++) {
			const p = parts[i];
			if (!cur[p]) cur[p] = {};
			cur = cur[p];
		}
		cur[parts[parts.length - 1]] = value;

		// Validate drag threshold changes
		if (path.startsWith("dragThreshold")) {
			this.#validateDragThreshold();
		}

		// Emit a window event so listeners can react
		try {
			window.dispatchEvent(
				new CustomEvent("nodus-grid-config-changed", {
					detail: { path, value, config: this.#config },
				})
			);
		} catch (e) {
			// ignore (server-side or test environments)
		}

		// Persist user preferences
		this.#persistUserPreferences();

		return value;
	}

	getDefaultBlockSize() {
		return this.#config.defaultBlockSize || { w: 2, h: 2 };
	}

	setDefaultBlockSize(w, h) {
		this.#config.defaultBlockSize = { w, h };
		this.set("defaultBlockSize.w", w);
		this.set("defaultBlockSize.h", h);
	}

	/**
	 * 🎯 NEW: Get drag threshold calculator function (EXTENSIBLE)
	 * Follows Extensibility and Composability principles
	 *
	 * @param {string} direction - 'horizontal' or 'vertical'
	 * @returns {Function} Calculator function
	 */
	getDragThresholdCalculator(direction = "horizontal") {
		const config = this.#config.dragThreshold;

		// Plugin override (EXTENSIBILITY)
		if (
			config.customCalculator &&
			typeof config.customCalculator === "function"
		) {
			return config.customCalculator;
		}

		// Registered plugin calculator
		if (this.#pluginCalculators.has(config.method)) {
			return this.#pluginCalculators.get(config.method);
		}

		// Directional sensitivity (ADVANCED USERS)
		if (config.directional.enabled) {
			const threshold =
				direction === "horizontal"
					? config.directional.horizontal
					: config.directional.vertical;
			return (relativePos, cellSize) =>
				relativePos >= cellSize * threshold
					? Math.ceil(relativePos / cellSize)
					: Math.floor(relativePos / cellSize);
		}

		// Standard calculation methods (SIMPLE USERS)
		switch (config.method) {
			case "round":
				return (relativePos, cellSize) =>
					Math.round(relativePos / cellSize);
			case "floor":
				return (relativePos, cellSize) =>
					Math.floor(relativePos / cellSize);
			case "ceil":
				return (relativePos, cellSize) =>
					Math.ceil(relativePos / cellSize);
			case "custom":
				return (relativePos, cellSize) =>
					relativePos >= cellSize * config.percentage
						? Math.ceil(relativePos / cellSize)
						: Math.floor(relativePos / cellSize);
			default:
				return (relativePos, cellSize) =>
					Math.round(relativePos / cellSize);
		}
	}

	/**
	 * 🎯 NEW: Plugin registration for drag calculators (EXTENSIBILITY)
	 */
	registerDragCalculator(name, calculatorFunction) {
		if (typeof calculatorFunction !== "function") {
			throw new Error("Calculator must be a function");
		}
		this.#pluginCalculators.set(name, calculatorFunction);

		window.dispatchEvent(
			new CustomEvent("nodus-grid-plugin-registered", {
				detail: { type: "dragCalculator", name },
			})
		);
	}

	/**
	 * 🎯 NEW: Set drag sensitivity preset (SIMPLICITY)
	 */
	setDragSensitivityPreset(preset) {
		const presets = {
			precise: { method: "custom", percentage: 0.75 }, // Need 75% to switch
			balanced: { method: "round", percentage: 0.5 }, // Standard 50%
			loose: { method: "custom", percentage: 0.25 }, // Only need 25% to switch
			custom: { method: "custom", percentage: 0.5 }, // User configurable
		};

		if (!presets[preset]) {
			throw new Error(`Unknown preset: ${preset}`);
		}

		this.set("dragThreshold.preset", preset);
		this.set("dragThreshold.method", presets[preset].method);
		this.set("dragThreshold.percentage", presets[preset].percentage);
	}

	/**
	 * 🎯 NEW: Get current drag threshold info for UI display (TRANSPARENCY)
	 */
	getDragThresholdInfo() {
		const config = this.#config.dragThreshold;

		return {
			method: config.method,
			percentage: this.#getEffectiveThreshold(),
			preset: config.preset,
			directional: config.directional.enabled,
			description: this.#getThresholdDescription(),
		};
	}

	/**
	 * Validate drag threshold configuration (ROBUSTNESS)
	 */
	#validateDragThreshold() {
		const config = this.#config.dragThreshold;

		// Clamp percentage to valid range
		if (config.percentage < 0 || config.percentage > 1) {
			config.percentage = Math.max(0, Math.min(1, config.percentage));
		}

		// Validate directional thresholds
		if (config.directional.enabled) {
			config.directional.horizontal = Math.max(
				0,
				Math.min(1, config.directional.horizontal)
			);
			config.directional.vertical = Math.max(
				0,
				Math.min(1, config.directional.vertical)
			);
		}

		// Ensure valid method
		const validMethods = ["round", "floor", "ceil", "custom"];
		if (!validMethods.includes(config.method)) {
			config.method = "round";
		}
	}

	/**
	 * Get effective threshold percentage for current settings
	 */
	#getEffectiveThreshold() {
		const config = this.#config.dragThreshold;

		switch (config.method) {
			case "round":
				return 0.5;
			case "floor":
				return 0.33;
			case "ceil":
				return 0.67;
			case "custom":
				return config.percentage;
			default:
				return 0.5;
		}
	}

	/**
	 * Get human-readable description of current threshold
	 */
	#getThresholdDescription() {
		const config = this.#config.dragThreshold;
		const percentage = Math.round(this.#getEffectiveThreshold() * 100);

		if (config.directional.enabled) {
			const hPercent = Math.round(config.directional.horizontal * 100);
			const vPercent = Math.round(config.directional.vertical * 100);
			return `${hPercent}% horizontal, ${vPercent}% vertical`;
		}

		switch (config.preset) {
			case "precise":
				return `Precise (${percentage}% threshold)`;
			case "balanced":
				return `Balanced (${percentage}% threshold)`;
			case "loose":
				return `Loose (${percentage}% threshold)`;
			case "custom":
				return `Custom (${percentage}% threshold)`;
			default:
				return `${percentage}% threshold`;
		}
	}

	/**
	 * Load user preferences from storage (PERSISTENCE)
	 */
	async #loadUserPreferences() {
		try {
			// Try IndexedDB first (faster)
			if (typeof indexedDB !== "undefined") {
				try {
					// Use the shared KV store to load preferences (namespace by scope)
					const key = "preferences:grid.dragThreshold";
					const stored = await getKV(key);
					if (stored) return stored;
				} catch (err) {
					// Ignore KV lookup errors and fall back
					console.warn("[GridConfig] IndexedDB KV read failed:", err);
				}
			}

			// Don't call backend for preferences by default. Preferences
			// are stored locally in IndexedDB KV store to avoid noisy
			// handler-not-found errors on hosts without a preferences API.
			return null;
		} catch (error) {
			console.warn("[GridConfig] Failed to load preferences:", error);
		}

		return null;
	}

	/**
	 * Persist user preferences to storage (PERSISTENCE)
	 */
	async #persistUserPreferences() {
		try {
			const preferences = {
				dragThreshold: this.#config.dragThreshold,
				dragSensitivity: this.#config.dragSensitivity,
			};

			// Save to IndexedDB for immediate access
			if (typeof indexedDB !== "undefined") {
				try {
					const key = "preferences:grid.dragThreshold";
					await setKV(key, preferences);
				} catch (err) {
					console.warn(
						"[GridConfig] IndexedDB KV write failed:",
						err
					);
				}
			}

			// Background sync to backend intentionally disabled to avoid
			// dispatching actions that may not be implemented. If you want
			// server-side preferences, add a backend handler for
			// `user.preferences.get/set` and re-enable this section.
		} catch (error) {
			console.warn("[GridConfig] Failed to persist preferences:", error);
		}
	}

	/**
	 * Merge user configuration with defaults (ROBUSTNESS)
	 */
	#mergeConfig(userConfig) {
		if (!userConfig || typeof userConfig !== "object") return;

		// Deep merge with validation
		if (userConfig.dragThreshold) {
			this.#config.dragThreshold = {
				...this.#config.dragThreshold,
				...userConfig.dragThreshold,
			};
			this.#validateDragThreshold();
		}

		if (userConfig.dragSensitivity) {
			this.#config.dragSensitivity = {
				...this.#config.dragSensitivity,
				...userConfig.dragSensitivity,
			};
		}
	}
}

export const gridConfig = new GridConfigSystem();

export default gridConfig;
