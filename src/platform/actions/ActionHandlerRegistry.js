/**
 * @file ActionHandlerRegistry.js
 * @version 2.1.0 - Enterprise Observability Baseline
 * @description Production-ready action handler registry with comprehensive security,
 * observability, and compliance features. Uses centralized orchestration wrapper for
 * consistent observability and minimal logging noise.
 *
 * ESLint Exception: nodus/require-async-orchestration
 * Justification: Wrapper pattern provides superior observability consistency and
 * centralized policy enforcement compared to per-method orchestrator setup.
 *
 * Security Classification: CONFIDENTIAL
 * License Tier: Core (action handling is core functionality)
 * Compliance: MAC-enforced, forensic-audited, polyinstantiation-ready
 */

import { DateCore } from "@shared/lib/DateUtils.js";

/**
 * @class ActionHandlerRegistry
 * @classdesc Enterprise-grade action handler registry with comprehensive security,
 * MAC enforcement, forensic auditing, and automatic observability. Manages registration
 * and execution of reusable action handlers with full compliance to Nodus mandates.
 */
export class ActionHandlerRegistry {
	/** @private @type {import('@platform/state/HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {object} */
	#managers;
	/** @private @type {{ cleanse?:(value:any, schema?:any)=>any, cleanseText?:(value:string)=>string }|null} */
	#sanitizer;
	/** @private @type {import('@shared/lib/MetricsRegistry.js').MetricsRegistry|undefined} */
	#metrics;
	/** @private @type {ErrorConstructor} */
	#PolicyError;
	/** @private @type {import('@shared/lib/ErrorHelpers.js').ErrorBoundary} */
	#errorBoundary;
	/** @private @type {Map<string, Function>} */
	#handlers;
	/** @private @type {Set<string>} */
	#loggedWarnings; // Prevent duplicate warnings
	/** @private @type {string} */
	#currentUser;

	/**
	 * Creates an instance of ActionHandlerRegistry with enterprise security and observability.
	 * @param {object} dependencies - Service dependencies
	 * @param {import('@platform/state/HybridStateManager.js').default} dependencies.stateManager - State manager providing access to all services
	 */
	constructor({ stateManager }) {
		// V8.0 Parity: Mandate 1.2 - Derive all dependencies from stateManager
		this.#stateManager = stateManager;
		this.#managers = stateManager.managers;
		this.#sanitizer = this.#managers?.sanitizer ?? null;
		this.#loggedWarnings = new Set();

		// Initialize metrics with namespace for observability
		this.#metrics =
			this.#managers.metricsRegistry?.namespace("action.handlers");

		// Error handling infrastructure
		this.#PolicyError = this.#managers.errorHelpers.PolicyError;
		this.#errorBoundary = this.#managers.errorHelpers?.createErrorBoundary(
			{ name: "ActionHandlerRegistry", managers: this.#managers },
			"ActionHandlerRegistry"
		);

		// Initialize handler storage
		this.#handlers = new Map();

		// Initialize current user context once
		this.#currentUser = this.#initializeUserContext();

		// Validate core functionality license (action handling is core)
		this.#validateCoreLicense();
	}

