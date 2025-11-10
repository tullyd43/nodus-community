/**
 * @file grid-layout-worker.js
 * Web Worker for heavy grid layout calculations
 * Keeps main thread free for smooth animations
 */

// Import the GridLayout class (use ES module import; worker is created as module)
import { GridLayout } from "./utils/GridLayout.js";

let layoutEngine = null;

// Handle messages from main thread
self.onmessage = function (e) {
	const { id, type, data } = e.data;

	try {
		switch (type) {
			case "init":
				// Initialize layout engine
				layoutEngine = new GridLayout(data.config);
				self.postMessage({ id, type: "init", success: true });
				break;

			case "optimize":
				// Heavy layout calculation - this runs off main thread!
				if (!layoutEngine) {
					layoutEngine = new GridLayout(data.config);
				}

				const optimized = layoutEngine.optimizeLayout(data.blocks);

				// Send results back to main thread
				self.postMessage({
					id,
					type: "optimize",
					result: optimized,
				});
				break;

			case "updateConfig":
				// Update layout configuration
				if (layoutEngine) {
					layoutEngine.updateConfig(data.config);
				}
				self.postMessage({ id, type: "updateConfig", success: true });
				break;

			default:
				self.postMessage({
					id,
					type: "error",
					error: `Unknown message type: ${type}`,
				});
		}
	} catch (error) {
		self.postMessage({
			id,
			type: "error",
			error: error.message,
		});
	}
};
