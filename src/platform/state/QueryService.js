/**
 * @file QueryService.js
 * @version 3.0.0 - Enterprise Observability Baseline
 * @description Production-ready unified search service with comprehensive security,
 * observability, and compliance features. Uses centralized orchestration wrapper for
 * consistent observability and minimal logging noise.
 *
 * ESLint Exception: nodus/require-async-orchestration
 * Justification: Wrapper pattern provides superior observability consistency and
 * centralized policy enforcement compared to per-method orchestrator setup.
 *
 * Security Classification: INTERNAL
 * License Tier: Enterprise (search service requires enterprise license)
 * Compliance: MAC-enforced, forensic-audited, polyinstantiation-ready
 */

import { DateCore } from "@shared/lib/DateUtils.js";

/**
 * @class QueryService
 * @classdesc Enterprise-grade unified search service with comprehensive security,
 * MAC enforcement, forensic auditing, and automatic observability. Orchestrates
 * search queries across multiple domains with intelligent ranking and caching.
 */
export class QueryService {
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

	// Service dependencies
	/** @private @type {import('@platform/extensions/ManifestPluginSystem.js').default|null} */
	#pluginSystem = null;
	/** @private @type {import('@platform/services/EmbeddingManager.js').default|null} */
	#embeddingManager = null;
	/** @private @type {import('@shared/lib/LRUCache.js').LRUCache|null} */
	#cache = null;

