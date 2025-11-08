/**
 * Grid Component Migration Example
 * 
 * This shows how existing grid components can be updated to work with the 
 * new Tauri-based ActionDispatcher and AsyncOrchestrator proxies.
 */

// BEFORE: Complex grid component using enterprise JavaScript architecture
class GridComponentOLD {
    constructor({ stateManager }) {
        this.stateManager = stateManager;
        this.orchestrator = stateManager.managers.asyncOrchestrator;
        this.actionDispatcher = stateManager.managers.actionDispatcher;
        this.metrics = stateManager.managers.metricsRegistry;
        this.security = stateManager.managers.security;
        // ... lots of other dependencies
    }

    async saveGridConfig(configId, config) {
        // Complex enterprise patterns
        const license = this.stateManager.managers.license;
        if (!license?.hasFeature("grid_persistence")) {
            this.actionDispatcher.dispatch("security.license_validation_failed", {...});
            throw new Error("License required");
        }

        const runner = this.orchestrator.createRunner('grid.save_config');
        return await runner.run(() => {
            return this.stateManager.storage.forensicSet(
                `grid_config:${configId}`, 
                JSON.stringify(config)
            );
        }, {
            label: 'grid.configuration.save',
            classification: 'CONFIDENTIAL',
            actorId: this.currentUser,
            timeout: 30000
        });
    }
}

// AFTER: Simplified grid component using Rust backend via proxies
class GridComponent {
    constructor({ stateManager }) {
        this.stateManager = stateManager;
        // Same API surface, but simplified proxy implementations
        this.orchestrator = stateManager.managers.asyncOrchestrator;
        this.actionDispatcher = stateManager.managers.actionDispatcher;
    }

    async saveGridConfig(configId, config) {
        // Same API, but routed to Rust backend automatically
        const runner = this.orchestrator.createRunner('grid.save_config');
        return await runner.run(() => {
            // This now calls Tauri invoke('save_grid_config') under the hood
            return this.actionDispatcher.dispatch('grid.save_config', {
                configId,
                config
            });
        }, {
            label: 'grid.configuration.save',
            classification: 'CONFIDENTIAL',
            timeout: 30000
        });
    }

    async moveGridBlock(blockId, newPosition) {
        // ActionDispatcher routes to Rust via Tauri
        return await this.actionDispatcher.dispatch('grid.move_block', {
            blockId,
            position: newPosition,
            timestamp: new Date().toISOString()
        });
    }

    async loadGridConfig(configId) {
        // AsyncOrchestrator proxies to Rust for observability
        const runner = this.orchestrator.createRunner('grid.load_config');
        return await runner.run(() => {
            return this.actionDispatcher.dispatch('grid.load_config', { configId });
        }, {
            label: 'grid.configuration.load'
        });
    }
}

// Example usage - SAME API for components!
const gridComponent = new GridComponent({ stateManager });

// This works exactly the same as before, but uses Rust backend
await gridComponent.saveGridConfig('my-dashboard', {
    blocks: [
        { id: 'block1', x: 0, y: 0, w: 6, h: 4, type: 'chart' }
    ],
    columns: 24
});

// DOM events also work the same way
/*
HTML:
<button data-action="grid.add_block" 
        data-action-payload='{"type":"text","w":4,"h":2}'>
    Add Text Block
</button>
*/

export { GridComponent };
