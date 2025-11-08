// BindEngine_v2.js
// Lightweight reactive binding engine with security, forensic, and metrics integration
// Vanilla ESM. No frameworks. Safe rendering only.

import { constantTimeCheck } from "../../platform/security/ct.js";

/**
 * @file BindEngine_v2.js
 * @version 2.0.0
 * @summary Reactive UI binder for HybridStateManager with MAC, ForensicLogger, and Metrics hooks.
 * @mandates
 *  - copilotGuard/require-jsdoc-and-tests
 *  - copilotGuard/require-forensic-envelope
 *  - copilotGuard/no-insecure-api
 * @remarks
 *  - Never uses innerHTML/outerHTML. Only textContent/attributes/properties.
 *  - All DOM mutations are wrapped in forensic envelopes.
 *  - Access decisions use constant-time padding to mitigate timing channels.
 */

/**
 * @typedef {Object} BindEngineDeps
 * @property {import('../state/HybridStateManager.js').default} stateManager
 * @property {import('../../core/security/SecurityManager.js').default} [securityManager]
 * @property {import('../../core/security/ForensicLogger.js').ForensicLogger} forensicLogger
 * @property {import('../../utils/MetricsRegistry.js').MetricsRegistry} [metrics]
 * @property {any} [securityExplainer]
 * @property {import('../../core/ai/EmbeddingManager.js').default} [embeddingManager]
 * @property {{ on:(evt:string,cb:(data:any)=>void)=>void, off?:(evt:string,cb:(data:any)=>void)=>void }} [eventBus]
 */

/**
 * @typedef {Object} BindingOptions
 * @property {string} [format] A named formatter (from stateManager or registry) to apply before render.
 * @property {boolean} [twoWay] Enable input->state synchronization.
 * @property {string} [attr] If set, bind to this attribute instead of textContent.
 * @property {(value:any)=>any} [map] Optional mapping fn prior to render.
 * @property {string} [fallback] Text to show when access denied or value absent.
 */

/**
 * Lightweight, auditable, security-aware binding layer.
 *
 * Public methods:
 * - start(root) : Promise<void> — scan and begin reacting to state changes
 * - stop() : void — unregister bindings and stop listening
 * - bindAll(root) : Promise<void> — find and register elements with `data-bind`
 * - registerBinding(el,path,opts) : Promise<void> — register a specific element binding
 * - unregisterBinding(el) : void — remove a binding
 *
 * Inputs (via constructor deps): see {@link BindEngineDeps}
 *
 * @example
 * const engine = new BindEngine({ stateManager, forensicLogger, securityManager });
 * await engine.start(document);
 *
 * @export
 * @class BindEngine
 */
export default class BindEngine {
	/**
	 * Dependencies for the BindEngine.
	 * @type {BindEngineDeps}
	 * @private
	 */
	#deps;
	/**
	 * A map of all active bindings, with the element as the key.
	 * @type {Map<Element, {path:string, opts:BindingOptions, unsub?:()=>void}>}
	 * @private
	 */
	#bindings = new Map();
	/**
	 * Tracks if the engine has been started.
	 * @type {boolean}
	 * @private
	 */
	#started = false;
	/**
	 * Holds unsubscribe callbacks for coarse-grained state change listeners.
	 * @type {Array<() => void>}
	 * @private
	 */
	#stateUnsubscribes = [];
	/**
	 * Cached sanitizer reference resolved from the state manager.
	 * @type {{ cleanse?:(value:any, schema?:any)=>any, cleanseText?:(value:string)=>string }|null}
	 * @private
	 */
	#sanitizer = null;

	/**
	 * Creates an instance of BindEngine.
	 *
	 * @constructor
	 * @function
	 * @memberof BindEngine
	 * @param {BindEngineDeps} deps Dependencies required by the engine (see {@link BindEngineDeps}).
	 */

