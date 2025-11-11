/**
 * @file ActionDispatcher_Updated.js
 * @description Enhanced ActionDispatcher with Universal Plugin System support
 * Routes through plugin system for both JS and Rust plugins
 */

// Guarded dynamic import for Tauri
async function safeInvoke(cmd, args) {
	const tauriIndicator =
		typeof globalThis !== "undefined" &&
		(globalThis.__TAURI__ ||
			globalThis.__TAURI_INVOKE ||
			globalThis.__TAURI_INVOKE__);

	// Debug: reveal what bridge indicators we see (helps with dev/webview mismatches)
	try {
		// Use console.log so these messages are visible in browser consoles
		// where debug-level may be filtered.
		console.log("[safeInvoke] tauriIndicator:", Boolean(tauriIndicator));
		console.log(
			"[safeInvoke] globalThis.__TAURI__:",
			!!globalThis.__TAURI__
		);
		console.log(
			"[safeInvoke] globalThis.__TAURI__?.core:",
			!!(globalThis.__TAURI__ && globalThis.__TAURI__.core)
		);
	} catch (e) {
		// ignore in non-browser contexts
	}

	// Quick global-first fast path: if the webview has injected a TAURI bridge,
	// call it directly. This avoids dynamic import pitfalls and is the most
	// reliable path inside the embedded Tauri webview.
	try {
		// Prefer the core.invoke shape which some Tauri runtimes expose
		// as the canonical invoke implementation.
		if (
			globalThis.__TAURI__ &&
			globalThis.__TAURI__.core &&
			typeof globalThis.__TAURI__.core.invoke === "function"
		) {
			console.log("[safeInvoke] using globalThis.__TAURI__.core.invoke");
			try {
				return await globalThis.__TAURI__.core.invoke(cmd, args);
			} catch (err) {
				// Some Tauri bridge variants require the payload to be wrapped in
				// an `args` object. If the bridge complains about missing `args`,
				// retry with the wrapper.
				const msg = err && err.message ? err.message : String(err);
				if (
					/missing required key args|missing required key `args`|invalid args `args`/i.test(
						msg
					)
				) {
					console.log(
						"[safeInvoke] core.invoke requires wrapper 'args', retrying with wrapper"
					);
					return await globalThis.__TAURI__.core.invoke(cmd, {
						args: args,
					});
				}
				throw err;
			}
		}
		if (
			typeof window !== "undefined" &&
			window.__TAURI__ &&
			window.__TAURI__.core &&
			typeof window.__TAURI__.core.invoke === "function"
		) {
			console.log("[safeInvoke] using window.__TAURI__.core.invoke");
			return await window.__TAURI__.core.invoke(cmd, args);
		}
		// Fall back to top-level invoke if present
		if (
			globalThis.__TAURI__ &&
			typeof globalThis.__TAURI__.invoke === "function"
		) {
			console.log("[safeInvoke] using globalThis.__TAURI__.invoke");
			try {
				return await globalThis.__TAURI__.invoke(cmd, args);
			} catch (err) {
				const msg = err && err.message ? err.message : String(err);
				if (
					/missing required key args|invalid args `args`/i.test(msg)
				) {
					console.log(
						"[safeInvoke] top-level invoke requires wrapper 'args', retrying with wrapper"
					);
					return await globalThis.__TAURI__.invoke(cmd, {
						args: args,
					});
				}
				throw err;
			}
		}
		if (
			typeof window !== "undefined" &&
			window.__TAURI__ &&
			typeof window.__TAURI__.invoke === "function"
		) {
			console.log("[safeInvoke] using window.__TAURI__.invoke");
			return await window.__TAURI__.invoke(cmd, args);
		}
	} catch (err) {
		console.warn(
			"[safeInvoke] global __TAURI__ invoke threw:",
			err && err.message ? err.message : err
		);
	}

	// If there's no tauri global indicator, skip importing the packaged API to
	// avoid executing module initialization that can throw in dev/browser
	// environments which don't provide the native bridge.
	if (tauriIndicator) {
		// Try a few known static import paths in sequence. Using static
		// imports avoids Vite's dynamic-import-vars limitations.
		try {
			// Perform the dynamic import via Function to avoid bundler resolution
			// during build. This keeps the import dynamic at runtime inside
			// the Tauri webview while preventing Rollup from trying to resolve
			// the module when building the client bundle.
			const mod = await new Function(
				'return import("@tauri-apps/api/tauri")'
			)();
			console.debug("[safeInvoke] imported @tauri-apps/api/tauri");
			const invokeFn =
				(mod && typeof mod.invoke === "function" && mod.invoke) ||
				(mod &&
					mod.default &&
					typeof mod.default.invoke === "function" &&
					mod.default.invoke) ||
				null;
			if (invokeFn) {
				try {
					return await invokeFn(cmd, args);
				} catch (callErr) {
					console.warn(
						"[safeInvoke] invoke from @tauri-apps/api/tauri threw:",
						callErr && callErr.message ? callErr.message : callErr
					);
				}
			}
		} catch (e) {
			console.log(
				"[safeInvoke] import(@tauri-apps/api/tauri) failed:",
				e && e.message ? e.message : e
			);
		}

		try {
			const mod = await new Function(
				'return import("@tauri-apps/api/core")'
			)();
			console.debug("[safeInvoke] imported @tauri-apps/api/core");
			const invokeFn =
				(mod && typeof mod.invoke === "function" && mod.invoke) ||
				(mod &&
					mod.default &&
					typeof mod.default.invoke === "function" &&
					mod.default.invoke) ||
				null;
			if (invokeFn) {
				try {
					return await invokeFn(cmd, args);
				} catch (callErr) {
					console.warn(
						"[safeInvoke] invoke from @tauri-apps/api/core threw:",
						callErr && callErr.message ? callErr.message : callErr
					);
				}
			}
		} catch (e) {
			console.log(
				"[safeInvoke] import(@tauri-apps/api/core) failed:",
				e && e.message ? e.message : e
			);
		}

		try {
			const mod = await new Function(
				'return import("@tauri-apps/api")'
			)();
			console.debug("[safeInvoke] imported @tauri-apps/api");
			const invokeFn =
				(mod && typeof mod.invoke === "function" && mod.invoke) ||
				(mod &&
					mod.default &&
					typeof mod.default.invoke === "function" &&
					mod.default.invoke) ||
				null;
			if (invokeFn) {
				try {
					return await invokeFn(cmd, args);
				} catch (callErr) {
					console.warn(
						"[safeInvoke] invoke from @tauri-apps/api threw:",
						callErr && callErr.message ? callErr.message : callErr
					);
				}
			}
		} catch (e) {
			console.log(
				"[safeInvoke] import(@tauri-apps/api) failed:",
				e && e.message ? e.message : e
			);
		}
	}

	// Global fallback attempts (older embeds / direct webview globals)
	try {
		console.log("[safeInvoke] trying global __TAURI__ invoke fallback");
		// Prefer core.invoke shape first
		if (
			globalThis.__TAURI__ &&
			globalThis.__TAURI__.core &&
			typeof globalThis.__TAURI__.core.invoke === "function"
		) {
			return await globalThis.__TAURI__.core.invoke(cmd, args);
		}
		if (
			globalThis.__TAURI__ &&
			typeof globalThis.__TAURI__.invoke === "function"
		) {
			return await globalThis.__TAURI__.invoke(cmd, args);
		}
		// Some environments put the bridge on window.__TAURI__ instead of globalThis
		if (typeof window !== "undefined") {
			if (
				window.__TAURI__ &&
				typeof window.__TAURI__.invoke === "function"
			) {
				return await window.__TAURI__.invoke(cmd, args);
			}
			if (
				window.__TAURI__ &&
				window.__TAURI__.core &&
				typeof window.__TAURI__.core.invoke === "function"
			) {
				return await window.__TAURI__.core.invoke(cmd, args);
			}
		}
	} catch (inner) {
		console.warn(
			"[safeInvoke] Global Tauri invoke failed:",
			inner && inner.message ? inner.message : inner
		);
	}

	console.debug(
		"[safeInvoke] Tauri not available or invoke not found, returning null",
		cmd
	);
	return null;
}

