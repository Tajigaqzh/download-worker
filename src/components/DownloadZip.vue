<template>

  <button @click="startDownload">下载</button>
</template>

<script lang="ts" setup>

let downloadWorker = null;

function startDownload() {
  //
  const fileList = [
    {
      url: 'https://fileoss.zaichengzhang.net/Oss/iOS/TeacherMobile/20250410/Photo/03BCE688-B815-4183-B2C4-3AB1C7F24B0E.jpg',
      filename: 'file1.jpg',
      path: 'photo/test1.jpg'
    },
    {
      url: 'https://fileoss.zaichengzhang.net/Oss/iOS/TeacherMobile/20250402/Photo/F1C4C4CC-8C11-46DA-A3D4-6F0382ADD563.jpg',
      filename: 'file2.jpg',
      path: 'photo/inner/test2.jpg'
    },
    // 添加更多文件...
  ];
  downloadWorker = new Worker('download.js');

  // 2. 发送下载配置
  downloadWorker.postMessage({
    type: 'start',
    files: fileList,
    downloadType: 0,
    zipName: '归档文件包.zip',
    maxConcurrent: 3,    // 最大并发下载数
    maxRetries: 5       // 单个文件最大重试次数
  });
// 3. 处理Worker响应
  downloadWorker.onmessage = function (e) {
    const data = e.data;
    switch (data.type) {
      case 'download-progress':
        console.log(`当前下载进度: ${data.progress}%`);
        updateProgress('download', data.progress);
        break;

      case 'zip-progress':
        console.log(`当前压缩进度: ${data.progress}%`);
        updateProgress('zip', data.progress);
        break;

      case 'done':
        handleDownloadComplete(data.blob, data.zipName);
        break;

      case 'error':
        handleDownloadError(data.message);
        break;
    }
  };
}

// 进度更新函数
function updateProgress(type, percent) {
  console.log(`当前${type}进度: ${percent}%`)
}

// 下载完成处理
function handleDownloadComplete(blob, filename) {
  // 创建下载链接
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;

  // 自动触发下载
  document.body.appendChild(a);
  a.click();

  // 清理资源
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    downloadWorker.terminate();
  }, 100);

  console.log('下载包已准备就绪');
}

// 错误处理
function handleDownloadError(message) {
  console.error('发生错误:', message);
  alert(`下载失败: ${message}`);
  downloadWorker.terminate();
}

// 安全关闭Worker
// window.addEventListener('beforeunload', () => {
//   if (downloadWorker) {
//     downloadWorker.terminate();
//   }
// });
</script>
