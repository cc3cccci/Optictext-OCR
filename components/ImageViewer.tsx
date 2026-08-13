import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize, RotateCw, Eye, EyeOff, FileText, Loader2, ChevronLeft, ChevronRight } from './Icon';
import { DocumentScan, OCRSegment, OCRStatus } from '../types';
import { visibleSegments } from '../utils';

interface ImageViewerProps {
    scan: DocumentScan;
    currentPage: number;
    onPageChange: (page: number) => void;
    selectedSegmentId: string | null;
    onSegmentClick: (id: string) => void;
    ignoreHeader: number;
    ignoreFooter: number;
    onIgnoreChange: (header: number, footer: number) => void;
    ignoreEnabled: boolean;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 6;
const clampScale = (s: number) => Math.min(Math.max(s, MIN_SCALE), MAX_SCALE);

interface ViewState {
    scale: number;
    x: number;
    y: number;
}

const ImageViewer: React.FC<ImageViewerProps> = ({
    scan, currentPage, onPageChange, selectedSegmentId, onSegmentClick,
    ignoreHeader, ignoreFooter, onIgnoreChange, ignoreEnabled,
}) => {
    const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 });
    const [rotation, setRotation] = useState(0);
    const [showBoxes, setShowBoxes] = useState(true);
    const [isDragging, setIsDragging] = useState(false);
    const dragBand = useRef<'header' | 'footer' | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const touchRef = useRef<{
        mode: 'pan' | 'pinch' | null;
        lastX: number;
        lastY: number;
        lastDist: number;
        lastCx: number;
        lastCy: number;
    }>({ mode: null, lastX: 0, lastY: 0, lastDist: 0, lastCx: 0, lastCy: 0 });

    const pages = scan.pages && scan.pages.length ? scan.pages : null;
    const pageCount = Math.max(scan.pageCount || 1, pages?.length || 1);
    const page = pages?.[currentPage];
    const imageUrl = page?.imageUrl || scan.fullImageUrl;
    const imageWidth = page?.width || scan.imageWidth;
    const imageHeight = page?.height || scan.imageHeight;
    const pageSegments: OCRSegment[] = page?.segments
        || (scan.segments || []).filter(s => (s.page ?? 0) === currentPage);
    const boxes = visibleSegments(pageSegments, imageHeight, ignoreEnabled ? ignoreHeader : 0, ignoreEnabled ? ignoreFooter : 0);

    useEffect(() => {
        setView({ scale: 1, x: 0, y: 0 });
        setRotation(0);
    }, [scan.id, currentPage]);

    const handleZoomIn = () => setView(v => ({ ...v, scale: clampScale(v.scale * 1.25) }));
    const handleZoomOut = () => setView(v => ({ ...v, scale: clampScale(v.scale / 1.25) }));
    const handleReset = () => {
        setView({ scale: 1, x: 0, y: 0 });
        setRotation(0);
    };
    const handleRotate = () => setRotation(r => (r + 90) % 360);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const cx = e.clientX - rect.left - rect.width / 2;
            const cy = e.clientY - rect.top - rect.height / 2;
            setView(v => {
                const next = clampScale(v.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
                const k = next / v.scale;
                return { scale: next, x: cx + k * (v.x - cx), y: cy + k * (v.y - cy) };
            });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (dragBand.current) return;
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX - view.x, y: e.clientY - view.y };
    };
    const handleMouseMove = (e: React.MouseEvent) => {
        if (dragBand.current && containerRef.current) {
            const img = containerRef.current.querySelector('img');
            if (!img) return;
            const rect = img.getBoundingClientRect();
            const y = (e.clientY - rect.top) / rect.height;
            if (dragBand.current === 'header') {
                onIgnoreChange(Math.min(0.35, Math.max(0, y)), ignoreFooter);
            } else {
                onIgnoreChange(ignoreHeader, Math.min(0.35, Math.max(0, 1 - y)));
            }
            return;
        }
        if (!isDragging) return;
        e.preventDefault();
        setView(v => ({ ...v, x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y }));
    };
    const handleMouseUp = () => {
        setIsDragging(false);
        dragBand.current = null;
    };

    const getCenterAndDist = (touches: React.TouchList) => {
        const rect = containerRef.current!.getBoundingClientRect();
        const t0 = touches[0];
        const t1 = touches[1];
        const cx = (t0.clientX + t1.clientX) / 2 - rect.left - rect.width / 2;
        const cy = (t0.clientY + t1.clientY) / 2 - rect.top - rect.height / 2;
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        return { cx, cy, dist };
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        const t = touchRef.current;
        if (e.touches.length === 1) {
            t.mode = 'pan';
            t.lastX = e.touches[0].clientX;
            t.lastY = e.touches[0].clientY;
        } else if (e.touches.length >= 2) {
            const { cx, cy, dist } = getCenterAndDist(e.touches);
            t.mode = 'pinch';
            t.lastDist = dist;
            t.lastCx = cx;
            t.lastCy = cy;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        const t = touchRef.current;
        if (t.mode === 'pan' && e.touches.length === 1) {
            const dx = e.touches[0].clientX - t.lastX;
            const dy = e.touches[0].clientY - t.lastY;
            t.lastX = e.touches[0].clientX;
            t.lastY = e.touches[0].clientY;
            setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
        } else if (t.mode === 'pinch' && e.touches.length >= 2) {
            const { cx, cy, dist } = getCenterAndDist(e.touches);
            const lastDist = t.lastDist || dist;
            const lastCx = t.lastCx;
            const lastCy = t.lastCy;
            t.lastDist = dist;
            t.lastCx = cx;
            t.lastCy = cy;
            setView(v => {
                const next = clampScale(v.scale * (dist / lastDist));
                const k = next / v.scale;
                return { scale: next, x: cx + k * (v.x - lastCx), y: cy + k * (v.y - lastCy) };
            });
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        const t = touchRef.current;
        if (e.touches.length === 0) t.mode = null;
        else if (e.touches.length === 1) {
            t.mode = 'pan';
            t.lastX = e.touches[0].clientX;
            t.lastY = e.touches[0].clientY;
        }
    };

    const isProcessing = scan.status === OCRStatus.Processing;
    const hasImage = Boolean(imageUrl);
    const hasBoxes = scan.status === OCRStatus.Ready && boxes.length > 0 && imageWidth > 0 && imageHeight > 0;

    return (
        <section className="relative w-full h-full flex flex-col border-b lg:border-b-0 bg-[#0b1220] overflow-hidden group">
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-black/70 backdrop-blur-md border border-white/10 rounded-full px-2 py-1.5 shadow-xl shadow-black/40 transition-opacity duration-300 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                {pageCount > 1 && (
                    <>
                        <button
                            onClick={() => onPageChange(Math.max(0, currentPage - 1))}
                            disabled={currentPage <= 0}
                            className="p-2 text-white/70 hover:text-primary hover:bg-white/10 rounded-full disabled:opacity-30"
                            title="上一页"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-mono text-white/90 px-1 select-none">{currentPage + 1}/{pageCount}</span>
                        <button
                            onClick={() => onPageChange(Math.min(pageCount - 1, currentPage + 1))}
                            disabled={currentPage >= pageCount - 1}
                            className="p-2 text-white/70 hover:text-primary hover:bg-white/10 rounded-full disabled:opacity-30"
                            title="下一页"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <div className="w-px h-4 bg-white/20 mx-1"></div>
                    </>
                )}
                <button onClick={handleZoomOut} className="p-2 text-white/70 hover:text-primary hover:bg-white/10 rounded-full" title="缩小">
                    <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono font-medium text-white/90 px-2 min-w-[3rem] text-center select-none">
                    {Math.round(view.scale * 100)}%
                </span>
                <button onClick={handleZoomIn} className="p-2 text-white/70 hover:text-primary hover:bg-white/10 rounded-full" title="放大">
                    <ZoomIn className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-white/20 mx-1"></div>
                <button onClick={handleReset} className="p-2 text-white/70 hover:text-primary hover:bg-white/10 rounded-full" title="重置视图">
                    <Maximize className="w-4 h-4" />
                </button>
                <button onClick={handleRotate} className="p-2 text-white/70 hover:text-primary hover:bg-white/10 rounded-full" title="旋转 90°">
                    <RotateCw className="w-4 h-4" />
                </button>
                {hasBoxes && (
                    <button
                        onClick={() => setShowBoxes(s => !s)}
                        className={`p-2 rounded-full hover:bg-white/10 ${showBoxes ? 'text-primary' : 'text-white/70'}`}
                        title={showBoxes ? '隐藏识别区域' : '显示识别区域'}
                    >
                        {showBoxes ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                )}
            </div>

            <div
                ref={containerRef}
                className="flex-1 overflow-hidden flex items-center justify-center p-8 viewer-canvas-bg touch-none select-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onDoubleClick={handleReset}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
                <div
                    className="relative shadow-2xl shadow-black transition-transform duration-75 ease-linear origin-center"
                    style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale}) rotate(${rotation}deg)` }}
                >
                    {hasImage ? (
                        <img
                            src={imageUrl}
                            alt={scan.title}
                            className="max-w-none w-auto h-auto max-h-[80vh] rounded-sm"
                            draggable={false}
                        />
                    ) : (
                        <div className="w-64 h-80 flex flex-col items-center justify-center gap-3 bg-white/5 border border-white/10 rounded-md text-white/40">
                            {isProcessing ? <Loader2 className="w-10 h-10 animate-spin text-primary/70" /> : <FileText className="w-10 h-10" />}
                            <span className="text-xs tracking-wide">{isProcessing ? '正在处理文件…' : '暂无预览'}</span>
                        </div>
                    )}

                    {isProcessing && hasImage && (
                        <div className="absolute inset-x-0 bg-gradient-to-b from-primary/40 to-transparent h-1 w-full animate-scan-line pointer-events-none"></div>
                    )}

                    {ignoreEnabled && hasImage && (
                        <>
                            <div
                                className="absolute left-0 right-0 top-0 bg-red-500/25 border-b border-red-400/80 cursor-ns-resize z-[5]"
                                style={{ height: `${ignoreHeader * 100}%` }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    dragBand.current = 'header';
                                }}
                                title="拖动调整忽略页眉"
                            />
                            <div
                                className="absolute left-0 right-0 bottom-0 bg-red-500/25 border-t border-red-400/80 cursor-ns-resize z-[5]"
                                style={{ height: `${ignoreFooter * 100}%` }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    dragBand.current = 'footer';
                                }}
                                title="拖动调整忽略页脚"
                            />
                        </>
                    )}

                    {hasBoxes && showBoxes && (
                        <div className="absolute inset-0">
                            {boxes.map((seg) => {
                                if (!seg.box) return null;
                                const [x0, y0, x1, y1] = seg.box;
                                const low = seg.confidence > 0 && seg.confidence < 0.7;
                                const active = seg.id === selectedSegmentId;
                                return (
                                    <button
                                        key={seg.id}
                                        type="button"
                                        className={`absolute border rounded-[1px] transition-colors ${
                                            active
                                                ? 'border-primary bg-primary/40 z-[4]'
                                                : low
                                                    ? 'border-amber-400/80 bg-amber-400/15 hover:bg-amber-400/30'
                                                    : 'border-primary/60 bg-primary/10 hover:bg-primary/25 hover:border-primary'
                                        }`}
                                        style={{
                                            left: `${(x0 / imageWidth) * 100}%`,
                                            top: `${(y0 / imageHeight) * 100}%`,
                                            width: `${((x1 - x0) / imageWidth) * 100}%`,
                                            height: `${((y1 - y0) / imageHeight) * 100}%`,
                                        }}
                                        title={seg.text}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSegmentClick(seg.id);
                                        }}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="absolute bottom-4 left-4 text-[10px] text-white/30 font-mono tracking-widest pointer-events-none">
                {pageCount > 1 ? `预览第 ${currentPage + 1} 页 · 共 ${pageCount} 页` : '原图预览'}
                {hasBoxes && showBoxes ? ` · ${boxes.length} 个识别区域` : ''}
            </div>
        </section>
    );
};

export default ImageViewer;
