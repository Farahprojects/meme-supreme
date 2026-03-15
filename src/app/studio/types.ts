import { StudioTone } from "@/components/StudioMemeCard";

export interface MemeResult {
    meme_id: string;
    image_url: string;
    caption: string;
    tone: string;
    names?: string | null;
}

export type ResultState = MemeResult | "loading" | "error";

export interface HistoryItem {
    id: string;
    image_url: string;
    caption: string;
    names: string | null;
    tone: StudioTone;
    target_names: string | null;
    context_description: string | null;
    created_at: string;
    carousel_id: string | null;
    slide_index: number | null;
    text_style?: { font?: string; size?: string; allCaps?: boolean } | null;
}

export interface CarouselSlide {
    slide_index: number;
    slide_text: string;
    image_url: string;
}

export interface CarouselResult {
    carousel_id: string;
    slides: CarouselSlide[];
}

export interface ReelScript {
    scenes: string[];
    rationale: string;
}

export type ReelStatus = "idle" | "generating" | "done" | "error";
export type ReelScriptStatus = "idle" | "writing" | "ready";
export type StudioMode = "images" | "carousel" | "reels";
export type CarouselFormat = "teach" | "story" | "authority";
export type ReelGoal = "engagement" | "promotion" | "brand_humour";
export type ReelLength = "single" | "continuous";
