/**
 * @file Toast.js
 * @description Atomic toast notification component following same pattern as Button, Container
 * General purpose system toast with ActionDispatcher integration
 */

import { AtomicElement } from "./AtomicElements.js";

export class Toast extends AtomicElement {
	constructor(props = {}) {
		super("div", {
			...props,
			className: `nodus-toast ${props.className || ""}`,
			"data-component": "toast",
			"data-toast-id": props.toastId || props.id || crypto.randomUUID(),
		});

		// Toast properties
		this.toastId = this.element.dataset.toastId;
		this.message = props.message || "";
		this.type = props.type || "info"; // success, error, warning, info
		this.duration = props.duration || 3000;
		this.closable = props.closable !== false;
		this.autoRemove = props.autoRemove !== false;
		this.actionDispatcher =
			props.actionDispatcher || window.__nodus?.actionDispatcher;

		// Setup component
		this.setupToastStyles();
		this.buildToastContent();
		this.setupToastInteractions();
		this.startAutoRemoval();
		this.notifyBackend();
	}

	setupToastStyles() {
		const baseStyles = {
			padding: "12px 16px",
			borderRadius: "var(--radius-md)",
			marginBottom: "var(--space-sm)",
			fontSize: "14px",
			boxShadow: "var(--shadow-lg)",
			transform: "translateX(100%)",
			opacity: "0",
			transition: "all var(--transition-medium)",
			cursor: "pointer",
			position: "relative",
			display: "flex",
			alignItems: "center",
			gap: "var(--space-sm)",
			maxWidth: "100%",
			wordWrap: "break-word",
			fontFamily: "var(--font-family)",
		};

		// Type-specific styling
		const typeStyles = {
			success: {
				background: "#d1fae5",
				color: "#065f46",
				borderLeft: "4px solid #10b981",
			},
			error: {
				background: "#fee2e2",
				color: "#991b1b",
				borderLeft: "4px solid #ef4444",
			},
			warning: {
				background: "#fef3c7",
				color: "#92400e",
				borderLeft: "4px solid #f59e0b",
			},
			info: {
				background: "#dbeafe",
				color: "#1e40af",
				borderLeft: "4px solid #3b82f6",
			},
		};

		Object.assign(this.element.style, baseStyles);
		Object.assign(
			this.element.style,
			typeStyles[this.type] || typeStyles.info
		);

		// Add ARIA attributes
		this.element.setAttribute("role", "status");
		this.element.setAttribute("aria-atomic", "true");
		this.element.setAttribute("aria-live", "polite");
	}

	buildToastContent() {
		// Clear existing content
		this.element.innerHTML = "";

		// Add icon
		const icon = this.getTypeIcon();
		if (icon) {
			const iconElement = document.createElement("span");
			iconElement.textContent = icon;
			iconElement.style.fontSize = "16px";
			iconElement.style.flexShrink = "0";
			this.element.appendChild(iconElement);
		}

		// Add message
		const messageElement = document.createElement("span");
		messageElement.textContent = this.message;
		messageElement.style.flex = "1";
		messageElement.style.lineHeight = "1.4";
		this.element.appendChild(messageElement);

		// Add close button if closable
		if (this.closable) {
			const closeButton = document.createElement("button");
			closeButton.className = "toast-close";
			closeButton.textContent = "×";
			closeButton.setAttribute("aria-label", "Close notification");
			closeButton.style.cssText = `
				background: none;
				border: none;
				color: inherit;
				font-size: 18px;
				cursor: pointer;
				opacity: 0.7;
				line-height: 1;
				padding: 4px;
				border-radius: var(--radius-sm);
				transition: all var(--transition-fast);
				flex-shrink: 0;
			`;

			closeButton.addEventListener("mouseenter", () => {
				closeButton.style.opacity = "1";
				closeButton.style.background = "rgba(0, 0, 0, 0.1)";
			});

			closeButton.addEventListener("mouseleave", () => {
				closeButton.style.opacity = "0.7";
				closeButton.style.background = "transparent";
			});

			closeButton.addEventListener("click", (e) => {
				e.stopPropagation();
				this.close();
			});

			this.element.appendChild(closeButton);
		}
	}

