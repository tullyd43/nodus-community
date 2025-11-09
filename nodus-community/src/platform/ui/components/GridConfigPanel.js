/**
 * @file GridConfigPanel.js
 * @description User interface for configuring grid behavior
 * Follows composable platform principles
 */

import { gridConfig } from "../../grid/utils/GridConfigSystem.js";

export class GridConfigPanel {
	constructor(container) {
		this.container =
			typeof container === "string"
				? document.querySelector(container)
				: container;
		this.element = null;

		// Listen for config changes to update UI
		window.addEventListener("nodus-grid-config-changed", (e) => {
			this.updateUIFromConfig();
		});
	}

	/**
	 * Render the configuration panel
	 */
	async render() {
		await gridConfig.initialize();

		this.element = document.createElement("div");
		this.element.className = "nodus-grid-config-panel";
		this.element.innerHTML = this.getTemplate();

		this.container.appendChild(this.element);
		this.setupEventListeners();
		this.updateUIFromConfig();

		return this.element;
	}

	/**
	 * Get the panel HTML template
	 */
	getTemplate() {
		return `
			<div class="config-panel">
				<h3 class="config-panel-title">Grid Configuration</h3>
				
				<div class="config-section">
					<h4>Layout Settings</h4>
					
					<div class="config-row">
						<label for="grid-columns">Columns:</label>
						<input type="number" id="grid-columns" min="6" max="24" step="1">
						<span class="config-hint">Total grid columns (6-24)</span>
					</div>
					
					<div class="config-row">
						<label for="grid-gap">Gap:</label>
						<input type="number" id="grid-gap" min="0" max="50" step="2">
						<span class="config-hint">Space between blocks (px)</span>
					</div>
				</div>

				<div class="config-section">
					<h4>Default Block Size</h4>
					
					<div class="config-row">
						<label for="block-width">Width:</label>
						<input type="number" id="block-width" min="1" max="12" step="1">
						<span class="config-hint">Columns per new block</span>
					</div>
					
					<div class="config-row">
						<label for="block-height">Height:</label>
						<input type="number" id="block-height" min="1" max="6" step="1">
						<span class="config-hint">Rows per new block</span>
					</div>
					
					<div class="config-row">
						<button id="make-square" class="secondary-btn">Make Square</button>
						<span class="config-hint">Set height = width for square blocks</span>
					</div>
				</div>

				<div class="config-section">
					<h4>Behavior Settings</h4>
					
					<div class="config-row">
						<label class="checkbox-label">
							<input type="checkbox" id="enable-reflow">
							<span class="checkmark"></span>
							Enable Auto-Reflow
						</label>
						<span class="config-hint">Blocks automatically rearrange when dragged</span>
					</div>
					
					<div class="config-row">
						<label class="checkbox-label">
							<input type="checkbox" id="enable-interactions">
							<span class="checkmark"></span>
							Enable Interactions
						</label>
						<span class="config-hint">Allow dragging and resizing blocks</span>
					</div>
					
					<div class="config-row">
						<label class="checkbox-label">
							<input type="checkbox" id="enable-animations">
							<span class="checkmark"></span>
							Enable Animations
						</label>
						<span class="config-hint">Smooth transitions during layout changes</span>
					</div>
				</div>

				<div class="config-section">
					<h4>Performance</h4>
					
					<div class="config-row">
						<label for="max-reflow-widgets">Max Live Reflow:</label>
						<input type="number" id="max-reflow-widgets" min="10" max="200" step="10">
						<span class="config-hint">Disable reflow above this widget count</span>
					</div>
				</div>

				<div class="config-actions">
					<button id="reset-defaults" class="danger-btn">Reset to Defaults</button>
					<button id="export-config" class="secondary-btn">Export Config</button>
				</div>
			</div>

			<style>
				.config-panel {
					background: #ffffff;
					border: 1px solid #e5e7eb;
					border-radius: 8px;
					padding: 20px;
					max-width: 400px;
					font-family: system-ui, sans-serif;
				}

				.config-panel-title {
					margin: 0 0 20px 0;
					font-size: 18px;
					font-weight: 600;
					color: #111827;
				}

				.config-section {
					margin-bottom: 24px;
					border-bottom: 1px solid #f3f4f6;
					padding-bottom: 16px;
				}

				.config-section:last-of-type {
					border-bottom: none;
				}

				.config-section h4 {
					margin: 0 0 12px 0;
					font-size: 14px;
					font-weight: 600;
					color: #374151;
					text-transform: uppercase;
					letter-spacing: 0.025em;
				}

				.config-row {
					display: flex;
					align-items: center;
					gap: 8px;
					margin-bottom: 12px;
				}

				.config-row label {
					min-width: 80px;
					font-size: 14px;
					color: #374151;
					font-weight: 500;
				}

				.config-row input[type="number"] {
					width: 80px;
					padding: 6px 8px;
					border: 1px solid #d1d5db;
					border-radius: 4px;
					font-size: 14px;
				}

				.config-hint {
					font-size: 12px;
					color: #6b7280;
					flex: 1;
				}

				.checkbox-label {
					display: flex !important;
					align-items: center;
					gap: 8px;
					min-width: auto !important;
					cursor: pointer;
				}

				.checkbox-label input[type="checkbox"] {
					margin: 0;
				}

				.secondary-btn, .danger-btn {
					padding: 6px 12px;
					border-radius: 4px;
					border: 1px solid;
					cursor: pointer;
					font-size: 13px;
					font-weight: 500;
				}

				.secondary-btn {
					background: #f9fafb;
					border-color: #d1d5db;
					color: #374151;
				}

				.secondary-btn:hover {
					background: #f3f4f6;
				}

				.danger-btn {
					background: #fef2f2;
					border-color: #fecaca;
					color: #dc2626;
				}

				.danger-btn:hover {
					background: #fee2e2;
				}

				.config-actions {
					display: flex;
					gap: 8px;
					justify-content: space-between;
					margin-top: 20px;
				}
			</style>
		`;
	}

