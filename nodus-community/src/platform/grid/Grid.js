/**
 * @file Grid.js (Hybrid Controller - Extensible)
 * @description "Smart" client-side grid controller.
 * - Imports and runs the WASM module for layout computation.
 * - Manages all grid state (widgets) in client-side memory.
 * - Calls the backend 'grid.*' commands for persistence and security.
 * - Supports custom block renderers for extensibility.
 */

// 1. IMPORT BRIDGES
// Note: ActionDispatcher instance is resolved at runtime inside the ModernGrid
// initialization so we don't rely on a module-level singleton (which could
// be created before the app bootstrap). Use `this._localDispatcher` after
// `initialize()` has been called.
import { gridConfig } from "./utils/GridConfigSystem.js";
import actionDispatcher from "@platform/ActionDispatcher.js";

// 2. LAZY-LOAD THE WASM ENGINE
// NOTE: path corrected to point from `src/platform/grid` to `src-tauri/grid-engine-wasm/pkg`
const wasmEngine = import(
	"../../../src-tauri/grid-engine-wasm/pkg/grid_engine_wasm.js"
);

export class ModernGrid {
	constructor(element, options = {}) {
		this.element =
			typeof element === "string"
				? document.querySelector(element)
				: element;
		if (!this.element) {
			throw new Error("Grid container not found");
		}

		this.gridId = options.gridId || "default";

		// Client-Side State
		this.widgets = new Map(); // Map<string, Widget>
		this.config = {};
		this.placeholder = null;
		this.dragPreview = null;
		this.isInitialized = false;
		this.wasm = null;
		// Will hold a reference to the runtime ActionDispatcher instance
		this._localDispatcher = null;

		// NEW: Map to store custom block rendering functions
		this.blockRenderers = new Map();

		// Drag state
		this.pointerDown = false;
		this.isDragging = false;
		this.isResizing = false;
		this.draggedWidget = null;
		this.dragOffset = { x: 0, y: 0 };
		this.lastDragPosition = { x: 0, y: 0 };
		this.throttleMs = 16;
	}

	async initialize() {
		try {
			// Load WASM engine first
			const wasmModule = await wasmEngine;
			await wasmModule.default();
			this.wasm = wasmModule;

			// Use the shared singleton ActionDispatcher
			this._localDispatcher = actionDispatcher;

			const gridData = await this._localDispatcher.dispatch(
				"grid.config.load",
				{
					containerId: this.gridId,
				}
			);

			this.config = gridData
				? this._dbConfigToJs(gridData)
				: gridConfig.get();
			this.throttleMs = this.config.reflowThrottleMs || 16;

			this.widgets.clear();
			if (gridData && gridData.blocks) {
				gridData.blocks.forEach((dbBlock) => {
					const widget = this._dbBlockToWidget(dbBlock);
					this.widgets.set(widget.id, widget);
				});
			}

			this.setupGridCSS();
			this.setupPointerEvents();
			this._applyLayout(Array.from(this.widgets.values()), true);

			this.isInitialized = true;
			console.log(
				`[Grid] Initialized (Hybrid: WASM + Secure Backend) for grid: ${this.gridId}`
			);
		} catch (e) {
			console.error("Failed to initialize hybrid grid:", e);
		}
	}

	setupGridCSS() {
		this.element.style.display = "grid";
		this.element.style.gridTemplateColumns = `repeat(${this.config.columns}, 1fr)`;
		this.element.style.gridAutoRows = `${this.config.cellHeight || 80}px`;
		this.element.style.gap = `${this.config.gap || 8}px`;
		this.element.style.position = "relative";
		this.element.classList.add("nodus-grid", "modern-grid");
	}

	setupPointerEvents() {
		this.element.addEventListener(
			"pointerdown",
			this._handlePointerDown.bind(this)
		);
		window.addEventListener(
			"pointermove",
			this._handlePointerMove.bind(this)
		);
		window.addEventListener("pointerup", this._handlePointerUp.bind(this));
	}

	// NEW: Public method to add custom renderers
	/**
	 * Registers a custom rendering function for a specific block_type.
	 * @param {string} blockType - The name of the block type (e.g., 'chart', 'log').
	 * @param {Function} renderFunction - A function that takes (element, widget) and renders content.
	 */
	registerBlockRenderer(blockType, renderFunction) {
		if (typeof renderFunction !== "function") {
			console.error(
				`[Grid] Failed to register renderer for '${blockType}': not a function.`
			);
			return;
		}
		this.blockRenderers.set(blockType, renderFunction);
		console.log(
			`[Grid] Registered custom block renderer for '${blockType}'.`
		);
	}

