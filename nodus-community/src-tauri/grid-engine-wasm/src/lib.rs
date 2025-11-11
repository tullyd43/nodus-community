use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

// ---
// 1. DATA MODELS
// We expose these to JS using wasm_bindgen + serde
// ---

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Position {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Widget {
    pub id: String,
    pub position: Position,
    pub locked: bool,

    // Runtime-only state, not serialized in DB
    #[serde(skip)]
    pub is_dragged: bool,
    #[serde(skip)]
    pub original_position: Option<Position>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GridConfig {
    #[serde(default)]
    pub columns: i32,
    #[serde(default)]
    pub gap: i32,
    #[serde(default)]
    pub float: bool,
    #[serde(default)]
    pub static_grid: bool,
}

// ---
// 2. LAYOUT ENGINE (Pure Rust)
// ---

struct OccupiedGrid {
    positions: HashSet<(i32, i32)>,
    columns: i32,
}

impl OccupiedGrid {
    fn new(columns: i32) -> Self {
        OccupiedGrid {
            positions: HashSet::new(),
            columns,
        }
    }

    fn can_place_at(&self, pos: &Position) -> bool {
        if pos.x < 0 || pos.y < 0 || (pos.x + pos.w > self.columns) {
            return false;
        }
        for y in pos.y..(pos.y + pos.h) {
            for x in pos.x..(pos.x + pos.w) {
                if self.positions.contains(&(x, y)) {
                    return false;
                }
            }
        }
        true
    }

    fn register_occupied(&mut self, pos: &Position) {
        for y in pos.y..(pos.y + pos.h) {
            for x in pos.x..(pos.x + pos.w) {
                self.positions.insert((x, y));
            }
        }
    }

    fn find_highest_position(&self, mut pos: Position) -> Position {
        while pos.y > 0 {
            let test_pos = Position {
                y: pos.y - 1,
                ..pos
            };
            if self.can_place_at(&test_pos) {
                pos.y -= 1;
            } else {
                break;
            }
        }
        pos
    }

    fn find_best_position(&self, widget: &Widget) -> Position {
        let pos = &widget.position;
        for y in 0..1000 {
            // Limit search
            for x in 0..(self.columns - pos.w + 1) {
                let test_pos = Position { x, y, ..*pos };
                if self.can_place_at(&test_pos) {
                    return test_pos;
                }
            }
        }
        Position {
            x: 0,
            y: 1000,
            ..*pos
        } // Fallback
    }
}

fn blocks_collide(a: &Position, b: &Position) -> bool {
    !(a.x >= (b.x + b.w) || (a.x + a.w) <= b.x || a.y >= (b.y + b.h) || (a.y + a.h) <= b.y)
}

// ---
// 3. WASM-EXPORTED FUNCTIONS
// These are the public functions Grid.js will call.
// They take JSON (`JsValue`) and return JSON (`JsValue`).
// ---

/// Helper function to parse JS values into Rust structs
fn parse_from_js<T: for<'a> Deserialize<'a>>(js_val: &JsValue) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(js_val.clone())
        .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))
}

/// Helper function to serialize Rust structs into JS values
fn serialize_to_js<T: Serialize>(rust_val: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(rust_val)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Optimizes the layout (GridStack.js "compact" logic).
#[wasm_bindgen(js_name = "optimizeLayout")]
pub fn optimize_layout(js_widgets: JsValue, js_config: JsValue) -> Result<JsValue, JsValue> {
    let mut widgets: Vec<Widget> = parse_from_js(&js_widgets)?;
    let config: GridConfig = parse_from_js(&js_config)?;

    if config.float {
        // In float mode, just validate bounds
        for block in widgets.iter_mut().filter(|b| !b.locked) {
            block.position.x = block
                .position
                .x
                .max(0)
                .min(config.columns - block.position.w);
            block.position.y = block.position.y.max(0);
        }
        return serialize_to_js(&widgets);
    }

    // Compact mode: sort blocks and move them up
    widgets.sort_by(|a, b| {
        a.position
            .y
            .cmp(&b.position.y)
            .then(a.position.x.cmp(&b.position.x))
    });
    let mut occupied = OccupiedGrid::new(config.columns);
    for block in widgets.iter().filter(|b| b.locked) {
        occupied.register_occupied(&block.position);
    }
    for block in widgets.iter_mut().filter(|b| !b.locked) {
        let new_pos = occupied.find_highest_position(block.position.clone());
        block.position = new_pos;
        occupied.register_occupied(&block.position);
    }

    serialize_to_js(&widgets)
}

/// Resolves conflicts (GridStack.js "reflow" logic).
#[wasm_bindgen(js_name = "resolveConflicts")]
pub fn resolve_conflicts(
    js_widgets: JsValue,
    js_config: JsValue,
    dragged_widget_id: String,
) -> Result<JsValue, JsValue> {
    let mut widgets: Vec<Widget> = parse_from_js(&js_widgets)?;
    let config: GridConfig = parse_from_js(&js_config)?;

    let Some(dragged_index) = widgets.iter().position(|b| b.id == dragged_widget_id) else {
        return optimize_layout(serialize_to_js(&widgets)?, js_config);
    };

    // Mark the dragged widget
    widgets[dragged_index].is_dragged = true;
    let dragged_pos = widgets[dragged_index].position.clone();
    // Sort all non-locked, non-dragged blocks by Y position
    let mut sorted_indices: Vec<usize> = (0..widgets.len())
        .filter(|&i| i != dragged_index && !widgets[i].locked)
        .collect();
    sorted_indices.sort_by_key(|&i| widgets[i].position.y);

    for index in sorted_indices {
        let block = &mut widgets[index];
        if blocks_collide(&block.position, &dragged_pos) {
            // (Simplified logic: push down)
            let new_y = dragged_pos.y + dragged_pos.h;
            if new_y > block.position.y {
                block.position.y = new_y;
            }
        }
    }

    // Compact except dragged
    let mut occupied = OccupiedGrid::new(config.columns);
    occupied.register_occupied(&dragged_pos);
    for block in widgets.iter().filter(|b| b.locked) {
        occupied.register_occupied(&block.position);
    }

    let mut compact_indices: Vec<usize> = (0..widgets.len())
        .filter(|&i| i != dragged_index && !widgets[i].locked)
        .collect();
    compact_indices.sort_by_key(|&i| widgets[i].position.y);

    for index in compact_indices {
        let block = &mut widgets[index];
        let new_pos = occupied.find_highest_position(block.position.clone());
        block.position = new_pos;
        occupied.register_occupied(&block.position);
    }

    serialize_to_js(&widgets)
}

/// Finds the best available position for a new widget.
#[wasm_bindgen(js_name = "findBestPosition")]
pub fn find_best_position(
    js_widgets: JsValue,
    js_new_widget: JsValue,
    js_config: JsValue,
) -> Result<JsValue, JsValue> {
    let widgets: Vec<Widget> = parse_from_js(&js_widgets)?;
    let new_widget: Widget = parse_from_js(&js_new_widget)?;
    let config: GridConfig = parse_from_js(&js_config)?;

    let mut occupied = OccupiedGrid::new(config.columns);
    for block in widgets {
        occupied.register_occupied(&block.position);
    }

    let final_pos = occupied.find_best_position(&new_widget);
    serialize_to_js(&final_pos)
}
