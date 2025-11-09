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

	if (!tauriIndicator) {
		console.debug(
			"[safeInvoke] Tauri not available, skipping invoke:",
			cmd
		);
		return null;
	}

	try {
		const mod = await import("@tauri-apps/api/core");
		if (mod && typeof mod.invoke === "function") {
			return await mod.invoke(cmd, args);
		}
	} catch (e) {
		console.warn("[safeInvoke] Tauri invoke failed, running offline:", e);
		return null;
	}

	return null;
}

/**
 * @class ActionDispatcher
 * @classdesc Enhanced proxy with Universal Plugin System support
 */
export class ActionDispatcher {
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
			const result = await safeInvoke("execute_action_with_plugins", {
				args: {
					actionType: actionType,
					payload,
				},
			});

			if (result) {
				console.log(`[ActionDispatcher] Action completed:`, {
					success: result.success,
					executionTime: result.execution_time_ms,
					pluginExecuted: result.plugin_executed,
				});
				return result;
			}

			return null;
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

export default ActionDispatcher;
