import { describe, expect, it, vi } from "vitest";
import {
  checkPiReadiness,
  buildPiUsbGadgetSetupCommand,
  checkPiCamera,
  createPiRunPlan,
  execPiCommand,
  installPiCameraTools,
  isPiRemoteError,
  parsePiCameraCheckOutput,
  parsePiCameraLanHost,
  requestPiHelperHealth,
  runUploadedFile,
  setupPiCameraScripts,
  setupPiUsbGadget,
  setupPiWorkspace,
  startPiCameraStream,
  stopPiCameraStream,
  testPiConnection,
  uploadAndExecPiFile,
  uploadPiFile
} from "./piRemote";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function textFile(text = "print('ok')") {
  return new File([text], "run.py", { type: "text/x-python" });
}

describe("Raspberry Pi remote client", () => {
  it("reports the local helper as unavailable when fetch fails", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("connection refused");
    });

    await expect(requestPiHelperHealth({ fetcher: fetcher as unknown as typeof fetch })).rejects.toMatchObject({
      code: "helperUnavailable",
      message: "connection refused"
    });
  });

  it("reads helper health", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: true,
        maxUploadBytes: 50,
        defaultCommandTimeoutMs: 30_000,
        maxCommandTimeoutMs: 300_000
      })
    );

    await expect(requestPiHelperHealth({ fetcher: fetcher as unknown as typeof fetch })).resolves.toEqual({
      ok: true,
      maxUploadBytes: 50,
      defaultCommandTimeoutMs: 30_000,
      maxCommandTimeoutMs: 300_000
    });
  });

  it("tests SSH connection and preserves the request shape", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true, durationMs: 48 }));

    await expect(
      testPiConnection(
        { host: "raspberrypi.local", port: 22, username: "pi", password: "secret" },
        { fetcher: fetcher as unknown as typeof fetch }
      )
    ).resolves.toEqual({ ok: true, durationMs: 48 });
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:17352/connect-test",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ host: "raspberrypi.local", port: 22, username: "pi", password: "secret" })
      })
    );
  });

  it("uploads a file as base64", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true, remotePath: "/home/pi/run.py", sizeBytes: 11, durationMs: 120 }));

    await expect(
      uploadPiFile(
        {
          host: "192.168.1.20",
          port: 22,
          username: "pi",
          password: "secret",
          remotePath: "/home/pi/run.py",
          file: textFile("hello")
        },
        { fetcher: fetcher as unknown as typeof fetch }
      )
    ).resolves.toEqual({ ok: true, remotePath: "/home/pi/run.py", sizeBytes: 11, durationMs: 120 });

    const init = (fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0][1];
    const body = JSON.parse(String(init.body));
    expect(body.contentBase64).toBe("aGVsbG8=");
    expect(body.remotePath).toBe("/home/pi/run.py");
  });

  it("executes a command and exposes stderr plus exit code", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        stdout: "ok\n",
        stderr: "warning\n",
        exitCode: 2,
        signal: null,
        durationMs: 77,
        timedOut: false
      })
    );

    await expect(
      execPiCommand(
        { host: "pi.local", port: 22, username: "pi", password: "secret", command: "python3 run.py", timeoutMs: 10_000 },
        { fetcher: fetcher as unknown as typeof fetch }
      )
    ).resolves.toEqual({
      stdout: "ok\n",
      stderr: "warning\n",
      exitCode: 2,
      signal: null,
      durationMs: 77,
      timedOut: false
    });
  });

  it("uploads and executes in one request", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: true,
        upload: { ok: true, remotePath: "/home/pi/run.py", sizeBytes: 5, durationMs: 11 },
        exec: { stdout: "done", stderr: "", exitCode: 0, signal: null, durationMs: 22, timedOut: false }
      })
    );

    await expect(
      uploadAndExecPiFile(
        {
          host: "pi.local",
          port: 22,
          username: "pi",
          password: "secret",
          remotePath: "/home/pi/run.py",
          command: "python3 /home/pi/run.py",
          file: textFile("hello")
        },
        { fetcher: fetcher as unknown as typeof fetch }
      )
    ).resolves.toMatchObject({
      ok: true,
      upload: { remotePath: "/home/pi/run.py" },
      exec: { exitCode: 0, stdout: "done" }
    });
  });

  it("exposes helper request failures", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ error: "host is required" }, 400));

    try {
      await execPiCommand({ host: "", port: 22, username: "pi", password: "secret", command: "uptime" }, { fetcher: fetcher as unknown as typeof fetch });
      throw new Error("expected command to fail");
    } catch (error) {
      expect(isPiRemoteError(error)).toBe(true);
      expect(error).toMatchObject({
        code: "requestFailed",
        message: "host is required"
      });
    }
  });

  it("builds one-click run commands for Python and shell files", () => {
    expect(createPiRunPlan("robot.py", "~/rescue-robot", "pi")).toEqual({
      mode: "python",
      remotePath: "/home/pi/rescue-robot/uploads/robot.py",
      command: "python3 '/home/pi/rescue-robot/uploads/robot.py'",
      canExecute: true
    });
    expect(createPiRunPlan("start.sh", "~/rescue-robot", "pi")).toEqual({
      mode: "shell",
      remotePath: "/home/pi/rescue-robot/uploads/start.sh",
      command: "bash '/home/pi/rescue-robot/uploads/start.sh'",
      canExecute: true
    });
  });

  it("uploads unknown file types without executing them", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true, remotePath: "/home/pi/rescue-robot/uploads/readme.txt", sizeBytes: 5, durationMs: 10 }));

    await expect(
      runUploadedFile(
        {
          host: "pi.local",
          port: 22,
          username: "pi",
          password: "secret",
          workspaceDir: "~/rescue-robot",
          file: new File(["hello"], "readme.txt")
        },
        { fetcher: fetcher as unknown as typeof fetch }
      )
    ).resolves.toMatchObject({
      exec: null,
      plan: { mode: "uploadOnly", canExecute: false }
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("checks Pi readiness with a friendly parsed result", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, durationMs: 15 }))
      .mockResolvedValueOnce(jsonResponse({ stdout: "python:0 workspace:1\n", stderr: "", exitCode: 0, signal: null, durationMs: 20, timedOut: false }));

    await expect(
      checkPiReadiness(
        { host: "pi.local", port: 22, username: "pi", password: "secret" },
        { workspaceDir: "~/rescue-robot" },
        { fetcher: fetcher as unknown as typeof fetch }
      )
    ).resolves.toMatchObject({
      pythonAvailable: true,
      workspaceReady: false
    });
  });

  it("creates the Pi workspace and runner script without installing packages", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ stdout: "Python 3.11.2\n", stderr: "", exitCode: 0, signal: null, durationMs: 30, timedOut: false }));

    await expect(
      setupPiWorkspace(
        { host: "pi.local", port: 22, username: "pi", password: "secret" },
        { workspaceDir: "~/rescue-robot" },
        { fetcher: fetcher as unknown as typeof fetch }
      )
    ).resolves.toMatchObject({
      ok: true,
      workspaceDir: "/home/pi/rescue-robot",
      uploadsDir: "/home/pi/rescue-robot/uploads"
    });
    const body = JSON.parse(String((fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0][1].body));
    expect(body.command).toContain("mkdir -p '/home/pi/rescue-robot/uploads'");
    expect(body.command).toContain("python3 --version");
    expect(body.command).not.toContain("apt install");
  });

  it("parses USB camera readiness from remote output", () => {
    expect(parsePiCameraCheckOutput("device:/dev/video0\ncamera:0\nustreamer:0\nwebrtc:0\nrunning:1\n")).toEqual({
      cameraAvailable: true,
      device: "/dev/video0",
      ustreamerAvailable: true,
      webrtcAvailable: true,
      streamRunning: false
    });

    expect(parsePiCameraCheckOutput("device:\ncamera:1\nustreamer:1\nrunning:1\n")).toEqual({
      cameraAvailable: false,
      device: null,
      ustreamerAvailable: false,
      webrtcAvailable: false,
      streamRunning: false
    });
  });

  it("prefers the Pi LAN IP for browser camera URLs when the remote reports it", () => {
    expect(parsePiCameraLanHost("lan_ip:192.168.1.44\n")).toBe("192.168.1.44");
    expect(parsePiCameraLanHost("lan_ip:\n")).toBe("");
    expect(parsePiCameraLanHost("lan_ip:raspberrypi.local\n")).toBe("");
  });

  it("checks USB camera, ustreamer, and stream status", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        stdout: "device:/dev/video0\ncamera:0\nustreamer:0\nwebrtc:0\nrunning:0\nlan_ip:192.168.1.44\n",
        stderr: "",
        exitCode: 0,
        signal: null,
        durationMs: 20,
        timedOut: false
      })
    );

    await expect(
      checkPiCamera(
        { host: "pi.local", port: 22, username: "pi", password: "secret" },
        { workspaceDir: "~/rescue-robot" },
        { fetcher: fetcher as unknown as typeof fetch }
      )
    ).resolves.toMatchObject({
      cameraAvailable: true,
      device: "/dev/video0",
      ustreamerAvailable: true,
      webrtcAvailable: true,
      streamRunning: true,
      streamUrl: "http://192.168.1.44:8080/stream",
      webrtcOfferUrl: "http://192.168.1.44:8080/offer"
    });
  });

  it("creates camera start and stop scripts without installing packages", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ stdout: "", stderr: "", exitCode: 0, signal: null, durationMs: 30, timedOut: false }));

    await expect(
      setupPiCameraScripts(
        { host: "pi.local", port: 22, username: "pi", password: "secret" },
        { workspaceDir: "~/rescue-robot" },
        { fetcher: fetcher as unknown as typeof fetch }
      )
    ).resolves.toMatchObject({
      ok: true,
      workspaceDir: "/home/pi/rescue-robot"
    });
    const body = JSON.parse(String((fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0][1].body));
    expect(body.command).toContain("camera-start.sh");
    expect(body.command).toContain('pid_file="${camera_dir}/camera-${port}.pid"');
    expect(body.command).toContain('log_file="${camera_dir}/camera-${port}.log"');
    expect(body.command).toContain("/latency");
    expect(body.command).toContain("/offer");
    expect(body.command).toContain("camera-venv");
    expect(body.command).toContain("aiohttp aiortc");
    expect(body.command).toContain("ustreamer --device");
    expect(body.command).toContain("'ffmpeg', '-hide_banner'");
    expect(body.command).toContain("'-fflags', 'nobuffer'");
    expect(body.command).toContain("'-c:v', 'copy'");
    expect(body.command).toContain('fps="${CAMERA_FPS:-30}"');
    expect(body.command).not.toContain("apt-get install");
  });

  it("starts the USB camera stream and returns the browser URL", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ stdout: "", stderr: "", exitCode: 0, signal: null, durationMs: 15, timedOut: false }))
      .mockResolvedValueOnce(jsonResponse({ stdout: "stream:0\ndevice:/dev/video0\nport:8080\nsize:320x240\nfps:30\nwebrtc:0\nlan_ip:192.168.1.45\npid:123\n", stderr: "", exitCode: 0, signal: null, durationMs: 40, timedOut: false }));

    await expect(
      startPiCameraStream(
        { host: "raspberrypi.local", port: 22, username: "pi", password: "secret" },
        { workspaceDir: "~/rescue-robot" },
        { fetcher: fetcher as unknown as typeof fetch, width: 320, height: 240, fps: 30 }
      )
    ).resolves.toMatchObject({
      ok: true,
      device: "/dev/video0",
      streamUrl: "http://192.168.1.45:8080/stream",
      webrtcOfferUrl: "http://192.168.1.45:8080/offer",
      exec: { exitCode: 0 }
    });

    const startBody = JSON.parse(String((fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[1][1].body));
    expect(startBody.command).toContain("CAMERA_WIDTH=320 CAMERA_HEIGHT=240 CAMERA_FPS=30");
    expect(startBody.command).toContain("camera-start.sh");
    expect(startBody.command).toContain("'/dev/video0' 8080");
  });

  it("checks and starts the secondary USB camera on its own port", async () => {
    const secondarySource = { id: "secondary", label: "Second Camera", devicePath: "/dev/video1", port: 8081, streamUrl: "http://pi.local:8081/stream" };
    const checkFetcher = vi.fn(async () =>
      jsonResponse({
        stdout: "device:/dev/video1\ncamera:0\nustreamer:0\nwebrtc:1\nrunning:1\n",
        stderr: "",
        exitCode: 0,
        signal: null,
        durationMs: 20,
        timedOut: false
      })
    );

    await expect(
      checkPiCamera(
        { host: "pi.local", port: 22, username: "pi", password: "secret" },
        { workspaceDir: "~/rescue-robot" },
        secondarySource,
        { fetcher: checkFetcher as unknown as typeof fetch }
      )
    ).resolves.toMatchObject({
      cameraAvailable: true,
      device: "/dev/video1",
      streamRunning: false,
      streamUrl: "http://pi.local:8081/stream",
      webrtcOfferUrl: "http://pi.local:8081/offer"
    });
    const checkBody = JSON.parse(String((checkFetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0][1].body));
    expect(checkBody.command).toContain("requested_device='/dev/video1'");
    expect(checkBody.command).toContain("camera-8081.pid");

    const startFetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ stdout: "", stderr: "", exitCode: 0, signal: null, durationMs: 15, timedOut: false }))
      .mockResolvedValueOnce(jsonResponse({ stdout: "stream:0\ndevice:/dev/video1\nport:8081\nsize:640x480\nfps:30\nwebrtc:1\npid:456\n", stderr: "", exitCode: 0, signal: null, durationMs: 40, timedOut: false }));

    await expect(
      startPiCameraStream(
        { host: "pi.local", port: 22, username: "pi", password: "secret" },
        { workspaceDir: "~/rescue-robot" },
        secondarySource,
        { fetcher: startFetcher as unknown as typeof fetch, width: 640, height: 480, fps: 30 }
      )
    ).resolves.toMatchObject({
      ok: true,
      device: "/dev/video1",
      streamUrl: "http://pi.local:8081/stream",
      webrtcOfferUrl: "http://pi.local:8081/offer"
    });
    const startBody = JSON.parse(String((startFetcher.mock.calls as unknown as Array<[string, RequestInit]>)[1][1].body));
    expect(startBody.command).toContain("'/dev/video1' 8081");
  });

  it("stops the USB camera stream through the pid file", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ stdout: "stopped:1\n", stderr: "", exitCode: 0, signal: null, durationMs: 18, timedOut: false }));

    await expect(
      stopPiCameraStream(
        { host: "pi.local", port: 22, username: "pi", password: "secret" },
        { workspaceDir: "~/rescue-robot" },
        { fetcher: fetcher as unknown as typeof fetch }
      )
    ).resolves.toMatchObject({ exitCode: 0, stdout: "stopped:1\n" });

    const body = JSON.parse(String((fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0][1].body));
    expect(body.command).toContain("camera-stop.sh");
    expect(body.command).toContain("camera-8080.pid");
    expect(body.command).toContain("camera.pid");
  });

  it("stops the secondary stream without touching the legacy primary pid file", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ stdout: "stopped:1\n", stderr: "", exitCode: 0, signal: null, durationMs: 18, timedOut: false }));

    await expect(
      stopPiCameraStream(
        { host: "pi.local", port: 22, username: "pi", password: "secret" },
        { workspaceDir: "~/rescue-robot" },
        { id: "secondary", label: "Second Camera", devicePath: "/dev/video1", port: 8081, streamUrl: "http://pi.local:8081/stream" },
        { fetcher: fetcher as unknown as typeof fetch }
      )
    ).resolves.toMatchObject({ exitCode: 0 });

    const body = JSON.parse(String((fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0][1].body));
    expect(body.command).toContain("camera-stop.sh' 8081");
    expect(body.command).toContain("camera-8081.pid");
    expect(body.command).not.toContain("legacy_pid_file");
  });

  it("keeps camera tool installation explicit", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ stdout: "done", stderr: "", exitCode: 0, signal: null, durationMs: 100, timedOut: false }));

    await expect(
      installPiCameraTools({ host: "pi.local", port: 22, username: "pi", password: "secret" }, { fetcher: fetcher as unknown as typeof fetch })
    ).resolves.toMatchObject({ ok: true });
    const body = JSON.parse(String((fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0][1].body));
    expect(body.command).toBe("sudo -n apt-get update && sudo -n apt-get install -y ffmpeg v4l-utils python3-venv python3-pip");
  });

  it("builds a USB gadget setup command for Trixie and legacy systems", () => {
    const command = buildPiUsbGadgetSetupCommand();
    expect(command).toContain("hostnamectl set-hostname rescue-pi");
    expect(command).toContain("rpi-usb-gadget on");
    expect(command).toContain("dtoverlay=dwc2");
    expect(command).toContain("modules-load=dwc2,g_ether");
    expect(command).toContain("10.43.0.1/24");
    expect(command).toContain("reboot_required:1");
  });

  it("runs USB gadget setup through the Pi helper", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ stdout: "mode:rpi-usb-gadget\n", stderr: "", exitCode: 0, signal: null, durationMs: 55, timedOut: false }));

    await expect(
      setupPiUsbGadget({ host: "rescue-pi.local", port: 22, username: "robot1", password: "secret" }, { fetcher: fetcher as unknown as typeof fetch })
    ).resolves.toMatchObject({ ok: true, exec: { exitCode: 0 } });

    const body = JSON.parse(String((fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0][1].body));
    expect(body.host).toBe("rescue-pi.local");
    expect(body.timeoutMs).toBe(120_000);
    expect(body.command).toContain("usb_gadget_setup:start");
  });
});
