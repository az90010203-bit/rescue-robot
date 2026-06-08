import { PlatformEvent } from "@platform/types";

export type PlatformEventHandler = (event: PlatformEvent) => void;

export class PlatformEventBus {
  private nextId = 1;
  private readonly handlers = new Set<PlatformEventHandler>();
  private readonly recentEvents: PlatformEvent[] = [];

  constructor(private readonly maxRecentEvents = 120) {}

  emit(event: Omit<PlatformEvent, "id" | "createdAt"> & { createdAt?: number }): PlatformEvent {
    const emitted: PlatformEvent = {
      ...event,
      id: this.nextId++,
      createdAt: event.createdAt ?? Date.now()
    };
    this.recentEvents.unshift(emitted);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.length = this.maxRecentEvents;
    }
    for (const handler of this.handlers) {
      handler(emitted);
    }
    return emitted;
  }

  subscribe(handler: PlatformEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  getRecentEvents(): PlatformEvent[] {
    return [...this.recentEvents];
  }
}
