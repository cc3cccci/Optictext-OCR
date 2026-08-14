import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckSquare, FileImage, Loader2, Pin, Plus, Search, Square, Tag, Trash2, X } from './Icon';
import { DocumentScan, LibraryFilter, OCRStatus } from '../types';
import { SUGGESTED_TAGS } from '../constants';
import {
    collectTags,
    formatDate,
    groupScansByDate,
    isPdfScan,
    scanKind,
    tagClass,
} from '../utils';
import HighlightText from './Highlight';
import EmptyState from './EmptyState';

interface LibraryProps {
    scans: DocumentScan[];
    isLoading: boolean;
    error: string | null;
    query: string;
    onQueryChange: (q: string) => void;
    filter: LibraryFilter;
    onFilter: (f: LibraryFilter) => void;
    tagFilter: string | null;
    onTagFilter: (tag: string | null) => void;
    selectedIds: Set<string>;
    onToggleSelect: (id: string) => void;
    onClearSelect: () => void;
    onSelectAll: (ids: string[]) => void;
    onOpen: (id: string) => void;
    onDelete: (id: string) => void;
    onBatchDelete: () => void;
    onRename: (id: string, title: string) => void;
    onTogglePin: (id: string) => void;
    onAddTag: (ids: string[], tag: string) => void;
    onRetryHistory: () => void;
    onUpload: () => void;
    onPaste: () => void;
    onCamera: () => void;
    searchRef: React.RefObject<HTMLInputElement | null>;
}

const FILTERS: { id: LibraryFilter; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'processing', label: '识别中' },
    { id: 'error', label: '失败' },
    { id: 'image', label: '图片' },
    { id: 'pdf', label: 'PDF' },
];

