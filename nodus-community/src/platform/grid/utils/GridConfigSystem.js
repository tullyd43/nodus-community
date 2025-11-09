/**
 * GridConfigSystem
 * Lightweight centralized configuration used by the modern grid components.
 * This file provides a minimal, stable implementation so other modules can
 * depend on `gridConfig` without introducing runtime failures during builds.
 */

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
};

class GridConfigSystem {
	// Instance-private configuration store
	#config = { ...DEFAULTS };

	async initialize() {
		// Placeholder for async initialization (e.g., loading remote config)
		return Promise.resolve();
	}

	get(path) {
		if (!path) return this.#config;
		// Support nested keys like 'defaultBlockSize.w'
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
		// Emit a window event so listeners can react
		try {
			window.dispatchEvent(
				new CustomEvent("nodus-grid-config-changed", {
					detail: { path, value },
				})
			);
		} catch (e) {
			// ignore (server-side or test environments)
		}
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
}

export const gridConfig = new GridConfigSystem();

export default gridConfig;
