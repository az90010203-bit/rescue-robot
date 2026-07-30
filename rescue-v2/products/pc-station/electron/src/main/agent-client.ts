import { z } from "zod";

import type {
  AgentRequest,
  AgentTransport,
  JsonValue
} from "../core/control-runtime";
import { agentHealthSchema, type AgentHealth } from "../shared/contracts";

const commandResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional()
});

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Loopback-only JSON client for the independent Python Control Agent.
 *
 * The base URL is fixed at construction and renderer code cannot provide paths.
 */
export class AgentClient implements AgentTransport {
  private readonly baseUrl: URL;

  /**
   * Creates a client restricted to the configured loopback service.
   *
   * @param baseUrl - Agent origin, normally http://127.0.0.1:18400
   * @param fetcher - Injectable fetch boundary used by tests
   */
  public constructor(
    baseUrl: string,
    private readonly fetcher: Fetcher = fetch,
    private readonly requestTimeoutMs = 1200
  ) {
    this.baseUrl = new URL(baseUrl);
    if (
      this.baseUrl.protocol !== "http:" ||
      this.baseUrl.hostname !== "127.0.0.1" ||
      this.baseUrl.port !== "18400"
    ) {
      throw new Error("Control Agent URL must be http://127.0.0.1:18400");
    }
  }

  /**
   * Sends one fixed-route command and rejects unsuccessful operations.
   *
   * @param request - Request created by the Electron main process
   */
  public async request(request: AgentRequest): Promise<void> {
    const response = await this.fetch(request);
    const raw: unknown = await response.json();
    const payload = commandResponseSchema.parse(raw);
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? `Control Agent HTTP ${response.status}`);
    }
  }

  /**
   * Reads Agent health without treating `ok: false` as a command failure.
   *
   * @returns Validated Agent and downstream device health
   */
  public async health(): Promise<AgentHealth> {
    const response = await this.fetch({
      method: "GET",
      path: "/v2/health"
    });
    if (!response.ok) {
      throw new Error(`Control Agent health HTTP ${response.status}`);
    }
    const raw: unknown = await response.json();
    return agentHealthSchema.parse(raw);
  }

  private async fetch(request: AgentRequest): Promise<Response> {
    const url = new URL(request.path, this.baseUrl);
    if (url.origin !== this.baseUrl.origin || !url.pathname.startsWith("/v2/")) {
      throw new Error("Control Agent request path is outside the allowed API");
    }
    const body = request.body;
    const controller = new AbortController();
    const init: RequestInit = {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body satisfies {
        readonly [key: string]: JsonValue;
      });
    }
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      return await this.fetcher(url.toString(), init);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("Control Agent request timed out", { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
