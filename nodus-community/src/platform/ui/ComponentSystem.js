/**
 * @file SimpleComponentSystem.js
 * @description Lightweight component system for community release.
 * Simplified from enterprise BuildingBlockRenderer/ComponentRegistry to use basic primitives.
 */
import actionDispatcher from "@platform/ActionDispatcher.js";

/**
 * Simple atomic component definitions
 */
export const COMPONENT_PRIMITIVES = {
	// Structural elements
	container: {
		tag: "div",
		defaultStyle: {
			display: "inline-flex",
			alignItems: "center",
			gap: "0.5rem",
		},
	},

	// Interactive elements
	button: {
		tag: "button",
		defaultStyle: {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			padding: "8px 16px",
			border: "1px solid var(--border, #ccc)",
			borderRadius: "var(--border-radius, 4px)",
			background: "var(--surface, #f5f5f5)",
			color: "var(--text, #333)",
			cursor: "pointer",
		},
	},

	input: {
		tag: "input",
		defaultStyle: {
			display: "inline-block",
			padding: "8px 12px",
			border: "1px solid var(--border, #ccc)",
			borderRadius: "var(--border-radius, 4px)",
			background: "var(--surface, #fff)",
			color: "var(--text, #333)",
		},
	},

	// Display elements
	text: {
		tag: "span",
		defaultStyle: {
			display: "inline",
		},
	},

	label: {
		tag: "label",
		defaultStyle: {
			display: "inline-block",
			fontWeight: "500",
		},
	},

	// Data elements
	html: {
		tag: "div",
		defaultStyle: {
			display: "block",
		},
	},
};

/**
 * @class SimpleComponentSystem
 * @classdesc Lightweight component system for community release.
 * Provides basic component rendering without enterprise complexity.
 */
export class SimpleComponentSystem {
	/** @private @type {ActionDispatcher} */
	#actionDispatcher;
	/** @private @type {Map<string, Function>} */
	#componentTypes = new Map();

	/**
	 * Creates a SimpleComponentSystem instance
	 */
	constructor() {
		this.#actionDispatcher = actionDispatcher;
		this.#registerBuiltIns();
	}

