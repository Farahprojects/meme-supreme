import styles from "../page.module.css";

export function StudioHeader() {
    return (
        <header className={styles.header}>
            <h1 className={styles.title}>
                Meme <span className="text-gradient">Studio</span>
            </h1>
            <p className={styles.subtitle}>
                Choose your tones, generate in parallel, edit and download.
            </p>
        </header>
    );
}
