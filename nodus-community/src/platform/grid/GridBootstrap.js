/**
 * @file GridBootstrap.js
 * @description A lightweight, adaptive grid renderer that uses Rust backend for storage.
 * Converted from enterprise version to use ActionDispatcher proxy pattern.
 */
import { ActionDispatcher } from "@platform/ActionDispatcher.js";
import { AsyncOrchestrator } from "@platform/AsyncOrchestrator.js";

/**
 * @class GridBootstrap
 * @classdesc Manages the rendering and basic interaction for a simple, adaptive grid of items.
 * Now uses Rust backend for storage and security through ActionDispatcher.
 */
export class GridBootstrap {
	/** @private @type {HTMLElement} */
	#container;
	/** @private @type {ActionDispatcher} */
	#actionDispatcher;
	/** @private @type {AsyncOrchestrator} */
	#orchestrator;
	/** @private @type {Map<string, HTMLElement>} */
	#cells = new Map();
	/** @private @type {object} */
	#options;
	/** @private @type {Function[]} */
	#eventListeners = [];

	/**
	 * Creates an instance of GridBootstrap.
	 * @param {HTMLElement} container - The DOM element that will contain the grid.
	 * @param {object} [options={}] - Configuration options for the grid.
	 */
	constructor(container, options = {}) {
		this.#container = container;

		// Use ActionDispatcher and AsyncOrchestrator proxies (route to Rust)
		this.#actionDispatcher = new ActionDispatcher();
		this.#orchestrator = new AsyncOrchestrator();

		this.#options = Object.assign(
			{
				defaultClassification: "PUBLIC", // Community: simple classification
				storeName: "grid_items", // Storage identifier for Rust backend
				minCols: 2,
				maxCols: 6,
				density: "normal", // compact | normal | spacious
				responsive: true,
			},
			options
		);

