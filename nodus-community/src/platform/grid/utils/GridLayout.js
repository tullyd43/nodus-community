/**
 * @file GridLayout.js
 * @description Pure layout calculation utility - no DOM manipulation
 * Handles grid positioning, collision detection, and responsive calculations
 */

export class GridLayout {
	constructor(options = {}) {
		this.columns = options.columns || 24;
		this.gap = options.gap || 16;
		this.responsive = options.responsive !== false;
		this.onLayoutChange = options.onLayoutChange || null;

		// Layout state
		// occupiedPositions tracks cell keys "x:y" for quick lookup during
		// high-frequency operations (dragging/optimizing). It's rebuilt from
		// authoritative block lists to avoid stale state.
		this.occupiedPositions = new Set();
		this.breakpoints = {
			xs: 0,
			sm: 576,
			md: 768,
			lg: 992,
			xl: 1200,
			xxl: 1400,
		};
	}

	/**
	 * Find the best available position for a new block
	 * @param {object} block - Block that needs positioning
	 * @param {Array} existingBlocks - Currently positioned blocks
	 * @returns {object} Position {x, y, w, h}
	 */
	findBestPosition(block, existingBlocks = []) {
		/**
		 * GridStack.js-style simple row-by-row scan
		 */
		const defaultSize = {
			w: block.position?.w || block.w || 1,
			h: block.position?.h || block.h || 1,
		};

		// Rebuild occupied map for fast checks
		this.buildOccupiedPositions(existingBlocks);

		// Simple top-left, left-to-right scan (GridStack behaviour)
		for (let y = 0; y < 1000; y++) {
			for (let x = 0; x <= this.columns - defaultSize.w; x++) {
				const position = { x, y, ...defaultSize };

				if (this.isPositionAvailable(position, existingBlocks)) {
					return position;
				}
			}
		}

		// Fallback: append at bottom
		return { x: 0, y: this.getMaxY(existingBlocks) + 1, ...defaultSize };
	}

