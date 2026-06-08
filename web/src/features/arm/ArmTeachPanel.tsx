import { Download, Play, Radar, Save, Square, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
          <p className="eyebrow">{t("armTeach.eyebrow")}</p>
          <h3>{t("armTeach.title")}</h3>
        </div>
        <span className={`teach-status ${armTeachStatus}`}>{t(`armTeach.status.${armTeachStatus}`)}</span>
      </div>
      <div className="command-grid arm-teach-grid">
        <label>
          <span>{t("armTeach.track")}</span>
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
            {armTeachTracks.length === 0 && !armTeachUnsavedTrack ? <option value="">{t("armTeach.noTracks")}</option> : null}
            {armTeachTracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("armTeach.name")}</span>
          <input value={armTeachDraftName} onChange={(event) => setArmTeachDraftName(event.target.value)} placeholder={t("armTeach.namePlaceholder")} />
        </label>
        <label>
          <span>{t("armTeach.notes")}</span>
          <input value={armTeachDraftNotes} onChange={(event) => setArmTeachDraftNotes(event.target.value)} placeholder={t("armTeach.notesPlaceholder")} />
        </label>
      </div>
      <div className="arm-status-strip arm-teach-metrics">
        <Metric label={t("armTeach.metrics.duration")} value={durationSeconds.toFixed(1)} suffix=" s" />
        <Metric label={t("armTeach.metrics.samples")} value={selectedTrack?.samples.length ?? armTeachSampleCount} />
        <Metric label={t("armTeach.metrics.frequency")} value="10" suffix=" Hz" />
        <Metric label={t("armTeach.metrics.joints")} value={selectedTrack?.jointIds.length ?? getEnabledArmTeachJoints().length} />
        <Metric label={t("armTeach.metrics.latestSample")} value={armTeachLastSampleStatus || "--"} tone={armTeachStatus === "error" ? "danger" : armTeachStatus === "recording" ? "warning" : "neutral"} />
      </div>
      <div className="action-grid arm-teach-actions">
        <button className="icon-button primary" disabled={!canRecord} onClick={() => void startArmTeachRecording()} type="button">
          <Radar size={18} />
          <span>{t("armTeach.actions.start")}</span>
        </button>
        <button className="icon-button danger" disabled={!canStop} onClick={() => void stopArmTeachRecording()} type="button">
          <Square size={18} />
          <span>{t("armTeach.actions.stopRecording")}</span>
        </button>
        <button className="icon-button" disabled={!canPlay} onClick={() => void playArmTeachTrack()} type="button">
          <Play size={18} />
          <span>{t("armTeach.actions.playback")}</span>
        </button>
        <button className="icon-button" disabled={armTeachStatus !== "playing"} onClick={() => void pauseArmTeachPlayback()} type="button">
          <Square size={18} />
          <span>{t("armTeach.actions.pausePlayback")}</span>
        </button>
        <button className="icon-button" disabled={!canSave} onClick={() => void saveCurrentArmTeachTrack()} type="button">
          <Save size={18} />
          <span>{t("armTeach.actions.save")}</span>
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
          <span>{t("armTeach.actions.delete")}</span>
        </button>
      </div>
    </section>
  );
}
