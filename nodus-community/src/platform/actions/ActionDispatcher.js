/**
 * @class ActionDispatcher
 * @description Simplified proxy that routes actions to Rust backend via Tauri
 */
import { invoke } from '@tauri-apps/api/core';

export class ActionDispatcher {
    /** @type {WeakSet<Document|HTMLElement>} */
    #attachedRoots = new WeakSet();
    /** @type {WeakMap<Document|HTMLElement, EventListener>} */
    #rootListeners = new WeakMap();
    /** @type {import("@platform/state/HybridStateManager.js").default} */
    #stateManager;

    /**
     * Constructor - maintains same API as before
     * @param {{hybridStateManager?: any, stateManager?: any}} [context]
     */
    constructor({ hybridStateManager, stateManager } = {}) {
        this.#stateManager = stateManager || hybridStateManager;
        if (!this.#stateManager) {
            throw new Error("ActionDispatcher requires a stateManager");
        }
    }

    /**
     * Attach DOM event listener - same API as before
     * @param {Document|HTMLElement} root
     */
    attach(root) {
        if (!root) {
            throw new Error("ActionDispatcher.attach requires a root element to be provided.");
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
     * Detach DOM event listener - same API as before
     * @param {Document|HTMLElement} root
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
     * Handle DOM click events - simplified to just call Tauri
     * @param {MouseEvent} e
     * @private
     */
    async _handle(e) {
        const el = e.target.closest("[data-action]");
        if (!el) return;

        const actionType = el.dataset.action;
        const entityId = el.dataset.entity;
        let payload;

        // Simple payload parsing
        try {
            payload = el.dataset.actionPayload ? JSON.parse(el.dataset.actionPayload) : {};
        } catch {
            payload = { raw: el.dataset.actionPayload };
        }

        // Add entity ID if present
        if (entityId) {
            payload.entityId = entityId;
        }

        // Dispatch to Rust backend
        await this.dispatch(actionType, payload);
    }

    /**
     * Main dispatch method - routes to Rust via Tauri
     * @param {string} actionType
     * @param {object} payload
     * @returns {Promise<any>}
     */
    async dispatch(actionType, payload = {}) {
        try {
            const action = {
                action_type: actionType,
                payload: {
                    ...payload,
                    source: 'javascript_frontend',
                    timestamp: new Date().toISOString()
                },
                metadata: {
                    action_id: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    source: 'ActionDispatcher',
                    user_id: this.#getCurrentUser(),
                    session_id: this.#getSessionId()
                }
            };

            const result = await invoke('execute_action', { action });
            
            // Emit state manager event if available (for compatibility)
            if (this.#stateManager?.emit) {
                this.#stateManager.emit('action.dispatched', {
                    actionType,
                    payload,
                    result,
                    success: true
                });
            }

            return result;
        } catch (error) {
            // Emit error event if state manager available
            if (this.#stateManager?.emit) {
                this.#stateManager.emit('action.dispatched', {
                    actionType,
                    payload,
                    error: error.message,
                    success: false
                });
            }

            console.error('[ActionDispatcher] Failed to dispatch action:', {
                actionType,
                error: error.message
            });
            
            throw error;
        }
    }

    /**
     * Get current user - simplified fallback
     * @private
     */
    #getCurrentUser() {
        return this.#stateManager?.currentUser?.id || 'anonymous';
    }

    /**
     * Get session ID - simplified fallback 
     * @private
     */
    #getSessionId() {
        return this.#stateManager?.sessionId || 'default-session';
    }
}
