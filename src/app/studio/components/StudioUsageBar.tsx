import styles from "../page.module.css";

interface StudioUsageBarProps {
    imagesUsed: number;
    imagesLimit: number;
    reelsUsed: number;
    reelsLimit: number;
    periodEndLabel: string | null;
}

export function StudioUsageBar({
    imagesUsed, imagesLimit,
    reelsUsed, reelsLimit,
    periodEndLabel
}: StudioUsageBarProps) {
    const imageAtLimit = imagesUsed >= imagesLimit;
    const reelAtLimit = reelsUsed >= reelsLimit;

    return (
        <div className={styles.usageBar}>
            <span className={imageAtLimit ? styles.usageAtLimit : styles.usageStat}>
                Images: {imagesUsed} / {imagesLimit}
            </span>
            <span className={styles.usageDivider}>·</span>
            <span className={reelAtLimit ? styles.usageAtLimit : styles.usageStat}>
                Reels: {reelsUsed} / {reelsLimit}
            </span>
            {periodEndLabel && (
                <>
                    <span className={styles.usageDivider}>·</span>
                    <span className={styles.usagePeriod}>Resets {periodEndLabel}</span>
                </>
            )}
        </div>
    );
}
