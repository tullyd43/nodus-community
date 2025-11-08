/**
 * @file StateUIBridge.js
 * @version 3.0.0 - Enterprise Observability Baseline
 * @description Production-ready state-UI bridge with comprehensive security,
 * observability, and compliance features. Uses centralized orchestration wrapper for
 * consistent observability and minimal logging noise.
 *
 * ESLint Exception: nodus/require-async-orchestration
 * Justification: Wrapper pattern provides superior observability consistency and
 * centralized policy enforcement compared to per-method orchestrator setup.
 *
 * Security Classification: INTERNAL
 * License Tier: Enterprise (UI bridge requires enterprise license)
 * Compliance: MAC-enforced, forensic-audited, polyinstantiation-ready
 */

import { SafeDOM } from "@shared/lib/SafeDOM.js";
import { DateCore } from "@shared/lib/DateUtils.js";

/**
 * @class StateUIBridge
 * @classdesc Enterprise-grade state-UI bridge with comprehensive security,
 * MAC enforcement, forensic auditing, and automatic observability. Bridges
 * HybridStateManager events with vanilla UI helpers for synchronized updates.
 */
export class StateUIBridge {
	/** @private @type {import('@platform/state/HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {object} */
	#managers;
	/** @private @type {{ cleanse?:(value:any, schema?:any)=>any, cleanseText?:(value:string)=>string }|null} */
	#sanitizer;
	/** @private @type {import('@shared/lib/MetricsRegistry.js').MetricsRegistry|undefined} */
	#metrics;
	/** @private @type {import('@shared/lib/ErrorHelpers.js').ErrorBoundary} */
	#errorBoundary;
	/** @private @type {Set<string>} */
	#loggedWarnings;
	/** @private @type {string} */
	#currentUser;

	// Bridge state
	/** @private @type {Set<Function>} */
	#gridSubscriptions = new Set();
	/** @private @type {Function|null} */
	#domBridgeUnsubscribe = null;
	/** @private @type {import('@features/ui/BindEngine.js').default|null} */
	#bindEngine = null;

	/**
	 * Creates an instance of StateUIBridge with enterprise security and observability.
	 * @param {import('@platform/state/HybridStateManager.js').default} stateManager - State manager
	 */
	constructor(stateManager) {
		// V8.0 Parity: Mandate 1.2 - Derive all dependencies from stateManager
		if (!stateManager) {
			// Use console.error as fallback since we don't have ActionDispatcher yet
			console.error("StateUIBridge requires a stateManager instance");
			throw new Error("StateUIBridge requires a stateManager instance");
		}

		this.#stateManager = stateManager;
		this.#loggedWarnings = new Set();

		// Initialize managers from stateManager (no direct instantiation)
		this.#managers = stateManager?.managers || {};
		this.#sanitizer = this.#managers?.sanitizer || null;
		this.#metrics =
			this.#managers?.metricsRegistry?.namespace("ui_bridge") || null;
		this.#errorBoundary = this.#managers?.errorBoundary || null;
		this.#currentUser = this.#initializeUserContext();

		// Validate required orchestrator
		if (!this.#managers?.asyncOrchestrator) {
			this.#emitCriticalWarning(
				"AsyncOrchestrator not available on state manager",
				{
					availableManagers: Object.keys(this.#managers),
				}
			);
			throw new Error(
				"StateUIBridge requires AsyncOrchestrator on the state manager"
			);
		}

		// Validate enterprise license for UI bridge
		this.#validateEnterpriseLicense();
	}

