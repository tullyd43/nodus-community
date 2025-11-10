// Test harness to validate GridStack.js compatibility in the browser.
// Exposes `window.testCompleteCompatibility()` which will create a DOM container
// and run a series of operations against `ModernGrid`.

// Provide a lightweight stub immediately so checks in the console like
// `typeof window.testCompleteCompatibility === 'function'` return true even
// if the module hasn't fully executed yet (helps with timing issues).
if (
	typeof window !== "undefined" &&
	typeof window.testCompleteCompatibility !== "function"
) {
	window.testCompleteCompatibility = function () {
		console.warn(
			"testCompleteCompatibility called before the compatibility module finished initializing. Reload or wait a moment and try again."
		);
	};
}

import { ModernGrid } from "./Grid.js";

console.debug("[grid-compat-test] module loaded");

function testCompleteCompatibility() {
	console.log("=== GridStack.js Compatibility Test ===");

	// Create a container node so the grid has a DOM element to mount into
	const container = document.createElement("div");
	container.id = "grid-compat-test-container";
	container.style.width = "100%";
	container.style.minHeight = "600px";
	container.style.border = "1px dashed rgba(0,0,0,0.1)";
	document.body.appendChild(container);

	const grid = new ModernGrid(container, {
		column: 12,
		float: false,
		margin: 10,
		animate: true,
		className: "grid-compat-test",
	});

	// Test 1: Auto-positioning
	console.log("Test 1: Auto-positioning");
	grid.addWidget({ w: 4, h: 2, content: "Widget 1" });
	grid.addWidget({ w: 4, h: 2, content: "Widget 2" });
	grid.addWidget({ w: 4, h: 2, content: "Widget 3" });

	// Test 2: Batch operations
	console.log("Test 2: Batch operations");
	grid.batchUpdate(true);
	grid.addWidget({ w: 2, h: 1, content: "Batch 1" });
	grid.addWidget({ w: 2, h: 1, content: "Batch 2" });
	grid.batchUpdate(false); // commit

	// Test 3: Float mode toggle
	console.log("Test 3: Float mode");
	grid.setFloat(true);
	grid.addWidget({ x: 0, y: 10, w: 2, h: 1, content: "Floating" });
	console.log("Floating widget at y=10");

	grid.setFloat(false);
	console.log("Should compact - floating widget moves up");

	// Test 4: Column scaling
	console.log("Test 4: Column scaling");
	console.log("Current columns:", grid.getColumn());
	grid.changeColumns(6, "compact");
	console.log("Scaled to 6 columns");
	grid.changeColumns(12, "compact");
	console.log("Scaled back to 12 columns");

	// Test 5: Widget removal
	console.log("Test 5: Widget removal");
	const widgets = Array.from(grid.widgets.values());
	if (widgets[0]) {
		grid.removeWidget(widgets[0].id);
		console.log("Removed widget, layout should compact");
	}

	// Keep reference on window for further inspection
	window._testGridInstance = grid;

	console.log(
		"✅ Compatibility test registered as window.testCompleteCompatibility(). Run it from the browser console to execute."
	);
	return grid;
}

// Expose API
// Replace the stub with the real implementation
window.testCompleteCompatibility = testCompleteCompatibility;
export default testCompleteCompatibility;
