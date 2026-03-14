import styles from "../page.module.css";
import { StudioMode, StudioTone, CarouselFormat, ReelGoal, ReelLength, ReelScript, ReelScriptStatus } from "../types";
import { TONES, MAX_REEL_REF_IMAGES } from "../constants";

interface StudioFormProps {
    studioMode: StudioMode;
    setStudioMode: (mode: StudioMode) => void;
    targetNames: string;
    setTargetNames: (v: string) => void;
    context: string;
    setContext: (v: string) => void;
    
    // Carousel specific
    carouselFormat?: CarouselFormat;
    setCarouselFormat?: (f: CarouselFormat) => void;
    carouselTone?: StudioTone;
    setCarouselTone?: (t: StudioTone) => void;
    
    // Reels specific
    reelGoal?: ReelGoal;
    setReelGoal?: (g: ReelGoal) => void;
    reelLength?: ReelLength;
    setReelLength?: (l: ReelLength) => void;
    reelRefPreviews?: string[];
    removeReelRefImage?: (i: number) => void;
    addReelRefImage?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    reelScript?: ReelScript | null;
    setReelScript?: React.Dispatch<React.SetStateAction<ReelScript | null>>;
    reelScriptStatus?: ReelScriptStatus;
    handleWriteScript?: () => void;
    
    // Images specific
    selectedTones?: Set<StudioTone>;
    toggleTone?: (t: StudioTone) => void;
    setSelectedTones?: (s: Set<StudioTone>) => void;
}

