/**
 * @file EnhancedGridRenderer.js
 * @description Simplified grid enhancement layer for community release.
 * Adds modern features like CSS Grid, drag/drop, and accessibility without enterprise complexity.
 */
import { ActionDispatcher } from "@platform/ActionDispatcher.js";
import { AsyncOrchestrator } from "@platform/AsyncOrchestrator.js";

/**
 * @class EnhancedGridRenderer
 * @classdesc Enhances existing grid layouts with modern features using Rust backend.
 * Simplified from enterprise version to use ActionDispatcher proxy pattern.
 */
export class EnhancedGridRenderer {
	/** @private @type {ActionDispatcher} */
	#actionDispatcher;
	/** @private @type {AsyncOrchestrator} */
	#orchestrator;
	/** @private @type {HTMLElement|null} */
	#container = null;
	/** @private @type {object} */
	#options = {};
	/** @private @type {boolean} */
	#isEnhanced = false;
	/** @private @type {boolean} */
	#isDragging = false;
	/** @private @type {boolean} */
	#isResizing = false;
	/** @private @type {object|null} */
	#currentDragItem = null;
	/** @private @type {Function[]} */
	#unsubscribeFunctions = [];
	/** @private @type {number} */
	#gridColumns = 24;
	/** @private @type {Map<string, HTMLElement>} */
	#gridBlocks = new Map();
	/** @private @type {ResizeObserver|null} */
	#resizeObserver = null;

	/**
	 * Creates an EnhancedGridRenderer instance
	 * @param {object} config - Configuration object
	 */
	constructor(config = {}) {
		// Initialize Rust backend proxies
		this.#actionDispatcher = new ActionDispatcher();
		this.#orchestrator = new AsyncOrchestrator();
	}

