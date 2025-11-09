/**
 * @file AsyncOrchestrator.js
 * @description Lightweight proxy to Rust backend async orchestrator via Tauri invoke.
 * Replaces enterprise AsyncOrchestrator with simple proxy pattern.
 */
// Guarded dynamic invoke like ActionDispatcher does — avoid top-level import
async function safeInvoke(cmd, args) {
	const tauriIndicator =
		typeof globalThis !== "undefined" &&
		(globalThis.__TAURI__ ||
			globalThis.__TAURI_INVOKE ||
			globalThis.__TAURI_INVOKE__);

	if (!tauriIndicator) {
		console.debug(
			"[AsyncOrchestrator.safeInvoke] Tauri not available:",
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
		console.warn(
			"[AsyncOrchestrator.safeInvoke] invoke failed, offline:",
			e
		);
		return null;
	}

	return null;
}

/**
 * @class AsyncOrchestrator
 * @classdesc Simplified proxy that forwards async operations to Rust backend
 */
export class AsyncOrchestrator {
	/**
	 * Creates an AsyncOrchestrator proxy
	 */
	constructor() {
		// Simple proxy - no complex state needed
	}

	/**
	 * Create an operation runner for async operations
	 * @public
	 * @param {string} operationName - Name of the operation
	 * @param {object} options - Operation options
	 * @returns {OperationRunner} Runner instance
	 */
	createRunner(operationName, options = {}) {
		return new OperationRunner(operationName, options);
	}

	/**
	 * Run an async operation directly
	 * @public
	 * @param {Function} operation - Async function to run
	 * @param {object} context - Operation context
	 * @returns {Promise<any>} Operation result
	 */
	async run(operation, context = {}) {
		try {
			console.log(`[AsyncOrchestrator] Running operation:`, context);

			// For simple operations, just run them directly
			const result = await operation(context);

			// Optionally notify Rust backend of completion
			try {
				await safeInvoke("operation_completed", {
					operationType: context.operationType || "generic",
					success: true,
					metadata: context,
				});
			} catch (error) {
				// Non-critical - don't fail the operation if logging fails
				console.warn(
					"[AsyncOrchestrator] Failed to log operation completion:",
					error
				);
			}

			return result;
		} catch (error) {
			// Log error to Rust backend
			try {
				await safeInvoke("operation_completed", {
					operationType: context.operationType || "generic",
					success: false,
					error: error.message,
					metadata: context,
				});
			} catch {
				// Ignore logging errors
			}

			throw error;
		}
	}

	/**
	 * Run multiple operations in parallel
	 * @public
	 * @param {Function[]} operations - Array of async functions
	 * @param {object} context - Shared context
	 * @returns {Promise<any[]>} Array of results
	 */
	async runAll(operations, context = {}) {
		return Promise.all(operations.map((op) => this.run(op, context)));
	}
}

/**
 * @class OperationRunner
 * @classdesc Handles individual async operations with context
 */
class OperationRunner {
	/** @private @type {string} */
	#operationName;
	/** @private @type {object} */
	#options;

	/**
	 * Creates an OperationRunner
	 * @param {string} operationName - Name of the operation
	 * @param {object} options - Operation options
	 */
	constructor(operationName, options = {}) {
		this.#operationName = operationName;
		this.#options = {
			timeout: 30000, // 30 second default timeout
			retries: 0,
			...options,
		};
	}

	/**
	 * Run the operation with automatic context and error handling
	 * @public
	 * @param {Function} operation - Async function to execute
	 * @returns {Promise<any>} Operation result
	 */
	async run(operation) {
		const context = {
			operationName: this.#operationName,
			operationType: this.#operationName,
			startTime: Date.now(),
			...this.#options,
		};

		try {
			console.log(`[OperationRunner] Starting: ${this.#operationName}`);

			// Run with timeout if specified
			let result;
			if (this.#options.timeout > 0) {
				result = await Promise.race([
					operation(context),
					new Promise((_, reject) => {
						setTimeout(
							() =>
								reject(
									new Error(
										`Operation ${
											this.#operationName
										} timed out`
									)
								),
							this.#options.timeout
						);
					}),
				]);
			} else {
				result = await operation(context);
			}

			context.endTime = Date.now();
			context.duration = context.endTime - context.startTime;

			console.log(
				`[OperationRunner] Completed: ${this.#operationName} in ${
					context.duration
				}ms`
			);

			// Log success to Rust backend
			try {
				await safeInvoke("operation_completed", {
					operationType: this.#operationName,
					success: true,
					duration: context.duration,
					metadata: context,
				});
			} catch {
				// Non-critical
			}

			return result;
		} catch (error) {
			context.endTime = Date.now();
			context.duration = context.endTime - context.startTime;
			context.error = error.message;

			console.error(
				`[OperationRunner] Failed: ${this.#operationName}:`,
				error
			);

			// Log failure to Rust backend
			try {
				await safeInvoke("operation_completed", {
					operationType: this.#operationName,
					success: false,
					error: error.message,
					duration: context.duration,
					metadata: context,
				});
			} catch {
				// Non-critical
			}

			throw error;
		}
	}
}

export { OperationRunner };
export default AsyncOrchestrator;
