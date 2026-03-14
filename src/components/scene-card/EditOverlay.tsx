import { useState, forwardRef, useImperativeHandle } from "react";
import styles from "../SceneCard.module.css";
import { Scene, EditTool, EDIT_TABS, MotionType, TextOverlayConfig } from "./types";
import { TimingTool, FrameTool, MotionTool } from "./tools/EditTools";
import TextTool from "./tools/TextTool";

const VIDEO_EDIT_TABS = EDIT_TABS.filter(t => t.id !== "motion");

interface EditOverlayProps {
    scene: Scene;
    onApply: (patch: Partial<Scene>) => void;
    onClose: () => void;
    
    // State & Setters from parent
    editTool: EditTool;
    setEditTool: (t: EditTool) => void;
    
    duration: number;
    setDuration: (v: number) => void;
    trimStart: number;
    setTrimStart: (v: number) => void;
    trimEnd: number;
    setTrimEnd: (v: number) => void;
    
    selectedCrop: string;
    setSelectedCrop: (v: string) => void;
    zoom: number;
    setZoom: (v: number) => void;
    
    selectedMotion: MotionType;
    setSelectedMotion: (v: MotionType) => void;

    // Text state
    textX: number;
    textY: number;
    textScale: number;
    textRotation: number;
    textColor: string;
    setTextSize: (v: string) => void; // dummy if needed
    setTextColor: (v: string) => void;
    textBg: string | null;
    setTextBg: (v: string | null) => void;
    textBgOpacity: number;
    setTextBgOpacity: (v: number) => void;

    // Hook refs/handlers
    canvasRef: React.RefObject<HTMLDivElement | null>;
    elRef: React.RefObject<HTMLDivElement | null>;
    handlePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    handlePointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    handlePointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export interface EditOverlayRef {
    handleApply: () => void;
}

const EditOverlay = forwardRef<EditOverlayRef, EditOverlayProps>(({
    scene,
    onApply,
    onClose,
    editTool,
    setEditTool,
    duration, setDuration,
    trimStart, setTrimStart,
    trimEnd, setTrimEnd,
    selectedCrop, setSelectedCrop,
    zoom, setZoom,
    selectedMotion, setSelectedMotion,
    textX, textY, textScale, textRotation,
    textColor, setTextColor,
    textBg, setTextBg,
    textBgOpacity, setTextBgOpacity,
    canvasRef, elRef,
    handlePointerDown, handlePointerMove, handlePointerUp
}, ref) => {

    useImperativeHandle(ref, () => ({
        handleApply: () => {
            const textContent = elRef.current?.innerHTML || "";
            const updatedTextOverlay: TextOverlayConfig | undefined = (textContent.trim() || elRef.current?.innerText.trim()) ? {
                text: textContent,
                x: textX,
                y: textY,
                scale: textScale,
                rotation: textRotation,
                color: textColor,
                bg: textBg,
                bgOpacity: textBgOpacity
            } : undefined;

            onApply({
                motion: selectedMotion,
                duration: duration,
                textOverlay: updatedTextOverlay
            });
            onClose();
        }
    }));

    // Removed local handleApply as it's now handled by the parent's infoBar Apply button

    return (
        <div className={`${styles.editOverlay}${editTool === "text" ? ` ${styles.editOverlayText}` : ""}`}>
            <div className={styles.editHeader}>
                <div className={styles.editTabs}>
                    {(scene.asset_type === "video" ? VIDEO_EDIT_TABS : EDIT_TABS).map((t) => (
                        <button 
                            key={t.id} 
                            type="button"
                            className={`${styles.editTab} ${editTool === t.id ? styles.editTabActive : ""}`}
                            onClick={() => setEditTool(t.id)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.editContent}>
                {editTool === "timing" && (
                    <TimingTool 
                        duration={duration} trimStart={trimStart} trimEnd={trimEnd}
                        onChangeDuration={setDuration} onChangeTrimStart={setTrimStart} onChangeTrimEnd={setTrimEnd}
                    />
                )}
                {editTool === "frame" && (
                    <FrameTool 
                        selectedCrop={selectedCrop} zoom={zoom}
                        onChangeCrop={setSelectedCrop} onChangeZoom={setZoom}
                    />
                )}
                {editTool === "motion" && (
                    <MotionTool selectedMotion={selectedMotion} onChangeMotion={setSelectedMotion} />
                )}
                {editTool === "text" && (
                    <TextTool 
                        x={textX} y={textY} scale={textScale} rotation={textRotation}
                        color={textColor} bg={textBg} bgOpacity={textBgOpacity}
                        onChangeColor={setTextColor} onChangeBg={setTextBg} onChangeBgOpacity={setTextBgOpacity}
                        canvasRef={canvasRef} elRef={elRef}
                        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
                        isActionable={true}
                        initialHtml={scene.textOverlay?.text}
                    />
                )}
            </div>
        </div>
    );
});

export default EditOverlay;
