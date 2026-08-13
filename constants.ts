/** 上传文件本身的超时(识别在后台进行,不再占用这个超时) */
export const UPLOAD_TIMEOUT_MS = 60_000;

/** 普通请求超时 */
export const REQUEST_TIMEOUT_MS = 15_000;

/** 轮询识别进度间隔 */
export const POLL_INTERVAL_MS = 1000;

/** 上传大小上限(与后端一致) */
export const MAX_UPLOAD_MB = 20;

/** 上传前压缩:最长边超过该值则缩放 */
export const COMPRESS_MAX_SIDE = 2500;

/** 上传前压缩:文件超过该大小则重新编码为 JPEG */
export const COMPRESS_TRIGGER_BYTES = 1.5 * 1024 * 1024;

export const DEFAULT_IGNORE = 0.08;
