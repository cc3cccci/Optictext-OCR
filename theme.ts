// Quiet Surface colorway registry. The hex values here are only for the
// picker swatches; the actual applied palette lives in index.css (CSS vars).

export interface Colorway {
    id: string;
    label: string;
    group: string;
    dark: boolean;
    /** swatch preview: [canvas, primary/solid, accent] */
    swatch: [string, string, string];
}

export const COLORWAYS: Colorway[] = [
    { id: 'latte', label: 'Latte', group: '浅色暖调', dark: false, swatch: ['#F2ECE1', '#4E3B2C', '#D97706'] },
    { id: 'honey', label: 'Honey', group: '浅色暖调', dark: false, swatch: ['#F6EEDC', '#7A4E1E', '#D97706'] },
    { id: 'clay', label: 'Clay', group: '浅色暖调', dark: false, swatch: ['#F4E9E0', '#8A4A36', '#D97706'] },
    { id: 'mist', label: 'Mist', group: '浅色冷调', dark: false, swatch: ['#ECEFF2', '#37414E', '#D97706'] },
    { id: 'sage', label: 'Sage', group: '浅色冷调', dark: false, swatch: ['#EBF0E9', '#3A4A36', '#D97706'] },
    { id: 'plum', label: 'Plum', group: '浅色冷调', dark: false, swatch: ['#F1EBF0', '#583A54', '#D97706'] },
    { id: 'charcoal', label: 'Charcoal', group: '深色', dark: true, swatch: ['#161311', '#D8A05C', '#FBBF24'] },
    { id: 'slate', label: 'Slate', group: '深色', dark: true, swatch: ['#111418', '#9DB2C9', '#FBBF24'] },
];

export const COLORWAY_IDS = COLORWAYS.map(c => c.id);
export const DEFAULT_LIGHT = 'latte';
export const DEFAULT_DARK = 'charcoal';

export function isDarkColorway(id: string): boolean {
    return COLORWAYS.find(c => c.id === id)?.dark ?? false;
}

export function normalizeColorway(id: string | null | undefined): string {
    return id && COLORWAY_IDS.includes(id) ? id : DEFAULT_LIGHT;
}