	/**
	 * Setup event listeners
	 */
	setupEventListeners() {
		// Layout settings
		this.element
			.querySelector("#grid-columns")
			.addEventListener("change", (e) => {
				gridConfig.set("columns", parseInt(e.target.value));
			});

		this.element
			.querySelector("#grid-gap")
			.addEventListener("change", (e) => {
				gridConfig.set("gap", parseInt(e.target.value));
			});

		// Block size settings
		this.element
			.querySelector("#block-width")
			.addEventListener("change", (e) => {
				gridConfig.set("defaultBlockSize.w", parseInt(e.target.value));
			});

		this.element
			.querySelector("#block-height")
			.addEventListener("change", (e) => {
				gridConfig.set("defaultBlockSize.h", parseInt(e.target.value));
			});

		this.element
			.querySelector("#make-square")
			.addEventListener("click", () => {
				const width = gridConfig.get("defaultBlockSize.w");
				gridConfig.set("defaultBlockSize.h", width);
			});

		// Behavior settings
		this.element
			.querySelector("#enable-reflow")
			.addEventListener("change", (e) => {
				gridConfig.set("float", !e.target.checked); // float=false means reflow enabled
			});

		this.element
			.querySelector("#enable-interactions")
			.addEventListener("change", (e) => {
				gridConfig.set("staticGrid", !e.target.checked); // staticGrid=false means interactions enabled
			});

		this.element
			.querySelector("#enable-animations")
			.addEventListener("change", (e) => {
				gridConfig.set("animate", e.target.checked);
			});

		// Performance settings
		this.element
			.querySelector("#max-reflow-widgets")
			.addEventListener("change", (e) => {
				gridConfig.set(
					"maxLiveReflowWidgets",
					parseInt(e.target.value)
				);
			});

		// Actions
		this.element
			.querySelector("#reset-defaults")
			.addEventListener("click", () => {
				this.resetToDefaults();
			});

		this.element
			.querySelector("#export-config")
			.addEventListener("click", () => {
				this.exportConfig();
			});
	}

	/**
	 * Update UI elements from current config
	 */
	updateUIFromConfig() {
		if (!this.element) return;

		// Layout settings
		this.element.querySelector("#grid-columns").value =
			gridConfig.get("columns");
		this.element.querySelector("#grid-gap").value = gridConfig.get("gap");

		// Block size settings
		this.element.querySelector("#block-width").value =
			gridConfig.get("defaultBlockSize.w");
		this.element.querySelector("#block-height").value =
			gridConfig.get("defaultBlockSize.h");

		// Behavior settings
		this.element.querySelector("#enable-reflow").checked =
			!gridConfig.get("float");
		this.element.querySelector("#enable-interactions").checked =
			!gridConfig.get("staticGrid");
		this.element.querySelector("#enable-animations").checked =
			gridConfig.get("animate");

		// Performance settings
		this.element.querySelector("#max-reflow-widgets").value =
			gridConfig.get("maxLiveReflowWidgets");
	}

	/**
	 * Reset to default configuration
	 */
	async resetToDefaults() {
		if (
			confirm(
				"Reset all grid settings to defaults? This cannot be undone."
			)
		) {
			// Reset config to defaults
			for (const [key, value] of Object.entries(
				gridConfig.DEFAULT_CONFIG
			)) {
				await gridConfig.set(key, value);
			}

			this.updateUIFromConfig();
		}
	}

	/**
	 * Export configuration as JSON
	 */
	exportConfig() {
		const config = {
			...gridConfig.get(""),
			exported: new Date().toISOString(),
		};

		const blob = new Blob([JSON.stringify(config, null, 2)], {
			type: "application/json",
		});

		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "nodus-grid-config.json";
		a.click();

		URL.revokeObjectURL(url);
	}
}

export default GridConfigPanel;
