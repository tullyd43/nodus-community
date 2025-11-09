# Grid Configuration System Architecture

## 🎯 **Problem Solved**

**Before**: Grid settings hardcoded in 3+ different places:
- `main.js` line 331: `h: 1`  
- `GridRuntimeConfig.js` line 40: `h ?? 1`
- `GridBlock.js` constructor: `this.h = props.h ?? 2`

**Result**: Conflicts, maintenance nightmares, no user control

**After**: Single source of truth with user configuration UI

---

## 🏗️ **Architecture Overview**

```
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│   GridConfigPanel   │───▶│  GridConfigSystem    │◀───│   All Grid Code     │
│   (User Interface)  │    │  (Single Source)     │    │   (Consumers)       │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
                                      │
                              ┌───────▼────────┐
                              │   IndexedDB    │
                              │  + LocalStorage │
                              │  (Persistence) │
                              └────────────────┘
```

### **Core Principles** ✅
- ✅ **Composability**: Works with any grid instance
- ✅ **Simplicity**: Single API for all settings
- ✅ **Non-Redundancy**: One config, multiple consumers  
- ✅ **Extensibility**: Easy to add new settings
- ✅ **User Control**: Configurable through UI

---

## 🔧 **Usage Examples**

### **Initialize Configuration System**
```javascript
import { gridConfig } from './GridConfigSystem.js';

// Initialize once at app startup
await gridConfig.initialize();
```

### **Get Configuration Values**
```javascript
// Get default block size for new widgets
const defaultSize = gridConfig.getDefaultBlockSize();
// Returns: { w: 2, h: 2 }

// Get specific settings
const columns = gridConfig.get('columns');           // 12
const gap = gridConfig.get('gap');                   // 16
const isReflowEnabled = !gridConfig.get('float');   // true
```

### **Update Configuration**
```javascript
// Change default block size (affects all new blocks)
await gridConfig.setDefaultBlockSize(3, 2); // 3x2 blocks

// Change grid behavior
await gridConfig.set('float', false);      // Enable reflow
await gridConfig.set('columns', 18);       // 18-column grid
await gridConfig.set('gap', 20);           // 20px gap
```

### **Create Grid with Config**
```javascript
import { ModernGrid } from './Grid_cleaned.js';

// Grid automatically uses config defaults
const grid = new ModernGrid({
    // Props override config if specified
    column: 24,  // Override config columns
    // Other settings come from config
});
```

### **Add Config Panel to UI**
```javascript
import { GridConfigPanel } from './GridConfigPanel.js';

// Add configuration panel to any container
const panel = new GridConfigPanel('#config-container');
await panel.render();

// Panel automatically updates when users change settings
// All grids automatically respond to config changes
```

---

## ⚙️ **Configuration Schema**

```javascript
const DEFAULT_CONFIG = {
    // Grid Layout
    columns: 12,              // Total grid columns (6-24)
    gap: 16,                  // Space between blocks (px)
    cellHeight: "auto",       // Row height strategy
    
    // Default Block Settings (SINGLE SOURCE OF TRUTH)
    defaultBlockSize: {
        w: 2,                 // Default width in columns
        h: 2,                 // Default height in rows
    },
    
    // Behavior Settings
    float: false,             // false = auto-reflow, true = manual positioning
    staticGrid: false,        // true = no interactions
    animate: true,            // Enable smooth transitions
    
    // Performance Limits
    maxLiveReflowWidgets: 50, // Disable reflow above this count
    reflowThrottleMs: 16,     // ~60fps throttling
    
    // User Interface
    showGridLines: false,     // Debug grid visualization
    enableSnapping: true,     // Snap to grid during drag
    dragThreshold: 8,         // Pixels before drag starts
};
```

---

## 🔄 **Migration Guide**

### **From Hardcoded Values**

**OLD (Anti-Pattern):**
```javascript
// Scattered across multiple files
const widget = new GridBlock({
    w: 2,  // Hardcoded in main.js
    h: 1,  // Hardcoded, conflicts with other defaults
});
```

**NEW (Centralized):**
```javascript
// Single source of truth
const defaultSize = gridConfig.getDefaultBlockSize();
const widget = new GridBlock({
    w: defaultSize.w,  // From config system
    h: defaultSize.h,  // Consistent everywhere
});
```

### **Update Existing Grid Code**

1. **Import config system**:
   ```javascript
   import { gridConfig } from './GridConfigSystem.js';
   ```

2. **Replace hardcoded defaults**:
   ```javascript
   // OLD
   this.w = props.w ?? 2;
   
   // NEW  
   this.w = props.w ?? gridConfig.getDefaultBlockSize().w;
   ```

3. **Listen for config changes**:
   ```javascript
   window.addEventListener('nodus-grid-config-changed', (e) => {
       this.handleConfigChange(e.detail);
   });
   ```

---

## 🎛️ **User Configuration Panel**

The `GridConfigPanel` provides a clean UI for users to configure:

### **Layout Settings**
- **Columns**: Total grid columns (6-24)
- **Gap**: Space between blocks (px)

### **Default Block Size**  
- **Width**: Columns per new block
- **Height**: Rows per new block
- **Make Square**: Quick action to set height = width

### **Behavior Settings**
- **Enable Auto-Reflow**: Blocks rearrange when dragged
- **Enable Interactions**: Allow drag/resize
- **Enable Animations**: Smooth transitions

### **Performance**
- **Max Live Reflow**: Widget count before disabling reflow

### **Actions**
- **Reset to Defaults**: Restore all settings
- **Export Config**: Download configuration as JSON

---

## 🔍 **Benefits Achieved**

### **For Developers**
✅ **Single Source of Truth**: One place to change defaults  
✅ **No More Conflicts**: Consistent behavior everywhere  
✅ **Easy Testing**: Mock config for different scenarios  
✅ **Clear Architecture**: Follows platform design principles

### **For Users**  
✅ **Full Control**: Configure grid behavior to their needs  
✅ **Persistent Settings**: Configuration saved across sessions  
✅ **Live Updates**: Changes apply immediately to all grids  
✅ **Export/Import**: Share configurations between environments

### **For Platform**
✅ **Composable**: Works with any grid instance  
✅ **Extensible**: Easy to add new configuration options  
✅ **Maintainable**: Changes in one place, effect everywhere  
✅ **User-Centric**: Puts control in user hands

---

## 🚨 **Anti-Patterns to Avoid**

❌ **Don't hardcode settings in multiple files**  
❌ **Don't bypass the config system with direct props**  
❌ **Don't create component-specific config systems**  
❌ **Don't forget to listen for config changes**

✅ **Do use `gridConfig.get()` for all defaults**  
✅ **Do allow props to override config when needed**  
✅ **Do listen for `nodus-grid-config-changed` events**  
✅ **Do validate config changes before applying**

---

This architecture solves the original problem of scattered configuration while providing a foundation for user-configurable composable platform behavior.
