import { Download, Play, Radar, Save, Square, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { ArmTeachTrack } from "../../lib/armTeach";
import type { ArmTeachStatus } from "../../app/appModel";
import { Metric } from "../../shared/ui/AppChrome";

interface ArmTeachPanelProps {
  armTeachDraftName: string;
  armTeachDraftNotes: string;
  armTeachElapsedMs: number;
  armTeachLastSampleStatus: string;
  armTeachSampleCount: number;
  armTeachStatus: ArmTeachStatus;
  armTeachTracks: ArmTeachTrack[];
  armTeachUnsavedTrack: ArmTeachTrack | null;
  exportArmTeachTrack: (track: ArmTeachTrack | null, format: "json" | "jsonl") => void;
  getEnabledArmTeachJoints: () => unknown[];
  pauseArmTeachPlayback: () => Promise<void>;
  playArmTeachTrack: () => Promise<void>;
  removeSelectedArmTeachTrack: () => Promise<void>;
  saveCurrentArmTeachTrack: () => Promise<void>;
  selectedArmTeachTrack: ArmTeachTrack | null;
  servoBusConnected: () => boolean;
  setArmTeachDraftName: Dispatch<SetStateAction<string>>;
  setArmTeachDraftNotes: Dispatch<SetStateAction<string>>;
  setSelectedArmTeachTrackId: Dispatch<SetStateAction<string | null>>;
  startArmTeachRecording: () => Promise<void>;
  stopArmTeachRecording: () => Promise<void>;
}

export function ArmTeachPanel({
  armTeachDraftName,
  armTeachDraftNotes,
  armTeachElapsedMs,
  armTeachLastSampleStatus,
  armTeachSampleCount,
  armTeachStatus,
  armTeachTracks,
  armTeachUnsavedTrack,
  exportArmTeachTrack,
  getEnabledArmTeachJoints,
  pauseArmTeachPlayback,
  playArmTeachTrack,
  removeSelectedArmTeachTrack,
  saveCurrentArmTeachTrack,
  selectedArmTeachTrack,
  servoBusConnected,
  setArmTeachDraftName,
  setArmTeachDraftNotes,
  setSelectedArmTeachTrackId,
  startArmTeachRecording,
  stopArmTeachRecording
}: ArmTeachPanelProps) {
  const selectedTrack = selectedArmTeachTrack;
  const canRecord = servoBusConnected() && armTeachStatus !== "recording" && armTeachStatus !== "playing" && getEnabledArmTeachJoints().length > 0;
  const canStop = armTeachStatus === "recording" || armTeachStatus === "preparing" || armTeachStatus === "error";
  const canPlay = Boolean(selectedTrack) && servoBusConnected() && armTeachStatus !== "recording" && armTeachStatus !== "playing";
  const canSave = Boolean(armTeachUnsavedTrack || selectedTrack);
  const durationSeconds = (selectedTrack?.durationMs ?? armTeachElapsedMs) / 1000;

  return (
    <section className="arm-teach-panel">
      <div className="panel-heading-row">
        <div>
          <p className="eyebrow">ARM TEACH</p>
          <h3>示教录制</h3>
        </div>
        <span className={`teach-status ${armTeachStatus}`}>{armTeachStatus.toUpperCase()}</span>
      </div>
      <div className="command-grid arm-teach-grid">
        <label>
          <span>轨迹</span>
          <select
            value={selectedTrack?.id ?? ""}
            onChange={(event) => {
              const track = armTeachUnsavedTrack?.id === event.target.value ? armTeachUnsavedTrack : armTeachTracks.find((item) => item.id === event.target.value) ?? null;
              setSelectedArmTeachTrackId(track?.id ?? null);
              setArmTeachDraftName(track?.name ?? "");
              setArmTeachDraftNotes(track?.metadata.notes ?? "");
            }}
          >
            {armTeachUnsavedTrack ? <option value={armTeachUnsavedTrack.id}>{armTeachUnsavedTrack.name} *</option> : null}
            {armTeachTracks.length === 0 && !armTeachUnsavedTrack ? <option value="">暂无轨迹</option> : null}
            {armTeachTracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>名称</span>
          <input value={armTeachDraftName} onChange={(event) => setArmTeachDraftName(event.target.value)} placeholder="Teach route" />
        </label>
        <label>
          <span>备注</span>
          <input value={armTeachDraftNotes} onChange={(event) => setArmTeachDraftNotes(event.target.value)} placeholder="task notes" />
        </label>
      </div>
      <div className="arm-status-strip arm-teach-metrics">
        <Metric label="时长" value={durationSeconds.toFixed(1)} suffix=" s" />
        <Metric label="采样点" value={selectedTrack?.samples.length ?? armTeachSampleCount} />
        <Metric label="频率" value="10" suffix=" Hz" />
        <Metric label="关节" value={selectedTrack?.jointIds.length ?? getEnabledArmTeachJoints().length} />
        <Metric label="最近采样" value={armTeachLastSampleStatus || "--"} tone={armTeachStatus === "error" ? "danger" : armTeachStatus === "recording" ? "warning" : "neutral"} />
      </div>
      <div className="action-grid arm-teach-actions">
        <button className="icon-button primary" disabled={!canRecord} onClick={() => void startArmTeachRecording()} type="button">
          <Radar size={18} />
          <span>开始示教</span>
        </button>
        <button className="icon-button danger" disabled={!canStop} onClick={() => void stopArmTeachRecording()} type="button">
          <Square size={18} />
          <span>停止录制</span>
        </button>
        <button className="icon-button" disabled={!canPlay} onClick={() => void playArmTeachTrack()} type="button">
          <Play size={18} />
          <span>回放</span>
        </button>
        <button className="icon-button" disabled={armTeachStatus !== "playing"} onClick={() => void pauseArmTeachPlayback()} type="button">
          <Square size={18} />
          <span>暂停回放</span>
        </button>
        <button className="icon-button" disabled={!canSave} onClick={() => void saveCurrentArmTeachTrack()} type="button">
          <Save size={18} />
          <span>保存</span>
        </button>
        <button className="icon-button" disabled={!selectedTrack} onClick={() => exportArmTeachTrack(selectedTrack, "json")} type="button">
          <Download size={18} />
          <span>JSON</span>
        </button>
        <button className="icon-button" disabled={!selectedTrack} onClick={() => exportArmTeachTrack(selectedTrack, "jsonl")} type="button">
          <Download size={18} />
          <span>JSONL</span>
        </button>
        <button className="icon-button danger" disabled={!selectedTrack} onClick={() => void removeSelectedArmTeachTrack()} type="button">
          <Trash2 size={18} />
          <span>删除</span>
        </button>
      </div>
    </section>
  );
}
