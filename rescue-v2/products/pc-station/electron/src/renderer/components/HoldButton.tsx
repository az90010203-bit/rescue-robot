import { useRef, type ButtonHTMLAttributes, type PointerEvent } from "react";

interface HoldButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onPointerDown" | "onPointerUp"> {
  /** Called once when pointer or touch begins. */
  readonly onHoldStart: () => void;
  /** Called once when pointer/touch ends or is cancelled. */
  readonly onHoldEnd: () => void;
}

/**
 * Pointer-safe hold button for motion commands.
 *
 * Pointer capture guarantees a release event even when the operator slides
 * outside the visible button while holding it.
 */
export function HoldButton({
  onHoldStart,
  onHoldEnd,
  children,
  ...props
}: HoldButtonProps): React.JSX.Element {
  const active = useRef(false);
  const start = (event: PointerEvent<HTMLButtonElement>): void => {
    if (active.current) {
      return;
    }
    active.current = true;
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    onHoldStart();
  };
  const end = (event: PointerEvent<HTMLButtonElement>): void => {
    if (!active.current) {
      return;
    }
    active.current = false;
    if (
      typeof event.currentTarget.hasPointerCapture === "function" &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onHoldEnd();
  };
  return (
    <button
      {...props}
      onLostPointerCapture={end}
      onPointerCancel={end}
      onPointerDown={start}
      onPointerUp={end}
      type="button"
    >
      {children}
    </button>
  );
}
