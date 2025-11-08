use nodus as engine;

// Simple integration test to guard against regressions in action dispatch for
// grid save/load operations. This is intentionally small: it constructs a
// community AppState, registers a tiny handler for `grid.save_config`, and
// verifies that execute_action returns a success result.

#[tokio::test]
async fn test_grid_save_config_dispatch() -> Result<(), Box<dyn std::error::Error>> {
    // Create a community app state
    let app_state = engine::state_mod::AppState::new_community().await?;

    // A tiny handler implementation that responds to `grid.save_config`.
    struct SaveConfigHandler;

    #[async_trait::async_trait]
    impl engine::action_dispatcher::ActionHandler for SaveConfigHandler {
        async fn execute(
            &self,
            _action: &engine::action_dispatcher::Action,
            _context: &engine::action_dispatcher::ActionContext,
            _app_state: &engine::state_mod::AppState,
        ) -> Result<serde_json::Value, engine::action_dispatcher::ActionError> {
            Ok(serde_json::json!({"status": "saved"}))
        }

        fn action_type(&self) -> &str {
            "grid.save_config"
        }
    }

    // Register the handler
    app_state
        .action_dispatcher
        .register_handler(SaveConfigHandler)
        .await;

    // Build a save action and a simple context
    let action = engine::action_dispatcher::Action::new("grid.save_config", serde_json::json!({}));
    let context = engine::action_dispatcher::ActionContext::new("test_user", "test_session");

    // Execute the action using the shared AppState reference
    let result = app_state
        .action_dispatcher
        .execute_action(action, context, &app_state)
        .await?;

    assert!(result.success);
    Ok(())
}
