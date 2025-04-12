<!--<template>-->
<!--  <button @click="startDownload">下载</button>-->
<!--</template>-->

<!--<script setup lang="ts">-->
<!--const downloadWorker = new Worker('demo.worker.js');-->

<!--function startDownload() {-->
<!--  const sessionId = Date.now().toString();-->
<!--  const files = [-->

<!--    {-->
<!--      url: 'https://fileoss.zaichengzhang.net/Oss/iOS/TeacherMobile/20250410/Photo/03BCE688-B815-4183-B2C4-3AB1C7F24B0E.jpg',-->
<!--      filename: 'file1.jpg',-->
<!--      path: 'docs/file1.jpg',-->
<!--      fileId: '2'-->
<!--    },-->
<!--    {-->
<!--      url: 'https://fileoss.zaichengzhang.net/Oss/iOS/TeacherMobile/20250410/Photo/03BCE688-B815-4183-B2C4-3AB1C7F24B0E.jpg',-->
<!--      filename: 'file1.jpg',-->
<!--      path: 'demo/file2.jpg',-->
<!--      fileId: '1'-->
<!--    },-->


<!--  ]-->

<!--  downloadWorker.postMessage({-->
<!--    type: 'start',-->
<!--    data: {-->
<!--      sessionId,-->
<!--      files,-->
<!--      downloadType: 0,-->
<!--      options: {-->
<!--        zipName: 'archive.zip',-->
<!--        maxConcurrent: 3-->
<!--      }-->
<!--    }-->
<!--  });-->
<!--}-->

<!--// 处理进度更新-->
<!--downloadWorker.onmessage = (e) => {-->
<!--  switch (e.data.type) {-->
<!--    case 'file-progress':-->
<!--      console.log(e.data)-->
<!--      // updateFileProgress(e.data);-->
<!--      break;-->
<!--    case 'zip-progress':-->
<!--      console.log(e.data)-->
<!--      // updateZipProgress(e.data);-->
<!--      break;-->
<!--      // 其他事件处理...-->

<!--    case "done":-->
<!--      console.log(e.data)-->
<!--      break;-->
<!--    case "error":-->
<!--      console.log(e.data);-->
<!--      break;-->
<!--  }-->
<!--};-->


<!--</script>-->

<!--<style scoped>-->


<!--</style>-->
