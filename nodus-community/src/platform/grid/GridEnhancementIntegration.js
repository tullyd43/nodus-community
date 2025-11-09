/**
 * @file GridEnhancementIntegration.js
 * @description Simplified integration helper for enhancing existing grids in community release.
 * Shows how to layer modern grid capabilities onto existing applications using Rust backend.
 */
import { ActionDispatcher } from "@platform/ActionDispatcher.js";
import { AsyncOrchestrator } from "@platform/AsyncOrchestrator.js";
import { EnhancedGridRenderer } from "./EnhancedGridRenderer.js";

/**
 * @class GridEnhancementIntegration
 * @classdesc Helper class that demonstrates how to enhance existing grid systems
 * with modern capabilities without requiring a complete rewrite.
 */
export class GridEnhancementIntegration {
	/** @private @type {ActionDispatcher} */
	#actionDispatcher;
	/** @private @type {AsyncOrchestrator} */
	#orchestrator;
	/** @private @type {HTMLElement|null} */
	#gridContainer = null;
	/** @private @type {EnhancedGridRenderer|null} */
	#gridEnhancer = null;
	/** @private @type {object} */
	#originalGrid = null;
	/** @private @type {Function[]} */
	#unsubscribeFunctions = [];
	/** @private @type {boolean} */
	#isIntegrated = false;

	/**
	 * Creates a GridEnhancementIntegration instance
	 * @param {object} config - Integration configuration
	 * @param {HTMLElement|string} config.container - Grid container or selector
	 * @param {object} [config.originalGrid] - Reference to original grid system
	 * @param {object} [config.options] - Enhancement options
	 */
	constructor(config = {}) {
		// Initialize Rust backend proxies
		this.#actionDispatcher = new ActionDispatcher();
		this.#orchestrator = new AsyncOrchestrator();

		// Get container
		this.#gridContainer =
			typeof config.container === "string"
				? document.querySelector(config.container)
				: config.container;

		if (!this.#gridContainer) {
			throw new Error(
				"GridEnhancementIntegration requires a valid grid container"
			);
		}

		// Store reference to original grid if provided
		this.#originalGrid = config.originalGrid || null;

		// Initialize enhanced renderer
		this.#gridEnhancer = new EnhancedGridRenderer();
	}

	/**
	 * Integrate enhancements with existing grid
	 * @public
	 * @param {object} options - Integration options
	 * @returns {Promise<void>}
	 */
	async integrate(options = {}) {
		if (this.#isIntegrated) {
			console.warn("[GridEnhancementIntegration] Already integrated");
			return;
		}

		try {
			console.log("[GridEnhancementIntegration] Starting integration...");

			// 1. Analyze existing grid structure
			const gridAnalysis = await this.#analyzeExistingGrid();

			// 2. Prepare container for enhancements
			await this.#prepareContainer(gridAnalysis);

			// 3. Initialize enhanced renderer
			await this.#gridEnhancer.initialize({
				container: this.#gridContainer,
				options: {
					enableKeyboard: true,
					enableAria: true,
					enableDragDrop: true,
					enableResponsive: true,
					preserveExistingLayout: true,
					...options,
				},
			});

			// 4. Enhance existing blocks
			await this.#enhanceExistingBlocks();

			// 5. Setup integration event listeners
			await this.#setupIntegrationListeners();

			// 6. Preserve original functionality
			await this.#preserveOriginalFeatures();

			this.#isIntegrated = true;
			console.log(
				"[GridEnhancementIntegration] Integration completed successfully"
			);

