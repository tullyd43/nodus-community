/**
 * @file GridBlock.js (Integrated with GridConfigSystem)
 * @description Modern grid block that uses centralized configuration
 */

import { AtomicElement } from "@platform/ui/AtomicElements.js";
import { gridConfig } from "../utils/GridConfigSystem.js";

export class ModernGridBlock extends AtomicElement {
	constructor(props = {}) {
		super("div", {
			...props,
			className: `nodus-grid-item ${props.className || ""}`,
			"data-component": "modern-grid-block",
			"data-grid-id": props.id || crypto.randomUUID(),
		});

		// Initialize config system if not already done
		this.initializeConfig();

		// Modern grid block properties - USE CONFIG DEFAULTS!
		this.gridId = this.element.dataset.gridId;
		this.x = props.x ?? 0;
		this.y = props.y ?? 0;

		// USE CENTRALIZED CONFIG instead of hardcoded 2,2
		const defaultSize = gridConfig.getDefaultBlockSize();
		this.w = props.w ?? defaultSize.w;
		this.h = props.h ?? defaultSize.h;

		this.minW = props.minW ?? 1;
		this.minH = props.minH ?? 1;
		this.maxW = props.maxW ?? null;
		this.maxH = props.maxH ?? null;
		this.locked = props.locked ?? false;
		this.static = props.static ?? false;
		this.noResize = props.noResize ?? false;
		this.noMove = props.noMove ?? false;
		this.autoPosition = props.autoPosition ?? false;
		this.content = props.content || "";

		// Interaction state
		this.isDragging = false;
		this.isResizing = false;
		this.resizeDirection = null;
		this.dragOffset = { x: 0, y: 0 };

		// Backend integration
		this.actionDispatcher =
			props.actionDispatcher || window.__nodus?.actionDispatcher;
		this.orchestrator =
			props.orchestrator || window.__nodus?.asyncOrchestrator;
		this.grid = props.grid; // Parent grid reference

		// Setup component with modern grid features
		this.setupModernGridStyles();
		this.buildModernGridContent();
		this.setupModernGridInteractions();
		this.setupResizeHandles();
		this.updatePosition();
		this.initializeBackend();

		// Listen for config changes
		this.setupConfigListeners();
	}

	/**
	 * Initialize config system
	 */
	async initializeConfig() {
		if (!gridConfig || !gridConfig.get) {
			console.warn(
				"[GridBlock] GridConfig not initialized, initializing now..."
			);
			try {
				await gridConfig.initialize();
			} catch (error) {
				console.error(
					"[GridBlock] Failed to initialize config:",
					error
				);
			}
		}
	}

	/**
	 * Listen for configuration changes
	 */
	setupConfigListeners() {
		window.addEventListener("nodus-grid-config-changed", (e) => {
			this.handleConfigChange(e.detail);
		});
	}

	/**
	 * Handle configuration changes
	 */
	handleConfigChange(configChange) {
		const { path, value } = configChange;

		// Update behavior based on config changes
		if (path === "defaultBlockSize.w" || path === "defaultBlockSize.h") {
			// For existing blocks, only update if they're currently using default size
			const currentDefaultSize = gridConfig.getDefaultBlockSize();

			// This could be enhanced to track if block was created with defaults
			// For now, just log the change
			console.log(
				`[GridBlock ${this.gridId}] Default block size changed:`,
				currentDefaultSize
			);
		}

		if (path === "animate") {
			// Update animation behavior
			this.element.style.transition = value ? "all 0.3s ease" : "none";
		}

		if (path === "gap") {
			// Grid will handle gap changes, but blocks might need to know
			this.updatePosition();
		}
	}

	setupModernGridStyles() {
		// Modern CSS Grid positioning
		const styles = {
			gridColumn: `${this.x + 1} / span ${this.w}`,
			gridRow: `${this.y + 1} / span ${this.h}`,
			position: "relative",
			backgroundColor: "var(--grid-item-bg, #ffffff)",
			border: "var(--grid-item-border, 1px solid #e0e0e0)",
			borderRadius: "var(--grid-item-radius, 8px)",
			boxShadow: "var(--grid-item-shadow, 0 2px 4px rgba(0,0,0,0.1))",
			padding: "var(--grid-item-padding, 16px)",
			transition: gridConfig.get("animate") ? "all 0.3s ease" : "none",
			overflow: "hidden",
			display: "flex",
			flexDirection: "column",
			minHeight: "60px",
			cursor: this.locked ? "default" : "move",
		};

		// Apply styles
		Object.assign(this.element.style, styles);

		// Update data attributes for easier debugging
		this.element.dataset.gridX = this.x;
		this.element.dataset.gridY = this.y;
		this.element.dataset.gridW = this.w;
		this.element.dataset.gridH = this.h;
		this.element.dataset.gridLocked = this.locked;
	}