	async addWidget(props = {}) {
		if (!this.isInitialized) return;
		try {
			const defaultSize = this.config.defaultBlockSize || { w: 2, h: 2 };
			const newWidget = {
				id: props.id || crypto.randomUUID(),
				position: {
					x: props.x ?? 0,
					y: props.y ?? 0,
					w: props.w ?? defaultSize.w,
					h: props.h ?? defaultSize.h,
				},
				locked: props.locked ?? false,
				content: props.content || "",
				title: props.title || "New Widget",
				block_type: props.block_type || "html", // Default to 'html'
				config: props.config || {},
			};

			const allWidgets = Array.from(this.widgets.values());
			newWidget.position = this.wasm.findBestPosition(
				allWidgets,
				newWidget,
				this.config
			);

			const blockConfig = this._widgetToDbBlock(newWidget);
			const result = await this._localDispatcher.dispatch(
				"grid.block.add",
				{
					containerId: this.gridId,
					blockConfig: blockConfig,
				}
			);

			// Robustly extract blockId from dispatcher result. Different plugin
			// layers may wrap the payload (e.g., { blockId } or { success, data: { blockId } }).
			const blockId =
				result?.blockId ??
				result?.data?.blockId ??
				result?.data?.data?.blockId;
			if (!blockId) {
				// If dispatcher returned a structured error include it to aid debugging
				if (result && result.error) {
					console.error(
						`[Grid] grid.block.add failed: ${result.error}`,
						result
					);
				} else {
					console.error(
						"[Grid] grid.block.add returned no blockId:",
						result
					);
				}
				return null;
			}

			newWidget.id = blockId; // Get the real ID from the backend

			this.widgets.set(newWidget.id, newWidget);
			this._createWidgetElement(newWidget); // This will now use the factory

			const finalLayout = this.wasm.optimizeLayout(
				Array.from(this.widgets.values()),
				this.config
			);
			this._applyLayout(finalLayout, false, true);

			this.saveLayout(finalLayout);

			return this.widgets.get(newWidget.id);
		} catch (e) {
			console.error("Failed to add widget:", e);
			return null;
		}
	}

	async removeWidget(widgetId) {
		if (!this.isInitialized || !this.widgets.has(widgetId)) return;
		try {
			const widget = this.widgets.get(widgetId);

			const finalLayout = this.wasm.optimizeLayout(
				Array.from(this.widgets.values()),
				this.config
			);
			// Removed stray object fragment
			this._applyLayout(finalLayout, false, true);

			await this._localDispatcher.dispatch("grid.block.remove", {
				containerId: this.gridId,
				blockId: widgetId,
			});

			this.saveLayout(finalLayout);

			return true;
		} catch (e) {
			console.error("Failed to remove widget:", e);
			return false;
		}
	}

	// ... (Pointer handlers _handlePointerDown, _handlePointerMove, _handlePointerUp remain the same) ...
	_handlePointerDown(event) {
		const widget = this._getWidgetFromElement(event.target);
		if (!this.isInitialized || !widget || widget.locked) return;
		event.preventDefault();
		this.pointerDown = true;
		this.draggedWidget = widget;

		const blockRect = widget.element.getBoundingClientRect();
		this.dragOffset = {
			x: event.clientX - blockRect.left,
			y: event.clientY - blockRect.top,
		};
		if (event.target.classList.contains("resize-handle")) {
			// (Resize logic would go here)
		} else {
			this.isDragging = true;
			this.lastDragPosition = {
				x: widget.position.x,
				y: widget.position.y,
			};
			document.body.style.cursor = "grabbing";
		}
	}

