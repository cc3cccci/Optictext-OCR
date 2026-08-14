import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from './components/AppShell';
import { UploadCloud } from './components/Icon';
import Library from './components/Library';
import Workspace from './components/Workspace';
import CommandPalette, { CommandAction } from './components/CommandPalette';
import QueueDock from './components/QueueDock';
import MobileNav from './components/MobileNav';
import ToastStack, { ToastItem, ToastKind } from './components/Toast';
import ConfirmDialog from './components/ConfirmDialog';
import { AppView, LayoutMode, LibraryFilter, OCRStatus, WorkspaceMode } from './types';
import { DEFAULT_IGNORE } from './constants';
import { downloadTextFile, isTypingTarget, lowConfidenceSegments, toMarkdown } from './utils';
import { useTheme } from './hooks/useTheme';
import { useScans } from './hooks/useScans';
import { useUpload } from './hooks/useUpload';

const App: React.FC = () => {
    const { isDarkMode, toggleTheme, colorway, setColorway } = useTheme();
    const {
        scans, setScans, isLoading, error, mergeScan, startPolling, loadHistory,
        searchRemote, loadDetail, updateText, updateMeta, remove, removeMany, retry, reflow,
    } = useScans();

    const [view, setView] = useState<AppView>('library');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<LibraryFilter>('all');
    const [tagFilter, setTagFilter] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [mode, setMode] = useState<WorkspaceMode>('proof');
    const [currentPage, setCurrentPage] = useState(0);
    const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
    const [splitPct, setSplitPct] = useState(48);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [confirm, setConfirm] = useState<{ title: string; message: string; danger?: boolean; onConfirm: () => void } | null>(null);
    const [nowTs, setNowTs] = useState(Date.now());

    const searchRef = useRef<HTMLInputElement>(null);
    const ignoreTimer = useRef<number | null>(null);
    const splitDrag = useRef(false);

    const toast = useCallback((message: string, kind: ToastKind = 'info') => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setToasts(prev => [...prev.slice(-4), { id, message, kind }]);
        window.setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    }, []);

    const openScan = useCallback((id: string) => {
        setSelectedId(id);
        setView('workspace');
        setSelectedIds(new Set());
        setPaletteOpen(false);
    }, []);

    const { isDragOver, fileInputRef, cameraInputRef, handleFileInput, handlePasteButton } = useUpload({
        mergeScan,
        startPolling,
        setScans,
        toast,
        onUploaded: openScan,
    });

    const currentScan = scans.find(s => s.id === selectedId) || null;
    const ignoreEnabled = !!currentScan && currentScan.ignoreHeader + currentScan.ignoreFooter > 0.001;
    const queue = useMemo(
        () => scans.filter(s => s.status === OCRStatus.Processing).sort((a, b) => a.date.localeCompare(b.date)),
        [scans],
    );

    useEffect(() => {
        setCurrentPage(0);
        setSelectedSegmentId(null);
        setMode('proof');
    }, [selectedId]);

    useEffect(() => {
        const hasProcessing = scans.some(s => s.status === OCRStatus.Processing);
        if (!hasProcessing) return;
        const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [scans]);

    useEffect(() => {
        const scan = scans.find(s => s.id === selectedId);
        if (!scan || scan.isLocal || scan.segments) return;
        if (scan.status !== OCRStatus.Ready && scan.status !== OCRStatus.Processing) return;
        let cancelled = false;
        loadDetail(scan.id).catch(() => { /* 详情非关键 */ });
        return () => { cancelled = true; };
    }, [selectedId, scans, loadDetail]);

    const handleQuery = (q: string) => {
        setQuery(q);
        searchRemote(q);
    };

    const goLibrary = useCallback(() => {
        setView('library');
        setSelectedIds(new Set());
    }, []);

    const handleRename = async (id: string, title: string) => {
        try {
            await updateMeta(id, { title });
        } catch (e: any) {
            toast(e?.message || '改名失败', 'error');
        }
    };

    const handleTogglePin = async (id: string) => {
        const scan = scans.find(s => s.id === id);
        if (!scan) return;
        try {
            await updateMeta(id, { pinned: !scan.pinned });
        } catch (e: any) {
            toast(e?.message || '置顶失败', 'error');
        }
    };

    const handleAddTag = async (ids: string[], tag: string) => {
        try {
            for (const id of ids) {
                const scan = scans.find(s => s.id === id);
                if (!scan) continue;
                const tags = Array.from(new Set([...(scan.tags || []), tag])).slice(0, 12);
                await updateMeta(id, { tags });
            }
        } catch (e: any) {
            toast(e?.message || '打标签失败', 'error');
        }
    };

    const handleRemoveTag = async (id: string, tag: string) => {
        const scan = scans.find(s => s.id === id);
        if (!scan) return;
        try {
            await updateMeta(id, { tags: (scan.tags || []).filter(t => t !== tag) });
        } catch (e: any) {
            toast(e?.message || '移除标签失败', 'error');
        }
    };

    const performDelete = async (id: string) => {
        const scan = scans.find(s => s.id === id);
        if (!scan) return;
        try {
            await remove(id, scan.isLocal);
            if (selectedId === id) {
                setSelectedId(null);
                setView('library');
            }
        } catch (err: any) {
            toast(`删除失败:${err?.message || '未知错误'}`, 'error');
        }
    };

    const askDelete = (id: string) => {
        const scan = scans.find(s => s.id === id);
        if (!scan) return;
        setConfirm({
            title: '删除记录',
            message: `确定删除「${scan.title}」吗?此操作不可恢复。`,
            danger: true,
            onConfirm: () => { setConfirm(null); void performDelete(id); },
        });
    };

    const askBatchDelete = () => {
        const ids = [...selectedIds];
        if (!ids.length) return;
        setConfirm({
            title: '批量删除',
            message: `确定删除选中的 ${ids.length} 条记录吗?此操作不可恢复。`,
            danger: true,
            onConfirm: () => {
                setConfirm(null);
                void removeMany(ids).then(() => {
                    setSelectedIds(new Set());
                    if (selectedId && ids.includes(selectedId)) {
                        setSelectedId(null);
                        setView('library');
                    }
                }).catch((err: any) => toast(`删除失败:${err?.message || '未知错误'}`, 'error'));
            },
        });
    };

    const handleRetry = async () => {
        if (!currentScan || currentScan.isLocal) return;
        try {
            await retry(currentScan.id);
        } catch (e: any) {
            toast(e?.message || '无法重新识别', 'error');
        }
    };

    const handleLayoutMode = async (layout: LayoutMode) => {
        if (!currentScan || currentScan.isLocal) return;
        try {
            await reflow(currentScan.id, { layout_mode: layout });
        } catch (e: any) {
            toast(e?.message || '切换排版失败', 'error');
        }
    };

    const handleIgnoreChange = (header: number, footer: number) => {
        if (!currentScan) return;
        setScans(prev => prev.map(s => s.id === currentScan.id ? { ...s, ignoreHeader: header, ignoreFooter: footer } : s));
        if (currentScan.isLocal) return;
        if (ignoreTimer.current) window.clearTimeout(ignoreTimer.current);
        ignoreTimer.current = window.setTimeout(() => {
            void reflow(currentScan.id, { ignore_header: header, ignore_footer: footer }).catch(() => { /* 拖动过程中失败可忽略 */ });
        }, 450);
    };

    const handleToggleIgnore = () => {
        if (!currentScan) return;
        if (ignoreEnabled) handleIgnoreChange(0, 0);
        else handleIgnoreChange(DEFAULT_IGNORE, DEFAULT_IGNORE);
    };

    const handleSegmentClick = (id: string) => {
        setSelectedSegmentId(id);
        const seg = currentScan?.pages?.flatMap(p => p.segments).find(s => s.id === id)
            || currentScan?.segments?.find(s => s.id === id);
        if (seg && typeof seg.page === 'number') setCurrentPage(seg.page);
    };

    const jumpLow = useCallback((direction: 1 | -1) => {
        if (!currentScan) return;
        const lows = lowConfidenceSegments(
            currentScan,
            ignoreEnabled ? currentScan.ignoreHeader : 0,
            ignoreEnabled ? currentScan.ignoreFooter : 0,
        );
        if (!lows.length) {
            toast('没有存疑片段', 'info');
            return;
        }
        const idx = lows.findIndex(s => s.id === selectedSegmentId);
        const nextIndex = idx < 0
            ? (direction === 1 ? 0 : lows.length - 1)
            : (idx + direction + lows.length) % lows.length;
        const next = lows[nextIndex];
        setSelectedSegmentId(next.id);
        if (typeof next.page === 'number') setCurrentPage(next.page);
        setMode('proof');
        setView('workspace');
    }, [currentScan, ignoreEnabled, selectedSegmentId, toast]);

    const handleExportTxt = useCallback(() => {
        if (!currentScan) return;
        const filename = (currentScan.title.replace(/\.[^.]+$/, '') || '识别结果') + '_识别文本.txt';
        downloadTextFile(currentScan.extractedText || '', filename);
    }, [currentScan]);

    const handleExportMd = useCallback(() => {
        if (!currentScan) return;
        const filename = (currentScan.title.replace(/\.[^.]+$/, '') || '识别结果') + '.md';
        downloadTextFile(toMarkdown(currentScan), filename, 'text/markdown;charset=utf-8');
    }, [currentScan]);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!splitDrag.current) return;
            const main = document.getElementById('workspace-split');
            if (!main) return;
            const rect = main.getBoundingClientRect();
            const pct = ((e.clientX - rect.left) / rect.width) * 100;
            setSplitPct(Math.min(72, Math.max(28, pct)));
        };
        const onUp = () => { splitDrag.current = false; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);

    const actions: CommandAction[] = useMemo(() => [
        { id: 'upload', label: '上传文件', hint: 'U', run: () => fileInputRef.current?.click() },
        { id: 'camera', label: '拍照识别', run: () => cameraInputRef.current?.click() },
        { id: 'paste', label: '粘贴截图', hint: 'Ctrl+V', run: () => { void handlePasteButton(); } },
        { id: 'theme', label: isDarkMode ? '切换浅色主题' : '切换深色主题', run: toggleTheme },
        { id: 'library', label: '打开文档库', run: goLibrary },
        { id: 'proof', label: '校对模式', run: () => { if (selectedId) { setMode('proof'); setView('workspace'); } } },
        { id: 'read', label: '阅读模式', run: () => { if (selectedId) { setMode('read'); setView('workspace'); } } },
        { id: 'image', label: '原图模式', run: () => { if (selectedId) { setMode('image'); setView('workspace'); } } },
        { id: 'low', label: '下一条存疑', hint: 'J', run: () => jumpLow(1) },
        { id: 'txt', label: '导出 TXT', run: handleExportTxt },
        { id: 'md', label: '导出 Markdown', run: handleExportMd },
    ], [cameraInputRef, fileInputRef, goLibrary, handleExportMd, handleExportTxt, handlePasteButton, isDarkMode, jumpLow, selectedId, toggleTheme]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const typing = isTypingTarget(e.target);
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setPaletteOpen(v => !v);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                toast('编辑内容会自动保存', 'success');
                return;
            }
            if (e.key === 'Escape') {
                if (paletteOpen) { setPaletteOpen(false); return; }
                if (view === 'workspace') goLibrary();
                return;
            }
            if (e.key === '/' && !typing) {
                e.preventDefault();
                if (view === 'library') searchRef.current?.focus();
                else setPaletteOpen(true);
                return;
            }
            if (typing || paletteOpen) return;
            if (view === 'workspace' && (e.key === 'j' || e.key === 'J')) {
                e.preventDefault();
                jumpLow(1);
            }
            if (view === 'workspace' && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                jumpLow(-1);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [jumpLow, paletteOpen, toast, view]);

    return (
        <AppShell
            isDarkMode={isDarkMode}
            onToggleTheme={toggleTheme}
            colorway={colorway}
            onColorway={setColorway}
            onLibrary={goLibrary}
            onPaste={() => void handlePasteButton()}
            onUpload={() => fileInputRef.current?.click()}
            onCamera={() => cameraInputRef.current?.click()}
            onOpenPalette={() => setPaletteOpen(true)}
        >
            <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,application/pdf" multiple onChange={handleFileInput} />
            <input ref={cameraInputRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFileInput} />

            <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {view === 'workspace' && currentScan ? (
                    <Workspace
                        scan={currentScan}
                        mode={mode}
                        onMode={setMode}
                        currentPage={currentPage}
                        onPageChange={setCurrentPage}
                        selectedSegmentId={selectedSegmentId}
                        onSegmentClick={handleSegmentClick}
                        onJumpLow={jumpLow}
                        splitPct={splitPct}
                        onSplitStart={() => { splitDrag.current = true; }}
                        ignoreEnabled={ignoreEnabled}
                        onIgnoreChange={handleIgnoreChange}
                        onToggleIgnore={handleToggleIgnore}
                        onLayoutMode={handleLayoutMode}
                        onUpdateText={updateText}
                        onRetry={currentScan.isLocal ? undefined : handleRetry}
                        onBack={goLibrary}
                        onRename={title => void handleRename(currentScan.id, title)}
                        onTogglePin={() => void handleTogglePin(currentScan.id)}
                        onAddTag={tag => void handleAddTag([currentScan.id], tag)}
                        onRemoveTag={tag => void handleRemoveTag(currentScan.id, tag)}
                        onExportTxt={handleExportTxt}
                        onToast={toast}
                    />
                ) : (
                    <Library
                        scans={scans}
                        isLoading={isLoading}
                        error={error}
                        query={query}
                        onQueryChange={handleQuery}
                        filter={filter}
                        onFilter={setFilter}
                        tagFilter={tagFilter}
                        onTagFilter={setTagFilter}
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelect}
                        onClearSelect={() => setSelectedIds(new Set())}
                        onSelectAll={ids => setSelectedIds(new Set(ids))}
                        onOpen={openScan}
                        onDelete={askDelete}
                        onBatchDelete={askBatchDelete}
                        onRename={(id, title) => void handleRename(id, title)}
                        onTogglePin={id => void handleTogglePin(id)}
                        onAddTag={(ids, tag) => void handleAddTag(ids, tag)}
                        onRetryHistory={() => void loadHistory()}
                        onUpload={() => fileInputRef.current?.click()}
                        onPaste={() => void handlePasteButton()}
                        onCamera={() => cameraInputRef.current?.click()}
                        searchRef={searchRef}
                    />
                )}
            </main>

            <QueueDock queue={queue} nowTs={nowTs} onOpen={openScan} />
            <MobileNav
                view={view}
                onLibrary={goLibrary}
                onCamera={() => cameraInputRef.current?.click()}
                onSearch={() => setPaletteOpen(true)}
            />

            {isDragOver && (
                <div className="fixed inset-0 z-[100] bg-primary/15 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                    <div className="bg-surface dark:bg-surface-dark border-2 border-dashed border-amber-500/60 rounded-2xl px-12 py-10 text-center shadow-lift">
                        <span className="inline-flex w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 items-center justify-center mx-auto mb-3">
                            <UploadCloud className="w-9 h-9" />
                        </span>
                        <p className="font-serif text-xl font-semibold">松开鼠标开始识别</p>
                        <p className="text-sm text-muted mt-1">支持图片与 PDF,可一次拖入多个文件</p>
                    </div>
                </div>
            )}

            <CommandPalette
                open={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                scans={scans}
                actions={actions}
                onOpenScan={openScan}
            />
            <ToastStack toasts={toasts} onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))} />
            {confirm && (
                <ConfirmDialog
                    title={confirm.title}
                    message={confirm.message}
                    danger={confirm.danger}
                    onConfirm={confirm.onConfirm}
                    onCancel={() => setConfirm(null)}
                />
            )}
        </AppShell>
    );
};

export default App;