	buildModernGridContent() {
		// Clear existing content
		this.element.innerHTML = "";

		// Header with title and controls
		const header = document.createElement("div");
		header.className = "grid-item-header";
		header.style.cssText = `
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 8px;
			font-weight: 500;
			font-size: 14px;
			color: var(--grid-item-title-color, #333);
		`;

		// Title
		const title = document.createElement("span");
		title.className = "grid-item-title";
		title.textContent = this.title || `Widget ${this.gridId.slice(0, 8)}`;
		header.appendChild(title);

		// Controls container
		const controls = document.createElement("div");
		controls.className = "grid-item-controls";
		controls.style.cssText = `
			display: flex;
			gap: 4px;
			opacity: 0.6;
			transition: opacity 0.2s;
		`;

		// Add controls if not locked and not static
		if (!this.locked && !this.static) {
			// Settings button
			const settingsBtn = document.createElement("button");
			settingsBtn.innerHTML = "⚙️";
			settingsBtn.title = "Settings";
			settingsBtn.style.cssText = `
				background: none;
				border: none;
				cursor: pointer;
				font-size: 12px;
				opacity: 0.7;
				transition: opacity 0.2s;
			`;
			settingsBtn.onmouseenter = () => (settingsBtn.style.opacity = "1");
			settingsBtn.onmouseleave = () =>
				(settingsBtn.style.opacity = "0.7");
			controls.appendChild(settingsBtn);

			// Remove button
			const removeBtn = document.createElement("button");
			removeBtn.innerHTML = "✕";
			removeBtn.title = "Remove";
			removeBtn.style.cssText = `
				background: none;
				border: none;
				cursor: pointer;
				font-size: 12px;
				color: #ff4444;
				opacity: 0.7;
				transition: opacity 0.2s;
			`;
			removeBtn.onmouseenter = () => (removeBtn.style.opacity = "1");
			removeBtn.onmouseleave = () => (removeBtn.style.opacity = "0.7");
			removeBtn.onclick = (e) => {
				e.stopPropagation();
				this.remove();
			};
			controls.appendChild(removeBtn);
		}

		header.appendChild(controls);

		// Show controls on hover
		this.element.onmouseenter = () => (controls.style.opacity = "1");
		this.element.onmouseleave = () => (controls.style.opacity = "0.6");

		this.element.appendChild(header);

		// Content area
		const contentArea = document.createElement("div");
		contentArea.className = "grid-item-content";
		contentArea.style.cssText = `
			flex: 1;
			overflow: auto;
			font-size: 13px;
			color: var(--grid-item-content-color, #666);
		`;

		if (this.content) {
			if (typeof this.content === "string") {
				contentArea.innerHTML = this.content;
			} else if (this.content instanceof HTMLElement) {
				contentArea.appendChild(this.content);
			} else {
				contentArea.textContent = String(this.content);
			}
		} else {
			contentArea.innerHTML = `
				<div style="text-align: center; padding: 20px; color: #999;">
					<div style="font-size: 24px; margin-bottom: 8px;">📦</div>
					<div>Empty Widget</div>
					<div style="font-size: 11px; margin-top: 4px;">Size: ${this.w}×${this.h}</div>
				</div>
			`;
		}

		this.element.appendChild(contentArea);
	}

	setupModernGridInteractions() {
		if (this.locked || this.static || this.noMove) {
			this.element.style.cursor = "default";
			return;
		}

		let isDragging = false;
		let dragStartPos = null;
		let dragOffset = { x: 0, y: 0 };

		// Mouse down - start drag
		this.element.addEventListener("mousedown", (e) => {
			if (e.target.closest(".grid-item-controls")) return;
			if (e.target.closest(".resize-handle")) return;

			e.preventDefault();
			isDragging = true;
			dragStartPos = { x: e.clientX, y: e.clientY };
			this.element.style.zIndex = "1000";
			this.element.style.transform = "scale(1.02)";
			this.element.style.opacity = "0.9";

			document.addEventListener("mousemove", handleDrag);
			document.addEventListener("mouseup", handleDragEnd);
		});

		const handleDrag = (e) => {
			if (!isDragging) return;

			const deltaX = e.clientX - dragStartPos.x;
			const deltaY = e.clientY - dragStartPos.y;

			// Visual feedback during drag
			this.element.style.transform = `scale(1.02) translate(${deltaX}px, ${deltaY}px)`;

			// Notify grid of drag for potential drop zone highlighting
			if (this.grid && this.grid.handleWidgetDrag) {
				this.grid.handleWidgetDrag(this, e);
			}
		};

		const handleDragEnd = (e) => {
			if (!isDragging) return;

			isDragging = false;
			document.removeEventListener("mousemove", handleDrag);
			document.removeEventListener("mouseup", handleDragEnd);

			// Reset visual state
			this.element.style.zIndex = "";
			this.element.style.transform = "";
			this.element.style.opacity = "";

			// Calculate new position and update
			if (this.grid && this.grid.handleWidgetDrop) {
				this.grid.handleWidgetDrop(this, e);
			}
		};
	}

