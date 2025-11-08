import { normalizeConfig } from "./GridRuntimeConfig.js";
import { LayoutStore } from "./LayoutStore.js";
import { BuildingBlockRenderer } from "../../ui/BuildingBlockRenderer.js";

/**
 * @class ComponentRegistry
 * @description Manages the definitions and lifecycle (mount/unmount) of components that can be rendered within the grid.
 * It acts as a central repository for all available component types, from simple text blocks to complex nested grids.
 * @privateFields {#types, #allowed, #stateManager, #renderer}
 */
export class ComponentRegistry {
	#types = new Map();
	#allowed = new Set(["text", "html"]);
	/** @type {import('../../../platform/state/HybridStateManager.js').default|null} */
	#stateManager = null;
	/** @type {BuildingBlockRenderer|null} */
	#renderer = null;

	/**
	 * @param {object} context
	 * @param {import('../../../platform/state/HybridStateManager.js').default} context.stateManager - The central state manager.
	 */
	constructor({ stateManager }) {
		if (!stateManager) {
			throw new Error("ComponentRegistry requires a stateManager.");
		}
		this.#stateManager = stateManager;
		// V8.0 Parity: The renderer is now a dependency, instantiated here.
		this.#renderer = new BuildingBlockRenderer({ stateManager });
		this.#initializeBuiltIns();
	}

	/**
	 * Sets the list of component types that are allowed to be mounted.
	 * @param {string[]} list - An array of allowed component type IDs.
	 */

	setAllowedTypes(list) {
		if (Array.isArray(list)) this.#allowed = new Set(list.map(String));
	}

	/**
	 * Registers a new component type with its mount/unmount logic.
	 * @param {string} type - The unique identifier for the component type.
	 * @param {object} definition - The component definition.
	 * @param {Function} definition.mount - The function to call to render the component.
	 * @param {Function} [definition.unmount] - An optional cleanup function.
	 */