		if (this.#options.responsive) {
			this.#initAdaptiveListeners();
		}
	}

	/**
	 * Fetches data from Rust storage and renders the grid cells.
	 * @public
	 * @returns {Promise<void>}
	 */
	async render() {
		try {
			// Clear existing content
			this.#container.textContent = "";
			this.#container.classList.add("nodus-grid");

			// Fetch items from Rust backend through ActionDispatcher
			const items = await this.#loadItems();

			// Render each item as a grid cell
			for (const item of items) {
				const cell = await this.#createGridCell(item);
				this.#container.appendChild(cell);
				this.#cells.set(item.id, cell);
			}

			// Apply responsive layout
			this.updateGridTemplate();

			console.log(`[GridBootstrap] Rendered ${items.length} items`);
		} catch (error) {
			console.error("[GridBootstrap] Render failed:", error);
			this.#renderError("Failed to load grid items");
		}
	}

	/**
	 * Load items from Rust storage via ActionDispatcher
	 * @private
	 * @returns {Promise<Array>}
	 */
	async #loadItems() {
		try {
			// Route to Rust storage through ActionDispatcher
			const result = await this.#actionDispatcher.dispatch(
				"storage.query",
				{
					store: this.#options.storeName,
					filter: {
						classification: this.#options.defaultClassification,
					},
				}
			);

			return result.items || [];
		} catch (error) {
			console.warn(
				"[GridBootstrap] Storage query failed, using fallback"
			);
			// Fallback: try simple get
			try {
				const fallbackResult = await this.#actionDispatcher.dispatch(
					"storage.get",
					{
						key: this.#options.storeName,
					}
				);
				return Array.isArray(fallbackResult) ? fallbackResult : [];
			} catch (fallbackError) {
				console.error(
					"[GridBootstrap] Fallback storage failed:",
					fallbackError
				);
				return [];
			}
		}
	}

	/**
	 * Create a grid cell element for an item
	 * @private
	 * @param {object} item - The data item
	 * @returns {Promise<HTMLElement>}
	 */
	async #createGridCell(item) {
		const cell = document.createElement("div");
		cell.classList.add("grid-cell", `density-${this.#options.density}`);
		cell.dataset.entityId = item.id;
		cell.dataset.action = "grid.cell.select"; // For ActionDispatcher handling
		cell.dataset.actionPayload = JSON.stringify({ itemId: item.id });
		cell.draggable = true;

		// Apply security styling if item has classification
		if (item.classification) {
			this.#applyClassificationStyle(cell, item.classification);
		}

		// Create header
		const header = document.createElement("header");
		header.textContent =
			item.display_name || item.title || `Item ${item.id}`;
		cell.appendChild(header);

		// Create content section
		const section = document.createElement("section");
		section.textContent =
			item.content?.details ||
			item.description ||
			"No details available.";
		cell.appendChild(section);

		// Attach event handlers
		this.#attachCellEvents(cell, item);

		return cell;
	}

	/**
	 * Apply classification styling (works for both community and enterprise)
	 * @private
	 * @param {HTMLElement} cell
	 * @param {string} classification
	 */
	#applyClassificationStyle(cell, classification) {
		const styles = {
			PUBLIC: { borderColor: "#10b981", background: "#f0fdf4" },
			INTERNAL: { borderColor: "#f59e0b", background: "#fefbf3" },
			CONFIDENTIAL: { borderColor: "#ef4444", background: "#fef2f2" },
			SECRET: {
				borderColor: "#7c2d12",
				background: "#1c1917",
				color: "#fbbf24",
			},
		};

		const style = styles[classification] || styles.PUBLIC;
		Object.assign(cell.style, {
			borderLeft: `4px solid ${style.borderColor}`,
			background: style.background,
			color: style.color || "inherit",
		});

		// Add classification badge
		if (classification !== "PUBLIC") {
			const badge = document.createElement("span");
			badge.textContent = classification;
			badge.className = "classification-badge";
			badge.style.cssText = `
				position: absolute;
				top: 4px;
				right: 4px;
				background: ${style.borderColor};
				color: white;
				padding: 2px 6px;
				font-size: 10px;
				border-radius: 2px;
				font-weight: bold;
			`;
			cell.style.position = "relative";
			cell.appendChild(badge);
		}
	}

	/**
	 * Updates the grid container's CSS grid template based on the number of cells.
	 * @public
	 * @returns {void}
	 */
	updateGridTemplate() {
		const cellCount = this.#cells.size || 1;
		const cols = Math.min(
			this.#options.maxCols,
			Math.max(this.#options.minCols, Math.ceil(Math.sqrt(cellCount)))
		);

		this.#container.style.display = "grid";
		this.#container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
		this.#container.style.gap = this.#computeGap();
	}

	/**
	 * Attaches event listeners for click and drag-and-drop operations to a grid cell.
	 * @private
	 * @param {HTMLElement} cell - The DOM element for the grid cell.
	 * @param {object} item - The data item associated with the cell.
	 * @returns {void}
	 */
	#attachCellEvents(cell, item) {
		// Click event - emit through ActionDispatcher for Rust backend
		const clickHandler = async () => {
			try {
				await this.#actionDispatcher.dispatch("grid.cell.selected", {
					item: item,
					cellId: item.id,
				});

				// Visual feedback
				this.#highlightCell(cell);
			} catch (error) {
				console.error("[GridBootstrap] Cell selection failed:", error);
			}
		};

		// Drag start event
		const dragStartHandler = async (e) => {
			e.dataTransfer.setData("application/nodus-cell", item.id);
			e.dataTransfer.effectAllowed = "move";

			try {
				await this.#actionDispatcher.dispatch("grid.cell.dragstart", {
					item: item,
					sourceId: item.id,
				});
			} catch (error) {
				console.error("[GridBootstrap] Drag start failed:", error);
			}
		};

		// Drop event
		const dropHandler = async (e) => {
			e.preventDefault();
			const draggedId = e.dataTransfer.getData("application/nodus-cell");

			if (draggedId && draggedId !== item.id) {
				try {
					await this.#actionDispatcher.dispatch("grid.cell.dropped", {
						fromId: draggedId,
						toId: item.id,
						sourceItem: item,
					});

					// Visual feedback for successful drop
					this.#flashCell(cell, "#10b981");
				} catch (error) {
					console.error("[GridBootstrap] Drop failed:", error);
					this.#flashCell(cell, "#ef4444");
				}
			}
		};

		// Allow drop
		const dragOverHandler = (e) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
		};

		// Attach all event listeners
		cell.addEventListener("click", clickHandler);
		cell.addEventListener("dragstart", dragStartHandler);
		cell.addEventListener("drop", dropHandler);
		cell.addEventListener("dragover", dragOverHandler);

		// Store listeners for cleanup
		this.#eventListeners.push(
			{ element: cell, event: "click", handler: clickHandler },
			{ element: cell, event: "dragstart", handler: dragStartHandler },
			{ element: cell, event: "drop", handler: dropHandler },
			{ element: cell, event: "dragover", handler: dragOverHandler }
		);
	}

	/**
	 * Highlight a cell (visual feedback)
	 * @private
	 * @param {HTMLElement} cell
	 */
	#highlightCell(cell) {
		cell.style.boxShadow = "0 0 8px rgba(59, 130, 246, 0.5)";
		setTimeout(() => {
			cell.style.boxShadow = "";
		}, 300);
	}

	/**
	 * Flash cell with color (visual feedback)
	 * @private
	 * @param {HTMLElement} cell
	 * @param {string} color
	 */
	#flashCell(cell, color) {
		const originalBorder = cell.style.border;
		cell.style.border = `2px solid ${color}`;
		setTimeout(() => {
			cell.style.border = originalBorder;
		}, 500);
	}

	/**
	 * Computes the CSS gap value based on the configured density.
	 * @private
	 * @returns {string} The CSS gap value (e.g., '1rem').
	 */
	#computeGap() {
		switch (this.#options.density) {
			case "compact":
				return "0.25rem";
			case "spacious":
				return "1.5rem";
			default:
				return "1rem";
		}
	}

	/**
	 * Initializes listeners for responsive behavior.
	 * @private
	 * @returns {void}
	 */
	#initAdaptiveListeners() {
		// Responsive layout observer
		const resizeObserver = new ResizeObserver(() => {
			this.#updateResponsiveLayout();
		});
		resizeObserver.observe(document.body);

		// Listen for preference changes through ActionDispatcher
		this.#setupPreferenceListener();
	}

	/**
	 * Setup preference change listener via ActionDispatcher
	 * @private
	 */
	async #setupPreferenceListener() {
		try {
			// Could listen for preference changes from Rust backend
			// For now, just handle window resize
			window.addEventListener("resize", () => {
				setTimeout(() => this.#updateResponsiveLayout(), 100);
			});
		} catch (error) {
			console.warn(
				"[GridBootstrap] Preference listener setup failed:",
				error
			);
		}
	}

	/**
	 * Updates the grid's density based on the current window width.
	 * @private
	 * @returns {void}
	 */
	#updateResponsiveLayout() {
		const width = window.innerWidth;
		const oldDensity = this.#options.density;

		if (width < 600) {
			this.#options.density = "compact";
		} else if (width > 1600) {
			this.#options.density = "spacious";
		} else {
			this.#options.density = "normal";
		}

		// Only update if density changed
		if (oldDensity !== this.#options.density) {
			// Update existing cells
			for (const cell of this.#cells.values()) {
				cell.classList.remove(`density-${oldDensity}`);
				cell.classList.add(`density-${this.#options.density}`);
			}

			this.updateGridTemplate();

			// Notify Rust backend of layout change
			this.#notifyLayoutChange();
		}
	}

	/**
	 * Notify Rust backend of layout changes
	 * @private
	 */
	async #notifyLayoutChange() {
		try {
			await this.#actionDispatcher.dispatch("grid.layout.changed", {
				density: this.#options.density,
				cellCount: this.#cells.size,
				containerWidth: this.#container.offsetWidth,
			});
		} catch (error) {
			console.warn(
				"[GridBootstrap] Layout change notification failed:",
				error
			);
		}
	}

	/**
	 * Render error message
	 * @private
	 * @param {string} message
	 */
	#renderError(message) {
		this.#container.innerHTML = `
			<div style="
				padding: 16px;
				text-align: center;
				background: #fef2f2;
				border: 1px solid #ef4444;
				border-radius: 6px;
				color: #dc2626;
			">
				<strong>Grid Error:</strong> ${message}
			</div>
		`;
	}

	/**
	 * Initialize the grid and attach ActionDispatcher
	 * @public
	 */
	async initialize() {
		try {
			// Attach ActionDispatcher to container for data-action handling
			this.#actionDispatcher.attach(this.#container);

			// Render the grid
			await this.render();

			console.log("[GridBootstrap] Initialized successfully");
		} catch (error) {
			console.error("[GridBootstrap] Initialization failed:", error);
			this.#renderError("Failed to initialize grid");
		}
	}

	/**
	 * Cleanup resources
	 * @public
	 */
	dispose() {
		// Remove event listeners
		for (const listener of this.#eventListeners) {
			listener.element.removeEventListener(
				listener.event,
				listener.handler
			);
		}
		this.#eventListeners = [];

		// Detach ActionDispatcher
		this.#actionDispatcher.detach(this.#container);

		// Clear cells
		this.#cells.clear();

		console.log("[GridBootstrap] Disposed successfully");
	}

	/**
	 * Refresh the grid (reload and re-render)
	 * @public
	 */
	async refresh() {
		try {
			this.dispose();
			await this.initialize();
		} catch (error) {
			console.error("[GridBootstrap] Refresh failed:", error);
		}
	}

	// Getters for compatibility
	get cells() {
		return this.#cells;
	}
	get options() {
		return this.#options;
	}
}

export default GridBootstrap;
