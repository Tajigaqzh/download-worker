<template>
  <!--    <DownloadFile></DownloadFile>-->
  <!--  <DownloadZip></DownloadZip>-->
  <!--  <DownloadDemo></DownloadDemo>-->

  <button @click="getAll">查询</button>
  <button @click="test">测试</button>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref} from "vue";
import {useWebWorker} from '@vueuse/core'
import {v4 as uuidV4} from 'uuid';
import {DOWNLOAD_STATUS} from "./DownLoadStatus.ts";
import db from "./indexDBUtils.ts";


// import
const {data, post, terminate, worker} = useWebWorker('download.worker.js')

const taskId = ref("")

function getAll() {
  db.getAll("uploadTask").then(res => {
    console.log(res);
  })
}

onMounted(() => {
  window.addEventListener("online", () => {
    console.log("网络已连接")
  });
  window.addEventListener("offline",()=>{
    console.log("网络已断开")
  })
})

function test() {
  taskId.value = uuidV4();
  const batchId = uuidV4();
  const date = new Date();


  post({
    type: 'startDownload',
    downloadType: 1,
    zipName: "",
    taskList: [
      {
        // 批次id
        batchId: batchId,
        // 任务id
        taskId: uuidV4(),
        // 下载路径
        url: "https://fileoss.zaichengzhang.net/Oss/iOS/TeacherMobile/20250410/Photo/03BCE688-B815-4183-B2C4-3AB1C7F24B0E.jpg",
        // 压缩模式的压缩路径
        path: "",
        // 用户id
        userId: "12323423545",
        // 创建任务的时间戳
        taskTimeStamp: "",
        // 任务开始时间戳
        startTimestamp: "",
        // 任务结束时间戳
        endTimestamp: "",
        // 进度
        progress: 0,
        fileSize: 0,
        // 文件名
        fileName: "",
        // 状态  0 等待下载  1下载中  2 暂停 3 重新下载 4失败重试中 5 失败重试完毕（次数用尽还是失败） 6下载完毕 7取消下载  8  压缩中 9压缩成功 10 压缩失败
        status: DOWNLOAD_STATUS.PENDING,
        blob: undefined,
        // 错误等待时长（毫秒）
        errorWaitTime: 0,
        // 文件大小
        totalSize: 0,
        downloaded: 0,
      },
      // {
      //   // 批次id
      //   batchId: batchId,
      //   // 任务id
      //   taskId: uuidV4(),
      //   // 下载路径
      //   url: "https://fileoss.zaichengzhang.net/Oss/iOS/TeacherMobile/20250410/Photo/03BCE688-B815-4183-B2C4-3AB1C7F24B0E.jpg",
      //   // 压缩模式的压缩路径
      //   path: "",
      //   // 用户id
      //   userId: "12323423545",
      //   // 创建任务的时间戳
      //   taskTimeStamp: "",
      //   // 任务开始时间戳
      //   startTimestamp: "",
      //   // 任务结束时间戳
      //   endTimestamp: "",
      //   // 进度
      //   process: 0,
      //   fileSize: 0,
      //   // 文件名
      //   fileName: "",
      //   // 状态  0 等待下载  1下载中  2 暂停 3 重新下载 4失败重试中 5 失败重试完毕（次数用尽还是失败） 6下载完毕 7取消下载  8  压缩中 9压缩成功 10 压缩失败
      //   status: DOWNLOAD_STATUS.PENDING,
      //   blob: undefined,
      //   // 错误等待时长（毫秒）
      //   errorWaitTime: 0,
      //   // 文件大小
      //   totalSize: 0,
      //   downloaded: 0,
      // }
    ]
  })
}

onBeforeUnmount(() => {
  terminate();
})

/**
 * 初始化数据库表
 */
// const initRecordDBModel = async () => {
//   if (!db.isExistTable(STORE_NAME)) {
//     await db.addStore({
//       name: STORE_NAME,
//       // STORE创建参数
//       options: {keyPath: "questionId"},
//       // 索引配置
//       indexes: [
//         {
//           name: "questionIdIndex",
//           keyPath: "questionId",
//           options: {unique: true}
//         }
//       ]
//     })
//
//   }
// }

// initRecordDBModel();

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