	/**
	 * Check if a position is available (no collisions)
	 * @param {object} position - Position to check {x, y, w, h}
	 * @param {Array} existingBlocks - Currently positioned blocks
	 * @returns {boolean} True if position is available
	 */
	isPositionAvailable(position, existingBlocks = []) {
		// Check bounds
		if (position.x < 0 || position.y < 0) return false;
		if (position.x + position.w > this.columns) return false;

		// Use occupiedPositions lookup if present for faster checks
		if (this.occupiedPositions && this.occupiedPositions.size > 0) {
			for (let yy = position.y; yy < position.y + position.h; yy++) {
				for (let xx = position.x; xx < position.x + position.w; xx++) {
					if (this.occupiedPositions.has(`${xx}:${yy}`)) return false;
				}
			}
			return true;
		}

		// Check collisions with existing blocks as fallback
		for (const block of existingBlocks) {
			if (this.blocksCollide(position, block.position)) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Rebuild occupiedPositions Set from authoritative block list.
	 * Each occupied cell is registered as "x:y".
	 */
	buildOccupiedPositions(blocks = []) {
		this.occupiedPositions.clear();
		for (const block of blocks) {
			const pos = block.position || {};
			for (let yy = pos.y; yy < pos.y + (pos.h || 1); yy++) {
				for (let xx = pos.x; xx < pos.x + (pos.w || 1); xx++) {
					this.occupiedPositions.add(`${xx}:${yy}`);
				}
			}
		}
	}

	/**
	 * Check if two blocks collide
	 * @param {object} blockA - First block position
	 * @param {object} blockB - Second block position
	 * @returns {boolean} True if blocks collide
	 */
	blocksCollide(blockA, blockB) {
		return !(
			(
				blockA.x >= blockB.x + blockB.w || // A is to the right of B
				blockB.x >= blockA.x + blockA.w || // B is to the right of A
				blockA.y >= blockB.y + blockB.h || // A is below B
				blockB.y >= blockA.y + blockA.h
			) // B is below A
		);
	}

	/**
	 * Get the maximum Y position of existing blocks
	 * @param {Array} existingBlocks - Currently positioned blocks
	 * @returns {number} Maximum Y position
	 */
	getMaxY(existingBlocks = []) {
		if (existingBlocks.length === 0) return 0;

		return Math.max(
			...existingBlocks.map(
				(block) => block.position.y + block.position.h - 1
			)
		);
	}

	/**
	 * Optimize layout by removing gaps and compacting blocks
	 * @param {Array} blocks - Blocks to optimize
	 * @returns {Array} Optimized block positions
	 */
	optimizeLayout(blocks = []) {
		// Simplified behavior to match GridStack.js expectations:
		// - If float mode is enabled, do not compact; just validate bounds.
		// - If float mode is disabled, perform a simple top-down compacting
		//   using a first-fit per-row scan.

		if (this.float) {
			// Float mode: validate bounds and return normalized positions
			return blocks.map((block) => ({
				...block,
				position: {
					...block.position,
					x: Math.max(
						0,
						Math.min(
							block.position.x,
							this.columns - block.position.w
						)
					),
					y: Math.max(0, block.position.y),
				},
			}));
		}

		// Compact mode: top-down compacting but respect locked blocks
		const sorted = [...blocks].sort((a, b) => {
			if (a.position.y !== b.position.y)
				return a.position.y - b.position.y;
			return a.position.x - b.position.x;
		});

		const compacted = [];
		// Start with an empty occupied map and mark locked blocks first so
		// unlocked blocks are compacted around them.
		this.occupiedPositions.clear();

		// 1) Preserve locked blocks in-place and register their cells
		for (const block of sorted) {
			if (block.locked) {
				compacted.push({ ...block, position: { ...block.position } });
				this.registerOccupiedCells(block.position);
			}
		}

		// 2) Place unlocked blocks using first-fit while avoiding occupied cells
		for (const block of sorted) {
			if (block.locked) continue;

			const size = { w: block.position.w, h: block.position.h };
			const best = this.findCompactPosition(size, compacted);
			compacted.push({ ...block, position: best });
			this.registerOccupiedCells(best);
		}

		return compacted;
	}

	registerOccupiedCells(position = { x: 0, y: 0, w: 1, h: 1 }) {
		for (let y = position.y; y < position.y + position.h; y++) {
			for (let x = position.x; x < position.x + position.w; x++) {
				this.occupiedPositions.add(`${x}:${y}`);
			}
		}
	}

	/**
	 * Find the most compact position for a block
	 * @param {object} size - Block size {w, h}
	 * @param {Array} placedBlocks - Already placed blocks
	 * @returns {object} Compact position {x, y, w, h}
	 */
	findCompactPosition(size, placedBlocks = []) {
		// Try each row starting from 0
		for (let y = 0; y < 100; y++) {
			for (let x = 0; x <= this.columns - size.w; x++) {
				const position = { x, y, ...size };

				if (this.isPositionAvailable(position, placedBlocks)) {
					return position;
				}
			}
		}

		// Fallback
		return { x: 0, y: this.getMaxY(placedBlocks) + 1, ...size };
	}

	/**
	 * Convert pixel coordinates to grid position
	 * @param {number} pixelX - X coordinate in pixels
	 * @param {number} pixelY - Y coordinate in pixels
	 * @param {HTMLElement} container - Grid container element
	 * @returns {object} Grid position {x, y}
	 */
	pixelsToGridPosition(pixelX, pixelY, container) {
		const containerRect = container.getBoundingClientRect();
		const containerStyles = window.getComputedStyle(container);

		// Get container padding
		const paddingLeft = parseFloat(containerStyles.paddingLeft) || 0;
		const paddingTop = parseFloat(containerStyles.paddingTop) || 0;

		// Calculate available width and height
		const availableWidth = containerRect.width - paddingLeft * 2;
		const availableHeight = containerRect.height - paddingTop * 2;

		// Calculate column width including gap
		const columnWidth =
			(availableWidth - this.gap * (this.columns - 1)) / this.columns;

		// Convert to grid coordinates
		const relativeX = pixelX - paddingLeft;
		const relativeY = pixelY - paddingTop;

		const gridX = Math.floor(relativeX / (columnWidth + this.gap));
		const gridY = Math.floor(relativeY / 100); // Assume 100px row height

		return {
			x: Math.max(0, Math.min(gridX, this.columns - 1)),
			y: Math.max(0, gridY),
		};
	}

	/**
	 * Calculate responsive columns based on container width
	 * @param {number} containerWidth - Container width in pixels
	 * @returns {number} Number of columns for this width
	 */
	getResponsiveColumns(containerWidth) {
		if (!this.responsive) return this.columns;

		if (containerWidth < this.breakpoints.sm) {
			return Math.min(2, this.columns);
		} else if (containerWidth < this.breakpoints.md) {
			return Math.min(4, this.columns);
		} else if (containerWidth < this.breakpoints.lg) {
			return Math.min(8, this.columns);
		} else if (containerWidth < this.breakpoints.xl) {
			return Math.min(12, this.columns);
		} else {
			return this.columns;
		}
	}

	/**
	 * Adapt layout for different screen sizes
	 * @param {Array} blocks - Blocks to adapt
	 * @param {number} newColumns - New column count
	 * @returns {Array} Adapted block positions
	 */
	adaptLayoutForColumns(blocks, oldColumns, newColumns) {
		// Step 1: Scale all positions proportionally
		const scaled = blocks.map((block) => {
			const pos = block.position;

			let newW = Math.round((pos.w / oldColumns) * newColumns);
			newW = Math.max(1, Math.min(newW, newColumns));

			let newX = Math.round((pos.x / oldColumns) * newColumns);
			newX = Math.max(0, Math.min(newX, newColumns - newW));

			return {
				...block,
				position: { ...pos, x: newX, w: newW },
			};
		});

		// Step 2: Compact to resolve overlaps using the simplified optimizeLayout
		return this.optimizeLayout(scaled);
	}

	/**
	 * Validate a block position against grid constraints
	 * @param {object} position - Position to validate
	 * @returns {object} Validation result {valid, errors}
	 */
	validatePosition(position) {
		const errors = [];

		if (!position || typeof position !== "object") {
			errors.push("Position must be an object");
			return { valid: false, errors };
		}

		const { x, y, w, h } = position;

		if (!Number.isInteger(x) || x < 0) {
			errors.push("X position must be a non-negative integer");
		}

		if (!Number.isInteger(y) || y < 0) {
			errors.push("Y position must be a non-negative integer");
		}

		if (!Number.isInteger(w) || w < 1) {
			errors.push("Width must be a positive integer");
		}

		if (!Number.isInteger(h) || h < 1) {
			errors.push("Height must be a positive integer");
		}

		if (x + w > this.columns) {
			errors.push(
				`Block extends beyond grid (${x + w} > ${this.columns})`
			);
		}

		return { valid: errors.length === 0, errors };
	}

	/**
	 * Update layout configuration
	 * @param {object} options - New layout options
	 */
	updateConfig(options = {}) {
		if (options.columns && options.columns !== this.columns) {
			this.columns = options.columns;
		}

		if (options.gap && options.gap !== this.gap) {
			this.gap = options.gap;
		}

		if ("responsive" in options && options.responsive !== this.responsive) {
			this.responsive = options.responsive;
		}

		// Notify of changes
		if (this.onLayoutChange) {
			this.onLayoutChange({
				columns: this.columns,
				gap: this.gap,
				responsive: this.responsive,
			});
		}
	}

	/**
	 * Calculate grid statistics
	 * @param {Array} blocks - Blocks to analyze
	 * @returns {object} Grid statistics
	 */
	getLayoutStats(blocks = []) {
		if (blocks.length === 0) {
			return {
				totalBlocks: 0,
				occupiedCells: 0,
				utilization: 0,
				maxY: 0,
				averageBlockSize: 0,
			};
		}

		const maxY = this.getMaxY(blocks);
		const totalCells = this.columns * (maxY + 1);
		const occupiedCells = blocks.reduce((sum, block) => {
			return sum + block.position.w * block.position.h;
		}, 0);

		const averageBlockSize =
			blocks.reduce((sum, block) => {
				return sum + block.position.w * block.position.h;
			}, 0) / blocks.length;

		return {
			totalBlocks: blocks.length,
			occupiedCells,
			totalCells,
			utilization: totalCells > 0 ? occupiedCells / totalCells : 0,
			maxY,
			averageBlockSize,
		};
	}
}
