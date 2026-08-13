import { DocumentScan, OCRStatus } from './types';
import { REQUEST_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from './constants';

/** 后端记录(蛇形命名)转前端模型 */
function mapScan(raw: any): DocumentScan {
    return {
        id: raw.id,
        title: raw.title,
        date: raw.created_at,
        thumbnailUrl: raw.thumb_url || '',
        fullImageUrl: raw.image_url || '',
        extractedText: raw.extracted_text ?? '',
        status: (raw.status as OCRStatus) || OCRStatus.Ready,
        fileSize: raw.file_size ?? 0,
        confidence: Math.round((raw.confidence ?? 0) * 100),
        processingTime: raw.processing_time ?? 0,
        imageWidth: raw.image_width ?? 0,
        imageHeight: raw.image_height ?? 0,
        pageCount: raw.page_count ?? 1,
        segments: raw.segments,
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

export async function fetchScans(): Promise<DocumentScan[]> {
    const data = await request('/api/scans');
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
