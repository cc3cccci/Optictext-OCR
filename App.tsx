import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Scan,
    Sun,
    Moon,
    History,
    Menu,
    CheckCircle2,
    AlertCircle,
    Share,
    UploadCloud,
    ClipboardPaste,
    Loader2,
    Camera,
    RotateCcw,
} from './components/Icon';
import Sidebar from './components/Sidebar';
import ImageViewer from './components/ImageViewer';
import TextPanel from './components/TextPanel';
import EmptyState from './components/EmptyState';
import ToastStack, { ToastItem, ToastKind } from './components/Toast';
import ConfirmDialog from './components/ConfirmDialog';
import { DocumentScan, LayoutMode, OCRStatus } from './types';
import {
    fetchScans,
    fetchScanDetail,
    uploadForOCR,
    saveScanText,
    deleteScanById,
    retryScan,
    reflowScan,
    pollScanUntilDone,
} from './api';
import { compressImageIfNeeded, countWords, formatBytes } from './utils';
import { DEFAULT_IGNORE, MAX_UPLOAD_MB } from './constants';

const App: React.FC = () => {
    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (typeof window === 'undefined') return false;
        const saved = localStorage.getItem('optictext_theme');
        if (saved) return saved === 'dark';
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    });
    const [sidebarOpen, setSidebarOpen] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
    const [scans, setScans] = useState<DocumentScan[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);
    const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
    const [splitPct, setSplitPct] = useState(45);
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [confirm, setConfirm] = useState<{ title: string; message: string; danger?: boolean; onConfirm: () => void } | null>(null);
    const [nowTs, setNowTs] = useState(Date.now());

    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const pollingRef = useRef<Set<string>>(new Set());
    const ignoreTimer = useRef<number | null>(null);
    const searchTimer = useRef<number | null>(null);
    const splitDrag = useRef(false);

    const currentScan = scans.find(s => s.id === selectedId) || null;
    const ignoreEnabled = !!currentScan && currentScan.ignoreHeader + currentScan.ignoreFooter > 0.001;

    const toast = useCallback((message: string, kind: ToastKind = 'info') => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setToasts(prev => [...prev.slice(-4), { id, message, kind }]);
        window.setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    }, []);

    const mergeScan = useCallback((scan: DocumentScan) => {
        setScans(prev => {
            const idx = prev.findIndex(s => s.id === scan.id);
            if (idx < 0) return [scan, ...prev];
            const next = [...prev];
            next[idx] = { ...next[idx], ...scan };
            return next;
        });
    }, []);

    const startPolling = useCallback((id: string) => {
        if (pollingRef.current.has(id)) return;
        pollingRef.current.add(id);
        void pollScanUntilDone(id, mergeScan, () => !pollingRef.current.has(id))
            .catch(() => { /* 取消或网络错误由下一次刷新兜底 */ })
            .finally(() => { pollingRef.current.delete(id); });
    }, [mergeScan]);

    const loadHistory = useCallback(async () => {
        setIsLoadingHistory(true);
        try {
            const list = await fetchScans();
            setScans(prev => {
                const locals = prev.filter(s => s.isLocal);
                const ids = new Set(list.map(s => s.id));
                return [...locals.filter(s => !ids.has(s.id)), ...list];
            });
            setSelectedId(prev => prev ?? (list[0]?.id ?? null));
            setHistoryError(null);
            list.filter(s => s.status === OCRStatus.Processing).forEach(s => startPolling(s.id));
        } catch (e: any) {
            setHistoryError(e?.message || '加载历史记录失败');
        } finally {
            setIsLoadingHistory(false);
        }
    }, [startPolling]);

    useEffect(() => { loadHistory(); }, [loadHistory]);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', isDarkMode);
        localStorage.setItem('optictext_theme', isDarkMode ? 'dark' : 'light');
    }, [isDarkMode]);

    useEffect(() => {
        setCurrentPage(0);
        setSelectedSegmentId(null);
    }, [selectedId]);

    useEffect(() => {
        const hasProcessing = scans.some(s => s.status === OCRStatus.Processing);
        if (!hasProcessing) return;
        const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [scans]);

    const handleScanSelect = (id: string) => {
        setSelectedId(id);
        if (window.innerWidth < 1024) setSidebarOpen(false);
    };

    useEffect(() => {
        const scan = scans.find(s => s.id === selectedId);
        if (!scan || scan.isLocal || scan.segments) return;
        if (scan.status !== OCRStatus.Ready && scan.status !== OCRStatus.Processing) return;
        let cancelled = false;
        fetchScanDetail(scan.id)
            .then(detail => {
                if (!cancelled) mergeScan(detail);
            })
            .catch(() => { /* 详情非关键 */ });
        return () => { cancelled = true; };
    }, [selectedId, scans, mergeScan]);

    const enqueueUpload = useCallback((rawFile: File) => {
        const isPdf = rawFile.type === 'application/pdf' || rawFile.name.toLowerCase().endsWith('.pdf');
        const isImage = rawFile.type.startsWith('image/');
        if (!isPdf && !isImage) {
            toast(`不支持的文件类型:${rawFile.name}`, 'error');
            return;
        }
        if (rawFile.size > MAX_UPLOAD_MB * 1024 * 1024) {
            toast(`文件过大,上限 ${MAX_UPLOAD_MB}MB`, 'error');
            return;
        }

        const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const blobUrl = isImage ? URL.createObjectURL(rawFile) : '';
        const tempScan: DocumentScan = {
            id: tempId,
            title: rawFile.name,
            date: new Date().toISOString(),
            thumbnailUrl: blobUrl,
            fullImageUrl: blobUrl,
            extractedText: '正在上传…',
            status: OCRStatus.Processing,
            fileSize: rawFile.size,
            confidence: 0,
            processingTime: 0,
            imageWidth: 0,
            imageHeight: 0,
            pageCount: 1,
            pageDone: 0,
            layoutMode: 'paragraph',
            ignoreHeader: DEFAULT_IGNORE,
            ignoreFooter: DEFAULT_IGNORE,
            isLocal: true,
        };
        setScans(prev => [tempScan, ...prev]);
        setSelectedId(tempId);

        void (async () => {
            try {
                const file = isImage ? await compressImageIfNeeded(rawFile) : rawFile;
                const scan = await uploadForOCR(file);
                setScans(prev => prev.map(s => (s.id === tempId ? scan : s)));
                setSelectedId(cur => (cur === tempId ? scan.id : cur));
                if (blobUrl) URL.revokeObjectURL(blobUrl);
                startPolling(scan.id);
            } catch (e: any) {
                setScans(prev => prev.map(s => (
                    s.id === tempId
                        ? {
                            ...s,
                            status: OCRStatus.Error,
                            errorMessage: e?.message || '未知错误',
                            extractedText: `识别失败:${e?.message || '未知错误'}`,
                        }
                        : s
                )));
                toast(e?.message || '上传失败', 'error');
            }
        })();
    }, [startPolling, toast]);

    const processFiles = useCallback((files: File[]) => {
        files.forEach(enqueueUpload);
    }, [enqueueUpload]);

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (files.length) processFiles(files);
        event.target.value = '';
    };

    useEffect(() => {
        let dragCounter = 0;
        const hasFiles = (e: DragEvent) => e.dataTransfer?.types?.includes('Files');
        const onDragEnter = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragCounter++;
            setIsDragOver(true);
        };
        const onDragOver = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
        const onDragLeave = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            dragCounter = Math.max(0, dragCounter - 1);
            if (dragCounter === 0) setIsDragOver(false);
        };
        const onDrop = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragCounter = 0;
            setIsDragOver(false);
            const files = Array.from(e.dataTransfer?.files || []);
            if (files.length) processFiles(files);
        };
        window.addEventListener('dragenter', onDragEnter);
        window.addEventListener('dragover', onDragOver);
        window.addEventListener('dragleave', onDragLeave);
        window.addEventListener('drop', onDrop);
        return () => {
            window.removeEventListener('dragenter', onDragEnter);
            window.removeEventListener('dragover', onDragOver);
            window.removeEventListener('dragleave', onDragLeave);
            window.removeEventListener('drop', onDrop);
        };
    }, [processFiles]);

    useEffect(() => {
        const handleGlobalPaste = (event: ClipboardEvent) => {
            const items = event.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    if (blob) {
                        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
                        enqueueUpload(new File([blob], `粘贴图片_${stamp}.png`, { type: item.type }));
                        return;
                    }
                }
            }
        };
        window.addEventListener('paste', handleGlobalPaste);
        return () => window.removeEventListener('paste', handleGlobalPaste);
    }, [enqueueUpload]);

    const handlePasteButton = async () => {
        try {
            if (!navigator.clipboard || !(navigator.clipboard as any).read) {
                throw new Error('Clipboard API unavailable');
            }
            const clipboardItems = await (navigator.clipboard as any).read();
            for (const item of clipboardItems) {
                const imageType = item.types.find((type: string) => type.startsWith('image/'));
                if (imageType) {
                    const blob = await item.getType(imageType);
                    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
                    enqueueUpload(new File([blob], `粘贴图片_${stamp}.png`, { type: imageType }));
                    return;
                }
            }
            toast('剪贴板中没有图片。', 'info');
        } catch {
            toast('请直接按 Ctrl+V(Mac 为 Cmd+V)粘贴图片。', 'info');
        }
    };

    const handleTextUpdate = useCallback(async (id: string, newText: string) => {
        setScans(prev => prev.map(s => (s.id === id ? { ...s, extractedText: newText } : s)));
        if (id.startsWith('local-')) return;
        await saveScanText(id, newText);
    }, []);

    const performDelete = async (id: string) => {
        const scan = scans.find(s => s.id === id);
        if (!scan) return;
        if (!scan.isLocal) {
            try {
                await deleteScanById(id);
            } catch (err: any) {
                toast(`删除失败:${err?.message || '未知错误'}`, 'error');
                return;
            }
        }
        pollingRef.current.delete(id);
        setScans(prev => {
            const next = prev.filter(s => s.id !== id);
            if (selectedId === id) setSelectedId(next[0]?.id ?? null);
            return next;
        });
    };

    const handleDeleteScan = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const scan = scans.find(s => s.id === id);
        if (!scan) return;
        setConfirm({
            title: '删除记录',
            message: `确定删除「${scan.title}」吗?此操作不可恢复。`,
            danger: true,
            onConfirm: () => { setConfirm(null); void performDelete(id); },
        });
    };

    const handleRetry = async () => {
        if (!currentScan || currentScan.isLocal) return;
        try {
            const scan = await retryScan(currentScan.id);
            mergeScan(scan);
            startPolling(scan.id);
        } catch (e: any) {
            toast(e?.message || '无法重新识别', 'error');
        }
    };

    const handleLayoutMode = async (mode: LayoutMode) => {
        if (!currentScan || currentScan.isLocal) return;
        try {
            const scan = await reflowScan(currentScan.id, { layout_mode: mode });
            mergeScan(scan);
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
            void reflowScan(currentScan.id, { ignore_header: header, ignore_footer: footer })
                .then(mergeScan)
                .catch(() => { /* 拖动过程中失败可忽略 */ });
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
        const text = seg?.text;
        if (text && navigator.clipboard && window.isSecureContext) {
            /* 单击只定位;复制交给双击 */
        }
    };

    const handleExport = () => {
        if (!currentScan) return;
        const element = document.createElement('a');
        const file = new Blob([currentScan.extractedText], { type: 'text/plain;charset=utf-8' });
        element.href = URL.createObjectURL(file);
        const filename = currentScan.title.replace(/\.[^.]+$/, '') || '识别结果';
        element.download = `${filename}_识别文本.txt`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        URL.revokeObjectURL(element.href);
    };

    const handleSearchChange = (q: string) => {
        if (searchTimer.current) window.clearTimeout(searchTimer.current);
        if (!q.trim()) {
            fetchScans().then(list => {
                setScans(prev => {
                    const locals = prev.filter(s => s.isLocal || s.status === OCRStatus.Processing);
                    const ids = new Set(list.map(s => s.id));
                    return [...locals.filter(s => !ids.has(s.id)), ...list];
                });
            }).catch(() => { /* 保留当前列表 */ });
            return;
        }
        searchTimer.current = window.setTimeout(() => {
            fetchScans(q).then(list => {
                setScans(prev => {
                    const locals = prev.filter(s => s.isLocal || s.status === OCRStatus.Processing);
                    const ids = new Set(list.map(s => s.id));
                    return [...locals.filter(s => !ids.has(s.id)), ...list];
                });
            }).catch(() => { /* 本地过滤仍可用 */ });
        }, 300);
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            const typing = tag === 'INPUT' || tag === 'TEXTAREA';
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                toast('编辑内容会自动保存', 'success');
            }
            if (e.key === 'Escape') setSidebarOpen(false);
            if (e.key === '/' && !typing) {
                e.preventDefault();
                setSidebarOpen(true);
                searchRef.current?.focus();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [toast]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!splitDrag.current) return;
            const main = document.getElementById('workspace-split');
            if (!main) return;
            const rect = main.getBoundingClientRect();
            const pct = ((e.clientX - rect.left) / rect.width) * 100;
            setSplitPct(Math.min(70, Math.max(28, pct)));
        };
        const onUp = () => { splitDrag.current = false; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);

    const queue = useMemo(
        () => scans.filter(s => s.status === OCRStatus.Processing).sort((a, b) => a.date.localeCompare(b.date)),
        [scans],
    );
    const running = queue[0];
    const elapsed = running ? Math.max(0, Math.round((nowTs - new Date(running.date).getTime()) / 1000)) : 0;

    const wordCount = currentScan ? countWords(currentScan.extractedText) : 0;
    const confidenceColor = currentScan
        ? currentScan.confidence >= 90
            ? 'text-emerald-600 dark:text-emerald-400'
            : currentScan.confidence >= 70
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-red-600 dark:text-red-400'
        : '';

    return (
        <div className="flex flex-col h-screen w-full bg-bg-cream dark:bg-bg-dark font-sans transition-colors duration-300">
            <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,application/pdf" multiple onChange={handleFileUpload} />
            <input ref={cameraInputRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />

            <header className="flex items-center justify-between whitespace-nowrap border-b border-border-sepia dark:border-border-bronze px-4 sm:px-6 py-3 bg-bg-cream dark:bg-surface-dark z-30 shrink-0 w-full relative shadow-sm">
                <div className="flex items-center gap-3 sm:gap-4">
                    <button
                        className="lg:hidden p-2 -ml-2 text-text-brown dark:text-text-cream hover:bg-black/5 dark:hover:bg-white/10 rounded-md"
                        onClick={() => setSidebarOpen(true)}
                        aria-label="打开菜单"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                    <div className="flex items-center justify-center p-1.5 sm:p-2 bg-gradient-to-br from-primary to-primary-dark rounded-md text-white shadow-lg shadow-primary/20">
                        <Scan className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div>
                        <h2 className="text-base sm:text-lg font-bold font-serif italic tracking-wide text-text-brown dark:text-primary">
                            OpticText <span className="hidden sm:inline font-sans font-normal text-text-brown/50 dark:text-white/40 not-italic text-sm ml-1">文字识别</span>
                        </h2>
                    </div>
                </div>

                <div className="flex gap-2 sm:gap-3">
                    <button
                        onClick={handlePasteButton}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-md bg-surface-light dark:bg-white/5 border border-border-sepia dark:border-border-bronze hover:border-primary text-text-brown dark:text-text-cream"
                        title="从剪贴板粘贴图片(或直接按 Ctrl+V)"
                    >
                        <ClipboardPaste className="w-4 h-4" />
                        <span className="hidden sm:inline text-sm font-medium">粘贴</span>
                    </button>
                    <button
                        onClick={() => cameraInputRef.current?.click()}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-md bg-surface-light dark:bg-white/5 border border-border-sepia dark:border-border-bronze hover:border-primary text-text-brown dark:text-text-cream"
                        title="调用相机拍照识别"
                    >
                        <Camera className="w-4 h-4" />
                        <span className="hidden sm:inline text-sm font-medium">拍照</span>
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-md bg-surface-light dark:bg-white/5 border border-border-sepia dark:border-border-bronze hover:border-primary text-text-brown dark:text-text-cream"
                        title="上传图片或 PDF"
                    >
                        <UploadCloud className="w-4 h-4" />
                        <span className="hidden sm:inline text-sm font-medium">上传</span>
                    </button>
                    <div className="hidden sm:block w-px h-8 bg-border-sepia dark:bg-border-bronze mx-1 self-center"></div>
                    <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className="flex items-center justify-center rounded-lg w-9 h-9 sm:w-10 sm:h-10 hover:bg-surface-light dark:hover:bg-white/10 text-primary"
                        title="切换深色/浅色主题"
                    >
                        {isDarkMode ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
                    </button>
                </div>
            </header>

            {queue.length > 0 && running && (
                <div className="px-4 sm:px-6 py-1.5 bg-primary/10 border-b border-primary/20 text-primary text-xs sm:text-sm font-medium flex items-center gap-2 shrink-0">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span className="truncate">
                        队列 {1}/{queue.length} · {running.title}
                        {running.pageCount > 1 ? ` · 第 ${Math.max(1, running.pageDone)}/${running.pageCount} 页` : ''}
                        {elapsed > 0 ? ` · 已耗时 ${elapsed}s` : ''}
                    </span>
                </div>
            )}

            <div className="border-b border-border-sepia dark:border-border-bronze bg-surface-light dark:bg-surface-dark-lighter px-4 sm:px-6 py-2 sm:py-3 flex flex-wrap justify-between items-center gap-3 shrink-0 z-20">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className={`hidden lg:flex items-center justify-center ${sidebarOpen ? 'text-primary' : 'text-text-brown/60 dark:text-white/50 hover:text-primary'}`}
                        title={sidebarOpen ? '收起历史记录' : '展开历史记录'}
                    >
                        <History className="w-5 h-5" />
                    </button>

                    {currentScan ? (
                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 sm:gap-3">
                                <h1 className="text-base sm:text-lg font-bold leading-tight tracking-tight text-text-brown dark:text-text-cream truncate max-w-[150px] sm:max-w-md">
                                    {currentScan.title}
                                </h1>
                                {currentScan.status === OCRStatus.Ready && (
                                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span className="hidden sm:inline">识别完成</span>
                                    </span>
                                )}
                                {currentScan.status === OCRStatus.Processing && (
                                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-primary border border-primary/20">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        <span className="hidden sm:inline">
                                            {currentScan.pageCount > 1
                                                ? `${currentScan.pageDone}/${currentScan.pageCount} 页`
                                                : '识别中…'}
                                        </span>
                                    </span>
                                )}
                                {currentScan.status === OCRStatus.Error && (
                                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-red-600 border border-red-500/20">
                                        <AlertCircle className="w-3 h-3" />
                                        失败
                                    </span>
                                )}
                            </div>
                            <p className="text-text-brown/50 dark:text-white/40 text-[10px] sm:text-xs font-medium font-mono mt-0.5 truncate">
                                {formatBytes(currentScan.fileSize)} · {wordCount} 字
                                {currentScan.status === OCRStatus.Ready && (
                                    <>
                                        {' · '}
                                        <span className={confidenceColor}>置信度 {currentScan.confidence}%</span>
                                        {currentScan.processingTime > 0 && ` · 耗时 ${currentScan.processingTime.toFixed(1)}s`}
                                        {currentScan.pageCount > 1 && ` · 共 ${currentScan.pageCount} 页`}
                                    </>
                                )}
                            </p>
                        </div>
                    ) : (
                        <h1 className="text-base sm:text-lg font-bold text-text-brown/40 dark:text-white/30">
                            {isLoadingHistory ? '正在加载历史记录…' : '暂无文档'}
                        </h1>
                    )}
                </div>

                {currentScan && (
                    <div className="flex items-center gap-2">
                        {currentScan.status === OCRStatus.Error && !currentScan.isLocal && (
                            <button
                                onClick={() => void handleRetry()}
                                className="flex items-center gap-1 px-3 h-8 sm:h-9 rounded-md border border-primary/30 text-primary text-xs sm:text-sm font-bold"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                重新识别
                            </button>
                        )}
                        <button
                            onClick={handleExport}
                            className="flex cursor-pointer items-center gap-2 justify-center rounded-md h-8 sm:h-9 px-3 sm:px-5 bg-gradient-to-r from-primary to-primary-dark text-white text-xs sm:text-sm font-bold shadow-lg shadow-primary/20"
                            title="导出为 TXT 文本文件"
                        >
                            <span>导出 TXT</span>
                            <Share className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>

            {historyError && (
                <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2 bg-red-500/10 border-b border-red-500/20 text-red-700 dark:text-red-400 text-sm shrink-0">
                    <span className="flex items-center gap-2 min-w-0">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span className="truncate">历史记录加载失败:{historyError}</span>
                    </span>
                    <button onClick={loadHistory} className="shrink-0 underline font-semibold">重试</button>
                </div>
            )}

            <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
                <Sidebar
                    ref={searchRef}
                    scans={scans}
                    selectedId={selectedId}
                    onSelect={handleScanSelect}
                    onDelete={handleDeleteScan}
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    isLoading={isLoadingHistory}
                    onSearchChange={handleSearchChange}
                />

                <div id="workspace-split" className="flex-1 flex flex-col lg:flex-row w-full overflow-hidden relative z-0">
                    {currentScan ? (
                        <>
                            <div
                                className="split-left"
                                style={{ ['--split' as string]: `${splitPct}%` } as React.CSSProperties}
                            >
                                <ImageViewer
                                    scan={currentScan}
                                    currentPage={currentPage}
                                    onPageChange={setCurrentPage}
                                    selectedSegmentId={selectedSegmentId}
                                    onSegmentClick={handleSegmentClick}
                                    ignoreHeader={currentScan.ignoreHeader}
                                    ignoreFooter={currentScan.ignoreFooter}
                                    onIgnoreChange={handleIgnoreChange}
                                    ignoreEnabled={ignoreEnabled}
                                />
                            </div>
                            <div
                                className="hidden lg:block w-1.5 cursor-col-resize bg-border-sepia dark:bg-border-bronze hover:bg-primary/50 shrink-0"
                                onMouseDown={() => { splitDrag.current = true; }}
                                title="拖动调整分栏"
                            />
                            <TextPanel
                                scan={currentScan}
                                onUpdate={handleTextUpdate}
                                selectedSegmentId={selectedSegmentId}
                                onSegmentClick={handleSegmentClick}
                                currentPage={currentPage}
                                layoutMode={currentScan.layoutMode}
                                onLayoutMode={handleLayoutMode}
                                ignoreEnabled={ignoreEnabled}
                                onToggleIgnore={handleToggleIgnore}
                                onRetry={currentScan.isLocal ? undefined : handleRetry}
                                onCopyLine={(msg) => toast(msg, 'error')}
                            />
                        </>
                    ) : (
                        <EmptyState
                            isLoading={isLoadingHistory}
                            onUpload={() => fileInputRef.current?.click()}
                            onPaste={() => void handlePasteButton()}
                            onCamera={() => cameraInputRef.current?.click()}
                        />
                    )}
                </div>
            </main>

            {isDragOver && (
                <div className="fixed inset-0 z-[100] bg-primary/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                    <div className="bg-bg-cream dark:bg-surface-dark border-2 border-dashed border-primary rounded-2xl px-12 py-10 text-center shadow-2xl">
                        <UploadCloud className="w-12 h-12 text-primary mx-auto mb-3" />
                        <p className="text-lg font-bold text-text-brown dark:text-text-cream">松开鼠标开始识别</p>
                        <p className="text-sm text-text-brown/60 dark:text-white/50 mt-1">支持图片与 PDF,可一次拖入多个文件</p>
                    </div>
                </div>
            )}

            <ToastStack toasts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />
            {confirm && (
                <ConfirmDialog
                    title={confirm.title}
                    message={confirm.message}
                    danger={confirm.danger}
                    onConfirm={confirm.onConfirm}
                    onCancel={() => setConfirm(null)}
                />
            )}
        </div>
    );
};

export default App;
