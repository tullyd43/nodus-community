/**
 * @file main.js
 * @description Nodus Grid System bootstrap
 * Builds the UI using imported atomic components
 */

import actionDispatcherSingleton from "@platform/ActionDispatcher.js";
import { AsyncOrchestrator } from "@platform/AsyncOrchestrator.js";
import { createModernGrid } from "@platform/grid";
import testCompleteCompatibility from "@platform/grid/grid-compat-test.js";
// Expose compatibility test in the real app entry so it's available in the webview.
if (typeof window !== "undefined")
	window.testCompleteCompatibility = testCompleteCompatibility;
import {
	Button,
	Container,
	GridBlock,
	Modal,
	Text,
} from "@platform/ui/AtomicElements.js";
import { CommandBar } from "@platform/ui/components/CommandBar.js";
import { AppConfig } from "./environment.config.js";

/**
 * @type {ActionDispatcher | undefined}
 * @description Global instance of the ActionDispatcher for communicating with the backend.
 */
let actionDispatcher;
/**
 * @type {AsyncOrchestrator | undefined}
 * @description Global instance of the AsyncOrchestrator for managing complex async operations.
 */
let asyncOrchestrator;
/**
 * @type {import('@platform/grid').ModernGrid | undefined}
 * @description Global instance of the main grid system.
 */
let mainGridSystem;
/**
 * @type {CommandBar | undefined}
 * @description Global instance of the main application command bar.
 */
let commandBar;

/**
 * Main entry point for the Nodus application. Orchestrates the initialization of all
 * core systems, UI components, and global handlers. This function is designed to be
 * the single starting point for the client-side application.
 * @async
 * @function bootstrap
 * @returns {Promise<void>} A promise that resolves when the bootstrap process is complete, or rejects if a fatal error occurs.
 * @throws {Error} Throws an error if a critical part of the bootstrap process fails (e.g., grid container not found).
 * @fires nodus:ready - Dispatches a custom event on `document` when initialization is complete.
 * @see {@link initializeCoreSystems}
 * @see {@link initializeGrid}
 * @see {@link createCommandBar}
 * @see {@link setupGlobalHandlers}
 * @see {@link finalizeBootstrap}
 */
async function bootstrap() {
	try {
		console.log("🚀 Initializing Nodus Grid System...");
		const startTime = performance.now();

		// 1. Initialize core systems
		await initializeCoreSystems();

		// 2. Initialize grid
		await initializeGrid();

		// 3. Create command bar using imported component
		await createCommandBar();

		// 4. Setup global handlers
		setupGlobalHandlers();

		// 5. Finalize
		const duration = performance.now() - startTime;
		await finalizeBootstrap(duration);

		// Give backend a short moment to register handlers, then add demo blocks
		// (avoids racing plugin/handler registration during app bootstrap)
		await new Promise((r) => setTimeout(r, 250));
		try {
			await addDemoBlocks();
		} catch (e) {
			console.warn("Failed to add demo blocks after bootstrap:", e);
		}

		console.log(`✅ Nodus initialized in ${duration.toFixed(2)}ms`);
	} catch (error) {
		console.error("❌ Bootstrap failed:", error);
		showError(error);
		throw error;
	}
}

/**
 * Initializes and globally exposes core backend-facing systems, including the
 * ActionDispatcher and AsyncOrchestrator. It also performs a "ping" to the
 * Rust backend to verify connectivity.
 * @async
 * @function initializeCoreSystems
 * @returns {Promise<void>} A promise that resolves when core systems are initialized.
 * @global window.__nodus - Creates or extends the global `__nodus` namespace to provide system-wide access to core instances.
 */
async function initializeCoreSystems() {
	// Use shared singleton instance
	actionDispatcher = actionDispatcherSingleton;
	asyncOrchestrator = new AsyncOrchestrator();

	// Test backend connection
	try {
		await actionDispatcher.dispatch("system.ping", {});
		console.log("✅ Rust backend connected");
	} catch (error) {
		console.warn("⚠️ Offline mode:", error);
	}

	// Global access
	window.__nodus = {
		actionDispatcher,
		asyncOrchestrator,
		version: "8.0.0-community",
		components: { Button, Container, GridBlock, CommandBar, Text, Modal },
	};

	// Also expose the ActionDispatcher directly for easier debugging in the
	// embedded Tauri webview console. Some embedder environments may not allow
	// writes to window, so guard with try/catch.
	try {
		window.__actionDispatcher = actionDispatcher;
	} catch (e) {
		// ignore
	}
}

