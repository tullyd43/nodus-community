/**
 * @file CompleteGridSystem.js
 * @description Simplified grid system for community release using Rust backend.
 * Converted from enterprise version to use ActionDispatcher proxy pattern.
 */
import { ActionDispatcher } from "@platform/ActionDispatcher.js";
import { AsyncOrchestrator } from "@platform/AsyncOrchestrator.js";
import { GridHistoryInspector } from "./GridHistoryInspector.js";
import { normalizeConfig } from "./GridRuntimeConfig.js";

/**
 * @class CompleteGridSystem
 * @classdesc Simplified grid system that coordinates grid features using Rust backend.
 * Removes enterprise complexity while maintaining core functionality.
 */
export class CompleteGridSystem {
	/** @private @type {ActionDispatcher} */
	#actionDispatcher;
	/** @private @type {AsyncOrchestrator} */
	#orchestrator;
	/** @private @type {HTMLElement} */
	#container;
	/** @private @type {object} */
	#options;
	/** @private @type {boolean} */
	#initialized = false;
	/** @private @type {Function[]} */
	#unsubscribeFunctions = [];
	/** @private @type {LayoutStore|null} */
	#layoutStore = null;
	/** @private @type {GridHistoryInspector|null} */
	#historyInspector = null;
	/** @private @type {Map<string, HTMLElement>} */
	#gridBlocks = new Map();

	/**
	 * Creates a CompleteGridSystem instance
	 * @param {HTMLElement|string} container - Grid container element or selector
	 * @param {object} [options={}] - Configuration options
	 */
	constructor(container, options = {}) {
		// Get container element
		this.#container =
			typeof container === "string"
				? document.querySelector(container)
				: container;

		if (!this.#container) {
			throw new Error(
				"CompleteGridSystem requires a valid container element"
			);
		}

		// Initialize Rust backend proxies
		this.#actionDispatcher = new ActionDispatcher();
		this.#orchestrator = new AsyncOrchestrator();

		this.#options = {
			enableHistory: true,
			enableToasts: true,
			enableAnalytics: true,
			enableDragDrop: true,
			maxBlocks: 100,
			classification: "PUBLIC", // Community: simple classification
			...options,
		};

