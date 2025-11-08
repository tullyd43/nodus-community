// DeveloperDashboard and UI feature components
import { DeveloperDashboard } from "@features/dashboard/DeveloperDashboard.js";
import { SystemBootstrap } from "@platform/bootstrap/SystemBootstrap.js";

import StateUIBridge from "@platform/state/StateUIBridge.js";

import { AppConfig } from "./environment.config.js";

import SecurityExplainer from "@/features/security/SecurityExplainer.js";
import { ActionDispatcher } from "@platform/actions/ActionDispatcher.js";
import BindEngine from "@/features/ui/BindEngine.js";

/**
 * @function bootstrap
 * @description Asynchronously initializes the Nodus application using V8.0 patterns.
 * Everything flows through ActionDispatcher and AsyncOrchestrator.
 */
const _orchestratedBootstrapLogic = async (
	stateManager,
	actionDispatcher,
	orchestrator,
	policies,
	bootstrapDuration
) => {
	// 2. Bootstrap metrics through ActionDispatcher
	await actionDispatcher.dispatch("observability.metrics", {
		type: "bootstrap",
		duration: bootstrapDuration,
		component: "main",
	});

	// 3. Capability mapping through AsyncOrchestrator
	/* PERFORMANCE_BUDGET: 10ms */
	const runner = orchestrator.createRunner("capability_mapping");
	const capabilities = await runner.run(async () => {
		return {
			hasSigner: !!stateManager?.signer,
			hasIndexedDB: !!stateManager?.storage?.ready,
			policies: {
				ui: {
					enable_security_hud: !!policies?.getPolicy(
						"ui",
						"enable_security_hud"
					),
					enable_virtual_list:
						policies?.getPolicy("ui", "enable_virtual_list") ??
						true,
				},
				grid: {
					enable_analytics:
						policies?.getPolicy("grid", "enable_analytics") ?? true,
				},
				security: {
					allow_client_policy_updates: !!policies?.getPolicy(
						"security",
						"allow_client_policy_updates"
					),
					policy_admin_permission:
						policies?.getPolicy(
							"security",
							"policy_admin_permission"
						) || "policy.admin",
				},
			},
		};
	});

	Object.freeze(capabilities.policies.ui);
	Object.freeze(capabilities.policies.grid);
	Object.freeze(capabilities.policies.security);
	Object.freeze(capabilities.policies);
	window.__nodusCapabilities = capabilities;

	// 4. Grid initialization through AsyncOrchestrator
	const gridSystem = stateManager.managers.completeGridSystem;
	if (
		gridSystem &&
		(!gridSystem.isInitialized || !gridSystem.isInitialized())
	) {
		/* PERFORMANCE_BUDGET: 50ms */
		const gridRunner = orchestrator.createRunner("grid_initialization");
		const gridInitDuration = await gridRunner.run(async () => {
			const g0 = performance.now();
			await gridSystem.initialize();
			return performance.now() - g0;
		});

		console.warn(`⏱️ Grid initialized in ${gridInitDuration.toFixed(1)}ms`);

		// Grid metrics through ActionDispatcher
		if (capabilities.policies.grid.enable_analytics) {
			await actionDispatcher.dispatch("observability.metrics", {
				type: "grid_init",
				duration: gridInitDuration,
				component: "grid",
			});
		}
	}

	// 5. Default grid configuration through ActionDispatcher
	const cols = Number(policies?.getPolicy("grid", "default_columns") ?? 24);
	const w = 6,
		h = 4,
		x = Math.max(0, Math.floor((cols - w) / 2)),
		y = 2;
	const defaultConfig = {
		blocks: [
			{
				id: "starter",
				type: "button",
				x,
				y,
				w,
				h,
				constraints: { minW: 2, minH: 2, maxW: cols, maxH: 1000 },
				props: {
					label: "Add Block",
					mode: "modal",
					variant: "primary",
				},
			},
		],
	};

	await actionDispatcher.dispatch("grid.setConfig", {
		config: defaultConfig,
		configId: "dev-default",
		actor: "system",
	});

	// 6. UI binding initialization
	const bindEngine = new BindEngine({ stateManager });
	await bindEngine.start(document);
	stateManager.managers.bindEngine = bindEngine;

	const uiBridge = new StateUIBridge(stateManager);
	uiBridge.attachBindEngine(bindEngine);
	stateManager.managers.stateUIBridge = uiBridge;

	const dispatcher = new ActionDispatcher({
		hybridStateManager: stateManager,
	});
	dispatcher.attach(document);
	stateManager.managers.actionDispatcher = dispatcher;

	// 7. Event bridge configuration through policies
	const bridgeEnabled =
		policies?.getPolicy("ui", "enable_bind_bridge") ??
		!!import.meta.env?.DEV;
	const updateInputs =
		policies?.getPolicy("ui", "bind_bridge_update_inputs") ??
		!!import.meta.env?.DEV;

	if (bridgeEnabled && stateManager.on) {
		uiBridge.enableDomBridge({ root: document, updateInputs });
	} else {
		uiBridge.disableDomBridge();
	}

	// 8. Security HUD through AsyncOrchestrator
	let hud = null;
	const enableHud = capabilities.policies.ui.enable_security_hud;
	if (enableHud) {
		/* PERFORMANCE_BUDGET: 15ms */
		const hudRunner = orchestrator.createRunner("security_hud_init");
		hud = await hudRunner.run(async () => {
			const hudElement = new SecurityExplainer(stateManager);
			hudElement.mount();
			return hudElement;
		});
	}

	// 9. Virtual list through AsyncOrchestrator
	let vlist = null;
	const enableVL = capabilities.policies.ui.enable_virtual_list;
	const container = document.querySelector("#vlist-container");

	if (container && enableVL) {
		/* PERFORMANCE_BUDGET: 20ms */
		const vlistRunner = orchestrator.createRunner("virtual_list_creation");

		const createVirtualList = () => {
			return import("@shared/components/VirtualList.js").then(
				({ default: VirtualList }) => {
					const vlistData = [];
					for (let i = 0; i < 10000; i++) {
						vlistData.push({
							id: `item-${i}`,
							title: `Virtual Item ${i}`,
							entity_type:
								i % 3 === 0
									? "document"
									: i % 3 === 1
										? "user"
										: "task",
						});
					}

					vlist = new VirtualList({
						container,
						itemHeight: 50,
						totalItems: vlistData.length,
						renderItem: (el, i) => {
							const row = vlistData[i];
							if (!row) return;
							el.className = "vlist-item";
							const titleDiv = document.createElement("div");
							titleDiv.className = "title";
							titleDiv.textContent = row?.title ?? row?.id ?? i;
							const metaDiv = document.createElement("div");
							metaDiv.className = "meta";
							metaDiv.textContent = row?.entity_type ?? "";
							el.appendChild(titleDiv);
							el.appendChild(metaDiv);
						},
					});

					vlist.mount();
					vlist.refresh();
					window.__vlistData = vlistData;
					return vlist;
				}
			);
		};

		if ("IntersectionObserver" in window) {
			const io = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							io.unobserve(container);
							io.disconnect();

							// Now we can handle the promise properly
							vlistRunner
								.run(createVirtualList)
								.catch(console.error);
							break;
						}
					}
				},
				{ root: null, threshold: 0.1 }
			);
			io.observe(container);
		} else {
			vlist = await vlistRunner.run(createVirtualList);
		}
	}

	console.warn("✅ Complete Grid System Initialized. Application is ready.");
	console.warn("%cNODUS READY", "color:#80ffaa;font-weight:bold");

	// 10. Developer dashboard through AsyncOrchestrator
	let dashboard = null;
	const isLocalDev =
		import.meta.env?.DEV || window.location.hostname === "localhost";
	const securityManager = stateManager.managers.securityManager;
	const subject = securityManager?.getSubject() || {};

	const policyEnabled = policies?.getPolicy(
		"system",
		"enable_developer_dashboard"
	);
	const featureEnabled =
		typeof policyEnabled === "boolean" ? policyEnabled : isLocalDev;

	const requiredPerm =
		policies?.getPolicy("system", "developer_dashboard_permission") ||
		"dev.dashboard.view";
	const hasPermission = Array.isArray(subject?.permissions)
		? subject.permissions.includes(requiredPerm)
		: subject?.role === "admin";

	if (featureEnabled && hasPermission) {
		/* PERFORMANCE_BUDGET: 30ms */
		const dashRunner = orchestrator.createRunner(
			"dashboard_initialization"
		);
		const dashDuration = await dashRunner.run(async () => {
			const d0 = performance.now();
			dashboard = new DeveloperDashboard(document.body, { stateManager });
			return performance.now() - d0;
		});

		await actionDispatcher.dispatch("observability.metrics", {
			type: "bootstrap.stage",
			stage: "dashboard",
			duration: dashDuration,
			component: "dashboard",
		});
	}

	// 11. Global namespace exposure
	const isDev =
		import.meta.env?.DEV || window.location.hostname === "localhost";
	const exposeGlobal = policies?.getPolicy(
		"security",
		"expose_global_namespace"
	);
	const shouldExpose =
		typeof exposeGlobal === "boolean" ? exposeGlobal : isDev;

	if (shouldExpose) {
		const exposed = {
			state: stateManager,
			hud,
			vlist,
			dashboard,
			uiBridge,
			capabilities,
		};
		Object.freeze(exposed);
		Object.defineProperty(window, "Nodus", {
			value: exposed,
			configurable: false,
			enumerable: false,
			writable: false,
		});
	}

	// 12. HMR cleanup
	if (import.meta.hot) {
		import.meta.hot.dispose(() => {
			vlist?.unmount?.();
			hud?.dispose?.();
			uiBridge?.dispose?.();
			window.nodusApp?.dispose?.();
			uiBridge.disableDomBridge();
			stateManager?.managers?.forensicLogger?.cleanup?.();
			delete window.Nodus;
		});
	}
};

