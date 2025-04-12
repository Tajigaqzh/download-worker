export const DOWNLOAD_STATUS = {
    // 等待下载
    PENDING: 0,
    //下载中
    DOWNLOADING: 1,
    // 暂停下载
    PAUSE_DOWNLOAD: 2,
    // 重新下载
    RESUME_DOWNLOAD: 3,
    // 下载失败重试中
    FAIL_DOWNLOAD_RETRY: 4,
    // 下载失败
    FAIL_DOWNLOAD: 5,
    // 完成下载
    COMPLETE_DOWNLOAD: 6,
    // 取消下载
    CANCEL_DOWNLOAD: 7,
    // 压缩中
    COMPRESSING: 8,
    // 压缩成功
    COMPRESS_SUCCESS: 9,
    // 压缩失败
    COMPRESS_FAIL: 10,

}
