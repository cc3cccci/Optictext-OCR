import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    ArrowLeft,
    BookOpen,
    CheckCircle2,
    Columns2,
    Download,
    Highlighter,
    ImageIcon,
    Loader2,
    Pin,
    Plus,
    RotateCcw,
    Share2,
    Tag,
    X,
} from './Icon';
import ImageViewer from './ImageViewer';
import TextPanel from './TextPanel';
import { DocumentScan, LayoutMode, OCRStatus, WorkspaceMode } from '../types';
import { DEFAULT_IGNORE, SUGGESTED_TAGS } from '../constants';
import {
    countWords,
    downloadTextFile,
    formatBytes,
    lowConfidenceSegments,
    shareOrCopyText,
    tagClass,
    toMarkdown,
} from '../utils';

interface WorkspaceProps {
    scan: DocumentScan;
    mode: WorkspaceMode;
    onMode: (mode: WorkspaceMode) => void;
    currentPage: number;
    onPageChange: (page: number) => void;
    selectedSegmentId: string | null;
    onSegmentClick: (id: string) => void;
    onJumpLow: (direction: 1 | -1) => void;
    splitPct: number;
    onSplitStart: () => void;
    ignoreEnabled: boolean;
    onIgnoreChange: (header: number, footer: number) => void;
    onToggleIgnore: () => void;
    onLayoutMode: (mode: LayoutMode) => void;
    onUpdateText: (id: string, text: string) => Promise<void>;
    onRetry?: () => void;
    onBack: () => void;
    onRename: (title: string) => void;
    onTogglePin: () => void;
    onAddTag: (tag: string) => void;
    onRemoveTag: (tag: string) => void;
    onExportTxt: () => void;
    onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

const Workspace: React.FC<WorkspaceProps> = ({
    scan, mode, onMode, currentPage, onPageChange, selectedSegmentId, onSegmentClick,
    onJumpLow, splitPct, onSplitStart, ignoreEnabled, onIgnoreChange, onToggleIgnore,
    onLayoutMode, onUpdateText, onRetry, onBack, onRename, onTogglePin, onAddTag, onRemoveTag,
    onExportTxt, onToast,
}) => {
    const [mobilePane, setMobilePane] = useState<'image' | 'text'>('image');
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState(scan.title);
    const [tagDraft, setTagDraft] = useState('');
    const titleRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setTitleDraft(scan.title);
        setEditingTitle(false);
    }, [scan.id, scan.title]);

    const wordCount = countWords(scan.extractedText);
    const lows = useMemo(
        () => lowConfidenceSegments(scan, ignoreEnabled ? scan.ignoreHeader : 0, ignoreEnabled ? scan.ignoreFooter : 0),
        [scan, ignoreEnabled],
    );
    const confidenceColor = scan.confidence >= 90
        ? 'text-emerald-600 dark:text-emerald-400'
        : scan.confidence >= 70
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-red-600 dark:text-red-400';

    const commitTitle = () => {
        setEditingTitle(false);
        const next = titleDraft.trim();
        if (next && next !== scan.title) onRename(next);
        else setTitleDraft(scan.title);
    };

    const exportMd = () => {
        const name = (scan.title.replace(/\.[^.]+$/, '') || '识别结果') + '.md';
        downloadTextFile(toMarkdown(scan), name, 'text/markdown;charset=utf-8');
    };

    const share = async () => {
        try {
            const result = await shareOrCopyText(scan.title, scan.extractedText || '');
            onToast(result === 'shared' ? '已唤起系统分享' : '已复制文本', 'success');
        } catch (err: any) {
            if (err?.name !== 'AbortError') onToast('分享失败', 'error');
        }
    };

    const modeBtn = (id: WorkspaceMode, label: string, icon: React.ReactNode) => (
        <button
            type="button"
            onClick={() => onMode(id)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                mode === id ? 'bg-primary text-white' : 'text-muted hover:bg-black/5 dark:hover:bg-white/10'
            }`}
        >
            {icon}
            <span className="hidden sm:inline">{label}</span>
        </button>
    );

    const desktopProof = mode === 'proof';
    const readOnly = mode === 'read';

    return (
        <div className="flex-1 min-h-0 flex flex-col bg-bg dark:bg-bg-dark">
            <div className="shrink-0 border-b border-line dark:border-line-dark px-3 sm:px-5 py-2.5 flex flex-wrap items-center gap-2 bg-surface/80 dark:bg-surface-dark/80">
                <button type="button" onClick={onBack} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10" aria-label="返回文档库">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                    {editingTitle ? (
                        <input
                            ref={titleRef}
                            value={titleDraft}
                            onChange={e => setTitleDraft(e.target.value)}
                            onBlur={commitTitle}
                            onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                            className="w-full text-base font-semibold bg-transparent border-b border-primary focus:outline-none"
                        />
                    ) : (
                        <h1
                            className="text-base font-semibold truncate cursor-text"
                            title="点击改名"
                            onClick={() => { setEditingTitle(true); window.setTimeout(() => titleRef.current?.focus(), 0); }}
                        >
                            {scan.title}
                        </h1>
                    )}
                    <p className="text-[11px] text-muted font-mono truncate">
                        {formatBytes(scan.fileSize)} · {wordCount} 字
                        {scan.status === OCRStatus.Ready && (
                            <>
                                {' · '}
                                <span className={confidenceColor}>置信度 {scan.confidence}%</span>
                                {scan.processingTime > 0 && ` · ${scan.processingTime.toFixed(1)}s`}
                                {scan.pageCount > 1 && ` · ${scan.pageCount} 页`}
                            </>
                        )}
                    </p>
                </div>
                {scan.status === OCRStatus.Ready && (
                    <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" /> 识别完成
                    </span>
                )}
                {scan.status === OCRStatus.Processing && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {scan.pageCount > 1 ? `${scan.pageDone}/${scan.pageCount}` : '识别中'}
                    </span>
                )}
                {scan.status === OCRStatus.Error && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600">
                        <AlertCircle className="w-3 h-3" /> 失败
                    </span>
                )}
                <button type="button" onClick={onTogglePin} className={`p-2 rounded-xl ${scan.pinned ? 'text-primary' : 'text-muted hover:bg-black/5 dark:hover:bg-white/10'}`} title="置顶">
                    <Pin className="w-4 h-4" />
                </button>
                <div className="flex rounded-xl bg-surface-2 dark:bg-surface-2-dark p-0.5">
                    {modeBtn('proof', '校对', <Columns2 className="w-3.5 h-3.5" />)}
                    {modeBtn('read', '阅读', <BookOpen className="w-3.5 h-3.5" />)}
                    {modeBtn('image', '原图', <ImageIcon className="w-3.5 h-3.5" />)}
                </div>
                {scan.status === OCRStatus.Ready && lows.length > 0 && (
                    <button
                        type="button"
                        onClick={() => onJumpLow(1)}
                        className="hidden sm:flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10"
                        title="下一条存疑 J"
                    >
                        <Highlighter className="w-3.5 h-3.5" /> {lows.length}
                    </button>
                )}
                {scan.status === OCRStatus.Error && onRetry && (
                    <button type="button" onClick={onRetry} className="flex items-center gap-1 px-3 h-8 rounded-xl border border-primary/30 text-primary text-xs font-semibold">
                        <RotateCcw className="w-3.5 h-3.5" /> 重试
                    </button>
                )}
                <button type="button" onClick={onExportTxt} className="hidden sm:flex items-center gap-1 px-3.5 h-8 rounded-full bg-primary text-white text-xs font-semibold shadow-card transition-colors duration-200 ease-quiet hover:bg-primary-dark">
                    <Download className="w-3.5 h-3.5" /> TXT
                </button>
                <button type="button" onClick={exportMd} className="hidden sm:flex items-center gap-1 px-3.5 h-8 rounded-full border border-line dark:border-line-dark text-xs font-semibold transition-colors duration-200 ease-quiet hover:border-primary hover:text-primary">
                    MD
                </button>
                <button type="button" onClick={() => void share()} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10" title="分享">
                    <Share2 className="w-4 h-4" />
                </button>
            </div>

            <div className="shrink-0 px-4 sm:px-5 py-2 flex flex-wrap items-center gap-1.5 border-b border-line dark:border-line-dark">
                <Tag className="w-3.5 h-3.5 text-muted" />
                {(scan.tags || []).map(tag => (
                    <button
                        key={tag}
                        type="button"
                        onClick={() => onRemoveTag(tag)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${tagClass(tag)}`}
                        title="移除标签"
                    >
                        {tag} <X className="w-3 h-3" />
                    </button>
                ))}
                <input
                    value={tagDraft}
                    onChange={e => setTagDraft(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (tagDraft.trim()) { onAddTag(tagDraft.trim()); setTagDraft(''); }
                        }
                    }}
                    placeholder="添加标签"
                    className="w-24 text-xs bg-transparent border-b border-line dark:border-line-dark focus:outline-none focus:border-primary py-0.5"
                />
                <button type="button" onClick={() => { if (tagDraft.trim()) { onAddTag(tagDraft.trim()); setTagDraft(''); } }} className="p-1 text-primary" aria-label="添加标签">
                    <Plus className="w-3.5 h-3.5" />
                </button>
                {SUGGESTED_TAGS.filter(t => !(scan.tags || []).includes(t)).slice(0, 4).map(tag => (
                    <button key={tag} type="button" onClick={() => onAddTag(tag)} className={`px-2 py-0.5 rounded-full text-[11px] ${tagClass(tag)}`}>{tag}</button>
                ))}
            </div>

            {mode === 'proof' && (
                <div className="lg:hidden shrink-0 flex p-1 mx-4 mt-2 rounded-xl bg-surface-2 dark:bg-surface-2-dark">
                    <button type="button" onClick={() => setMobilePane('image')} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${mobilePane === 'image' ? 'bg-surface dark:bg-surface-dark shadow-sm' : 'text-muted'}`}>原图</button>
                    <button type="button" onClick={() => setMobilePane('text')} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${mobilePane === 'text' ? 'bg-surface dark:bg-surface-dark shadow-sm' : 'text-muted'}`}>文本</button>
                </div>
            )}

            <div id="workspace-split" className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
                {mode !== 'read' && (
                    <div
                        className={`split-left ${mode === 'proof' && mobilePane !== 'image' ? 'hidden lg:block' : ''} ${mode === 'image' ? '!w-full' : ''}`}
                        style={{ ['--split' as string]: mode === 'image' ? '100%' : `${splitPct}%` } as React.CSSProperties}
                    >
                        <ImageViewer
                            scan={scan}
                            currentPage={currentPage}
                            onPageChange={onPageChange}
                            selectedSegmentId={selectedSegmentId}
                            onSegmentClick={onSegmentClick}
                            ignoreHeader={scan.ignoreHeader}
                            ignoreFooter={scan.ignoreFooter}
                            onIgnoreChange={onIgnoreChange}
                            ignoreEnabled={ignoreEnabled}
                        />
                    </div>
                )}
                {desktopProof && (
                    <div
                        className="hidden lg:block w-1.5 cursor-col-resize bg-line dark:bg-line-dark hover:bg-primary/50 shrink-0"
                        onMouseDown={onSplitStart}
                        title="拖动调整分栏"
                    />
                )}
                {mode !== 'image' && (
                    <div className={`flex-1 min-h-0 ${mode === 'proof' && mobilePane !== 'text' ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'}`}>
                        <TextPanel
                            scan={scan}
                            onUpdate={onUpdateText}
                            selectedSegmentId={selectedSegmentId}
                            onSegmentClick={onSegmentClick}
                            currentPage={currentPage}
                            layoutMode={scan.layoutMode}
                            onLayoutMode={onLayoutMode}
                            ignoreEnabled={ignoreEnabled}
                            onToggleIgnore={onToggleIgnore}
                            onRetry={onRetry}
                            onCopyLine={(msg) => onToast(msg, 'error')}
                            reading={readOnly}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default Workspace;
