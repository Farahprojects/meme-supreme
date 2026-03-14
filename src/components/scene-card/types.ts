export type SceneType = "video" | "image";
export type SceneSource = "ai" | "upload";
export type SceneStatus = "empty" | "generating" | "ready" | "error";
export type AspectRatio = "9:16" | "16:9" | "1:1";
export type AssetType = "video" | "image";
export type MotionType = "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "dynamic";

export interface TextOverlayConfig {
    text: string;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    color: string;
    bg: string | null;
    bgOpacity: number;
}

export interface Scene {
    id: string;
    order: number;
    type: SceneType;
    source: SceneSource;
    aspect_ratio: AspectRatio;
    duration: number;
    motion?: MotionType;
    textOverlay?: TextOverlayConfig;
    asset_type?: AssetType;
    caption?: string;
    asset_url?: string;
    operation_name?: string;
    reference_image_base64?: string;
    status: SceneStatus;
    error?: string;
}

export interface SceneCardProps {
    scene: Scene;
    index: number;
    onUpdate: (id: string, patch: Partial<Scene>) => void;
    onDelete: (id: string) => void;
    onInsertAfter: (id: string) => void;
    onGenerateAI: (id: string) => void;
    onRegenerateAI: (id: string) => void;
    onAIEditImage: (id: string, instruction: string) => void;
    onUploadFile: (id: string, file: File) => void;
    onMove: (fromIndex: number, toIndex: number) => void;
}

export type EditTool = "replace" | "timing" | "frame" | "text" | "motion";

export const EDIT_TABS: { id: EditTool; label: string }[] = [
    { id: "timing",  label: "Duration"  },
    { id: "frame",   label: "Frame"   },
    { id: "text",    label: "Text"    },
    { id: "motion",  label: "Motion"  },
];

export const CROP_RATIOS = ["9:16", "1:1", "16:9", "Free"];

export const MOTION_OPTS: { id: MotionType; label: string; hint: string }[] = [
    { id: "none",      label: "None",     hint: "Static image." },
    { id: "zoom-in",   label: "Zoom In",  hint: "Slowly zooms in over the duration." },
    { id: "zoom-out",  label: "Zoom Out", hint: "Slowly zooms out over the duration." },
    { id: "pan-left",  label: "Pan Left", hint: "Pans across the frame right to left." },
    { id: "pan-right", label: "Pan Right",hint: "Pans across the frame left to right." },
    { id: "dynamic",   label: "Dynamic",  hint: "Ken Burns style pan and scale combined." },
];

export const TEXT_COLORS = ["#ffffff", "#000000", "#facc15", "#ef4444", "#f97316", "#22d3ee", "#4ade80", "#a855f7"];
export const TEXT_BG_COLORS = ["#ffffff", "#000000", "#1a1a1a", "#1e3a5f"];

export function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

export function getPinchDist(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
