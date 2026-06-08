import { PiRemoteError, requestPiHelperHealth, testPiConnection } from "./piRemote";
import type { PiConnectionRequest } from "./piRemote";

export const PI_USB_GADGET_HOSTNAME = "rescue-pi.local";
export const PI_LEGACY_HOSTNAME = "raspberrypi.local";
export const PI_USB_GADGET_FALLBACK_IP = "10.12.194.1";
export const PI_USB_MANUAL_FALLBACK_IP = "10.43.0.1";

export type PiDiscoveryCandidateSource = "saved" | "usb-gadget-hostname" | "mdns" | "usb-gadget-fallback" | "manual-usb-fallback";
export type PiDiscoveryProbeStatus = "online" | "offline" | "skipped";
export type PiDiscoveryResultStatus = "online" | "partial" | "offline";
export type PiDiscoveryServiceId = "aBoardBridge" | "piServoBridge" | "mainCamera" | "secondaryCamera";

export interface PiDiscoveryCandidate {
  host: string;
  label: string;
  source: PiDiscoveryCandidateSource;
}

export interface PiDiscoveryProbe {
  status: PiDiscoveryProbeStatus;
  detail: string;
  durationMs?: number;
}

export interface PiDiscoveryServiceProbe extends PiDiscoveryProbe {
  id: PiDiscoveryServiceId;
  label: string;
  port: number;
}

export interface PiDiscoveryProbeResult {
  candidate: PiDiscoveryCandidate;
  status: PiDiscoveryResultStatus;
  score: number;
  ssh: PiDiscoveryProbe;
  services: PiDiscoveryServiceProbe[];
}

export interface PiDiscoveryRequest extends Partial<Pick<PiConnectionRequest, "password" | "privateKeyPath">> {
  savedHost?: string;
  port: number;
  username: string;
}

interface PiDiscoveryOptions {
  fetcher?: typeof fetch;
  helperBaseUrl?: string;
  serviceTimeoutMs?: number;
}

interface PiDiscoveryService {
  id: PiDiscoveryServiceId;
  label: string;
  port: number;
  path: string;
}

const PI_DISCOVERY_SERVICES: PiDiscoveryService[] = [
  { id: "aBoardBridge", label: "A board bridge", port: 17353, path: "/health" },
  { id: "piServoBridge", label: "Pi servo bridge", port: 17354, path: "/health" },
  { id: "mainCamera", label: "Main camera", port: 8080, path: "/latency" },
  { id: "secondaryCamera", label: "Second camera", port: 8081, path: "/latency" }
];

export function buildPiDiscoveryCandidates(savedHost = ""): PiDiscoveryCandidate[] {
  const candidates: PiDiscoveryCandidate[] = [
    { host: savedHost, label: "Saved host", source: "saved" },
    { host: PI_USB_GADGET_HOSTNAME, label: "USB hostname", source: "usb-gadget-hostname" },
    { host: PI_LEGACY_HOSTNAME, label: "mDNS hostname", source: "mdns" },
    { host: PI_USB_GADGET_FALLBACK_IP, label: "USB gadget fallback", source: "usb-gadget-fallback" },
    { host: PI_USB_MANUAL_FALLBACK_IP, label: "Manual USB fallback", source: "manual-usb-fallback" }
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const host = candidate.host.trim();
    const key = host.toLowerCase();
    if (!host || seen.has(key)) {
      return false;
    }
    seen.add(key);
    candidate.host = host;
    return true;
  });
}

export function piDiscoveryHasAuth(request: PiDiscoveryRequest): boolean {
  return Boolean(request.username.trim() && (request.password || request.privateKeyPath?.trim()));
}

export async function discoverRaspberryPi(request: PiDiscoveryRequest, options: PiDiscoveryOptions = {}): Promise<PiDiscoveryProbeResult[]> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  let helperReady = false;
  try {
    await requestPiHelperHealth({ fetcher, baseUrl: options.helperBaseUrl });
    helperReady = true;
  } catch {
    helperReady = false;
  }

  const candidates = buildPiDiscoveryCandidates(request.savedHost);
  const results = await Promise.all(candidates.map((candidate) => probePiCandidate(candidate, request, helperReady, options)));
  return results.sort(comparePiDiscoveryResults);
}

export function recommendedPiDiscoveryResult(results: PiDiscoveryProbeResult[]): PiDiscoveryProbeResult | null {
  return results.find((result) => result.status !== "offline") ?? null;
}

async function probePiCandidate(candidate: PiDiscoveryCandidate, request: PiDiscoveryRequest, helperReady: boolean, options: PiDiscoveryOptions): Promise<PiDiscoveryProbeResult> {
  const [ssh, services] = await Promise.all([
    probeSsh(candidate.host, request, helperReady, options),
    Promise.all(PI_DISCOVERY_SERVICES.map((service) => probeHttpService(candidate.host, service, options)))
  ]);
  const onlineServices = services.filter((service) => service.status === "online").length;
  const score = (ssh.status === "online" ? 100 : 0) + onlineServices * 20 + sourceScore(candidate.source);
  const status: PiDiscoveryResultStatus = ssh.status === "online" ? "online" : onlineServices > 0 ? "partial" : "offline";
  return { candidate, status, score, ssh, services };
}

async function probeSsh(host: string, request: PiDiscoveryRequest, helperReady: boolean, options: PiDiscoveryOptions): Promise<PiDiscoveryProbe> {
  if (!helperReady) {
    return { status: "skipped", detail: "pi-helper unavailable" };
  }
  if (!piDiscoveryHasAuth(request)) {
    return { status: "skipped", detail: "auth required" };
  }
  try {
    const result = await testPiConnection(
      {
        host,
        port: request.port,
        username: request.username.trim(),
        password: request.password,
        privateKeyPath: request.privateKeyPath
      },
      { fetcher: options.fetcher, baseUrl: options.helperBaseUrl }
    );
    return { status: "online", detail: "ssh ready", durationMs: result.durationMs };
  } catch (error) {
    return { status: "offline", detail: remoteErrorMessage(error) };
  }
}

async function probeHttpService(host: string, service: PiDiscoveryService, options: PiDiscoveryOptions): Promise<PiDiscoveryServiceProbe> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) {
    return { ...service, status: "skipped", detail: "fetch unavailable" };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.serviceTimeoutMs ?? 1200);
  try {
    const response = await fetcher(`http://${host}:${service.port}${service.path}`, { signal: controller.signal });
    return {
      ...service,
      status: response.ok ? "online" : "offline",
      detail: response.ok ? "ready" : `http ${response.status}`
    };
  } catch (error) {
    return { ...service, status: "offline", detail: remoteErrorMessage(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function comparePiDiscoveryResults(a: PiDiscoveryProbeResult, b: PiDiscoveryProbeResult): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  return sourceScore(b.candidate.source) - sourceScore(a.candidate.source);
}

function sourceScore(source: PiDiscoveryCandidateSource): number {
  if (source === "saved") {
    return 5;
  }
  if (source === "usb-gadget-hostname") {
    return 4;
  }
  if (source === "usb-gadget-fallback") {
    return 3;
  }
  if (source === "manual-usb-fallback") {
    return 2;
  }
  return 1;
}

function remoteErrorMessage(error: unknown): string {
  if (error instanceof PiRemoteError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "unavailable";
}
