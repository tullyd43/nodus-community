/**
 * @file GridTabs.js
 * @description Atomic tabs container component - manages multiple GridTab components
 */

import { AtomicElement } from "@platform/ui/AtomicElements.js";
import { GridTab } from "./GridTab.js";

export class GridTabs extends AtomicElement {
	constructor(props = {}) {
		super("div", {
			...props,
			className: `nodus-grid-tabs ${props.className || ""}`,
			"data-component": "grid-tabs",
			"data-tabs-id": props.tabsId || props.id || crypto.randomUUID(),
		});

		// Tabs properties
		this.tabsId = this.element.dataset.tabsId;
		this.tabs = [];
		this.activeTabIndex = props.activeTab || 0;
		this.position = props.position || "top"; // top, bottom, left, right
		this.variant = props.variant || "default"; // default, pills, underline
		this.allowClose = props.allowClose || false;

		// Setup component
		this.setupTabsStyles();
		this.createTabsStructure();
		this.setupTabsInteractions();
		this.addInitialTabs(props.tabs || []);
	}

	setupTabsStyles() {
		const baseStyles = {
			display: "flex",
			flexDirection:
				this.position === "left" || this.position === "right"
					? "row"
					: "column",
			background: "var(--color-background)",
			borderRadius: "var(--radius-md)",
			overflow: "hidden",
		};

		Object.assign(this.element.style, baseStyles);
	}

	createTabsStructure() {
		// Create tab list (the tab buttons)
		this.tabList = document.createElement("div");
		this.tabList.className = "tabs-list";
		this.tabList.setAttribute("role", "tablist");
		this.tabList.style.cssText = `
			display: flex;
			flex-direction: ${
				this.position === "left" || this.position === "right"
					? "column"
					: "row"
			};
			background: rgba(0, 0, 0, 0.02);
			border-bottom: 1px solid rgba(0, 0, 0, 0.08);
			overflow-x: auto;
			overflow-y: hidden;
			scrollbar-width: none;
			-ms-overflow-style: none;
		`;

		// Hide scrollbar
		this.tabList.style.setProperty("-webkit-scrollbar", "none");

		// Create content area (where tab panels go)
		this.contentArea = document.createElement("div");
		this.contentArea.className = "tabs-content";
		this.contentArea.style.cssText = `
			flex: 1;
			padding: var(--space-md);
			background: var(--color-surface);
			min-height: 200px;
		`;

		// Add to container based on position
		if (this.position === "bottom") {
			this.element.appendChild(this.contentArea);
			this.element.appendChild(this.tabList);
		} else {
			this.element.appendChild(this.tabList);
			this.element.appendChild(this.contentArea);
		}
	}

	setupTabsInteractions() {
		// Listen for tab activation events
		this.element.addEventListener("nodus:tab:activated", (e) => {
			const { tabId, content } = e.detail;
			this.showTabContent(tabId, content);
		});

		// Listen for tab close events
		this.element.addEventListener("nodus:tab:close", (e) => {
			const { tabId } = e.detail;
			this.removeTab(tabId);
		});

		// Keyboard navigation for tab list
		this.tabList.addEventListener("keydown", (e) => {
			if (e.key === "Home") {
				e.preventDefault();
				this.focusFirstTab();
			} else if (e.key === "End") {
				e.preventDefault();
				this.focusLastTab();
			}
		});
	}

	addInitialTabs(tabsData) {
		for (const [index, tabData] of tabsData.entries()) {
			this.addTab({
				...tabData,
				active: index === this.activeTabIndex,
			});
		}
	}

	// Public API methods
	addTab(tabData) {
		const tabId = tabData.id || `tab-${this.tabs.length}`;

		const tab = new GridTab({
			...tabData,
			tabId,
			closable: this.allowClose || tabData.closable,
		});

		// Add ARIA attributes
		tab.element.setAttribute("role", "tab");
		tab.element.setAttribute("aria-controls", `panel-${tabId}`);
		tab.element.id = `tab-${tabId}`;

		// Add to tab list
		this.tabList.appendChild(tab.element);
		this.tabs.push({
			id: tabId,
			component: tab,
			content: tabData.content || null,
			contentElement: null,
		});

		// If this is the first tab or marked as active, activate it
		if (this.tabs.length === 1 || tabData.active) {
			tab.activate();
		}

		// Dispatch tab added event
		this.element.dispatchEvent(
			new CustomEvent("nodus:tabs:tab-added", {
				bubbles: true,
				detail: { tabId, tab, tabsComponent: this },
			})
		);

		return tab;
	}