	constructor(deps) {
		if (!deps?.stateManager) {
			throw new Error("BindEngine requires stateManager");
		}

		// V8.0 Parity: Mandate 1.2 - Derive all dependencies from the stateManager.
		const sm = deps.stateManager;
		this.#deps = {
			stateManager: sm,
			forensicLogger: sm.managers.forensicLogger,
			metrics: sm.metricsRegistry?.namespace("bindEngine"),
			securityManager: sm.managers.securityManager,
			securityExplainer: sm.managers.securityExplainer,
			embeddingManager: sm.managers.embeddingManager,
			eventBus: sm.managers.eventBus,
			...deps, // Allow explicit overrides for testing
		};

		this.#sanitizer = this.#getSanitizer();
	}

	/**
	 * Initializes the engine, scans for bindings, and listens for state changes.
	 *
	 * @public
	 * @async
	 * @function start
	 * @memberof BindEngine
	 * @param {Document|ParentNode} [root=document] Root to scan for bindings
	 * @returns {Promise<void>}
	 */

	async start(root = document) {
		const orchestrator =
			this.#deps.stateManager?.managers?.asyncOrchestrator;
		if (orchestrator) {
			await orchestrator.run(
				async () => {
					if (this.#started) return;
					this.#started = true;

					// Reactivity: listen to state changes
					const events = [
						"stateChanged",
						"state:changed",
						"stateChange",
					];
					for (const evtName of events) {
						const maybeUnsub = this.#deps.stateManager.on?.(
							evtName,
							(evt) => {
								try {
									this.#onStateChanged(evt);
								} catch {
									/* swallow to avoid UI lock */
								}
							}
						);
						if (typeof maybeUnsub === "function") {
							this.#stateUnsubscribes.push(maybeUnsub);
						}
					}

					// Initial scan
					await this.bindAll(root);

					// If a StateUIBridge exists on the state manager, attach this BindEngine
					// so the bridge can delegate coarse-grained updates to us.
					try {
						this.#deps.stateManager?.managers?.stateUIBridge?.attachBindEngine?.(
							this
						);
					} catch {
						// best-effort
						void 0;
					}
				},
				{
					label: "BindEngine.start",
					eventType: "BIND_ENGINE_START",
					actorId: "system.bindEngine",
					meta: { root: root.nodeName },
				}
			);
		} else {
			// Fallback if no orchestrator is available (e.g., during early bootstrap or testing)
			if (this.#started) return;
			this.#started = true;

			const events = ["stateChanged", "state:changed", "stateChange"];
			for (const evtName of events) {
				const maybeUnsub = this.#deps.stateManager.on?.(
					evtName,
					(evt) => {
						try {
							this.#onStateChanged(evt);
						} catch {
							/* swallow to avoid UI lock */
						}
					}
				);
				if (typeof maybeUnsub === "function") {
					this.#stateUnsubscribes.push(maybeUnsub);
				}
			}

			await this.bindAll(root);

			try {
				this.#deps.stateManager?.managers?.stateUIBridge?.attachBindEngine?.(
					this
				);
			} catch {
				void 0;
			}
		}
	}

	/**
	 * Stops the engine, unregisters all bindings, and cleans up listeners.
	 *
	 * @public
	 * @function stop
	 * @memberof BindEngine
	 * @returns {void}
	 */
	stop() {
		for (const unsub of this.#stateUnsubscribes) {
			try {
				unsub();
			} catch {
				/* noop */
			}
		}
		this.#stateUnsubscribes.length = 0;
		for (const [el, meta] of this.#bindings) {
			meta.unsub?.();
			this.#bindings.delete(el);
		}
		this.#started = false;
	}

	/**
	 * Scans a DOM tree for elements with `data-bind` attributes and registers them.
	 *
	 * @public
	 * @async
	 * @function bindAll
	 * @memberof BindEngine
	 * @param {Document|ParentNode} [root=document]
	 * @returns {Promise<void>}
	 */
	async bindAll(root = document) {
		const orchestrator =
			this.#deps.stateManager?.managers?.asyncOrchestrator;
		if (orchestrator) {
			await orchestrator.run(
				async () => {
					const list = root.querySelectorAll?.("[data-bind]") ?? [];
					for (const el of list) {
						const path = el.getAttribute("data-bind");
						if (!path) continue;
						/** @type {BindingOptions} */
						const opts = {
							format:
								el.getAttribute("data-bind-format") ||
								undefined,
							twoWay:
								el.getAttribute("data-bind-two-way") === "true",
							attr:
								el.getAttribute("data-bind-attr") || undefined,
							fallback:
								el.getAttribute("data-bind-fallback") || "",
						};
						await this.registerBinding(el, path, opts);
					}
				},
				{
					label: "BindEngine.bindAll",
					eventType: "BIND_ENGINE_BIND_ALL",
					actorId: "system.bindEngine",
					meta: { root: root.nodeName },
				}
			);
		} else {
			const list = root.querySelectorAll?.("[data-bind]") ?? [];
			for (const el of list) {
				const path = el.getAttribute("data-bind");
				if (!path) continue;
				/** @type {BindingOptions} */
				const opts = {
					format: el.getAttribute("data-bind-format") || undefined,
					twoWay: el.getAttribute("data-bind-two-way") === "true",
					attr: el.getAttribute("data-bind-attr") || undefined,
					fallback: el.getAttribute("data-bind-fallback") || "",
				};
				await this.registerBinding(el, path, opts);
			}
		}
	}

	/**
	 * Registers and renders a single element binding.
	 *
	 * @public
	 * @async
	 * @function registerBinding
	 * @memberof BindEngine
	 * @param {Element} el The DOM element to bind
	 * @param {string} path dot.notation path in clientState
	 * @param {BindingOptions} [opts] Binding options
	 * @returns {Promise<void>}
	 */
	async registerBinding(el, path, opts = {}) {
		await this.#run(
			async (errorHelpers) => {
				// Unregister any existing
				this.unregisterBinding(el);

				// Support simple "query:" bindings that use QueryService for complex queries
				if (typeof path === "string" && path.startsWith("query:")) {
					const q = path.slice(6);
					const qs = this.#deps.stateManager?.managers?.queryService;
					if (qs && typeof qs.search === "function") {
						const results = await errorHelpers.tryOr(
							() => qs.search(q, { limit: 5 }),
							null,
							{
								component: "BindEngine",
								operation: "queryService.search",
								path,
								query: q,
							}
						);
						if (results) {
							const payload = results?.[0] ?? {
								count: results?.length ?? 0,
							};
							await this.#safeRender(el, path, payload, opts);
						} else {
							// fallback to empty
							await this.#safeRender(el, path, null, opts);
						}
						// No subscription for query-based bindings by default
						this.#bindings.set(el, {
							path,
							opts,
							unsub: undefined,
						});
						return;
					}
				}

				// Subscribe to fine-grained path updates if supported
				const unsub = this.#deps.stateManager.subscribe
					? this.#deps.stateManager.subscribe(path, (value) =>
							this.#safeRender(el, path, value, opts)
						)
					: undefined;

				this.#bindings.set(el, { path, opts, unsub });

				// Initial render
				const current = this.#deps.stateManager.get?.(path);
				await this.#safeRender(el, path, current, opts);

				// Two-way
				if (opts.twoWay) {
					this.#wireTwoWay(el, path, opts);
				}
			},
			{
				label: "BindEngine.registerBinding",
				eventType: "BIND_ENGINE_REGISTER",
				meta: { path, element: el.tagName },
			}
		);
	}

	/**
	 * Removes a binding for a given element and cleans up its listeners.
	 *
	 * @public
	 * @function unregisterBinding
	 * @memberof BindEngine
	 * @param {Element} el The element to remove binding for
	 * @returns {void}
	 */
	unregisterBinding(el) {
		const meta = this.#bindings.get(el);
		if (!meta) return;
		meta.unsub?.();
		this.#bindings.delete(el);
	}

	/**
	 * Updates all registered elements bound to the provided path.
	 * Used by StateUIBridge as a lightweight fallback when the state manager
	 * emits coarse-grained change events.
	 *
	 * @public
	 * @async
	 * @function updateBinding
	 * @memberof BindEngine
	 * @param {string} path - Dot-notation path tracked by the binding.
	 * @param {any} value - Optional value override; when omitted the current state value is used.
	 * @returns {Promise<void>}
	 */
	// eslint-disable-next-line copilotGuard/require-forensic-envelope
	updateBinding(path, value) {
		if (!path) return;

		// Orchestrate the coarse-grained event, but do not hold forensic
		// envelopes across async work — schedule per-element renders and
		// let each `#safeRender` handle its own orchestration and DOM
		// mutation envelopes.
		return this.#run(
			() => {
				for (const [el, meta] of this.#bindings) {
					if (meta.path !== path) continue;
					const nextVal =
						value !== undefined
							? value
							: this.#deps.stateManager.get?.(path);
					// Fire-and-forget safe renders; each call is best-effort.
					this.#safeRender(el, path, nextVal, meta.opts).catch(
						() => {}
					);
				}
			},
			{
				label: "BindEngine.updateBinding",
				eventType: "BIND_ENGINE_UPDATE",
				meta: { path },
			}
		);
	}

	/**
	 * Wraps an operation in a forensic logging envelope that captures classification metadata.
	 *
	 * @template T
	 * @private
	 * @param {string} type Envelope event type.
	 * @param {Record<string, any>} payload Additional envelope payload metadata.
	 * @param {() => Promise<T>|T} operation Operation to execute while the envelope is active.
	 * @returns {Promise<T>} Resolves with the operation result.
	 */
	// Forensic envelopes are intentionally handled at the point of synchronous
	// DOM mutation via `#mutate`. Avoid wrapping long-running async operations
	// with forensic envelopes to prevent holding envelopes open across awaits.

	// ---------------------------------------------------------------------------
	// Internal: Rendering & Security
	// ---------------------------------------------------------------------------

	/**
	 * Handles global `stateChanged` events as a coarse-grained fallback if fine-grained subscriptions are not available.
	 *
	 * @private
	 * @param {{changedPaths?: string[], patches?: any[]}} evt Event payload from StateManager
	 * @returns {void}
	 */
	#onStateChanged(evt) {
		const changed = new Set(evt?.changedPaths || []);
		for (const [el, { path, opts }] of this.#bindings) {
			if (changed.size === 0 || changed.has(path)) {
				const v = this.#deps.stateManager.get?.(path);
				this.#safeRender(el, path, v, opts);
			}
		}
	}

	/**
	 * Renders a value to an element after performing security checks, formatting, and forensic logging.
	 *
	 * @private
	 * @param {Element} el Target element
	 * @param {string} path State path
	 * @param {any} value Value to render
	 * @param {BindingOptions} opts Rendering options
	 * @returns {Promise<void>}
	 */
	async #safeRender(el, path, value, opts) {
		return await this.#run(
			async () => {
				const t0 = globalThis.performance?.now?.() ?? Date.now();

				// Security decision. If no security manager or MAC engine is provided we
				// can short-circuit to `allowed=true` synchronously to avoid microtask
				// delays that would make UI updates race with tests. When a security
				// manager is present, perform the constant-time check.
				let allowed = true;
				// Prefer the securityManager attached to the state manager if available
				const policySecurityManager =
					this.#deps.stateManager?.managers?.securityManager ??
					this.#deps.securityManager; // Fallback to direct dependency

				if (policySecurityManager) {
					const orchestrator =
						this.#deps.stateManager?.managers?.asyncOrchestrator;
					const label = this.#labelForPath(path);
					let checkResult = true;
					if (policySecurityManager?.canRead) {
						if (orchestrator) {
							checkResult = await orchestrator.run(
								() =>
									policySecurityManager.canRead(label, path),
								{
									label: "BindEngine.securityCheck",
									eventType: "BIND_SECURITY_CHECK",
									actorId: "system.bindEngine",
									meta: { path },
								}
							);
						} else {
							checkResult = await policySecurityManager.canRead(
								label,
								path
							);
						}
						checkResult = !!checkResult;
					}

					allowed = await constantTimeCheck(
						checkResult,
						{ minDurationMs: this.#deps.ctMinDurationMs ?? 0 },
						{ minDurationMs: this.#deps.ctMinDurationMs ?? 0 }
					);
				}

				if (!allowed) {
					// Render restriction via explainer
					if (this.#deps.securityExplainer) {
						this.#deps.securityExplainer.renderRestriction(el, {
							reason: "no-read-up",
							path,
						});
					} else {
						// Fallback minimal safe rendering
						this.#mutate(
							el,
							() => {
								el.textContent = opts.fallback ?? "Restricted";
							},
							{
								type: "UI_BIND_DENIED",
								path,
							}
						);
					}
					await this.#run(
						async () => {
							this.#deps.metrics?.record?.("bind.render.denied", {
								count: 1,
							});
						},
						{
							label: "BindEngine.metrics",
							eventType: "BIND_ENGINE_METRICS",
							meta: { path },
						}
					);
					return;
				}

				// Optional mapping/formatting
				let out = value;
				if (typeof opts.map === "function") out = opts.map(out);
				if (
					opts.format &&
					typeof this.#deps.stateManager.format === "function"
				) {
					out = this.#deps.stateManager.format(opts.format, out);
				}
				out = this.#sanitizeOutbound(out);

				// Mutate DOM safely under forensic envelope
				if (opts.attr) {
					this.#mutate(
						el,
						() => {
							el.setAttribute(
								opts.attr,
								out == null ? "" : String(out)
							);
						},
						{
							type: "UI_BIND_ATTR",
							path,
							attr: opts.attr,
							value: out,
						}
					);
				} else {
					this.#mutate(
						el,
						() => {
							// textContent only – prevents HTML injection
							el.textContent = out == null ? "" : String(out);
						},
						{ type: "UI_BIND_TEXT", path, value: out }
					);
				}

				const dt = (globalThis.performance?.now?.() ?? Date.now()) - t0;
				await this.#run(
					async () => {
						this.#deps.metrics?.record?.("bind.render.time", {
							path,
							ms: dt,
						});
						this.#deps.metrics?.record?.("bind.render.count", {
							count: 1,
						});
					},
					{
						label: "BindEngine.metrics",
						eventType: "BIND_ENGINE_METRICS",
						meta: { path },
					}
				);

				// V8.0 Parity: Optional embedding for UI semantic analytics.
				if (
					this.#deps.embeddingManager &&
					this.#deps.stateManager?.getPolicy?.(
						"observability",
						"embedding_depth"
					) !== "none"
				) {
					this.#deps.embeddingManager
						.createEmbedding({
							source: `ui-bind:${path}`,
							content: String(out),
						})
						.catch(() => {
							/* best-effort */
						});
				}
			},
			{
				label: "BindEngine.safeRender",
				eventType: "BIND_SAFE_RENDER",
				meta: { path },
			}
		);
	}

	/**
	 * Computes the security label for a given state path by inspecting the value or its context.
	 *
	 * @private
	 * @param {string} path
	 * @returns {{level:string, compartments:Set<string>}}
	 */
	#labelForPath(path) {
		const sm = this.#deps.stateManager;
		const mac = sm?.mac || this.#deps.securityManager;
		const node = sm?.get?.(path);
		if (mac?.label)
			return mac.label(
				node ?? { classification: "unclassified", compartments: [] }
			);
		const level = node?.classification || "unclassified";
		const compartments = new Set(node?.compartments || []);
		return { level, compartments };
	}

	/**
	 * Resolves and caches the sanitizer service from the state manager.
	 * @private
	 * @returns {{ cleanse?:(value:any, schema?:any)=>any, cleanseText?:(value:string)=>string }|null}
	 */
	#getSanitizer() {
		const stateManager = this.#deps.stateManager;
		const managerSanitizer =
			stateManager?.managers?.sanitizer ||
			stateManager?.sanitizer ||
			null;
		if (managerSanitizer && managerSanitizer !== this.#sanitizer) {
			this.#sanitizer = managerSanitizer;
		}
		return this.#sanitizer;
	}

	/**
	 * Run an operation under the async orchestrator when available so
	 * auditing/metrics/policy metadata are attached. Falls back to calling
	 * the operation directly and passing errorHelpers when provided.
	 * @private
	 * @template T
	 * @param {() => Promise<T>|((errorHelpers:any)=>Promise<T>)} operation
	 * @param {{label?:string,eventType?:string,meta?:any}} [opts]
	 * @returns {Promise<T>}
	 */
	async #run(operation, opts = {}) {
		const orchestrator =
			this.#deps.stateManager?.managers?.asyncOrchestrator;
		const runOpts = {
			label: opts.label ?? "BindEngine.run",
			eventType: opts.eventType ?? "BIND_ENGINE_OP",
			actorId: "system.bindEngine",
			meta: opts.meta ?? {},
		};
		if (orchestrator) {
			return await orchestrator.run(operation, runOpts);
		}
		// If the operation expects errorHelpers, pass them; otherwise call directly.
		return await operation(this.#deps.stateManager?.managers?.errorHelpers);
	}

	/**
	 * Sanitizes values before rendering them into the DOM.
	 * @private
	 * @param {any} value
	 * @returns {any}
	 */
	#sanitizeOutbound(value) {
		const sanitizer = this.#getSanitizer();
		if (!sanitizer) return value;
		try {
			if (typeof value === "string" && sanitizer.cleanseText) {
				return sanitizer.cleanseText(value) ?? "";
			}
			if (sanitizer.cleanse) {
				const cleaned = sanitizer.cleanse(value);
				if (cleaned === null || cleaned === undefined) {
					return typeof value === "string" ? "" : cleaned;
				}
				return cleaned;
			}
			return value;
		} catch (error) {
			console.warn(
				"[BindEngine] Failed to sanitize outbound value.",
				error
			);
			if (typeof value === "string" && sanitizer.cleanseText) {
				try {
					return sanitizer.cleanseText(String(value));
				} catch {
					return "";
				}
			}
			return value;
		}
	}

	/**
	 * Sanitizes inbound user input prior to state updates.
	 * @private
	 * @param {any} value
	 * @returns {any}
	 */
	#sanitizeInbound(value) {
		const sanitizer = this.#getSanitizer();
		if (!sanitizer)
			return value ?? (typeof value === "string" ? "" : value);
		try {
			if (typeof value === "string" && sanitizer.cleanseText) {
				const cleaned = sanitizer.cleanseText(value);
				return cleaned ?? "";
			}
			if (sanitizer.cleanse) {
				const cleaned = sanitizer.cleanse(value);
				if (cleaned === null || cleaned === undefined) {
					return typeof value === "string" ? "" : cleaned;
				}
				return cleaned;
			}
			return value;
		} catch (error) {
			console.warn(
				"[BindEngine] Failed to sanitize inbound value.",
				error
			);
			if (typeof value === "string" && sanitizer.cleanseText) {
				try {
					return sanitizer.cleanseText(String(value));
				} catch {
					return "";
				}
			}
			return typeof value === "string" ? "" : null;
		}
	}

	/**
	 * Wraps a DOM mutation function within a forensic envelope for auditable UI changes.
	 *
	 * @private
	 * @param {Element} el Target element being mutated
	 * @param {() => void} fn Mutation function (synchronous)
	 * @param {Record<string, any>} meta Additional metadata to include in envelope
	 * @returns {Promise<void>}
	 */
	async #mutate(el, fn, meta) {
		/* copilotGuard:require-forensic-envelope */
		return await this.#run(
			() => {
				// Start creating the forensic envelope but don't await it — perform the
				// mutation synchronously so callers and tests see immediate updates.
				const envPromise = this.#deps.forensicLogger.createEnvelope(
					"DOM_MUTATION",
					{
						target: el.tagName,
						...meta,
					}
				);
				try {
					fn();
					// When the envelope is available, commit it. Fire-and-forget; swallow
					// errors to avoid disrupting the UI path. Chain commitEnvelope so
					// promise nesting is avoided.
					envPromise
						.then((env) =>
							this.#deps.forensicLogger.commitEnvelope(env)
						)
						.catch(() => {
							/* envelope creation or commit failed — swallow to avoid UI disruption */
						});
				} catch (e) {
					// If the mutation itself throws, attempt to commit any envelope when
					// available and then rethrow to surface the error.
					envPromise
						.then((env) =>
							this.#deps.forensicLogger.commitEnvelope(env)
						)
						.catch(() => {});
					throw e;
				}
			},
			{ label: "BindEngine.mutate", eventType: "DOM_MUTATION", meta }
		);
	}

	// ---------------------------------------------------------------------------
	// Two-way binding
	// ---------------------------------------------------------------------------

	/**
	 * Sets up two-way data binding for an input element, updating state on user input.
	 *
	 * @private
	 * @param {Element} el Input element to observe
	 * @param {string} path State path to update
	 * @param {BindingOptions} opts Binding options
	 * @returns {void}
	 */
	#wireTwoWay(el, path, opts) {
		const handler = async (e) => {
			const rawVal = /** @type {HTMLInputElement|any} */ (e.target).value;
			const newVal = this.#sanitizeInbound(rawVal);
			/* copilotGuard:require-forensic-envelope */
			await this.#run(
				async () => {
					const env = await this.#deps.forensicLogger.createEnvelope(
						"UI_BIND_MUTATION",
						{
							path,
							value: newVal,
							source: "input",
						}
					);
					try {
						await this.#deps.stateManager.set?.(path, newVal);
						await this.#deps.forensicLogger.commitEnvelope(env);
					} catch (err) {
						await this.#deps.forensicLogger.commitEnvelope(env);
						throw err;
					}
				},
				{
					label: "BindEngine.wireTwoWay",
					eventType: "UI_BIND_MUTATION",
					meta: { path },
				}
			);
		};

		el.addEventListener("input", handler);
		el.addEventListener("change", handler);

		// Store unsub alongside existing
		const meta = this.#bindings.get(el);
		const prevUnsub = meta?.unsub;
		const unsub = () => {
			el.removeEventListener("input", handler);
			el.removeEventListener("change", handler);
			prevUnsub?.();
		};
		if (meta) this.#bindings.set(el, { ...meta, unsub });
	}
}