export function StudioForm({
    studioMode, setStudioMode,
    targetNames, setTargetNames,
    context, setContext,
    carouselFormat, setCarouselFormat,
    carouselTone, setCarouselTone,
    reelGoal, setReelGoal,
    reelLength, setReelLength,
    reelRefPreviews, removeReelRefImage, addReelRefImage,
    reelScript, setReelScript,
    reelScriptStatus, handleWriteScript,
    selectedTones, toggleTone, setSelectedTones
}: StudioFormProps) {
    return (
        <section className={styles.formSection}>
            {studioMode !== "carousel" && (
                <div className={styles.formGrid}>
                    <div className={styles.field}>
                        <label htmlFor="studio-names">Name / Heading</label>
                        <input
                            id="studio-names"
                            type="text"
                            value={targetNames}
                            onChange={(e) => setTargetNames(e.target.value)}
                            placeholder="e.g. Alex, Sam"
                            className={styles.input}
                        />
                    </div>
                </div>
            )}
            <div className={styles.field}>
                <label htmlFor="studio-context">
                    {studioMode === "carousel" ? "What's this carousel about?" : "Context / description"}
                </label>
                <textarea
                    id="studio-context"
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="What’s the situation or vibe for the meme?"
                    className={styles.textarea}
                    rows={3}
                />
            </div>

            <div className={styles.modeTabs}>
                {(["images", "carousel", "reels"] as const).map((mode) => (
                    <button
                        key={mode}
                        type="button"
                        className={`${styles.modeTab} ${studioMode === mode ? styles.modeTabActive : ""}`}
                        onClick={() => setStudioMode(mode)}
                    >
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                ))}
            </div>

            {studioMode === "carousel" && setCarouselFormat && setCarouselTone && (
                <>
                    <div className={styles.goalPills}>
                        <span className={styles.reelRefLabel}>Format</span>
                        {(["teach", "story", "authority"] as const).map((f) => (
                            <button
                                key={f}
                                type="button"
                                className={`${styles.goalPill} ${carouselFormat === f ? styles.goalPillActive : ""}`}
                                onClick={() => setCarouselFormat(f)}
                            >
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>
                    <div className={styles.goalPills}>
                        <span className={styles.reelRefLabel}>Tone</span>
                        {TONES.map((t) => (
                            <button
                                key={t}
                                type="button"
                                className={`${styles.goalPill} ${carouselTone === t ? styles.goalPillActive : ""}`}
                                onClick={() => setCarouselTone(t)}
                            >
                                {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                        ))}
                    </div>
                </>
            )}

            {studioMode === "reels" && setReelGoal && setReelLength && addReelRefImage && removeReelRefImage && handleWriteScript && (
                <>
                    <div className={styles.goalPills}>
                        <span className={styles.reelRefLabel}>Goal</span>
                        {(["engagement", "promotion", "brand_humour"] as const).map((g) => (
                            <button
                                key={g}
                                type="button"
                                className={`${styles.goalPill} ${reelGoal === g ? styles.goalPillActive : ""}`}
                                onClick={() => setReelGoal(g)}
                            >
                                {g === "brand_humour" ? "Humour" : g.charAt(0).toUpperCase() + g.slice(1)}
                            </button>
                        ))}
                    </div>
                    <div className={styles.goalPills}>
                        <span className={styles.reelRefLabel}>Length</span>
                        <button
                            type="button"
                            className={`${styles.goalPill} ${reelLength === "single" ? styles.goalPillActive : ""}`}
                            onClick={() => { setReelLength("single"); if(setReelScript) setReelScript(null); }}
                        >
                            8s
                        </button>
                        <button
                            type="button"
                            className={`${styles.goalPill} ${reelLength === "continuous" ? styles.goalPillActive : ""}`}
                            onClick={() => setReelLength("continuous")}
                        >
                            15s
                        </button>
                    </div>
                    <div className={styles.reelRefRow}>
                        <span className={styles.reelRefLabel}>Reference images (max 3)</span>
                        <div className={styles.reelRefSlots}>
                            {reelRefPreviews?.slice(0, MAX_REEL_REF_IMAGES).map((preview, i) => (
                                <div key={i} className={styles.reelRefSlot}>
                                    <div className={styles.referencePreview}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={preview} alt="" />
                                    </div>
                                    <button
                                        type="button"
                                        className={styles.reelRefRemove}
                                        onClick={() => removeReelRefImage(i)}
                                        aria-label="Remove"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                            {(reelRefPreviews?.length ?? 0) < MAX_REEL_REF_IMAGES && (
                                <label className={styles.fileLabel}>
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        onChange={addReelRefImage}
                                        className={styles.fileInputHidden}
                                    />
                                    + Image
                                </label>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        className={styles.scriptBtn}
                        onClick={handleWriteScript}
                        disabled={reelScriptStatus === "writing" || !context.trim()}
                    >
                        {reelScriptStatus === "writing" ? "Writing script…" : reelScriptStatus === "ready" ? "Rewrite Script" : "Write Script"}
                    </button>
                    {reelScriptStatus === "ready" && reelScript && reelScript.scenes.length > 0 && (
                        <div className={styles.scriptBlock}>
                            {reelScript.scenes.map((scene, i) => (
                                <div key={i} className={styles.scriptField}>
                                    <label htmlFor={`reel-scene-${i}`}>
                                        {i === 0 ? "Scene 1 (0–8s)" : `Scene ${i + 1} (${8 + (i - 1) * 7}–${8 + i * 7}s)`}
                                    </label>
                                    <textarea
                                        id={`reel-scene-${i}`}
                                        className={styles.textarea}
                                        value={scene}
                                        onChange={(e) =>
                                            setReelScript && setReelScript((s) =>
                                                s ? { ...s, scenes: s.scenes.map((v, j) => (j === i ? e.target.value : v)) } : null
                                            )
                                        }
                                        rows={3}
                                    />
                                </div>
                            ))}
                            {reelScript.rationale && (
                                <p className={styles.scriptRationale}>{reelScript.rationale}</p>
                            )}
                        </div>
                    )}
                </>
            )}

            {studioMode === "images" && toggleTone && setSelectedTones && selectedTones && (
                <div className={styles.toneSection}>
                    <div className={styles.toneSectionHeader}>
                        <span className={styles.toneSectionLabel}>Tones</span>
                        <button
                            type="button"
                            className={styles.toneAllBtn}
                            onClick={() =>
                                selectedTones.size === TONES.length
                                    ? setSelectedTones(new Set([TONES[0]]))
                                    : setSelectedTones(new Set(TONES))
                            }
                        >
                            {selectedTones.size === TONES.length ? "Deselect all" : "Select all"}
                        </button>
                    </div>
                    <div className={styles.tonePills}>
                        {TONES.map((tone) => {
                            const active = selectedTones.has(tone);
                            return (
                                <button
                                    key={tone}
                                    type="button"
                                    className={`${styles.tonePill} ${active ? styles.tonePillActive : styles.tonePillInactive}`}
                                    onClick={() => toggleTone(tone)}
                                    aria-pressed={active}
                                >
                                    <span className={styles.tonePillCheck}>{active ? "✓" : ""}</span>
                                    {tone.charAt(0).toUpperCase() + tone.slice(1)}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </section>
    );
}
