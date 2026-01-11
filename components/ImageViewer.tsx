import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize, RotateCw } from './Icon';
import { DocumentScan } from '../types';

interface ImageViewerProps {
    scan: DocumentScan;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ scan }) => {
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    
    const containerRef = useRef<HTMLDivElement>(null);

    // Reset view when scan changes
    useEffect(() => {
        setScale(1);
        setRotation(0);
        setPosition({ x: 0, y: 0 });
    }, [scan.id]);

    const handleZoomIn = () => setScale(s => Math.min(s + 0.25, 3));
    const handleZoomOut = () => setScale(s => Math.max(s - 0.25, 0.5));
    const handleReset = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
        setRotation(0);
    };
    const handleRotate = () => setRotation(r => (r + 90) % 360);

    // Basic Pan Logic
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        e.preventDefault();
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => setIsDragging(false);

    return (
        <section className="relative w-full lg:w-[45%] h-[50vh] lg:h-full flex flex-col border-b lg:border-b-0 lg:border-r border-border-sepia dark:border-border-bronze bg-bg-dark/95 dark:bg-black/40 overflow-hidden group">
            
            {/* Floating Toolbar */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-surface-dark/90 backdrop-blur-md border border-white/10 rounded-full px-2 py-1.5 shadow-xl shadow-black/40 transition-opacity duration-300 opacity-0 group-hover:opacity-100">
                <button onClick={handleZoomOut} className="p-2 text-white/70 hover:text-primary hover:bg-white/10 rounded-full transition-colors" title="Zoom Out">
                    <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono font-medium text-white/90 px-2 min-w-[3rem] text-center select-none">
                    {Math.round(scale * 100)}%
                </span>
                <button onClick={handleZoomIn} className="p-2 text-white/70 hover:text-primary hover:bg-white/10 rounded-full transition-colors" title="Zoom In">
                    <ZoomIn className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-white/20 mx-1"></div>
                <button onClick={handleReset} className="p-2 text-white/70 hover:text-primary hover:bg-white/10 rounded-full transition-colors" title="Fit to Screen">
                    <Maximize className="w-4 h-4" />
                </button>
                <button onClick={handleRotate} className="p-2 text-white/70 hover:text-primary hover:bg-white/10 rounded-full transition-colors" title="Rotate">
                    <RotateCw className="w-4 h-4" />
                </button>
            </div>

            {/* Image Canvas */}
            <div 
                ref={containerRef}
                className="flex-1 overflow-hidden flex items-center justify-center p-8 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
                <div 
                    className="relative shadow-2xl shadow-black transition-transform duration-100 ease-linear origin-center"
                    style={{ 
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)` 
                    }}
                >
                    <img 
                        src={scan.fullImageUrl} 
                        alt={scan.title}
                        className="max-w-none w-auto h-auto max-h-[80vh] rounded-sm sepia-[.15] contrast-[1.05]" 
                        draggable={false}
                    />
                    
                    {/* Decorative Scan Overlay Effect */}
                    <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent h-1 w-full animate-scan-line pointer-events-none opacity-50 mix-blend-overlay"></div>
                    
                    {/* Simulated Highlighting Box */}
                    <div className="absolute top-[20%] left-[10%] w-[30%] h-[5%] border border-primary bg-primary/10 pointer-events-none opacity-60"></div>
                </div>
            </div>

            <div className="absolute bottom-4 left-4 text-[10px] text-white/30 font-mono tracking-widest uppercase pointer-events-none">
                Source Preview • Page 1 of 1
            </div>
        </section>
    );
};

export default ImageViewer;