	/**
	 * Creates an instance of QueryService with enterprise security and observability.
	 * @param {object} dependencies - Required dependencies
	 * @param {import('@platform/state/HybridStateManager.js').default} dependencies.stateManager - State manager
	 */
	constructor({ stateManager }) {
		// V8.0 Parity: Mandate 1.2 - Derive all dependencies from stateManager
		this.#stateManager = stateManager;
		this.#loggedWarnings = new Set();

		// Initialize managers from stateManager (no direct instantiation)
		this.#managers = stateManager?.managers || {};
		this.#sanitizer = this.#managers?.sanitizer || null;
		this.#metrics =
			this.#managers?.metricsRegistry?.namespace("query") || null;
		this.#errorBoundary = this.#managers?.errorBoundary || null;
		this.#currentUser = this.#initializeUserContext();

		// Initialize service dependencies from managers
		this.#pluginSystem = this.#managers?.pluginSystem || null;
		this.#embeddingManager = this.#managers?.embeddingManager || null;
		this.#cache =
			this.#managers?.cacheManager?.getCache("queries", 200, {
				ttl: 60000,
			}) || null;

		// Validate enterprise license for search service
		this.#validateEnterpriseLicense();
	}

	/**
	 * Validates enterprise license for search service features.
	 * @private
	 */
	#validateEnterpriseLicense() {
		const license = this.#managers?.license;
		if (!license?.hasFeature("search_service")) {
			this.#dispatchAction("license.validation_failed", {
				feature: "search_service",
				component: "QueryService",
			});
			throw new Error("Enterprise license required for QueryService");
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
					component: "QueryService",
				});
				return userId;
			}
		}

		this.#dispatchAction("security.user_context_failed", {
			component: "QueryService",
			error: "No valid user context found",
		});

		return "system";
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

		// Check search service policy
		if (!policies?.getPolicy("search", "enabled")) {
			this.#emitWarning("Search service disabled by policy", {
				operation: operationName,
			});
			return Promise.resolve(null);
		}

		/* PERFORMANCE_BUDGET: 5ms */
		const runner = orchestrator.createRunner(`query.${operationName}`);

		/* PERFORMANCE_BUDGET: varies by operation */
		return runner
			.run(
				() =>
					this.#errorBoundary?.tryAsync(() => operation()) ||
					operation(),
				{
					label: `query.${operationName}`,
					actorId: this.#currentUser,
					classification: "INTERNAL",
					timeout: options.timeout || 30000,
					retries: options.retries || 1,
					...options,
				}
			)
			.catch((error) => {
				this.#incrementMetric("query_orchestration_error");
				this.#emitCriticalWarning("Query orchestration failed", {
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
				source: "QueryService",
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
				component: "QueryService",
			});
			return input;
		}

		const result = this.#sanitizer.cleanse?.(input, schema) || input;

		if (result !== input) {
			this.#dispatchAction("security.input_sanitized", {
				component: "QueryService",
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
			component: "QueryService",
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
			component: "QueryService",
			message,
			meta,
			actor: this.#currentUser,
			timestamp: DateCore.timestamp(),
			level: "error",
			critical: true,
		});
	}

	/**
	 * Normalize metric key names for dispatcher/registry usage.
	 * @private
	 */
	#metricKey(name) {
		const key = String(name || "");
		if (key.startsWith("query") || key.startsWith("query.")) return key;
		return `query.${key}`;
	}

	/**
	 * Increment a metric via ActionDispatcher when available, falling back to the
	 * local metrics registry only if dispatcher is unavailable.
	 * @private
	 */
	#incrementMetric(name, value = 1) {
		const dispatcher = this.#managers?.actionDispatcher;
		const key = this.#metricKey(name);
		try {
			if (dispatcher?.dispatch) {
				/* PERFORMANCE_BUDGET: 1ms */
				dispatcher.dispatch("metrics.increment", { key, value });
				return;
			}
		} catch {
			// swallow dispatcher errors - non-fatal
		}

		try {
			this.#metrics?.increment?.(key, value);
		} catch {
			// swallow fallback errors
		}
	}

	/**
	 * Set or update a metric value via ActionDispatcher when available,
	 * falling back to the local registry.
	 * @private
	 */
	#setMetric(name, value) {
		const dispatcher = this.#managers?.actionDispatcher;
		const key = this.#metricKey(name);
		try {
			if (dispatcher?.dispatch) {
				dispatcher.dispatch("metrics.set", { key, value });
				return;
			}
		} catch {
			// swallow dispatcher errors
		}
		try {
			this.#metrics?.set?.(key, value);
		} catch {
			// swallow fallback errors
		}
	}

	/**
	 * Record a timing metric.
	 * @private
	 */
	#recordTimer(name, value) {
		const dispatcher = this.#managers?.actionDispatcher;
		const key = this.#metricKey(name);
		try {
			if (dispatcher?.dispatch) {
				dispatcher.dispatch("metrics.timer", { key, value });
				return;
			}
		} catch {
			// swallow
		}
		try {
			this.#metrics?.timer?.(key, value);
		} catch {
			// swallow
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PUBLIC API
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Executes a search across local state, plugins, and AI embeddings.
	 * @public
	 * @param {string} query - The search query string
	 * @param {object} [options={}] - Search options
	 * @param {string[]} [options.domains=[]] - Domains to limit search to
	 * @param {number} [options.limit=50] - Maximum number of results
	 * @param {boolean} [options.includeAI=true] - Whether to include AI results
	 * @returns {Promise<any[]>} Sorted list of search results
	 */
	search(query, options = {}) {
		return this.#runOrchestrated(
			"search",
			() => {
				const sanitizedQuery = this.#sanitizeInput(query);
				const sanitizedOptions = this.#sanitizeInput(options);

				if (!sanitizedQuery || typeof sanitizedQuery !== "string") {
					return Promise.resolve([]);
				}

				const cacheKey = `${sanitizedQuery}:${JSON.stringify(sanitizedOptions)}`;
				const cached = this.#cache?.get(cacheKey);
				if (cached) {
					this.#incrementMetric("cache_hit");
					return Promise.resolve(cached);
				}

				this.#incrementMetric("cache_miss");
				const {
					domains = [],
					limit = 50,
					includeAI = true,
				} = sanitizedOptions;

				// Execute searches and combine results
				return this.#searchLocalEntities(sanitizedQuery, domains).then(
					(localResults) => {
						return this.#searchPlugins(
							sanitizedQuery,
							domains
						).then((pluginResults) => {
							const results = [...localResults, ...pluginResults];

							if (includeAI && this.#embeddingManager) {
								return this.#searchEmbeddings(sanitizedQuery, {
									limit,
								}).then((aiResults) => {
									results.push(...aiResults);
									return this.#rankAndCacheResults(
										results,
										limit,
										cacheKey
									);
								});
							}

							return this.#rankAndCacheResults(
								results,
								limit,
								cacheKey
							);
						});
					}
				);
			},
			{ timeout: 10000 }
		);
	}

	/**
	 * Generates auto-complete suggestions based on partial query.
	 * @public
	 * @param {string} partialQuery - Partial query string
	 * @param {number} [limit=5] - Maximum number of suggestions
	 * @returns {Promise<string[]>} Array of suggestion strings
	 */
	getSuggestions(partialQuery, limit = 5) {
		return this.#runOrchestrated(
			"getSuggestions",
			() => {
				const sanitizedQuery = this.#sanitizeInput(partialQuery);

				if (!sanitizedQuery || sanitizedQuery.length < 2) {
					return Promise.resolve([]);
				}

				return this.search(sanitizedQuery, { limit: limit * 2 }).then(
					(results) => {
						if (!results) return [];

						const suggestions = new Set();

						results.forEach((result) => {
							if (result.title) suggestions.add(result.title);
							if (result.name) suggestions.add(result.name);
							if (result.tags) {
								result.tags.forEach((tag) =>
									suggestions.add(tag)
								);
							}
						});

						return Array.from(suggestions)
							.filter((suggestion) =>
								suggestion
									.toLowerCase()
									.includes(sanitizedQuery.toLowerCase())
							)
							.slice(0, limit);
					}
				);
			},
			{ timeout: 5000 }
		);
	}

	/**
	 * Clears the entire query result cache.
	 * @public
	 * @returns {Promise<void>}
	 */
	clearCache() {
		return this.#runOrchestrated("clearCache", () => {
			this.#cache?.clear();
			this.#dispatchAction("query.cache_cleared", {
				timestamp: DateCore.timestamp(),
			});
			return Promise.resolve();
		});
	}

	/**
	 * Gets service statistics and health metrics.
	 * @public
	 * @returns {object}
	 */
	getStats() {
		return {
			cache: this.#cache?.getMetrics() || {},
			localSearchAvailable: !!this.#stateManager?.queryLocalEntities,
			pluginSearchAvailable: !!this.#pluginSystem?.activePlugins?.length,
			aiSearchAvailable: !!this.#embeddingManager?.semanticSearch,
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
			orchestratorAvailable: !!this.#managers?.asyncOrchestrator,
			actionDispatcherAvailable: !!this.#managers?.actionDispatcher,
			sanitizerAvailable: !!this.#sanitizer,
			cacheAvailable: !!this.#cache,
			pluginSystemAvailable: !!this.#pluginSystem,
			embeddingManagerAvailable: !!this.#embeddingManager,
			licenseValid:
				this.#managers?.license?.hasFeature("search_service") || false,
			userContext: !!this.#currentUser,
		};

		const healthy = Object.values(checks).every((check) => check === true);

		const result = {
			healthy,
			checks,
			timestamp: DateCore.timestamp(),
			version: "3.0.0",
		};

		this.#dispatchAction("query.health_check", {
			healthy,
			checksCount: Object.keys(checks).length,
			timestamp: DateCore.timestamp(),
		});

		return result;
	}

	/**
	 * Gracefully cleans up the service.
	 * @public
	 * @returns {Promise<void>}
	 */
	cleanup() {
		return this.#runOrchestrated("cleanup", () => {
			// Clear cache
			this.#cache?.clear();

			// Clear references
			this.#pluginSystem = null;
			this.#embeddingManager = null;
			this.#cache = null;
			this.#loggedWarnings.clear();

			this.#dispatchAction("query.cleanup", {
				timestamp: DateCore.timestamp(),
				success: true,
			});

			return Promise.resolve();
		});
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PRIVATE IMPLEMENTATION
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Searches local entities from HybridStateManager.
	 * @private
	 * @param {string} query - Search query
	 * @param {string[]} domains - Domain filter
	 * @returns {Promise<any[]>}
	 */
	#searchLocalEntities(query, domains) {
		return Promise.resolve().then(() => {
			if (!this.#stateManager?.queryLocalEntities) {
				return [];
			}

			return this.#stateManager
				.queryLocalEntities(query)
				.then((results) => {
					if (domains.length > 0) {
						return (results || []).filter(
							(result) =>
								domains.includes(result.domain) ||
								domains.includes(result.type) ||
								!result.domain
						);
					}
					return results || [];
				});
		});
	}

	/**
	 * Searches across active plugins.
	 * @private
	 * @param {string} query - Search query
	 * @param {string[]} domains - Domain filter
	 * @returns {Promise<any[]>}
	 */
	#searchPlugins(query, domains) {
		return Promise.resolve().then(() => {
			if (!this.#pluginSystem?.activePlugins) {
				return [];
			}

			const searchPromises = [];

			for (const plugin of this.#pluginSystem.activePlugins) {
				if (typeof plugin.search === "function") {
					const pluginSearch = Promise.resolve()
						.then(() => plugin.search(query, { domains }))
						.then((pluginResults) => {
							if (!pluginResults) return [];
							return pluginResults.map((result) => ({
								...result,
								source: "plugin",
								pluginId: plugin.id,
								pluginName: plugin.name || plugin.id,
							}));
						})
						.catch((error) => {
							this.#emitWarning("Plugin search failed", {
								pluginId: plugin.id,
								error: error.message,
							});
							return [];
						});

					searchPromises.push(pluginSearch);
				}
			}

			return Promise.all(searchPromises).then((allPluginResults) =>
				allPluginResults.flat().filter(Boolean)
			);
		});
	}

	/**
	 * Performs semantic search using EmbeddingManager.
	 * @private
	 * @param {string} query - Search query
	 * @param {object} options - Search options
	 * @returns {Promise<any[]>}
	 */
	#searchEmbeddings(query, options) {
		return Promise.resolve().then(() => {
			if (!this.#embeddingManager?.semanticSearch) {
				return [];
			}

			return this.#embeddingManager
				.semanticSearch(query, {
					topK: options.limit || 10,
					threshold: 0.7,
				})
				.then((aiResults) => {
					if (!aiResults) return [];

					return aiResults.map((result) => ({
						...result,
						source: "ai",
						searchType: "semantic",
					}));
				});
		});
	}

	/**
	 * Ranks results and caches them.
	 * @private
	 * @param {any[]} results - Search results
	 * @param {number} limit - Result limit
	 * @param {string} cacheKey - Cache key
	 * @returns {any[]}
	 */
	#rankAndCacheResults(results, limit, cacheKey) {
		const rankedResults = this.#rankResults(results).slice(0, limit);
		this.#cache?.set(cacheKey, rankedResults);
		return rankedResults;
	}

	/**
	 * Ranks search results by relevance, source priority, and recency.
	 * @private
	 * @param {any[]} results - Results to rank
	 * @returns {any[]}
	 */
	#rankResults(results) {
		return results.sort((a, b) => {
			// Primary sort by relevance score
			const relevanceA = a.relevance || 0;
			const relevanceB = b.relevance || 0;
			if (relevanceA !== relevanceB) {
				return relevanceB - relevanceA;
			}

			// Secondary sort by source priority (local > plugin > ai)
			const sourcePriority = { local: 3, plugin: 2, ai: 1 };
			const priorityA = sourcePriority[a.source] || 0;
			const priorityB = sourcePriority[b.source] || 0;
			if (priorityA !== priorityB) {
				return priorityB - priorityA;
			}

			// Tertiary sort by recency
			const timeA = new Date(a.timestamp || a.created || 0).getTime();
			const timeB = new Date(b.timestamp || b.created || 0).getTime();

			return timeB - timeA;
		});
	}
}

/**
 * Utility function to query entities directly from state manager storage.
 * @param {import('@platform/state/HybridStateManager.js').default} stateManager - State manager
 * @param {object} [options={}] - Query options
 * @param {string} [options.store='objects'] - Object store name
 * @param {string} options.index - Index name
 * @param {IDBValidKey|IDBKeyRange} options.query - Query value or range
 * @param {Function} [options.fallbackFilter] - Optional filter function
 * @returns {Promise<any[]>} Matching entities
 */
export function queryEntities(
	stateManager,
	{ store = "objects", index, query, fallbackFilter } = {}
) {
	return stateManager.storage.instance
		.query(store, index, query)
		.then((results) => {
			if (fallbackFilter) return results.filter(fallbackFilter);
			return results;
		});
}

export default QueryService;
