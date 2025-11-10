/**
 * @file GridLayout.js (FIXED - Proper upward movement reflow)
 * @description Pure layout calculation utility with proper GridStack.js behavior
 * Key fixes:
 * 1. Dynamic config reading (no static state)
 * 2. Proper upward movement (not aggressive repositioning)
 * 3. Clean separation of concerns
 */

import { gridConfig } from "./GridConfigSystem.js";

export class GridLayout {
	constructor(options = {}) {
		this.columns = options.columns || 24;
		this.gap = options.gap || 16;
		this.responsive = options.responsive !== false;
		this.onLayoutChange = options.onLayoutChange || null;

		// Layout state for collision detection
		this.occupiedPositions = new Set();

		// Responsive breakpoints
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
	 */
	findBestPosition(block, existingBlocks = []) {
		const defaultSize = {
			w: block.position?.w || block.w || 1,
			h: block.position?.h || block.h || 1,
		};

		this.buildOccupiedPositions(existingBlocks);

		// Simple top-left, left-to-right scan
		for (let y = 0; y < 1000; y++) {
			for (let x = 0; x <= this.columns - defaultSize.w; x++) {
				const position = { x, y, ...defaultSize };
				if (this.isPositionAvailable(position, existingBlocks)) {
					return position;
				}
			}
		}

		return { x: 0, y: this.getMaxY(existingBlocks) + 1, ...defaultSize };
	}

	/**
	 * Check if a position is available (no collisions)
	 */
	isPositionAvailable(position, existingBlocks = []) {
		if (position.x < 0 || position.y < 0) return false;
		if (position.x + position.w > this.columns) return false;

		// Fast lookup using occupied positions
		if (this.occupiedPositions && this.occupiedPositions.size > 0) {
			for (let yy = position.y; yy < position.y + position.h; yy++) {
				for (let xx = position.x; xx < position.x + position.w; xx++) {
					if (this.occupiedPositions.has(`${xx}:${yy}`)) return false;
				}
			}
			return true;
		}

		// Fallback to direct collision checking
		for (const block of existingBlocks) {
			if (this.blocksCollide(position, block.position)) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Rebuild occupied positions for fast collision detection
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
	 */
	blocksCollide(blockA, blockB) {
		return !(
			blockA.x >= blockB.x + blockB.w ||
			blockB.x >= blockA.x + blockA.w ||
			blockA.y >= blockB.y + blockB.h ||
			blockB.y >= blockA.y + blockA.h
		);
	}

	/**
	 * Get the maximum Y position of existing blocks
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
	 * 🎯 FIXED: Optimize layout with proper GridStack.js behavior
	 * - Reads current config dynamically (no static state)
	 * - Float mode: preserve positions, just validate bounds
	 * - Compact mode: move blocks upward only (no aggressive repositioning)
	 */
	optimizeLayout(blocks = []) {
		// 🎯 DYNAMIC CONFIG: Read current setting each time
		const currentFloat = gridConfig.get("float");

		if (currentFloat) {
			// Float mode: just validate bounds, preserve positions
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

		// Compact mode: GridStack.js upward movement
		return this.compactUpward(blocks);
	}

	/**
	 * 🎯 PROPER GRIDSTACK REFLOW: Downward cascading collision resolution
	 * When dragged block collides, push colliding blocks downward (cascade)
	 */
	resolveConflicts(blocks = []) {
		const currentFloat = gridConfig.get("float");

		if (currentFloat) {
			// Float mode: just validate bounds, no conflict resolution
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

		// Find the dragged block
		const draggedBlock = blocks.find((b) => b.isDragged);
		if (!draggedBlock) {
			console.log(
				"[GridLayout] No dragged block found, using standard compaction"
			);
			return this.compactUpward(blocks);
		}

		console.log(
			`[GridLayout] GridStack reflow: dragged block at (${draggedBlock.position.x},${draggedBlock.position.y})`
		);

		// Compact mode: GridStack-style downward cascading
		return this.cascadeDownward(blocks, draggedBlock);
	}

	/**
	 * 🎯 GRIDSTACK ALGORITHM: Cascade blocks downward when collisions occur
	 * Then compact upward to fill gaps
	 */
	cascadeDownward(blocks, draggedBlock) {
		// Start with all blocks in their current positions
		const result = blocks.map((b) => ({
			...b,
			position: { ...b.position },
		}));

		// Sort by Y position (top to bottom) for processing order
		const sortedBlocks = result
			.filter((b) => !b.isDragged && !b.locked)
			.sort((a, b) => a.position.y - b.position.y);

		// Place the dragged block at its target position first
		const draggedResult = result.find((b) => b.isDragged);

		// Step 1: Push blocks down to resolve collisions
		for (const block of sortedBlocks) {
			// Check if this block collides with the dragged block
			if (this.blocksCollide(block.position, draggedResult.position)) {
				console.log(
					`[GridLayout] Collision: pushing ${block.id} down from y=${block.position.y}`
				);

				// Push this block down below the dragged block
				block.position.y =
					draggedResult.position.y + draggedResult.position.h;

				console.log(
					`[GridLayout] Pushed ${block.id} to y=${block.position.y}`
				);
			}

			// Check for cascading collisions with blocks processed earlier
			this.resolveCascadingCollisions(
				block,
				result.filter((b) => !b.isDragged)
			);
		}

		// Step 2: Compact upward to fill gaps (except dragged block)
		this.compactUpwardExceptDragged(result, draggedResult);

		return result;
	}

	/**
	 * 🎯 LIVE REFLOW COMPACTION: Move blocks upward to fill gaps, but preserve dragged block position
	 */
	compactUpwardExceptDragged(blocks, draggedBlock) {
		// Build occupied positions map excluding the dragged block
		this.occupiedPositions.clear();
		this.registerOccupiedCells(draggedBlock.position);

		// Sort non-dragged blocks by Y position (top to bottom)
		const sortedBlocks = blocks
			.filter((b) => !b.isDragged && !b.locked)
			.sort((a, b) => {
				if (a.position.y !== b.position.y)
					return a.position.y - b.position.y;
				return a.position.x - b.position.x;
			});

		// For each block, try to move it as high as possible
		for (const block of sortedBlocks) {
			const currentPos = { ...block.position };

			// Find the highest possible Y position
			let newY = currentPos.y;
			while (newY > 0) {
				const testPos = { ...currentPos, y: newY - 1 };

				if (this.canPlaceAt(testPos)) {
					newY = testPos.y;
				} else {
					break; // Can't move up anymore
				}
			}

			if (newY !== block.position.y) {
				console.log(
					`[GridLayout] Live compact: moving ${block.id} up from y=${block.position.y} to y=${newY}`
				);
				block.position.y = newY;
			}

			// Register this block's new position
			this.registerOccupiedCells(block.position);
		}
	}

	/**
	 * 🎯 CASCADING: Handle chain reactions when moved blocks hit other blocks
	 */
	resolveCascadingCollisions(movedBlock, allBlocks) {
		let hadCollision;
		do {
			hadCollision = false;

			for (const otherBlock of allBlocks) {
				if (otherBlock.id === movedBlock.id || otherBlock.locked)
					continue;

				if (
					this.blocksCollide(movedBlock.position, otherBlock.position)
				) {
					const newY = movedBlock.position.y + movedBlock.position.h;

					if (newY > otherBlock.position.y) {
						console.log(
							`[GridLayout] Cascade: pushing ${otherBlock.id} to y=${newY}`
						);
						otherBlock.position.y = newY;
						hadCollision = true;
					}
				}
			}
		} while (hadCollision); // Keep cascading until no more collisions
	}

	/**
	 * 🎯 SEPARATED CONCERN: Resolve overlapping blocks
	 * Fixed: No more bulldozing - find optimal positions for all blocks
	 */
	resolveOverlaps(blocks = []) {
		// Separate the dragged block from others for special handling
		const draggedBlock = blocks.find(
			(b) => b.id.includes("temp-") || b.isDragged
		);
		const otherBlocks = blocks.filter((b) => b !== draggedBlock);

		console.log(
			`[GridLayout] Resolving conflicts: ${
				draggedBlock ? "with" : "without"
			} dragged block`
		);

		const resolved = [];
		this.occupiedPositions.clear();

		// Place locked blocks first (they never move)
		const lockedBlocks = otherBlocks.filter((b) => b.locked);
		const unlockedBlocks = otherBlocks.filter((b) => !b.locked);

		for (const block of lockedBlocks) {
			resolved.push({ ...block, position: { ...block.position } });
			this.registerOccupiedCells(block.position);
		}

		// If there's a dragged block, try to place it at desired position
		if (draggedBlock) {
			if (this.canPlaceAt(draggedBlock.position)) {
				// Dragged block fits - place it
				resolved.push({
					...draggedBlock,
					position: { ...draggedBlock.position },
				});
				this.registerOccupiedCells(draggedBlock.position);
				console.log(
					`[GridLayout] Dragged block placed at desired position`
				);
			} else {
				// Collision detected - find new positions for EVERYONE, not just push one block
				console.log(
					`[GridLayout] Collision detected - redistributing all blocks`
				);
				return this.redistributeAllBlocks(
					draggedBlock,
					unlockedBlocks,
					resolved
				);
			}
		}

		// Place remaining unlocked blocks in optimal positions
		const sortedUnlocked = unlockedBlocks.sort((a, b) => {
			if (a.position.y !== b.position.y)
				return a.position.y - b.position.y;
			return a.position.x - b.position.x;
		});

		for (const block of sortedUnlocked) {
			const bestPosition = this.findOptimalPosition(block.position);
			resolved.push({ ...block, position: bestPosition });
			this.registerOccupiedCells(bestPosition);
		}

		return resolved;
	}

	/**
	 * 🎯 NEW: Redistribute all blocks when collision occurs - no bulldozing
	 */
	redistributeAllBlocks(draggedBlock, otherUnlockedBlocks, alreadyPlaced) {
		console.log(
			`[GridLayout] Redistributing ${otherUnlockedBlocks.length} blocks to avoid bulldozing`
		);

		const resolved = [...alreadyPlaced]; // Start with locked blocks

		// Find best position for dragged block first, but be flexible
		const draggedPosition = this.findOptimalPosition(draggedBlock.position);
		resolved.push({ ...draggedBlock, position: draggedPosition });
		this.registerOccupiedCells(draggedPosition);

		console.log(
			`[GridLayout] Dragged block placed at (${draggedPosition.x},${draggedPosition.y})`
		);

		// Now place other blocks in their best available positions
		// Sort by distance from their original positions to minimize disruption
		const sortedOthers = otherUnlockedBlocks
			.map((block) => ({
				...block,
				originalDistance:
					Math.abs(block.position.x - draggedBlock.position.x) +
					Math.abs(block.position.y - draggedBlock.position.y),
			}))
			.sort((a, b) => a.originalDistance - b.originalDistance);

		for (const block of sortedOthers) {
			const bestPosition = this.findOptimalPosition(block.position);
			resolved.push({ ...block, position: bestPosition });
			this.registerOccupiedCells(bestPosition);

			console.log(
				`[GridLayout] Repositioned block to (${bestPosition.x},${bestPosition.y})`
			);
		}

		return resolved;
	}

	/**
	 * 🎯 IMPROVED: Find optimal position without bulldozing bias
	 */
	findOptimalPosition(desiredPosition) {
		// Try the desired position first
		if (this.canPlaceAt(desiredPosition)) {
			return { ...desiredPosition };
		}

		// Find the nearest available position in ANY direction
		let bestDistance = Infinity;
		let bestPosition = null;

		// Search in a reasonable radius around the desired position
		for (let deltaY = 0; deltaY < 10; deltaY++) {
			for (let deltaX = -6; deltaX <= 6; deltaX++) {
				const testPos = {
					...desiredPosition,
					x: desiredPosition.x + deltaX,
					y: desiredPosition.y + deltaY,
				};

				if (this.isPositionValid(testPos) && this.canPlaceAt(testPos)) {
					const distance = Math.abs(deltaX) + Math.abs(deltaY);
					if (distance < bestDistance) {
						bestDistance = distance;
						bestPosition = testPos;
					}
				}
			}
		}

		if (bestPosition) {
			console.log(
				`[GridLayout] Found optimal position at distance ${bestDistance}: (${bestPosition.x},${bestPosition.y})`
			);
			return bestPosition;
		}

		// Fallback: first available position from top
		for (let y = 0; y < 20; y++) {
			for (let x = 0; x <= this.columns - desiredPosition.w; x++) {
				const fallbackPos = { ...desiredPosition, x, y };
				if (this.canPlaceAt(fallbackPos)) {
					console.log(
						`[GridLayout] Fallback position: (${fallbackPos.x},${fallbackPos.y})`
					);
					return fallbackPos;
				}
			}
		}

		// Last resort
		return {
			...desiredPosition,
			x: 0,
			y: this.getMaxYFromOccupied() + 2,
		};
	}

	/**
	 * 🎯 IMPROVED: Find best available position with symmetrical wall handling
	 */
	findBestAvailablePosition(desiredPosition, alreadyPlaced) {
		// Try the desired position first
		if (this.canPlaceAt(desiredPosition)) {
			console.log(
				`[GridLayout] Desired position available: (${desiredPosition.x},${desiredPosition.y})`
			);
			return { ...desiredPosition };
		}

		console.log(
			`[GridLayout] Desired position (${desiredPosition.x},${desiredPosition.y}) occupied, searching...`
		);

		// Smart search: try to minimize displacement
		const candidates = [];

		// Search in expanding rings around the desired position
		for (let deltaY = 0; deltaY < 15; deltaY++) {
			for (let deltaX = 0; deltaX <= 8; deltaX++) {
				// Try same column first (deltaX = 0)
				if (deltaX === 0) {
					const downPos = {
						...desiredPosition,
						y: desiredPosition.y + deltaY,
					};

					if (
						this.isPositionValid(downPos) &&
						this.canPlaceAt(downPos)
					) {
						console.log(
							`[GridLayout] Found position below: (${downPos.x},${downPos.y})`
						);
						return downPos;
					}
				} else {
					// Try both left and right simultaneously
					const rightPos = {
						...desiredPosition,
						x: desiredPosition.x + deltaX,
						y: desiredPosition.y + deltaY,
					};

					const leftPos = {
						...desiredPosition,
						x: desiredPosition.x - deltaX,
						y: desiredPosition.y + deltaY,
					};

					// Check right position
					if (
						this.isPositionValid(rightPos) &&
						this.canPlaceAt(rightPos)
					) {
						candidates.push({
							pos: rightPos,
							distance: deltaX + deltaY,
							direction: "right",
						});
					}

					// Check left position
					if (
						this.isPositionValid(leftPos) &&
						this.canPlaceAt(leftPos)
					) {
						candidates.push({
							pos: leftPos,
							distance: deltaX + deltaY,
							direction: "left",
						});
					}
				}
			}

			// If we found candidates, pick the closest one
			if (candidates.length > 0) {
				const best = candidates.sort(
					(a, b) => a.distance - b.distance
				)[0];
				console.log(
					`[GridLayout] Found position ${best.direction}: (${best.pos.x},${best.pos.y}), distance: ${best.distance}`
				);
				return best.pos;
			}
		}

		// Better fallback: find the first available position from top-left
		for (let y = 0; y < 50; y++) {
			for (let x = 0; x <= this.columns - desiredPosition.w; x++) {
				const fallbackPos = {
					...desiredPosition,
					x,
					y,
				};

				if (this.canPlaceAt(fallbackPos)) {
					console.log(
						`[GridLayout] Fallback position: (${fallbackPos.x},${fallbackPos.y})`
					);
					return fallbackPos;
				}
			}
		}

		// Last resort
		const lastResort = {
			...desiredPosition,
			x: 0,
			y: this.getMaxYFromOccupied() + 2,
		};

		console.log(
			`[GridLayout] Last resort: (${lastResort.x},${lastResort.y})`
		);
		return lastResort;
	}

	/**
	 * Check if position is within grid bounds
	 */
	isPositionValid(position) {
		return (
			position.x >= 0 &&
			position.x + position.w <= this.columns &&
			position.y >= 0
		);
	}

	/**
	 * 🎯 COMPOSABLE: Find available position for a block, handling conflicts
	 * Fixed to prevent "kick back to start" behavior
	 */
	findAvailablePosition(desiredPosition) {
		// Try the desired position first
		if (this.canPlaceAt(desiredPosition)) {
			return { ...desiredPosition };
		}

		// If desired position is occupied, find the next best position
		// Expand search area and prefer keeping X position when possible
		for (let deltaY = 0; deltaY < 20; deltaY++) {
			// Try to keep the same X position first
			const sameXPos = {
				...desiredPosition,
				y: desiredPosition.y + deltaY,
			};

			if (
				sameXPos.x + sameXPos.w <= this.columns &&
				this.canPlaceAt(sameXPos)
			) {
				console.log(
					`[GridLayout] Found position at same X: (${sameXPos.x},${sameXPos.y})`
				);
				return sameXPos;
			}

			// Then spiral outward from the desired position
			for (let deltaX = 1; deltaX <= this.columns; deltaX++) {
				// Try right
				const rightPos = {
					...desiredPosition,
					x: Math.min(
						desiredPosition.x + deltaX,
						this.columns - desiredPosition.w
					),
					y: desiredPosition.y + deltaY,
				};

				if (rightPos.x >= 0 && this.canPlaceAt(rightPos)) {
					console.log(
						`[GridLayout] Found position to the right: (${rightPos.x},${rightPos.y})`
					);
					return rightPos;
				}

				// Try left
				const leftPos = {
					...desiredPosition,
					x: Math.max(0, desiredPosition.x - deltaX),
					y: desiredPosition.y + deltaY,
				};

				if (
					leftPos.x + leftPos.w <= this.columns &&
					this.canPlaceAt(leftPos)
				) {
					console.log(
						`[GridLayout] Found position to the left: (${leftPos.x},${leftPos.y})`
					);
					return leftPos;
				}
			}
		}

		// BETTER FALLBACK: Try to preserve X position if possible, otherwise use leftmost available
		const fallbackY = this.getMaxYFromOccupied() + 2;

		// First try to keep the desired X position
		const preserveXPos = {
			...desiredPosition,
			y: fallbackY,
		};

		if (preserveXPos.x + preserveXPos.w <= this.columns) {
			console.log(
				`[GridLayout] Fallback: preserving X position at (${preserveXPos.x},${preserveXPos.y})`
			);
			return preserveXPos;
		}

		// Last resort: leftmost position that fits
		const lastResort = {
			...desiredPosition,
			x: 0,
			y: fallbackY,
		};

		console.log(
			`[GridLayout] Last resort fallback: (${lastResort.x},${lastResort.y})`
		);
		return lastResort;
	}

	/**
	 * Get max Y from currently occupied positions
	 */
	getMaxYFromOccupied() {
		if (this.occupiedPositions.size === 0) return 0;

		let maxY = 0;
		for (const pos of this.occupiedPositions) {
			const [x, y] = pos.split(":").map(Number);
			maxY = Math.max(maxY, y);
		}
		return maxY;
	}

	/**
	 * 🎯 SEPARATED CONCERN: Pure upward compaction logic
	 * Moves blocks up to eliminate gaps, preserves relative positioning
	 */
	compactUpward(blocks = []) {
		// Sort top-to-bottom, left-to-right for consistent processing
		const sorted = [...blocks].sort((a, b) => {
			if (a.position.y !== b.position.y)
				return a.position.y - b.position.y;
			return a.position.x - b.position.x;
		});

		const compacted = [];
		this.occupiedPositions.clear();

		// First pass: Place all locked blocks
		for (const block of sorted) {
			if (block.locked) {
				compacted.push({ ...block, position: { ...block.position } });
				this.registerOccupiedCells(block.position);
			}
		}

		// Second pass: Move unlocked blocks upward
		for (const block of sorted) {
			if (block.locked) continue;

			const currentPos = { ...block.position };
			const newY = this.findHighestPosition(currentPos);

			const finalPos = { ...currentPos, y: newY };
			compacted.push({ ...block, position: finalPos });
			this.registerOccupiedCells(finalPos);
		}

		return compacted;
	}

	/**
	 * 🎯 COMPOSABLE: Find highest available position for a block
	 * Pure function that only moves upward
	 */
	findHighestPosition(position) {
		let newY = position.y;

		// Move upward until collision or top reached
		while (newY > 0) {
			const testPos = { ...position, y: newY - 1 };

			if (this.canPlaceAt(testPos)) {
				newY = testPos.y;
			} else {
				break; // Hit something, can't move further up
			}
		}

		return newY;
	}

	/**
	 * 🎯 COMPOSABLE: Check if block can be placed at position
	 * Pure function for collision detection
	 */
	canPlaceAt(position) {
		for (let yy = position.y; yy < position.y + position.h; yy++) {
			for (let xx = position.x; xx < position.x + position.w; xx++) {
				if (this.occupiedPositions.has(`${xx}:${yy}`)) {
					return false;
				}
			}
		}
		return true;
	}

	/**
	 * Register occupied cells in the grid
	 */
	registerOccupiedCells(position = { x: 0, y: 0, w: 1, h: 1 }) {
		for (let y = position.y; y < position.y + position.h; y++) {
			for (let x = position.x; x < position.x + position.w; x++) {
				this.occupiedPositions.add(`${x}:${y}`);
			}
		}
	}

	/**
	 * Convert pixel coordinates to grid position
	 */
	pixelsToGridPosition(pixelX, pixelY, container) {
		const containerRect = container.getBoundingClientRect();
		const containerStyles = window.getComputedStyle(container);

		const paddingLeft = parseFloat(containerStyles.paddingLeft) || 0;
		const paddingTop = parseFloat(containerStyles.paddingTop) || 0;
		const availableWidth = containerRect.width - paddingLeft * 2;

		const columnWidth =
			(availableWidth - this.gap * (this.columns - 1)) / this.columns;
		const relativeX = pixelX - paddingLeft;
		const relativeY = pixelY - paddingTop;

		const gridX = Math.floor(relativeX / (columnWidth + this.gap));
		const gridY = Math.floor(relativeY / 100);

		return {
			x: Math.max(0, Math.min(gridX, this.columns - 1)),
			y: Math.max(0, gridY),
		};
	}

	/**
	 * Calculate responsive columns based on container width
	 */
	getResponsiveColumns(containerWidth) {
		if (!this.responsive) return this.columns;

		if (containerWidth < 320) {
			return Math.min(4, this.columns);
		} else if (containerWidth < this.breakpoints.sm) {
			return Math.min(6, this.columns);
		} else if (containerWidth < this.breakpoints.md) {
			return Math.min(8, this.columns);
		} else if (containerWidth < this.breakpoints.lg) {
			return Math.min(12, this.columns);
		} else if (containerWidth < this.breakpoints.xl) {
			return Math.min(18, this.columns);
		} else {
			return this.columns;
		}
	}

	/**
	 * Adapt layout for different screen sizes
	 */
	adaptLayoutForColumns(blocks, oldColumns, newColumns) {
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

		return this.optimizeLayout(scaled);
	}

	/**
	 * Validate a block position against grid constraints
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