	removeTab(tabId) {
		const tabIndex = this.tabs.findIndex((t) => t.id === tabId);
		if (tabIndex === -1) return;

		const tab = this.tabs[tabIndex];
		const wasActive = tab.component.isActive;

		// Remove tab component
		tab.component.destroy();

		// Remove content if it exists
		if (tab.contentElement) {
			tab.contentElement.remove();
		}

		// Remove from tabs array
		this.tabs.splice(tabIndex, 1);

		// If we removed the active tab, activate another
		if (wasActive && this.tabs.length > 0) {
			const newActiveIndex = Math.min(tabIndex, this.tabs.length - 1);
			this.tabs[newActiveIndex].component.activate();
		}

		// Dispatch tab removed event
		this.element.dispatchEvent(
			new CustomEvent("nodus:tabs:tab-removed", {
				bubbles: true,
				detail: { tabId, tabsComponent: this },
			})
		);
	}

	showTabContent(tabId, content) {
		// Hide all tab panels
		this.contentArea
			.querySelectorAll(".tab-panel")
			.forEach((panel) => (panel.style.display = "none"));

		// Find or create the content element for this tab
		let contentElement = this.contentArea.querySelector(`#panel-${tabId}`);

		if (!contentElement) {
			contentElement = document.createElement("div");
			contentElement.id = `panel-${tabId}`;
			contentElement.className = "tab-panel";
			contentElement.setAttribute("role", "tabpanel");
			contentElement.setAttribute("aria-labelledby", `tab-${tabId}`);
			contentElement.style.cssText = `
				display: none;
				height: 100%;
				overflow: auto;
			`;

			this.contentArea.appendChild(contentElement);

			// Update tab data
			const tab = this.tabs.find((t) => t.id === tabId);
			if (tab) {
				tab.contentElement = contentElement;
			}
		}

		// Set content
		if (content) {
			if (typeof content === "string") {
				contentElement.innerHTML = content;
			} else if (content instanceof HTMLElement) {
				contentElement.innerHTML = "";
				contentElement.appendChild(content);
			} else if (content instanceof AtomicElement) {
				contentElement.innerHTML = "";
				contentElement.appendChild(content.element);
			}
		}

		// Show this panel
		contentElement.style.display = "block";

		// Update active tab in data
		this.activeTabIndex = this.tabs.findIndex((t) => t.id === tabId);

		// Dispatch content changed event
		this.element.dispatchEvent(
			new CustomEvent("nodus:tabs:content-changed", {
				bubbles: true,
				detail: { tabId, content, tabsComponent: this },
			})
		);
	}

	activateTab(tabIdOrIndex) {
		let tab;

		if (typeof tabIdOrIndex === "number") {
			tab = this.tabs[tabIdOrIndex];
		} else {
			tab = this.tabs.find((t) => t.id === tabIdOrIndex);
		}

		if (tab) {
			tab.component.activate();
		}
	}

	getActiveTab() {
		return this.tabs.find((t) => t.component.isActive);
	}

	updateTabContent(tabId, newContent) {
		const tab = this.tabs.find((t) => t.id === tabId);
		if (tab) {
			tab.content = newContent;

			// If this tab is currently active, update the display
			if (tab.component.isActive) {
				this.showTabContent(tabId, newContent);
			}
		}
	}

	focusFirstTab() {
		const firstTab = this.tabList.querySelector(
			".nodus-grid-tab:not([disabled])"
		);
		firstTab?.focus();
	}

	focusLastTab() {
		const tabs = this.tabList.querySelectorAll(
			".nodus-grid-tab:not([disabled])"
		);
		tabs[tabs.length - 1]?.focus();
	}

	// Utility methods
	getTabCount() {
		return this.tabs.length;
	}

	getTabById(tabId) {
		return this.tabs.find((t) => t.id === tabId);
	}

	getAllTabs() {
		return [...this.tabs];
	}

	hasTab(tabId) {
		return this.tabs.some((t) => t.id === tabId);
	}

	// Getters
	get id() {
		return this.tabsId;
	}

	get tabElements() {
		return this.tabs.map((t) => t.component);
	}

	get activeTabId() {
		const activeTab = this.getActiveTab();
		return activeTab ? activeTab.id : null;
	}
}
