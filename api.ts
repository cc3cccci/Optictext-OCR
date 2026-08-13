import { DocumentScan, LayoutMode, OCRSegment, OCRStatus, ScanPage } from './types';
import { POLL_INTERVAL_MS, REQUEST_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from './constants';
import { sleep } from './utils';

function mapSegment(raw: any, index: number, page = 0): OCRSegment {
    return {
        id: raw.id || `p${page}-s${index}`,
        text: raw.text || '',
        confidence: raw.confidence ?? 0,
        box: raw.box || null,
        page: raw.page ?? page,
    };
}

function mapPages(raw: any): ScanPage[] | undefined {
    if (!Array.isArray(raw?.pages) || !raw.pages.length) return undefined;
    return raw.pages.map((p: any) => ({
        index: p.index ?? 0,
        imageUrl: p.image_url || (p.image_file ? `/api/images/${p.image_file}` : ''),
        imageFile: p.image_file,
        width: p.width ?? 0,
        height: p.height ?? 0,
        segments: Array.isArray(p.segments)
            ? p.segments.map((s: any, i: number) => mapSegment(s, i, p.index ?? 0))
            : [],
    }));
}

/** 后端记录(蛇形命名)转前端模型 */
export function mapScan(raw: any): DocumentScan {
    const pages = mapPages(raw);
    const segments = Array.isArray(raw.segments)
        ? raw.segments.map((s: any, i: number) => mapSegment(s, i, s.page ?? 0))
        : pages?.[0]?.segments;
    return {
        id: raw.id,
        title: raw.title,
        date: raw.created_at,
        thumbnailUrl: raw.thumb_url || '',
        fullImageUrl: raw.image_url || pages?.[0]?.imageUrl || '',
        extractedText: raw.extracted_text ?? raw.text_preview ?? '',
        textPreview: raw.text_preview,
        status: (raw.status as OCRStatus) || OCRStatus.Ready,
        fileSize: raw.file_size ?? 0,
        confidence: Math.round((raw.confidence ?? 0) * 100),
        processingTime: raw.processing_time ?? 0,
        imageWidth: raw.image_width ?? 0,
        imageHeight: raw.image_height ?? 0,
        pageCount: raw.page_count ?? 1,
        pageDone: raw.page_done ?? 0,
        errorMessage: raw.error_message || '',
        layoutMode: (raw.layout_mode as LayoutMode) || 'paragraph',
        ignoreHeader: raw.ignore_header ?? 0.08,
        ignoreFooter: raw.ignore_footer ?? 0.08,
        segments,
        pages,
        originalFile: raw.original_file,
    };
}

async function request(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
        response = await fetch(url, { ...init, signal: controller.signal });
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            throw new Error('请求超时,请确认后端服务是否正常运行');
        }
        throw new Error('无法连接后端服务,请检查设备网络');
    } finally {
        clearTimeout(timer);
    }

    if (!response.ok) {
        let detail = `服务错误(${response.status})`;
        try {
            const data = await response.json();
            if (data?.detail) detail = data.detail;
        } catch {
            /* 保留默认错误信息 */
        }
        throw new Error(detail);
    }
    if (response.status === 204) return null;
    return response.json();
}

export async function fetchScans(query?: string): Promise<DocumentScan[]> {
    const url = query && query.trim() ? `/api/scans?q=${encodeURIComponent(query.trim())}` : '/api/scans';
    const data = await request(url);
    return (data as any[]).map(mapScan);
}

export async function fetchScanDetail(id: string): Promise<DocumentScan> {
    const data = await request(`/api/scans/${id}`);
    return mapScan(data);
}

export async function uploadForOCR(file: File): Promise<DocumentScan> {
    const formData = new FormData();
    formData.append('file', file);
    const data = await request('/api/ocr', { method: 'POST', body: formData }, UPLOAD_TIMEOUT_MS);
    return mapScan(data);
}

export async function retryScan(id: string): Promise<DocumentScan> {
    const data = await request(`/api/scans/${id}/retry`, { method: 'POST' }, UPLOAD_TIMEOUT_MS);
    return mapScan(data);
}

export async function reflowScan(
    id: string,
    body: { layout_mode?: LayoutMode; ignore_header?: number; ignore_footer?: number },
): Promise<DocumentScan> {
    const data = await request(`/api/scans/${id}/reflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return mapScan(data);
}

export async function pollScanUntilDone(
    id: string,
    onUpdate: (scan: DocumentScan) => void,
    isCancelled?: () => boolean,
): Promise<DocumentScan> {
    while (true) {
        if (isCancelled?.()) throw new Error('cancelled');
        const scan = await fetchScanDetail(id);
        onUpdate(scan);
        if (scan.status !== OCRStatus.Processing) return scan;
        await sleep(POLL_INTERVAL_MS);
    }
}

export async function saveScanText(id: string, text: string): Promise<void> {
    await request(`/api/scans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extracted_text: text }),
    });
}

export async function deleteScanById(id: string): Promise<void> {
    await request(`/api/scans/${id}`, { method: 'DELETE' });
}

export async function downloadSearchablePdf(id: string, title: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    let response: Response;
    try {
        response = await fetch(`/api/scans/${id}/export.pdf`, { signal: controller.signal });
    } catch {
        throw new Error('导出 PDF 失败,请检查后端服务');
    } finally {
        clearTimeout(timer);
    }
    if (!response.ok) {
        throw new Error('导出 PDF 失败');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = `${(title || '识别结果').replace(/\.[^.]+$/, '')}_可检索.pdf`;
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
