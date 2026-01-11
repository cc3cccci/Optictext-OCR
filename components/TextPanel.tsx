import React, { useState, useEffect } from 'react';
import { Type, WrapText, SpellCheck, Save, FileText, Copy, Trash2, CheckCircle2 } from './Icon';
import { DocumentScan } from '../types';
import { jsPDF } from "jspdf";

interface TextPanelProps {
    scan: DocumentScan;
    onUpdate: (id: string, text: string) => void;
}

const TextPanel: React.FC<TextPanelProps> = ({ scan, onUpdate }) => {
    const [text, setText] = useState(scan.extractedText);
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    useEffect(() => {
        setText(scan.extractedText);
    }, [scan.extractedText, scan.id]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value);
    };

    const handleSave = () => {
        setIsSaving(true);
        // Simulate save delay
        setTimeout(() => {
            onUpdate(scan.id, text);
            setIsSaving(false);
        }, 800);
    };

    const showCopySuccess = () => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    // Fallback for non-secure contexts (HTTP)
    const fallbackCopyTextToClipboard = (text: string) => {
        const textArea = document.createElement("textarea");
        textArea.value = text;

        // Ensure it's not visible but part of DOM
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);

        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                showCopySuccess();
            } else {
                console.error('Fallback: Copying text command was unsuccessful');
                alert("Failed to copy text. Please select manually and copy.");
            }
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
            alert("Failed to copy text.");
        }

        document.body.removeChild(textArea);
    };

    const handleCopy = () => {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                showCopySuccess();
            }).catch(err => {
                console.warn("Clipboard API failed, trying fallback...", err);
                fallbackCopyTextToClipboard(text);
            });
        } else {
            fallbackCopyTextToClipboard(text);
        }
    };



    // New Features
    const handleAutoFormat = () => {
        // Simple heuristic: Join lines that don't end in punctuation (likely wrapped), 
        // collapse multiple spaces, fix common OCR punctuation glitches.
        let formatted = text
            .replace(/([^\.\!\?])\n/g, "$1 ") // Join lines not ending in sentence terminators
            .replace(/\s+/g, ' ') // Collapse spaces
            .replace(/ \./g, '.') // Fix space before dot
            .replace(/ ,/g, ',') // Fix space before comma
            .trim();

        setText(formatted);
        // Trigger save after format
        onUpdate(scan.id, formatted);
    };

    const handleSelectAll = () => {
        const textarea = document.querySelector('textarea');
        if (textarea) {
            textarea.select();
            textarea.focus();
        }
    };

    const handleGeneratePdf = () => {
        setIsGeneratingPdf(true);
        try {
            const doc = new jsPDF();

            // Set font properties
            doc.setFont("courier");
            doc.setFontSize(10);

            // Header
            doc.text(`Document: ${scan.title}`, 10, 10);
            doc.text(`Date: ${new Date().toLocaleDateString()}`, 10, 16);
            doc.line(10, 20, 200, 20);

            // Body - split text to fit page width
            const splitText = doc.splitTextToSize(text, 180);
            let y = 30;

            // Basic pagination loop
            for (let i = 0; i < splitText.length; i++) {
                if (y > 280) { // Page break check
                    doc.addPage();
                    y = 20;
                }
                doc.text(splitText[i], 10, y);
                y += 5; // Line height
            }

            // Clean filename
            const filename = scan.title.split('.')[0] || 'document';
            doc.save(`${filename}.pdf`);
        } catch (e) {
            console.error("PDF Generation failed", e);
            alert("Failed to generate PDF");
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    return (
        <section className="flex-1 flex flex-col bg-bg-cream dark:bg-surface-dark relative z-0">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border-sepia dark:border-border-bronze shrink-0 bg-surface-light dark:bg-surface-dark-lighter/30">
                <div className="flex items-center gap-2.5">
                    <Type className="text-primary w-5 h-5" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-text-brown/60 dark:text-primary/70">
                        Recognized Text
                    </h3>
                </div>
                <div className="flex gap-1">
                    <button
                        onClick={handleAutoFormat}
                        className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10 text-text-brown/60 hover:text-primary dark:text-white/50 transition-colors"
                        title="Auto Format Text (Fix newlines)">
                        <WrapText className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleSelectAll}
                        className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10 text-text-brown/60 hover:text-primary dark:text-white/50 transition-colors"
                        title="Select All Text">
                        {/* Reusing Type icon or FileText as Select All metaphor roughly, or just text */}
                        <span className="text-xs font-bold px-1">ALL</span>
                    </button>
                    <button className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10 text-text-brown/60 hover:text-primary dark:text-white/50 transition-colors" title="Check Spelling">
                        <SpellCheck className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 relative group bg-bg-cream dark:bg-bg-dark">
                {/* Lined Paper Background Effect via CSS gradients */}
                <textarea
                    value={text}
                    onChange={handleChange}
                    spellCheck={false}
                    className="w-full h-full p-8 bg-transparent border-0 resize-none focus:ring-0 text-text-brown dark:text-text-cream 
                    font-mono text-sm leading-8 custom-scrollbar selection:bg-primary/30 outline-none placeholder-text-brown/30"
                    style={{
                        backgroundImage: 'linear-gradient(transparent 95%, rgba(197, 160, 89, 0.15) 95%)',
                        backgroundSize: '100% 2rem',
                        lineHeight: '2rem'
                    }}
                />
            </div>

            {/* Action Footer */}
            <div className="border-t border-border-sepia dark:border-border-bronze bg-surface-light dark:bg-surface-dark-lighter px-6 py-3 flex justify-between items-center shrink-0">
                <div className="flex gap-2">
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-border-sepia/30 dark:hover:bg-white/10 text-xs font-semibold text-text-brown dark:text-text-cream transition-colors"
                    >
                        {isSaving ? <span className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full"></span> : <Save className="w-4 h-4" />}
                        <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                    </button>

                    <button
                        onClick={handleGeneratePdf}
                        className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-border-sepia/30 dark:hover:bg-white/10 text-xs font-semibold text-text-brown dark:text-text-cream transition-colors"
                    >
                        {isGeneratingPdf ? (
                            <span className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full"></span>
                        ) : (
                            <FileText className="w-4 h-4" />
                        )}
                        <span>PDF</span>
                    </button>

                    <button
                        onClick={handleCopy}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors ${isCopied
                            ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400'
                            : 'bg-primary/10 hover:bg-primary/20 border-primary/20 text-primary dark:text-primary'
                            } text-xs font-semibold`}
                    >
                        {isCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        <span>{isCopied ? 'Copied!' : 'Copy Text'}</span>
                    </button>
                </div>

                <button className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-red-500/10 text-xs font-semibold text-text-brown/60 hover:text-red-600 dark:text-white/50 dark:hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Clear</span>
                </button>
            </div>
        </section>
    );
};

export default TextPanel;