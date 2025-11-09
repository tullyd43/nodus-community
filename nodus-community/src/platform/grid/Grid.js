/**
 * @file Grid.js (Integrated with GridConfigSystem)
 * @description Modern grid with centralized configuration management
 */

import { AtomicElement } from "@platform/ui/AtomicElements.js";
import { ModernGridBlock } from "./components/GridBlock.js";
import { GridLayout } from "./utils/GridLayout.js";
import { gridConfig } from "./utils/GridConfigSystem.js";

export class ModernGrid extends AtomicElement {
	constructor(props = {}) {
		super("div", {
			...props,
			className: `nodus-grid modern-grid ${props.className || ""}`,
			"data-component": "modern-grid",
			"data-grid-id": props.id || crypto.randomUUID(),
		});

		// Initialize config system
		this.initializeConfig();

		// Grid configuration from centralized config (not hardcoded!)
		this.gridId = this.element.dataset.gridId;
		this.column = props.column ?? gridConfig.get("columns");
		this.cellHeight = props.cellHeight ?? gridConfig.get("cellHeight");
		this.margin = props.margin ?? gridConfig.get("gap");
		this.marginUnit = props.marginUnit ?? "px";

		// SINGLE REFLOW SYSTEM: Use centralized behavior config
		this.float = props.float ?? gridConfig.get("float");
		this.staticGrid = props.staticGrid ?? gridConfig.get("staticGrid");

		// Interaction settings from config
		this.animate = props.animate ?? gridConfig.get("animate");
		this.disableDrag = props.disableDrag ?? false;
		this.disableResize = props.disableResize ?? false;
		this.acceptWidgets = props.acceptWidgets ?? false;

		// Performance settings from config
		this.dragThreshold =
			props.dragThreshold ?? gridConfig.get("dragThreshold") ?? 8;
		this.maxLiveReflowWidgets = gridConfig.get("maxLiveReflowWidgets");

		this.dragStartPosition = null;
		this.isDragActive = false;
		this.draggedWidget = null;

		// Internal state
		this.widgets = new Map();
		this.placeholder = null;
		this.batchMode = false;

		// Backend integration
		this.actionDispatcher =
			props.actionDispatcher || window.__nodus?.actionDispatcher;
		this.orchestrator =
			props.orchestrator || window.__nodus?.asyncOrchestrator;

		// Layout engine
		this.layout = new GridLayout({
			columns: this.column,
			gap: this.margin,
			float: this.float,
		});

		// Setup grid
		this.setupGridStyles();
		this.setupGridInteractions();
		this.setupResponsive();
		this.setupConfigListeners();
	}

	/**
	 * Initialize configuration system
	 */
	async initializeConfig() {
		try {
			await gridConfig.initialize();
		} catch (error) {
			console.warn("[ModernGrid] Config initialization failed:", error);
		}
	}

	/**
	 * Setup listeners for configuration changes
	 */
	setupConfigListeners() {
		window.addEventListener("nodus-grid-config-changed", (e) => {
			this.handleConfigChange(e.detail);
		});
	}

	/**
	 * Handle configuration changes
	 */
	handleConfigChange(detail) {
		const { path, value } = detail;

		// Update local properties based on config changes
		switch (path) {
			case "columns":
				this.changeColumns(value);
				break;
			case "gap":
				this.margin = value;
				this.layout.gap = value;
				this.setupGridStyles();
				break;
			case "float":
				this.setFloat(value);
				break;
			case "staticGrid":
				this.staticGrid = value;
				this.setupGridInteractions();
				break;
			case "animate":
				this.animate = value;
				break;
			case "maxLiveReflowWidgets":
				this.maxLiveReflowWidgets = value;
				break;
		}
	}

	/**
	 * Check drag threshold
	 */
	checkDragThreshold(currentX, currentY) {
		if (!this.dragStartPosition) return false;
		const dx = currentX - this.dragStartPosition.x;
		const dy = currentY - this.dragStartPosition.y;
		const distance = Math.sqrt(dx * dx + dy * dy);
		return distance > this.dragThreshold;
	}

	/**
	 * Setup grid styles
	 */
	setupGridStyles() {
		// Calculate cell size for square blocks
		const cellSize = `minmax(80px, 1fr)`;

		const styles = {
			display: "grid",
			gridTemplateColumns: `repeat(${this.column}, 1fr)`,
			gridTemplateRows: `repeat(20, ${cellSize})`, // Start with 20 square rows
			gap: `${this.margin}${this.marginUnit}`,
			minHeight: "200px",
			position: "relative",
			// Allow scrolling instead of infinite expansion
			maxHeight: "80vh",
			overflowY: "auto",
		};

		Object.assign(this.element.style, styles);
	}