/**
 * @class ActionDispatcher
 * @classdesc Enhanced proxy with Universal Plugin System support
 */
class ActionDispatcher {
	/** @private @type {Map<HTMLElement, Function>} */
	#rootListeners = new Map();
	/** @private @type {Set<HTMLElement>} */
	#attachedRoots = new Set();

	/** @private @type {Map<string, Function>} */
	#jsPluginRegistry = new Map();

	/** @private @type {Map<string, Object>} */
	#pluginMetadata = new Map();

	constructor() {
		console.log("[ActionDispatcher] Initialized with plugin support");
	}

	/**
	 * Register JavaScript plugin for hot reload capability
	 * @public
	 * @param {Object} pluginConfig - Plugin configuration
	 * @param {string} pluginConfig.id - Unique plugin identifier
	 * @param {string} pluginConfig.name - Human readable name
	 * @param {string} pluginConfig.version - Plugin version
	 * @param {string} pluginConfig.author - Plugin author
	 * @param {string} pluginConfig.description - Plugin description
	 * @param {Array<string>} pluginConfig.handledActions - Actions this plugin handles
	 * @param {Function} pluginConfig.handler - Action handler function
	 * @param {Object} pluginConfig.metadata - Additional metadata
	 * @returns {Promise<boolean>} Success status
	 */
	async registerJSPlugin(pluginConfig) {
		try {
			const {
				id,
				name,
				version = "1.0.0",
				author = "Unknown",
				description = "",
				handledActions = [],
				handler,
				metadata = {},
			} = pluginConfig;

			if (!id || !handler || !handledActions.length) {
				throw new Error(
					"Plugin must have id, handler, and handledActions"
				);
			}

			// Store plugin locally for immediate use (hot reload)
			this.#jsPluginRegistry.set(id, handler);
			this.#pluginMetadata.set(id, {
				id,
				name,
				version,
				author,
				description,
				handledActions,
				metadata,
				registeredAt: new Date(),
			});

