import { COMPRESS_MAX_SIDE, COMPRESS_TRIGGER_BYTES } from './constants';

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
