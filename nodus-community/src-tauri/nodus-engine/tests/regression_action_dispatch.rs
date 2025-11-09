// Simple integration test to guard against regressions in action dispatch for
// grid save/load operations. This is intentionally small: it constructs a
// community AppState, registers a tiny handler for `grid.save_config`, and
// verifies that execute_action returns a success result.
use nodus as engine;

// Simple integration test to guard against regressions in action dispatch for
// grid save/load operations. This is intentionally small: it constructs a
// community AppState, registers a tiny handler for `grid.save_config`, and
// verifies that execute_action returns a success result.

#[tokio::test]
async fn test_grid_save_config_dispatch() -> Result<(), Box<dyn std::error::Error>> {
    // Create a community app state and wrap it in Arc<RwLock<>> for handlers
    let app_state = engine::state_mod::AppState::new().await?;
    let arc_state: std::sync::Arc<tokio::sync::RwLock<engine::state_mod::AppState>> = std::sync::Arc::new(tokio::sync::RwLock::new(app_state));

    // A tiny handler implementation that responds to `grid.save_config`.
    struct SaveConfigHandler;

    #[async_trait::async_trait]
    impl engine::action_dispatcher::ActionHandler for SaveConfigHandler {
        async fn execute(
            &self,
            _action: &engine::action_dispatcher::Action,
            _context: &engine::action_dispatcher::ActionContext,
            _app_state: engine::state_mod::AppStateType,
        ) -> Result<serde_json::Value, engine::action_dispatcher::ActionError> {
            Ok(serde_json::json!({"status": "saved"}))
        }

        fn action_type(&self) -> &str {
            "grid.save_config"
        }
    }

    // Register the handler using the Arc-wrapped state
    {
        let state = arc_state.read().await;
        state.action_dispatcher.register_handler(SaveConfigHandler).await;
    }

    // Build a save action and a simple context
    let action = engine::action_dispatcher::Action::new("grid.save_config", serde_json::json!({}));
    let context = engine::action_dispatcher::ActionContext::new("test_user", "test_session");

    // Execute the action using the shared Arc<RwLock<AppState>> reference
    // Avoid holding the read lock across an await: clone the dispatcher Arc
    let dispatcher = {
        let guard = arc_state.read().await;
        guard.action_dispatcher.clone()
    };

    let result = dispatcher.execute_action(action, context, arc_state.clone()).await?;

    assert!(result.success);
    Ok(())
}
