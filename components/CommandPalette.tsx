import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Command } from './Icon';
import { DocumentScan } from '../types';
import HighlightText from './Highlight';

export interface CommandAction {
    id: string;
    label: string;
    hint?: string;
    run: () => void;
}

interface CommandPaletteProps {
    open: boolean;
    onClose: () => void;
    scans: DocumentScan[];
    actions: CommandAction[];
    onOpenScan: (id: string) => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, scans, actions, onOpenScan }) => {
    const [query, setQuery] = useState('');
    const [index, setIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const docs = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = q
            ? scans.filter(s =>
                s.title.toLowerCase().includes(q)
                || (s.textPreview || '').toLowerCase().includes(q)
                || (s.extractedText || '').toLowerCase().includes(q))
            : scans.slice(0, 8);
        return list.slice(0, 8);
    }, [scans, query]);

    const filteredActions = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return actions;
        return actions.filter(a => a.label.toLowerCase().includes(q) || (a.hint || '').toLowerCase().includes(q));
    }, [actions, query]);

    const items = useMemo(() => {
        const rows: { type: 'doc' | 'action'; id: string; run: () => void }[] = [
            ...docs.map(s => ({ type: 'doc' as const, id: `doc:${s.id}`, run: () => onOpenScan(s.id) })),
            ...filteredActions.map(a => ({ type: 'action' as const, id: `act:${a.id}`, run: a.run })),
        ];
        return rows;
    }, [docs, filteredActions, onOpenScan]);

    useEffect(() => {
        if (open) {
            setQuery('');
            setIndex(0);
            window.setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [open]);

    useEffect(() => { setIndex(0); }, [query]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex(i => Math.min(items.length - 1, i + 1));
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex(i => Math.max(0, i - 1));
            }
            if (e.key === 'Enter' && items[index]) {
                e.preventDefault();
                items[index].run();
                onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, items, index, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[220] flex items-start justify-center pt-[12vh] px-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg rounded-2xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 border-b border-line dark:border-line-dark">
                    <Command className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="搜索文档或输入命令…"
                        className="flex-1 py-3 bg-transparent text-sm focus:outline-none"
                    />
                    <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded border border-line dark:border-line-dark text-muted">ESC</kbd>
                </div>
                <div className="max-h-[50vh] overflow-y-auto py-2">
                    {docs.length > 0 && (
                        <div className="px-2 pb-1">
                            <p className="px-2 py-1 text-[10px] uppercase tracking-widest text-muted">文档</p>
                            {docs.map((scan, i) => {
                                const active = index === i;
                                return (
                                    <button
                                        key={scan.id}
                                        type="button"
                                        className={`w-full text-left px-3 py-2 rounded-xl text-sm ${active ? 'bg-amber-500/12 text-amber-800 dark:text-amber-200' : 'hover:bg-primary/5 dark:hover:bg-white/5'}`}
                                        onMouseEnter={() => setIndex(i)}
                                        onClick={() => { onOpenScan(scan.id); onClose(); }}
                                    >
                                        <HighlightText text={scan.title} query={query} className="font-medium block truncate" />
                                        <span className="block text-[11px] text-muted truncate">{scan.textPreview || '无预览'}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {filteredActions.length > 0 && (
                        <div className="px-2">
                            <p className="px-2 py-1 text-[10px] uppercase tracking-widest text-muted">命令</p>
                            {filteredActions.map((action, i) => {
                                const row = docs.length + i;
                                const active = index === row;
                                return (
                                    <button
                                        key={action.id}
                                        type="button"
                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm ${active ? 'bg-amber-500/12 text-amber-800 dark:text-amber-200' : 'hover:bg-primary/5 dark:hover:bg-white/5'}`}
                                        onMouseEnter={() => setIndex(row)}
                                        onClick={() => { action.run(); onClose(); }}
                                    >
                                        <span>{action.label}</span>
                                        {action.hint && <span className="text-[10px] text-muted">{action.hint}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {items.length === 0 && (
                        <p className="px-4 py-8 text-center text-sm text-muted">没有匹配项</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CommandPalette;