	_handlePointerMove(event) {
		if (!this.pointerDown || !this.isDragging || !this.draggedWidget)
			return;

		if (!this.dragPreview) {
			this.createDragPreview(this.draggedWidget, event);
			this.draggedWidget.element.style.opacity = "0";
		}
		this.updateDragPreviewPosition(event);

		const now = Date.now();
		if (now - (this.lastMoveTime || 0) < this.throttleMs) return;
		this.lastMoveTime = now;

		const newPos = this._getGridPositionFromPixels(
			event.clientX,
			event.clientY,
			true
		);
		newPos.x = Math.max(
			0,
			Math.min(
				newPos.x,
				this.config.columns - this.draggedWidget.position.w
			)
		);
		newPos.y = Math.max(0, newPos.y);

		if (
			newPos.x === this.lastDragPosition.x &&
			newPos.y === this.lastDragPosition.y
		) {
			return;
		}
		this.lastDragPosition = newPos;

		const allWidgets = Array.from(this.widgets.values());
		const dragged = allWidgets.find((w) => w.id === this.draggedWidget.id);
		dragged.position.x = newPos.x;
		dragged.position.y = newPos.y;

		const newLayout = this.wasm.resolveConflicts(
			allWidgets,
			this.config,
			this.draggedWidget.id
		);

		this._applyLayout(newLayout);
		const newDraggedPos = newLayout.find(
			(w) => w.id === this.draggedWidget.id
		).position;
		this.showPlaceholder(newDraggedPos);
	}

	_handlePointerUp(event) {
		if (!this.pointerDown || !this.draggedWidget) return;

		this.pointerDown = false;
		this.isDragging = false;
		document.body.style.cursor = "default";

		this.hidePlaceholder();
		this.removeDragPreview();
		this.draggedWidget.element.style.opacity = "";

		const finalLayout = this.wasm.optimizeLayout(
			Array.from(this.widgets.values()),
			this.config
		);

		this._applyLayout(finalLayout, false, true);

		this.saveLayout(finalLayout);

		this.draggedWidget = null;
	}

	saveLayout(layout) {
		const dbConfig = {
			config_id: this.gridId,
			columns: this.config.columns,
			metadata: this.config.metadata,
			blocks: layout.map((widget) =>
				this._widgetToDbBlock(this.widgets.get(widget.id))
			),
		};

		this._localDispatcher
			.dispatch("grid.layout.update", {
				containerId: this.gridId,
				layoutConfig: dbConfig,
			})
			.then(() => console.log(`[Grid] Layout saved for ${this.gridId}.`))
			.catch((e) => console.error("Failed to save layout:", e));
	}

	// ---
	// 6. HELPER FUNCTIONS
	// ---

	_dbConfigToJs(dbConfig) {
		return {
			columns: dbConfig.columns || 12,
			gap: 8,
			cellHeight: 80,
			metadata: dbConfig.metadata,
		};
	}

	_dbBlockToWidget(dbBlock) {
		return {
			id: dbBlock.id,
			position: {
				x: dbBlock.x,
				y: dbBlock.y,
				w: dbBlock.w,
				h: dbBlock.h,
			} || { x: 0, y: 0, w: 2, h: 2 },
			locked: false,
			content: dbBlock.config.content || null, // MODIFIED: Default to null
			title: dbBlock.title,
			block_type: dbBlock.block_type,
			config: dbBlock.config,
		};
	}

	_widgetToDbBlock(widget) {
		return {
			id: widget.id,
			x: widget.position.x,
			y: widget.position.y,
			w: widget.position.w,
			h: widget.position.h,
			title: widget.title,
			block_type: widget.block_type,
			config: widget.config || { content: widget.content },
			// Ensure `static_grid` is always present for backend deserialization
			static_grid: widget.static_grid || false,
			entity_id: widget.entity_id || null,
		};
	}

	_applyLayout(widgets, isInitialLoad = false, updateLocalState = false) {
		if (!Array.isArray(widgets)) return;
		widgets.forEach((widgetData) => {
			const widget = this.widgets.get(widgetData.id);
			const pos = widgetData.position;

			if (widget) {
				if (updateLocalState) {
					widget.position = pos;
					widget.locked = widgetData.locked;
				}
				if (!widget.element) {
					// This will now use the factory to render
					this._createWidgetElement(widget);
				}
				widget.element.style.gridColumn = `${pos.x + 1} / span ${
					pos.w
				}`;
				widget.element.style.gridRow = `${pos.y + 1} / span ${pos.h}`;
			}
		});
	}

