import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Type, Save, FileText, Copy, Trash2, CheckCircle2, AlertCircle, Loader2, RotateCcw } from './Icon';
import { DocumentScan, LayoutMode, OCRSegment, OCRStatus } from '../types';
import { visibleSegments } from '../utils';
import { downloadSearchablePdf } from '../api';

interface TextPanelProps {
    scan: DocumentScan;
    onUpdate: (id: string, text: string) => Promise<void>;
    selectedSegmentId: string | null;
    onSegmentClick: (id: string) => void;
    currentPage: number;
    layoutMode: LayoutMode;
    onLayoutMode: (mode: LayoutMode) => void;
    ignoreEnabled: boolean;
    onToggleIgnore: () => void;
    onRetry?: () => void;
    onCopyLine?: (text: string) => void;
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
const AUTOSAVE_DELAY_MS = 1200;

const TextPanel: React.FC<TextPanelProps> = ({
    scan, onUpdate, selectedSegmentId, onSegmentClick, currentPage,
    layoutMode, onLayoutMode, ignoreEnabled, onToggleIgnore, onRetry, onCopyLine,
}) => {
    const [text, setText] = useState(scan.extractedText);
    const [saveState, setSaveState] = useState<SaveState>('idle');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [editing, setEditing] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const pendingRef = useRef<{ id: string; text: string } | null>(null);
    const timerRef = useRef<number | null>(null);
    const onUpdateRef = useRef(onUpdate);
    useEffect(() => { onUpdateRef.current = onUpdate; });

    const isEditable = scan.status === OCRStatus.Ready;
    const page = scan.pages?.[currentPage];
    const height = page?.height || scan.imageHeight;
    const segs: OCRSegment[] = visibleSegments(
        page?.segments || (scan.segments || []).filter(s => (s.page ?? 0) === currentPage),
        height,
        ignoreEnabled ? scan.ignoreHeader : 0,
        ignoreEnabled ? scan.ignoreFooter : 0,
    );

    const doSave = useCallback(async (id: string, value: string) => {
        setSaveState('saving');
        try {
            await onUpdateRef.current(id, value);
            setSaveState(cur => (cur === 'saving' ? 'saved' : cur));
        } catch {
            setSaveState('error');
        }
    }, []);

    const flushPending = useCallback(() => {
        if (timerRef.current) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        const pending = pendingRef.current;
        if (pending) {
            pendingRef.current = null;
            void doSave(pending.id, pending.text);
        }
    }, [doSave]);

    const scheduleSave = useCallback((id: string, value: string) => {
        setSaveState('dirty');
        pendingRef.current = { id, text: value };
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            const pending = pendingRef.current;
            if (pending) {
                pendingRef.current = null;
                void doSave(pending.id, pending.text);
            }
        }, AUTOSAVE_DELAY_MS);
    }, [doSave]);

    useEffect(() => {
        setText(scan.extractedText);
        setSaveState('idle');
        setEditing(false);
        return () => { flushPending(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scan.id, scan.status, scan.extractedText]);

    useEffect(() => {
        if (!selectedSegmentId || !listRef.current) return;
        const el = listRef.current.querySelector(`[data-seg="${selectedSegmentId}"]`);
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [selectedSegmentId]);

    useEffect(() => {
        if (editing || !listRef.current) return;
        const mark = listRef.current.querySelector(`[data-page="${currentPage}"]`);
        mark?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, [currentPage, editing]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setText(value);
        if (isEditable) scheduleSave(scan.id, value);
    };

    const applyText = (value: string) => {
        setText(value);
        if (isEditable) {
            pendingRef.current = { id: scan.id, text: value };
            flushPending();
        }
    };

    const handleClear = () => {
        if (!text) return;
        applyText('');
    };

    const showCopySuccess = () => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const fallbackCopy = (value: string) => {
        const el = document.createElement('textarea');
        el.value = value;
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        try {
            if (document.execCommand('copy')) showCopySuccess();
        } finally {
            document.body.removeChild(el);
        }
    };

    const handleCopy = (value = text) => {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(value).then(showCopySuccess).catch(() => fallbackCopy(value));
        } else {
            fallbackCopy(value);
        }
    };

    const handleGeneratePdf = async () => {
        setIsGeneratingPdf(true);
        try {
            await downloadSearchablePdf(scan.id, scan.title);
        } catch (e: any) {
            onCopyLine?.(e?.message || '导出 PDF 失败');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const saveIndicator = (() => {
        if (!isEditable) return null;
        switch (saveState) {
            case 'dirty':
                return <span className="text-xs text-text-brown/50 dark:text-white/40">编辑中…</span>;
            case 'saving':
                return <span className="flex items-center gap-1 text-xs text-text-brown/50 dark:text-white/40"><Loader2 className="w-3 h-3 animate-spin" /> 保存中…</span>;
            case 'saved':
                return <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-3 h-3" /> 已自动保存</span>;
            case 'error':
                return (
                    <button onClick={() => { pendingRef.current = { id: scan.id, text }; flushPending(); }} className="flex items-center gap-1 text-xs text-red-500 hover:underline">
                        <AlertCircle className="w-3 h-3" /> 保存失败,点击重试
                    </button>
                );
            default:
                return null;
        }
    })();

    const modeBtn = (mode: LayoutMode, label: string) => (
        <button
            key={mode}
            type="button"
            disabled={!isEditable}
            onClick={() => onLayoutMode(mode)}
            className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors disabled:opacity-30 ${
                layoutMode === mode
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-transparent text-text-brown/60 dark:text-white/50 hover:bg-black/5 dark:hover:bg-white/10'
            }`}
        >
            {label}
        </button>
    );

    const renderLinked = () => {
        const multi = (scan.pages?.length || scan.pageCount) > 1;
        const pages = scan.pages && scan.pages.length
            ? scan.pages
            : [{ index: 0, segments: scan.segments || [], height: scan.imageHeight, width: scan.imageWidth, imageUrl: scan.fullImageUrl }];

        return (
            <div ref={listRef} className="w-full h-full overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                {pages.map((p) => {
                    const vis = visibleSegments(
                        p.segments || [],
                        p.height || scan.imageHeight,
                        ignoreEnabled ? scan.ignoreHeader : 0,
                        ignoreEnabled ? scan.ignoreFooter : 0,
                    );
                    return (
                        <div key={p.index} data-page={p.index} className="mb-4">
                            {multi && (
                                <div className="text-[11px] font-bold tracking-widest text-text-brown/40 dark:text-white/30 mb-2">
                                    第 {p.index + 1} 页
                                </div>
                            )}
                            {vis.length === 0 && (
                                <p className="text-sm text-text-brown/40">本页无识别文本</p>
                            )}
                            {vis.map(seg => {
                                const active = seg.id === selectedSegmentId;
                                const low = seg.confidence > 0 && seg.confidence < 0.7;
                                return (
                                    <button
                                        key={seg.id}
                                        type="button"
                                        data-seg={seg.id}
                                        onClick={() => onSegmentClick(seg.id)}
                                        onDoubleClick={() => handleCopy(seg.text)}
                                        className={`block w-full text-left px-2 py-1 rounded mb-0.5 font-mono text-sm leading-7 ${
                                            active
                                                ? 'bg-primary/25 ring-1 ring-primary/40'
                                                : low
                                                    ? 'bg-amber-500/10 hover:bg-amber-500/20'
                                                    : 'hover:bg-black/5 dark:hover:bg-white/10'
                                        }`}
                                        title="单击定位原图,双击复制此行"
                                    >
                                        {seg.text}
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <section className="flex-1 flex flex-col bg-bg-cream dark:bg-surface-dark relative z-0 min-h-0">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border-sepia dark:border-border-bronze shrink-0 bg-surface-light dark:bg-surface-dark-lighter/30 gap-2 flex-wrap">
                <div className="flex items-center gap-2.5">
                    <Type className="text-primary w-5 h-5" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-text-brown/60 dark:text-primary/70">
                        识别文本
                    </h3>
                </div>
                <div className="flex gap-1 items-center flex-wrap">
                    {saveIndicator}
                    {modeBtn('raw', '原文')}
                    {modeBtn('paragraph', '自然段')}
                    {modeBtn('single', '单行')}
                    <button
                        type="button"
                        onClick={onToggleIgnore}
                        className={`px-2 py-1 rounded text-[11px] font-semibold border ${
                            ignoreEnabled ? 'border-primary bg-primary/15 text-primary' : 'border-transparent text-text-brown/60 dark:text-white/50'
                        }`}
                        title="忽略页眉页脚(可在图上拖动色带)"
                    >
                        忽略页眉
                    </button>
                    <button
                        type="button"
                        onClick={() => setEditing(e => !e)}
                        disabled={!isEditable}
                        className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10 text-text-brown/60 hover:text-primary text-[11px] font-bold disabled:opacity-30"
                    >
                        {editing ? '对照' : '编辑'}
                    </button>
                </div>
            </div>

            <div className="flex-1 relative bg-bg-cream dark:bg-bg-dark min-h-0">
                {scan.status === OCRStatus.Error ? (
                    <div className="p-6 text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
                        {scan.errorMessage || text}
                        {onRetry && (
                            <button type="button" onClick={onRetry} className="mt-4 flex items-center gap-2 text-primary font-semibold">
                                <RotateCcw className="w-4 h-4" /> 重新识别
                            </button>
                        )}
                    </div>
                ) : editing || !isEditable ? (
                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={handleChange}
                        readOnly={!isEditable}
                        spellCheck={false}
                        placeholder="识别结果将显示在这里,可直接编辑,修改会自动保存。"
                        className="w-full h-full p-6 sm:p-8 bg-transparent border-0 resize-none focus:ring-0 text-text-brown dark:text-text-cream 
                        font-mono text-sm custom-scrollbar selection:bg-primary/30 outline-none placeholder:text-text-brown/30 dark:placeholder:text-white/20"
                        style={{
                            backgroundImage: 'linear-gradient(transparent 95%, rgba(197, 160, 89, 0.15) 95%)',
                            backgroundSize: '100% 2rem',
                            lineHeight: '2rem',
                        }}
                    />
                ) : (
                    renderLinked()
                )}
            </div>

            <div className="border-t border-border-sepia dark:border-border-bronze bg-surface-light dark:bg-surface-dark-lighter px-4 sm:px-6 py-3 flex justify-between items-center shrink-0 flex-wrap gap-2">
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={() => { pendingRef.current = { id: scan.id, text }; flushPending(); }}
                        disabled={!isEditable}
                        className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-border-sepia/30 dark:hover:bg-white/10 text-xs font-semibold text-text-brown dark:text-text-cream disabled:opacity-30"
                    >
                        {saveState === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span>保存</span>
                    </button>
                    <button
                        onClick={handleGeneratePdf}
                        disabled={isGeneratingPdf || !isEditable}
                        className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-border-sepia/30 dark:hover:bg-white/10 text-xs font-semibold text-text-brown dark:text-text-cream disabled:opacity-50"
                        title="导出双层可检索 PDF"
                    >
                        {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                        <span>导出 PDF</span>
                    </button>
                    <button
                        onClick={() => handleCopy()}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-semibold ${
                            isCopied
                                ? 'bg-green-500/10 border-green-500/20 text-green-600'
                                : 'bg-primary/10 hover:bg-primary/20 border-primary/20 text-primary'
                        }`}
                    >
                        {isCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        <span>{isCopied ? '已复制!' : '复制文本'}</span>
                    </button>
                    {scan.status === OCRStatus.Error && onRetry && (
                        <button onClick={onRetry} className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold text-primary">
                            <RotateCcw className="w-4 h-4" /> 重新识别
                        </button>
                    )}
                </div>
                <button
                    onClick={handleClear}
                    disabled={!isEditable || !text}
                    className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-red-500/10 text-xs font-semibold text-text-brown/60 hover:text-red-600 disabled:opacity-30"
                >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">清空</span>
                </button>
            </div>
        </section>
    );
};

export default TextPanel;
