"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./SceneCard.module.css";
import { 
    Scene, SceneCardProps, EditTool, MotionType, 
    hexToRgba 
} from "./scene-card/types";
import { useTextOverlay } from "./scene-card/useTextOverlay";
import AICreateOverlay from "./scene-card/AICreateOverlay";
import AIEditOverlay from "./scene-card/AIEditOverlay";
import EditOverlay, { EditOverlayRef } from "./scene-card/EditOverlay";

export default function SceneCard({
    scene,
    index,
    onUpdate,
    onDelete,
    onInsertAfter,
    onGenerateAI,
    onRegenerateAI,
    onAIEditImage,
    onUploadFile,
    onMove,
}: SceneCardProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    
    // UI State
    const [aiOverlayOpen, setAIOverlayOpen] = useState(false);
    const [aiEditOpen, setAIEditOpen]       = useState(false);
    const [editOpen, setEditOpen]           = useState(false);
    const [editTool, setEditTool]           = useState<EditTool>("timing");
    const [isPlaying, setIsPlaying]         = useState(false);
    const [editInstructionLoading, setEditInstructionLoading] = useState(false);
    const [aiEditInstruction, setAIEditInstruction]           = useState("");

    const editRef = useRef<EditOverlayRef>(null);

    // Edit State (retained here for preview sync)
    const [selectedCrop, setSelectedCrop]     = useState("9:16");
    const [selectedMotion, setSelectedMotion] = useState<MotionType>(scene.motion ?? "none");
    const [zoom, setZoom]                     = useState(100);
    const [trimStart, setTrimStart]           = useState(0);
    const [trimEnd, setTrimEnd]               = useState(100);
    const [editDuration, setEditDuration]     = useState(scene.duration);

    // Text state (passed from hook)
    const textState = useTextOverlay({
        x: scene.textOverlay?.x ?? 50,
        y: scene.textOverlay?.y ?? 50,
        scale: scene.textOverlay?.scale ?? 1.0,
        rotation: scene.textOverlay?.rotation ?? 0
    });
    const [textColor, setTextColor]           = useState(scene.textOverlay?.color ?? "#ffffff");
    const [textBg, setTextBg]                 = useState<string | null>(scene.textOverlay?.bg ?? null);
    const [textBgOpacity, setTextBgOpacity]   = useState(scene.textOverlay?.bgOpacity ?? 0.5);

    const videoRef = useRef<HTMLVideoElement>(null);

    const isGenerating = scene.status === "generating";
    const isReady      = scene.status === "ready";
    const isEmpty      = scene.status === "empty" || (scene.status === "error" && !scene.asset_url);
    const isVideo      = scene.asset_type === "video" || scene.type === "video";
    const anyOverlayOpen = aiOverlayOpen || editOpen || aiEditOpen;
    const padIndex = String(index + 1).padStart(2, "0");

    // Sync playback speed to duration
    useEffect(() => {
        const video = videoRef.current;
        if (video && scene.duration > 0 && video.duration > 0) {
            video.playbackRate = video.duration / scene.duration;
        }
    }, [scene.duration, scene.asset_url]);

    // Handlers
    const togglePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!videoRef.current) return;
        if (isPlaying) videoRef.current.pause();
        else videoRef.current.play();
        setIsPlaying(!isPlaying);
    };

    const handleUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) onUploadFile(scene.id, file);
        e.target.value = "";
    };

    const openAIOverlay = () => {
        setEditOpen(false);
        setAIEditOpen(false);
        setAIOverlayOpen(true);
    };

    const openAIEdit = () => {
        setEditOpen(false);
        setAIOverlayOpen(false);
        setAIEditOpen(true);
    };

    const openEdit = () => { 
        setAIOverlayOpen(false); 
        setAIEditOpen(false);
        setEditOpen(true); 
    };

    // Drag & Drop
    const handleDragStart = (e: React.DragEvent) => {
        if (anyOverlayOpen) { e.preventDefault(); return; }
        setIsDragging(true);
        e.dataTransfer.setData("text/plain", index.toString());
        e.dataTransfer.effectAllowed = "move";
    };

    return (
        <div 
            className={`${styles.card} ${isDragging ? styles.dragging : ""} ${isDragOver ? styles.dragOver : ""}`}
            draggable={!anyOverlayOpen}
            onDragStart={handleDragStart}
            onDragEnd={() => setIsDragging(false)}
            onDragOver={(e) => { e.preventDefault(); if (!isDragging) setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
                if (fromIndex !== index) onMove(fromIndex, index);
            }}
        >
            <div className={styles.previewWrap}>
                {isGenerating && (
                    <div className={styles.previewSpinner}>
                        <div className={styles.spinner} />
                        <span className={styles.spinnerText}>{isVideo ? "Generating video…" : "Generating image…"}</span>
                    </div>
                )}

                {!isGenerating && isReady && scene.asset_url && (
                    <>
                        {scene.asset_type === "video" ? (
                            <>
                                <video 
                                    ref={videoRef}
                                    className={styles.previewVideo} 
                                    src={scene.asset_url} 
                                    loop playsInline 
                                    onPlay={() => setIsPlaying(true)}
                                    onPause={() => setIsPlaying(false)}
                                    onLoadedMetadata={(e) => {
                                        const v = e.currentTarget;
                                        if (scene.duration > 0 && v.duration > 0) v.playbackRate = v.duration / scene.duration;
                                    }}
                                    style={{ transform: `scale(${zoom / 100})` }}
                                />
                                {!anyOverlayOpen && (
                                    <button className={styles.videoToggle} onClick={togglePlay} aria-label={isPlaying ? "Stop" : "Play"}>
                                        {isPlaying ? (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                                        ) : (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                        )}
                                    </button>
                                )}
                            </>
                        ) : (
                            <img 
                                className={`${styles.previewImage} ${scene.asset_type === "image" && selectedMotion !== "none" ? styles[`motion-${selectedMotion}`] : ""}`} 
                                src={scene.asset_url} 
                                alt={`Scene ${padIndex}`} 
                                style={{ 
                                    animationDuration: `${editDuration}s`, 
                                    animationPlayState: "running",
                                    transform: `scale(${zoom / 100})`
                                }}
                            />
                        )}
                        
                        {!editOpen && scene.textOverlay?.text && (
                            <div
                                className={styles.textBoundingBox}
                                style={{
                                    left: `${scene.textOverlay.x}%`,
                                    top: `${scene.textOverlay.y}%`,
                                    transform: `translate(-50%, -50%) scale(${scene.textOverlay.scale}) rotate(${scene.textOverlay.rotation}deg)`,
                                    color: scene.textOverlay.color,
                                    background: scene.textOverlay.bg ? hexToRgba(scene.textOverlay.bg, scene.textOverlay.bgOpacity) : "transparent",
                                    pointerEvents: "none", position: "absolute", border: "none"
                                }}
                            >
                                <div className={styles.textEl} dangerouslySetInnerHTML={{ __html: scene.textOverlay.text }} style={{ pointerEvents: "none" }} />
                            </div>
                        )}
                    </>
                )}

                {isEmpty && !aiOverlayOpen && (
                    <div className={styles.typePicker}>
                        <label className={styles.typePickerBtn}>
                            + Add Media
                            <input type="file" accept="video/*,image/*" className={styles.fileInputHidden} onChange={handleUploadChange} />
                        </label>
                        <button type="button" className={styles.typePickerAIBtn} onClick={openAIOverlay}>+ AI Create</button>
                        {scene.status === "error" && scene.error && <span className={styles.typePickerError}>{scene.error}</span>}
                    </div>
                )}

                {aiOverlayOpen && (
                    <AICreateOverlay 
                        initialType={scene.type}
                        initialPrompt={scene.caption ?? ""}
                        onClose={() => setAIOverlayOpen(false)}
                        onGenerate={(caption, type, refImage) => {
                            // Convert refImage to base64 if needed
                            if (refImage) {
                                const reader = new FileReader();
                                reader.onload = () => {
                                    onUpdate(scene.id, { caption, type, reference_image_base64: (reader.result as string).split(",")[1] });
                                    setAIOverlayOpen(false);
                                    setTimeout(() => onGenerateAI(scene.id), 20);
                                };
                                reader.readAsDataURL(refImage);
                            } else {
                                onUpdate(scene.id, { caption, type });
                                setAIOverlayOpen(false);
                                setTimeout(() => onGenerateAI(scene.id), 20);
                            }
                        }}
                    />
                )}

                {aiEditOpen && (
                    <AIEditOverlay 
                        loading={editInstructionLoading}
                        instruction={aiEditInstruction}
                        setInstruction={setAIEditInstruction}
                        onClose={() => setAIEditOpen(false)}
                        onSubmit={(instruction) => {
                            setEditInstructionLoading(true);
                            onAIEditImage(scene.id, instruction);
                            setEditInstructionLoading(false);
                            setAIEditOpen(false);
                        }}
                    />
                )}

                {editOpen && (
                    <EditOverlay 
                        ref={editRef}
                        scene={scene}
                        editTool={editTool} setEditTool={setEditTool}
                        duration={editDuration} setDuration={setEditDuration}
                        trimStart={trimStart} setTrimStart={setTrimStart}
                        trimEnd={trimEnd} setTrimEnd={setTrimEnd}
                        selectedCrop={selectedCrop} setSelectedCrop={setSelectedCrop}
                        zoom={zoom} setZoom={setZoom}
                        selectedMotion={selectedMotion} setSelectedMotion={setSelectedMotion}
                        textColor={textColor} setTextColor={setTextColor}
                        textBg={textBg} setTextBg={setTextBg}
                        textBgOpacity={textBgOpacity} setTextBgOpacity={setTextBgOpacity}
                        textX={textState.x} textY={textState.y} 
                        textScale={textState.scale} textRotation={textState.rotation}
                        canvasRef={textState.canvasRef} elRef={textState.elRef}
                        handlePointerDown={textState.handlePointerDown}
                        handlePointerMove={textState.handlePointerMove}
                        handlePointerUp={textState.handlePointerUp}
                        onApply={(patch) => onUpdate(scene.id, patch)}
                        onClose={() => setEditOpen(false)}
                        setTextSize={() => {}} // dummy
                    />
                )}

                <button 
                    type="button" className={styles.removeBtn} 
                    onClick={() => onDelete(scene.id)} 
                    style={{ display: anyOverlayOpen ? "none" : undefined }}
                >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>

                {/* Badges */}
                <span className={styles.badge}>{padIndex}</span>
            </div>

            <div className={`${styles.infoBar}${anyOverlayOpen ? ` ${styles.infoBarEdit}` : ""}`}>
                {/* Left Side: Cancel (X) or Caption */}
                {anyOverlayOpen ? (
                    <button 
                        type="button" 
                        className={styles.editBtn} 
                        onClick={() => {
                            if (editOpen) setEditOpen(false);
                            if (aiEditOpen) setAIEditOpen(false);
                            if (aiOverlayOpen) setAIOverlayOpen(false);
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                ) : scene.caption ? (
                    <button type="button" className={styles.captionPreview} onClick={openAIOverlay} title="Edit prompt">{scene.caption}</button>
                ) : <span />}

                {/* Center: Actions (Audio, Regenerate, etc.) - Hidden in Edit Mode */}
                {!anyOverlayOpen && (
                    <div className={styles.infoActions}>
                        {isReady && (
                            <>
                                <button type="button" className={styles.editBtn} onClick={() => onRegenerateAI(scene.id)} title="Regenerate">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                </button>
                                <button type="button" className={styles.editBtn} title="Audio Settings (Coming Soon)">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                    </svg>
                                </button>
                            </>
                        )}
                        {isReady && !isVideo && (
                            <button type="button" className={styles.editBtn} onClick={openAIEdit} title="AI Edit image">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
                                </svg>
                            </button>
                        )}
                        <button type="button" className={styles.editBtn} onClick={openEdit} title="Edit scene">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                        </button>
                    </div>
                )}

                {/* Right Side: Apply (Tick) - Only in Edit/AI Edit Mode */}
                {(editOpen || aiEditOpen) && (
                    <button 
                        type="button" 
                        className={styles.editBtn} 
                        onClick={() => {
                            if (editOpen) editRef.current?.handleApply();
                            if (aiEditOpen) {
                                setEditInstructionLoading(true);
                                onAIEditImage(scene.id, aiEditInstruction);
                                setEditInstructionLoading(false);
                                setAIEditOpen(false);
                            }
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                )}
            </div>
        </div>
    );
}

// Re-export constants/types for backward compatibility if needed by parent
export * from "./scene-card/types";
