import { useCallback, useEffect, useState } from 'react';
import {
    DEFAULT_DARK,
    DEFAULT_LIGHT,
    isDarkColorway,
    normalizeColorway,
} from '../theme';

const STORAGE_KEY = 'optictext_colorway';

function initialColorway(): string {
    if (typeof window === 'undefined') return DEFAULT_LIGHT;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeColorway(saved);
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    return prefersDark ? DEFAULT_DARK : DEFAULT_LIGHT;
}

/**
 * Quiet Surface colorway controller. Applies the active palette (data-colorway
 * + `.dark` for dark ways) and remembers the last light/dark choice so the
 * sun/moon quick toggle preserves the user's picked palette.
 */
export function useTheme() {
    const [colorway, setColorwayState] = useState<string>(initialColorway);
    const [lastLight, setLastLight] = useState<string>(() =>
        isDarkColorway(colorway) ? DEFAULT_LIGHT : colorway,
    );
    const [lastDark, setLastDark] = useState<string>(() =>
        isDarkColorway(colorway) ? colorway : DEFAULT_DARK,
    );

    useEffect(() => {
        const root = document.documentElement;
        const dark = isDarkColorway(colorway);
        root.setAttribute('data-colorway', colorway);
        root.classList.toggle('dark', dark);
        localStorage.setItem(STORAGE_KEY, colorway);
    }, [colorway]);

    const setColorway = useCallback((id: string) => {
        const next = normalizeColorway(id);
        if (isDarkColorway(next)) setLastDark(next);
        else setLastLight(next);
        setColorwayState(next);
    }, []);

    const isDarkMode = isDarkColorway(colorway);

    const toggleTheme = useCallback(() => {
        setColorway(isDarkMode ? lastLight : lastDark);
    }, [isDarkMode, lastLight, lastDark, setColorway]);

    return { colorway, setColorway, isDarkMode, toggleTheme };
}