	/**
	 * Setup grid interactions
	 */
	setupGridInteractions() {
		if (this.staticGrid) {
			// Static grid - no interactions
			return;
		}

		// Drop zone
		this.element.addEventListener("dragover", (e) => {
			e.preventDefault();
			if (this.isDragActive) {
				this.handleDragOver(e);
			}
		});

		this.element.addEventListener("drop", (e) => {
			e.preventDefault();
			this.handleDrop(e);
		});
	}

	/**
	 * Setup responsive behavior
	 */
	setupResponsive() {
		// Simple responsive handling
		if (window.ResizeObserver) {
			new ResizeObserver(() => {
				this.updateGridHeight();
			}).observe(this.element);
		}
	}

	/**
	 * Add widget to grid
	 */
	addWidget(options = {}) {
		// Get default block size from centralized config (not hardcoded!)
		const defaultSize = gridConfig.getDefaultBlockSize();

		// Set defaults if not specified (use config, not hardcoded values)
		if (!options.w && !options.h) {
			options.w = defaultSize.w;
			options.h = defaultSize.h;
		} else if (options.w && !options.h) {
			options.h = options.w; // Make it square
		} else if (options.h && !options.w) {
			options.w = options.h; // Make it square
		}

		// Auto-position if needed
		if (
			options.autoPosition ||
			(options.x === undefined && options.y === undefined)
		) {
			const position = this.findNextAvailablePosition(
				options.w,
				options.h
			);
			options.x = position.x;
			options.y = position.y;
		}

		// Create widget
		const widget = new ModernGridBlock({
			...options,
			grid: this,
			actionDispatcher: this.actionDispatcher,
			orchestrator: this.orchestrator,
		});

		// Add to grid
		widget.mount(this);
		this.widgets.set(widget.id, widget);

		// Trigger reflow if needed
		if (!this.batchMode && !this.float) {
			this.compact();
		}

		// Emit event
		this.emitEvent("added", [widget]);

		return widget;
	}

	/**
	 * Remove widget
	 */
	removeWidget(widgetId, removeDOM = true, triggerEvent = true) {
		const widget =
			typeof widgetId === "string"
				? this.widgets.get(widgetId)
				: widgetId;
		if (!widget) return this;

		this.widgets.delete(widget.id);

		if (removeDOM && widget.element) {
			widget.element.remove();
		}

		// Trigger reflow if needed
		if (!this.batchMode && !this.float) {
			this.compact();
		}

		if (triggerEvent) {
			this.emitEvent("removed", [widget]);
		}

		return this;
	}

	/**
	 * Find next available position for auto-positioning
	 */
	findNextAvailablePosition(width = 2, height = 2) {
		const blocks = Array.from(this.widgets.values()).map((widget) => ({
			position: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
		}));

		// Use config defaults, not hardcoded
		const defaultSize = gridConfig.getDefaultBlockSize();
		return this.layout.findBestPosition(
			{ w: width || defaultSize.w, h: height || defaultSize.h },
			blocks
		);
	}

	/**
	 * Compact the grid (main reflow method)
	 */
	compact() {
		if (this.float) return; // No compacting in float mode

		const blocks = Array.from(this.widgets.values()).map((widget) => ({
			id: widget.id,
			locked: widget.locked || false,
			position: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
		}));

		const compacted = this.layout.optimizeLayout(blocks);

		// Apply new positions
		compacted.forEach((block) => {
			const widget = this.widgets.get(block.id);
			if (widget) {
				widget.updatePosition(block.position.x, block.position.y);
			}
		});

		this.updateGridHeight();
	}

	/**
	 * Handle drag over
	 */
	handleDragOver(e) {
		if (!this.draggedWidget) return;

		// Only start reflow after drag threshold
		if (!this.checkDragThreshold(e.clientX, e.clientY)) return;

		const targetPos = this.getGridPositionFromPixels(e.clientX, e.clientY);
		this.showPlaceholder(targetPos, {
			w: this.draggedWidget.w,
			h: this.draggedWidget.h,
		});

		// Performance optimization: throttle live reflow for many widgets
		if (!this.float && this.widgets.size < this.maxLiveReflowWidgets) {
			// Throttle reflow to avoid excessive DOM updates
			if (!this._reflowThrottle) {
				this._reflowThrottle = setTimeout(() => {
					this.handleLiveReflow(targetPos);
					this._reflowThrottle = null;
				}, gridConfig.get("reflowThrottleMs"));
			}
		}
	}