	/**
	 * Validates enterprise license for UI bridge features.
	 * @private
	 */
	#validateEnterpriseLicense() {
		const license = this.#managers?.license;
		if (!license?.hasFeature("ui_bridge")) {
			this.#dispatchAction("license.validation_failed", {
				feature: "ui_bridge",
				component: "StateUIBridge",
			});
			throw new Error("Enterprise license required for StateUIBridge");
		}
	}

	/**
	 * Initializes user context once to avoid repeated lookups.
	 * @private
	 * @returns {string}
	 */
	#initializeUserContext() {
		const securityManager = this.#managers?.securityManager;

		if (securityManager?.getSubject) {
			const subject = securityManager.getSubject();
			const userId = subject?.userId || subject?.id;

			if (userId) {
				this.#dispatchAction("security.user_context_initialized", {
					userId,
					source: "securityManager",
					component: "StateUIBridge",
				});
				return userId;
			}
		}

		this.#dispatchAction("security.user_context_failed", {
			component: "StateUIBridge",
			error: "No valid user context found",
		});

		return "ui.bridge";
	}

	/**
	 * Centralized orchestration wrapper for consistent observability and policy enforcement.
	 * @private
	 * @param {string} operationName - Operation identifier for metrics and logging
	 * @param {Function} operation - Sync operation that returns Promise
	 * @param {object} [options={}] - Additional orchestrator options
	 * @returns {Promise<any>}
	 */
	#runOrchestrated(operationName, operation, options = {}) {
		const orchestrator = this.#managers?.asyncOrchestrator;
		if (!orchestrator) {
			this.#emitWarning("AsyncOrchestrator not available", {
				operation: operationName,
			});
			return operation();
		}

		// Policy enforcement
		const policies = this.#managers.policies;
		if (!policies?.getPolicy("async", "enabled")) {
			this.#emitWarning("Async operations disabled by policy", {
				operation: operationName,
			});
			return Promise.resolve(null);
		}

		// Check UI bridge policy
		if (!policies?.getPolicy("ui", "enable_bind_bridge")) {
			this.#emitWarning("UI bridge disabled by policy", {
				operation: operationName,
			});
			return Promise.resolve(null);
		}

		/* PERFORMANCE_BUDGET: 5ms */
		const runner = orchestrator.createRunner(`ui_bridge.${operationName}`);

		/* PERFORMANCE_BUDGET: varies by operation */
		return runner
			.run(
				() =>
					this.#errorBoundary?.tryAsync(() => operation()) ||
					operation(),
				{
					label: `ui_bridge.${operationName}`,
					actorId: this.#currentUser,
					classification: "INTERNAL",
					timeout: options.timeout || 30000,
					retries: options.retries || 1,
					...options,
				}
			)
			.catch((error) => {
				this.#metrics?.increment("ui_bridge_orchestration_error");
				this.#emitCriticalWarning("UI bridge orchestration failed", {
					operation: operationName,
					error: error.message,
					user: this.#currentUser,
				});
				throw error;
			});
	}

	/**
	 * Dispatches an action through the ActionDispatcher for observability.
	 * @private
	 * @param {string} actionType - Type of action to dispatch
	 * @param {object} payload - Action payload
	 */
	#dispatchAction(actionType, payload) {
		try {
			/* PERFORMANCE_BUDGET: 2ms */
			this.#managers?.actionDispatcher?.dispatch(actionType, {
				...payload,
				actor: this.#currentUser,
				timestamp: DateCore.timestamp(),
				source: "StateUIBridge",
			});
		} catch (error) {
			this.#emitCriticalWarning("Action dispatch failed", {
				actionType,
				error: error.message,
			});
		}
	}

	/**
	 * Sanitizes input to prevent injection attacks.
	 * @private
	 * @param {any} input - Input to sanitize
	 * @param {object} [schema] - Validation schema
	 * @returns {any} Sanitized input
	 */
	#sanitizeInput(input, schema) {
		if (!this.#sanitizer) {
			this.#dispatchAction("security.sanitizer_unavailable", {
				component: "StateUIBridge",
			});
			return input;
		}

		const result = this.#sanitizer.cleanse?.(input, schema) || input;

		if (result !== input) {
			this.#dispatchAction("security.input_sanitized", {
				component: "StateUIBridge",
				inputType: typeof input,
			});
		}

		return result;
	}

	/**
	 * Emits a warning via ActionDispatcher for automatic observability.
	 * @private
	 */
	#emitWarning(message, meta = {}) {
		const warningKey = `${message}-${JSON.stringify(meta)}`;
		if (this.#loggedWarnings.has(warningKey)) return;

		this.#loggedWarnings.add(warningKey);
		this.#dispatchAction("observability.warning", {
			component: "StateUIBridge",
			message,
			meta,
			level: "warning",
		});
	}

	/**
	 * Emits a critical warning via ActionDispatcher for automatic observability.
	 * @private
	 */
	#emitCriticalWarning(message, meta = {}) {
		this.#dispatchAction("observability.critical", {
			component: "StateUIBridge",
			message,
			meta,
			actor: this.#currentUser,
			timestamp: DateCore.timestamp(),
			level: "error",
			critical: true,
		});
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PUBLIC API
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Binds StateManager events to a grid component for real-time synchronization.
	 * @public
	 * @param {object} grid - Grid component with refreshRow, removeRow, and refresh methods
	 * @returns {Function} Cleanup callback that removes subscriptions
	 */
	bindGrid(grid) {
		if (!this.#stateManager || !grid?.refreshRow || !grid?.removeRow) {
			this.#emitWarning("Could not bind grid", {
				hasStateManager: !!this.#stateManager,
				hasRefreshRow: !!grid?.refreshRow,
				hasRemoveRow: !!grid?.removeRow,
				context: "UIBinding",
			});
			return () => {};
		}

		const saved = this.#stateManager.on("entitySaved", (event) =>
			this.#handleEntitySaved(grid, event)
		);
		const deleted = this.#stateManager.on("entityDeleted", (event) =>
			this.#handleEntityDeleted(grid, event)
		);
		const synced = this.#stateManager.on("syncCompleted", (event) =>
			this.#handleSyncCompleted(grid, event)
		);

		const cleanup = () => {
			saved?.();
			deleted?.();
			synced?.();
			this.#gridSubscriptions.delete(cleanup);
		};

		this.#gridSubscriptions.add(cleanup);

		this.#dispatchAction("ui_bridge.grid_bound", {
			gridType: grid.constructor?.name || "unknown",
			subscriptionsCount: this.#gridSubscriptions.size,
		});

		return cleanup;
	}

	/**
	 * Registers the active BindEngine for reuse.
	 * @public
	 * @param {import('@features/ui/BindEngine.js').default|null} bindEngine - BindEngine instance
	 */
	attachBindEngine(bindEngine) {
		this.#bindEngine = bindEngine || null;

		this.#dispatchAction("ui_bridge.bind_engine_attached", {
			hasBindEngine: !!bindEngine,
			bindEngineType: bindEngine?.constructor?.name || null,
		});
	}

	/**
	 * Enables lightweight DOM bridge mirroring stateChange events to data-bind elements.
	 * @public
	 * @param {object} [options={}] - Bridge options
	 * @param {ParentNode} [options.root=document] - Root node for query selection
	 * @param {boolean} [options.updateInputs=false] - Whether to update form controls
	 * @returns {Promise<Function>} Cleanup callback
	 */
	enableDomBridge(options = {}) {
		return this.#runOrchestrated("enableDomBridge", () => {
			this.disableDomBridge();

			const { root = document, updateInputs = false } =
				this.#sanitizeInput(options);

			if (
				!root?.querySelectorAll ||
				typeof this.#stateManager?.on !== "function"
			) {
				this.#emitWarning("Cannot enable DOM bridge", {
					hasRoot: !!root,
					hasQuerySelectorAll: !!root?.querySelectorAll,
					hasStateManagerOn:
						typeof this.#stateManager?.on === "function",
				});
				return Promise.resolve(() => {});
			}

			const handler = (event) => {
				const sanitizedEvent = this.#sanitizeInput(event);
				const { path, value } = sanitizedEvent;

				// If BindEngine is available, delegate to it
				if (typeof this.#bindEngine?.updateBinding === "function") {
					this.#bindEngine.updateBinding(path, value);
					return;
				}

				// Direct DOM updates
				const targets = root.querySelectorAll?.(
					`[data-bind="${path}"]`
				);
				if (!targets || targets.length === 0) return;

				for (const el of targets) {
					const isFormControl =
						updateInputs &&
						el &&
						el.nodeType === 1 &&
						typeof el.matches === "function" &&
						el.matches("input, textarea, select");

					if (isFormControl) {
						if (document.activeElement !== el) {
							el.value = value == null ? "" : String(value);
						}
					} else {
						SafeDOM.setText(el, value == null ? "" : String(value));
					}
				}
			};

			const unsubscribe = this.#stateManager.on("stateChange", handler);
			this.#domBridgeUnsubscribe = () => {
				unsubscribe?.();
				this.#domBridgeUnsubscribe = null;
			};

			this.#dispatchAction("ui_bridge.dom_bridge_enabled", {
				hasRoot: !!root,
				updateInputs,
				rootType: root?.constructor?.name || "unknown",
			});

			return Promise.resolve(this.#domBridgeUnsubscribe);
		});
	}

	/**
	 * Disables the DOM bridge.
	 * @public
	 */
	disableDomBridge() {
		if (this.#domBridgeUnsubscribe) {
			this.#domBridgeUnsubscribe();
			this.#domBridgeUnsubscribe = null;

			this.#dispatchAction("ui_bridge.dom_bridge_disabled", {
				timestamp: DateCore.timestamp(),
			});
		}
	}

	/**
	 * Emits a UI-driven state update with observability.
	 * @public
	 * @param {string} path - State path
	 * @param {any} value - New value
	 * @param {object} [options={}] - Update options
	 * @param {string} [options.eventType="UI_STATE_CHANGE"] - Event type
	 * @param {string} [options.actorId] - Actor ID override
	 * @returns {Promise<any>}
	 */
	updateState(path, value, options = {}) {
		return this.#runOrchestrated(
			"updateState",
			() => {
				const sanitizedPath = this.#sanitizeInput(path);
				const sanitizedValue = this.#sanitizeInput(value);
				const sanitizedOptions = this.#sanitizeInput(options);

				if (!sanitizedPath) {
					this.#emitWarning("Invalid path for state update", {
						path: sanitizedPath,
					});
					return Promise.resolve(undefined);
				}

				const setter = this.#stateManager?.set;
				if (typeof setter !== "function") {
					this.#emitWarning("State manager set method not available");
					return Promise.resolve(undefined);
				}

				const {
					eventType = "UI_STATE_CHANGE",
					actorId = this.#currentUser,
				} = sanitizedOptions;

				// Dispatch the update action for observability
				this.#dispatchAction("ui_bridge.state_update", {
					path: sanitizedPath,
					valueType: typeof sanitizedValue,
					eventType,
					actorId,
					source: "StateUIBridge.updateState",
				});

				return Promise.resolve()
					.then(() =>
						setter.call(
							this.#stateManager,
							sanitizedPath,
							sanitizedValue
						)
					)
					.then((result) => {
						this.#dispatchAction("ui_bridge.state_updated", {
							path: sanitizedPath,
							success: true,
							timestamp: DateCore.timestamp(),
						});
						return result;
					})
					.catch((error) => {
						this.#dispatchAction("ui_bridge.state_update_failed", {
							path: sanitizedPath,
							error: error.message,
							timestamp: DateCore.timestamp(),
						});
						throw error;
					});
			},
			{ timeout: 5000 }
		);
	}

	/**
	 * Gets bridge statistics and health metrics.
	 * @public
	 * @returns {object}
	 */
	getStats() {
		return {
			gridSubscriptions: this.#gridSubscriptions.size,
			domBridgeActive: !!this.#domBridgeUnsubscribe,
			bindEngineAttached: !!this.#bindEngine,
			managersAvailable: Object.keys(this.#managers).length,
			userContext: this.#currentUser,
			lastUpdate: DateCore.timestamp(),
		};
	}

	/**
	 * Performs comprehensive health check.
	 * @public
	 * @returns {{healthy: boolean, checks: object, timestamp: string}}
	 */
	healthCheck() {
		const checks = {
			stateManagerAvailable: !!this.#stateManager,
			orchestratorAvailable: !!this.#managers?.asyncOrchestrator,
			actionDispatcherAvailable: !!this.#managers?.actionDispatcher,
			sanitizerAvailable: !!this.#sanitizer,
			licenseValid:
				this.#managers?.license?.hasFeature("ui_bridge") || false,
			userContext: !!this.#currentUser,
		};

		const healthy = Object.values(checks).every((check) => check === true);

		const result = {
			healthy,
			checks,
			timestamp: DateCore.timestamp(),
			version: "3.0.0",
		};

		this.#dispatchAction("ui_bridge.health_check", {
			healthy,
			checksCount: Object.keys(checks).length,
			timestamp: DateCore.timestamp(),
		});

		return result;
	}

	/**
	 * Releases grid subscriptions and DOM bridge helpers.
	 * @public
	 * @returns {Promise<void>}
	 */
	dispose() {
		return this.#runOrchestrated("dispose", () => {
			// Disable DOM bridge
			this.disableDomBridge();

			// Cleanup grid subscriptions
			for (const cleanup of this.#gridSubscriptions) {
				try {
					cleanup();
				} catch (error) {
					this.#emitWarning("Grid subscription cleanup failed", {
						error: error.message,
					});
				}
			}
			this.#gridSubscriptions.clear();

			// Clear references
			this.#bindEngine = null;
			this.#loggedWarnings.clear();

			this.#dispatchAction("ui_bridge.disposed", {
				timestamp: DateCore.timestamp(),
				success: true,
			});

			return Promise.resolve();
		});
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PRIVATE EVENT HANDLERS
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Handles entity saved events.
	 * @private
	 * @param {object} grid - Grid instance
	 * @param {object} event - Event data
	 */
	#handleEntitySaved(grid, event) {
		const { store, item } = this.#sanitizeInput(event);
		if (store === "objects") {
			try {
				grid.refreshRow(item);
				this.#dispatchAction("ui_bridge.entity_saved_handled", {
					store,
					itemId: item?.id,
				});
			} catch (error) {
				this.#emitWarning("Failed to refresh grid row", {
					error: error.message,
					store,
					itemId: item?.id,
				});
			}
		}
	}

	/**
	 * Handles entity deleted events.
	 * @private
	 * @param {object} grid - Grid instance
	 * @param {object} event - Event data
	 */
	#handleEntityDeleted(grid, event) {
		const { store, id } = this.#sanitizeInput(event);
		if (store === "objects") {
			try {
				grid.removeRow(id);
				this.#dispatchAction("ui_bridge.entity_deleted_handled", {
					store,
					entityId: id,
				});
			} catch (error) {
				this.#emitWarning("Failed to remove grid row", {
					error: error.message,
					store,
					entityId: id,
				});
			}
		}
	}

	/**
	 * Handles sync completed events.
	 * @private
	 * @param {object} grid - Grid instance
	 * @param {object} event - Event data
	 */
	#handleSyncCompleted(grid, _event) {
		try {
			grid.refresh?.();
			this.#dispatchAction("ui_bridge.sync_completed_handled", {
				timestamp: DateCore.timestamp(),
			});
		} catch (error) {
			this.#emitWarning("Failed to refresh grid on sync completion", {
				error: error.message,
			});
		}
	}
}

export default StateUIBridge;
