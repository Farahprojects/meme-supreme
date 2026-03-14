"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import supabaseLoader from "@/lib/supabase-image-loader";
import styles from "./StudioMemeCard.module.css";

export type StudioTone = "roast" | "funny" | "sweet" | "bold";

type FontKey = "Poppins" | "Inter" | "Playfair" | "Bebas" | "Nunito";
type SizeKey = "S" | "M" | "L" | "XL";

export interface TextStyle {
    font: FontKey;
    size: SizeKey;
    allCaps: boolean;
}

const FONTS: Record<FontKey, string> = {
    Poppins: "'Poppins', sans-serif",
    Inter: "'Inter', sans-serif",
    Playfair: "'Playfair Display', serif",
    Bebas: "'Bebas Neue', sans-serif",
    Nunito: "'Nunito', sans-serif",
};

const FONT_LABELS: Record<FontKey, string> = {
    Poppins: "Poppins",
    Inter: "Inter",
    Playfair: "Playfair",
    Bebas: "Bebas",
    Nunito: "Nunito",
};

const SIZE_MAP: Record<SizeKey, { names: string; caption: string }> = {
    S: { names: "clamp(8px, 3.5vw, 13px)", caption: "clamp(7px, 3vw, 11px)" },
    M: { names: "clamp(10px, 4.5vw, 16px)", caption: "clamp(9px, 4vw, 14px)" },
    L: { names: "clamp(13px, 6vw, 22px)", caption: "clamp(11px, 5.5vw, 19px)" },
    XL: { names: "clamp(16px, 7.5vw, 28px)", caption: "clamp(13px, 7vw, 24px)" },
};

export interface StudioMemeCardProps {
    meme_id: string;
    image_url: string;
    caption: string;
    names?: string | null;
    tone: StudioTone;
    /** Called when user clicks Regenerate; parent refires studio-generator for this tone. */
    onRegenerate: () => void;
    /** Called when caption text changes (parent may persist). */
    onCaptionChange?: (caption: string) => void;
    /** Called when names text changes (parent may persist). */
    onNamesChange?: (names: string) => void;
    /** Called when user clicks Download; parent calls library-bind with (image_url, names, caption, text_style) and triggers download. */
    onDownload: (imageUrl: string, names: string, caption: string, textStyle: TextStyle) => Promise<void>;
    /** Called when user submits an image edit instruction and/or product image; parent calls studio-image-edit. */
    onEditImage?: (instruction: string, productBase64?: string) => Promise<void>;
    /** Called when user exits edit mode (pencil off); parent may persist text_style to DB. */
    onSaveTextStyle?: (memeId: string, textStyle: TextStyle) => void;
    /** Saved text style from DB (e.g. from history); used to initialise font/size/caps state. */
    initialTextStyle?: { font?: string; size?: string; allCaps?: boolean } | null;
    /** When true, show loading spinner instead of content. */
    loading?: boolean;
}