	/**
	 * Handle live reflow during drag
	 */
	handleLiveReflow(targetPos) {
		// STEP 1: Reset all widgets to their logical positions first
		this.widgets.forEach((widget) => {
			if (widget.id !== this.draggedWidget.id && !widget.locked) {
				widget.element.style.gridColumn = `${widget.x + 1} / span ${
					widget.w
				}`;
				widget.element.style.gridRow = `${widget.y + 1} / span ${
					widget.h
				}`;
				widget.element.classList.remove("grid-moving");
				// CRITICAL: Ensure widget stays visible
				widget.element.style.display = "";
				widget.element.style.opacity = "";
			}
		});

		// STEP 2: Keep dragged widget visible and at original position during drag
		if (this.draggedWidget) {
			this.draggedWidget.element.style.display = "";
			this.draggedWidget.element.style.opacity = "0.5"; // Semi-transparent
			this.draggedWidget.element.style.gridColumn = `${
				this.draggedWidget.x + 1
			} / span ${this.draggedWidget.w}`;
			this.draggedWidget.element.style.gridRow = `${
				this.draggedWidget.y + 1
			} / span ${this.draggedWidget.h}`;
		}

		// STEP 3: Temporarily place dragged widget at target position for layout calculation
		const draggedAtTarget = {
			x: targetPos.x,
			y: targetPos.y,
			w: this.draggedWidget.w,
			h: this.draggedWidget.h,
		};

		// STEP 4: Run a simplified compact with dragged widget at new position
		const allBlocks = Array.from(this.widgets.values())
			.filter((w) => w.id !== this.draggedWidget.id && !w.locked) // Only unlocked widgets
			.map((widget) => ({
				id: widget.id,
				locked: widget.locked || false,
				position: {
					x: widget.x,
					y: widget.y,
					w: widget.w,
					h: widget.h,
				},
			}));

		// Add locked widgets back (they don't move)
		Array.from(this.widgets.values())
			.filter((w) => w.locked)
			.forEach((widget) => {
				allBlocks.push({
					id: widget.id,
					locked: true,
					position: {
						x: widget.x,
						y: widget.y,
						w: widget.w,
						h: widget.h,
					},
				});
			});

		// Add dragged widget at target position
		allBlocks.push({
			id: this.draggedWidget.id,
			locked: false,
			position: draggedAtTarget,
		});

		// Run optimization to find new positions
		const optimized = this.layout.optimizeLayout(allBlocks);

		// STEP 5: Apply optimized positions temporarily (visual only)
		optimized.forEach((block) => {
			const widget = this.widgets.get(block.id);
			if (
				widget &&
				widget.id !== this.draggedWidget.id &&
				!widget.locked
			) {
				// Only apply if position actually changed
				if (
					block.position.x !== widget.x ||
					block.position.y !== widget.y
				) {
					widget.element.style.gridColumn = `${
						block.position.x + 1
					} / span ${widget.w}`;
					widget.element.style.gridRow = `${
						block.position.y + 1
					} / span ${widget.h}`;
					widget.element.classList.add("grid-moving");
				}
			}
		});

		// STEP 6: Update grid height to accommodate new layout
		const maxY = Math.max(
			...optimized.map((block) => block.position.y + block.position.h)
		);
		if (maxY > 0) {
			const cellSize = `minmax(80px, 1fr)`;
			this.element.style.gridTemplateRows = `repeat(${
				maxY + 5
			}, ${cellSize})`;
		}

		// SAFETY: Ensure grid columns stay intact during drag
		this.element.style.gridTemplateColumns = `repeat(${this.column}, 1fr)`;
	}

	/**
	 * Handle drop
	 */
	handleDrop(e) {
		const widgetId = e.dataTransfer.getData(
			"application/nodus-grid-widget"
		);
		const position = this.getGridPositionFromPixels(e.clientX, e.clientY);

		if (widgetId && this.draggedWidget) {
			// Update final position
			this.draggedWidget.x = position.x;
			this.draggedWidget.y = position.y;
			this.draggedWidget.updatePosition(position.x, position.y);

			// Final compaction
			if (!this.float) {
				this.compact();
			}

			this.emitEvent("change", [Array.from(this.widgets.values())]);
		}

		this.endDrag();
	}

	/**
	 * Start drag
	 */
	startDrag(widget, e) {
		this.isDragActive = true;
		this.draggedWidget = widget;
		this.dragStartPosition = { x: e.clientX, y: e.clientY };

		widget.element.classList.add("grid-dragging");

		// Store original position
		widget._originalPosition = { x: widget.x, y: widget.y };
	}