	setupToastInteractions() {
		// Click to close (except on close button)
		this.element.addEventListener("click", (e) => {
			if (!e.target.closest(".toast-close")) {
				this.close();
			}
		});

		// Show animation after creation
		setTimeout(() => {
			this.show();
		}, 50);
	}

	startAutoRemoval() {
		if (this.autoRemove && this.duration > 0) {
			this.autoRemoveTimer = setTimeout(() => {
				this.close();
			}, this.duration);
		}
	}

	async notifyBackend() {
		if (this.actionDispatcher) {
			try {
				await this.actionDispatcher.dispatch("ui.toast.shown", {
					id: this.toastId,
					message: this.message,
					type: this.type,
					duration: this.duration,
					timestamp: new Date().toISOString(),
				});
			} catch (error) {
				console.warn("[Toast] Failed to notify backend:", error);
			}
		}
	}

	getTypeIcon() {
		const icons = {
			success: "✅",
			error: "❌",
			warning: "⚠️",
			info: "ℹ️",
		};
		return icons[this.type] || icons.info;
	}

	// Public API methods
	show() {
		this.element.style.transform = "translateX(0)";
		this.element.style.opacity = "1";
		this.element.classList.add("toast-visible");

		// Dispatch show event
		this.element.dispatchEvent(
			new CustomEvent("nodus:toast:shown", {
				bubbles: true,
				detail: { toastId: this.toastId, toast: this },
			})
		);
	}

	close() {
		// Clear auto-remove timer
		if (this.autoRemoveTimer) {
			clearTimeout(this.autoRemoveTimer);
		}

		// Animate out
		this.element.style.transform = "translateX(100%)";
		this.element.style.opacity = "0";
		this.element.classList.remove("toast-visible");

		// Dispatch close event
		this.element.dispatchEvent(
			new CustomEvent("nodus:toast:closing", {
				bubbles: true,
				detail: { toastId: this.toastId, toast: this },
			})
		);

		// Remove from DOM after animation
		setTimeout(() => {
			this.destroy();
		}, 300);
	}

	updateMessage(newMessage) {
		this.message = newMessage;
		const messageElement = this.element.querySelector(
			"span:not(.toast-close)"
		);
		if (messageElement) {
			messageElement.textContent = newMessage;
		}
	}

	// Getters
	get id() {
		return this.toastId;
	}

	get isVisible() {
		return this.element.classList.contains("toast-visible");
	}
}

/**
 * @class ToastManager
 * @classdesc Manages multiple toast notifications with ActionDispatcher integration
 */
export class ToastManager {
	constructor(props = {}) {
		this.maxToasts = props.maxToasts || 5;
		this.defaultDuration = props.defaultDuration || 3000;
		this.position = props.position || "top-right"; // top-right, top-left, bottom-right, bottom-left
		this.actionDispatcher =
			props.actionDispatcher || window.__nodus?.actionDispatcher;

		this.toasts = new Map();
		this.container = null;

		this.setupContainer();
		this.addStyles();
		this.initialize();
	}

	setupContainer() {
		// Find existing container or create new one
		this.container = document.querySelector(".nodus-toast-container");

		if (!this.container) {
			this.container = document.createElement("div");
			this.container.className = "nodus-toast-container";
			this.container.setAttribute("aria-live", "polite");
			this.container.setAttribute("aria-label", "Notifications");

			// Position based on setting
			const positions = {
				"top-right": { top: "20px", right: "20px" },
				"top-left": { top: "20px", left: "20px" },
				"bottom-right": { bottom: "20px", right: "20px" },
				"bottom-left": { bottom: "20px", left: "20px" },
			};

			Object.assign(this.container.style, {
				position: "fixed",
				zIndex: "10000",
				pointerEvents: "none",
				maxWidth: "400px",
				...positions[this.position],
			});

			document.body.appendChild(this.container);
		}
	}