	register(type, { mount, unmount }) {
		if (!type || typeof mount !== "function") return;
		// V8.0 Parity: Store the full definition, including potential metadata.
		this.#types.set(type, {
			id: type,
			mount,
			unmount,
			category: "building-block",
			name: type,
		});
	}

	/**
	 * Mounts a component of a given type into a target DOM element.
	 * @param {string} type - The ID of the component type to mount.
	 * @param {HTMLElement} el - The target DOM element to mount into.
	 * @param {object} [props={}] - The properties to pass to the component.
	 * @param {object} [context={}] - The rendering context.
	 * @returns {Promise<Function>} A promise that resolves to an unmount function.
	 */

	async mount(type, el, props = {}, context = {}) {
		if (!this.#allowed.has(type)) {
			el.textContent = "[blocked component]";
			return () => {
				el.textContent = "";
			};
		}
		const entry = this.#types.get(type);

		if (!entry) {
			// default: render text if missing
			el.textContent = props?.text ?? "";
			return () => {
				el.textContent = "";
			};
		}

		// V8.0 Parity: Pass the stateManager into the context for all mounted components.
		const mountContext = { ...context, stateManager: this.#stateManager };

		const ret = await entry.mount(el, props, mountContext);
		if (typeof ret === "function") return ret;

		return () => {
			try {
				entry.unmount?.(el);
			} catch {
				// Unmount is best-effort.
			}
		};
	}

	/**
	 * Retrieves a component definition by its ID.
	 * @param {string} id - The component ID.
	 * @returns {object|undefined}
	 */
	get(id) {
		return this.#types.get(id);
	}

	/**
	 * Retrieves all component definitions within a specific category.
	 * @param {string} category - The category to filter by (e.g., 'building-block').
	 * @returns {object[]} An array of component definitions.
	 */
	getByCategory(category) {
		const results = [];
		for (const def of this.#types.values()) {
			if (def.category === category) {
				results.push(def);
			}
		}
		return results;
	}

	/**
	 * Initializes and registers the default built-in components.
	 * @private
	 */
	#initializeBuiltIns() {
		this.register("text", {
			mount: (el, props) => {
				el.textContent = props?.value ?? props?.text ?? "";
				return () => {
					el.textContent = "";
				};
			},
		});

		this.register("html", {
			mount: (el, props) => {
				const html = String(props?.html ?? "");
				// Basic hardening: strip script tags and inline event handlers
				const tmp = document.createElement("div");
				tmp.textContent = html; // [auto: innerHTML → SafeDOM.setText()]
				// Remove <script> and on* attributes
				tmp.querySelectorAll("script").forEach((n) => n.remove());
				tmp.querySelectorAll("*").forEach((n) => {
					[...n.attributes].forEach((attr) => {
						const name = attr.name;
						const val = String(attr.value || "").trim();
						if (/^on/i.test(name)) {
							n.removeAttribute(name);
							return;
						}
						// Drop style attributes entirely to avoid CSS-based exfiltration
						if (name.toLowerCase() === "style") {
							n.removeAttribute(name);
							return;
						}
						// Disallow javascript: or data: URLs on href/src/xlink:href
						if (
							["href", "src", "xlink:href"].includes(
								name.toLowerCase()
							)
						) {
							const lower = val.toLowerCase();
							if (
								lower.startsWith("javascript:") ||
								lower.startsWith("data:")
							) {
								n.removeAttribute(name);
							}
						}
					});
				});
				el.replaceChildren(...tmp.childNodes);
				return () => {
					el.replaceChildren();
				};
			},
		});

		this.register("block", {
			mount: (el, props = {}, context = {}) => {
				const definition = {
					type: "container",
					props: {
						className: "cfg-block-card",
						style: {
							border: "1px solid var(--border)",
							borderRadius: "var(--border-radius)",
							padding: "var(--padding-md)",
							background: "var(--surface-elevated)",
							minHeight: "60px",
							flexDirection: "column",
							alignItems: "flex-start",
						},
					},
					children: [
						{
							type: "text",
							props: {
								text: props.title ?? "Block",
								style: {
									fontWeight: "600",
									marginBottom: "6px",
								},
							},
						},
						{
							type: "text",
							props: {
								text: props.body ?? "Configure me",
								style: { opacity: "0.85" },
							},
						},
					],
				};
				return this.#renderer.render(el, definition, context);
			},
		});

		this.register("button", {
			mount: (el, props = {}, context = {}) => {
				const definition = {
					type: "button",
					props: {
						"data-action": props.action || "builder:add_component",
						"data-action-payload": JSON.stringify({
							componentType: "block",
						}),
						text: props.label || "Click Me",
						...props,
					},
				};
				return this.#renderer.render(el, definition, context);
			},
		});

		this.register("grid", {
			mount: async (el, props = {}, context = {}) => {
				const stateManager = context.stateManager;
				// Create nested container
				const container = document.createElement("div");
				container.className = "grid-container nested-grid-container";
				el.appendChild(container);

				// Compute nested identifiers and scope for persistence
				const parentId = String(context.parentConfigId || "default");
				const nestedKey = `${parentId}:${String(context.blockId || props.id || "grid")}`;
				const scope = (() => {
					try {
						const policies = stateManager?.managers?.policies;
						const subj =
							stateManager?.managers?.securityManager?.getSubject?.() ||
							{};
						const pref = String(
							policies?.getPolicy(
								"system",
								"grid_auto_save_layout_scope"
							) || "tenant"
						).toLowerCase();
						if (pref === "user")
							return {
								tenantId: subj.tenantId,
								userId: subj.userId,
							};
						if (pref === "tenant")
							return {
								tenantId: subj.tenantId,
								userId: "tenant",
							};
						return { tenantId: "global", userId: "global" };
					} catch {
						return { tenantId: "public", userId: "anon" };
					}
				})();
				const store = new LayoutStore({ stateManager });

				// Load saved nested config if present; else fallback to provided props.config
				let rawConfig = props?.config || {};
				try {
					const savedCfg = await store.loadConfig(nestedKey, scope);
					if (savedCfg) rawConfig = savedCfg;
				} catch {
					/* noop */
				}

				// Build a local ViewModel compatible with EnhancedGridRenderer expectations
				const cfg = normalizeConfig(rawConfig);
				const blocks = cfg.blocks.map((b) => ({
					blockId: b.id,
					position: { x: b.x, y: b.y, w: b.w, h: b.h },
				}));
				const nestedVM = {
					_layout: { blocks },
					getCurrentLayout() {
						return this._layout;
					},
					updatePositions(updates) {
						const byId = new Map(
							this._layout.blocks.map((b) => [b.blockId, b])
						);

						for (const u of updates || []) {
							const rec = byId.get(u.blockId);

							if (rec) {
								rec.position.x = u.x;
								rec.position.y = u.y;
								rec.position.w = u.w;
								rec.position.h = u.h;
							}
						}
						// reflect back into blocks array (preserve order)
						this._layout.blocks = this._layout.blocks.map(
							(b) => byId.get(b.blockId) || b
						);
					},
				};

				// Instantiate a dedicated renderer for the nested grid
				// V8.0 Parity: EnhancedGridRenderer is not a class to be instantiated directly.
				const enhancer =
					stateManager.managers.completeGridSystem.getGridRenderer();

				// Initialize with onLayoutChange hook for nested autosave
				await enhancer.initialize({
					container,
					appViewModel: { gridLayoutViewModel: nestedVM },
					options: {
						onLayoutChange: async () => {
							try {
								const layout = enhancer.getCurrentLayout?.();
								if (layout)
									await store.save(nestedKey, layout, scope);
							} catch {
								/* noop */
							}
						},
					},
				});

				// Create block DOMs and mount inner components
				for (const b of cfg.blocks) {
					const block = document.createElement("div");
					block.className = "grid-block";
					block.dataset.blockId = b.id;
					block.dataset.minW = String(b.constraints.minW);
					block.dataset.minH = String(b.constraints.minH);
					block.dataset.maxW = String(b.constraints.maxW);
					block.dataset.maxH = String(b.constraints.maxH);
					const content = document.createElement("div");
					content.className = "grid-block-content";
					block.appendChild(content);
					container.appendChild(block);
					try {
						await this.mount(b.type, content, b.props || {}, {
							...context,
							parentConfigId: nestedKey,
						});
					} catch {
						/* noop */
					}
				}

				// Persist effective nested config
				try {
					await store.saveConfig(nestedKey, cfg, scope);
				} catch {
					/* noop */
				}

				// Attempt to load any saved nested layout and apply positions
				try {
					const saved = await store.load(nestedKey, scope);
					if (saved?.blocks && Array.isArray(saved.blocks)) {
						for (const b of saved.blocks) {
							const p = {
								blockId: b.blockId,
								x: b.position?.x ?? b.x,
								y: b.position?.y ?? b.y,
								w: b.position?.w ?? b.w,
								h: b.position?.h ?? b.h,
							};
							enhancer.updateBlockPosition?.(
								p.blockId,
								p.x,
								p.y,
								p.w,
								p.h
							);
						}
					}
				} catch {
					/* noop */
				}

				// Return cleanup
				return () => {
					try {
						enhancer.destroy?.();
					} catch {
						/* noop */
					}
					el.replaceChildren();
				};
			},
		});
	}
}