	/**
	 * End drag
	 */
	endDrag() {
		// Clear any pending reflow operations
		if (this._reflowThrottle) {
			clearTimeout(this._reflowThrottle);
			this._reflowThrottle = null;
		}

		if (this.draggedWidget) {
			this.draggedWidget.element.classList.remove("grid-dragging");
			this.draggedWidget = null;
		}

		// CRITICAL: Reset all widgets to their logical positions
		// Remove temporary visual positioning from live reflow
		this.widgets.forEach((widget) => {
			widget.element.style.gridColumn = `${widget.x + 1} / span ${
				widget.w
			}`;
			widget.element.style.gridRow = `${widget.y + 1} / span ${widget.h}`;
			widget.element.classList.remove("grid-moving");
			// Reset any opacity changes
			widget.element.style.opacity = "";
			widget.element.style.display = "";
		});

		this.removePlaceholder();
		this.isDragActive = false;
		this.dragStartPosition = null;

		// Update final grid height and ensure template integrity
		this.updateGridHeight();
		this.element.style.gridTemplateColumns = `repeat(${this.column}, 1fr)`;
	}

	/**
	 * Handle widget resize from GridBlock
	 */
	handleWidgetResize(widget, newW, newH) {
		// Validate size constraints
		const constrainedW = Math.max(
			widget.minW,
			Math.min(newW, widget.maxW || this.column)
		);
		const constrainedH = Math.max(
			widget.minH,
			Math.min(newH, widget.maxH || 100)
		);

		// Try to resize
		widget.updateSize(constrainedW, constrainedH);

		// Trigger reflow if not in float mode
		if (!this.float) {
			this.compact();
		}
	}

	/**
	 * Show placeholder
	 */
	showPlaceholder(position, size) {
		if (!this.placeholder) {
			this.placeholder = document.createElement("div");
			this.placeholder.className = "grid-placeholder";
			this.placeholder.style.cssText = `
				background: rgba(0, 0, 0, 0.1);
				border: 2px dashed #999;
				border-radius: 4px;
				pointer-events: none;
			`;
			this.element.appendChild(this.placeholder);
		}

		this.placeholder.style.gridColumn = `${position.x + 1} / span ${
			size.w
		}`;
		this.placeholder.style.gridRow = `${position.y + 1} / span ${size.h}`;
	}

	/**
	 * Remove placeholder
	 */
	removePlaceholder() {
		if (this.placeholder) {
			this.placeholder.remove();
			this.placeholder = null;
		}
	}

	/**
	 * Convert pixel coordinates to grid position
	 */
	getGridPositionFromPixels(x, y) {
		return this.layout.pixelsToGridPosition(x, y, this.element);
	}

	/**
	 * Update grid height by adding more rows as needed
	 */
	updateGridHeight() {
		if (this.widgets.size === 0) return;

		const maxY = Math.max(
			...Array.from(this.widgets.values()).map((w) => w.y + w.h)
		);

		// Add extra buffer rows and maintain square proportions
		const neededRows = maxY + 5; // Always have 5 extra rows
		const cellSize = `minmax(80px, 1fr)`;
		this.element.style.gridTemplateRows = `repeat(${neededRows}, ${cellSize})`;

		// Keep columns intact
		this.element.style.gridTemplateColumns = `repeat(${this.column}, 1fr)`;
	}

	/**
	 * Toggle float mode
	 */
	setFloat(enabled) {
		this.float = enabled;
		this.layout.float = enabled;

		if (!enabled) {
			this.compact(); // Compact when disabling float
		}
	}

	/**
	 * Change column count
	 */
	changeColumns(newColumns, layout = "compact") {
		if (newColumns === this.column) return;

		const oldColumns = this.column;
		this.column = newColumns;
		this.layout.columns = newColumns;

		// Update CSS
		this.element.style.gridTemplateColumns = `repeat(${newColumns}, 1fr)`;

		if (layout === "none") return;

		// Scale existing widgets
		const blocks = Array.from(this.widgets.values()).map((widget) => ({
			id: widget.id,
			locked: widget.locked || false,
			position: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
		}));

		const scaled = this.layout.adaptLayoutForColumns(
			blocks,
			oldColumns,
			newColumns
		);

		// Apply scaled positions
		scaled.forEach((block) => {
			const widget = this.widgets.get(block.id);
			if (widget) {
				widget.x = block.position.x;
				widget.y = block.position.y;
				widget.w = block.position.w;
				widget.updatePosition();
			}
		});
	}

	/**
	 * Batch mode for bulk operations
	 */
	batchUpdate(flag = true) {
		this.batchMode = flag;

		if (!flag && !this.float) {
			this.compact();
		}

		return this;
	}

	/**
	 * Get column count
	 */
	getColumn() {
		return this.column;
	}

	/**
	 * Emit custom event
	 */
	emitEvent(eventName, detail) {
		this.element.dispatchEvent(new CustomEvent(eventName, { detail }));
	}
}

export default ModernGrid;
