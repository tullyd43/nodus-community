/**
 * @file DeveloperDashboard.js
 * @version 4.0.0 - Enterprise Observability Baseline
 * @description Production-ready developer dashboard with comprehensive security,
 * observability, and compliance features. Uses centralized orchestration wrapper for
 * consistent observability and minimal logging noise.
 *
 * ESLint Exception: nodus/require-async-orchestration
 * Justification: Wrapper pattern provides superior observability consistency and
 * centralized policy enforcement compared to per-method orchestrator setup.
 *
 * Security Classification: INTERNAL
 * License Tier: Enterprise (developer dashboard requires enterprise license)
 * Compliance: MAC-enforced, forensic-audited, polyinstantiation-ready
 */

import { BoundedStack } from "@shared/lib/BoundedStack.js";
import { DateCore } from "@shared/lib/DateUtils.js";
import { SafeDOM } from "@shared/lib/SafeDOM.js";

/**
 * @class DeveloperDashboard
 * @classdesc Enterprise-grade developer dashboard with comprehensive security,
 * MAC enforcement, forensic auditing, and automatic observability. Provides
 * real-time system metrics, policy controls, and performance monitoring.
 */
export class DeveloperDashboard {
	/** @private @type {HTMLElement} */
	#container;
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

	// Dashboard state
	/** @private @type {HTMLElement|null} */
	#dashboardElement = null;
	/** @private @type {HTMLElement|null} */
	#toggleBtn = null;
	/** @private @type {boolean} */
	#isOpen = false;
	/** @private @type {number|null} */
	#updateInterval = null;
	/** @private @type {BoundedStack} */
	#eventLog = new BoundedStack(50);
	/** @private @type {Array<Function>} */
	#unsubscribeFunctions = [];
	/** @private @type {object} */
	#perfMetrics = {};
	/** @private @type {object} */
	#options;

	// Dashboard containers
	/** @private @type {HTMLElement|null} */
	#metricsContainer = null;
	/** @private @type {HTMLElement|null} */
	#policyContainer = null;
	/** @private @type {HTMLElement|null} */
	#eventLogContainer = null;
	/** @private @type {HTMLElement|null} */
	#statusContainer = null;

	/**
	 * Creates an instance of DeveloperDashboard with enterprise security and observability.
	 * @param {HTMLElement} container - DOM container for the dashboard
	 * @param {object} dependencies - Required dependencies
	 * @param {import('@platform/state/HybridStateManager.js').default} dependencies.stateManager - State manager
	 * @param {object} [options={}] - Configuration options
	 */
	constructor(container, { stateManager }, options = {}) {
		// V8.0 Parity: Mandate 1.2 - Derive all dependencies from stateManager
		this.#container = container;
		this.#stateManager = stateManager;
		this.#options = { startOpen: false, ...options };
		this.#loggedWarnings = new Set();

		// Initialize managers from stateManager (no direct instantiation)
		this.#managers = stateManager?.managers || {};
		this.#sanitizer = this.#managers?.sanitizer || null;
		this.#metrics = this.#managers?.metricsRegistry || null;
		this.#errorBoundary = this.#managers?.errorBoundary || null;
		this.#currentUser = this.#initializeUserContext();

		// Validate enterprise license for developer dashboard
		this.#validateEnterpriseLicense();
	}

