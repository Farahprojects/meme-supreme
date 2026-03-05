import { useState, useEffect } from 'react';

export interface MemeRecord {
    id: string;
    url: string;
    tone: string;
    targets: string;
    timestamp: number;
}

const STORAGE_KEY = 'meme_supreme_history';

export function useMemeHistory() {
    const [history, setHistory] = useState<MemeRecord[]>([]);

    const loadHistory = () => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    setHistory(parsed);
                }
            }
        } catch (e) {
            console.error('Failed to load meme history', e);
        }
    };

    useEffect(() => {
        loadHistory();

        // Sync across instances in the same tab
        const handleSync = () => loadHistory();
        window.addEventListener('meme_history_sync', handleSync);

        // Sync across tabs
        window.addEventListener('storage', (e) => {
            if (e.key === STORAGE_KEY) handleSync();
        });

        return () => {
            window.removeEventListener('meme_history_sync', handleSync);
            window.removeEventListener('storage', handleSync);
        };
    }, []);

    const notifySync = () => {
        window.dispatchEvent(new Event('meme_history_sync'));
    };

    const addMeme = (meme: MemeRecord) => {
        const stored = localStorage.getItem(STORAGE_KEY);
        let current: MemeRecord[] = [];
        if (stored) {
            try { current = JSON.parse(stored); } catch { }
        }
        const updated = [meme, ...current];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        setHistory(updated);
        notifySync();
    };

    const removeMeme = (timestamp: number) => {
        const stored = localStorage.getItem(STORAGE_KEY);
        let current: MemeRecord[] = [];
        if (stored) {
            try { current = JSON.parse(stored); } catch { }
        }
        const updated = current.filter(m => m.timestamp !== timestamp);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        setHistory(updated);
        notifySync();
    };

    const clearHistory = () => {
        localStorage.removeItem(STORAGE_KEY);
        setHistory([]);
        notifySync();
    };

    return { history, addMeme, removeMeme, clearHistory };
}
