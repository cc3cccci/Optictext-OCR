import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Palette } from './Icon';
import { COLORWAYS } from '../theme';

interface ColorwayPickerProps {
    colorway: string;
    onColorway: (id: string) => void;
}

const ColorwayPicker: React.FC<ColorwayPickerProps> = ({ colorway, onColorway }) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const groups = useMemo(() => {
        const map = new Map<string, typeof COLORWAYS>();
        for (const c of COLORWAYS) {
            const list = map.get(c.group) || [];
            list.push(c);
            map.set(c.group, list);
        }
        return [...map.entries()];
    }, []);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('mousedown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', onDown);
            window.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-9 h-9 rounded-full hover:bg-primary/5 dark:hover:bg-white/10 flex items-center justify-center text-amber-600 dark:text-amber-400 transition-colors duration-200 ease-quiet"
                title="配色主题"
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <Palette className="w-4 h-4" />
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute right-0 mt-2 w-56 z-[70] rounded-2xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-lift p-2 origin-top-right"
                >
                    <p className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">配色主题</p>
                    {groups.map(([group, list]) => (
                        <div key={group} className="mb-1 last:mb-0">
                            <p className="px-2 py-1 text-[10px] uppercase tracking-widest text-muted/80">{group}</p>
                            {list.map(cw => {
                                const active = cw.id === colorway;
                                return (
                                    <button
                                        key={cw.id}
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={active}
                                        onClick={() => { onColorway(cw.id); setOpen(false); }}
                                        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-sm transition-colors duration-150 ease-quiet ${
                                            active
                                                ? 'bg-amber-500/12 text-amber-800 dark:text-amber-200'
                                                : 'hover:bg-primary/5 dark:hover:bg-white/5 text-ink dark:text-ink-dark'
                                        }`}
                                    >
                                        <span
                                            className="flex items-center h-5 w-9 rounded-full border border-line dark:border-line-dark overflow-hidden shrink-0"
                                            aria-hidden
                                        >
                                            <span className="h-full w-1/3" style={{ background: cw.swatch[0] }} />
                                            <span className="h-full w-1/3" style={{ background: cw.swatch[1] }} />
                                            <span className="h-full w-1/3" style={{ background: cw.swatch[2] }} />
                                        </span>
                                        <span className="flex-1 text-left">{cw.label}</span>
                                        {active && <Check className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ColorwayPicker;
