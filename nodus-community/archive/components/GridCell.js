/**
 * @file GridCell.js
 * @description Atomic grid cell component - simple cells for basic grids
 * Derived from GridBootstrap but following atomic component pattern
 */

import { AtomicElement } from "@platform/ui/AtomicElements.js";

export class GridCell extends AtomicElement {
	constructor(props = {}) {
		super("div", {
			...props,
			className: `nodus-grid-cell ${props.className || ""}`,
			"data-component": "grid-cell",
			"data-cell-id": props.cellId || props.id || crypto.randomUUID(),
		});

		// Cell properties
		this.cellId = this.element.dataset.cellId;
		this.item = props.item || {};
		this.classification =
			props.classification || this.item.classification || "PUBLIC";
		this.density = props.density || "normal"; // compact, normal, spacious
		this.draggable = props.draggable !== false;
		this.selectable = props.selectable !== false;

		// Setup component
		this.setupCellStyles();
		this.buildCellContent();
		this.setupCellInteractions();
		this.setupClassification();
	}

	setupCellStyles() {
		const baseStyles = {
			background: "var(--color-surface)",
			border: "1px solid rgba(0, 0, 0, 0.08)",
			borderRadius: "var(--radius-md)",
			cursor: "pointer",
			transition: "all var(--transition-medium)",
			overflow: "hidden",
			display: "flex",
			flexDirection: "column",
			position: "relative",
		};

		// Density-based padding
		const densityStyles = {
			compact: { padding: "var(--space-sm)" },
			normal: { padding: "var(--space-md)" },
			spacious: { padding: "var(--space-lg)" },
		};

		Object.assign(this.element.style, baseStyles);
		Object.assign(this.element.style, densityStyles[this.density]);

		// Add density class for external styling
		this.element.classList.add(`density-${this.density}`);
	}

	buildCellContent() {
		// Clear existing content
		this.element.innerHTML = "";

		// Create header
		const header = document.createElement("header");
		header.className = "cell-header";
		header.style.cssText = `
			font-weight: 600;
			font-size: 14px;
			margin-bottom: var(--space-sm);
			color: var(--color-gray-900);
			flex-shrink: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		`;
		header.textContent =
			this.item.display_name || this.item.title || `Cell ${this.cellId}`;
		this.element.appendChild(header);

		// Create content section
		const content = document.createElement("section");
		content.className = "cell-content";
		content.style.cssText = `
			flex: 1;
			font-size: 13px;
			line-height: 1.4;
			color: var(--color-gray-700);
			overflow: auto;
		`;

		const contentText =
			this.item.content?.details ||
			this.item.description ||
			this.item.content ||
			"No details available.";

		if (this.item.type === "html" && contentText) {
			content.innerHTML = contentText;
		} else {
			content.textContent = contentText;
		}

		this.element.appendChild(content);
	}

	setupCellInteractions() {
		// Selection handling
		if (this.selectable) {
			this.element.addEventListener("click", (e) => {
				e.stopPropagation();
				this.select();
			});
		}

		// Hover effects
		this.element.addEventListener("mouseenter", () => {
			this.element.style.transform = "translateY(-1px)";
			this.element.style.boxShadow = "var(--shadow-sm)";
			this.element.style.borderColor = "rgba(0, 122, 255, 0.2)";
		});

		this.element.addEventListener("mouseleave", () => {
			if (!this.selected) {
				this.element.style.transform = "translateY(0)";
				this.element.style.boxShadow = "none";
				this.element.style.borderColor = "rgba(0, 0, 0, 0.08)";
			}
		});

		// Drag and drop if enabled
		if (this.draggable) {
			this.setupDragDrop();
		}
	}

	setupDragDrop() {
		this.element.draggable = true;

		this.element.addEventListener("dragstart", (e) => {
			e.dataTransfer.setData("application/nodus-cell", this.cellId);
			e.dataTransfer.setData("text/plain", this.cellId);
			e.dataTransfer.effectAllowed = "move";

			this.element.style.opacity = "0.5";

			// Dispatch drag start event
			this.element.dispatchEvent(
				new CustomEvent("nodus:cell:dragstart", {
					bubbles: true,
					detail: {
						cellId: this.cellId,
						cell: this,
						item: this.item,
					},
				})
			);
		});

		this.element.addEventListener("dragend", () => {
			this.element.style.opacity = "";

			// Dispatch drag end event
			this.element.dispatchEvent(
				new CustomEvent("nodus:cell:dragend", {
					bubbles: true,
					detail: {
						cellId: this.cellId,
						cell: this,
						item: this.item,
					},
				})
			);
		});

		// Allow dropping on this cell
		this.element.addEventListener("dragover", (e) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			this.element.style.borderColor = "var(--color-blue)";
		});

		this.element.addEventListener("dragleave", () => {
			this.element.style.borderColor = "rgba(0, 0, 0, 0.08)";
		});