const Library: React.FC<LibraryProps> = ({
    scans, isLoading, error, query, onQueryChange, filter, onFilter,
    tagFilter, onTagFilter, selectedIds, onToggleSelect, onClearSelect, onSelectAll,
    onOpen, onDelete, onBatchDelete, onRename, onTogglePin, onAddTag,
    onRetryHistory, onUpload, onPaste, onCamera, searchRef,
}) => {
    const [tagDraft, setTagDraft] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');

    const knownTags = useMemo(() => collectTags(scans), [scans]);

    const filtered = useMemo(() => {
        return scans.filter(scan => {
            if (filter === 'processing' && scan.status !== OCRStatus.Processing) return false;
            if (filter === 'error' && scan.status !== OCRStatus.Error) return false;
            if (filter === 'image' && isPdfScan(scan)) return false;
            if (filter === 'pdf' && !isPdfScan(scan)) return false;
            if (tagFilter && !(scan.tags || []).includes(tagFilter)) return false;
            if (query.trim()) {
                const q = query.trim().toLowerCase();
                const hay = `${scan.title}\n${scan.extractedText || ''}\n${scan.textPreview || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [scans, filter, tagFilter, query]);

    const groups = useMemo(() => groupScansByDate(filtered), [filtered]);
    const visibleIds = filtered.map(s => s.id);
    const selecting = selectedIds.size > 0;

    const commitRename = (id: string) => {
        const title = editTitle.trim();
        setEditingId(null);
        if (title) onRename(id, title);
    };

    const applyTag = (tag: string) => {
        const value = tag.trim();
        if (!value || !selectedIds.size) return;
        onAddTag([...selectedIds], value);
        setTagDraft('');
    };

    return (
        <div className="flex-1 min-h-0 flex flex-col bg-bg dark:bg-bg-dark">
            <div className="px-4 sm:px-6 pt-4 pb-3 shrink-0 space-y-3">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h1 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-ink dark:text-ink-dark">文档库</h1>
                        <p className="text-xs text-muted dark:text-muted-dark mt-1">
                            {isLoading && scans.length === 0 ? '正在加载…' : `${filtered.length} 份文档`}
                        </p>
                    </div>
                    <div className="hidden sm:flex gap-2">
                        <button type="button" onClick={onPaste} className="px-4 py-2 rounded-full border border-line dark:border-line-dark text-sm transition-colors duration-200 ease-quiet hover:border-primary hover:text-primary">粘贴</button>
                        <button type="button" onClick={onUpload} className="px-4 py-2 rounded-full bg-primary text-white text-sm font-medium shadow-card transition-all duration-200 ease-quiet hover:bg-primary-dark hover:-translate-y-px">上传</button>
                    </div>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                    <input
                        ref={searchRef}
                        value={query}
                        onChange={e => onQueryChange(e.target.value)}
                        placeholder="搜索标题或识别内容…"
                        className="w-full pl-9 pr-9 py-2.5 rounded-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40"
                    />
                    {query && (
                        <button type="button" onClick={() => onQueryChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink dark:hover:text-ink-dark" aria-label="清空搜索">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <div className="flex gap-2 overflow-x-auto pb-0.5">
                    {FILTERS.map(item => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onFilter(item.id)}
                            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors duration-200 ease-quiet ${
                                filter === item.id
                                    ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/40'
                                    : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark text-muted dark:text-muted-dark hover:border-primary/40'
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                    {knownTags.map(tag => (
                        <button
                            key={tag}
                            type="button"
                            onClick={() => onTagFilter(tagFilter === tag ? null : tag)}
                            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors duration-200 ease-quiet ${
                                tagFilter === tag
                                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-200'
                                    : `border-transparent ${tagClass(tag)}`
                            }`}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <div className="mx-4 sm:mx-6 mb-2 flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-red-500/10 text-red-700 dark:text-red-400 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span className="truncate">{error}</span>
                    </span>
                    <button type="button" onClick={onRetryHistory} className="underline font-semibold shrink-0">重试</button>
                </div>
            )}

            {selecting && (
                <div className="mx-4 sm:mx-6 mb-2 flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark">
                    <span className="text-sm font-medium">已选 {selectedIds.size} 项</span>
                    <button type="button" onClick={() => onSelectAll(visibleIds)} className="text-xs text-primary">全选当前</button>
                    <div className="flex items-center gap-1">
                        <Tag className="w-3.5 h-3.5 text-muted" />
                        <input
                            value={tagDraft}
                            onChange={e => setTagDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyTag(tagDraft); } }}
                            placeholder="打标签"
                            className="w-24 sm:w-32 bg-transparent text-xs border-b border-line dark:border-line-dark focus:outline-none focus:border-primary py-0.5"
                        />
                        <button type="button" onClick={() => applyTag(tagDraft)} className="p-1 text-primary" aria-label="添加标签">
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex gap-1 overflow-x-auto">
                        {SUGGESTED_TAGS.map(tag => (
                            <button key={tag} type="button" onClick={() => applyTag(tag)} className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] ${tagClass(tag)}`}>{tag}</button>
                        ))}
                    </div>
                    <button type="button" onClick={onBatchDelete} className="ml-auto flex items-center gap-1 text-xs text-red-600">
                        <Trash2 className="w-3.5 h-3.5" /> 删除
                    </button>
                    <button type="button" onClick={onClearSelect} className="text-xs text-muted">取消</button>
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-28 lg:pb-24">
                {isLoading && scans.length === 0 && (
                    <div className="flex items-center justify-center gap-2 py-20 text-muted text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> 加载中…
                    </div>
                )}

                {!isLoading && scans.length === 0 && (
                    <EmptyState isLoading={false} onUpload={onUpload} onPaste={onPaste} onCamera={onCamera} />
                )}

                {scans.length > 0 && filtered.length === 0 && (
                    <p className="text-center py-16 text-sm text-muted">没有匹配的文档</p>
                )}

                {groups.map(group => (
                    <section key={group.key} className="mb-6">
                        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted dark:text-muted-dark mb-3">
                            {group.label}
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {group.scans.map(scan => {
                                const selected = selectedIds.has(scan.id);
                                const editing = editingId === scan.id;
                                return (
                                    <article
                                        key={scan.id}
                                        className={`group relative flex gap-3 p-3.5 rounded-2xl border bg-surface dark:bg-surface-dark cursor-pointer shadow-card transition-all duration-200 ease-quiet hover:-translate-y-0.5 hover:shadow-lift ${
                                            selected
                                                ? 'border-primary ring-1 ring-primary/30'
                                                : 'border-line dark:border-line-dark hover:border-primary/40'
                                        }`}
                                        onClick={() => (selecting ? onToggleSelect(scan.id) : onOpen(scan.id))}
                                    >
                                        <button
                                            type="button"
                                            className="absolute top-2 left-2 z-10 p-1 rounded-md bg-white/90 dark:bg-black/40"
                                            onClick={e => { e.stopPropagation(); onToggleSelect(scan.id); }}
                                            aria-label={selected ? '取消选择' : '选择'}
                                        >
                                            {selected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted opacity-80 lg:opacity-0 lg:group-hover:opacity-100" />}
                                        </button>
                                        <div className="w-16 h-[4.5rem] rounded-xl overflow-hidden bg-surface-2 dark:bg-surface-2-dark shrink-0 border border-line dark:border-line-dark">
                                            {scan.status === OCRStatus.Processing ? (
                                                <div className="w-full h-full flex items-center justify-center animate-pulse">
                                                    <FileImage className="w-6 h-6 text-muted/40" />
                                                </div>
                                            ) : scan.thumbnailUrl ? (
                                                <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${scan.thumbnailUrl})` }} />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <FileImage className="w-6 h-6 text-muted/40" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            {editing ? (
                                                <input
                                                    autoFocus
                                                    value={editTitle}
                                                    onClick={e => e.stopPropagation()}
                                                    onChange={e => setEditTitle(e.target.value)}
                                                    onBlur={() => commitRename(scan.id)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') commitRename(scan.id);
                                                        if (e.key === 'Escape') setEditingId(null);
                                                    }}
                                                    className="w-full text-sm font-semibold bg-transparent border-b border-primary focus:outline-none"
                                                />
                                            ) : (
                                                <h3
                                                    className="text-sm font-semibold truncate pr-8"
                                                    onDoubleClick={e => {
                                                        e.stopPropagation();
                                                        setEditingId(scan.id);
                                                        setEditTitle(scan.title);
                                                    }}
                                                >
                                                    <HighlightText text={scan.title} query={query} />
                                                </h3>
                                            )}
                                            <p className="text-[11px] text-muted mt-1">
                                                {formatDate(scan.date)} · {scanKind(scan) === 'pdf' ? 'PDF' : '图片'}
                                                {scan.pageCount > 1 ? ` · ${scan.pageCount} 页` : ''}
                                            </p>
                                            <p className="text-[11px] text-muted/80 mt-1 line-clamp-2">
                                                <HighlightText text={scan.textPreview || scan.extractedText || ''} query={query} />
                                            </p>
                                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                                {scan.status === OCRStatus.Ready && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
                                                {scan.status === OCRStatus.Processing && <Loader2 className="w-3 h-3 text-amber-600 dark:text-amber-400 animate-spin" />}
                                                {scan.status === OCRStatus.Error && <AlertCircle className="w-3 h-3 text-red-500" />}
                                                <span className="text-[10px] text-muted">
                                                    {scan.status === OCRStatus.Processing
                                                        ? (scan.pageCount > 1 ? `${scan.pageDone}/${scan.pageCount} 页` : '识别中')
                                                        : scan.status === OCRStatus.Error ? '失败' : '已完成'}
                                                </span>
                                                {(scan.tags || []).slice(0, 3).map(tag => (
                                                    <span key={tag} className={`px-1.5 py-0.5 rounded-full text-[10px] ${tagClass(tag)}`}>{tag}</span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="absolute top-2 right-2 flex gap-0.5">
                                            <button
                                                type="button"
                                                title={scan.pinned ? '取消置顶' : '置顶'}
                                                className={`p-1.5 rounded-lg ${scan.pinned ? 'text-primary' : 'text-muted opacity-80 lg:opacity-0 lg:group-hover:opacity-100'}`}
                                                onClick={e => { e.stopPropagation(); onTogglePin(scan.id); }}
                                            >
                                                <Pin className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                title="删除"
                                                className="p-1.5 rounded-lg text-muted hover:text-red-600 opacity-80 lg:opacity-0 lg:group-hover:opacity-100"
                                                onClick={e => { e.stopPropagation(); onDelete(scan.id); }}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
};

export default Library;
