import React, { useCallback, useEffect, useRef, useState } from 'react';
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
} from './components/Icon';
import Sidebar from './components/Sidebar';
import ImageViewer from './components/ImageViewer';
import TextPanel from './components/TextPanel';
import EmptyState from './components/EmptyState';
import { DocumentScan, OCRStatus } from './types';
import { fetchScans, fetchScanDetail, uploadForOCR, saveScanText, deleteScanById } from './api';
import { compressImageIfNeeded, countWords, formatBytes } from './utils';
import { MAX_UPLOAD_MB } from './constants';

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

    // 上传串行队列:弱设备上并行识别会互相拖慢,逐个排队处理
    const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());

    const currentScan = scans.find(s => s.id === selectedId) || null;

    // ---------- 历史记录 ----------

    const loadHistory = useCallback(async () => {
        setIsLoadingHistory(true);
        try {
            const list = await fetchScans();
            setScans(prev => {
                // 保留仍在处理/失败的本地临时条目
                const locals = prev.filter(s => s.isLocal);
                return [...locals, ...list];
            });
            setSelectedId(prev => prev ?? (list[0]?.id ?? null));
            setHistoryError(null);
        } catch (e: any) {
            setHistoryError(e?.message || '加载历史记录失败');
        } finally {
            setIsLoadingHistory(false);
        }
    }, []);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    // ---------- 主题 ----------

    useEffect(() => {
        document.documentElement.classList.toggle('dark', isDarkMode);
        localStorage.setItem('optictext_theme', isDarkMode ? 'dark' : 'light');
    }, [isDarkMode]);

    // ---------- 选择与详情补载 ----------

    const handleScanSelect = (id: string) => {
        setSelectedId(id);
        if (window.innerWidth < 1024) {
            setSidebarOpen(false);
        }
    };

    // 选中的记录若还没有文字框坐标,则拉取详情补全(用于识别区域覆盖层)
    useEffect(() => {
        const scan = scans.find(s => s.id === selectedId);
        if (!scan || scan.isLocal || scan.status !== OCRStatus.Ready || scan.segments) return;
        let cancelled = false;
        fetchScanDetail(scan.id)
            .then(detail => {
                if (cancelled) return;
                setScans(prev => prev.map(s => (s.id === detail.id ? { ...s, segments: detail.segments || [] } : s)));
            })
            .catch(() => { /* 覆盖层非关键功能,失败静默 */ });
        return () => {
            cancelled = true;
        };
    }, [selectedId, scans]);

    // ---------- 上传与识别 ----------

    const enqueueUpload = useCallback((rawFile: File) => {
        const isPdf = rawFile.type === 'application/pdf' || rawFile.name.toLowerCase().endsWith('.pdf');
        const isImage = rawFile.type.startsWith('image/');
        if (!isPdf && !isImage) {
            alert(`不支持的文件类型:${rawFile.name}\n仅支持图片或 PDF 文件。`);
            return;
        }
        if (rawFile.size > MAX_UPLOAD_MB * 1024 * 1024) {
            alert(`文件过大:${rawFile.name}(${formatBytes(rawFile.size)})\n上限为 ${MAX_UPLOAD_MB}MB。`);
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
            extractedText: '正在识别中,请稍候…\n(弱设备上较大的图片或多页 PDF 可能需要几十秒)',
            status: OCRStatus.Processing,
            fileSize: rawFile.size,
            confidence: 0,
            processingTime: 0,
            imageWidth: 0,
            imageHeight: 0,
            pageCount: 1,
            isLocal: true,
        };
        setScans(prev => [tempScan, ...prev]);
        setSelectedId(tempId);

        uploadQueueRef.current = uploadQueueRef.current.then(async () => {
            try {
                const file = isImage ? await compressImageIfNeeded(rawFile) : rawFile;
                const scan = await uploadForOCR(file);
                setScans(prev => prev.map(s => (s.id === tempId ? scan : s)));
                setSelectedId(cur => (cur === tempId ? scan.id : cur));
                if (blobUrl) URL.revokeObjectURL(blobUrl);
            } catch (e: any) {
                setScans(prev => prev.map(s => (
                    s.id === tempId
                        ? {
                            ...s,
                            status: OCRStatus.Error,
                            extractedText: `识别失败:${e?.message || '未知错误'}\n\n可尝试重新上传,或检查后端服务状态。\n(此失败条目仅本次会话可见,刷新后消失)`,
                        }
                        : s
                )));
            }
        });
    }, []);

    const processFiles = useCallback((files: File[]) => {
        files.forEach(enqueueUpload);
    }, [enqueueUpload]);

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (files.length) processFiles(files);
        // 允许重复选择同一文件
        event.target.value = '';
    };

    // 全局拖拽上传
    useEffect(() => {
        let dragCounter = 0;
        const hasFiles = (e: DragEvent) => e.dataTransfer?.types?.includes('Files');

        const onDragEnter = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragCounter++;
            setIsDragOver(true);
        };
        const onDragOver = (e: DragEvent) => {
            if (hasFiles(e)) e.preventDefault();
        };
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

    // 全局粘贴(Ctrl+V)上传:HTTP 环境下剪贴板 API 不可用,粘贴事件仍然有效
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
            alert('剪贴板中没有图片。');
        } catch {
            // HTTP(非安全上下文)环境下浏览器禁用剪贴板 API,提示使用快捷键(粘贴事件不受限)
            alert('浏览器限制了剪贴板读取,请直接按 Ctrl+V(Mac 为 Cmd+V)粘贴图片。');
        }
    };

    // ---------- 文本保存 ----------

    const handleTextUpdate = useCallback(async (id: string, newText: string) => {
        setScans(prev => prev.map(s => (s.id === id ? { ...s, extractedText: newText } : s)));
        if (id.startsWith('local-')) return; // 临时条目不写后端
        await saveScanText(id, newText);
    }, []);

    // ---------- 删除 ----------

    const handleDeleteScan = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const scan = scans.find(s => s.id === id);
        if (!scan) return;
        if (!confirm(`确定删除「${scan.title}」吗?此操作不可恢复。`)) return;

        if (!scan.isLocal) {
            try {
                await deleteScanById(id);
            } catch (err: any) {
                alert(`删除失败:${err?.message || '未知错误'}`);
                return;
            }
        }
        setScans(prev => {
            const next = prev.filter(s => s.id !== id);
            if (selectedId === id) {
                setSelectedId(next[0]?.id ?? null);
            }
            return next;
        });
    };

    // ---------- 导出 TXT ----------

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
            {/* 顶栏 */}
            <header className="flex items-center justify-between whitespace-nowrap border-b border-border-sepia dark:border-border-bronze px-4 sm:px-6 py-3 bg-bg-cream dark:bg-surface-dark z-30 shrink-0 w-full relative shadow-sm">
                <div className="flex items-center gap-3 sm:gap-4">
                    <button
                        className="lg:hidden p-2 -ml-2 text-text-brown dark:text-text-cream hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors"
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
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-md bg-surface-light dark:bg-white/5 border border-border-sepia dark:border-border-bronze hover:border-primary text-text-brown dark:text-text-cream transition-all group"
                        title="从剪贴板粘贴图片(或直接按 Ctrl+V)"
                    >
                        <ClipboardPaste className="w-4 h-4 group-hover:text-primary" />
                        <span className="hidden sm:inline text-sm font-medium">粘贴</span>
                    </button>

                    <label
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-md bg-surface-light dark:bg-white/5 border border-border-sepia dark:border-border-bronze hover:border-primary text-text-brown dark:text-text-cream transition-all group"
                        title="上传图片或 PDF(支持多选、拖拽)"
                    >
                        <UploadCloud className="w-4 h-4 group-hover:text-primary" />
                        <span className="hidden sm:inline text-sm font-medium">上传识别</span>
                        <input type="file" className="hidden" accept="image/*,.pdf,application/pdf" multiple onChange={handleFileUpload} />
                    </label>

                    <div className="hidden sm:block w-px h-8 bg-border-sepia dark:bg-border-bronze mx-1 self-center"></div>

                    <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className="flex items-center justify-center rounded-lg w-9 h-9 sm:w-10 sm:h-10 hover:bg-surface-light dark:hover:bg-white/10 text-primary transition-colors"
                        title="切换深色/浅色主题"
                    >
                        {isDarkMode ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
                    </button>
                </div>
            </header>

            {/* 信息栏 */}
            <div className="border-b border-border-sepia dark:border-border-bronze bg-surface-light dark:bg-surface-dark-lighter px-4 sm:px-6 py-2 sm:py-3 flex flex-wrap justify-between items-center gap-3 shrink-0 shadow-[0_2px_10px_-5px_rgba(0,0,0,0.1)] z-20">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className={`hidden lg:flex items-center justify-center transition-colors ${sidebarOpen ? 'text-primary' : 'text-text-brown/60 dark:text-white/50 hover:text-primary'}`}
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
                                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                        <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                        <span className="hidden sm:inline">识别完成</span>
                                    </span>
                                )}
                                {currentScan.status === OCRStatus.Processing && (
                                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-primary border border-primary/20">
                                        <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
                                        <span className="hidden sm:inline">识别中…</span>
                                    </span>
                                )}
                                {currentScan.status === OCRStatus.Error && (
                                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-red-600 dark:text-red-400 border border-red-500/20">
                                        <AlertCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                        <span className="hidden sm:inline">识别失败</span>
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
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleExport}
                            className="flex cursor-pointer items-center gap-2 justify-center rounded-md h-8 sm:h-9 px-3 sm:px-5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white text-xs sm:text-sm font-bold tracking-wide transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-95"
                            title="导出为 TXT 文本文件"
                        >
                            <span>导出 TXT</span>
                            <Share className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>

            {/* 历史加载失败提示 */}
            {historyError && (
                <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2 bg-red-500/10 border-b border-red-500/20 text-red-700 dark:text-red-400 text-sm shrink-0">
                    <span className="flex items-center gap-2 min-w-0">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span className="truncate">历史记录加载失败:{historyError}</span>
                    </span>
                    <button onClick={loadHistory} className="shrink-0 underline font-semibold hover:text-red-900 dark:hover:text-red-300">
                        重试
                    </button>
                </div>
            )}

            {/* 主内容区 */}
            <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
                <Sidebar
                    scans={scans}
                    selectedId={selectedId}
                    onSelect={handleScanSelect}
                    onDelete={handleDeleteScan}
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    isLoading={isLoadingHistory}
                />

                <div className="flex-1 flex flex-col lg:flex-row w-full overflow-hidden relative z-0">
                    {currentScan ? (
                        <>
                            <ImageViewer scan={currentScan} />
                            <TextPanel scan={currentScan} onUpdate={handleTextUpdate} />
                        </>
                    ) : (
                        <EmptyState isLoading={isLoadingHistory} />
                    )}
                </div>
            </main>

            {/* 拖拽上传遮罩 */}
            {isDragOver && (
                <div className="fixed inset-0 z-[100] bg-primary/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                    <div className="bg-bg-cream dark:bg-surface-dark border-2 border-dashed border-primary rounded-2xl px-12 py-10 text-center shadow-2xl">
                        <UploadCloud className="w-12 h-12 text-primary mx-auto mb-3" />
                        <p className="text-lg font-bold text-text-brown dark:text-text-cream">松开鼠标开始识别</p>
                        <p className="text-sm text-text-brown/60 dark:text-white/50 mt-1">支持图片与 PDF,可一次拖入多个文件</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
