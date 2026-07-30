import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RescueBridge } from "../../shared/bridge";
import { CanPage } from "./CanPage";

describe("CanPage", () => {
  beforeEach(() => {
    Object.defineProperty(window, "rescue", {
      configurable: true,
      value: {
        invokeCapability: vi
          .fn<RescueBridge["invokeCapability"]>()
          .mockResolvedValue()
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("preserves mirrored right-leg front direction", () => {
    render(<CanPage />);

    fireEvent.click(screen.getByRole("button", { name: "右前腿向前" }));

    expect(window.rescue.invokeCapability).toHaveBeenCalledWith({
      name: "can",
      body: {
        action: "jog",
        group: "front_right",
        direction: -1,
        stepDeg: 4,
        speedRaw: 0
      }
    });
  });
});
