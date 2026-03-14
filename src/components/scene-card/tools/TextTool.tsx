import { useState, useEffect } from "react";
import styles from "../../SceneCard.module.css";
import { TEXT_COLORS, TEXT_BG_COLORS, hexToRgba } from "../types";

interface TextToolProps {
    x: number;
    y: number;
    scale: number;
    rotation: number;
    color: string;
    bg: string | null;
    bgOpacity: number;
    onChangeColor: (val: string) => void;
    onChangeBg: (val: string | null) => void;
    onChangeBgOpacity: (val: number) => void;
    canvasRef: React.RefObject<HTMLDivElement | null>;
    elRef: React.RefObject<HTMLDivElement | null>;
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    isActionable: boolean;
    initialHtml?: string;
}

export default function TextTool({
    x, y, scale, rotation,
    color, bg, bgOpacity,
    onChangeColor, onChangeBg, onChangeBgOpacity,
    canvasRef, elRef,
    onPointerDown, onPointerMove, onPointerUp,
    isActionable,
    initialHtml
}: TextToolProps) {
    const [colorPickerOpen, setColorPickerOpen] = useState<"text" | "bg" | null>(null);

    useEffect(() => {
        if (initialHtml && elRef.current && !elRef.current.innerHTML) {
            elRef.current.innerHTML = initialHtml;
        }
    }, [initialHtml, elRef]);

    useEffect(() => {
        if (isActionable) {
            setTimeout(() => elRef.current?.focus(), 50);
        }
    }, [isActionable, elRef]);

    return (
        <>
            <div ref={canvasRef} className={styles.textCanvas}>
                <div
                    className={`${styles.textBoundingBox} ${isActionable ? styles.isTextToolActionable : ""}`}
                    style={{
                        left: `${x}%`,
                        top: `${y}%`,
                        transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
                        color: color,
                        background: bg ? hexToRgba(bg, bgOpacity) : "transparent",
                    }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                >
                    <div
                        ref={elRef}
                        contentEditable
                        suppressContentEditableWarning
                        className={styles.textEl}
                        data-placeholder="Tap to type…"
                    />
                    <div className={`${styles.textResizeHandle} ${styles.textResizeHandleNw}`} data-handle="nw" />
                    <div className={`${styles.textResizeHandle} ${styles.textResizeHandleNe}`} data-handle="ne" />
                    <div className={`${styles.textRotateHandle} ${styles.textRotateHandleSw}`} data-handle="sw">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/></svg>
                    </div>
                    <div className={`${styles.textRotateHandle} ${styles.textRotateHandleSe}`} data-handle="se">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/></svg>
                    </div>
                </div>

                {colorPickerOpen && (
                    <div className={styles.colorPickerPanel}>
                        <div className={styles.colorPickerHeader}>
                            <span className={styles.colorPickerTitle}>
                                {colorPickerOpen === "text" ? "Text colour" : "Text background"}
                            </span>
                            <button
                                type="button"
                                className={styles.colorPickerClose}
                                onClick={() => setColorPickerOpen(null)}
                                aria-label="Close colour picker"
                            >
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>

                        <div className={styles.colorGrid}>
                            {colorPickerOpen === "bg" && (
                                <button
                                    type="button"
                                    className={`${styles.colorGridNone} ${bg === null ? styles.colorGridNoneActive : ""}`}
                                    onClick={() => onChangeBg(null)}
                                >None</button>
                            )}
                            {(colorPickerOpen === "text" ? TEXT_COLORS : TEXT_BG_COLORS).map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    className={`${styles.colorGridSwatch} ${(colorPickerOpen === "text" ? color : bg) === c ? styles.colorGridSwatchActive : ""}`}
                                    style={{ background: c, border: c === "#ffffff" ? "1.5px solid rgba(255,255,255,0.35)" : "1.5px solid rgba(255,255,255,0.08)" }}
                                    onClick={() => colorPickerOpen === "text" ? onChangeColor(c) : onChangeBg(c)}
                                    aria-label={c}
                                />
                            ))}
                        </div>

                        {colorPickerOpen === "bg" && bg !== null && (
                            <div className={styles.colorGridOpacityRow}>
                                <span className={styles.colorPickerOpacityLabel}>Opacity</span>
                                <input
                                    type="range"
                                    min={10}
                                    max={100}
                                    value={Math.round(bgOpacity * 100)}
                                    onChange={(e) => onChangeBgOpacity(Number(e.target.value) / 100)}
                                    className={styles.slider}
                                />
                                <span className={styles.sliderValue}>{Math.round(bgOpacity * 100)}%</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className={styles.textControlsBar}>
                <button
                    type="button"
                    className={`${styles.textPickerRow} ${colorPickerOpen === "text" ? styles.textPickerRowActive : ""}`}
                    onClick={() => setColorPickerOpen(colorPickerOpen === "text" ? null : "text")}
                >
                    <span
                        className={styles.textPickerDot}
                        style={{ background: color, border: color === "#ffffff" ? "1.5px solid rgba(255,255,255,0.4)" : "1.5px solid rgba(255,255,255,0.08)" }}
                    />
                    <span className={styles.textPickerLabel}>Text colour</span>
                </button>
                <button
                    type="button"
                    className={`${styles.textPickerRow} ${colorPickerOpen === "bg" ? styles.textPickerRowActive : ""}`}
                    onClick={() => setColorPickerOpen(colorPickerOpen === "bg" ? null : "bg")}
                >
                    <span
                        className={styles.textPickerDot}
                        style={{
                            background: bg ?? "transparent",
                            border: bg === null ? "1.5px dashed rgba(255,255,255,0.25)" : bg === "#ffffff" ? "1.5px solid rgba(255,255,255,0.4)" : "1.5px solid rgba(255,255,255,0.08)",
                        }}
                    />
                    <span className={styles.textPickerLabel}>Text background</span>
                </button>
            </div>
        </>
    );
}