	addStyles() {
		if (document.head.querySelector("#nodus-toast-styles")) return;

		const style = document.createElement("style");
		style.id = "nodus-toast-styles";
		style.textContent = `
			.nodus-toast-container {
				display: flex;
				flex-direction: column;
				gap: var(--space-sm, 8px);
			}
			
			.nodus-toast {
				pointer-events: auto;
			}
			
			.nodus-toast.toast-visible {
				animation: toastSlideIn 0.3s ease;
			}
			
			@keyframes toastSlideIn {
				from {
					transform: translateX(100%);
					opacity: 0;
				}
				to {
					transform: translateX(0);
					opacity: 1;
				}
			}
		`;
		document.head.appendChild(style);
	}

	async initialize() {
		if (this.actionDispatcher) {
			try {
				await this.actionDispatcher.dispatch(
					"ui.toast.manager.initialized",
					{
						maxToasts: this.maxToasts,
						defaultDuration: this.defaultDuration,
						position: this.position,
					}
				);
			} catch (error) {
				console.warn(
					"[ToastManager] Backend initialization failed:",
					error
				);
			}
		}
	}

	// Public API methods
	show(message, type = "info", options = {}) {
		const toast = new Toast({
			message,
			type,
			duration: options.duration || this.defaultDuration,
			closable: options.closable !== false,
			autoRemove: options.autoRemove !== false,
			actionDispatcher: this.actionDispatcher,
			...options,
		});

		// Add to container
		toast.mount(this.container);
		this.toasts.set(toast.id, toast);

		// Enforce max toasts
		this.enforceMaxToasts();

		// Listen for close events
		toast.element.addEventListener("nodus:toast:closing", () => {
			this.toasts.delete(toast.id);
		});

		return toast;
	}

	success(message, options = {}) {
		return this.show(message, "success", options);
	}

	error(message, options = {}) {
		return this.show(message, "error", options);
	}

	warning(message, options = {}) {
		return this.show(message, "warning", options);
	}

	info(message, options = {}) {
		return this.show(message, "info", options);
	}

	clear() {
		for (const toast of this.toasts.values()) {
			toast.close();
		}
		this.toasts.clear();
	}

	enforceMaxToasts() {
		const toastArray = Array.from(this.toasts.values());
		if (toastArray.length > this.maxToasts) {
			// Remove oldest toasts
			const toRemove = toastArray.slice(
				0,
				toastArray.length - this.maxToasts
			);
			toRemove.forEach((toast) => toast.close());
		}
	}

	// Getters
	get toastCount() {
		return this.toasts.size;
	}

	get allToasts() {
		return Array.from(this.toasts.values());
	}
}

// Global toast manager for easy access
let globalToastManager = null;

export function getGlobalToastManager() {
	if (!globalToastManager) {
		globalToastManager = new ToastManager();
	}
	return globalToastManager;
}

// Convenience functions for quick usage (same API as original)
export async function showToast(message, type = "info", options = {}) {
	const manager = getGlobalToastManager();
	return manager.show(message, type, options);
}

export async function showSuccess(message, options = {}) {
	return showToast(message, "success", options);
}

export async function showError(message, options = {}) {
	return showToast(message, "error", options);
}

export async function showWarning(message, options = {}) {
	return showToast(message, "warning", options);
}

export async function showInfo(message, options = {}) {
	return showToast(message, "info", options);
}

// For compatibility with your existing ActionDispatcher pattern
export const SystemToast = {
	show: showToast,
	success: showSuccess,
	error: showError,
	warning: showWarning,
	info: showInfo,
	clear: () => getGlobalToastManager().clear(),
};

export default Toast;
