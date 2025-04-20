# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).

当前的打包流程：


```bash
# 压缩 操作工具类
npx terser .\public\download\download-utils.worker.js -o .\public\download\download-utils.worker.main.js -m -c
# 手动更新工具类引用  将public/download下的所有importScripts('./download-utils.worker.js');替换为importScripts('./download-utils.worker.main.js');
# 压缩 数据库类
npx terser .\public\download\IndexDB.worker.js -o .\public\download\IndexDB.worker.main.js -m -c
# 手动更新数据库类引用  将public/download下的所有importScripts('./IndexDB.worker.js');替换为importScripts('./IndexDB.worker.main.js');
# 压缩 下载类
npx terser .\public\download\downloader.worker.js -o .\public\download\downloader.worker.main.js -m -c
# 手动更新下载类引用  将public/download下的所有importScripts('./downloader.worker.js');替换为importScripts('./downloader.worker.main.js');
# 压缩 下载使用类
npx terser .\public\download\download.worker.js -o .\public\download\download.worker.main.js -m -c

```



todo 使用gulp简化打包流程 实现代码压缩