/**
 * Finds the main grid container in the DOM and initializes the `ModernGrid` instance
 * with application-specific configuration. The grid instance is then exposed on the
 * global namespace.
 * @async
 * @function initializeGrid
 * @returns {Promise<void>} A promise that resolves when the grid is created and initialized.
 * @throws {Error} If the grid container element with ID `#nodus-grid` is not found in the DOM.
 * @global window.__nodus.gridSystem - Assigns the created grid instance for global access.
 */
async function initializeGrid() {
	const gridContainer = document.querySelector("#nodus-grid");
	if (!gridContainer) {
		throw new Error("Grid container #nodus-grid not found");
	}

	mainGridSystem = await createModernGrid(gridContainer, {
		float: false, // Enable reflow/compacting
		staticGrid: false, // Enable interactions
		enableHistory: true,
		enableToasts: true,
		enableAnalytics: !AppConfig.demoMode,
		enableDragDrop: true,
		classification: "PUBLIC",
		blockRenderer: (blockData) => {
			return new GridBlock({
				blockId: blockData.id,
				type: blockData.type || "content",
				blockProps: blockData.props || {},
			});
		},
	});

	// Some grid implementations provide an async `initialize` method.
	if (typeof mainGridSystem.initialize === "function") {
		await mainGridSystem.initialize();
	}
	window.__nodus.gridSystem = mainGridSystem;

	// NOTE: demo blocks deferred until after bootstrap to ensure backend handlers are registered
}

/**
 * Constructs and mounts the main application `CommandBar` using the atomic `CommandBar`
 * component. Defines the primary user actions for the application.
 * @async
 * @function createCommandBar
 * @returns {Promise<void>} A promise that resolves when the command bar is created and mounted.
 */
async function createCommandBar() {
	const commands = [
		{
			id: "add-block",
			icon: "⊞",
			label: "Add Block",
			tooltip: "Add new block (⌘N)",
			shortcut: "cmd+n",
			variant: "primary",
			action: async () => await addNewBlock(),
		},
		{ type: "separator" },
		{
			id: "undo",
			icon: "↶",
			tooltip: "Undo (⌘Z)",
			shortcut: "cmd+z",
			action: async () =>
				await actionDispatcher.dispatch("grid.undo", {}),
		},
		{
			id: "redo",
			icon: "↷",
			tooltip: "Redo (⌘Y)",
			shortcut: "cmd+y",
			action: async () =>
				await actionDispatcher.dispatch("grid.redo", {}),
		},
		{ type: "separator" },
		{
			id: "layout-reset",
			icon: "⊡",
			tooltip: "Reset Layout",
			action: async () =>
				await actionDispatcher.dispatch("grid.layout.reset", {}),
		},
		{
			id: "export",
			icon: "↗",
			tooltip: "Export Grid",
			action: async () => await exportGrid(),
		},
		{ type: "separator" },
		{
			id: "settings",
			icon: "⚙",
			tooltip: "Settings",
			action: async () => await showSettings(),
		},
	];

	commandBar = new CommandBar({
		position: "top-left",
		commands: commands,
	});

	commandBar.mount(document.body);
}

/**
 * Populates the grid with a set of demonstration blocks. This function is called
 * after the main bootstrap to ensure all backend handlers and UI systems are ready.
 * Blocks are marked with `skipBackend: true` to prevent registration attempts during this initial setup.
 * @async
@function addDemoBlocks
 * @returns {Promise<void>} A promise that resolves when all demo blocks have been added to the grid.
 */
