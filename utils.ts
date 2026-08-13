import { COMPRESS_MAX_SIDE, COMPRESS_TRIGGER_BYTES, DEFAULT_IGNORE, LOW_CONFIDENCE } from './constants';
import { DocumentScan, LayoutMode, OCRSegment, OCRStatus, ScanPage } from './types';

/** 中英混合字数统计:汉字按字计,拉丁文按词计 */
export function countWords(text: string): number {
    if (!text) return 0;
    const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;
    const cjkCount = (text.match(cjkRegex) || []).length;
    const latinWords = text
        .replace(cjkRegex, ' ')
        .match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g);
    return cjkCount + (latinWords ? latinWords.length : 0);
}

export function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatDate(iso: string): string {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    if (now.toDateString() === date.toDateString()) {
        return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' });
}

/**
 * OCR 文本自动排版(中英文适配):
 * - 合并被识别拆散的行(行尾不是句读符号时与下一行合并)
 * - 中文之间合并不加空格,英文之间加空格
 * - 保留空行作为段落分隔
 */
export function autoFormatText(text: string): string {
    const isCJK = (ch: string) => /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch);
    const endsSentence = (line: string) => /[。!?;…”』」.!?;)】》:]$/.test(line);

    const lines = text.split('\n');
    const out: string[] = [];
    let buffer = '';

    const flush = () => {
        if (buffer) {
            out.push(buffer);
            buffer = '';
        }
    };

    for (const raw of lines) {
        const line = raw.trim().replace(/\s{2,}/g, ' ');
        if (!line) {
            // 空行视为段落分隔
            flush();
            out.push('');
            continue;
        }
        if (!buffer) {
            buffer = line;
        } else {
            const prevChar = buffer[buffer.length - 1];
            const nextChar = line[0];
            buffer += isCJK(prevChar) && isCJK(nextChar) ? line : ' ' + line;
        }
        if (endsSentence(line)) flush();
    }
    flush();

    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 上传前压缩:超大图片缩放到最长边上限并转 JPEG。
 * 在浏览器端完成,可显著缩短弱设备(Armbian)上的识别耗时。
 * 压缩失败时返回原文件,不阻断上传。
 */
export async function compressImageIfNeeded(file: File): Promise<File> {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;

    let bitmap: ImageBitmap | null = null;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        return file;
    }

    try {
        const { width, height } = bitmap;
        const longest = Math.max(width, height);
        const needResize = longest > COMPRESS_MAX_SIDE;
        const needRecompress = file.size > COMPRESS_TRIGGER_BYTES;
        if (!needResize && !needRecompress) return file;

        const scale = needResize ? COMPRESS_MAX_SIDE / longest : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;

        // 透明 PNG 转 JPEG 前铺白底,避免透明区域变黑
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        const blob: Blob | null = await new Promise((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', 0.92)
        );
        if (!blob) return file;
        // 压缩没有收益时保留原文件
        if (!needResize && blob.size >= file.size) return file;

        const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], newName, { type: 'image/jpeg' });
    } finally {
        bitmap.close();
    }
}

function isCjkChar(ch: string): boolean {
    return /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch);
}

function joinTokens(texts: string[]): string {
    let out = '';
    for (const raw of texts) {
        const token = raw.trim();
        if (!token) continue;
        if (!out) {
            out = token;
            continue;
        }
        out += isCjkChar(out[out.length - 1]) && isCjkChar(token[0]) ? token : ` ${token}`;
    }
    return out;
}

export function filterIgnore(
    segments: OCRSegment[],
    imageHeight: number,
    header = DEFAULT_IGNORE,
    footer = DEFAULT_IGNORE,
): OCRSegment[] {
    if (!imageHeight || (header <= 0 && footer <= 0)) return segments;
    const top = imageHeight * header;
    const bottom = imageHeight * (1 - footer);
    return segments.filter(seg => {
        if (!seg.box) return true;
        const cy = (seg.box[1] + seg.box[3]) / 2;
        if (header > 0 && cy < top) return false;
        if (footer > 0 && cy > bottom) return false;
        return true;
    });
}

interface LineCluster {
    items: OCRSegment[];
    cy: number;
    h: number;
    y0: number;
    y1: number;
    x0: number;
}

