import { describe, expect, it } from "vitest";
import { PlatformEventBus } from "@platform/events";

describe("platform event bus", () => {
  it("emits, stores, and publishes typed events", () => {
    const bus = new PlatformEventBus();
    const received: string[] = [];
    const unsubscribe = bus.subscribe((event) => received.push(event.type));

    const event = bus.emit({
      type: "servo.feedback",
      level: "info",
      source: "servo:22",
      payload: { id: 22 },
      createdAt: 100
    });

    unsubscribe();
    bus.emit({
      type: "serial.disconnected",
      level: "warn",
      source: "transport.web-serial",
      payload: {},
      createdAt: 101
    });

    expect(event).toMatchObject({ id: 1, type: "servo.feedback", createdAt: 100 });
    expect(received).toEqual(["servo.feedback"]);
    expect(bus.getRecentEvents().map((item) => item.type)).toEqual(["serial.disconnected", "servo.feedback"]);
  });
});