		// Initialize layout store
		// LayoutStore is optional; load at runtime to avoid static import failures
		this.#layoutStore = null;
	}

	/**
	 * Initialize the complete grid system
	 * @public
	 * @returns {Promise<void>}
	 */
	async initialize() {
		if (this.#initialized) {
			return;
		}

		try {
			console.log("[CompleteGridSystem] Initializing...");

			// 1. Setup container
			await this.#setupContainer();

			// LayoutStore is optional in community; we avoid trying to dynamically
			// import a missing module during dev to prevent 404 noise. Leave
			// this.#layoutStore as null when no implementation is present.

			// 2. Initialize history tracking if enabled
			if (this.#options.enableHistory) {
				await this.#initializeHistory();
			}

			// 3. Setup drag and drop if enabled
			if (this.#options.enableDragDrop) {
				await this.#setupDragDrop();
			}

			// 4. Load existing grid configuration from Rust backend
			await this.#loadGridConfiguration();

			// 5. Attach ActionDispatcher for declarative actions
			this.#actionDispatcher.attach(this.#container);

			// 6. Setup analytics tracking if enabled
			if (this.#options.enableAnalytics) {
				await this.#setupAnalytics();
			}

			this.#initialized = true;
			console.log("[CompleteGridSystem] Initialized successfully");

			// Notify Rust backend of initialization
			await this.#actionDispatcher.dispatch("grid.system.initialized", {
				containerId: this.#container.id,
				options: this.#options,
			});
		} catch (error) {
			console.error("[CompleteGridSystem] Initialization failed:", error);
			throw error;
		}
	}

	/**
	 * Add a new block to the grid
	 * @public
	 * @param {object} blockConfig - Block configuration
	 * @returns {Promise<string>} Block ID
	 */
	async addBlock(blockConfig) {
		const runner = this.#orchestrator.createRunner("add_grid_block");

		return runner.run(async () => {
			// Normalize block configuration
			const normalizedConfig = normalizeConfig({
				blocks: [blockConfig],
			});

			const block = normalizedConfig.blocks[0];
			if (!block) {
				throw new Error("Invalid block configuration");
			}

			// Save to Rust backend
			const blockId = await this.#actionDispatcher.dispatch(
				"grid.block.add",
				{
					blockConfig: block,
					containerId: this.#container.id,
				}
			);

			// Create and render block element
			const blockElement = await this.#createBlockElement(block, blockId);
			this.#container.appendChild(blockElement);
			this.#gridBlocks.set(blockId, blockElement);

			// Update history
			if (this.#historyInspector) {
				this.#historyInspector.recordAction("block_added", {
					blockId,
					config: block,
				});
			}

			// Show success toast
			if (this.#options.enableToasts) {
				await this.#showToast("Block added successfully", "success");
			}

			return blockId;
		});
	}

	/**
	 * Remove a block from the grid
	 * @public
	 * @param {string} blockId - Block ID to remove
	 * @returns {Promise<void>}
	 */
	async removeBlock(blockId) {
		const runner = this.#orchestrator.createRunner("remove_grid_block");

		return runner.run(async () => {
			// Remove from Rust backend
			await this.#actionDispatcher.dispatch("grid.block.remove", {
				blockId,
				containerId: this.#container.id,
			});

			// Remove from DOM
			const blockElement = this.#gridBlocks.get(blockId);
			if (blockElement) {
				blockElement.remove();
				this.#gridBlocks.delete(blockId);
			}

			// Update history
			if (this.#historyInspector) {
				this.#historyInspector.recordAction("block_removed", {
					blockId,
				});
			}

			// Show success toast
			if (this.#options.enableToasts) {
				await this.#showToast("Block removed successfully", "success");
			}
		});
	}

	/**
	 * Update grid layout
	 * @public
	 * @param {object} layoutConfig - New layout configuration
	 * @returns {Promise<void>}
	 */
	async updateLayout(layoutConfig) {
		const runner = this.#orchestrator.createRunner("update_grid_layout");

		return runner.run(async () => {
			const normalizedConfig = normalizeConfig(layoutConfig);

			// Save to Rust backend
			await this.#actionDispatcher.dispatch("grid.layout.update", {
				layoutConfig: normalizedConfig,
				containerId: this.#container.id,
			});

			// Re-render grid
			await this.#renderGrid(normalizedConfig);

			// Update history
			if (this.#historyInspector) {
				this.#historyInspector.recordAction("layout_updated", {
					config: normalizedConfig,
				});
			}
		});
	}

	/**
	 * Get current grid state
	 * @public
	 * @returns {Promise<object>} Current grid state
	 */
	async getGridState() {
		return this.#actionDispatcher.dispatch("grid.state.get", {
			containerId: this.#container.id,
		});
	}

	/**
	 * Setup container with necessary CSS classes and attributes
	 * @private
	 * @returns {Promise<void>}
	 */
	async #setupContainer() {
		this.#container.classList.add("nodus-grid-system", "community-grid");
		this.#container.setAttribute("data-grid-initialized", "true");

		// Apply basic grid styling
		Object.assign(this.#container.style, {
			display: "grid",
			gap: "16px",
			gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
		});
	}

	/**
	 * Initialize history tracking
	 * @private
	 * @returns {Promise<void>}
	 */
	async #initializeHistory() {
		try {
			this.#historyInspector = new GridHistoryInspector({
				actionDispatcher: this.#actionDispatcher,
				orchestrator: this.#orchestrator,
			});
			await this.#historyInspector.initialize();
		} catch (error) {
			console.warn(
				"[CompleteGridSystem] History initialization failed:",
				error
			);
		}
	}

	/**
	 * Setup drag and drop functionality
	 * @private
	 * @returns {Promise<void>}
	 */
	async #setupDragDrop() {
		// Allow dropping on the container
		this.#container.addEventListener("dragover", (e) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
		});

		this.#container.addEventListener("drop", async (e) => {
			e.preventDefault();

			const blockId = e.dataTransfer.getData("application/nodus-block");
			if (blockId) {
				try {
					await this.#actionDispatcher.dispatch("grid.block.moved", {
						blockId,
						newPosition: {
							x: e.clientX,
							y: e.clientY,
						},
					});
				} catch (error) {
					console.error("[CompleteGridSystem] Drop failed:", error);
				}
			}
		});
	}

	/**
	 * Load existing grid configuration from Rust backend
	 * @private
	 * @returns {Promise<void>}
	 */
	async #loadGridConfiguration() {
		try {
			const config = await this.#actionDispatcher.dispatch(
				"grid.config.load",
				{
					containerId: this.#container.id,
				}
			);

			if (config && config.blocks) {
				await this.#renderGrid(config);
			}
		} catch (error) {
			console.warn(
				"[CompleteGridSystem] Failed to load configuration:",
				error
			);
			// Initialize with empty grid
			await this.#renderGrid({ blocks: [] });
		}
	}

	/**
	 * Render grid with given configuration
	 * @private
	 * @param {object} config - Grid configuration
	 * @returns {Promise<void>}
	 */
	async #renderGrid(config) {
		// Clear existing blocks
		for (const blockElement of this.#gridBlocks.values()) {
			blockElement.remove();
		}
		this.#gridBlocks.clear();

		// Render new blocks
		for (const block of config.blocks || []) {
			try {
				const blockElement = await this.#createBlockElement(
					block,
					block.id
				);
				this.#container.appendChild(blockElement);
				this.#gridBlocks.set(block.id, blockElement);
			} catch (error) {
				console.error(
					"[CompleteGridSystem] Failed to render block:",
					error
				);
			}
		}
	}

	/**
	 * Create a block element
	 * @private
	 * @param {object} blockConfig - Block configuration
	 * @param {string} blockId - Block ID
	 * @returns {Promise<HTMLElement>} Block element
	 */
	async #createBlockElement(blockConfig, blockId) {
		const blockElement = document.createElement("div");
		blockElement.classList.add("grid-block", "community-block");
		blockElement.dataset.blockId = blockId;
		blockElement.dataset.action = "grid.block.select";
		blockElement.dataset.actionPayload = JSON.stringify({ blockId });
		blockElement.draggable = true;

		// Basic styling
		Object.assign(blockElement.style, {
			padding: "16px",
			border: "1px solid #e5e7eb",
			borderRadius: "8px",
			background: "#ffffff",
			minHeight: "100px",
		});

		// Set content
		if (blockConfig.type === "html" && blockConfig.props?.content) {
			blockElement.innerHTML = blockConfig.props.content;
		} else {
			blockElement.textContent =
				blockConfig.props?.title || `Block ${blockId}`;
		}

		// Setup drag events
		blockElement.addEventListener("dragstart", (e) => {
			e.dataTransfer.setData("application/nodus-block", blockId);
			e.dataTransfer.effectAllowed = "move";
		});

		return blockElement;
	}

	/**
	 * Setup analytics tracking
	 * @private
	 * @returns {Promise<void>}
	 */
	async #setupAnalytics() {
		// Track grid interactions
		this.#container.addEventListener("click", async (e) => {
			if (e.target.closest(".grid-block")) {
				await this.#actionDispatcher.dispatch("analytics.track", {
					event: "grid_block_clicked",
					blockId: e.target.closest(".grid-block").dataset.blockId,
				});
			}
		});
	}

	/**
	 * Show toast notification
	 * @private
	 * @param {string} message - Toast message
	 * @param {string} type - Toast type (success, error, warning)
	 * @returns {Promise<void>}
	 */
	async #showToast(message, type = "info") {
		return this.#actionDispatcher.dispatch("ui.toast.show", {
			message,
			type,
			duration: 3000,
		});
	}

	/**
	 * Cleanup and dispose of the grid system
	 * @public
	 */
	dispose() {
		// Remove event listeners
		for (const unsubscribe of this.#unsubscribeFunctions) {
			unsubscribe();
		}
		this.#unsubscribeFunctions = [];

		// Detach ActionDispatcher
		this.#actionDispatcher.detach(this.#container);

		// Clear blocks
		this.#gridBlocks.clear();

		// Dispose history inspector
		if (this.#historyInspector) {
			this.#historyInspector.dispose();
		}

		this.#initialized = false;
		console.log("[CompleteGridSystem] Disposed successfully");
	}

	// Public getters for compatibility
	get container() {
		return this.#container;
	}
	get initialized() {
		return this.#initialized;
	}
	get blockCount() {
		return this.#gridBlocks.size;
	}
}

export default CompleteGridSystem;
