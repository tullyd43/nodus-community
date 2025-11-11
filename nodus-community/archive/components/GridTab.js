/**
 * @file GridTab.js
 * @description Atomic tab component - individual tab that can be used in GridTabs or standalone
 */

import { AtomicElement } from "@platform/ui/AtomicElements.js";

export class GridTab extends AtomicElement {
	constructor(props = {}) {
		super("button", {
			...props,
			className: `nodus-grid-tab ${props.className || ""}`,
			"data-component": "grid-tab",
			"data-tab-id": props.tabId || props.id || crypto.randomUUID(),
		});

		// Tab properties
		this.tabId = this.element.dataset.tabId;
		this.label = props.label || "Tab";
		this.content = props.content || null;
		this.active = props.active || false;
		this.disabled = props.disabled || false;
		this.icon = props.icon || null;
		this.closable = props.closable || false;

		// Setup component
		this.setupTabStyles();
		this.buildTabContent();
		this.setupTabInteractions();
		this.updateActiveState();
	}

	setupTabStyles() {
		const baseStyles = {
			background: "transparent",
			border: "none",
			padding: "var(--space-sm) var(--space-md)",
			cursor: "pointer",
			transition: "all var(--transition-medium)",
			borderRadius: "var(--radius-md) var(--radius-md) 0 0",
			position: "relative",
			display: "flex",
			alignItems: "center",
			gap: "var(--space-xs)",
			fontFamily: "var(--font-family)",
			fontSize: "14px",
			fontWeight: "500",
			outline: "none",
			userSelect: "none",
		};

		const inactiveStyles = {
			color: "var(--color-gray-600)",
			borderBottom: "2px solid transparent",
		};

		const activeStyles = {
			color: "var(--color-blue)",
			background: "var(--color-surface)",
			borderBottom: "2px solid var(--color-blue)",
			boxShadow: "0 -2px 4px rgba(0, 0, 0, 0.04)",
		};

		Object.assign(this.element.style, baseStyles);
		Object.assign(
			this.element.style,
			this.active ? activeStyles : inactiveStyles
		);
	}

	buildTabContent() {
		// Clear existing content
		this.element.innerHTML = "";

		// Add icon if provided
		if (this.icon) {
			const iconElement = document.createElement("span");
			iconElement.className = "tab-icon";
			iconElement.innerHTML = this.icon;
			iconElement.style.fontSize = "14px";
			this.element.appendChild(iconElement);
		}

		// Add label
		const labelElement = document.createElement("span");
		labelElement.className = "tab-label";
		labelElement.textContent = this.label;
		this.element.appendChild(labelElement);

		// Add close button if closable
		if (this.closable) {
			const closeButton = document.createElement("button");
			closeButton.className = "tab-close";
			closeButton.innerHTML = "×";
			closeButton.style.cssText = `
				background: transparent;
				border: none;
				color: inherit;
				cursor: pointer;
				padding: 0;
				margin-left: var(--space-xs);
				width: 16px;
				height: 16px;
				border-radius: 50%;
				display: flex;
				align-items: center;
				justify-content: center;
				font-size: 14px;
				line-height: 1;
				opacity: 0.6;
				transition: all var(--transition-fast);
			`;

			closeButton.addEventListener("mouseenter", () => {
				closeButton.style.opacity = "1";
				closeButton.style.background = "rgba(0, 0, 0, 0.1)";
			});

			closeButton.addEventListener("mouseleave", () => {
				closeButton.style.opacity = "0.6";
				closeButton.style.background = "transparent";
			});

			closeButton.addEventListener("click", (e) => {
				e.stopPropagation();
				this.close();
			});

			this.element.appendChild(closeButton);
		}
	}

	setupTabInteractions() {
		// Click to activate
		this.element.addEventListener("click", () => {
			if (!this.disabled) {
				this.activate();
			}
		});

		// Hover effects for inactive tabs
		this.element.addEventListener("mouseenter", () => {
			if (!this.active && !this.disabled) {
				this.element.style.background = "rgba(0, 0, 0, 0.04)";
				this.element.style.color = "var(--color-gray-800)";
			}
		});

		this.element.addEventListener("mouseleave", () => {
			if (!this.active && !this.disabled) {
				this.element.style.background = "transparent";
				this.element.style.color = "var(--color-gray-600)";
			}
		});

		// Keyboard navigation
		this.element.addEventListener("keydown", (e) => {
			switch (e.key) {
				case "Enter":
				case " ":
					e.preventDefault();
					if (!this.disabled) {
						this.activate();
					}
					break;
				case "ArrowLeft":
					e.preventDefault();
					this.focusPreviousTab();
					break;
				case "ArrowRight":
					e.preventDefault();
					this.focusNextTab();
					break;
			}
		});
	}