	/**
	 * Initialize the grid enhancement
	 * @public
	 * @param {object} gridConfig - Grid configuration
	 * @param {HTMLElement} gridConfig.container - Grid container element
	 * @param {object} [gridConfig.options] - Additional options
	 * @returns {Promise<void>}
	 */
	async initialize(gridConfig = {}) {
		if (this.#isEnhanced) {
			return;
		}

		try {
			// Setup container
			this.#container =
				gridConfig.container ||
				document.querySelector(".grid-container") ||
				document.querySelector("#grid-container");

			if (!this.#container) {
				throw new Error(
					"EnhancedGridRenderer requires a valid container"
				);
			}

			this.#options = {
				enableKeyboard: true,
				enableAria: true,
				enableDragDrop: true,
				enableResponsive: true,
				columns: 24,
				gap: "16px",
				...gridConfig.options,
			};

			// Apply enhancements
			await this.#setupModernGridStyles();
			await this.#setupAccessibility();
			await this.#setupDragDrop();
			await this.#setupKeyboardNavigation();
			await this.#setupResponsive();

			this.#isEnhanced = true;
			console.log("[EnhancedGridRenderer] Grid enhanced successfully");

			// Notify Rust backend
			await this.#actionDispatcher.dispatch("grid.renderer.initialized", {
				containerId: this.#container.id,
				options: this.#options,
			});
		} catch (error) {
			console.error(
				"[EnhancedGridRenderer] Initialization failed:",
				error
			);
			throw error;
		}
	}

	/**
	 * Add modern CSS Grid layout
	 * @private
	 * @returns {Promise<void>}
	 */
	async #setupModernGridStyles() {
		// Apply CSS Grid styles
		Object.assign(this.#container.style, {
			display: "grid",
			gridTemplateColumns: `repeat(${this.#options.columns}, 1fr)`,
			gap: this.#options.gap,
			position: "relative",
		});

		// Add CSS classes for styling
		this.#container.classList.add("enhanced-grid", "nodus-grid-enhanced");

		// Add responsive breakpoint styles
		const style = document.createElement("style");
		style.textContent = `
            .enhanced-grid {
                transition: grid-template-columns 0.3s ease;
                min-height: 200px;
            }
            
            .enhanced-grid .grid-block {
                transition: all 0.2s ease;
                border-radius: 8px;
                padding: 12px;
                background: #ffffff;
                border: 1px solid #e5e7eb;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                position: relative;
                overflow: hidden;
            }
            
            .enhanced-grid .grid-block:hover {
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                transform: translateY(-1px);
            }
            
            .enhanced-grid .grid-block.dragging {
                opacity: 0.6;
                z-index: 1000;
                transform: rotate(5deg);
            }
            
            .enhanced-grid .grid-block.drop-target {
                border-color: #3b82f6;
                background: #eff6ff;
            }
            
            .enhanced-grid .grid-block.focused {
                outline: 2px solid #3b82f6;
                outline-offset: 2px;
            }
            
            @media (max-width: 768px) {
                .enhanced-grid {
                    grid-template-columns: repeat(12, 1fr);
                }
            }
            
            @media (max-width: 480px) {
                .enhanced-grid {
                    grid-template-columns: repeat(6, 1fr);
                }
            }
        `;

		if (!document.head.querySelector("#enhanced-grid-styles")) {
			style.id = "enhanced-grid-styles";
			document.head.appendChild(style);
		}
	}

	/**
	 * Setup accessibility features
	 * @private
	 * @returns {Promise<void>}
	 */
	async #setupAccessibility() {
		if (!this.#options.enableAria) return;

		// Add ARIA attributes to container
		this.#container.setAttribute("role", "grid");
		this.#container.setAttribute("aria-label", "Interactive grid layout");
		this.#container.setAttribute("tabindex", "0");

		// Setup ARIA for existing blocks
		this.#updateBlockAccessibility();
	}

	/**
	 * Update accessibility attributes for grid blocks
	 * @private
	 */
	#updateBlockAccessibility() {
		const blocks = this.#container.querySelectorAll(".grid-block");
		blocks.forEach((block, index) => {
			block.setAttribute("role", "gridcell");
			block.setAttribute("aria-label", `Grid block ${index + 1}`);
			block.setAttribute("tabindex", "0");
		});
	}

	/**
	 * Setup drag and drop functionality
	 * @private
	 * @returns {Promise<void>}
	 */
	async #setupDragDrop() {
		if (!this.#options.enableDragDrop) return;

		// Setup drag events for existing blocks
		this.#container.addEventListener("dragstart", async (e) => {
			const block = e.target.closest(".grid-block");
			if (!block) return;

			this.#isDragging = true;
			this.#currentDragItem = block;

			block.classList.add("dragging");
			e.dataTransfer.setData("text/plain", block.dataset.blockId || "");
			e.dataTransfer.effectAllowed = "move";

			// Notify Rust backend
			await this.#actionDispatcher.dispatch("grid.drag.started", {
				blockId: block.dataset.blockId,
				sourcePosition: this.#getBlockPosition(block),
			});
		});

		this.#container.addEventListener("dragend", async (e) => {
			const block = e.target.closest(".grid-block");
			if (!block) return;

			this.#isDragging = false;
			this.#currentDragItem = null;

			block.classList.remove("dragging");
			this.#clearDropTargets();

			// Notify Rust backend
			await this.#actionDispatcher.dispatch("grid.drag.ended", {
				blockId: block.dataset.blockId,
			});
		});

		this.#container.addEventListener("dragover", (e) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";

			const dropTarget = e.target.closest(".grid-block");
			if (dropTarget && dropTarget !== this.#currentDragItem) {
				this.#clearDropTargets();
				dropTarget.classList.add("drop-target");
			}
		});

		this.#container.addEventListener("drop", async (e) => {
			e.preventDefault();

			const dropTarget = e.target.closest(".grid-block");
			const draggedId = e.dataTransfer.getData("text/plain");

			if (dropTarget && draggedId && this.#currentDragItem) {
				try {
					await this.#handleBlockDrop(draggedId, dropTarget);
				} catch (error) {
					console.error("[EnhancedGridRenderer] Drop failed:", error);
				}
			}

			this.#clearDropTargets();
		});
	}

	/**
	 * Handle block drop operation
	 * @private
	 * @param {string} draggedId - ID of dragged block
	 * @param {HTMLElement} dropTarget - Target element
	 * @returns {Promise<void>}
	 */
	async #handleBlockDrop(draggedId, dropTarget) {
		const runner = this.#orchestrator.createRunner("block_drop");

		return runner.run(async () => {
			const targetId = dropTarget.dataset.blockId;

			// Swap positions in Rust backend
			await this.#actionDispatcher.dispatch("grid.blocks.swap", {
				sourceId: draggedId,
				targetId: targetId,
			});

			// Update DOM positions
			this.#swapBlockPositions(this.#currentDragItem, dropTarget);

			console.log(
				`[EnhancedGridRenderer] Swapped blocks: ${draggedId} <-> ${targetId}`
			);
		});
	}

	/**
	 * Swap block positions in DOM
	 * @private
	 * @param {HTMLElement} block1 - First block
	 * @param {HTMLElement} block2 - Second block
	 */
	#swapBlockPositions(block1, block2) {
		const tempPlaceholder = document.createElement("div");
		block1.parentNode.insertBefore(tempPlaceholder, block1);
		block2.parentNode.insertBefore(block1, block2);
		tempPlaceholder.parentNode.insertBefore(block2, tempPlaceholder);
		tempPlaceholder.remove();
	}

	/**
	 * Clear drop target indicators
	 * @private
	 */
	#clearDropTargets() {
		this.#container.querySelectorAll(".drop-target").forEach((el) => {
			el.classList.remove("drop-target");
		});
	}

	/**
	 * Setup keyboard navigation
	 * @private
	 * @returns {Promise<void>}
	 */
	async #setupKeyboardNavigation() {
		if (!this.#options.enableKeyboard) return;

		this.#container.addEventListener("keydown", async (e) => {
			const focused = document.activeElement;
			const block = focused.closest(".grid-block");

			if (!block) return;

			switch (e.key) {
				case "ArrowUp":
				case "ArrowDown":
				case "ArrowLeft":
				case "ArrowRight":
					e.preventDefault();
					this.#navigateGrid(block, e.key);
					break;

				case "Enter":
				case " ":
					e.preventDefault();
					await this.#activateBlock(block);
					break;

				case "Delete":
					e.preventDefault();
					await this.#deleteBlock(block);
					break;
			}
		});
	}

	/**
	 * Navigate grid with keyboard
	 * @private
	 * @param {HTMLElement} currentBlock - Currently focused block
	 * @param {string} direction - Navigation direction
	 */
	#navigateGrid(currentBlock, direction) {
		const blocks = Array.from(
			this.#container.querySelectorAll(".grid-block")
		);
		const currentIndex = blocks.indexOf(currentBlock);

		let nextIndex;
		switch (direction) {
			case "ArrowRight":
				nextIndex = currentIndex + 1;
				break;
			case "ArrowLeft":
				nextIndex = currentIndex - 1;
				break;
			case "ArrowDown":
				nextIndex = currentIndex + Math.ceil(Math.sqrt(blocks.length));
				break;
			case "ArrowUp":
				nextIndex = currentIndex - Math.ceil(Math.sqrt(blocks.length));
				break;
		}

		if (nextIndex >= 0 && nextIndex < blocks.length) {
			blocks[nextIndex].focus();
		}
	}

	/**
	 * Activate a grid block
	 * @private
	 * @param {HTMLElement} block - Block to activate
	 * @returns {Promise<void>}
	 */
	async #activateBlock(block) {
		block.classList.add("focused");

		await this.#actionDispatcher.dispatch("grid.block.activated", {
			blockId: block.dataset.blockId,
		});

		setTimeout(() => block.classList.remove("focused"), 300);
	}

	/**
	 * Delete a grid block
	 * @private
	 * @param {HTMLElement} block - Block to delete
	 * @returns {Promise<void>}
	 */
	async #deleteBlock(block) {
		const blockId = block.dataset.blockId;

		if (confirm("Are you sure you want to delete this block?")) {
			await this.#actionDispatcher.dispatch("grid.block.delete", {
				blockId,
			});

			block.remove();
		}
	}

	/**
	 * Setup responsive grid behavior
	 * @private
	 * @returns {Promise<void>}
	 */
	async #setupResponsive() {
		if (!this.#options.enableResponsive) return;

		// Setup ResizeObserver for container
		this.#resizeObserver = new ResizeObserver(async (entries) => {
			for (const entry of entries) {
				await this.#handleResize(entry.contentRect.width);
			}
		});

		this.#resizeObserver.observe(this.#container);
	}

	/**
	 * Handle container resize
	 * @private
	 * @param {number} width - New container width
	 * @returns {Promise<void>}
	 */
	async #handleResize(width) {
		let columns = this.#options.columns;

		// Responsive breakpoints
		if (width < 480) {
			columns = 6;
		} else if (width < 768) {
			columns = 12;
		} else if (width < 1200) {
			columns = 18;
		}

		if (columns !== this.#gridColumns) {
			this.#gridColumns = columns;
			this.#container.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;

			// Notify Rust backend of layout change
			await this.#actionDispatcher.dispatch(
				"grid.layout.responsive_change",
				{
					width,
					columns,
					breakpoint: this.#getBreakpoint(width),
				}
			);
		}
	}

	/**
	 * Get current breakpoint name
	 * @private
	 * @param {number} width - Container width
	 * @returns {string} Breakpoint name
	 */
	#getBreakpoint(width) {
		if (width < 480) return "xs";
		if (width < 768) return "sm";
		if (width < 1200) return "md";
		return "lg";
	}

	/**
	 * Get block position information
	 * @private
	 * @param {HTMLElement} block - Block element
	 * @returns {object} Position information
	 */
	#getBlockPosition(block) {
		const rect = block.getBoundingClientRect();
		const containerRect = this.#container.getBoundingClientRect();

		return {
			x: rect.left - containerRect.left,
			y: rect.top - containerRect.top,
			width: rect.width,
			height: rect.height,
		};
	}

	/**
	 * Add a new block to the enhanced grid
	 * @public
	 * @param {HTMLElement} blockElement - Block element to add
	 * @returns {Promise<void>}
	 */
	async addBlock(blockElement) {
		if (!blockElement) return;

		// Make the block draggable
		blockElement.draggable = true;
		blockElement.classList.add("grid-block");

		// Setup accessibility
		blockElement.setAttribute("role", "gridcell");
		blockElement.setAttribute("tabindex", "0");

		// Add to container
		this.#container.appendChild(blockElement);

		const blockId = blockElement.dataset.blockId || crypto.randomUUID();
		blockElement.dataset.blockId = blockId;
		this.#gridBlocks.set(blockId, blockElement);

		// Notify Rust backend
		await this.#actionDispatcher.dispatch("grid.block.enhanced", {
			blockId,
			enhanced: true,
		});
	}

	/**
	 * Remove a block from the enhanced grid
	 * @public
	 * @param {string} blockId - Block ID to remove
	 * @returns {Promise<void>}
	 */
	async removeBlock(blockId) {
		const block = this.#gridBlocks.get(blockId);
		if (block) {
			block.remove();
			this.#gridBlocks.delete(blockId);

			await this.#actionDispatcher.dispatch("grid.block.removed", {
				blockId,
			});
		}
	}

	/**
	 * Update grid layout
	 * @public
	 * @param {object} layout - New layout configuration
	 * @returns {Promise<void>}
	 */
	async updateLayout(layout) {
		if (layout.columns) {
			this.#gridColumns = layout.columns;
			this.#container.style.gridTemplateColumns = `repeat(${layout.columns}, 1fr)`;
		}

		if (layout.gap) {
			this.#container.style.gap = layout.gap;
		}

		await this.#actionDispatcher.dispatch("grid.layout.updated", {
			layout,
		});
	}

	/**
	 * Dispose of the enhanced grid renderer
	 * @public
	 */
	dispose() {
		// Remove event listeners
		for (const unsubscribe of this.#unsubscribeFunctions) {
			unsubscribe();
		}
		this.#unsubscribeFunctions = [];

		// Disconnect observers
		if (this.#resizeObserver) {
			this.#resizeObserver.disconnect();
			this.#resizeObserver = null;
		}

		// Clear blocks
		this.#gridBlocks.clear();

		this.#isEnhanced = false;
		console.log("[EnhancedGridRenderer] Disposed successfully");
	}

	// Public getters
	get isEnhanced() {
		return this.#isEnhanced;
	}
	get container() {
		return this.#container;
	}
	get blockCount() {
		return this.#gridBlocks.size;
	}
	get columns() {
		return this.#gridColumns;
	}
}

export default EnhancedGridRenderer;