	setupResizeHandles() {
		if (this.locked || this.static || this.noResize) return;

		// Create resize handles for corners and edges
		const handles = [
			{ position: "se", cursor: "se-resize" },
			{ position: "sw", cursor: "sw-resize" },
			{ position: "ne", cursor: "ne-resize" },
			{ position: "nw", cursor: "nw-resize" },
			{ position: "n", cursor: "n-resize" },
			{ position: "s", cursor: "s-resize" },
			{ position: "e", cursor: "e-resize" },
			{ position: "w", cursor: "w-resize" },
		];

		handles.forEach(({ position, cursor }) => {
			const handle = document.createElement("div");
			handle.className = `resize-handle resize-${position}`;
			handle.style.cssText = `
				position: absolute;
				background: var(--grid-resize-handle-bg, #007acc);
				border: 1px solid var(--grid-resize-handle-border, #ffffff);
				border-radius: 2px;
				opacity: 0;
				transition: opacity 0.2s;
				cursor: ${cursor};
				z-index: 10;
			`;

			// Position handle
			const size = "8px";
			const offset = "-4px";
			switch (position) {
				case "nw":
					handle.style.top = offset;
					handle.style.left = offset;
					break;
				case "n":
					handle.style.top = offset;
					handle.style.left = "50%";
					handle.style.transform = "translateX(-50%)";
					break;
				case "ne":
					handle.style.top = offset;
					handle.style.right = offset;
					break;
				case "e":
					handle.style.right = offset;
					handle.style.top = "50%";
					handle.style.transform = "translateY(-50%)";
					break;
				case "se":
					handle.style.bottom = offset;
					handle.style.right = offset;
					break;
				case "s":
					handle.style.bottom = offset;
					handle.style.left = "50%";
					handle.style.transform = "translateX(-50%)";
					break;
				case "sw":
					handle.style.bottom = offset;
					handle.style.left = offset;
					break;
				case "w":
					handle.style.left = offset;
					handle.style.top = "50%";
					handle.style.transform = "translateY(-50%)";
					break;
			}

			// Size handle appropriately
			if (["n", "s"].includes(position)) {
				handle.style.width = "40px";
				handle.style.height = size;
			} else if (["e", "w"].includes(position)) {
				handle.style.width = size;
				handle.style.height = "40px";
			} else {
				handle.style.width = size;
				handle.style.height = size;
			}

			this.element.appendChild(handle);
		});

		// Show handles on hover
		this.element.addEventListener("mouseenter", () => {
			this.element
				.querySelectorAll(".resize-handle")
				.forEach((h) => (h.style.opacity = "1"));
		});

		this.element.addEventListener("mouseleave", () => {
			this.element
				.querySelectorAll(".resize-handle")
				.forEach((h) => (h.style.opacity = "0"));
		});
	}

	updatePosition() {
		// Update CSS Grid positioning
		this.element.style.gridColumn = `${this.x + 1} / span ${this.w}`;
		this.element.style.gridRow = `${this.y + 1} / span ${this.h}`;

		// Update data attributes
		this.element.dataset.gridX = this.x;
		this.element.dataset.gridY = this.y;
		this.element.dataset.gridW = this.w;
		this.element.dataset.gridH = this.h;
	}

	async initializeBackend() {
		if (!this.actionDispatcher || !this.orchestrator) return;

		try {
			// Register widget with backend
			const runner = this.orchestrator.createRunner(
				"register_grid_widget"
			);
			await runner.run(() => {
				return this.actionDispatcher.dispatch("GRID_WIDGET_REGISTER", {
					id: this.gridId,
					x: this.x,
					y: this.y,
					w: this.w,
					h: this.h,
					content: this.content,
				});
			});

			console.log(
				`[GridBlock] Widget ${this.gridId} registered with backend`
			);
		} catch (error) {
			console.error(`[GridBlock] Backend registration failed:`, error);
		}
	}

	// Public API methods
	setContent(content) {
		this.content = content;
		this.buildModernGridContent();
	}

	setPosition(x, y) {
		this.x = x;
		this.y = y;
		this.updatePosition();
	}

	setSize(w, h) {
		this.w = Math.max(this.minW, w);
		this.h = Math.max(this.minH, h);
		if (this.maxW) this.w = Math.min(this.maxW, this.w);
		if (this.maxH) this.h = Math.min(this.maxH, this.h);
		this.updatePosition();
	}

	serialize() {
		return {
			id: this.gridId,
			x: this.x,
			y: this.y,
			w: this.w,
			h: this.h,
			content: this.content,
			locked: this.locked,
			static: this.static,
			noResize: this.noResize,
			noMove: this.noMove,
			minW: this.minW,
			minH: this.minH,
			maxW: this.maxW,
			maxH: this.maxH,
		};
	}

	remove() {
		// Notify grid
		if (this.grid && this.grid.removeWidget) {
			this.grid.removeWidget(this.gridId);
		}

		// Remove from DOM
		this.element.remove();
	}
}
