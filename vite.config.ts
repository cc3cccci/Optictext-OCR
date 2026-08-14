import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      // 开发模式下代理到本地后端。
      // 使用带斜杠的 '/api/' 前缀,避免把前端源码模块请求 '/api.ts' 也代理到后端
      // (后端没有该路径会返回 404,导致 dev server 下整个应用加载失败)。
      '/api/': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
