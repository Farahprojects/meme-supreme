import styles from "../../SceneCard.module.css";
import { MotionType, MOTION_OPTS, CROP_RATIOS } from "../types";

// ── Timing Tool ─────────────────────────────────────────────────────────────

interface TimingToolProps {
    duration: number;
    trimStart: number;
    trimEnd: number;
    onChangeDuration: (val: number) => void;
    onChangeTrimStart: (val: number) => void;
    onChangeTrimEnd: (val: number) => void;
}

export function TimingTool({
    duration,
    trimStart,
    trimEnd,
    onChangeDuration,
    onChangeTrimStart,
    onChangeTrimEnd,
}: TimingToolProps) {
    return (
        <div className={styles.editSliders}>
            <div className={styles.sliderRow}>
                <div className={styles.sliderHeader}>
                    <span className={styles.sliderLabel}>Duration</span>
                    <span className={styles.sliderValue}>{duration}s</span>
                </div>
                <input type="range" min={1} max={30} value={duration} onChange={(e) => onChangeDuration(Number(e.target.value))} className={styles.slider} />
            </div>
            <div className={styles.sliderRow}>
                <div className={styles.sliderHeader}>
                    <span className={styles.sliderLabel}>Trim start</span>
                    <span className={styles.sliderValue}>{trimStart}%</span>
                </div>
                <input type="range" min={0} max={100} value={trimStart} onChange={(e) => onChangeTrimStart(Number(e.target.value))} className={styles.slider} />
            </div>
            <div className={styles.sliderRow}>
                <div className={styles.sliderHeader}>
                    <span className={styles.sliderLabel}>Trim end</span>
                    <span className={styles.sliderValue}>{trimEnd}%</span>
                </div>
                <input type="range" min={0} max={100} value={trimEnd} onChange={(e) => onChangeTrimEnd(Number(e.target.value))} className={styles.slider} />
            </div>
        </div>
    );
}

// ── Frame Tool ──────────────────────────────────────────────────────────────

interface FrameToolProps {
    selectedCrop: string;
    zoom: number;
    onChangeCrop: (val: string) => void;
    onChangeZoom: (val: number) => void;
}

export function FrameTool({
    selectedCrop,
    zoom,
    onChangeCrop,
    onChangeZoom,
}: FrameToolProps) {
    return (
        <div className={styles.editSliders}>
            <span className={styles.sectionLabel}>Crop</span>
            <div className={styles.pillRow}>
                {CROP_RATIOS.map((r) => (
                    <button key={r} type="button" className={`${styles.pill} ${selectedCrop === r ? styles.pillActive : ""}`} onClick={() => onChangeCrop(r)}>{r}</button>
                ))}
            </div>
            <div className={styles.sliderRow} style={{ marginTop: "0.2rem" }}>
                <div className={styles.sliderHeader}>
                    <span className={styles.sliderLabel}>Zoom</span>
                    <span className={styles.sliderValue}>{zoom}%</span>
                </div>
                <input type="range" min={100} max={200} value={zoom} onChange={(e) => onChangeZoom(Number(e.target.value))} className={styles.slider} />
            </div>
        </div>
    );
}

// ── Motion Tool ─────────────────────────────────────────────────────────────

interface MotionToolProps {
    selectedMotion: MotionType;
    onChangeMotion: (val: MotionType) => void;
}

export function MotionTool({
    selectedMotion,
    onChangeMotion,
}: MotionToolProps) {
    return (
        <div className={styles.editSliders}>
            <div className={styles.pillRow}>
                {MOTION_OPTS.map((m) => (
                    <button key={m.id} type="button" className={`${styles.pill} ${selectedMotion === m.id ? styles.pillActive : ""}`} onClick={() => onChangeMotion(m.id)}>{m.label}</button>
                ))}
            </div>
            {selectedMotion !== "none" && (
                <p className={styles.motionHint}>
                    {MOTION_OPTS.find(o => o.id === selectedMotion)?.hint}
                </p>
            )}
        </div>
    );
}
