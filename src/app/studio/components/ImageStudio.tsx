import styles from "../page.module.css";
import StudioMemeCard, { StudioTone, TextStyle } from "@/components/StudioMemeCard";
import { ResultState, MemeResult } from "../types";
import { TONES } from "../constants";

interface ImageStudioProps {
    hasGenerated: boolean;
    isGenerating: boolean;
    results: Record<StudioTone, ResultState>;
    selectedTones: Set<StudioTone>;
    handleRegenerate: (tone: StudioTone) => void;
    handleDownload: (imageUrl: string, names: string, caption: string, textStyle: TextStyle) => Promise<void>;
    handleSaveTextStyle: (memeId: string, textStyle: TextStyle) => void;
    handleEditImage: (tone: StudioTone, instruction: string, productBase64?: string) => Promise<void>;
    handleCaptionChange: (tone: StudioTone, caption: string) => void;
    handleNamesChange: (tone: StudioTone, names: string) => void;
    onGenerate: () => void;
    imageAtLimit: boolean;
    periodEndLabel: string | null;
}

export function ImageStudio({
    hasGenerated, isGenerating,
    results, selectedTones,
    handleRegenerate, handleDownload, handleSaveTextStyle, handleEditImage,
    handleCaptionChange, handleNamesChange,
    onGenerate, imageAtLimit, periodEndLabel
}: ImageStudioProps) {
    return (
        <>
            {imageAtLimit && (
                <p className={styles.limitMsg}>
                    You&apos;ve used all your images this month.
                    {periodEndLabel && ` Resets on ${periodEndLabel}.`}
                </p>
            )}
            <button
                type="button"
                className={styles.generateBtn}
                onClick={onGenerate}
                disabled={isGenerating || imageAtLimit}
            >
                {isGenerating ? "Creating…" : "Create"}
            </button>

            {hasGenerated && (
                <section className={styles.resultsSection}>
                    <h2 className={styles.resultsTitle}>Results</h2>
                    <div className={styles.grid}>
                        {TONES.filter((tone) => selectedTones.has(tone)).map((tone) => {
                            const state = results[tone];
                            if (state === "loading") {
                                return (
                                    <StudioMemeCard
                                        key={tone}
                                        meme_id=""
                                        image_url=""
                                        caption=""
                                        names=""
                                        tone={tone}
                                        onRegenerate={() => handleRegenerate(tone)}
                                        onDownload={handleDownload}
                                        loading
                                    />
                                );
                            }
                            if (state === "error") {
                                return (
                                    <div key={tone} className={styles.errorCard}>
                                        <span className={styles.toneLabel}>{tone}</span>
                                        <p>Failed to generate. Try again.</p>
                                        <button
                                            type="button"
                                            className={styles.retryBtn}
                                            onClick={() => handleRegenerate(tone)}
                                        >
                                            Retry
                                        </button>
                                    </div>
                                );
                            }
                            return (
                                <StudioMemeCard
                                    key={state.meme_id}
                                    meme_id={state.meme_id}
                                    image_url={state.image_url}
                                    caption={state.caption}
                                    names={state.names}
                                    tone={tone}
                                    onRegenerate={() => handleRegenerate(tone)}
                                    onCaptionChange={(caption) => handleCaptionChange(tone, caption)}
                                    onNamesChange={(names) => handleNamesChange(tone, names)}
                                    onDownload={handleDownload}
                                    onSaveTextStyle={handleSaveTextStyle}
                                    onEditImage={(instruction, productBase64) => handleEditImage(tone, instruction, productBase64)}
                                />
                            );
                        })}
                    </div>
                </section>
            )}
        </>
    );
}
