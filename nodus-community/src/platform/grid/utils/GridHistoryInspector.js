/**
 * @file GridHistoryInspector.js
 * @description Simplified grid history visualization for community release.
 * Uses Rust backend via ActionDispatcher for undo/redo functionality.
 */
import { ActionDispatcher } from "@platform/ActionDispatcher.js";

/**
 * @class GridHistoryInspector
 * @classdesc Visual overlay showing grid history state and providing undo/redo controls.
 * Simplified from enterprise version to use ActionDispatcher proxy pattern.
 */
export class GridHistoryInspector {
	/** @private @type {ActionDispatcher} */
	#actionDispatcher;
	/** @private @type {HTMLElement|null} */
	#element = null;
	/** @private @type {boolean} */
	#visible = false;
	/** @private @type {object} */
	#historyState = { undoCount: 0, redoCount: 0, lastOperation: null };

	/**
	 * Creates a GridHistoryInspector instance
	 * @param {object} config - Configuration object
	 * @param {ActionDispatcher} [config.actionDispatcher] - ActionDispatcher instance
	 * @param {AsyncOrchestrator} [config.orchestrator] - AsyncOrchestrator instance
	 */
	constructor(config = {}) {
		this.#actionDispatcher =
			config.actionDispatcher || new ActionDispatcher();
	}

