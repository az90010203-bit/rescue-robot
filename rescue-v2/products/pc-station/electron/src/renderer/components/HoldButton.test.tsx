import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HoldButton } from "./HoldButton";

describe("HoldButton", () => {
  afterEach(cleanup);

  it("releases once when pointer capture is lost after pointer up", () => {
    const start = vi.fn();
    const end = vi.fn();
    render(
      <HoldButton onHoldEnd={end} onHoldStart={start}>
        测试保持
      </HoldButton>
    );
    const button = screen.getByRole("button", { name: "测试保持" });

    fireEvent.pointerDown(button, { pointerId: 1 });
    fireEvent.pointerUp(button, { pointerId: 1 });
    fireEvent.lostPointerCapture(button, { pointerId: 1 });

    expect(start).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("releases an active hold when the pointer is cancelled", () => {
    const end = vi.fn();
    render(
      <HoldButton onHoldEnd={end} onHoldStart={vi.fn()}>
        测试取消
      </HoldButton>
    );
    const button = screen.getByRole("button", { name: "测试取消" });

    fireEvent.pointerDown(button, { pointerId: 2 });
    fireEvent.pointerCancel(button, { pointerId: 2 });

    expect(end).toHaveBeenCalledTimes(1);
  });
});
