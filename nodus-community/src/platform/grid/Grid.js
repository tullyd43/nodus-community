/**
 * @file Grid.js (CLEAN IMPLEMENTATION)
 * @description Simple grid with proper reflow behavior
 * Key features:
 * 1. Clean separation of concerns
 * 2. Simple drag handling
 * 3. Proper reflow triggers
 * 4. Dynamic config integration
 */

import { gridConfig } from "./utils/GridConfigSystem.js";
import { GridLayout } from "./utils/GridLayout.js";

export class ModernGrid {
	constructor(element, options = {}) {
		// DOM setup
		this.element =
			typeof element === "string"
				? document.querySelector(element)
				: element;

		if (!this.element) {
			throw new Error("Grid container not found");
		}

		// Configuration - read from config system
		this.gridId = options.gridId || crypto.randomUUID();
		this.column = options.columns || gridConfig.get("columns");
		this.cellHeight = options.cellHeight || gridConfig.get("cellHeight");
		this.margin = options.gap || gridConfig.get("gap");

		// Grid state
		this.widgets = new Map();
		this.draggedWidget = null;
		this.placeholder = null;

		// Layout engine
		this.layout = new GridLayout({
			columns: this.column,
			gap: this.margin,
			responsive: options.responsive !== false,
		});

		// Setup
		this.setupGridCSS();
		this.setupDragEvents();
		this.setupConfigListeners();

		console.log("[Grid] Initialized:", {
			columns: this.column,
			cellHeight: this.cellHeight,
			gap: this.margin,
			float: gridConfig.get("float"),
		});
	}

	/**
	 * Setup CSS Grid layout
	 */
	setupGridCSS() {
		this.element.style.display = "grid";
		this.element.style.gridTemplateColumns = `repeat(${this.column}, 1fr)`;
		this.element.style.gridAutoRows = `${this.cellHeight}px`;
		this.element.style.gap = `${this.margin}px`;
		this.element.style.position = "relative";
		this.element.style.minHeight = "400px";

		// Add CSS class for styling
		this.element.classList.add("nodus-grid", "modern-grid");
	}

	/**
	 * Setup drag and drop events
	 */
	setupDragEvents() {
		this.element.addEventListener("dragstart", (e) => {
			const widget = this.getWidgetFromElement(e.target);
			if (widget) {
				this.handleDragStart(widget, e);
			}
		});

		this.element.addEventListener("dragover", (e) => {
			e.preventDefault();
			if (this.draggedWidget) {
				this.handleDragOver(e);
			}
		});

		this.element.addEventListener("drop", (e) => {
			e.preventDefault();
			if (this.draggedWidget) {
				this.handleDrop(e);
			}
		});

		this.element.addEventListener("dragend", () => {
			this.handleDragEnd();
		});
	}

	/**
	 * Setup config change listeners
	 */
	setupConfigListeners() {
		window.addEventListener("nodus-grid-config-changed", (e) => {
			const { path, value } = e.detail;

			switch (path) {
				case "columns":
					this.column = value;
					this.layout.updateConfig({ columns: value });
					this.setupGridCSS();
					break;
				case "gap":
					this.margin = value;
					this.layout.updateConfig({ gap: value });
					this.setupGridCSS();
					break;
				case "cellHeight":
					this.cellHeight = value;
					this.setupGridCSS();
					break;
				case "float":
					// No action needed - layout engine reads this dynamically
					console.log("[Grid] Float mode changed to:", value);
					break;
			}
		});
	}

	/**
	 * Add a widget to the grid
	 */
	addWidget(props = {}) {
		const widget = this.createWidget(props);

		// Auto-position if needed
		if (
			props.autoPosition ||
			(props.x === undefined && props.y === undefined)
		) {
			const position = this.findBestPosition(widget);
			widget.x = position.x;
			widget.y = position.y;
		}

		// Add to grid
		this.widgets.set(widget.id, widget);
		this.element.appendChild(widget.element);
		widget.updatePosition();

		console.log("[Grid] Added widget:", {
			id: widget.id,
			position: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
		});

		return widget;
	}

