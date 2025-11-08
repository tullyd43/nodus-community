/**
 * @file AtomicRegistry.js
 * @description Defines the base atomic element primitives for the Nodus UI system, consumed by the BuildingBlockRenderer.
 *
 * This registry adheres to the "minimal structure" philosophy:
 * 1.  Only 'container' is a structural grouping element (using inline-flex).
 * 2.  All other elements are treated as "inline" (inline, inline-block, or inline-flex).
 * 3.  Page-level layout is deferred to the CompleteGridSystem or other layout managers.
 * 4.  These definitions are consumed by the BuildingBlockRenderer to create
 * and style the actual DOM elements.
 *
 * Each definition specifies the default HTML tag and its base display style.
 */

// Using a Map for easy extension and programmatic access
const ATOMIC_REGISTRY = new Map();

// === 1. The Single Structural Element ===

/**
 * @type {AtomicDefinition}
 * @property {string} category - The functional category for discovery (e.g., 'structural', 'interactive').
 * @property {string} tag - The default HTML tag.
 * @property {object} style - The base CSS styles for this primitive.
 * @property {string} style.display - The CSS display type.
 */
ATOMIC_REGISTRY.set("container", {
	category: "structural",
	tag: "div",
	style: {
		display: "inline-flex", // Use inline-flex for grouping inline children
		alignItems: "center",
		gap: "0.5rem",
		// 'container' is the only element intended to "wrap" other atoms
		// to form a reusable micro-block.
	},
});

// === 2. Interactive Primitives (Inline) ===

ATOMIC_REGISTRY.set("button", {
	category: "interactive",
	tag: "button",
	style: {
		display: "inline-flex", // Use inline-flex to align icon + text
		alignItems: "center",
		justifyContent: "center",
	},
});

ATOMIC_REGISTRY.set("input", {
	category: "interactive",
	tag: "input",
	style: {
		display: "inline-block",
	},
});

ATOMIC_REGISTRY.set("toggle", {
	category: "interactive",
	tag: "input", // Often rendered as <input type="checkbox"> + custom UI
	style: {
		display: "inline-block", // The underlying input is inline
	},
	// The BuildingBlockRenderer would add attributes: { type: 'checkbox', role: 'switch' }
});

ATOMIC_REGISTRY.set("checkbox", {
	category: "interactive",
	tag: "input",
	style: {
		display: "inline-block",
	},
	// The BuildingBlockRenderer would add attributes: { type: 'checkbox' }
});

ATOMIC_REGISTRY.set("slider", {
	category: "interactive",
	tag: "input",
	style: {
		display: "inline-block",
	},
	// The BuildingBlockRenderer would add attributes: { type: 'range' }
});

// === 3. Display Primitives (Inline) ===

ATOMIC_REGISTRY.set("label", {
	category: "display",
	tag: "label",
	style: {
		display: "inline-block",
	},
});

ATOMIC_REGISTRY.set("text", {
	category: "display",
	tag: "span",
	style: {
		display: "inline", // Pure text flows naturally
	},
});

ATOMIC_REGISTRY.set("icon", {
	category: "display",
	tag: "i", // Or 'span'
	style: {
		display: "inline-block",
		width: "1em",
		height: "1em",
		// The renderer would typically apply a class like 'icon-[name]'
	},
});

ATOMIC_REGISTRY.set("image", {
	category: "display",
	tag: "img",
	style: {
		display: "inline-block",
	},
});

ATOMIC_REGISTRY.set("metric", {
	category: "display",
	tag: "span",
	style: {
		display: "inline-block",
		fontWeight: "bold",
	},
});

// === 4. Feedback Primitives (Special Case) ===
// While defined as 'inline-block' for grid placement, the
// BuildingBlockRenderer or a dedicated service (ToastManager, ModalManager)
// will likely handle their special overlay/portal rendering.

ATOMIC_REGISTRY.set("badge", {
	category: "feedback",
	tag: "span",
	style: {
		display: "inline-block",
	},
});

ATOMIC_REGISTRY.set("tooltip", {
	category: "feedback",
	tag: "span", // The "trigger" element is inline
	style: {
		display: "inline-block",
	},
	// The actual tooltip popup is handled by a separate controller
	// listening to hover/focus events on this element.
});

ATOMIC_REGISTRY.set("modal", {
	category: "feedback",
	tag: "div",
	style: {
		display: "none", // Modals are not part of the inline flow.
	},
	// Handled by ModalManager, not standard rendering.
});

ATOMIC_REGISTRY.set("toast", {
	category: "feedback",
	tag: "div",
	style: {
		display: "none", // Toasts are not part of the inline flow.
	},
	// Handled by GridToastManager, not standard rendering.
});

// === 5. Data-Bound Primitives (Inline) ===
// These are placeholders for more complex components.
// They are 'inline-block' so they can be placed in a grid cell.

ATOMIC_REGISTRY.set("list", {
	category: "data",
	tag: "ul",
	style: {
		display: "inline-block",
	},
});

ATOMIC_REGISTRY.set("table", {
	category: "data",
	tag: "table",
	style: {
		display: "inline-block",
	},
});

ATOMIC_REGISTRY.set("grid", {
	category: "data",
	tag: "div",
	style: {
		display: "inline-block",
	},
	// This definition acts as a hook for the NestedGridManager
	// to initialize a new CompleteGridSystem instance inside.
});

ATOMIC_REGISTRY.set("form", {
	category: "data",
	tag: "form",
	style: {
		display: "inline-block",
	},
});

ATOMIC_REGISTRY.set("chart", {
	category: "data",
	tag: "div", // Placeholder for a canvas or SVG chart library
	style: {
		display: "inline-block",
	},
});

// === 6. Intelligent Primitives (Inline) ===

ATOMIC_REGISTRY.set("ai-suggestion", {
	category: "intelligent",
	tag: "span",
	style: {
		display: "inline-block",
	},
	// Hooks into AdaptiveRenderer / EmbeddingManager
});

ATOMIC_REGISTRY.set("semantic-search", {
	category: "intelligent",
	tag: "div", // Likely a composite of input + button + results
	style: {
		display: "inline-flex",
	},
	// This would be a "micro-block" defined as a container
	// with 'input' and 'button' children, but registered
	// as a single atomic component.
});

/**
 * Exports the default atomic primitives for the Nodus system.
 * This Map can be directly loaded into the ComponentRegistry.
 *
 * Example:
 * import { ATOMIC_REGISTRY } from './AtomicRegistry.js';
 * const componentRegistry = new ComponentRegistry();
 * componentRegistry.registerDefaultAtoms(ATOMIC_REGISTRY);
 */
export { ATOMIC_REGISTRY };

/**
 * @typedef {object} AtomicDefinition
 * @property {string} category - The functional category for discovery (e.g., 'structural', 'interactive').
 * @property {string} tag - The default HTML element tag (e.g., 'div', 'span', 'button').
 * @property {object} style - The base CSS styles to apply to the element.
 * @property {string} style.display - The crucial CSS display property.
 */