		this.element.addEventListener("drop", (e) => {
			e.preventDefault();
			this.element.style.borderColor = "rgba(0, 0, 0, 0.08)";

			const draggedCellId = e.dataTransfer.getData(
				"application/nodus-cell"
			);

			if (draggedCellId && draggedCellId !== this.cellId) {
				// Dispatch drop event
				this.element.dispatchEvent(
					new CustomEvent("nodus:cell:drop", {
						bubbles: true,
						detail: {
							draggedCellId,
							targetCellId: this.cellId,
							targetCell: this,
							draggedItem: this.item,
						},
					})
				);

				// Visual feedback
				this.flashSuccess();
			}
		});
	}

	setupClassification() {
		if (this.classification && this.classification !== "PUBLIC") {
			this.applyClassificationStyling();
		}
	}

	applyClassificationStyling() {
		const classificationStyles = {
			INTERNAL: {
				borderLeftColor: "#f59e0b",
				backgroundColor: "#fefbf3",
			},
			CONFIDENTIAL: {
				borderLeftColor: "#ef4444",
				backgroundColor: "#fef2f2",
			},
			SECRET: {
				borderLeftColor: "#7c2d12",
				backgroundColor: "#1c1917",
				color: "#fbbf24",
			},
		};

		const style = classificationStyles[this.classification];
		if (style) {
			this.element.style.borderLeft = `4px solid ${style.borderLeftColor}`;
			this.element.style.backgroundColor = style.backgroundColor;
			if (style.color) {
				this.element.style.color = style.color;
			}

			// Add classification badge
			this.addClassificationBadge();
		}
	}

	addClassificationBadge() {
		const badge = document.createElement("div");
		badge.className = "classification-badge";
		badge.textContent = this.classification;
		badge.style.cssText = `
			position: absolute;
			top: var(--space-xs);
			right: var(--space-xs);
			background: var(--color-gray-800);
			color: white;
			padding: 1px 4px;
			font-size: 9px;
			border-radius: var(--radius-sm);
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			z-index: 1;
			opacity: 0.8;
		`;
		this.element.appendChild(badge);
	}

	// Public API methods
	select() {
		if (!this.selectable) return;

		// Remove existing selections in the same container
		const container = this.element.closest('[data-component="grid"]');
		if (container) {
			container
				.querySelectorAll(".nodus-grid-cell.selected")
				.forEach((el) => {
					el.classList.remove("selected");
					el.style.transform = "translateY(0)";
					el.style.boxShadow = "none";
					el.style.borderColor = "rgba(0, 0, 0, 0.08)";
				});
		}

		// Add selection to this cell
		this.element.classList.add("selected");
		this.element.style.transform = "translateY(-2px)";
		this.element.style.boxShadow = "var(--shadow-md)";
		this.element.style.borderColor = "var(--color-blue)";

		// Dispatch selection event
		this.element.dispatchEvent(
			new CustomEvent("nodus:cell:selected", {
				bubbles: true,
				detail: { cellId: this.cellId, cell: this, item: this.item },
			})
		);
	}

	deselect() {
		this.element.classList.remove("selected");
		this.element.style.transform = "translateY(0)";
		this.element.style.boxShadow = "none";
		this.element.style.borderColor = "rgba(0, 0, 0, 0.08)";
	}

	flashSuccess() {
		const originalBorderColor = this.element.style.borderColor;
		this.element.style.borderColor = "var(--color-green)";
		this.element.style.boxShadow = "0 0 0 2px rgba(52, 199, 89, 0.2)";

		setTimeout(() => {
			this.element.style.borderColor = originalBorderColor;
			this.element.style.boxShadow = "none";
		}, 500);
	}

	flashError() {
		const originalBorderColor = this.element.style.borderColor;
		this.element.style.borderColor = "var(--color-red)";
		this.element.style.boxShadow = "0 0 0 2px rgba(239, 68, 68, 0.2)";

		setTimeout(() => {
			this.element.style.borderColor = originalBorderColor;
			this.element.style.boxShadow = "none";
		}, 500);
	}

	updateItem(newItem) {
		this.item = { ...this.item, ...newItem };
		this.buildCellContent();
	}

	updateDensity(newDensity) {
		// Remove old density class
		this.element.classList.remove(`density-${this.density}`);

		// Update density
		this.density = newDensity;

		// Add new density class and styles
		this.element.classList.add(`density-${this.density}`);
		this.setupCellStyles();
	}

	setClassification(classification) {
		// Remove old classification badge
		const oldBadge = this.element.querySelector(".classification-badge");
		if (oldBadge) oldBadge.remove();

		// Reset styles
		this.element.style.borderLeft = "";
		this.element.style.backgroundColor = "";
		this.element.style.color = "";

		// Apply new classification
		this.classification = classification;
		this.setupClassification();
	}

	// Getters
	get id() {
		return this.cellId;
	}

	get selected() {
		return this.element.classList.contains("selected");
	}

	get headerElement() {
		return this.element.querySelector(".cell-header");
	}

	get contentElement() {
		return this.element.querySelector(".cell-content");
	}
}