	/**
	 * Create a widget object with resize functionality - with debug logging
	 */
	createWidget(props) {
		const defaultSize = gridConfig.getDefaultBlockSize();

		const widget = {
			id: props.id || crypto.randomUUID(),
			x: props.x ?? 0,
			y: props.y ?? 0,
			w: props.w ?? defaultSize.w,
			h: props.h ?? defaultSize.h,
			minW: props.minW ?? 1,
			minH: props.minH ?? 1,
			maxW: props.maxW ?? this.column,
			maxH: props.maxH ?? 10,
			locked: props.locked ?? false,
			noResize: props.noResize ?? false,
			content: props.content || "",
		};

		console.log(
			`[Grid] Creating widget: ${widget.id}, source: ${
				props.isLoadedFromStorage ? "STORAGE" : "NEW"
			}`
		);

		// Create DOM element
		const el = document.createElement("div");
		el.className = "grid-widget";
		el.draggable = !widget.locked;
		el.dataset.widgetId = widget.id;
		el.innerHTML = widget.content;

		// Add basic styling
		el.style.cssText = `
			background: white;
			border: 1px solid #ddd;
			border-radius: 4px;
			padding: 8px;
			cursor: ${widget.locked ? "default" : "move"};
			user-select: none;
			position: relative;
			box-sizing: border-box;
		`;

		// Add resize handle if not locked and resize is enabled
		if (!widget.locked && !widget.noResize) {
			const resizeHandle = document.createElement("div");
			resizeHandle.className = "resize-handle";
			resizeHandle.style.cssText = `
				position: absolute;
				bottom: 0;
				right: 0;
				width: 12px;
				height: 12px;
				background: #007bff;
				cursor: nw-resize;
				border-radius: 0 0 4px 0;
				opacity: 0.7;
			`;
			resizeHandle.addEventListener("mousedown", (e) => {
				e.stopPropagation();
				this.startResize(widget, e);
			});
			el.appendChild(resizeHandle);
		}

		widget.element = el;

		// Position update method
		widget.updatePosition = () => {
			el.style.gridColumn = `${widget.x + 1} / span ${widget.w}`;
			el.style.gridRow = `${widget.y + 1} / span ${widget.h}`;
		};

		console.log(
			`[Grid] Widget ${widget.id} created successfully with drag support`
		);
		return widget;
	}

	/**
	 * Start resize operation
	 */
	startResize(widget, event) {
		event.preventDefault();

		const startMouseX = event.clientX;
		const startMouseY = event.clientY;
		const startW = widget.w;
		const startH = widget.h;

		console.log("[Grid] Resize started:", widget.id);

		const handleMouseMove = (e) => {
			const deltaX = e.clientX - startMouseX;
			const deltaY = e.clientY - startMouseY;

			// Calculate new size based on mouse delta
			const cellWidth = this.element.offsetWidth / this.column;
			const deltaW = Math.round(deltaX / cellWidth);
			const deltaH = Math.round(deltaY / this.cellHeight);

			const newW = Math.max(
				widget.minW,
				Math.min(startW + deltaW, widget.maxW)
			);
			const newH = Math.max(
				widget.minH,
				Math.min(startH + deltaH, widget.maxH)
			);

			// Constrain to grid bounds
			const maxW = this.column - widget.x;
			const constrainedW = Math.min(newW, maxW);

			if (constrainedW !== widget.w || newH !== widget.h) {
				widget.w = constrainedW;
				widget.h = newH;
				widget.updatePosition();

				// Force collision resolution during resize
				// Use resolveConflicts like drag does, not compact (which ignores overlaps)
				const blocks = Array.from(this.widgets.values()).map((w) => ({
					id: w.id,
					locked: w.locked,
					isDragged: w.id === widget.id, // Mark resized widget as dragged
					position: { x: w.x, y: w.y, w: w.w, h: w.h },
				}));
				const resolved = this.layout.resolveConflicts(blocks);
				resolved.forEach((block) => {
					const w = this.widgets.get(block.id);
					if (w) {
						w.x = block.position.x;
						w.y = block.position.y;
						w.updatePosition();
					}
				});
			}
		};

		const handleMouseUp = () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);

			// Use resolveConflicts like drag does, not compact (which ignores overlaps)
			const blocks = Array.from(this.widgets.values()).map((w) => ({
				id: w.id,
				locked: w.locked,
				isDragged: w.id === widget.id, // Mark resized widget as dragged
				position: { x: w.x, y: w.y, w: w.w, h: w.h },
			}));
			const resolved = this.layout.resolveConflicts(blocks);
			resolved.forEach((block) => {
				const w = this.widgets.get(block.id);
				if (w) {
					w.x = block.position.x;
					w.y = block.position.y;
					w.updatePosition();
				}
			});