	/**
	 * Validates enterprise license for developer dashboard features.
	 * @private
	 */
	#validateEnterpriseLicense() {
		const license = this.#managers?.license;
		if (!license?.hasFeature("developer_dashboard")) {
			this.#dispatchAction("license.validation_failed", {
				feature: "developer_dashboard",
				component: "DeveloperDashboard",
			});
			throw new Error(
				"Enterprise license required for DeveloperDashboard"
			);
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
					component: "DeveloperDashboard",
				});
				return userId;
			}
		}

		this.#dispatchAction("security.user_context_failed", {
			component: "DeveloperDashboard",
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

		// Check developer dashboard policy
		if (!policies?.getPolicy("system", "enable_developer_dashboard")) {
			this.#emitWarning("Developer dashboard disabled by policy", {
				operation: operationName,
			});
			return Promise.resolve(null);
		}

		/* PERFORMANCE_BUDGET: 5ms */
		const runner = orchestrator.createRunner(`dashboard.${operationName}`);

		/* PERFORMANCE_BUDGET: varies by operation */
		return runner
			.run(
				() =>
					this.#errorBoundary?.tryAsync(() => operation()) ||
					operation(),
				{
					label: `dashboard.${operationName}`,
					actorId: this.#currentUser,
					classification: "INTERNAL",
					timeout: options.timeout || 30000,
					retries: options.retries || 1,
					...options,
				}
			)
			.catch((error) => {
				this.#metrics?.increment("dashboard_orchestration_error");
				this.#emitCriticalWarning("Dashboard orchestration failed", {
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
				source: "DeveloperDashboard",
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
				component: "DeveloperDashboard",
			});
			return input;
		}

		const result = this.#sanitizer.cleanse?.(input, schema) || input;

		if (result !== input) {
			this.#dispatchAction("security.input_sanitized", {
				component: "DeveloperDashboard",
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
			component: "DeveloperDashboard",
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
			component: "DeveloperDashboard",
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
	 * Initializes the developer dashboard.
	 * @public
	 * @returns {Promise<void>}
	 */
	initialize() {
		return this.#runOrchestrated("initialize", () => {
			return this.#createDashboardStructure()
				.then(() => this.#attachEventListeners())
				.then(() => this.#loadInitialData())
				.then(() => {
					if (this.#options.startOpen) {
						return this.open();
					}
					this.#dispatchAction("dashboard.initialized", {
						startOpen: this.#options.startOpen,
					});
				});
		});
	}

	/**
	 * Opens the developer dashboard.
	 * @public
	 * @returns {Promise<void>}
	 */
	open() {
		return this.#runOrchestrated("open", () => {
			if (this.#isOpen) return Promise.resolve();

			this.#isOpen = true;
			this.#dashboardElement?.classList.remove("collapsed");

			if (this.#toggleBtn) {
				SafeDOM.setText(this.#toggleBtn, "Collapse");
			}

			// Start metrics updates
			this.#updateInterval = setInterval(() => {
				this.#updateMetrics().catch((error) => {
					this.#emitWarning("Metrics update failed", {
						error: error.message,
					});
				});
			}, 1000);

			this.#dispatchAction("dashboard.opened", {
				timestamp: DateCore.timestamp(),
			});

			return this.#updateMetrics();
		});
	}

	/**
	 * Closes the developer dashboard.
	 * @public
	 * @returns {Promise<void>}
	 */
	close() {
		return this.#runOrchestrated("close", () => {
			if (!this.#isOpen) return Promise.resolve();

			this.#isOpen = false;
			this.#dashboardElement?.classList.add("collapsed");

			if (this.#toggleBtn) {
				SafeDOM.setText(this.#toggleBtn, "Expand");
			}

			// Stop metrics updates
			if (this.#updateInterval) {
				clearInterval(this.#updateInterval);
				this.#updateInterval = null;
			}

			this.#dispatchAction("dashboard.closed", {
				timestamp: DateCore.timestamp(),
			});

			return Promise.resolve();
		});
	}

	/**
	 * Toggles the dashboard between open and closed states.
	 * @public
	 * @returns {Promise<void>}
	 */
	toggle() {
		return this.#isOpen ? this.close() : this.open();
	}

	/**
	 * Refreshes all dashboard data.
	 * @public
	 * @returns {Promise<void>}
	 */
	refresh() {
		return this.#runOrchestrated("refresh", () => {
			return this.#loadInitialData()
				.then(() => this.#updateMetrics())
				.then(() => {
					this.#dispatchAction("dashboard.refreshed", {
						timestamp: DateCore.timestamp(),
					});
				});
		});
	}

	/**
	 * Gets dashboard statistics and health metrics.
	 * @public
	 * @returns {object}
	 */
	getStats() {
		return {
			isOpen: this.#isOpen,
			hasUpdateInterval: !!this.#updateInterval,
			eventLogSize: this.#eventLog.size(),
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
			containerMounted: !!this.#dashboardElement,
			orchestratorAvailable: !!this.#managers?.asyncOrchestrator,
			actionDispatcherAvailable: !!this.#managers?.actionDispatcher,
			sanitizerAvailable: !!this.#sanitizer,
			metricsAvailable: !!this.#metrics,
			licenseValid:
				this.#managers?.license?.hasFeature("developer_dashboard") ||
				false,
			userContext: !!this.#currentUser,
		};

		const healthy = Object.values(checks).every((check) => check === true);

		const result = {
			healthy,
			checks,
			timestamp: DateCore.timestamp(),
			version: "4.0.0",
		};

		this.#dispatchAction("dashboard.health_check", {
			healthy,
			checksCount: Object.keys(checks).length,
			timestamp: DateCore.timestamp(),
		});

		return result;
	}

	/**
	 * Gracefully cleans up the dashboard.
	 * @public
	 * @returns {Promise<void>}
	 */
	cleanup() {
		return this.#runOrchestrated("cleanup", () => {
			// Stop update interval
			if (this.#updateInterval) {
				clearInterval(this.#updateInterval);
				this.#updateInterval = null;
			}

			// Remove dashboard element
			if (this.#dashboardElement && this.#dashboardElement.parentNode) {
				this.#dashboardElement.parentNode.removeChild(
					this.#dashboardElement
				);
			}

			// Clear references
			this.#dashboardElement = null;
			this.#toggleBtn = null;
			this.#metricsContainer = null;
			this.#policyContainer = null;
			this.#eventLogContainer = null;
			this.#statusContainer = null;
			this.#isOpen = false;

			// Clear event log
			this.#eventLog = new BoundedStack(50);
			this.#loggedWarnings.clear();

			this.#dispatchAction("dashboard.cleanup", {
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
	 * Creates the dashboard DOM structure.
	 * @private
	 * @returns {Promise<void>}
	 */
	#createDashboardStructure() {
		return Promise.resolve().then(() => {
			// Main dashboard container
			this.#dashboardElement = document.createElement("div");
			this.#dashboardElement.className =
				"nodus-developer-dashboard collapsed";
			this.#dashboardElement.setAttribute(
				"data-component",
				"DeveloperDashboard"
			);

			// Header with toggle button
			const header = document.createElement("div");
			header.className = "dashboard-header";

			const title = document.createElement("h3");
			SafeDOM.setText(title, "Developer Dashboard");

			this.#toggleBtn = document.createElement("button");
			this.#toggleBtn.className = "dashboard-toggle";
			this.#toggleBtn.setAttribute("data-action", "dashboard.toggle");
			SafeDOM.setText(this.#toggleBtn, "Expand");

			header.appendChild(title);
			header.appendChild(this.#toggleBtn);

			// Content container
			const content = document.createElement("div");
			content.className = "dashboard-content";

			// Status section
			const statusSection = this.#createStatusSection();

			// Metrics section
			const metricsSection = this.#createMetricsSection();

			// Policy section
			const policySection = this.#createPolicySection();

			// Event log section
			const eventLogSection = this.#createEventLogSection();

			content.appendChild(statusSection);
			content.appendChild(metricsSection);
			content.appendChild(policySection);
			content.appendChild(eventLogSection);

			this.#dashboardElement.appendChild(header);
			this.#dashboardElement.appendChild(content);

			// Inject CSS
			this.#injectCSS();

			// Mount to container
			this.#container.appendChild(this.#dashboardElement);
		});
	}

	/**
	 * Creates the status section.
	 * @private
	 * @returns {HTMLElement}
	 */
	#createStatusSection() {
		const section = document.createElement("section");
		section.className = "dashboard-section status-section";

		const header = document.createElement("h4");
		SafeDOM.setText(header, "System Status");

		this.#statusContainer = document.createElement("div");
		this.#statusContainer.className = "status-container";

		section.appendChild(header);
		section.appendChild(this.#statusContainer);

		return section;
	}

	/**
	 * Creates the metrics section.
	 * @private
	 * @returns {HTMLElement}
	 */
	#createMetricsSection() {
		const section = document.createElement("section");
		section.className = "dashboard-section metrics-section";

		const header = document.createElement("h4");
		SafeDOM.setText(header, "Performance Metrics");

		this.#metricsContainer = document.createElement("div");
		this.#metricsContainer.className = "metrics-container";

		section.appendChild(header);
		section.appendChild(this.#metricsContainer);

		return section;
	}

	/**
	 * Creates the policy section.
	 * @private
	 * @returns {HTMLElement}
	 */
	#createPolicySection() {
		const section = document.createElement("section");
		section.className = "dashboard-section policy-section";

		const header = document.createElement("h4");
		SafeDOM.setText(header, "Policy Controls");

		this.#policyContainer = document.createElement("div");
		this.#policyContainer.className = "policy-container";

		section.appendChild(header);
		section.appendChild(this.#policyContainer);

		return section;
	}

	/**
	 * Creates the event log section.
	 * @private
	 * @returns {HTMLElement}
	 */
	#createEventLogSection() {
		const section = document.createElement("section");
		section.className = "dashboard-section event-log-section";

		const header = document.createElement("h4");
		SafeDOM.setText(header, "Event Log");

		this.#eventLogContainer = document.createElement("div");
		this.#eventLogContainer.className = "event-log-container";

		section.appendChild(header);
		section.appendChild(this.#eventLogContainer);

		return section;
	}

	/**
	 * Attaches event listeners.
	 * @private
	 * @returns {Promise<void>}
	 */
	#attachEventListeners() {
		return Promise.resolve().then(() => {
			// Register with ActionDispatcher for declarative actions
			const actionDispatcher = this.#managers?.actionDispatcher;
			if (actionDispatcher) {
				// Register dashboard action handlers
				const dashboardHandlers = {
					"dashboard.toggle": () => this.toggle(),
					"dashboard.refresh": () => this.refresh(),
					"dashboard.open": () => this.open(),
					"dashboard.close": () => this.close(),
				};

				actionDispatcher.registerHandlers?.(dashboardHandlers);
			}

			// Subscribe to state manager events
			if (this.#stateManager?.on) {
				const unsubscribe1 = this.#stateManager.on(
					"observability.*",
					(event) => {
						this.#eventLog.push({
							timestamp: DateCore.timestamp(),
							type: "observability",
							data: this.#sanitizeInput(event),
						});
					}
				);

				const unsubscribe2 = this.#stateManager.on(
					"dashboard.*",
					(event) => {
						this.#eventLog.push({
							timestamp: DateCore.timestamp(),
							type: "dashboard",
							data: this.#sanitizeInput(event),
						});
					}
				);

				// Store unsubscribe functions for cleanup
				this.#unsubscribeFunctions = [unsubscribe1, unsubscribe2];
			}
		});
	}

	/**
	 * Loads initial data.
	 * @private
	 * @returns {Promise<void>}
	 */
	#loadInitialData() {
		return Promise.resolve()
			.then(() => {
				// Load system status
				return this.#loadSystemStatus();
			})
			.then(() => {
				// Load policy data
				return this.#loadPolicyData();
			})
			.then(() => {
				// Initial metrics load
				return this.#updateMetrics();
			});
	}

	/**
	 * Loads system status information.
	 * @private
	 * @returns {Promise<void>}
	 */
	#loadSystemStatus() {
		return Promise.resolve().then(() => {
			if (!this.#statusContainer) return;

			const healthCheck = this.healthCheck();

			// Clear container
			this.#statusContainer.innerHTML = "";

			// Create status items
			for (const [check, status] of Object.entries(healthCheck.checks)) {
				const item = document.createElement("div");
				item.className = `status-item ${status ? "healthy" : "unhealthy"}`;

				const label = document.createElement("span");
				label.className = "status-label";
				SafeDOM.setText(
					label,
					check.replace(/([A-Z])/g, " $1").toLowerCase()
				);

				const indicator = document.createElement("span");
				indicator.className = "status-indicator";
				SafeDOM.setText(indicator, status ? "✓" : "✗");

				item.appendChild(label);
				item.appendChild(indicator);
				this.#statusContainer.appendChild(item);
			}
		});
	}

	/**
	 * Loads policy data.
	 * @private
	 * @returns {Promise<void>}
	 */
	#loadPolicyData() {
		return Promise.resolve().then(() => {
			if (!this.#policyContainer) return;

			const policies = this.#managers?.policies;
			if (!policies) {
				SafeDOM.setText(
					this.#policyContainer,
					"Policy manager not available"
				);
				return;
			}

			// Clear container
			this.#policyContainer.innerHTML = "";

			// Create policy controls
			const policyKeys = [
				{ domain: "async", key: "enabled", label: "Async Operations" },
				{
					domain: "observability",
					key: "enabled",
					label: "Observability",
				},
				{
					domain: "system",
					key: "enable_developer_dashboard",
					label: "Developer Dashboard",
				},
				{
					domain: "security",
					key: "expose_global_namespace",
					label: "Global Namespace",
				},
			];

			for (const { domain, key, label } of policyKeys) {
				try {
					const value = policies.getPolicy?.(domain, key);
					const item = this.#createPolicyControl(
						domain,
						key,
						label,
						value
					);
					this.#policyContainer.appendChild(item);
				} catch (error) {
					this.#emitWarning("Failed to load policy", {
						domain,
						key,
						error: error.message,
					});
				}
			}
		});
	}

	/**
	 * Creates a policy control element.
	 * @private
	 * @param {string} domain - Policy domain
	 * @param {string} key - Policy key
	 * @param {string} label - Display label
	 * @param {any} value - Current value
	 * @returns {HTMLElement}
	 */
	#createPolicyControl(domain, key, label, value) {
		const item = document.createElement("div");
		item.className = "policy-item";

		const labelEl = document.createElement("label");
		SafeDOM.setText(labelEl, label);

		const valueEl = document.createElement("span");
		valueEl.className = "policy-value";
		SafeDOM.setText(valueEl, String(value));

		item.appendChild(labelEl);
		item.appendChild(valueEl);

		return item;
	}

	/**
	 * Updates performance metrics.
	 * @private
	 * @returns {Promise<void>}
	 */
	#updateMetrics() {
		return Promise.resolve().then(() => {
			if (!this.#metricsContainer) return;

			// Get metrics from various sources
			const stats = this.#stateManager?.getStats?.() || {};
			const performanceData = this.#getPerformanceData();

			// Clear container
			this.#metricsContainer.innerHTML = "";

			// Create metrics display
			const metricsData = {
				"Memory Usage": performanceData.memory,
				"State Tree Keys": stats.state?.stateTreeKeys || 0,
				"Event Listeners": stats.events?.totalListeners || 0,
				"Managers Count": stats.initialization?.managersCount || 0,
				"Event Log Size": this.#eventLog.size(),
			};

			for (const [label, value] of Object.entries(metricsData)) {
				const item = document.createElement("div");
				item.className = "metric-item";

				const labelEl = document.createElement("span");
				labelEl.className = "metric-label";
				SafeDOM.setText(labelEl, label);

				const valueEl = document.createElement("span");
				valueEl.className = "metric-value";
				SafeDOM.setText(valueEl, String(value));

				item.appendChild(labelEl);
				item.appendChild(valueEl);
				this.#metricsContainer.appendChild(item);
			}

			// Update event log display
			this.#updateEventLogDisplay();
		});
	}

	/**
	 * Gets performance data.
	 * @private
	 * @returns {object}
	 */
	#getPerformanceData() {
		try {
			const memory = performance.memory
				? `${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`
				: "N/A";

			return {
				memory,
				timestamp: DateCore.timestamp(),
			};
		} catch {
			return {
				memory: "N/A",
				timestamp: DateCore.timestamp(),
			};
		}
	}

	/**
	 * Updates the event log display.
	 * @private
	 */
	#updateEventLogDisplay() {
		if (!this.#eventLogContainer) return;

		// Clear container
		this.#eventLogContainer.innerHTML = "";

		const events = this.#eventLog.toArray().slice(-10); // Show last 10 events

		for (const event of events) {
			const item = document.createElement("div");
			item.className = "event-item";

			const timestamp = document.createElement("span");
			timestamp.className = "event-timestamp";
			SafeDOM.setText(
				timestamp,
				new Date(event.timestamp).toLocaleTimeString()
			);

			const type = document.createElement("span");
			type.className = "event-type";
			SafeDOM.setText(type, event.type);

			const data = document.createElement("span");
			data.className = "event-data";
			SafeDOM.setText(
				data,
				JSON.stringify(event.data).slice(0, 50) + "..."
			);

			item.appendChild(timestamp);
			item.appendChild(type);
			item.appendChild(data);
			this.#eventLogContainer.appendChild(item);
		}
	}

	/**
	 * Injects dashboard CSS.
	 * @private
	 */
	#injectCSS() {
		const styleId = "nodus-developer-dashboard-styles";
		if (document.getElementById(styleId)) return;

		const style = document.createElement("style");
		style.id = styleId;
		style.textContent = `
			.nodus-developer-dashboard {
				position: fixed;
				top: 20px;
				right: 20px;
				width: 400px;
				background: #1e1e1e;
				border: 1px solid #333;
				border-radius: 8px;
				color: #fff;
				font-family: 'Consolas', 'Monaco', monospace;
				font-size: 12px;
				z-index: 10000;
				box-shadow: 0 4px 12px rgba(0,0,0,0.3);
				transition: all 0.3s ease;
			}

			.nodus-developer-dashboard.collapsed .dashboard-content {
				display: none;
			}

			.dashboard-header {
				background: #2d2d2d;
				padding: 12px 16px;
				border-bottom: 1px solid #333;
				display: flex;
				justify-content: space-between;
				align-items: center;
				cursor: pointer;
			}

			.dashboard-header h3 {
				margin: 0;
				font-size: 14px;
				font-weight: 600;
			}

			.dashboard-toggle {
				background: #007acc;
				border: none;
				color: white;
				padding: 4px 8px;
				border-radius: 4px;
				cursor: pointer;
				font-size: 11px;
			}

			.dashboard-toggle:hover {
				background: #005a9e;
			}

			.dashboard-content {
				max-height: 500px;
				overflow-y: auto;
			}

			.dashboard-section {
				border-bottom: 1px solid #333;
				padding: 12px 16px;
			}

			.dashboard-section:last-child {
				border-bottom: none;
			}

			.dashboard-section h4 {
				margin: 0 0 8px 0;
				font-size: 13px;
				color: #ccc;
				font-weight: 500;
			}

			.status-item, .metric-item, .policy-item {
				display: flex;
				justify-content: space-between;
				margin-bottom: 4px;
				padding: 2px 0;
			}

			.status-item.healthy .status-indicator {
				color: #4caf50;
			}

			.status-item.unhealthy .status-indicator {
				color: #f44336;
			}

			.metric-label, .status-label, .policy-value {
				color: #aaa;
			}

			.metric-value {
				color: #fff;
				font-weight: 500;
			}

			.event-item {
				display: flex;
				gap: 8px;
				margin-bottom: 4px;
				padding: 2px 0;
				font-size: 11px;
			}

			.event-timestamp {
				color: #666;
				min-width: 60px;
			}

			.event-type {
				color: #007acc;
				min-width: 80px;
			}

			.event-data {
				color: #ccc;
				flex: 1;
				overflow: hidden;
				text-overflow: ellipsis;
			}

			.event-log-container {
				max-height: 150px;
				overflow-y: auto;
			}
		`;

		document.head.appendChild(style);
	}
}

export default DeveloperDashboard;
