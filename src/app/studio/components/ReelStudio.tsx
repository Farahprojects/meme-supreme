import styles from "../page.module.css";
import ReelResult from "@/components/ReelResult";
import { ReelStatus, ReelScriptStatus } from "../types";

interface ReelStudioProps {
    reelStatus: ReelStatus;
    reelPhase: number | null;
    reelError: string | null;
    reelVideoUrl: string | null;
    reelScriptStatus: ReelScriptStatus;
    handleCreateReel: () => void;
    reelAtLimit: boolean;
    periodEndLabel: string | null;
    hasValidScript: boolean;
}

export function ReelStudio({
    reelStatus, reelPhase, reelError, reelVideoUrl,
    reelScriptStatus, handleCreateReel,
    reelAtLimit, periodEndLabel,
    hasValidScript
}: ReelStudioProps) {
    return (
        <>
            {reelAtLimit && (
                <p className={styles.limitMsg}>
                    You&apos;ve used all your reels this month.
                    {periodEndLabel && ` Resets on ${periodEndLabel}.`}
                </p>
            )}
            <button
                type="button"
                className={styles.generateBtn}
                onClick={handleCreateReel}
                disabled={
                    reelAtLimit ||
                    reelStatus === "generating" ||
                    reelScriptStatus !== "ready" ||
                    !hasValidScript
                }
            >
                {reelStatus === "generating"
                    ? reelPhase !== null && reelPhase > 0
                        ? "Extending reel…"
                        : "Creating…"
                    : reelScriptStatus === "ready" && hasValidScript
                        ? "Generate Reel"
                        : "Write Script First"}
            </button>

            {reelStatus === "generating" && (
                <p className={styles.reelProgress}>
                    {reelPhase !== null && reelPhase > 0 ? "Extending your reel (7s)…" : "Generating your reel… this takes ~30–90s"}
                </p>
            )}
            {reelStatus === "error" && reelError && (
                <p className={styles.reelError}>{reelError}</p>
            )}
            {reelStatus === "done" && reelVideoUrl && (
                <section className={styles.reelResultSection}>
                    <ReelResult videoUrl={reelVideoUrl} />
                </section>
            )}
        </>
    );
}