	// MODIFIED: This function is now the "Factory"
	_createWidgetElement(widget) {
		const el = document.createElement("div");
		el.className = "grid-widget";
		el.draggable = false;
		el.dataset.widgetId = widget.id;

		// Apply base styles
		el.style.cssText = `
			background: white; border: 1px solid #ddd; border-radius: 4px;
			padding: 8px; cursor: ${widget.locked ? "default" : "grab"};
			user-select: none; position: relative; box-sizing: border-box;
            /* Add flex display to help content rendering */
            display: flex; flex-direction: column;
            overflow: hidden; /* Prevent content from breaking layout */
		`;

		// Link element to state
		widget.element = el;
		this.element.appendChild(el);

		// --- FACTORY LOGIC ---
		const renderer = this.blockRenderers.get(widget.block_type);

		if (renderer) {
			try {
				// Pass the element to render into, and the full widget data
				renderer(el, widget);
			} catch (e) {
				console.error(
					`[Grid] Error in custom renderer for '${widget.block_type}':`,
					e
				);
				el.innerHTML = `<div style="padding:10px;color:red;">Error: ${e.message}</div>`;
			}
		} else {
			// Default HTML renderer (fallback)
			if (widget.content) {
				el.innerHTML = widget.content;
			} else {
				// Show a helpful placeholder if no content and no renderer
				el.innerHTML = `
                    <div style="opacity: 0.5; padding: 10px; text-align: center;">
                        <strong style="display: block; margin-bottom: 5px;">${
							widget.title || "Block"
						}</strong>
                        <code style="font-size: 0.8em; word-break: break-all;">(No renderer for '${
							widget.block_type
						}')</code>
                    </div>
                `;
			}
		}
		// --- END FACTORY ---

		return widget;
	}

	_getWidgetFromElement(element) {
		const widgetEl = element.closest("[data-widget-id]");
		return widgetEl ? this.widgets.get(widgetEl.dataset.widgetId) : null;
	}

	_getGridPositionFromPixels(clientX, clientY, useDragOffset = false) {
		const rect = this.element.getBoundingClientRect();
		let adjustedX = clientX;
		let adjustedY = clientY;

		if (useDragOffset) {
			adjustedX = clientX - this.dragOffset.x;
			adjustedY = clientY - this.dragOffset.y;
		}
		const relativeX = adjustedX - rect.left;
		const relativeY = adjustedY - rect.top;

		const gridGap = this.config.gap || 8;
		const gridColumns = this.config.columns || 12;
		const gridCellHeight = this.config.cellHeight || 80;

		const columnWidth =
			(rect.width - gridGap * (gridColumns - 1)) / gridColumns;

		const gridX = Math.round(relativeX / (columnWidth + gridGap));
		const gridY = Math.round(relativeY / (gridCellHeight + gridGap));

		return {
			x: Math.max(0, Math.min(gridX, gridColumns - 1)),
			y: Math.max(0, gridY),
		};
	}

	// ... (Drag preview and placeholder methods remain the same) ...
	createDragPreview(widget, event) {
		this.removeDragPreview();
		this.dragPreview = widget.element.cloneNode(true);
		this.dragPreview.id = widget.id + "-preview";
		this.dragPreview.style.cssText = `
			position: fixed; pointer-events: none; z-index: 10000;
			transform: scale(1.02); opacity: 0.8; transition: none;
			box-shadow: 0 8px 16px rgba(0,0,0,0.3);
			width: ${widget.element.offsetWidth}px;
			height: ${widget.element.offsetHeight}px;
			cursor: grabbing;
		`;
		this.updateDragPreviewPosition(event);
		document.body.appendChild(this.dragPreview);
	}

	updateDragPreviewPosition(event) {
		if (!this.dragPreview) return;
		this.dragPreview.style.left = event.clientX - this.dragOffset.x + "px";
		this.dragPreview.style.top = event.clientY - this.dragOffset.y + "px";
	}

	removeDragPreview() {
		if (this.dragPreview) {
			this.dragPreview.remove();
			this.dragPreview = null;
		}
	}

	showPlaceholder(position) {
		if (!this.placeholder) {
			this.placeholder = document.createElement("div");
			this.placeholder.className = "grid-placeholder";
			this.placeholder.style.cssText = `
				background: rgba(59, 130, 246, 0.2);
				border: 2px dashed #3b82f6; border-radius: 4px;
				pointer-events: none; z-index: 1;
				transition: grid-column 0.1s ease, grid-row 0.1s ease;
			`;
			this.element.appendChild(this.placeholder);
		}

		this.placeholder.style.gridColumn = `${position.x + 1} / span ${
			position.w
		}`;
		this.placeholder.style.gridRow = `${position.y + 1} / span ${
			position.h
		}`;
	}

	hidePlaceholder() {
		if (this.placeholder) {
			this.placeholder.remove();
			this.placeholder = null;
		}
	}
}
