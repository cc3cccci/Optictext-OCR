import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Type, WrapText, Save, FileText, Copy, Trash2, CheckCircle2, AlertCircle, Loader2 } from './Icon';
import { DocumentScan, OCRStatus } from '../types';
import { autoFormatText } from '../utils';
import { jsPDF } from 'jspdf';

interface TextPanelProps {
    scan: DocumentScan;
    onUpdate: (id: string, text: string) => Promise<void>;
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const AUTOSAVE_DELAY_MS = 1200;

// 中文字体缓存(base64),仅在首次导出 PDF 时加载一次
let cachedFontBase64: string | null = null;

async function loadCJKFontBase64(): Promise<string | null> {
    if (cachedFontBase64) return cachedFontBase64;
    try {
        const res = await fetch('/fonts/NotoSansSC-Regular-subset.ttf');
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
        }
        cachedFontBase64 = btoa(binary);
        return cachedFontBase64;
    } catch {
        return null;
    }
}

const TextPanel: React.FC<TextPanelProps> = ({ scan, onUpdate }) => {
    const [text, setText] = useState(scan.extractedText);
    const [saveState, setSaveState] = useState<SaveState>('idle');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const pendingRef = useRef<{ id: string; text: string } | null>(null);
    const timerRef = useRef<number | null>(null);
    const onUpdateRef = useRef(onUpdate);
    useEffect(() => {
        onUpdateRef.current = onUpdate;
    });

    const isEditable = scan.status === OCRStatus.Ready;

    // ---------- 自动保存 ----------

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

    // 切换文档 / 状态变化(识别完成、失败)时同步文本;离开前保存未落盘的编辑
    useEffect(() => {
        setText(scan.extractedText);
        setSaveState('idle');
        return () => {
            flushPending();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scan.id, scan.status]);

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

    // ---------- 工具操作 ----------

    const handleAutoFormat = () => {
        applyText(autoFormatText(text));
    };

    const handleClear = () => {
        if (!text) return;
        if (confirm('确定清空当前识别文本吗?(原图不受影响)')) {
            applyText('');
        }
    };

    const handleSelectAll = () => {
        textareaRef.current?.select();
        textareaRef.current?.focus();
    };

    // ---------- 复制(含 HTTP 非安全上下文降级方案) ----------

    const showCopySuccess = () => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const fallbackCopyTextToClipboard = (value: string) => {
        const textArea = document.createElement('textarea');
        textArea.value = value;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            if (document.execCommand('copy')) {
                showCopySuccess();
            } else {
                alert('复制失败,请手动全选文本后按 Ctrl+C 复制。');
            }
        } catch {
            alert('复制失败,请手动全选文本后按 Ctrl+C 复制。');
        }
        document.body.removeChild(textArea);
    };

    const handleCopy = () => {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(showCopySuccess).catch(() => {
                fallbackCopyTextToClipboard(text);
            });
        } else {
            fallbackCopyTextToClipboard(text);
        }
    };

    // ---------- PDF 导出(嵌入中文字体) ----------

    const handleGeneratePdf = async () => {
        setIsGeneratingPdf(true);
        try {
            const fontB64 = await loadCJKFontBase64();
            if (!fontB64) {
                const proceed = confirm(
                    '中文字体资源加载失败,PDF 中的中文会显示为乱码。\n建议改用「导出 TXT」。仍要继续生成 PDF 吗?'
                );
                if (!proceed) return;
            }

            const doc = new jsPDF();
            let fontName = 'courier';
            if (fontB64) {
                doc.addFileToVFS('NotoSansSC-subset.ttf', fontB64);
                doc.addFont('NotoSansSC-subset.ttf', 'NotoSansSC', 'normal');
                fontName = 'NotoSansSC';
            }

            doc.setFont(fontName, 'normal');
            doc.setFontSize(12);
            doc.text(`文档:${scan.title}`, 10, 14);
            doc.setFontSize(9);
            doc.setTextColor(120);
            doc.text(`导出时间:${new Date().toLocaleString('zh-CN')}`, 10, 20);
            doc.setDrawColor(180);
            doc.line(10, 24, 200, 24);
            doc.setTextColor(0);
            doc.setFontSize(11);

            const splitText: string[] = doc.splitTextToSize(text || '(无文本)', 185);
            let y = 32;
            for (const line of splitText) {
                if (y > 285) {
                    doc.addPage();
                    y = 16;
                }
                doc.text(line, 10, y);
                y += 6.2;
            }

            const filename = scan.title.replace(/\.[^.]+$/, '') || '识别结果';
            doc.save(`${filename}.pdf`);
        } catch (e) {
            console.error('PDF 生成失败', e);
            alert('PDF 生成失败,请改用「导出 TXT」。');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    // ---------- 保存状态提示 ----------

    const saveIndicator = (() => {
        if (!isEditable) return null;
        switch (saveState) {
            case 'dirty':
                return <span className="text-xs text-text-brown/50 dark:text-white/40">编辑中…</span>;
            case 'saving':
                return (
                    <span className="flex items-center gap-1 text-xs text-text-brown/50 dark:text-white/40">
                        <Loader2 className="w-3 h-3 animate-spin" /> 保存中…
                    </span>
                );
            case 'saved':
                return (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" /> 已自动保存
                    </span>
                );
            case 'error':
                return (
                    <button onClick={flushPendingWithRetry} className="flex items-center gap-1 text-xs text-red-500 hover:underline">
                        <AlertCircle className="w-3 h-3" /> 保存失败,点击重试
                    </button>
                );
            default:
                return null;
        }
    })();

    function flushPendingWithRetry() {
        pendingRef.current = { id: scan.id, text };
        flushPending();
    }

    return (
        <section className="flex-1 flex flex-col bg-bg-cream dark:bg-surface-dark relative z-0 min-h-0">
            {/* 工具栏 */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border-sepia dark:border-border-bronze shrink-0 bg-surface-light dark:bg-surface-dark-lighter/30">
                <div className="flex items-center gap-2.5">
                    <Type className="text-primary w-5 h-5" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-text-brown/60 dark:text-primary/70">
                        识别文本
                    </h3>
                </div>
                <div className="flex gap-1 items-center">
                    {saveIndicator}
                    <div className="w-px h-4 bg-border-sepia dark:bg-border-bronze mx-1"></div>
                    <button
                        onClick={handleAutoFormat}
                        disabled={!isEditable}
                        className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10 text-text-brown/60 hover:text-primary dark:text-white/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="自动排版:合并断行、整理空格(支持中文标点)"
                    >
                        <WrapText className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleSelectAll}
                        className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10 text-text-brown/60 hover:text-primary dark:text-white/50 transition-colors"
                        title="全选文本"
                    >
                        <span className="text-xs font-bold px-1">全选</span>
                    </button>
                </div>
            </div>

            {/* 编辑区 */}
            <div className="flex-1 relative bg-bg-cream dark:bg-bg-dark min-h-0">
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
            </div>

            {/* 底部操作栏 */}
            <div className="border-t border-border-sepia dark:border-border-bronze bg-surface-light dark:bg-surface-dark-lighter px-4 sm:px-6 py-3 flex justify-between items-center shrink-0 flex-wrap gap-2">
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={flushPendingWithRetry}
                        disabled={!isEditable}
                        className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-border-sepia/30 dark:hover:bg-white/10 text-xs font-semibold text-text-brown dark:text-text-cream transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="立即保存(编辑内容也会自动保存)"
                    >
                        {saveState === 'saving'
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Save className="w-4 h-4" />}
                        <span>保存</span>
                    </button>

                    <button
                        onClick={handleGeneratePdf}
                        disabled={isGeneratingPdf}
                        className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-border-sepia/30 dark:hover:bg-white/10 text-xs font-semibold text-text-brown dark:text-text-cream transition-colors disabled:opacity-50"
                        title="导出为 PDF(支持中文)"
                    >
                        {isGeneratingPdf
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <FileText className="w-4 h-4" />}
                        <span>导出 PDF</span>
                    </button>

                    <button
                        onClick={handleCopy}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors ${isCopied
                            ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400'
                            : 'bg-primary/10 hover:bg-primary/20 border-primary/20 text-primary dark:text-primary'
                            } text-xs font-semibold`}
                        title="复制全部文本到剪贴板"
                    >
                        {isCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        <span>{isCopied ? '已复制!' : '复制文本'}</span>
                    </button>
                </div>

                <button
                    onClick={handleClear}
                    disabled={!isEditable || !text}
                    className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-red-500/10 text-xs font-semibold text-text-brown/60 hover:text-red-600 dark:text-white/50 dark:hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="清空识别文本"
                >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">清空</span>
                </button>
            </div>
        </section>
    );
};

export default TextPanel;