// -----------------------------------------------------------------------------
// Optional service helper for SystemBootstrap
// -----------------------------------------------------------------------------

/**
 * Create, start and return a BindEngine instance.
 * Useful for SystemBootstrap wiring where a running service instance is required.
 *
 * @param {BindEngineDeps} deps
 * @returns {Promise<BindEngine>} Resolves to the running BindEngine instance
 */
export async function createBindEngineService(deps) {
	/* copilotGuard:require-forensic-envelope */
	const orchestrator = deps.stateManager?.managers?.asyncOrchestrator;
	if (orchestrator) {
		return await orchestrator.run(
			async () => {
				/* ForensicLogger.createEnvelope */
				const env = await deps.forensicLogger.createEnvelope(
					"SERVICE_START",
					{
						service: "BindEngine",
						context: "bootstrap",
					}
				);
				try {
					const engine = new BindEngine(deps);
					await engine.start(document);
					await deps.forensicLogger.commitEnvelope(env);
					return engine;
				} catch (err) {
					await deps.forensicLogger.commitEnvelope(env);
					throw err;
				}
			},
			{
				label: "BindEngine.serviceStart",
				eventType: "BIND_ENGINE_SERVICE_START",
				actorId: "system.bindEngine",
				meta: { context: "bootstrap" },
			}
		);
	}

	/* ForensicLogger.createEnvelope */
	const env = await deps.forensicLogger.createEnvelope("SERVICE_START", {
		service: "BindEngine",
		context: "bootstrap",
	});
	try {
		const engine = new BindEngine(deps);
		await engine.start(document);
		await deps.forensicLogger.commitEnvelope(env);
		return engine;
	} catch (err) {
		await deps.forensicLogger.commitEnvelope(env);
		throw err;
	}
}