	updateActiveState() {
		if (this.active) {
			this.element.style.color = "var(--color-blue)";
			this.element.style.background = "var(--color-surface)";
			this.element.style.borderBottom = "2px solid var(--color-blue)";
			this.element.style.boxShadow = "0 -2px 4px rgba(0, 0, 0, 0.04)";
			this.element.setAttribute("aria-selected", "true");
			this.element.setAttribute("tabindex", "0");
		} else {
			this.element.style.color = "var(--color-gray-600)";
			this.element.style.background = "transparent";
			this.element.style.borderBottom = "2px solid transparent";
			this.element.style.boxShadow = "none";
			this.element.setAttribute("aria-selected", "false");
			this.element.setAttribute("tabindex", "-1");
		}

		if (this.disabled) {
			this.element.style.opacity = "0.5";
			this.element.style.cursor = "not-allowed";
			this.element.setAttribute("disabled", "true");
		} else {
			this.element.style.opacity = "1";
			this.element.style.cursor = "pointer";
			this.element.removeAttribute("disabled");
		}
	}

	// Public API methods
	activate() {
		if (this.disabled) return;

		// Deactivate sibling tabs
		const tabContainer = this.element.closest(
			'[data-component="grid-tabs"]'
		);
		if (tabContainer) {
			tabContainer.querySelectorAll(".nodus-grid-tab").forEach((tab) => {
				if (tab !== this.element) {
					tab.style.color = "var(--color-gray-600)";
					tab.style.background = "transparent";
					tab.style.borderBottom = "2px solid transparent";
					tab.style.boxShadow = "none";
					tab.setAttribute("aria-selected", "false");
					tab.setAttribute("tabindex", "-1");
				}
			});
		}

		this.active = true;
		this.updateActiveState();

		// Dispatch activation event
		this.element.dispatchEvent(
			new CustomEvent("nodus:tab:activated", {
				bubbles: true,
				detail: {
					tabId: this.tabId,
					tab: this,
					label: this.label,
					content: this.content,
				},
			})
		);
	}

	deactivate() {
		this.active = false;
		this.updateActiveState();

		// Dispatch deactivation event
		this.element.dispatchEvent(
			new CustomEvent("nodus:tab:deactivated", {
				bubbles: true,
				detail: { tabId: this.tabId, tab: this, label: this.label },
			})
		);
	}

	close() {
		if (!this.closable) return;

		// Dispatch close event (cancelable)
		const closeEvent = new CustomEvent("nodus:tab:close", {
			bubbles: true,
			cancelable: true,
			detail: { tabId: this.tabId, tab: this, label: this.label },
		});

		this.element.dispatchEvent(closeEvent);

		// If not prevented, remove the tab
		if (!closeEvent.defaultPrevented) {
			this.destroy();
		}
	}

	disable() {
		this.disabled = true;
		this.updateActiveState();
	}

	enable() {
		this.disabled = false;
		this.updateActiveState();
	}

	updateLabel(newLabel) {
		this.label = newLabel;
		const labelElement = this.element.querySelector(".tab-label");
		if (labelElement) {
			labelElement.textContent = newLabel;
		}
	}

	updateIcon(newIcon) {
		this.icon = newIcon;
		const iconElement = this.element.querySelector(".tab-icon");

		if (newIcon) {
			if (iconElement) {
				iconElement.innerHTML = newIcon;
			} else {
				// Add icon if it didn't exist
				this.buildTabContent();
			}
		} else if (iconElement) {
			iconElement.remove();
		}
	}

	focusPreviousTab() {
		const tabContainer = this.element.closest(
			'[data-component="grid-tabs"]'
		);
		if (!tabContainer) return;

		const tabs = tabContainer.querySelectorAll(
			".nodus-grid-tab:not([disabled])"
		);
		const currentIndex = Array.from(tabs).indexOf(this.element);
		const previousIndex =
			currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;

		tabs[previousIndex]?.focus();
	}

	focusNextTab() {
		const tabContainer = this.element.closest(
			'[data-component="grid-tabs"]'
		);
		if (!tabContainer) return;

		const tabs = tabContainer.querySelectorAll(
			".nodus-grid-tab:not([disabled])"
		);
		const currentIndex = Array.from(tabs).indexOf(this.element);
		const nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;

		tabs[nextIndex]?.focus();
	}

	// Getters
	get id() {
		return this.tabId;
	}

	get isActive() {
		return this.active;
	}

	get isDisabled() {
		return this.disabled;
	}

	get isClosable() {
		return this.closable;
	}
}
