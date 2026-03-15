import Link from "next/link";
import styles from "../page.module.css";
import StudioMemeCard, { TextStyle } from "@/components/StudioMemeCard";
import { HistoryItem } from "../types";
import { HISTORY_DEFAULT_SHOW } from "../constants";

// Never cut mid-carousel: if the Nth item belongs to a carousel,
// extend the slice to include all remaining slides of that carousel.
function sliceComplete(items: HistoryItem[], limit: number): HistoryItem[] {
    if (items.length <= limit) return items;
    const sliced = items.slice(0, limit);
    const lastItem = sliced[sliced.length - 1];
    if (lastItem?.carousel_id) {
        const extra = items.slice(limit).filter((i) => i.carousel_id === lastItem.carousel_id);
        return [...sliced, ...extra];
    }
    return sliced;
}

interface StudioHistoryProps {
    history: HistoryItem[];
    historyFetching: boolean;
    historyLoadingIds: Set<string>;
    showAllHistory: boolean;
    setShowAllHistory: (v: boolean | ((p: boolean) => boolean)) => void;
    handleDownload: (imageUrl: string, names: string, caption: string, textStyle: TextStyle) => Promise<void>;
    handleSaveTextStyle: (memeId: string, textStyle: TextStyle) => void;
    handleHistoryRegenerate: (item: HistoryItem) => void;
    handleHistoryEditImage: (item: HistoryItem, instruction: string, productBase64?: string) => Promise<void>;
}

export function StudioHistory({
    history, historyFetching, historyLoadingIds,
    showAllHistory, setShowAllHistory,
    handleDownload, handleSaveTextStyle,
    handleHistoryRegenerate, handleHistoryEditImage
}: StudioHistoryProps) {
    if (history.length === 0 && !historyFetching) return null;

    return (
        <section className={styles.historySection}>
            <div className={styles.historyHeader}>
                <h2 className={styles.resultsTitle}>
                    History
                    {history.length > 0 && (
                        <span className={styles.historyCount}>{history.length}</span>
                    )}
                </h2>
                <div className={styles.historyActions}>
                    {history.length > HISTORY_DEFAULT_SHOW && (
                        <button
                            type="button"
                            className={styles.showAllBtn}
                            onClick={() => setShowAllHistory((v) => !v)}
                        >
                            {showAllHistory ? "Show less" : `Show all ${history.length}`}
                        </button>
                    )}
                    <Link href="/studio/history" className={styles.viewAllLink}>
                        My Images →
                    </Link>
                </div>
            </div>

            {historyFetching && history.length === 0 ? (
                <p className={styles.historyEmpty}>Loading history…</p>
            ) : (
                <div className={styles.grid}>
                    {(showAllHistory ? history : sliceComplete(history, HISTORY_DEFAULT_SHOW)).map((item) => (
                        <StudioMemeCard
                            key={item.id}
                            meme_id={item.id}
                            image_url={item.image_url}
                            caption={item.caption}
                            names={item.names}
                            tone={item.tone}
                            initialTextStyle={item.text_style ?? undefined}
                            loading={historyLoadingIds.has(item.id)}
                            onRegenerate={() => handleHistoryRegenerate(item)}
                            onDownload={handleDownload}
                            onSaveTextStyle={handleSaveTextStyle}
                            onEditImage={(instruction, productBase64) => handleHistoryEditImage(item, instruction, productBase64)}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
