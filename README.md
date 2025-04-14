# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).

```bash
# 压缩 操作工具类
npx terser .\public\download-utils.worker.js -o .\public\download-utils.worker.main.js -m -c
# 更新工具类引用
# 压缩 数据库类
npx terser .\public\IndexDB.worker.js -o .\public\IndexDB.worker.main.js -m -c
# 更新数据库类引用
# 压缩 下载类
npx terser .\public\downloader.worker.js -o .\public\downloader.worker.main.js -m -c
# 更新下载类引用
# 压缩 下载使用类
npx terser .\public\download.worker.js -o .\public\download.worker.main.js -m -c


```