			// Register with Rust backend for persistence and enterprise integration
			const pluginRequest = {
				id,
				name,
				version,
				author,
				description,
				code: handler.toString(), // Serialize function
				handled_actions: handledActions,
				metadata: {
					category: metadata.category || "User",
					tags: metadata.tags || ["community"],
					priority: metadata.priority || 100,
					dependencies: metadata.dependencies || [],
					api_version: "1.0",
					homepage: metadata.homepage || null,
					documentation: metadata.documentation || null,
				},
				license_requirements: {
					minimum_tier: "Community",
					requires_signed: false,
					enterprise_only_features: [],
				},
			};

			const result = await safeInvoke("register_js_plugin", {
				pluginRequest: pluginRequest,
			});

			if (result?.success) {
				console.log(`[ActionDispatcher] JS Plugin registered: ${id}`);
				return true;
			} else {
				console.error(
					`[ActionDispatcher] Failed to register plugin: ${id}`
				);
				return false;
			}
		} catch (error) {
			console.error(
				`[ActionDispatcher] Plugin registration error:`,
				error
			);
			return false;
		}
	}

	/**
	 * Dispatch action through Universal Plugin System
	 * @public
	 * @param {string} actionType - Action type identifier
	 * @param {object} payload - Action payload
	 * @returns {Promise<any|null>} Action result
	 */
	async dispatch(actionType, payload = {}) {
		try {
			console.log(
				`[ActionDispatcher] Dispatching: ${actionType}`,
				payload
			);

			// Check local JS plugins first (hot reload capability)
			const localResult = await this.tryLocalJSPlugins(
				actionType,
				payload
			);
			if (localResult !== null) {
				return localResult;
			}

			// Route through Rust plugin system (handles JS plugins + Rust plugins + core)
			// Prefer the embedded webview's core.invoke shape which in practice
			// expects a wrapper of the form { args: { actionType, payload } }.
			// If that direct path isn't available or fails, fall back to safeInvoke
			// which contains additional import/fallback logic.
			let result = null;
			try {
				if (
					globalThis.__TAURI__ &&
					globalThis.__TAURI__.core &&
					typeof globalThis.__TAURI__.core.invoke === "function"
				) {
					console.log(
						"[ActionDispatcher] Using direct global core.invoke with wrapped args"
					);
					try {
						result = await globalThis.__TAURI__.core.invoke(
							"execute_action_with_plugins",
							{ args: { actionType: actionType, payload } }
						);
					} catch (err) {
						// If the direct invoke throws because of shape mismatch, fall back to safeInvoke
						console.warn(
							"[ActionDispatcher] direct core.invoke threw, falling back to safeInvoke:",
							err && err.message ? err.message : err
						);
						result = await safeInvoke(
							"execute_action_with_plugins",
							{
								actionType: actionType,
								payload,
							}
						);
					}
				} else {
					result = await safeInvoke("execute_action_with_plugins", {
						actionType: actionType,
						payload,
					});
				}
			} catch (err) {
				console.warn(
					"[ActionDispatcher] execute_action_with_plugins invocation failed:",
					err && err.message ? err.message : err
				);
			}

			if (result) {
				console.log(`[ActionDispatcher] Action completed:`, {
					success: result.success,
					executionTime: result.execution_time_ms,
					pluginExecuted: result.plugin_executed,
				});
				return result;
			}

			// If we get here, the native invoke returned null/undefined. Provide a
			// structured error object instead of a raw null so callers can handle
			// the offline/native-unavailable case explicitly.
			console.warn(
				`[ActionDispatcher] Native invoke returned no result for action: ${actionType}`,
				payload
			);
			return {
				success: false,
				error: "native_unavailable",
				actionType,
				payload,
			};
		} catch (error) {
			console.error(
				`[ActionDispatcher] Failed to dispatch ${actionType}:`,
				error
			);
			return null;
		}
	}

	/**
	 * Try local JS plugins for immediate hot reload
	 * @private
	 * @param {string} actionType - Action type
	 * @param {object} payload - Action payload
	 * @returns {Promise<any|null>} Plugin result or null
	 */
	async tryLocalJSPlugins(actionType, payload) {
		for (const [pluginId, handler] of this.#jsPluginRegistry.entries()) {
			const metadata = this.#pluginMetadata.get(pluginId);

			if (metadata?.handledActions.includes(actionType)) {
				try {
					console.log(
						`[ActionDispatcher] Executing local JS plugin: ${pluginId}`
					);
					const startTime = performance.now();

					const result = await handler(payload, {
						actionType,
						pluginId,
						timestamp: new Date(),
					});

					const executionTime = performance.now() - startTime;

					console.log(
						`[ActionDispatcher] Local plugin completed: ${pluginId} (${executionTime.toFixed(
							2
						)}ms)`
					);

					return {
						success: true,
						data: result,
						execution_time_ms: Math.round(executionTime),
						plugin_executed: true,
						plugin_id: pluginId,
						plugin_type: "javascript_local",
					};
				} catch (error) {
					console.error(
						`[ActionDispatcher] Local plugin error: ${pluginId}`,
						error
					);
					return {
						success: false,
						error: error.message,
						plugin_executed: true,
						plugin_id: pluginId,
						plugin_type: "javascript_local",
					};
				}
			}
		}

		return null; // No local plugin handled it
	}

	/**
	 * Get loaded plugin information
	 * @public
	 * @returns {Promise<Array>} Plugin information
	 */
	async getLoadedPlugins() {
		try {
			const backendPlugins = await safeInvoke("get_loaded_plugins");
			const localPlugins = Array.from(this.#pluginMetadata.values()).map(
				(meta) => ({
					id: meta.id,
					name: meta.name,
					version: meta.version,
					plugin_type: "JavaScript",
					enabled: true,
					loaded_at: meta.registeredAt,
					source: "local",
				})
			);

			return {
				backend_plugins: backendPlugins || [],
				local_plugins: localPlugins,
				total_count:
					(backendPlugins?.length || 0) + localPlugins.length,
			};
		} catch (error) {
			console.error(
				"[ActionDispatcher] Failed to get plugin info:",
				error
			);
			return { backend_plugins: [], local_plugins: [], total_count: 0 };
		}
	}

	/**
	 * Remove local JavaScript plugin
	 * @public
	 * @param {string} pluginId - Plugin identifier
	 * @returns {boolean} Success status
	 */
	removeJSPlugin(pluginId) {
		const removed =
			this.#jsPluginRegistry.delete(pluginId) &&
			this.#pluginMetadata.delete(pluginId);

		if (removed) {
			console.log(
				`[ActionDispatcher] Removed local JS plugin: ${pluginId}`
			);

			// Also remove from backend
			safeInvoke("remove_js_plugin", { pluginId: pluginId })
				.then((result) => {
					if (result?.success) {
						console.log(
							`[ActionDispatcher] Backend plugin removed: ${pluginId}`
						);
					}
				})
				.catch((error) => {
					console.warn(
						`[ActionDispatcher] Failed to remove backend plugin: ${pluginId}`,
						error
					);
				});
		}

		return removed;
	}

	/**
	 * Get plugin marketplace
	 * @public
	 * @returns {Promise<Array>} Available plugins
	 */
	async getPluginMarketplace() {
		try {
			return (await safeInvoke("get_plugin_marketplace")) || [];
		} catch (error) {
			console.error(
				"[ActionDispatcher] Failed to get marketplace:",
				error
			);
			return [];
		}
	}

	/**
	 * Install plugin from marketplace
	 * @public
	 * @param {string} pluginId - Plugin identifier
	 * @returns {Promise<boolean>} Installation success
	 */
	async installMarketplacePlugin(pluginId) {
		try {
			const result = await safeInvoke("install_marketplace_plugin", {
				pluginId: pluginId,
			});

			if (result?.success) {
				console.log(
					`[ActionDispatcher] Marketplace plugin installed: ${pluginId}`
				);
				return true;
			} else {
				console.error(
					`[ActionDispatcher] Failed to install plugin: ${pluginId}`
				);
				return false;
			}
		} catch (error) {
			console.error(`[ActionDispatcher] Installation error:`, error);
			return false;
		}
	}

	/**
	 * Get system plugin status (shows enterprise vs community features)
	 * @public
	 * @returns {Promise<Object>} System status
	 */
	async getSystemPluginStatus() {
		try {
			return (
				(await safeInvoke("get_system_plugin_status")) || {
					license_tier: "Community",
					automatic_plugins_enabled: false,
					available_features: ["Basic functionality"],
					plugin_system_enabled: true,
				}
			);
		} catch (error) {
			console.error(
				"[ActionDispatcher] Failed to get system status:",
				error
			);
			return null;
		}
	}

	// Keep existing methods for compatibility
	attach(root) {
		if (!root || this.#attachedRoots.has(root)) return;

		const handler = (event) => this._handleClick(event);

		root.addEventListener("click", handler);
		this.#attachedRoots.add(root);
		this.#rootListeners.set(root, handler);
	}

	detach(root) {
		if (!root) return;
		const handler = this.#rootListeners.get(root);
		if (handler) {
			root.removeEventListener("click", handler);
			this.#rootListeners.delete(root);
			this.#attachedRoots.delete(root);
		}
	}

	async _handleClick(event) {
		const element = event.target.closest("[data-action]");
		if (!element) return;

		const actionType = element.dataset.action;
		const entityId = element.dataset.entity;

		let payload;
		try {
			if (element.dataset.actionPayload) {
				payload = JSON.parse(element.dataset.actionPayload);
			} else if (
				typeof entityId !== "undefined" &&
				entityId !== null &&
				entityId !== ""
			) {
				// Only include entityId when it exists to avoid { entityId: undefined }
				payload = { entityId };
			} else {
				// No payload and no entity id -> send empty object
				payload = {};
			}
		} catch {
			// If payload is unparsable, include rawPayload for debugging
			payload =
				typeof entityId !== "undefined" &&
				entityId !== null &&
				entityId !== ""
					? { entityId, rawPayload: element.dataset.actionPayload }
					: { rawPayload: element.dataset.actionPayload };
		}

		try {
			await this.dispatch(actionType, payload);
		} catch (error) {
			console.error(`[ActionDispatcher] Click handler failed:`, error);
		}
	}

	async emit(eventType, data = {}) {
		return this.dispatch(`event.${eventType}`, data);
	}
}

// Export a single shared instance for the application to use.
const actionDispatcher = new ActionDispatcher();

// For easier debugging during development expose the singleton on window
// so developers can call it from the webview console. This is low-risk and
// gated to browser environments only.
if (typeof window !== "undefined") {
	try {
		window.__actionDispatcher = actionDispatcher;
	} catch (e) {
		// Ignore (some embedder environments may prevent writes to global)
	}
}

export default actionDispatcher;
