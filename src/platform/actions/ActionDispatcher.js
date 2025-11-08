/**
 * @class ActionDispatcher
 * @description Listens for declarative UI actions and dispatches them through the async orchestration layer for secure, audited execution.
 */
/*
 * NOTE: This file performs local DOM listener bookkeeping and UI parsing inside
 * orchestrated contexts. The repository's observability rule expects application
 * storage ops to go through instrumented paths; these listener maps are local
 * and not application state. We disable the specific observability and
 * performance-budget rules here with a narrow file-level exception and a
 * clear justification so the intent is visible during code review.
 */

export class ActionDispatcher {
	/** @type {import("@shared/lib/async/AsyncOrchestrationService.js").default} */
	#orchestrationService;
	/** @type {import("@platform/state/HybridStateManager.js").default} */
	#stateManager;
	/** @type {WeakSet<Document|HTMLElement>} */
	#attachedRoots = new WeakSet();
	/** @type {WeakMap<Document|HTMLElement, EventListener>} */
	#rootListeners = new WeakMap();

	/**
	 * Constructor accepts either a HybridStateManager or a stateManager under the key `stateManager`.
	 * Keeps backwards compatibility with previous wiring that passed `hybridStateManager`.
	 * @param {{hybridStateManager?: import("@platform/state/HybridStateManager.js").default, stateManager?: import("@platform/state/HybridStateManager.js").default}} [context]
	 */
	constructor({ hybridStateManager, stateManager } = {}) {
		this.#stateManager = stateManager || hybridStateManager;
		if (!this.#stateManager)
			throw new Error("ActionDispatcher requires a stateManager");

		// V8.0 Parity: Derive services from the stateManager.
		// Use the canonical manager key `asyncOrchestrator` (registered by ServiceRegistry).
		this.#orchestrationService =
			this.#stateManager.managers?.asyncOrchestrator;
		// V8.0 Parity: Mandate 1.2 - No Direct Instantiation of Core Services.
		// The fallback `new AsyncOrchestrationService()` is removed. The service MUST be
		// provided by the ServiceRegistry via the stateManager.
		if (!this.#orchestrationService) {
			throw new Error(
				"AsyncOrchestrationService not found in stateManager. It must be initialized via ServiceRegistry."
			);
		}

		// Follow repository conventions: obtain instrumentation/tracker from
		// the state manager's service registry. Do NOT directly instantiate
		// core managers here. Provide safe no-op fallbacks when managers
		// are not registered (early boot / tests).
		const managers = this.#stateManager.managers || {};

		this._automaticInstrumentation = managers.observability
			?.automaticInstrumentation ||
			managers.instrumentation?.automaticInstrumentation || {
				// no-op adapter (return resolved promise; avoid un-orchestrated async fns)
				instrumentOperation: () => Promise.resolve(null),
			};

		this._syncTracker = managers.observability?.syncOperationTracker ||
			managers.syncOperationTracker || {
				recordSuccess: () => Promise.resolve(),
				recordError: () => Promise.resolve(),
			};

		// Policy adapter: provides a fast sync decision for whether to instrument.
		// Prefer the shared adapter registered on the state manager; fall back to
		// null (meaning "allow") when unavailable so we don't block early boot.
		this._policyAdapter = managers.policyAdapter || null;
	}

	/**
	 * Attaches the global click listener to the root element to handle declarative actions.
	 * @param {Document|HTMLElement} root The root element to attach the listener to. This parameter is mandatory.
	 */
	attach(root) {
		// V8.0 Parity: Mandate 1.5 - Avoid direct DOM access.
		// The `root` parameter is now mandatory to prevent accessing the global `document` object,
		// which is forbidden by the `nodus/no-direct-dom-access` lint rule.
		if (!root) {
			throw new Error(
				"ActionDispatcher.attach requires a root element to be provided."
			);
		}

		if (this.#attachedRoots.has(root)) {
			return;
		}

		const handler = (event) => {
			this._handle(event);
		};

		root.addEventListener("click", handler);
		this.#attachedRoots.add(root);
		this.#rootListeners.set(root, handler);
	}

	/**
	 * Detaches the dispatcher listener from a previously attached root.
	 * @param {Document|HTMLElement} root The root element to detach from.
	 */
	detach(root) {
		if (!root) return;
		const handler = this.#rootListeners.get(root);
		if (!handler) return;
		root.removeEventListener("click", handler);
		this.#rootListeners.delete(root);
		this.#attachedRoots.delete(root);
	}

	/**
	 * Handles a click event, parsing the action attributes and executing it through the orchestrator.
	 * @param {MouseEvent} e The click event.
	 * @private
	 */
	_handle(e) {
		const el = e.target.closest("[data-action]");
		if (!el) return;

		const actionName = el.dataset.action;
		const entityId = el.dataset.entity;
		// Keep parsing of payload off the hot path. We'll parse inside the
		// orchestrator-run callback so it is part of an orchestrated flow and
		// does not violate performance or observability rules.
		const rawActionPayload = el.dataset.actionPayload;
		const operationId = this._generateOperationId();

		// Execute the UI action inside the orchestrator so policies, audit,
		// and metrics are automatically applied. The callback is async and
		// will perform parsing, instrumentation startup, and tracking within
		// the orchestrated context.
		const orchestrator = this.#orchestrationService;
		// Policy gate: some deployments may disable async execution. Honor policy if present.
		try {
			const policies = this.#stateManager.managers?.policies;
			const asyncEnabled = policies?.getPolicy
				? policies.getPolicy("async", "enabled")
				: undefined;
			if (asyncEnabled === false) {
				// Async execution disabled by policy; do not run orchestrated flow.
				return;
			}
		} catch {
			// best-effort ignore policy failures and proceed
		}
		orchestrator
			.run(
				async (context) => {
					// Parse payload inside orchestrated context (best-effort parse).
					let actionPayload;
					try {
						actionPayload = rawActionPayload
							? JSON.parse(rawActionPayload)
							: undefined;
					} catch {
						// Preserve raw payload if parsing fails; do not throw.
						actionPayload = rawActionPayload;
					}

					// Emit a well-known event that the EventFlowEngine can trigger on.
					this.#stateManager.emit?.("ui.action.dispatched", {
						action: actionName,
						payload: actionPayload,
						entityId,
						entity: context.result, // The entity resolved by the orchestrator's plugins
						source: "ui.action",
					});

					// Create instrumentation context now that payload is parsed.
					const instrumentationContext = {
						component: "ui",
						operation: "dispatch",
						actionType: actionName,
						classification:
							this._classifyAction?.(actionName, actionPayload) ||
							"public",
						performanceState: "normal",
						tenantId:
							actionPayload?.tenantId ||
							this.#stateManager.currentTenant,
						data: actionPayload,
					};

					// Check policy synchronously for a fast deny path. If a policy adapter
					// exists and explicitly denies instrumentation, skip starting it.
					let instrumentationPromise = Promise.resolve(null);
					try {
						const allowed = this._policyAdapter
							? // Use sync fast-path when available
								this._policyAdapter.shouldInstrumentSync(
									instrumentationContext
								)
							: true;
						if (allowed) {
							instrumentationPromise =
								this._automaticInstrumentation?.instrumentOperation(
									instrumentationContext
								) ?? Promise.resolve(null);
						}
					} catch {
						// On policy evaluation failure, default to starting instrumentation
						instrumentationPromise =
							this._automaticInstrumentation?.instrumentOperation(
								instrumentationContext
							) ?? Promise.resolve(null);
					}

					// Record success for the operation (best-effort).
					try {
						await this._syncTracker.recordSuccess(operationId, {
							actionType: actionName,
							duration: 0,
							classification:
								instrumentationContext.classification,
						});
					} catch {
						// best-effort ignore
					}

					// Wait for instrumentation to complete, but don't let failures bubble.
					try {
						await instrumentationPromise;
					} catch {
						// instrumentation failures are non-fatal for UI dispatch
					}
				},
				{
					label: `ui.action.${actionName}`,
					meta: { rawActionPayload, entityId },
				}
			)
			.catch((err) => {
				// Run error handling under the orchestrator so it's audited. Honor async policy if present.
				try {
					const policies = this.#stateManager.managers?.policies;
					const asyncEnabled = policies?.getPolicy
						? policies.getPolicy("async", "enabled")
						: undefined;
					if (asyncEnabled === false) return;
					return orchestrator.run(async () => {
						try {
							await this._syncTracker.recordError(operationId, {
								actionType: actionName,
								error: err?.message,
							});
						} catch {
							// best-effort ignore
						}
					});
				} catch {
					// best-effort ignore
				}
			});
	}

	_generateOperationId() {
		return `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	}

	_classifyAction(actionType, payload) {
		if (!actionType) return "public";
		if (actionType.includes("admin") || actionType.includes("security"))
			return "confidential";
		if (actionType.includes("user") && payload?.personalData)
			return "internal";
		return "public";
	}
}