export default function StudioMemeCard({
    meme_id,
    image_url,
    caption: initialCaption,
    names: initialNames,
    tone,
    onRegenerate,
    onCaptionChange,
    onNamesChange,
    onDownload,
    onEditImage,
    onSaveTextStyle,
    initialTextStyle,
    loading = false,
}: StudioMemeCardProps) {
    const [caption, setCaption] = useState(initialCaption);
    const [names, setNames] = useState(initialNames ?? "");
    const [isDownloading, setIsDownloading] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [showEditInput, setShowEditInput] = useState(false);
    const [editInstruction, setEditInstruction] = useState("");
    const [isEditingImage, setIsEditingImage] = useState(false);
    const [productFile, setProductFile] = useState<File | null>(null);
    const [productPreview, setProductPreview] = useState<string | null>(null);
    const [editMode, setEditMode] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [mounted, setMounted] = useState(false);
    const productInputRef = useRef<HTMLInputElement>(null);
    const lightboxProductInputRef = useRef<HTMLInputElement>(null);

    const safeFont = (f?: string): FontKey =>
        f && (["Poppins", "Inter", "Playfair", "Bebas", "Nunito"] as const).includes(f as FontKey) ? (f as FontKey) : "Poppins";
    const safeSize = (s?: string): SizeKey =>
        s && (["S", "M", "L", "XL"] as const).includes(s as SizeKey) ? (s as SizeKey) : "M";

    const [fontSize, setFontSize] = useState<SizeKey>(() => safeSize(initialTextStyle?.size));
    const [allCaps, setAllCaps] = useState(() => !!initialTextStyle?.allCaps);
    const [fontFamily, setFontFamily] = useState<FontKey>(() => safeFont(initialTextStyle?.font));
    const namesInputRef = useRef<HTMLInputElement>(null);
    const namesSizerRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        setCaption(initialCaption);
        setNames(initialNames ?? "");
    }, [initialCaption, initialNames, meme_id]);

    useEffect(() => {
        if (initialTextStyle) {
            setFontFamily(safeFont(initialTextStyle.font));
            setFontSize(safeSize(initialTextStyle.size));
            setAllCaps(!!initialTextStyle.allCaps);
        }
    }, [meme_id, initialTextStyle?.font, initialTextStyle?.size, initialTextStyle?.allCaps]);

    useLayoutEffect(() => {
        if (namesInputRef.current && namesSizerRef.current) {
            const w = namesSizerRef.current.getBoundingClientRect().width;
            if (w > 0) namesInputRef.current.style.width = w + "px";
        }
    }, [names]);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!expanded) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
        document.addEventListener("keydown", onKey);
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = "";
        };
    }, [expanded]);

    const toneLabel = tone.charAt(0).toUpperCase() + tone.slice(1);

    const letterSpacing = fontFamily === "Bebas" ? "0.06em" : undefined;
    const namesStyle: React.CSSProperties = {
        fontFamily: FONTS[fontFamily],
        fontSize: SIZE_MAP[fontSize].names,
        color: "#ffffff",
        textTransform: allCaps ? "uppercase" : "none",
        letterSpacing,
    };
    const captionStyle: React.CSSProperties = {
        fontFamily: FONTS[fontFamily],
        fontSize: SIZE_MAP[fontSize].caption,
        color: "#ffffff",
        textTransform: allCaps ? "uppercase" : "none",
        letterSpacing,
    };

    const handleCaptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const v = e.target.value;
        setCaption(v);
        onCaptionChange?.(v);
    };
    const handleNamesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setNames(v);
        onNamesChange?.(v);
    };

    const handleDownload = async () => {
        if (isDownloading) return;
        setIsDownloading(true);
        try {
            await onDownload(image_url, names.trim(), caption.trim(), { font: fontFamily, size: fontSize, allCaps });
        } catch {
            alert("Download failed. Please try again.");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleRegenerate = () => {
        if (isRegenerating) return;
        setIsRegenerating(true);
        onRegenerate();
    };

    const handleProductFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        e.target.value = "";
        setProductFile(file);
        if (file) {
            const url = URL.createObjectURL(file);
            setProductPreview(url);
        } else {
            setProductPreview(null);
        }
    };

    const clearProductFile = () => {
        setProductFile(null);
        if (productPreview) URL.revokeObjectURL(productPreview);
        setProductPreview(null);
    };

    const handleEditImageSubmit = async () => {
        if ((!editInstruction.trim() && !productFile) || isEditingImage || !onEditImage) return;
        setIsEditingImage(true);
        try {
            let productBase64: string | undefined;
            if (productFile) {
                productBase64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
                    reader.onerror = reject;
                    reader.readAsDataURL(productFile);
                });
            }
            await onEditImage(editInstruction.trim(), productBase64);
            setEditInstruction("");
            clearProductFile();
            setShowEditInput(false);
        } catch {
            // parent handles error display
        } finally {
            setIsEditingImage(false);
        }
    };

    if (loading) {
        return (
            <div className={styles.card}>
                <div className={styles.cardTop}>
                    <span className={styles.toneBadge}>{toneLabel}</span>
                </div>
                <div className={styles.imageWrapper}>
                    <div className={styles.loadingPlaceholder} />
                    <div className={styles.spinnerWrap}>
                        <span className={styles.spinner} aria-hidden />
                        <span className={styles.loadingText}>Generating…</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <article className={styles.card}>
            <div className={styles.cardTop}>
                <span className={styles.toneBadge}>{toneLabel}</span>
            </div>
            <div
                className={`${styles.imageWrapper} ${!editMode ? styles.imageClickable : ""}`}
                onClick={!editMode ? () => setExpanded(true) : undefined}
                role={!editMode ? "button" : undefined}
                aria-label={!editMode ? "Expand image" : undefined}
            >
                <Image
                    src={image_url}
                    alt=""
                    fill
                    className={styles.image}
                    sizes="400px"
                    loader={supabaseLoader}
                />
                <span ref={namesSizerRef} className={styles.namesSizer} style={namesStyle} aria-hidden>
                    {names || "Names"}
                </span>
                {editMode ? (
                    <input
                        ref={namesInputRef}
                        type="text"
                        className={styles.namesInput}
                        style={namesStyle}
                        value={names}
                        onChange={handleNamesChange}
                        placeholder="Names"
                        aria-label="Edit names"
                    />
                ) : (
                    names && <div className={styles.namesText} style={namesStyle}>{names}</div>
                )}
                {editMode ? (
                    <textarea
                        className={styles.captionInput}
                        style={captionStyle}
                        value={caption}
                        onChange={handleCaptionChange}
                        placeholder="Caption"
                        aria-label="Edit caption"
                        rows={3}
                    />
                ) : (
                    caption && <div className={styles.captionText} style={captionStyle}>{caption}</div>
                )}
                <div className={styles.logoWrap}>
                    <Image
                        src="/assets/logo_white.png"
                        alt=""
                        fill
                        className={styles.logo}
                        sizes="28px"
                    />
                </div>
                {isEditingImage && (
                    <div className={styles.editingOverlay}>
                        <span className={styles.spinner} aria-hidden />
                        <span className={styles.loadingText}>{productFile ? "Adding product…" : "Editing image…"}</span>
                    </div>
                )}
            </div>

            {editMode && (
                <div className={styles.toolbar}>
                    <div className={styles.toolbarRow}>
                        {(["Poppins", "Inter", "Playfair", "Bebas", "Nunito"] as const).map((key) => (
                            <button
                                key={key}
                                type="button"
                                className={`${styles.fontPill} ${fontFamily === key ? styles.fontPillActive : ""}`}
                                onClick={() => setFontFamily(key)}
                                style={{
                                    fontFamily: FONTS[key],
                                    ...(key === "Bebas" ? { letterSpacing: "0.06em" } : {}),
                                }}
                            >
                                {FONT_LABELS[key]}
                            </button>
                        ))}
                    </div>
                    <div className={styles.toolbarRow}>
                        {(["S", "M", "L", "XL"] as const).map((key) => (
                            <button
                                key={key}
                                type="button"
                                className={`${styles.sizeBtn} ${fontSize === key ? styles.sizeBtnActive : ""}`}
                                onClick={() => setFontSize(key)}
                            >
                                {key}
                            </button>
                        ))}
                        <button
                            type="button"
                            className={`${styles.capsBtn} ${allCaps ? styles.capsBtnActive : ""}`}
                            onClick={() => setAllCaps((v) => !v)}
                            aria-label="Toggle all caps"
                            title="All caps"
                        >
                            AA
                        </button>
                    </div>
                </div>
            )}

            {showEditInput ? (
                <div className={styles.actionBar}>
                    <button
                        type="button"
                        className={styles.actionBarCancel}
                        onClick={() => { setShowEditInput(false); setEditInstruction(""); clearProductFile(); }}
                        aria-label="Cancel edit"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>

                    {/* Hidden product file input */}
                    <input
                        ref={productInputRef}
                        type="file"
                        accept="image/*"
                        className={styles.productFileInput}
                        onChange={handleProductFileChange}
                    />

                    {/* Product thumbnail (if uploaded) or upload button */}
                    {productPreview ? (
                        <button
                            type="button"
                            className={styles.productThumb}
                            onClick={clearProductFile}
                            title="Remove product image"
                            aria-label="Remove product image"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={productPreview} alt="Product" className={styles.productThumbImg} />
                            <span className={styles.productThumbX}>×</span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            className={styles.actionBarImageBtn}
                            onClick={() => productInputRef.current?.click()}
                            title="Add product or logo"
                            aria-label="Add product or logo"
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                            </svg>
                        </button>
                    )}

                    <input
                        type="text"
                        className={styles.actionBarInput}
                        value={editInstruction}
                        onChange={(e) => setEditInstruction(e.target.value)}
                        placeholder={productPreview ? "Where / how to place it…" : "make hair blonde, add red jacket…"}
                        onKeyDown={(e) => e.key === "Enter" && handleEditImageSubmit()}
                        autoFocus
                    />
                    <button
                        type="button"
                        className={styles.actionBarSend}
                        onClick={handleEditImageSubmit}
                        disabled={!editInstruction.trim() && !productFile}
                        aria-label="Apply edit"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </div>
            ) : (
                <div className={styles.actionBar}>
                    <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={handleDownload}
                        disabled={isDownloading}
                        aria-label="Download"
                        title="Download"
                    >
                        {isDownloading ? (
                            <span className={styles.downloadSpinner} />
                        ) : (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                        )}
                    </button>
                    <button
                        type="button"
                        className={`${styles.actionBtn} ${editMode ? styles.actionBtnActive : ""}`}
                        onClick={() => {
                            setEditMode((v) => {
                                const next = !v;
                                if (!next) onSaveTextStyle?.(meme_id, { font: fontFamily, size: fontSize, allCaps });
                                return next;
                            });
                        }}
                        aria-label={editMode ? "Exit edit mode" : "Edit text"}
                        title={editMode ? "Exit edit mode" : "Edit text"}
                    >
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                    </button>
                    {onEditImage && (
                        <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => setShowEditInput(true)}
                            aria-label="Edit image"
                            title="Edit image"
                        >
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
                            </svg>
                        </button>
                    )}
                    <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={handleRegenerate}
                        disabled={isRegenerating}
                        aria-label="Regenerate"
                        title="Regenerate"
                    >
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 2v6h-6" />
                            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                            <path d="M3 22v-6h6" />
                            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                        </svg>
                    </button>
                </div>
            )}

            {/* ── Lightbox portal ─────────────────────────── */}
            {mounted && expanded && createPortal(
                <div
                    className={styles.lightboxBackdrop}
                    onClick={() => setExpanded(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label={`${toneLabel} meme`}
                >
                    <div className={styles.lightboxPanel} onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div className={styles.lightboxHeader}>
                            <span className={styles.toneBadge}>{toneLabel}</span>
                            <button
                                type="button"
                                className={styles.lightboxClose}
                                onClick={() => setExpanded(false)}
                                aria-label="Close"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>

                        {/* Image */}
                        <div className={styles.lightboxImageWrap}>
                            <Image
                                src={image_url}
                                alt=""
                                fill
                                className={styles.image}
                                sizes="540px"
                                loader={supabaseLoader}
                                priority
                            />
                            <span ref={namesSizerRef} className={styles.namesSizer} style={namesStyle} aria-hidden>
                                {names || "Names"}
                            </span>
                            {editMode ? (
                                <input
                                    type="text"
                                    className={styles.namesInput}
                                    style={namesStyle}
                                    value={names}
                                    onChange={handleNamesChange}
                                    placeholder="Names"
                                    aria-label="Edit names"
                                />
                            ) : (
                                names && <div className={styles.namesText} style={namesStyle}>{names}</div>
                            )}
                            {editMode ? (
                                <textarea
                                    className={styles.captionInput}
                                    style={captionStyle}
                                    value={caption}
                                    onChange={handleCaptionChange}
                                    placeholder="Caption"
                                    aria-label="Edit caption"
                                    rows={3}
                                />
                            ) : (
                                caption && <div className={styles.captionText} style={captionStyle}>{caption}</div>
                            )}
                            <div className={styles.logoWrap}>
                                <Image src="/assets/logo_white.png" alt="" fill className={styles.logo} sizes="28px" />
                            </div>
                            {isEditingImage && (
                                <div className={styles.editingOverlay}>
                                    <span className={styles.spinner} aria-hidden />
                                    <span className={styles.loadingText}>{productFile ? "Adding product…" : "Editing image…"}</span>
                                </div>
                            )}
                        </div>

                        {/* Text toolbar (edit mode) */}
                        {editMode && (
                            <div className={styles.toolbar}>
                                <div className={styles.toolbarRow}>
                                    {(["Poppins", "Inter", "Playfair", "Bebas", "Nunito"] as const).map((key) => (
                                        <button
                                            key={key}
                                            type="button"
                                            className={`${styles.fontPill} ${fontFamily === key ? styles.fontPillActive : ""}`}
                                            onClick={() => setFontFamily(key)}
                                            style={{ fontFamily: FONTS[key], ...(key === "Bebas" ? { letterSpacing: "0.06em" } : {}) }}
                                        >
                                            {FONT_LABELS[key]}
                                        </button>
                                    ))}
                                </div>
                                <div className={styles.toolbarRow}>
                                    {(["S", "M", "L", "XL"] as const).map((key) => (
                                        <button
                                            key={key}
                                            type="button"
                                            className={`${styles.sizeBtn} ${fontSize === key ? styles.sizeBtnActive : ""}`}
                                            onClick={() => setFontSize(key)}
                                        >
                                            {key}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        className={`${styles.capsBtn} ${allCaps ? styles.capsBtnActive : ""}`}
                                        onClick={() => setAllCaps((v) => !v)}
                                        aria-label="Toggle all caps"
                                    >
                                        AA
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Action bar */}
                        {showEditInput ? (
                            <div className={styles.actionBar}>
                                <button
                                    type="button"
                                    className={styles.actionBarCancel}
                                    onClick={() => { setShowEditInput(false); setEditInstruction(""); clearProductFile(); }}
                                    aria-label="Cancel edit"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                                <input ref={lightboxProductInputRef} type="file" accept="image/*" className={styles.productFileInput} onChange={handleProductFileChange} />
                                {productPreview ? (
                                    <button type="button" className={styles.productThumb} onClick={clearProductFile} title="Remove product image" aria-label="Remove product image">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={productPreview} alt="Product" className={styles.productThumbImg} />
                                        <span className={styles.productThumbX}>×</span>
                                    </button>
                                ) : (
                                    <button type="button" className={styles.actionBarImageBtn} onClick={() => lightboxProductInputRef.current?.click()} title="Add product or logo" aria-label="Add product or logo">
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                            <circle cx="8.5" cy="8.5" r="1.5" />
                                            <polyline points="21 15 16 10 5 21" />
                                        </svg>
                                    </button>
                                )}
                                <input
                                    type="text"
                                    className={styles.actionBarInput}
                                    value={editInstruction}
                                    onChange={(e) => setEditInstruction(e.target.value)}
                                    placeholder={productPreview ? "Where / how to place it…" : "make hair blonde, add red jacket…"}
                                    onKeyDown={(e) => e.key === "Enter" && handleEditImageSubmit()}
                                    autoFocus
                                />
                                <button type="button" className={styles.actionBarSend} onClick={handleEditImageSubmit} disabled={!editInstruction.trim() && !productFile} aria-label="Apply edit">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="22" y1="2" x2="11" y2="13" />
                                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                    </svg>
                                </button>
                            </div>
                        ) : (
                            <div className={styles.actionBar}>
                                <button type="button" className={styles.actionBtn} onClick={handleDownload} disabled={isDownloading} aria-label="Download" title="Download">
                                    {isDownloading ? <span className={styles.downloadSpinner} /> : (
                                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                                        </svg>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.actionBtn} ${editMode ? styles.actionBtnActive : ""}`}
                                    onClick={() => {
                                        setEditMode((v) => {
                                            const next = !v;
                                            if (!next) onSaveTextStyle?.(meme_id, { font: fontFamily, size: fontSize, allCaps });
                                            return next;
                                        });
                                    }}
                                    aria-label={editMode ? "Exit edit mode" : "Edit text"}
                                    title={editMode ? "Exit edit mode" : "Edit text"}
                                >
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                </button>
                                {onEditImage && (
                                    <button type="button" className={styles.actionBtn} onClick={() => setShowEditInput(true)} aria-label="Edit image" title="Edit image">
                                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
                                        </svg>
                                    </button>
                                )}
                                <button type="button" className={styles.actionBtn} onClick={handleRegenerate} disabled={isRegenerating} aria-label="Regenerate" title="Regenerate">
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                                    </svg>
                                </button>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </article>
    );
}
