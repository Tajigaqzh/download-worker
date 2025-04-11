<template>
<!--    <DownloadFile></DownloadFile>-->
  <DownloadZip></DownloadZip>
</template>

<script setup lang="ts">
import DownloadZip from "./components/DownloadZip.vue";
import DownloadFile from "./components/DownloadFile.vue";
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