			console.log("[Grid] Resize completed:", {
				widget: widget.id,
				size: { w: widget.w, h: widget.h },
			});
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
	}

	/**
	 * Find best position for new widget - with collision handling
	 */
	findBestPosition(widget) {
		const existingBlocks = Array.from(this.widgets.values()).map((w) => ({
			id: w.id,
			locked: w.locked,
			position: { x: w.x, y: w.y, w: w.w, h: w.h },
		}));

		const position = this.layout.findBestPosition(
			{ position: { w: widget.w, h: widget.h } },
			existingBlocks
		);

		// If not in float mode, reflow existing blocks to make room
		if (!gridConfig.get("float")) {
			this.makeRoomForWidget(position, widget);
		}

		return position;
	}

	/**
	 * Make room for a widget at the specified position by moving other blocks
	 */
	makeRoomForWidget(targetPosition, newWidget) {
		console.log("[Grid] Making room at:", targetPosition);

		// Create temp layout with the new widget
		const tempBlocks = Array.from(this.widgets.values()).map((w) => ({
			id: w.id,
			locked: w.locked,
			position: { x: w.x, y: w.y, w: w.w, h: w.h },
		}));

		// Add the new widget to temp layout
		tempBlocks.push({
			id: "temp-new-widget",
			locked: false,
			position: {
				x: targetPosition.x,
				y: targetPosition.y,
				w: newWidget.w,
				h: newWidget.h,
			},
		});

		console.log(
			"[Grid] Before conflict resolution:",
			tempBlocks.length,
			"blocks"
		);

		// Let layout engine resolve collisions
		const optimized = this.layout.resolveConflicts(tempBlocks);

		console.log("[Grid] After conflict resolution, applying positions");

		// Apply positions to existing widgets (they'll move out of the way)
		optimized.forEach((block) => {
			if (block.id !== "temp-new-widget") {
				const widget = this.widgets.get(block.id);
				if (widget) {
					const oldPos = { x: widget.x, y: widget.y };
					const newPos = { x: block.position.x, y: block.position.y };

					if (oldPos.x !== newPos.x || oldPos.y !== newPos.y) {
						console.log(
							`[Grid] Moving widget ${widget.id} from (${oldPos.x},${oldPos.y}) to (${newPos.x},${newPos.y})`
						);
						widget.x = newPos.x;
						widget.y = newPos.y;
						widget.updatePosition();
					}
				}
			}
		});
	}

	/**
	 * Get widget from DOM element
	 */
	getWidgetFromElement(element) {
		const widgetEl = element.closest("[data-widget-id]");
		if (widgetEl) {
			return this.widgets.get(widgetEl.dataset.widgetId);
		}
		return null;
	}

	/**
	 * Handle drag start
	 */
	handleDragStart(widget, event) {
		if (widget.locked) {
			event.preventDefault();
			return;
		}

		this.draggedWidget = widget;
		// Calculate cursor offset within the dragged block
		const blockRect = widget.element.getBoundingClientRect();
		this.dragOffset = {
			x: event.clientX - blockRect.left,
			y: event.clientY - blockRect.top,
		};
		widget.element.style.opacity = "0"; // Hide original but keep drag events

		console.log("[Grid] Drag started:", widget.id);
		// Create smooth cursor-following preview
		this.createDragPreview(widget, event);
	}

	/**
	 * Create smooth cursor-following preview
	 */
	createDragPreview(widget, event) {
		// Remove any existing preview
		this.removeDragPreview();

		// Clone the widget element
		this.dragPreview = widget.element.cloneNode(true);
		this.dragPreview.id = widget.id + "-preview";
		this.dragPreview.style.cssText = `
			position: fixed;
			pointer-events: none;
			z-index: 10000;
			transform: scale(1.02);
			opacity: 0.8;
			transition: none;
			box-shadow: 0 8px 16px rgba(0,0,0,0.3);
			width: ${widget.element.offsetWidth}px;
			height: ${widget.element.offsetHeight}px;
		`;

		// Position at cursor
		this.updateDragPreviewPosition(event);

		// Add to document
		document.body.appendChild(this.dragPreview);
	}

	/**
	 * Update drag preview position to follow cursor
	 */
	updateDragPreviewPosition(event) {
		if (!this.dragPreview) return;

		this.dragPreview.style.left = event.clientX - this.dragOffset.x + "px";
		this.dragPreview.style.top = event.clientY - this.dragOffset.y + "px";
	}

	/**
	 * Remove drag preview
	 */
	removeDragPreview() {
		if (this.dragPreview) {
			this.dragPreview.remove();
			this.dragPreview = null;
		}
	}

	/**
	 * Handle drag over - show placeholder and live reflow
	 */
	handleDragOver(event) {
		// Update smooth cursor preview position
		this.updateDragPreviewPosition(event);
		const dragPosition = this.getGridPositionFromPixels(
			event.clientX,
			event.clientY
		);

		// Constrain to grid bounds
		dragPosition.x = Math.max(
			0,
			Math.min(dragPosition.x, this.column - this.draggedWidget.w)
		);
		dragPosition.y = Math.max(0, dragPosition.y);

		// Calculate where the block will ACTUALLY end up after reflow
		const finalPosition = this.calculateFinalPosition(dragPosition);

		// Show placeholder at FINAL position (where it will actually land)
		this.showPlaceholder(finalPosition, this.draggedWidget);

		// Live reflow if enabled
		const shouldReflow =
			!gridConfig.get("float") && !gridConfig.get("staticGrid");

		if (
			shouldReflow &&
			this.widgets.size <= gridConfig.get("maxLiveReflowWidgets")
		) {
			this.performLiveReflow(dragPosition);
		}
	}

	/**
	 * Calculate where block will actually end up after reflow algorithm
	 */
	calculateFinalPosition(dragPosition) {
		// In float mode, block stays exactly where dropped
		if (gridConfig.get("float")) {
			return dragPosition;
		}

		// In compact mode, calculate where reflow will place it
		const tempBlocks = Array.from(this.widgets.values()).map((w) => ({
			id: w.id,
			locked: w.locked,
			position:
				w.id === this.draggedWidget.id
					? { x: dragPosition.x, y: dragPosition.y, w: w.w, h: w.h }
					: { x: w.x, y: w.y, w: w.w, h: w.h },
		}));

		const optimized = this.layout.optimizeLayout(tempBlocks);
		const draggedBlock = optimized.find(
			(block) => block.id === this.draggedWidget.id
		);

		return draggedBlock ? draggedBlock.position : dragPosition;
	}

	/**
	 * Perform live reflow during drag - with conflict resolution
	 */
	performLiveReflow(targetPosition) {
		const tempBlocks = Array.from(this.widgets.values()).map((w) => ({
			id: w.id,
			locked: w.locked,
			isDragged: w.id === this.draggedWidget.id,
			originalPosition:
				w.id === this.draggedWidget.id
					? { x: this.draggedWidget.x, y: this.draggedWidget.y } // Original position
					: null,
			position:
				w.id === this.draggedWidget.id
					? {
							x: targetPosition.x,
							y: targetPosition.y,
							w: w.w,
							h: w.h,
					  }
					: { x: w.x, y: w.y, w: w.w, h: w.h },
		}));

		console.log(
			`[Grid] Live reflow: dragged widget ${this.draggedWidget.id} from (${this.draggedWidget.x},${this.draggedWidget.y}) to (${targetPosition.x},${targetPosition.y})`
		);

		// Use conflict resolution with proper dragged block detection
		const optimized = this.layout.resolveConflicts(tempBlocks);
		// CRITICAL: Update dragged widget position to current target
		// so next iteration uses this as the new "original" position
		this.draggedWidget.x = targetPosition.x;
		this.draggedWidget.y = targetPosition.y;

		// Update positions of all widgets except the dragged one
		optimized.forEach((block) => {
			const widget = this.widgets.get(block.id);
			if (widget && widget.id !== this.draggedWidget.id) {
				if (
					block.position.x !== widget.x ||
					block.position.y !== widget.y
				) {
					console.log(
						`[Grid] Live reflow: moving ${widget.id} from (${widget.x},${widget.y}) to (${block.position.x},${block.position.y})`
					);
					widget.x = block.position.x;
					widget.y = block.position.y;
					widget.updatePosition();
				}
			}
		});
	}

	/**
	 * Handle drop
	 */
	handleDrop(event) {
		const position = this.getGridPositionFromPixels(
			event.clientX,
			event.clientY
		);

		// Update widget position
		this.draggedWidget.x = Math.max(
			0,
			Math.min(position.x, this.column - this.draggedWidget.w)
		);
		this.draggedWidget.y = Math.max(0, position.y);
		this.draggedWidget.updatePosition();

		// Final compaction
		const shouldCompact =
			!gridConfig.get("float") && !gridConfig.get("staticGrid");
		if (shouldCompact) {
			this.compact();
		}

		console.log("[Grid] Drop completed:", {
			widget: this.draggedWidget.id,
			position: { x: this.draggedWidget.x, y: this.draggedWidget.y },
		});
	}

	/**
	 * Handle drag end
	 */
	handleDragEnd() {
		if (this.draggedWidget) {
			this.draggedWidget.element.style.opacity = ""; // Show original again
			this.draggedWidget = null;
		}
		this.hidePlaceholder();
		this.removeDragPreview();
	}

	/**
	 * Show placeholder at position
	 */
	showPlaceholder(position, widget) {
		this.hidePlaceholder();

		this.placeholder = document.createElement("div");
		this.placeholder.className = "grid-placeholder";
		this.placeholder.style.cssText = `
			grid-column: ${position.x + 1} / span ${widget.w};
			grid-row: ${position.y + 1} / span ${widget.h};
			background: rgba(59, 130, 246, 0.2);
			border: 2px dashed #3b82f6;
			border-radius: 4px;
			pointer-events: none;
			z-index: 100;
		`;

		this.element.appendChild(this.placeholder);
	}

	/**
	 * Hide placeholder
	 */
	hidePlaceholder() {
		if (this.placeholder) {
			this.placeholder.remove();
			this.placeholder = null;
		}
	}

	/**
	 * Convert pixel coordinates to grid position - simple and clean
	 */
	getGridPositionFromPixels(clientX, clientY) {
		const rect = this.element.getBoundingClientRect();
		// Adjust cursor position by drag offset to represent block's top-left corner
		let adjustedX = clientX;
		let adjustedY = clientY;

		if (this.dragOffset && this.draggedWidget) {
			adjustedX = clientX - this.dragOffset.x;
			adjustedY = clientY - this.dragOffset.y;
		}
		const relativeX = adjustedX - rect.left;
		const relativeY = adjustedY - rect.top;

		const columnWidth =
			(rect.width - this.margin * (this.column - 1)) / this.column;
		const rowHeight = this.cellHeight;

		const gridX = Math.floor(relativeX / (columnWidth + this.margin));
		const gridY = Math.floor(relativeY / (rowHeight + this.margin));

		return {
			x: Math.max(0, Math.min(gridX, this.column - 1)),
			y: Math.max(0, gridY),
		};
	}

	/**
	 * Compact the grid layout
	 */
	compact() {
		const blocks = Array.from(this.widgets.values()).map((w) => ({
			id: w.id,
			locked: w.locked,
			position: { x: w.x, y: w.y, w: w.w, h: w.h },
		}));

		const optimized = this.layout.optimizeLayout(blocks);

		// Update widget positions
		optimized.forEach((block) => {
			const widget = this.widgets.get(block.id);
			if (widget) {
				widget.x = block.position.x;
				widget.y = block.position.y;
				widget.updatePosition();
			}
		});

		console.log("[Grid] Layout compacted");
	}

	/**
	 * Remove widget
	 */
	removeWidget(widgetId) {
		const widget = this.widgets.get(widgetId);
		if (!widget) return false;

		widget.element.remove();
		this.widgets.delete(widgetId);

		// Compact if needed
		const shouldCompact =
			!gridConfig.get("float") && !gridConfig.get("staticGrid");
		if (shouldCompact) {
			this.compact();
		}

		return true;
	}

	/**
	 * Clear all widgets
	 */
	clear() {
		this.widgets.forEach((widget) => widget.element.remove());
		this.widgets.clear();
		this.hidePlaceholder();
	}

	/**
	 * Serialize grid state
	 */
	serialize() {
		return {
			widgets: Array.from(this.widgets.values()).map((w) => ({
				id: w.id,
				x: w.x,
				y: w.y,
				w: w.w,
				h: w.h,
				locked: w.locked,
				content: w.content,
			})),
		};
	}

	/**
	 * Load grid state - using addWidget for proper initialization
	 */
	load(data) {
		this.clear();

		if (data.widgets && Array.isArray(data.widgets)) {
			data.widgets.forEach((widgetData) => {
				// Use addWidget to ensure proper drag setup and event handlers
				this.addWidget({
					...widgetData,
					isLoadedFromStorage: true, // Debug flag
					autoPosition: false, // Use saved positions exactly
				});
			});
		}

		console.log(
			`[Grid] Loaded ${data.widgets?.length || 0} widgets from storage`
		);
	}
}
