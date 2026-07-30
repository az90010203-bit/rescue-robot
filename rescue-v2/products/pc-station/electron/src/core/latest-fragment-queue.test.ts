import { describe, expect, it } from "vitest";

import { LatestFragmentQueue } from "./latest-fragment-queue";

describe("LatestFragmentQueue", () => {
  it("keeps the initialization segment and only the newest media fragment", () => {
    const queue = new LatestFragmentQueue();
    queue.setInitialization(new Uint8Array([1, 2]));
    queue.push(new Uint8Array([3]));
    queue.push(new Uint8Array([4, 5]));

    expect(queue.takeInitialization()).toEqual(new Uint8Array([1, 2]));
    expect(queue.takeLatest()).toEqual(new Uint8Array([4, 5]));
    expect(queue.takeLatest()).toBeNull();
  });

  it("clears stale state when the stream reconnects", () => {
    const queue = new LatestFragmentQueue();
    queue.setInitialization(new Uint8Array([1]));
    queue.push(new Uint8Array([2]));

    queue.reset();

    expect(queue.takeInitialization()).toBeNull();
    expect(queue.takeLatest()).toBeNull();
  });
});
