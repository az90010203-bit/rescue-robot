import { InboundMessage, LineDelimitedJsonParser } from "@adapters/hardware/protocol";

export type SerialMessageHandler = (message: InboundMessage) => void;
export type SerialClientErrorCode = "unsupportedWebSerial" | "portNotReadableWritable" | "notConnected";
export type SerialReadMode = "json" | "binary";

export class SerialClientError extends Error {
  constructor(readonly code: SerialClientErrorCode) {
    super(code);
    this.name = "SerialClientError";
  }
}

export function isSerialClientError(error: unknown): error is SerialClientError {
  return error instanceof SerialClientError;
}

export class WebSerialClient {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readonly parser = new LineDelimitedJsonParser();
  private readMode: SerialReadMode = "json";
  private binaryBuffer: number[] = [];
  private keepReading = false;

  constructor(private readonly onMessage: SerialMessageHandler) {}

  get connected(): boolean {
    return this.port !== null;
  }

  async connect(baudRate = 115200, readMode: SerialReadMode = "json"): Promise<void> {
    if (!navigator.serial) {
      throw new SerialClientError("unsupportedWebSerial");
    }

    try {
      this.readMode = readMode;
      this.binaryBuffer = [];
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate });

      if (!this.port.readable || !this.port.writable) {
        throw new SerialClientError("portNotReadableWritable");
      }

      this.writer = this.port.writable.getWriter();
      this.keepReading = true;
      void this.readLoop();
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.keepReading = false;
    await this.reader?.cancel().catch(() => undefined);
    try {
      this.reader?.releaseLock();
    } catch {
      // The read loop may have already released it after cancel().
    }
    this.reader = null;
    try {
      this.writer?.releaseLock();
    } catch {
      // The stream can already be unlocked if the browser closes the port.
    }
    this.writer = null;
    await this.port?.close().catch(() => undefined);
    this.port = null;
  }

  async sendJson(value: unknown): Promise<void> {
    if (!this.writer) {
      throw new SerialClientError("notConnected");
    }
    const payload = `${JSON.stringify(value)}\n`;
    await this.writer.write(new TextEncoder().encode(payload));
  }

  async sendBytes(bytes: ArrayLike<number>): Promise<void> {
    if (!this.writer) {
      throw new SerialClientError("notConnected");
    }
    await this.writer.write(new Uint8Array(Array.from(bytes, (byte) => byte & 0xff)));
  }

  clearBinaryBuffer(): void {
    this.binaryBuffer = [];
  }

  async readBufferedBytes(waitMs = 120): Promise<number[]> {
    await new Promise((resolve) => window.setTimeout(resolve, waitMs));
    const bytes = this.binaryBuffer;
    this.binaryBuffer = [];
    return bytes;
  }

  private async readLoop(): Promise<void> {
    if (!this.port?.readable) {
      return;
    }

    const decoder = new TextDecoder();
    this.reader = this.port.readable.getReader();

    try {
      while (this.keepReading) {
        const { value, done } = await this.reader.read();
        if (done || !value) {
          break;
        }
        if (this.readMode === "binary") {
          this.binaryBuffer.push(...value);
          continue;
        }
        const messages = this.parser.push(decoder.decode(value, { stream: true }));
        for (const message of messages) {
          this.onMessage(message);
        }
      }
    } finally {
      try {
        this.reader?.releaseLock();
      } catch {
        // Disconnect can release the reader first.
      }
      this.reader = null;
    }
  }
}
