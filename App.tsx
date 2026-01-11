import React, { useState, useEffect } from 'react';
import {
    Scan,
    Settings,
    User,
    Sun,
    Moon,
    History,
    Menu,
    CheckCircle2,
    Share,
    UploadCloud,
    ClipboardPaste
} from './components/Icon';
import Sidebar from './components/Sidebar';
import ImageViewer from './components/ImageViewer';
import TextPanel from './components/TextPanel';
import { MOCK_SCANS } from './constants';
import { DocumentScan, OCRStatus } from './types';

const App: React.FC = () => {
    // State
    const [isDarkMode, setIsDarkMode] = useState(false);
    // Initialize based on viewport
    const [sidebarOpen, setSidebarOpen] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);

    // Initialize scans from localStorage or fallback to MOCK_SCANS
    const [scans, setScans] = useState<DocumentScan[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('optictext_scans');
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch (e) {
                    console.error("Failed to parse history", e);
                }
            }
        }
        return MOCK_SCANS;
    });

    const [selectedId, setSelectedId] = useState<string>(scans[0]?.id || MOCK_SCANS[0].id);

    // Persist scans to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('optictext_scans', JSON.stringify(scans));
    }, [scans]);

    // Derived state
    const currentScan = scans.find(s => s.id === selectedId) || scans[0];

    // Effect for Dark Mode
    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDarkMode]);

    const handleScanSelect = (id: string) => {
        setSelectedId(id);
        // On mobile, close sidebar after selection
        if (window.innerWidth < 1024) {
            setSidebarOpen(false);
        }
    };

    const handleTextUpdate = (id: string, newText: string) => {
        setScans(prev => prev.map(s => s.id === id ? { ...s, extractedText: newText } : s));
    };

    const processFile = async (file: File) => {
        // Create initial scan entry
        const newScan: DocumentScan = {
            id: Date.now().toString(),
            title: file.name,
            date: new Date().toISOString(),
            thumbnailUrl: URL.createObjectURL(file),
            fullImageUrl: URL.createObjectURL(file),
            extractedText: "Processing document...\nInitiating connection to OCR engine...",
            status: OCRStatus.Processing,
            fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
            confidence: 0,
            wordCount: 0
        };

        setScans(prevScans => [newScan, ...prevScans]);
        setSelectedId(newScan.id);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/ocr', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                throw new Error(errorData.detail || `Server Error: ${response.status}`);
            }

            const data = await response.json();

            setScans(prev => prev.map(s => {
                if (s.id === newScan.id) {
                    return {
                        ...s,
                        status: OCRStatus.Ready,
                        extractedText: data.text || "No text detected.",
                        confidence: Math.round(data.confidence * 100),
                        wordCount: data.text ? data.text.split(/\s+/).length : 0
                    };
                }
                return s;
            }));

        } catch (error: any) {
            console.error("OCR Error:", error);
            setScans(prev => prev.map(s => {
                if (s.id === newScan.id) {
                    return {
                        ...s,
                        status: OCRStatus.Error,
                        extractedText: `Error processing document:\n${error.message || "Unknown error occurred."}\n\nPlease try again or check if the backend service is running.`,
                        confidence: 0,
                        wordCount: 0
                    };
                }
                return s;
            }));
        }
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        processFile(file);
    };

    // Global Paste Listener for HTTP support (Ctrl+V works where API doesn't)
    useEffect(() => {
        const handleGlobalPaste = (event: ClipboardEvent) => {
            const items = event.clipboardData?.items;
            if (!items) return;

            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    if (blob) {
                        const file = new File([blob], `Pasted_Image_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`, { type: item.type });
                        processFile(file);
                        // Prevent default paste behavior (like pasting image into a text field if focused)
                        // event.preventDefault(); 
                        return;
                    }
                }
            }
        };

        window.addEventListener('paste', handleGlobalPaste);
        return () => {
            window.removeEventListener('paste', handleGlobalPaste);
        };
    }, []);

    const handlePaste = async () => {
        try {
            if (!navigator.clipboard || !navigator.clipboard.read) {
                throw new Error("Clipboard API unavailable");
            }
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                // Find items that are images
                const imageType = item.types.find(type => type.startsWith('image/'));
                if (imageType) {
                    const blob = await item.getType(imageType);
                    const file = new File([blob], `Pasted_Image_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`, { type: imageType });
                    processFile(file);
                    return; // Only process the first image found
                }
            }
            alert("No image found in clipboard.");
        } catch (err) {
            console.error('Failed to read clipboard:', err);
            // Fallback instruction
            alert("Browser block: Please press Ctrl+V (or Cmd+V) to paste the image directly.");
        }
    };

    const handleExport = () => {
        if (!currentScan) return;

        const element = document.createElement("a");
        const file = new Blob([currentScan.extractedText], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        // Clean title for filename
        const filename = currentScan.title.split('.')[0] || 'scan_result';
        element.download = `${filename}_extracted.txt`;
        document.body.appendChild(element); // Required for this to work in FireFox
        element.click();
        document.body.removeChild(element);
    };

    const handleDeleteScan = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (scans.length <= 1) {
            alert("Cannot delete the last item.");
            return;
        }
        if (confirm("Are you sure you want to delete this history item?")) {
            const newScans = scans.filter(s => s.id !== id);
            setScans(newScans);
            if (selectedId === id) {
                setSelectedId(newScans[0].id);
            }
        }
    };

    return (
        <div className="flex flex-col h-screen w-full bg-bg-cream dark:bg-bg-dark font-sans transition-colors duration-300">
            {/* ... Header ... */}
            <header className="flex items-center justify-between whitespace-nowrap border-b border-border-sepia dark:border-border-bronze px-4 sm:px-6 py-3 bg-bg-cream dark:bg-surface-dark z-30 shrink-0 w-full relative shadow-sm">
                {/* ... Header Content ... */}
                <div className="flex items-center gap-3 sm:gap-4">
                    <button
                        className="lg:hidden p-2 -ml-2 text-text-brown dark:text-text-cream hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors"
                        onClick={() => setSidebarOpen(true)}
                        aria-label="Open Menu"
                    >
                        <Menu className="w-5 h-5" />
                    </button>

                    <div className="flex items-center justify-center p-1.5 sm:p-2 bg-gradient-to-br from-primary to-primary-dark rounded-md text-white shadow-lg shadow-primary/20">
                        <Scan className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div>
                        <h2 className="text-base sm:text-lg font-bold font-serif italic tracking-wide text-text-brown dark:text-primary">
                            OpticText <span className="hidden sm:inline font-sans font-normal text-text-brown/50 dark:text-white/40 not-italic text-sm ml-1">Archive</span>
                        </h2>
                    </div>
                </div>

                <div className="flex gap-2 sm:gap-3">
                    <button
                        onClick={handlePaste}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-md bg-surface-light dark:bg-white/5 border border-border-sepia dark:border-border-bronze hover:border-primary text-text-brown dark:text-text-cream transition-all group"
                        title="Paste image from clipboard"
                    >
                        <ClipboardPaste className="w-4 h-4 group-hover:text-primary" />
                        <span className="hidden sm:inline text-sm font-medium">Paste</span>
                    </button>

                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-md bg-surface-light dark:bg-white/5 border border-border-sepia dark:border-border-bronze hover:border-primary text-text-brown dark:text-text-cream transition-all group"
                        title="Upload file"
                    >
                        <UploadCloud className="w-4 h-4 group-hover:text-primary" />
                        <span className="hidden sm:inline text-sm font-medium">New Scan</span>
                        <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleFileUpload} />
                    </label>

                    <div className="hidden sm:block w-px h-8 bg-border-sepia dark:bg-border-bronze mx-1 self-center"></div>

                    <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className="hidden sm:flex items-center justify-center rounded-lg w-10 h-10 hover:bg-surface-light dark:hover:bg-white/10 text-primary transition-colors"
                        title="Toggle theme"
                    >
                        {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </button>
                    <button className="sm:hidden flex items-center justify-center rounded-lg w-9 h-9 hover:bg-surface-light dark:hover:bg-white/10 text-primary transition-colors" onClick={() => setIsDarkMode(!isDarkMode)}>
                        {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </button>
                </div>
            </header>

            {/* Sub-Header / Breadcrumbs & Actions */}
            <div className="border-b border-border-sepia dark:border-border-bronze bg-surface-light dark:bg-surface-dark-lighter px-4 sm:px-6 py-2 sm:py-3 flex flex-wrap justify-between items-center gap-3 shrink-0 shadow-[0_2px_10px_-5px_rgba(0,0,0,0.1)] z-20">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className={`hidden lg:flex items-center justify-center transition-colors ${sidebarOpen ? 'text-primary' : 'text-text-brown/60 hover:text-primary'}`}
                        title={sidebarOpen ? "Close History" : "Open History"}
                    >
                        <History className="w-5 h-5" />
                    </button>

                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3">
                            <h1 className="text-base sm:text-lg font-bold leading-tight tracking-tight text-text-brown dark:text-text-cream truncate max-w-[150px] sm:max-w-md">
                                {currentScan.title}
                            </h1>
                            {currentScan.status === OCRStatus.Ready && (
                                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                    <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                    <span className="hidden sm:inline">Complete</span>
                                </span>
                            )}
                            {currentScan.status === OCRStatus.Processing && (
                                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-primary border border-primary/20">
                                    <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-primary animate-pulse"></span>
                                    <span className="hidden sm:inline">Processing...</span>
                                </span>
                            )}
                        </div>
                        <p className="text-text-brown/50 dark:text-white/40 text-[10px] sm:text-xs font-medium font-mono mt-0.5 truncate">
                            {currentScan.fileSize} • {currentScan.wordCount} words
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExport}
                        className="flex cursor-pointer items-center gap-2 justify-center rounded-md h-8 sm:h-9 px-3 sm:px-5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white text-xs sm:text-sm font-bold tracking-wide transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-95"
                    >
                        <span>Export</span>
                        <Share className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
                <Sidebar
                    scans={scans}
                    selectedId={selectedId}
                    onSelect={handleScanSelect}
                    onDelete={handleDeleteScan}
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                />

                {/* Workspace Split */}
                <div className="flex-1 flex flex-col lg:flex-row w-full overflow-hidden relative z-0">
                    <ImageViewer scan={currentScan} />
                    <TextPanel scan={currentScan} onUpdate={handleTextUpdate} />
                </div>
            </main>
        </div>
    );
};

export default App;