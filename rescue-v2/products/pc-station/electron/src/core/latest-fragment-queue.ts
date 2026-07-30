/**
 * Latest-only queue used between a camera WebSocket and MediaSource.
 *
 * Slow rendering must drop intermediate fragments instead of building latency.
 */
export class LatestFragmentQueue {
  private initialization: Uint8Array<ArrayBuffer> | null = null;
  private latest: Uint8Array<ArrayBuffer> | null = null;

  /**
   * Stores the fMP4 initialization segment for the current connection.
   *
   * @param segment - Complete initialization segment
   */
  public setInitialization(segment: Uint8Array<ArrayBuffer>): void {
    this.initialization = segment;
  }

  /**
   * Replaces any queued media fragment with the newest fragment.
   *
   * @param fragment - Complete moof+mdat media fragment
   */
  public push(fragment: Uint8Array<ArrayBuffer>): void {
    this.latest = fragment;
  }

  /**
   * Takes the current initialization segment once.
   *
   * @returns Initialization segment or null when already consumed
   */
  public takeInitialization(): Uint8Array<ArrayBuffer> | null {
    const value = this.initialization;
    this.initialization = null;
    return value;
  }

  /**
   * Takes the newest media fragment and clears the queue.
   *
   * @returns Latest media fragment or null when none is queued
   */
  public takeLatest(): Uint8Array<ArrayBuffer> | null {
    const value = this.latest;
    this.latest = null;
    return value;
  }

  /** Drops every segment from a previous camera connection. */
  public reset(): void {
    this.initialization = null;
    this.latest = null;
  }
}
