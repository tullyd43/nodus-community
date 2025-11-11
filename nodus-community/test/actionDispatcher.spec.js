import { describe, it, expect, vi } from "vitest";

import actionDispatcherA from "../src/platform/ActionDispatcher.js";
import actionDispatcherB from "../src/platform/ActionDispatcher.js";
import GridHistoryInspector from "../src/platform/grid/utils/GridHistoryInspector.js";

describe("ActionDispatcher (singleton + injection)", () => {
	it("exports the same instance across imports", () => {
		expect(actionDispatcherA).toBe(actionDispatcherB);
	});

	it("provides a dispatch function", () => {
		expect(typeof actionDispatcherA.dispatch).toBe("function");
	});

	it("allows injection of a mock dispatcher into GridHistoryInspector", async () => {
		const mock = {
			dispatch: vi
				.fn()
				.mockResolvedValue({
					success: true,
					undoCount: 0,
					redoCount: 0,
				}),
		};
		const inspector = new GridHistoryInspector({ actionDispatcher: mock });

		// recordAction should call the injected dispatch
		await inspector.recordAction("test.action", { foo: "bar" });
		expect(mock.dispatch).toHaveBeenCalled();

		inspector.dispose();
	});
});
