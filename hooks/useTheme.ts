import { useEffect, useState } from 'react';

export function useTheme() {
    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (typeof window === 'undefined') return false;
        const saved = localStorage.getItem('optictext_theme');
        if (saved) return saved === 'dark';
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    });

    useEffect(() => {
        document.documentElement.classList.toggle('dark', isDarkMode);
        localStorage.setItem('optictext_theme', isDarkMode ? 'dark' : 'light');
    }, [isDarkMode]);

    return { isDarkMode, setIsDarkMode, toggleTheme: () => setIsDarkMode(v => !v) };
}