	/**
	 * Initialize the history inspector
	 * @public
	 * @returns {Promise<void>}
	 */
	async initialize() {
		this.#buildUI();
		this.#setupKeyboardShortcuts();
		await this.#refreshHistoryState();

		// Notify Rust backend
		await this.#actionDispatcher.dispatch(
			"grid.history.inspector.initialized",
			{
				hotkey: "Alt+H",
			}
		);
	}

	/**
	 * Toggle inspector visibility
	 * @public
	 */
	toggle() {
		this.#visible = !this.#visible;
		if (!this.#element) this.#buildUI();

		this.#element.style.display = this.#visible ? "block" : "none";

		if (this.#visible) {
			this.#refreshHistoryState();
		}
	}

	/**
	 * Record an action in history
	 * @public
	 * @param {string} actionType - Type of action performed
	 * @param {object} data - Action data
	 * @returns {Promise<void>}
	 */
	async recordAction(actionType, data = {}) {
		await this.#actionDispatcher.dispatch("grid.history.record", {
			actionType,
			data,
			timestamp: new Date().toISOString(),
		});

		// Update display if visible
		if (this.#visible) {
			await this.#refreshHistoryState();
		}
	}

	/**
	 * Perform undo operation
	 * @public
	 * @returns {Promise<boolean>} Success status
	 */
	async undo() {
		try {
			const result = await this.#actionDispatcher.dispatch(
				"grid.history.undo",
				{}
			);
			await this.#refreshHistoryState();
			return result.success || false;
		} catch (error) {
			console.error("[GridHistoryInspector] Undo failed:", error);
			return false;
		}
	}

	/**
	 * Perform redo operation
	 * @public
	 * @returns {Promise<boolean>} Success status
	 */
	async redo() {
		try {
			const result = await this.#actionDispatcher.dispatch(
				"grid.history.redo",
				{}
			);
			await this.#refreshHistoryState();
			return result.success || false;
		} catch (error) {
			console.error("[GridHistoryInspector] Redo failed:", error);
			return false;
		}
	}

	/**
	 * Build the UI overlay
	 * @private
	 */
	#buildUI() {
		if (this.#element) return;

		const element = document.createElement("div");
		element.id = "grid-history-inspector";
		element.className = "nodus-history-inspector";

		// Base styles
		Object.assign(element.style, {
			position: "fixed",
			right: "20px",
			bottom: "80px", // Above potential toast notifications
			zIndex: "10001",
			background: "rgba(30, 30, 30, 0.95)",
			color: "#ffffff",
			padding: "16px",
			borderRadius: "8px",
			fontFamily: "system-ui, -apple-system, sans-serif",
			fontSize: "13px",
			boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
			display: "none",
			minWidth: "220px",
			backdropFilter: "blur(8px)",
		});

		element.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <strong style="color: #60a5fa;">Grid History</strong>
                <button id="history-close" style="
                    background: #374151;
                    color: #ffffff;
                    border: none;
                    border-radius: 4px;
                    padding: 4px 8px;
                    cursor: pointer;
                    font-size: 12px;
                ">×</button>
            </div>
            
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                <button id="history-undo" style="
                    background: #3b82f6;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 6px 10px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                " title="Undo (Ctrl/Cmd+Z)">⟲ Undo</button>
                <button id="history-redo" style="
                    background: #3b82f6;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 6px 10px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                " title="Redo (Ctrl/Cmd+Y)">⟳ Redo</button>
            </div>
            
            <div style="margin-bottom: 8px;">
                <span style="color: #9ca3af;">Undo:</span> 
                <span id="history-undo-count" style="color: #10b981; font-weight: 600;">0</span>
            </div>
            <div style="margin-bottom: 8px;">
                <span style="color: #9ca3af;">Redo:</span> 
                <span id="history-redo-count" style="color: #f59e0b; font-weight: 600;">0</span>
            </div>
            <div style="margin-bottom: 12px;">
                <span style="color: #9ca3af;">Last:</span> 
                <span id="history-last-action" style="color: #60a5fa;">—</span>
            </div>
            
            <div style="border-top: 1px solid #374151; padding-top: 8px; margin-top: 8px;">
                <div style="color: #9ca3af; font-size: 11px; margin-bottom: 4px;">Recent Operations:</div>
                <div id="history-recent-list" style="
                    max-height: 80px;
                    overflow-y: auto;
                    font-size: 11px;
                    color: #d1d5db;
                "></div>
            </div>
            
            <div style="
                text-align: center;
                margin-top: 12px;
                padding-top: 8px;
                border-top: 1px solid #374151;
                color: #6b7280;
                font-size: 11px;
            ">
                Toggle: Alt+H
            </div>
        `;

		// Attach event listeners
		element
			.querySelector("#history-close")
			.addEventListener("click", () => {
				this.toggle();
			});

		element
			.querySelector("#history-undo")
			.addEventListener("click", async () => {
				const success = await this.undo();
				if (!success) {
					this.#showError("Undo failed");
				}
			});

		element
			.querySelector("#history-redo")
			.addEventListener("click", async () => {
				const success = await this.redo();
				if (!success) {
					this.#showError("Redo failed");
				}
			});

		document.body.appendChild(element);
		this.#element = element;
	}

	/**
	 * Setup keyboard shortcuts
	 * @private
	 */
	#setupKeyboardShortcuts() {
		document.addEventListener("keydown", async (e) => {
			// Alt+H: Toggle history inspector
			if (e.altKey && e.key.toLowerCase() === "h") {
				e.preventDefault();
				this.toggle();
				return;
			}

			// Ctrl/Cmd+Z: Undo
			if (
				(e.ctrlKey || e.metaKey) &&
				e.key.toLowerCase() === "z" &&
				!e.shiftKey
			) {
				e.preventDefault();
				await this.undo();
				return;
			}

			// Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z: Redo
			if (
				((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
				((e.ctrlKey || e.metaKey) &&
					e.shiftKey &&
					e.key.toLowerCase() === "z")
			) {
				e.preventDefault();
				await this.redo();
				return;
			}
		});
	}

	/**
	 * Refresh history state from Rust backend
	 * @private
	 * @returns {Promise<void>}
	 */
	async #refreshHistoryState() {
		try {
			const historyState =
				(await this.#actionDispatcher.dispatch(
					"grid.history.get_state",
					{}
				)) || {};

			this.#historyState = {
				undoCount: historyState.undoCount || 0,
				redoCount: historyState.redoCount || 0,
				lastOperation: historyState.lastOperation || null,
				recentOperations: historyState.recentOperations || [],
			};

			this.#updateDisplay();
		} catch (error) {
			console.warn(
				"[GridHistoryInspector] Failed to refresh history state:",
				error
			);
			// Use fallback state
			this.#updateDisplay();
		}
	}

	/**
	 * Update the display with current history state
	 * @private
	 */
	#updateDisplay() {
		if (!this.#element || !this.#visible) return;

		// Update counts
		this.#element.querySelector("#history-undo-count").textContent = String(
			this.#historyState.undoCount
		);
		this.#element.querySelector("#history-redo-count").textContent = String(
			this.#historyState.redoCount
		);

		// Update last operation
		this.#element.querySelector("#history-last-action").textContent =
			this.#historyState.lastOperation || "—";

		// Update recent operations list
		const recentList = this.#element.querySelector("#history-recent-list");
		recentList.innerHTML = "";

		if (this.#historyState.recentOperations?.length > 0) {
			this.#historyState.recentOperations.slice(-5).forEach((op) => {
				const item = document.createElement("div");
				item.textContent = `• ${op}`;
				item.style.cssText = "margin: 2px 0; opacity: 0.8;";
				recentList.appendChild(item);
			});
		} else {
			const item = document.createElement("div");
			item.textContent = "No recent operations";
			item.style.cssText =
				"margin: 2px 0; opacity: 0.5; font-style: italic;";
			recentList.appendChild(item);
		}

		// Update button states
		const undoBtn = this.#element.querySelector("#history-undo");
		const redoBtn = this.#element.querySelector("#history-redo");

		undoBtn.disabled = this.#historyState.undoCount === 0;
		redoBtn.disabled = this.#historyState.redoCount === 0;

		undoBtn.style.opacity = undoBtn.disabled ? "0.5" : "1";
		redoBtn.style.opacity = redoBtn.disabled ? "0.5" : "1";
	}

	/**
	 * Show temporary error message
	 * @private
	 * @param {string} message - Error message
	 */
	#showError(message) {
		// Create temporary error overlay
		const error = document.createElement("div");
		error.textContent = message;
		error.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            background: #ef4444;
            color: white;
            padding: 4px 8px;
            font-size: 11px;
            text-align: center;
            border-radius: 4px 4px 0 0;
        `;

		this.#element.appendChild(error);

		setTimeout(() => {
			if (error.parentNode) {
				error.parentNode.removeChild(error);
			}
		}, 2000);
	}

	/**
	 * Dispose of the history inspector
	 * @public
	 */
	dispose() {
		if (this.#element?.parentNode) {
			this.#element.parentNode.removeChild(this.#element);
		}
		this.#element = null;
		this.#visible = false;
	}
}

export default GridHistoryInspector;