async function addDemoBlocks() {
	const demoBlocks = [
		{
			id: crypto.randomUUID(),
			type: "welcome",
			props: {
				title: "Welcome to Nodus",
				content: `
					<p>This is your grid system built with atomic components.</p>
					<p>Use the command bar above to add new blocks and interact with your grid.</p>
				`,
			},
			x: 0,
			y: 0,
			w: 2,
			h: 1,
		},
		{
			id: crypto.randomUUID(),
			type: "info",
			props: {
				title: "Atomic Design",
				content: `
					<p>Every element you see is built using the same atomic component system.</p>
					<p>This ensures consistency and reusability across the platform.</p>
				`,
			},
			x: 2,
			y: 0,
			w: 2,
			h: 1,
		},
	];

	for (const block of demoBlocks) {
		// Mark demo blocks to skip backend registration during bootstrap
		block.skipBackend = true;

		// ModernGrid API: addWidget returns the widget instance
		await mainGridSystem.addWidget(block);
	}
}

/**
 * Handles the "Add Block" action. It creates a new block with default properties,
 * lets the grid auto-position it, and provides visual feedback on the command bar.
 * @async
 * @function addNewBlock
 * @returns {Promise<void>} A promise that resolves when the block has been added.
 */
async function addNewBlock() {
	try {
		const blockData = {
			id: crypto.randomUUID(),
			type: "content",
			props: {
				title: "New Block",
				content: "<p>Click to edit this block content.</p>",
			},
			// Let the grid auto-position new blocks (append to end). Do not set x/y
			autoPosition: true,
			w: 1,
			h: 1,
		};

		const widget = await mainGridSystem.addWidget(blockData);
		const blockId = widget?.id;
		console.log(`Added block: ${blockId}`);

		// Animate the command bar button
		const addButton = commandBar.element.querySelector(
			'[data-command="add-block"]'
		);
		if (addButton) {
			addButton.style.transform = "scale(0.9)";
			setTimeout(() => {
				addButton.style.transform = "scale(1)";
			}, 150);
		}
	} catch (error) {
		console.error("Failed to add block:", error);
	}
}

/**
 * Triggers the grid export process. It dispatches an action to get the grid's
 * current state and then initiates a browser download of the resulting JSON file.
 * @async
 * @function exportGrid
 * @returns {Promise<void>} A promise that resolves when the file download is initiated.
 */