const bootstrap = async () => {
	if (window.__bootstrappingNodus) return;
	window.__bootstrappingNodus = true;

	if (window.nodusApp) {
		console.warn(
			"[Nodus] Application already initialized. Skipping bootstrap."
		);
		return;
	}

	console.warn("🚀 Nodus Grid Data Layer Test Starting...");

	// Configure CDS transport
	AppConfig.cdsTransport = function delegatedTransport(url, init) {
		const native = globalThis.__NODUS_NATIVE_FETCH__;
		if (typeof native === "function") return native(url, init);
		return Promise.reject(new Error("No native CDS transport available"));
	};

	// 1. SystemBootstrap initialization
	const bootstrapApp = new SystemBootstrap({ ...AppConfig });
	const t0 = performance.now();
	const stateManager = await bootstrapApp.initialize({
		userId: "demo-user",
		clearanceLevel: "internal",
	});
	const bootstrapDuration = performance.now() - t0;

	window.nodusApp = stateManager;
	window.appViewModel = { hybridStateManager: stateManager };

	// Get core managers
	const actionDispatcher = stateManager.managers.actionDispatcher;
	const orchestrator = stateManager.managers.asyncOrchestrator;
	const policies = stateManager.managers.policies;

	// Now, orchestrate the rest of the bootstrap logic
	await orchestrator.run(
		// Pass a synchronous function that returns a Promise (no async/await inside)
		() => {
			return _orchestratedBootstrapLogic(
				stateManager,
				actionDispatcher,
				orchestrator,
				policies,
				bootstrapDuration
			);
		},
		{
			label: "application.bootstrap",
			classification: "SECRET",
			timeout: 120000, // Increased timeout for full bootstrap
		}
	);
};