			// Notify Rust backend
			await this.#actionDispatcher.dispatch(
				"grid.integration.completed",
				{
					containerId: this.#gridContainer.id,
					enhancementCount: this.#getEnhancementCount(),
					preservedFeatures: this.#getPreservedFeatures(),
				}
			);
		} catch (error) {
			console.error(
				"[GridEnhancementIntegration] Integration failed:",
				error
			);
			throw error;
		}
	}

	/**
	 * Analyze existing grid structure
	 * @private
	 * @returns {Promise<object>} Grid analysis results
	 */
	async #analyzeExistingGrid() {
		const runner = this.#orchestrator.createRunner("grid_analysis");

		return runner.run(async () => {
			const analysis = {
				hasExistingBlocks: false,
				blockCount: 0,
				hasExistingLayout: false,
				existingStyles: {},
				blockElements: [],
			};

			// Find existing blocks/items
			const possibleBlocks = this.#gridContainer.querySelectorAll(
				[
					".grid-item",
					".grid-block",
					".card",
					".widget",
					"[data-grid-item]",
					".grid-container > div",
					".grid-cell",
				].join(", ")
			);

			analysis.blockElements = Array.from(possibleBlocks);
			analysis.blockCount = analysis.blockElements.length;
			analysis.hasExistingBlocks = analysis.blockCount > 0;

			// Check for existing layout styles
			const computedStyle = window.getComputedStyle(this.#gridContainer);
			analysis.hasExistingLayout =
				computedStyle.display === "grid" ||
				computedStyle.display === "flex" ||
				this.#gridContainer.style.display;

			analysis.existingStyles = {
				display: computedStyle.display,
				gridTemplateColumns: computedStyle.gridTemplateColumns,
				flexDirection: computedStyle.flexDirection,
				gap: computedStyle.gap,
			};

			console.log("[GridEnhancementIntegration] Analysis:", analysis);
			return analysis;
		});
	}

	/**
	 * Prepare container for enhancements
	 * @private
	 * @param {object} analysis - Grid analysis results
	 * @returns {Promise<void>}
	 */
	async #prepareContainer(analysis) {
		// Preserve existing classes
		const existingClasses = Array.from(this.#gridContainer.classList);

		// Add enhancement classes
		this.#gridContainer.classList.add("grid-enhancement-container");

		// Store original styles for potential restoration
		this.#gridContainer.dataset.originalDisplay =
			analysis.existingStyles.display;
		this.#gridContainer.dataset.enhancementActive = "true";

		// If no existing layout, we'll let EnhancedGridRenderer handle it
		// If there is an existing layout, we'll preserve key aspects
		if (
			analysis.hasExistingLayout &&
			analysis.existingStyles.display !== "grid"
		) {
			console.log(
				"[GridEnhancementIntegration] Preserving existing layout structure"
			);
		}
	}

	/**
	 * Enhance existing blocks in the grid
	 * @private
	 * @returns {Promise<void>}
	 */
	async #enhanceExistingBlocks() {
		const blocks = this.#gridContainer.querySelectorAll(
			[
				".grid-item",
				".grid-block",
				".card",
				".widget",
				"[data-grid-item]",
				".grid-container > div:not(.grid-enhancement-container)",
				".grid-cell",
			].join(", ")
		);

		for (const [index, block] of blocks.entries()) {
			try {
				await this.#enhanceBlock(block, index);
			} catch (error) {
				console.warn(
					`[GridEnhancementIntegration] Failed to enhance block ${index}:`,
					error
				);
			}
		}
	}

	/**
	 * Enhance a single block element
	 * @private
	 * @param {HTMLElement} block - Block to enhance
	 * @param {number} index - Block index
	 * @returns {Promise<void>}
	 */
	async #enhanceBlock(block, index) {
		// Add standard grid block class if not present
		if (!block.classList.contains("grid-block")) {
			block.classList.add("grid-block");
		}

		// Add enhancement identifier
		block.classList.add("enhanced-block");

		// Ensure block has an ID
		if (!block.id) {
			block.id = `enhanced-block-${index + 1}`;
		}

		// Add block ID to dataset
		block.dataset.blockId = block.id;

		// Make draggable
		block.draggable = true;

		// Add to enhanced renderer
		await this.#gridEnhancer.addBlock(block);
	}

	/**
	 * Setup integration-specific event listeners
	 * @private
	 * @returns {Promise<void>}
	 */
	async #setupIntegrationListeners() {
		// Listen for new blocks being added to the original system
		const observer = new MutationObserver(async (mutations) => {
			for (const mutation of mutations) {
				if (mutation.type === "childList") {
					for (const node of mutation.addedNodes) {
						if (node.nodeType === Node.ELEMENT_NODE) {
							await this.#handleNewBlock(node);
						}
					}
				}
			}
		});

		observer.observe(this.#gridContainer, {
			childList: true,
			subtree: true,
		});

		this.#unsubscribeFunctions.push(() => observer.disconnect());

		// Listen for integration commands
		this.#actionDispatcher.attach(this.#gridContainer);
	}

	/**
	 * Handle dynamically added blocks
	 * @private
	 * @param {HTMLElement} node - New node added to grid
	 * @returns {Promise<void>}
	 */
	async #handleNewBlock(node) {
		// Check if this looks like a grid block
		if (this.#isGridBlock(node)) {
			console.log(
				"[GridEnhancementIntegration] Enhancing newly added block:",
				node
			);

			const blockCount =
				this.#gridContainer.querySelectorAll(".grid-block").length;
			await this.#enhanceBlock(node, blockCount);
		}
	}

	/**
	 * Check if a node is a grid block
	 * @private
	 * @param {HTMLElement} node - Node to check
	 * @returns {boolean} True if node is a grid block
	 */
	#isGridBlock(node) {
		// Various heuristics to detect grid blocks
		return (
			node.classList.contains("grid-item") ||
			node.classList.contains("grid-block") ||
			node.classList.contains("card") ||
			node.classList.contains("widget") ||
			node.hasAttribute("data-grid-item") ||
			(node.parentElement === this.#gridContainer &&
				node.tagName === "DIV" &&
				!node.classList.contains("grid-enhancement-container"))
		);
	}

	/**
	 * Preserve original grid features that shouldn't be replaced
	 * @private
	 * @returns {Promise<void>}
	 */
	async #preserveOriginalFeatures() {
		// If original grid has custom event handlers, preserve them
		if (
			this.#originalGrid &&
			typeof this.#originalGrid.addEventListener === "function"
		) {
			console.log(
				"[GridEnhancementIntegration] Preserving original grid event handlers"
			);
		}

		// Preserve any custom data attributes
		const customAttributes = Array.from(
			this.#gridContainer.attributes
		).filter(
			(attr) =>
				attr.name.startsWith("data-") &&
				!attr.name.startsWith("data-enhancement-")
		);

		console.log(
			"[GridEnhancementIntegration] Preserving custom attributes:",
			customAttributes.map((a) => a.name)
		);
	}

	/**
	 * Get count of enhancements applied
	 * @private
	 * @returns {number} Number of enhancements
	 */
	#getEnhancementCount() {
		return this.#gridContainer.querySelectorAll(".enhanced-block").length;
	}

	/**
	 * Get list of preserved features
	 * @private
	 * @returns {string[]} Array of preserved feature names
	 */
	#getPreservedFeatures() {
		const features = [];

		if (
			this.#gridContainer.dataset.originalDisplay &&
			this.#gridContainer.dataset.originalDisplay !== "none"
		) {
			features.push("original-layout");
		}

		if (this.#originalGrid) {
			features.push("original-grid-reference");
		}

		const customAttributes = Array.from(
			this.#gridContainer.attributes
		).filter(
			(attr) =>
				attr.name.startsWith("data-") &&
				!attr.name.startsWith("data-enhancement-")
		);

		if (customAttributes.length > 0) {
			features.push("custom-attributes");
		}

		return features;
	}

	/**
	 * Add a new block with enhancements
	 * @public
	 * @param {HTMLElement} blockElement - Block element to add
	 * @returns {Promise<void>}
	 */
	async addEnhancedBlock(blockElement) {
		// Add to container first
		this.#gridContainer.appendChild(blockElement);

		// Then enhance it
		const blockIndex = this.#gridContainer.children.length - 1;
		await this.#enhanceBlock(blockElement, blockIndex);
	}

	/**
	 * Remove enhancements but preserve original grid
	 * @public
	 * @returns {Promise<void>}
	 */
	async removeEnhancements() {
		try {
			// Dispose enhanced renderer
			if (this.#gridEnhancer) {
				this.#gridEnhancer.dispose();
			}

			// Remove enhancement classes and attributes
			this.#gridContainer.classList.remove("grid-enhancement-container");
			this.#gridContainer.removeAttribute("data-enhancement-active");

			// Restore original display if needed
			const originalDisplay = this.#gridContainer.dataset.originalDisplay;
			if (originalDisplay && originalDisplay !== "none") {
				this.#gridContainer.style.display = originalDisplay;
			}

			// Remove enhancement classes from blocks
			this.#gridContainer
				.querySelectorAll(".enhanced-block")
				.forEach((block) => {
					block.classList.remove("enhanced-block");
					block.removeAttribute("draggable");
					block.removeAttribute("data-block-id");
				});

			// Clean up event listeners
			for (const unsubscribe of this.#unsubscribeFunctions) {
				unsubscribe();
			}
			this.#unsubscribeFunctions = [];

			// Detach action dispatcher
			this.#actionDispatcher.detach(this.#gridContainer);

			this.#isIntegrated = false;
			console.log(
				"[GridEnhancementIntegration] Enhancements removed successfully"
			);
		} catch (error) {
			console.error(
				"[GridEnhancementIntegration] Failed to remove enhancements:",
				error
			);
			throw error;
		}
	}

	/**
	 * Check if enhancements are currently active
	 * @public
	 * @returns {boolean} True if integrated
	 */
	get isIntegrated() {
		return this.#isIntegrated;
	}

	/**
	 * Get the enhanced grid renderer
	 * @public
	 * @returns {EnhancedGridRenderer|null} Enhanced renderer instance
	 */
	get enhancedRenderer() {
		return this.#gridEnhancer;
	}

	/**
	 * Get integration statistics
	 * @public
	 * @returns {object} Integration stats
	 */
	getIntegrationStats() {
		return {
			isIntegrated: this.#isIntegrated,
			enhancedBlockCount: this.#getEnhancementCount(),
			preservedFeatures: this.#getPreservedFeatures(),
			hasOriginalGrid: !!this.#originalGrid,
			containerId: this.#gridContainer.id,
		};
	}
}

/**
 * Helper function to quickly enhance an existing grid
 * @param {HTMLElement|string} container - Grid container or selector
 * @param {object} options - Enhancement options
 * @returns {Promise<GridEnhancementIntegration>} Integration instance
 */
export async function enhanceExistingGrid(container, options = {}) {
	const integration = new GridEnhancementIntegration({ container });
	await integration.integrate(options);
	return integration;
}

/**
 * Helper function to enhance a grid and return just the enhanced renderer
 * @param {HTMLElement|string} container - Grid container or selector
 * @param {object} options - Enhancement options
 * @returns {Promise<EnhancedGridRenderer>} Enhanced renderer instance
 */
export async function getEnhancedRenderer(container, options = {}) {
	const integration = await enhanceExistingGrid(container, options);
	return integration.enhancedRenderer;
}

export default GridEnhancementIntegration;