	/**
	 * Initialize the component system
	 * @returns {Promise<void>}
	 */
	async initialize() {
		await this.#actionDispatcher.dispatch("component.system.initialized", {
			primitiveCount: Object.keys(COMPONENT_PRIMITIVES).length,
			registeredTypes: Array.from(this.#componentTypes.keys()),
		});
	}

	/**
	 * Register a component type
	 * @param {string} type - Component type name
	 * @param {Function} renderFn - Render function (element, props) => cleanup
	 */
	register(type, renderFn) {
		if (typeof renderFn !== "function") {
			throw new Error("Component render function is required");
		}
		this.#componentTypes.set(type, renderFn);
	}

	/**
	 * Create and render a component
	 * @param {string|object} definition - Component type or definition object
	 * @param {object} [props={}] - Component properties
	 * @param {HTMLElement} [container] - Container element
	 * @returns {Promise<HTMLElement>} Created element
	 */
	async create(definition, props = {}, container = null) {
		let type, componentProps;

		// Handle string type or object definition
		if (typeof definition === "string") {
			type = definition;
			componentProps = props;
		} else if (definition && typeof definition === "object") {
			type = definition.type;
			componentProps = { ...definition.props, ...props };
		} else {
			throw new Error("Invalid component definition");
		}

		// Get primitive or registered component
		const primitive = COMPONENT_PRIMITIVES[type];
		const customRenderer = this.#componentTypes.get(type);

		let element;

		if (customRenderer) {
			// Use custom component renderer
			element = document.createElement("div");
			element.className = `component-${type}`;

			try {
				await customRenderer(element, componentProps);
			} catch (error) {
				console.error(
					`[SimpleComponentSystem] Error rendering ${type}:`,
					error
				);
				element.textContent = `Error rendering ${type}`;
			}
		} else if (primitive) {
			// Use primitive definition
			element = this.#createPrimitive(type, componentProps);
		} else {
			// Unknown type - create basic element
			element = document.createElement("div");
			element.className = `component-unknown`;
			element.textContent = `Unknown component: ${type}`;
		}

		// Add to container if provided
		if (container) {
			container.appendChild(element);
		}

		// Notify backend
		await this.#actionDispatcher.dispatch("component.created", {
			type,
			hasContainer: !!container,
			propsCount: Object.keys(componentProps).length,
		});

		return element;
	}

	/**
	 * Create element from primitive definition
	 * @private
	 * @param {string} type - Primitive type
	 * @param {object} props - Properties
	 * @returns {HTMLElement} Created element
	 */
	#createPrimitive(type, props) {
		const primitive = COMPONENT_PRIMITIVES[type];
		const element = document.createElement(primitive.tag);

		// Apply default styles
		if (primitive.defaultStyle) {
			Object.assign(element.style, primitive.defaultStyle);
		}

		// Apply component-specific logic
		switch (type) {
			case "text":
				element.textContent = props.text || props.value || "";
				break;

			case "html":
				this.#setInnerHTML(element, props.html || props.content || "");
				break;

			case "button":
				element.textContent = props.text || props.label || "Button";
				if (props.onClick || props.action) {
					this.#attachAction(
						element,
						props.action || "button.clicked",
						props
					);
				}
				break;

			case "input":
				if (props.type) element.type = props.type;
				if (props.placeholder) element.placeholder = props.placeholder;
				if (props.value !== undefined) element.value = props.value;
				break;

			case "label":
				element.textContent = props.text || props.label || "";
				if (props.htmlFor) element.htmlFor = props.htmlFor;
				break;

			case "container":
				// Container can have children
				if (props.children && Array.isArray(props.children)) {
					this.#renderChildren(element, props.children);
				}
				break;
		}

		// Apply custom properties
		if (props.className) element.className = props.className;
		if (props.id) element.id = props.id;
		if (props.style) Object.assign(element.style, props.style);

		// Apply data attributes
		Object.keys(props).forEach((key) => {
			if (key.startsWith("data-")) {
				element.setAttribute(key, props[key]);
			}
		});

		return element;
	}

	/**
	 * Safely set innerHTML with basic sanitization
	 * @private
	 * @param {HTMLElement} element - Target element
	 * @param {string} html - HTML content
	 */
	#setInnerHTML(element, html) {
		// Basic sanitization - remove script tags and event handlers
		const sanitized = String(html)
			.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
			.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "")
			.replace(/\son\w+\s*=\s*[^>\s]+/gi, "");

		element.innerHTML = sanitized;
	}

	/**
	 * Attach action handler to element
	 * @private
	 * @param {HTMLElement} element - Target element
	 * @param {string} action - Action name
	 * @param {object} props - Component properties
	 */
	#attachAction(element, action, props) {
		element.addEventListener("click", async () => {
			try {
				await this.#actionDispatcher.dispatch(action, {
					elementType: element.tagName.toLowerCase(),
					componentProps: props,
					timestamp: new Date().toISOString(),
				});
			} catch (error) {
				console.error(
					"[SimpleComponentSystem] Action dispatch failed:",
					error
				);
			}
		});
	}

	/**
	 * Render child components
	 * @private
	 * @param {HTMLElement} container - Parent container
	 * @param {Array} children - Child component definitions
	 */
	async #renderChildren(container, children) {
		for (const child of children) {
			try {
				await this.create(child, {}, container);
			} catch (error) {
				console.error(
					"[SimpleComponentSystem] Child render failed:",
					error
				);
			}
		}
	}

	/**
	 * Register built-in components
	 * @private
	 */
	#registerBuiltIns() {
		// Card component (composite)
		this.register("card", async (element, props) => {
			element.className = "component-card";
			Object.assign(element.style, {
				border: "1px solid var(--border, #e5e7eb)",
				borderRadius: "var(--border-radius, 8px)",
				padding: "var(--padding, 16px)",
				background: "var(--surface, #ffffff)",
				boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
			});

			// Add title if provided
			if (props.title) {
				const title = await this.create("text", {
					text: props.title,
					style: {
						fontWeight: "600",
						fontSize: "18px",
						marginBottom: "8px",
						display: "block",
					},
				});
				element.appendChild(title);
			}

			// Add content
			if (props.content) {
				const content = await this.create("text", {
					text: props.content,
					style: { display: "block" },
				});
				element.appendChild(content);
			}
		});

		// Form field component (composite)
		this.register("field", async (element, props) => {
			element.className = "component-field";
			Object.assign(element.style, {
				display: "flex",
				flexDirection: "column",
				gap: "4px",
				marginBottom: "16px",
			});

			// Add label
			if (props.label) {
				const label = await this.create("label", {
					text: props.label,
					htmlFor: props.id,
				});
				element.appendChild(label);
			}

			// Add input
			const input = await this.create("input", {
				id: props.id,
				type: props.type || "text",
				placeholder: props.placeholder,
				value: props.value,
			});
			element.appendChild(input);
		});
	}

	/**
	 * Get list of available component types
	 * @returns {string[]} Available component types
	 */
	getAvailableTypes() {
		const primitives = Object.keys(COMPONENT_PRIMITIVES);
		const custom = Array.from(this.#componentTypes.keys());
		return [...primitives, ...custom];
	}

	/**
	 * Dispose of the component system
	 */
	dispose() {
		this.#componentTypes.clear();
	}
}

export default SimpleComponentSystem;
