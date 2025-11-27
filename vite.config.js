import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'classic', // ⭐ 使用旧版 JSX Runtime 兼容 React 16
    }),
  ],
})
