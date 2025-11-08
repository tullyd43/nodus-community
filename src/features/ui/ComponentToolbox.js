/**
 * @file ComponentToolbox.js
 * @description Renders a UI toolbox of draggable/clickable components for the page builder.
 */

/**
 * @class ComponentToolbox
 * @classdesc A UI component that displays available building blocks from the ComponentDefinitionRegistry.
 * It integrates with the ActionDispatcher for creating new components on the canvas.
 * @privateFields {#stateManager, #componentRegistry, #asyncService, #root}
 */
export class ComponentToolbox {
	/** @private @type {import('../../platform/state/HybridStateManager.js').default|null} */
	#stateManager = null;
	/** @private @type {import('../grid/runtime/ComponentRegistry.js').ComponentRegistry|null} */
	#componentRegistry = null;
	/** @private @type {import('../../shared/lib/async/AsyncOrchestrationService.js').AsyncOrchestrationService|null} */
	#asyncService = null;
	/** @private @type {HTMLElement|null} */
	#root = null;

	/**
	 * @param {object} context
	 * @param {import('../../platform/state/HybridStateManager.js').default} context.stateManager - The central state manager.
	 */
	constructor({ stateManager } = {}) {
		if (!stateManager) {
			throw new Error("ComponentToolbox requires a stateManager.");
		}
		// V8.0 Parity: Mandate 1.2 - Derive all dependencies from the stateManager.
		this.#stateManager = stateManager;
		this.#componentRegistry =
			this.#stateManager.managers?.componentRegistry ?? null;
		this.#asyncService =
			this.#stateManager.managers?.asyncOrchestrator ?? null;
	}

	/**
	 * Renders the toolbox UI into a specified container element.
	 * @param {HTMLElement} container - The DOM element to render the toolbox into.
	 * @returns {() => void} A cleanup function to remove the toolbox from the DOM.
	 */
	render(container) {
		if (!container)
			throw new Error("ComponentToolbox.render requires a container");
		this.#root = container;
		// Create elements via the container's ownerDocument to avoid direct `document` usage
		const doc = container.ownerDocument;
		const header = doc.createElement("div");
		header.className = "toolbox-header";
		header.textContent = "Components";

		const listContainer = doc.createElement("div");
		listContainer.className = "toolbox-list";

		// V8.0 Parity: Query available component types directly from the registry.
		const componentDefs =
			this.#componentRegistry?.getByCategory?.("building-block") ?? [];

		for (const def of componentDefs) {
			const item = doc.createElement("div");
			item.className = "toolbox-item";
			item.draggable = true;
			item.textContent = def.name || def.id;
			item.title = def.description || `Add a ${def.name} component`;

			// V8.0 Parity: Use ActionDispatcher pattern for creating components.
			// The grid/canvas will listen for `ui.action.dispatched` with these actions.
			const actionPayload = {
				componentType: def.id,
				defaultProps: def.defaultProps || {},
			};

			// Action for adding via click
			item.dataset.action = "builder:add_component";
			item.dataset.actionPayload = JSON.stringify(actionPayload);

			// Set data for drag-and-drop operations
			item.addEventListener("dragstart", (ev) => {
				this.#onDragStart(ev, {
					type: "builder:component",
					payload: actionPayload,
				});
			});

			listContainer.appendChild(item);
		}

		// Replace container children safely
		container.replaceChildren(header, listContainer);
		return () => container.replaceChildren();
	}

	/**
	 * Handles the drag start event to set the data for the drop target.
	 * @private
	 * @param {DragEvent} ev - The drag event.
	 * @param {object} data - The data to transfer.
	 * @param {string} data.type - The type of data being dragged (e.g., 'builder:component').
	 * @param {object} data.payload - The component definition payload.
	 */
	#onDragStart(ev, data) {
		const operation = () => {
			try {
				const jsonData = JSON.stringify(data);
				ev.dataTransfer.setData(
					"application/x-nodus-component-def",
					jsonData
				);
				ev.dataTransfer.setData("text/plain", jsonData);
				ev.dataTransfer.effectAllowed = "copy";
			} catch (err) {
				console.error(
					"[ComponentToolbox] Failed to set drag data:",
					err
				);
				// We don't re-throw here to avoid crashing the drag operation.
			}
		};

		// Wrap in async orchestrator for logging, but run synchronously.
		if (this.#asyncService) {
			this.#asyncService.wrap(operation, {
				stateManager: this.#stateManager,
				label: "toolbox.dragStart",
				eventType: "UI_DRAG_START",
				actorId: "ui.toolbox",
				meta: { componentType: data.payload?.componentType },
			});
		} else {
			operation();
		}
	}
}

export default ComponentToolbox;