// Global error forwarding through ActionDispatcher
const policies = window.nodusApp?.managers?.policies;
const reportErrors =
	policies?.getPolicy("security", "report_unhandled_errors") ??
	!!import.meta.env?.DEV;

if (reportErrors) {
	const forward = (errObj) => {
		// Synchronous function that handles the orchestrated error reporting
		const orchestrator = window.nodusApp?.managers?.asyncOrchestrator;
		if (orchestrator) {
			orchestrator
				.run(
					() => {
						// Return a Promise chain (no async/await inside) so the orchestrator
						// can instrument and observe the operation as required.
						return Promise.resolve().then(() => {
							const actionDispatcher =
								window.nodusApp?.managers?.actionDispatcher;
							if (actionDispatcher) {
								// actionDispatcher.dispatch returns a Promise — return it directly
								return actionDispatcher.dispatch(
									"observability.error",
									{
										type: "unhandled_error",
										message:
											errObj?.reason?.message ||
											errObj?.message ||
											String(errObj?.reason || errObj),
										error:
											errObj?.error ||
											errObj?.reason ||
											errObj,
										component: "global_error_handler",
									}
								);
							}
							return Promise.resolve();
						});
					},
					{
						label: "global_error_forwarding",
						classification: "CONFIDENTIAL",
						timeout: 5000,
					}
				)
				.catch((error) => {
					console.error(
						"[GlobalErrorHandler] Failed to dispatch error:",
						error
					);
				});
		} else {
			// Fallback if orchestrator is not available (e.g., during very early bootstrap)
			console.error(
				"[GlobalErrorHandler] Orchestrator not available. Unhandled error:",
				errObj
			);
		}
	};
	window.addEventListener("error", forward);
	window.addEventListener("unhandledrejection", forward);
}

bootstrap().finally(async () => {
	const orchestrator = window.nodusApp?.managers?.asyncOrchestrator;
	if (orchestrator) {
		await orchestrator.run(
			() => {
				window.__bootstrappingNodus = false;
			},
			{
				label: "bootstrap_cleanup",
				classification: "PUBLIC",
				timeout: 1000,
			}
		);
	} else {
		window.__bootstrappingNodus = false;
	}
});