export function clusterLines(segments: OCRSegment[]): LineCluster[] {
    const items = segments.filter(s => s.box);
    const noBox = segments.filter(s => !s.box);
    items.sort((a, b) => {
        const ay = (a.box![1] + a.box![3]) / 2;
        const by = (b.box![1] + b.box![3]) / 2;
        return ay === by ? a.box![0] - b.box![0] : ay - by;
    });

    const lines: LineCluster[] = [];
    for (const seg of items) {
        const box = seg.box!;
        const cy = (box[1] + box[3]) / 2;
        const h = Math.max(1, box[3] - box[1]);
        const hit = lines.find(line => Math.abs(cy - line.cy) < 0.55 * Math.max(h, line.h));
        if (hit) {
            hit.items.push(seg);
            const n = hit.items.length;
            hit.cy = (hit.cy * (n - 1) + cy) / n;
            hit.h = Math.max(hit.h, h);
            hit.y0 = Math.min(hit.y0, box[1]);
            hit.y1 = Math.max(hit.y1, box[3]);
            hit.x0 = Math.min(hit.x0, box[0]);
        } else {
            lines.push({ items: [seg], cy, h, y0: box[1], y1: box[3], x0: box[0] });
        }
    }
    for (const line of lines) {
        line.items.sort((a, b) => a.box![0] - b.box![0]);
    }
    if (noBox.length) {
        lines.push({ items: noBox, cy: 1e9, h: 1, y0: 1e9, y1: 1e9, x0: 0 });
    }
    return lines;
}

function lineText(line: LineCluster): string {
    return joinTokens(line.items.map(s => s.text || ''));
}

function endsSentence(text: string): boolean {
    return /[。！？；…—”』」.!?;:)\]】》]$/.test(text);
}

export function formatLayout(segments: OCRSegment[], mode: LayoutMode): string {
    const lines = clusterLines(segments).filter(l => lineText(l));
    if (!lines.length) return '';
    if (mode === 'raw') return lines.map(lineText).join('\n');
    if (mode === 'single') return joinTokens(lines.map(lineText));

    const avgH = lines.reduce((s, l) => s + Math.max(1, l.y1 - l.y0), 0) / lines.length;
    const parts: string[] = [];
    let buffer = lineText(lines[0]);
    let prev = lines[0];
    for (let i = 1; i < lines.length; i++) {
        const ln = lines[i];
        const gap = ln.y0 - prev.y1;
        const indentDiff = Math.abs(ln.x0 - prev.x0);
        const samePara = gap < 1.35 * avgH && indentDiff < 1.8 * avgH && !endsSentence(buffer);
        const nxt = lineText(ln);
        if (samePara) {
            buffer += isCjkChar(buffer[buffer.length - 1]) && isCjkChar(nxt[0]) ? nxt : ` ${nxt}`;
        } else {
            parts.push(buffer);
            buffer = nxt;
        }
        prev = ln;
    }
    parts.push(buffer);
    return parts.join('\n');
}

export function layoutPageText(
    segments: OCRSegment[],
    imageHeight: number,
    mode: LayoutMode,
    header = DEFAULT_IGNORE,
    footer = DEFAULT_IGNORE,
): string {
    return formatLayout(filterIgnore(segments, imageHeight, header, footer), mode);
}

export function formatScanText(
    pages: ScanPage[] | undefined,
    fallback: OCRSegment[] | undefined,
    imageHeight: number,
    mode: LayoutMode,
    header = DEFAULT_IGNORE,
    footer = DEFAULT_IGNORE,
): string {
    const src = pages && pages.length
        ? pages
        : [{ index: 0, imageUrl: '', width: 0, height: imageHeight, segments: fallback || [] }];
    const texts = src.map(p => layoutPageText(p.segments || [], p.height || imageHeight, mode, header, footer));
    if (texts.length <= 1) return texts[0] || '';
    return texts.map((t, i) => `—— 第 ${i + 1} 页 ——\n${t}`).join('\n\n');
}

