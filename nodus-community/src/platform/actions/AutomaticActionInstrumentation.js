// AutomaticActionInstrumentation.js
// Thin wrapper that adapts the generic AutomaticInstrumentation for
// ActionDispatcher-specific contexts. Keeps a small, stable surface so the
// ActionDispatcher doesn't need to know policy engine details.

import AutomaticInstrumentation from "@platform/observability/AutomaticInstrumentation.js";

export class AutomaticActionInstrumentation {
	constructor(policyEngine, stateManager) {
		this.impl = new AutomaticInstrumentation(policyEngine, stateManager);
	}

	instrument(actionType, payload = {}, ctx = {}) {
		const context = {
			component: "ui",
			operation: "dispatch",
			actionType,
			classification: ctx.classification || "public",
			performanceState: ctx.performanceState || "normal",
			tenantId: payload.tenantId || ctx.tenantId,
			data: payload,
		};

		// Return the instrumentation promise without marking this method async.
		// Callers (e.g., ActionDispatcher) should handle or await the promise as needed.
		return this.impl.instrumentOperation(context);
	}
}

export default AutomaticActionInstrumentation;