async function exportGrid() {
	try {
		const config = await actionDispatcher.dispatch("grid.export", {});

		const blob = new Blob([JSON.stringify(config, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);

		const link = document.createElement("a");
		link.href = url;
		link.download = `nodus-grid-${Date.now()}.json`;
		link.click();

		URL.revokeObjectURL(url);
		console.log("Grid exported successfully");
	} catch (error) {
		console.error("Export failed:", error);
	}
}

/**
 * Displays a settings modal dialog. This function demonstrates the composition of
 * several atomic components (`Modal`, `Text`, `Button`) to create a complex UI element.
 * @async
 * @function showSettings
 * @returns {Promise<void>} A promise that resolves when the modal is created and mounted.
 */
async function showSettings() {
	const modal = new Modal();

	const title = new Text({
		textContent: "Settings",
		variant: "heading",
	});

	const closeButton = new Button({
		textContent: "Close",
		variant: "primary",
	});

	closeButton.addEventListener("click", () => modal.destroy());

	modal.dialog.appendChild(title);
	modal.dialog.appendChild(closeButton);
	modal.mount(document.body);
}

/**
 * Establishes global event listeners for unhandled errors and rejections.
 * It also initializes responsive handling for the application layout.
 * @function setupGlobalHandlers
 * @returns {void}
 */
function setupGlobalHandlers() {
	window.addEventListener("error", async (e) => {
		console.error("Global error:", e.error);
		await reportError(e.error);
	});

	window.addEventListener("unhandledrejection", async (e) => {
		console.error("Unhandled rejection:", e.reason);
		await reportError(e.reason);
	});

	setupResponsiveHandling();
}

/**
 * Sets up a `matchMedia` listener to adapt the UI for different screen sizes.
 * Specifically, it adjusts the position of the `CommandBar` for mobile and desktop views.
 * @function setupResponsiveHandling
 * @returns {void}
 */
function setupResponsiveHandling() {
	const mediaQuery = window.matchMedia("(max-width: 768px)");

	const handleResponsive = (e) => {
		document.body.setAttribute("data-mobile", e.matches);

		if (commandBar && e.matches) {
			// Move command bar to bottom on mobile
			Object.assign(commandBar.element.style, {
				position: "fixed",
				bottom: "20px",
				top: "auto",
				left: "50%",
				transform: "translateX(-50%)",
			});
		} else if (commandBar) {
			// Reset to top-left on desktop
			Object.assign(commandBar.element.style, {
				position: "fixed",
				top: "20px",
				bottom: "auto",
				left: "20px",
				transform: "none",
			});
		}
	};

	mediaQuery.addListener(handleResponsive);
	handleResponsive(mediaQuery);
}

/**
 * Sends a structured error report to the backend via the ActionDispatcher.
 * This allows for centralized error logging and monitoring.
 * @async
 * @function reportError
 * @param {Error} error - The error object to report.
 * @returns {Promise<void>} A promise that resolves when the report has been dispatched.
 */
async function reportError(error) {
	try {
		await actionDispatcher.dispatch("system.error.report", {
			message: error?.message || String(error),
			stack: error?.stack,
			timestamp: new Date().toISOString(),
		});
	} catch (reportError) {
		console.error("Failed to report error:", reportError);
	}
}

/**
 * Displays a user-friendly, non-blocking error overlay in the case of a
 * catastrophic failure (e.g., during bootstrap).
 * @function showError
 * @param {Error} error - The error object containing the message to display.
 * @returns {void}
 */
function showError(error) {
	const errorContainer = new Container({
		style: {
			position: "fixed",
			top: "50%",
			left: "50%",
			transform: "translate(-50%, -50%)",
			background: "rgba(255, 59, 48, 0.95)",
			backdropFilter: "var(--blur-md)",
			color: "white",
			padding: "var(--space-lg)",
			borderRadius: "var(--radius-lg)",
			maxWidth: "400px",
			zIndex: "10000",
			textAlign: "center",
		},
	});

	const title = new Text({
		textContent: "Initialization Failed",
		variant: "heading",
		style: { color: "white", marginBottom: "var(--space-sm)" },
	});

	const message = new Text({
		textContent: error.message,
		variant: "body",
		style: {
			color: "white",
			opacity: "0.9",
			marginBottom: "var(--space-md)",
		},
	});

	const closeButton = new Button({
		textContent: "Close",
		variant: "secondary",
		style: { background: "rgba(255, 255, 255, 0.2)" },
	});

	closeButton.addEventListener("click", () => errorContainer.destroy());

	errorContainer.appendChild(title);
	errorContainer.appendChild(message);
	errorContainer.appendChild(closeButton);
	errorContainer.mount(document.body);
}

/**
 * Completes the bootstrap process by notifying the backend, adding a ready
 * class to the document body, and dispatching a `nodus:ready` custom event
 * to signal to other scripts that the application is fully initialized.
 * @async
 * @function finalizeBootstrap
 * @param {number} duration - The total bootstrap duration in milliseconds.
 * @returns {Promise<void>} A promise that resolves when finalization is complete.
 */
async function finalizeBootstrap(duration) {
	try {
		await actionDispatcher.dispatch("system.bootstrap.completed", {
			duration,
			timestamp: new Date().toISOString(),
			version: "8.0.0-community",
			features: {
				atomicComponents: true,
				gridSystem: true,
				commandBar: true,
			},
		});
	} catch (error) {
		console.warn("Failed to report bootstrap:", error);
	}

	document.body.classList.add("nodus-ready");
	document.body.setAttribute("data-nodus-status", "ready");

	document.dispatchEvent(
		new CustomEvent("nodus:ready", {
			detail: {
				duration,
				gridSystem: mainGridSystem,
				commandBar: commandBar,
				components: window.__nodus.components,
			},
		})
	);
}

// Auto-bootstrap when DOM is ready
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", bootstrap);
} else {
	setTimeout(bootstrap, 0);
}

// Export for external use
export {
	actionDispatcher,
	asyncOrchestrator,
	mainGridSystem,
	commandBar,
	bootstrap,
};