export function visibleSegments(
    segments: OCRSegment[] | undefined,
    imageHeight: number,
    header = DEFAULT_IGNORE,
    footer = DEFAULT_IGNORE,
): OCRSegment[] {
    return filterIgnore(segments || [], imageHeight, header, footer);
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function isPdfScan(scan: DocumentScan): boolean {
    const name = `${scan.originalFile || ''} ${scan.title || ''}`.toLowerCase();
    return name.includes('.pdf');
}

export function scanKind(scan: DocumentScan): 'pdf' | 'image' {
    return isPdfScan(scan) ? 'pdf' : 'image';
}

export interface DateGroup {
    key: string;
    label: string;
    scans: DocumentScan[];
}

export function groupScansByDate(scans: DocumentScan[]): DateGroup[] {
    const pinned = scans.filter(s => s.pinned);
    const rest = scans.filter(s => !s.pinned);
    const groups: DateGroup[] = [];
    if (pinned.length) groups.push({ key: 'pinned', label: '置顶', scans: pinned });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const startOfWeek = startOfToday - 6 * 86400000;
    const buckets: Record<string, DocumentScan[]> = { today: [], yesterday: [], week: [], older: [] };

    for (const scan of rest) {
        const t = new Date(scan.date).getTime();
        if (Number.isNaN(t) || t >= startOfToday) buckets.today.push(scan);
        else if (t >= startOfYesterday) buckets.yesterday.push(scan);
        else if (t >= startOfWeek) buckets.week.push(scan);
        else buckets.older.push(scan);
    }

    if (buckets.today.length) groups.push({ key: 'today', label: '今天', scans: buckets.today });
    if (buckets.yesterday.length) groups.push({ key: 'yesterday', label: '昨天', scans: buckets.yesterday });
    if (buckets.week.length) groups.push({ key: 'week', label: '本周', scans: buckets.week });
    if (buckets.older.length) groups.push({ key: 'older', label: '更早', scans: buckets.older });
    return groups;
}

const TAG_COLORS = [
    'bg-teal-500/15 text-teal-800 dark:text-teal-200',
    'bg-sky-500/15 text-sky-800 dark:text-sky-200',
    'bg-violet-500/15 text-violet-800 dark:text-violet-200',
    'bg-amber-500/15 text-amber-800 dark:text-amber-200',
    'bg-rose-500/15 text-rose-800 dark:text-rose-200',
    'bg-lime-500/15 text-lime-800 dark:text-lime-200',
];

export function tagClass(tag: string): string {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
    return TAG_COLORS[hash % TAG_COLORS.length];
}

export function collectTags(scans: DocumentScan[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const scan of scans) {
        for (const tag of scan.tags || []) {
            if (!seen.has(tag)) {
                seen.add(tag);
                out.push(tag);
            }
        }
    }
    return out.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function lowConfidenceSegments(
    scan: DocumentScan,
    header = 0,
    footer = 0,
): OCRSegment[] {
    const pages = scan.pages && scan.pages.length
        ? scan.pages
        : [{ index: 0, segments: scan.segments || [], height: scan.imageHeight, width: scan.imageWidth, imageUrl: scan.fullImageUrl }];
    const out: OCRSegment[] = [];
    for (const page of pages) {
        const vis = visibleSegments(page.segments || [], page.height || scan.imageHeight, header, footer);
        for (const seg of vis) {
            if (seg.confidence > 0 && seg.confidence < LOW_CONFIDENCE) out.push(seg);
        }
    }
    return out;
}

export function toMarkdown(scan: DocumentScan): string {
    const title = (scan.title || '识别结果').replace(/\.[^.]+$/, '') || '识别结果';
    return `# ${title}\n\n${scan.extractedText || ''}\n`;
}

export function downloadTextFile(content: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function shareOrCopyText(title: string, text: string): Promise<'shared' | 'copied'> {
    if (typeof navigator !== 'undefined' && navigator.share) {
        try {
            await navigator.share({ title, text });
            return 'shared';
        } catch (err: any) {
            if (err?.name === 'AbortError') throw err;
        }
    }
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return 'copied';
    }
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    return 'copied';
}

export function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return Boolean(el.isContentEditable);
}

export function statusLabel(status: OCRStatus): string {
    if (status === OCRStatus.Processing) return '识别中';
    if (status === OCRStatus.Error) return '失败';
    return '已完成';
}
