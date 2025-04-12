<template>

  <button @click="startDownload">下载</button>
</template>

<script setup lang="ts">

function startDownload() {
  // https://fileoss.zaichengzhang.net
  const fileList = [
    {url: 'https://fileoss.zaichengzhang.net/Oss/iOS/TeacherMobile/20250410/Photo/03BCE688-B815-4183-B2C4-3AB1C7F24B0E.jpg', filename: 'file1.jpg'},
    {url: '/Oss/iOS/TeacherMobile/20250402/Photo/F1C4C4CC-8C11-46DA-A3D4-6F0382ADD563.jpg', filename: 'file2.jpg'},
    // 添加更多文件...
  ];

  const worker = new Worker('download.js');

  worker.postMessage({
    type: 'start',
    files: fileList,
    maxConcurrent: 10 // 最大并发数
  });

  worker.onmessage = function (e) {
    const data = e.data;
    switch (data.type) {
      case 'progress':
        updateProgress(data.url, data.loaded, data.total);
        break;
      case 'complete':
        saveFile(data.blob, data.filename || data.url.split('/').pop());
        break;
      case 'error':
        handleError(data.url, data.error);
        break;
      case 'done':
        worker.terminate();
        console.log('所有文件下载完成');
        break;
    }
  };
}

function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function updateProgress(url: string, loaded: number, total: number) {
  console.log(`${url}: ${((loaded / total) * 100).toFixed(1)}%`);
}

function handleError(url: string, error: any) {
  console.error(`下载失败: ${url}`, error);
}
</script>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}

.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}

.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
