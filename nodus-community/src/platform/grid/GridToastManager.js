/**
 * @file GridToastManager.js
 * @description Simplified toast notification system for community release.
 * Removed enterprise dependencies, uses Rust backend via ActionDispatcher.
 */
import { ActionDispatcher } from "@platform/ActionDispatcher.js";

/**
 * @class GridToastManager
 * @classdesc Lightweight toast notification system for user feedback.
 * Simplified from enterprise version to use ActionDispatcher proxy pattern.
 */
export class GridToastManager {
	/** @private @type {ActionDispatcher} */
	#actionDispatcher;
	/** @private @type {Map<string, HTMLElement>} */
	#toasts = new Map();
	/** @private @type {HTMLElement|null} */
	#container = null;
	/** @private @type {number} */
	#maxToasts = 5;
	/** @private @type {number} */
	#defaultDuration = 3000;

	/**
	 * Creates a GridToastManager instance
	 */
	constructor() {
		this.#actionDispatcher = new ActionDispatcher();
		this.#setupContainer();
	}

	/**
	 * Initialize the toast manager
	 * @public
	 * @returns {Promise<void>}
	 */
	async initialize() {
		// Notify Rust backend that toast manager is ready
		await this.#actionDispatcher.dispatch("ui.toast.manager.initialized", {
			maxToasts: this.#maxToasts,
			defaultDuration: this.#defaultDuration,
		});
	}

	/**
	 * Setup toast container in DOM
	 * @private
	 */
	#setupContainer() {
		this.#container = document.getElementById("toast-container");

		if (!this.#container) {
			this.#container = document.createElement("div");
			this.#container.id = "toast-container";
			this.#container.className = "nodus-toast-container";
			this.#container.setAttribute("aria-live", "polite");
			this.#container.setAttribute("aria-label", "Notifications");

			// Position container
			Object.assign(this.#container.style, {
				position: "fixed",
				top: "20px",
				right: "20px",
				zIndex: "10000",
				pointerEvents: "none",
				maxWidth: "350px",
			});

			document.body.appendChild(this.#container);
		}

		// Add base styles if not present
		if (!document.head.querySelector("#toast-styles")) {
			this.#addStyles();
		}
	}

	/**
	 * Add toast styles to document
	 * @private
	 */
	#addStyles() {
		const style = document.createElement("style");
		style.id = "toast-styles";
		style.textContent = `
            .nodus-toast {
                padding: 12px 16px;
                border-radius: 8px;
                margin-bottom: 8px;
                font-size: 14px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                transform: translateX(100%);
                opacity: 0;
                transition: all 0.3s ease;
                pointer-events: auto;
                cursor: pointer;
                position: relative;
                display: flex;
                align-items: center;
                gap: 8px;
                max-width: 100%;
                word-wrap: break-word;
            }
            
            .nodus-toast.show {
                transform: translateX(0);
                opacity: 1;
            }
            
            .nodus-toast-success {
                background: #d1fae5;
                color: #065f46;
                border-left: 4px solid #10b981;
            }
            
            .nodus-toast-error {
                background: #fee2e2;
                color: #991b1b;
                border-left: 4px solid #ef4444;
            }
            
            .nodus-toast-warning {
                background: #fef3c7;
                color: #92400e;
                border-left: 4px solid #f59e0b;
            }
            
            .nodus-toast-info {
                background: #dbeafe;
                color: #1e40af;
                border-left: 4px solid #3b82f6;
            }
            
            .nodus-toast-close {
                position: absolute;
                top: 8px;
                right: 8px;
                background: none;
                border: none;
                color: inherit;
                font-size: 16px;
                cursor: pointer;
                opacity: 0.7;
                line-height: 1;
                padding: 2px;
            }
            
            .nodus-toast-close:hover {
                opacity: 1;
            }
        `;
		document.head.appendChild(style);
	}

	/**
	 * Show a toast notification
	 * @private
	 * @param {string} message - Toast message
	 * @param {string} type - Toast type (success, error, warning, info)
	 * @param {number|null} duration - Duration in milliseconds
	 * @returns {Promise<string>} Toast ID
	 */
	async #showToast(message, type = "info", duration = null) {
		const id = `toast-${Date.now()}-${Math.random()
			.toString(36)
			.substr(2, 9)}`;
		const actualDuration = duration || this.#defaultDuration;

		// Create toast element
		const toast = this.#createToastElement(id, message, type);

		// Add to container
		this.#container.appendChild(toast);
		this.#toasts.set(id, toast);

		// Enforce max toasts limit
		this.#enforceMaxToasts();

		// Show with animation
		requestAnimationFrame(() => {
			toast.classList.add("show");
		});

		// Auto-remove after duration
		setTimeout(() => {
			this.#removeToast(id);
		}, actualDuration);

		// Notify Rust backend
		await this.#actionDispatcher.dispatch("ui.toast.shown", {
			id,
			message,
			type,
			duration: actualDuration,
		});

		return id;
	}

	/**
	 * Create toast DOM element
	 * @private
	 * @param {string} id - Toast ID
	 * @param {string} message - Toast message
	 * @param {string} type - Toast type
	 * @returns {HTMLElement} Toast element
	 */
	#createToastElement(id, message, type) {
		const toast = document.createElement("div");
		toast.className = `nodus-toast nodus-toast-${type}`;
		toast.dataset.toastId = id;
		toast.setAttribute("role", "status");
		toast.setAttribute("aria-atomic", "true");

		// Add icon based on type
		const icon = this.#getIcon(type);
		if (icon) {
			const iconSpan = document.createElement("span");
			iconSpan.textContent = icon;
			iconSpan.style.fontSize = "16px";
			toast.appendChild(iconSpan);
		}

		// Add message
		const messageSpan = document.createElement("span");
		messageSpan.textContent = message;
		messageSpan.style.flex = "1";
		toast.appendChild(messageSpan);

		// Add close button
		const closeBtn = document.createElement("button");
		closeBtn.className = "nodus-toast-close";
		closeBtn.textContent = "×";
		closeBtn.setAttribute("aria-label", "Close notification");
		closeBtn.addEventListener("click", () => this.#removeToast(id));
		toast.appendChild(closeBtn);

		// Click to dismiss (except close button)
		toast.addEventListener("click", (e) => {
			if (e.target !== closeBtn) {
				this.#removeToast(id);
			}
		});

		return toast;
	}

	/**
	 * Get icon for toast type
	 * @private
	 * @param {string} type - Toast type
	 * @returns {string} Icon character
	 */
	#getIcon(type) {
		const icons = {
			success: "✅",
			error: "❌",
			warning: "⚠️",
			info: "ℹ️",
		};
		return icons[type] || icons.info;
	}

	/**
	 * Remove toast from DOM
	 * @private
	 * @param {string} id - Toast ID
	 */
	#removeToast(id) {
		const toast = this.#toasts.get(id);
		if (!toast) return;

		// Animate out
		toast.classList.remove("show");

		// Remove from DOM after animation
		setTimeout(() => {
			if (toast.parentNode) {
				toast.parentNode.removeChild(toast);
			}
			this.#toasts.delete(id);
		}, 300);
	}

	/**
	 * Enforce maximum number of toasts
	 * @private
	 */
	#enforceMaxToasts() {
		const toastIds = Array.from(this.#toasts.keys());
		if (toastIds.length > this.#maxToasts) {
			// Remove oldest toasts
			const toRemove = toastIds.slice(
				0,
				toastIds.length - this.#maxToasts
			);
			toRemove.forEach((id) => this.#removeToast(id));
		}
	}

	/**
	 * Show success toast
	 * @public
	 * @param {string} message - Message to display
	 * @param {number|null} [duration] - Duration in milliseconds
	 * @returns {Promise<string>} Toast ID
	 */
	async success(message, duration = null) {
		return this.#showToast(message, "success", duration);
	}

	/**
	 * Show error toast
	 * @public
	 * @param {string} message - Message to display
	 * @param {number|null} [duration] - Duration in milliseconds
	 * @returns {Promise<string>} Toast ID
	 */
	async error(message, duration = null) {
		return this.#showToast(message, "error", duration);
	}

	/**
	 * Show warning toast
	 * @public
	 * @param {string} message - Message to display
	 * @param {number|null} [duration] - Duration in milliseconds
	 * @returns {Promise<string>} Toast ID
	 */
	async warning(message, duration = null) {
		return this.#showToast(message, "warning", duration);
	}

	/**
	 * Show info toast
	 * @public
	 * @param {string} message - Message to display
	 * @param {number|null} [duration] - Duration in milliseconds
	 * @returns {Promise<string>} Toast ID
	 */
	async info(message, duration = null) {
		return this.#showToast(message, "info", duration);
	}

	/**
	 * Clear all toasts
	 * @public
	 */
	clear() {
		Array.from(this.#toasts.keys()).forEach((id) => this.#removeToast(id));
	}

	/**
	 * Dispose of toast manager
	 * @public
	 */
	dispose() {
		this.clear();
		if (this.#container?.parentNode) {
			this.#container.parentNode.removeChild(this.#container);
		}
	}

	// Static method for quick access
	static async show(message, type = "info", duration = null) {
		if (!window._nodusToastManager) {
			window._nodusToastManager = new GridToastManager();
			await window._nodusToastManager.initialize();
		}
		return window._nodusToastManager[type]
			? await window._nodusToastManager[type](message, duration)
			: await window._nodusToastManager.info(message, duration);
	}
}

export default GridToastManager;
