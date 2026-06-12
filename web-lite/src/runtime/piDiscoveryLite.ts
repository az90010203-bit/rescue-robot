import { A_BOARD_BRIDGE_PORT, CAMERA_PORTS, PI_SERVO_BRIDGE_PORT, ROBOT_PROFILE } from "../robotProfile";

export type PiDiscoverySource = "saved" | "usb-gadget-hostname" | "mdns" | "usb-gadget-fallback" | "manual-usb-fallback";
export type ProbeStatus = "online" | "offline";
export type DiscoveryStatus = "online" | "partial" | "offline";

export interface PiDiscoveryCandidate {
  host: string;
  label: string;
  source: PiDiscoverySource;
}

export interface ServiceProbe {
  id: string;
  label: string;
  port: number;
  status: ProbeStatus;
  detail: string;
}

export interface PiDiscoveryResult {
  candidate: PiDiscoveryCandidate;
  status: DiscoveryStatus;
  score: number;
  services: ServiceProbe[];
}

interface DiscoveryOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

const SERVICES = [
  { id: "aBoardBridge", label: "A-board bridge", port: A_BOARD_BRIDGE_PORT, path: "/health" },
  { id: "piServoBridge", label: "Pi servo bridge", port: PI_SERVO_BRIDGE_PORT, path: "/health" },
  { id: "mainCamera", label: "Main camera", port: CAMERA_PORTS.main, path: "/latency" },
  { id: "secondaryCamera", label: "Second camera", port: CAMERA_PORTS.secondary, path: "/latency" }
];

export function buildPiDiscoveryCandidates(savedHost = ""): PiDiscoveryCandidate[] {
  const candidates: PiDiscoveryCandidate[] = [
    { host: savedHost, label: "saved", source: "saved" },
    ...ROBOT_PROFILE.piCandidates
  ];
  const seen = new Set<string>();
  return candidates
    .map((candidate) => ({ ...candidate, host: normalizeHost(candidate.host) }))
    .filter((candidate) => {
      const key = candidate.host.toLowerCase();
      if (!candidate.host || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

export async function discoverPiHosts(savedHost = "", options: DiscoveryOptions = {}): Promise<PiDiscoveryResult[]> {
  const candidates = buildPiDiscoveryCandidates(savedHost);
  const results = await Promise.all(candidates.map((candidate) => probeCandidate(candidate, options)));
  return results.sort(compareResults);
}

export function recommendedPiResult(results: PiDiscoveryResult[]): PiDiscoveryResult | null {
  return results.find((result) => result.status !== "offline") ?? null;
}

export function normalizeHost(host: string): string {
  return host.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

async function probeCandidate(candidate: PiDiscoveryCandidate, options: DiscoveryOptions): Promise<PiDiscoveryResult> {
  const services = await Promise.all(SERVICES.map((service) => probeService(candidate.host, service, options)));
  const online = services.filter((service) => service.status === "online").length;
  const score = online * 20 + sourceScore(candidate.source);
  const status: DiscoveryStatus = online >= 2 ? "online" : online > 0 ? "partial" : "offline";
  return { candidate, services, score, status };
}

async function probeService(host: string, service: typeof SERVICES[number], options: DiscoveryOptions): Promise<ServiceProbe> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 1000);
  try {
    const response = await fetcher(`http://${host}:${service.port}${service.path}`, { signal: controller.signal, cache: "no-store" });
    return { ...service, status: response.ok ? "online" : "offline", detail: response.ok ? "ready" : `HTTP ${response.status}` };
  } catch (error) {
    return { ...service, status: "offline", detail: error instanceof Error && error.message ? error.message : "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

function compareResults(a: PiDiscoveryResult, b: PiDiscoveryResult): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  return sourceScore(b.candidate.source) - sourceScore(a.candidate.source);
}

function sourceScore(source: PiDiscoverySource): number {
  if (source === "saved") return 5;
  if (source === "usb-gadget-hostname") return 4;
  if (source === "usb-gadget-fallback") return 3;
  if (source === "manual-usb-fallback") return 2;
  return 1;
}