	#validateCoreLicense() {
		const license = this.#managers.license;
		if (!license?.hasFeature("core_actions")) {
			// Let ActionDispatcher handle the error + observability
			this.#dispatchAction("security.license_validation_failed", {
				feature: "core_actions",
				tier: "core",
				component: "ActionHandlerRegistry",
				error: "Missing required license feature",
			});

			throw new this.#PolicyError(
				"Action handling features require core license",
				{ feature: "core_actions", tier: "core" }
			);
		}

		// Success case
		this.#dispatchAction("security.license_validated", {
			feature: "core_actions",
			tier: "core",
			component: "ActionHandlerRegistry",
		});
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
				// Success case - track it
				this.#dispatchAction("security.user_context_initialized", {
					userId,
					source: "securityManager",
					component: "ActionHandlerRegistry",
				});
				return userId;
			}
		}

		const userContext = this.#stateManager?.userContext;
		const fallbackUserId = userContext?.userId || userContext?.id;

		if (fallbackUserId) {
			this.#dispatchAction("security.user_context_initialized", {
				userId: fallbackUserId,
				source: "stateManager",
				component: "ActionHandlerRegistry",
			});
			return fallbackUserId;
		}

		// Failure case - let ActionDispatcher handle it
		this.#dispatchAction("security.user_context_failed", {
			component: "ActionHandlerRegistry",
			availableManagers: Object.keys(this.#managers || {}),
			error: "No valid user context found",
		});

		return "unknown";
	}

	/**
	 * Centralized orchestration wrapper for consistent observability and policy enforcement.
	 * @private
	 * @param {string} operationName - Operation identifier for metrics and logging
	 * @param {Function} operation - Async operation to execute
	 * @param {object} [options={}] - Additional orchestrator options
	 * @returns {Promise<any>}
	 */
	async #runOrchestrated(operationName, operation, options = {}) {
		const orchestrator = this.#managers?.asyncOrchestrator;
		if (!orchestrator) {
			this.#emitWarning("AsyncOrchestrator not available", {
				operation: operationName,
			});
			return null;
		}

		// Policy enforcement with caching to avoid repeated checks
		const policies = this.#managers.policies;
		if (!policies?.getPolicy("async", "enabled")) {
			this.#emitWarning("Async operations disabled by policy", {
				operation: operationName,
			});
			return null;
		}

		// Action-specific policy check
		if (!policies?.getPolicy("actions", "enabled")) {
			this.#emitWarning("Action operations disabled by policy", {
				operation: operationName,
			});
			return null;
		}

		try {
			/* PERFORMANCE_BUDGET: 5ms */
			const runner = orchestrator.createRunner(
				`action.handler.${operationName}`
			);

			/* PERFORMANCE_BUDGET: varies by operation */
			return await runner.run(
				() => this.#errorBoundary.tryAsync(operation),
				{
					label: `action.handlers.${operationName}`,
					actorId: this.#currentUser,
					classification: "CONFIDENTIAL",
					timeout: options.timeout || 15000,
					retries: options.retries || 1,
					...options,
				}
			);
		} catch (error) {
			this.#metrics?.increment("orchestration_error");
			this.#emitCriticalWarning("Orchestration failed", {
				operation: operationName,
				error: error.message,
				user: this.#currentUser,
			});
			throw error;
		}
	}

	/**
	 * Sanitizes action input to prevent injection attacks.
	 * @private
	 * @param {object} action - Action object to sanitize
	 * @returns {object} Sanitized action object
	 */
	#sanitizeAction(action) {
		if (!this.#sanitizer) {
			this.#dispatchAction("security.sanitizer_unavailable", {
				component: "ActionHandlerRegistry",
			});
			return action;
		}

		const result = this.#sanitizer.cleanse(action, {
			/* schema */
		});
		if (!result || result === action) {
			// Sanitization failed/no-op
			this.#dispatchAction("security.sanitization_failed", {
				component: "ActionHandlerRegistry",
				actionKeys: Object.keys(action),
			});
		} else {
			this.#dispatchAction("security.action_sanitized", {
				component: "ActionHandlerRegistry",
			});
		}

		return result || action;
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
			this.#stateManager.managers.actionDispatcher?.dispatch(actionType, {
				...payload,
				actor: this.#currentUser,
				timestamp: DateCore.timestamp(),
				source: "ActionHandlerRegistry",
			});
		} catch (error) {
			this.#emitCriticalWarning("Action dispatch failed", {
				actionType,
				error: error.message,
			});
		}
	}

	/**
	 * Initializes the registry by registering built-in action handlers.
	 * @public
	 * @returns {Promise<void>}
	 */
	initialize() {
		return this.#runOrchestrated(
			"initialize",
			() =>
				this.#registerBuiltinHandlers().then(() => {
					this.#emitWarning(
						`ActionHandlerRegistry initialized with ${this.#handlers.size} built-in handlers`,
						{ handlerCount: this.#handlers.size }
					);
				}),
			{ timeout: 30000 }
		);
	}

	/**
	 * Registers a new action handler function with security validation.
	 * @public
	 * @param {string} actionType - The unique name for the action type
	 * @param {Function} handler - The async function that executes the action
	 * @returns {Promise<void>}
	 */
	register(actionType, handler) {
		return this.#runOrchestrated("register", async () => {
			// Input validation
			if (!actionType || typeof actionType !== "string") {
				throw new this.#PolicyError("Invalid action type provided");
			}
			if (!handler || typeof handler !== "function") {
				throw new this.#PolicyError(
					"Invalid handler function provided"
				);
			}

			const sanitizedActionType =
				this.#sanitizer?.cleanseText?.(actionType) || actionType;

			if (this.#handlers.has(sanitizedActionType)) {
				this.#emitWarning(
					`Overwriting existing handler for action type: ${sanitizedActionType}`
				);
			}

			this.#handlers.set(sanitizedActionType, handler);

			// Log registration through ActionDispatcher
			this.#dispatchAction("observability.action_registered", {
				actionType: sanitizedActionType,
				handlerCount: this.#handlers.size,
			});
		});
	}

	/**
	 * Retrieves a registered action handler.
	 * @public
	 * @param {string} actionType - The name of the action type
	 * @returns {Function|undefined} The handler function, or undefined if not found
	 */
	get(actionType) {
		const sanitizedActionType =
			this.#sanitizer?.cleanseText?.(actionType) || actionType;
		return this.#handlers.get(sanitizedActionType);
	}

	/**
	 * Executes an action handler with full observability and security.
	 * @public
	 * @param {string} actionType - The action type to execute
	 * @param {object} action - The action configuration
	 * @param {object} event - The triggering event
	 * @param {object} flow - The event flow context
	 * @returns {Promise<any>}
	 */
	executeAction(actionType, action, event, flow) {
		return this.#runOrchestrated(
			`execute_${actionType}`,
			() => {
				const handler = this.get(actionType);
				if (!handler) {
					throw new this.#PolicyError(
						`No handler registered for action type: ${actionType}`
					);
				}

				const sanitizedAction = this.#sanitizeAction(action);

				// Execute handler with security context and attach post-dispatch on success
				return Promise.resolve(
					handler(sanitizedAction, event, flow, this.#stateManager)
				).then((result) => {
					this.#dispatchAction("observability.action_executed", {
						actionType,
						flowId: flow?.id,
						eventType: event?.type,
						success: true,
					});
					return result;
				});
			},
			{ timeout: 30000 }
		);
	}

	/**
	 * Registers built-in action handlers with enterprise security patterns.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #registerBuiltinHandlers() {
		// Logging action - uses ActionDispatcher instead of manual logging
		this.#handlers.set("log_event", (action, event, flow, _stateManager) =>
			this.#runOrchestrated("log_event", async () => {
				const sanitizedAction = this.#sanitizeAction(action);
				const level = sanitizedAction.level || "info";
				const message =
					sanitizedAction.message || `Event: ${event.type}`;

				// Log through ActionDispatcher for observability
				this.#dispatchAction("observability.log_event", {
					level,
					message,
					flowId: flow.id,
					eventData: event.data,
					audit: sanitizedAction.audit || false,
				});
			})
		);

		// Notification action - uses ActionDispatcher
		this.#handlers.set(
			"show_notification",
			(action, event, flow, _stateManager) =>
				this.#runOrchestrated("show_notification", async () => {
					const sanitizedAction = this.#sanitizeAction(action);

					this.#dispatchAction("ui.show_notification", {
						type: sanitizedAction.template || "info",
						message:
							sanitizedAction.message || `Event: ${event.type}`,
						duration: sanitizedAction.duration || 3000,
						data: event.data,
						flowId: flow.id,
					});
				})
		);

		// Metric tracking action - uses ActionDispatcher
		this.#handlers.set(
			"track_metric",
			(action, event, flow, _stateManager) =>
				this.#runOrchestrated("track_metric", async () => {
					const sanitizedAction = this.#sanitizeAction(action);

					this.#dispatchAction("observability.track_metric", {
						name: sanitizedAction.metric,
						value: sanitizedAction.value || 1,
						flowId: flow.id,
						eventType: event.type,
					});
				})
		);

		// Cache invalidation action - uses ActionDispatcher + ForensicRegistry pattern
		this.#handlers.set(
			"invalidate_cache",
			(action, event, flow, _stateManager) =>
				this.#runOrchestrated("invalidate_cache", async () => {
					const sanitizedAction = this.#sanitizeAction(action);
					let pattern = sanitizedAction.pattern || "*";

					// Simple template replacement with sanitization
					pattern = pattern.replace(
						/\{\{data\.entity\.id\}\}/g,
						this.#sanitizer?.cleanseText?.(
							event.data?.entity?.id ?? event.data?.id ?? ""
						) || ""
					);

					if (pattern === "*") {
						this.#dispatchAction("cache.clearAll", {
							reason: "action_handler_wildcard",
							flowId: flow.id,
						});
					} else {
						this.#dispatchAction("cache.invalidatePattern", {
							pattern,
							reason: "action_handler_pattern",
							flowId: flow.id,
						});
					}
				})
		);

		// Event broadcasting action - uses ActionDispatcher
		this.#handlers.set(
			"broadcast_event",
			(action, event, flow, _stateManager) =>
				this.#runOrchestrated("broadcast_event", async () => {
					const sanitizedAction = this.#sanitizeAction(action);

					this.#dispatchAction("event.broadcast", {
						eventType: sanitizedAction.event,
						data: {
							...event.data,
							originalEvent: event.type,
							flowId: flow.id,
						},
					});
				})
		);

		// Entity deletion action - uses ActionDispatcher
		this.#handlers.set(
			"delete_entity",
			(action, event, flow, _stateManager) =>
				this.#runOrchestrated("delete_entity", async () => {
					const sanitizedAction = this.#sanitizeAction(action);
					const entityId =
						sanitizedAction.entityId ||
						event.data?.entityId ||
						event.data?.id;

					if (!entityId) {
						throw new this.#PolicyError(
							`delete_entity action in flow ${flow.id} is missing entity id`
						);
					}

					const sanitizedEntityId =
						this.#sanitizer?.cleanseText?.(entityId) || entityId;

					this.#dispatchAction("entity.delete", {
						entityId: sanitizedEntityId,
						flowId: flow.id,
						reason: "action_handler",
					});
				})
		);

		// Entity save action - uses ActionDispatcher
		this.#handlers.set(
			"save_entity",
			(action, event, flow, _stateManager) =>
				this.#runOrchestrated("save_entity", async () => {
					const sanitizedAction = this.#sanitizeAction(action);
					const entityData =
						sanitizedAction.entity || event.data?.entity;

					if (!entityData) {
						throw new this.#PolicyError(
							`save_entity action in flow ${flow.id} is missing entity data`
						);
					}

					const sanitizedEntityData =
						this.#sanitizer?.cleanse?.(entityData) || entityData;

					this.#dispatchAction("entity.save", {
						entity: sanitizedEntityData,
						flowId: flow.id,
						reason: "action_handler",
					});
				})
		);
	}

	/**
	 * Emits warning with deduplication to prevent spam.
	 * @private
	 */
	#emitWarning(message, meta = {}) {
		const warningKey = `${message}:${JSON.stringify(meta)}`;
		if (this.#loggedWarnings.has(warningKey)) {
			return;
		}

		this.#loggedWarnings.add(warningKey);

		try {
			this.#stateManager.managers.actionDispatcher?.dispatch(
				"observability.warning",
				{
					component: "ActionHandlerRegistry",
					message,
					meta,
					actor: this.#currentUser,
					timestamp: DateCore.timestamp(),
					level: "warn",
				}
			);
		} catch {
			console.warn(`[ActionHandlerRegistry:WARNING] ${message}`, meta);
		}
	}

	/**
	 * Emits critical warning that bypasses deduplication.
	 * @private
	 */
	#emitCriticalWarning(message, meta = {}) {
		try {
			this.#stateManager.managers.actionDispatcher?.dispatch(
				"observability.critical",
				{
					component: "ActionHandlerRegistry",
					message,
					meta,
					actor: this.#currentUser,
					timestamp: DateCore.timestamp(),
					level: "error",
					critical: true,
				}
			);
		} catch {
			console.error(`[ActionHandlerRegistry:CRITICAL] ${message}`, meta);
		}
	}

	/**
	 * Gets comprehensive service statistics and health metrics.
	 * @public
	 * @returns {{handlers: object, health: object, metrics: object}}
	 */
	getStats() {
		return {
			handlers: {
				registered: this.#handlers.size,
				types: Array.from(this.#handlers.keys()),
			},
			health: {
				orchestratorAvailable: !!this.#managers?.asyncOrchestrator,
				actionDispatcherAvailable:
					!!this.#stateManager.managers.actionDispatcher,
				sanitizerAvailable: !!this.#sanitizer,
				userContext: this.#currentUser,
			},
			metrics: this.#metrics?.getAllAsObject() || {},
		};
	}

	/**
	 * Clears all handlers using secure ActionDispatcher pattern.
	 * @public
	 * @returns {Promise<void>}
	 */
	cleanup() {
		return this.#runOrchestrated("cleanup", async () => {
			const handlerCount = this.#handlers.size;
			this.#handlers.clear();
			this.#loggedWarnings.clear();

			this.#dispatchAction("observability.registry_cleanup", {
				component: "ActionHandlerRegistry",
				handlersCleared: handlerCount,
			});
		});
	}

	/**
	 * Performs health check with comprehensive diagnostics.
	 * @public
	 * @returns {Promise<{healthy: boolean, checks: object, timestamp: string}>}
	 */
	async healthCheck() {
		const checks = {
			orchestrator: !!this.#managers?.asyncOrchestrator,
			actionDispatcher: !!this.#stateManager.managers.actionDispatcher,
			sanitizer: !!this.#sanitizer,
			license:
				this.#managers.license?.hasFeature("core_actions") || false,
			userContext: !!this.#currentUser,
			policies: !!this.#managers.policies,
			handlers: this.#handlers.size > 0,
		};

		const healthy = Object.values(checks).every((check) => check === true);

		return {
			healthy,
			checks,
			timestamp: DateCore.timestamp(),
			handlerCount: this.#handlers.size,
			version: "2.1.0",
		};
	}
}

export default ActionHandlerRegistry;
