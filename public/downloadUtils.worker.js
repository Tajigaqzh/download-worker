(function () {
    const urlPrefix = ["http://", "https://"];
    /**
     * 下载类型
     * @type {{ZIP: number, FILE_LIST: number}}
     */
    self.DOWNLOAD_TYPE_WORKER = {
        ZIP: 0,
        FILE_LIST: 1
    };

    /**
     * 判断是否是合法的字符串
     * @param url
     */
    self.isValidUrl = (url) => {
        if (!url || url.length === 0 || url.trim() === 0) return false;
        return urlPrefix.some(prefix => url.startsWith(prefix));
    }


    /**
     * 下载错误
     * @type {{INVALID_URL: {code: number, message: string}, HTTP_ERROR: {code: number, message: string}, NETWORK_ERROR: {code: number, message: string}}}
     */
    self.DOWNLOAD_ERROR_WORKER = {
        INVALID_URL: 1001,
        NETWORK_ERROR: 1002,


        HTTP_ERROR: {
            code: 1003,
            message: 'HTTP Error'
        },
        DB_ERROR: {
            code: 1004,
            message: "indexDB Error"
        }
    };


    self.getErrorMessage = (errorCode, data) => {
        switch (errorCode) {
            case 1001: {
                return {
                    data: data ?? null,
                    code: 1001,
                    message: "不合法的路径",
                }
            }
            case 1002: {
                return {
                    data: data ?? null,
                    message: "网络错误",
                    code: 1002,
                }
            }

        }

    }

    /**
     * 下载状态机
     * @type {{FAIL_DOWNLOAD_RETRY: number, FAIL_DOWNLOAD: number, COMPRESS_FAIL: number, CANCEL_DOWNLOAD: number, COMPRESS_SUCCESS: number, COMPLETE_DOWNLOAD: number, PAUSE_DOWNLOAD: number, DOWNLOADING: number, PENDING: number, RESUME_DOWNLOAD: number, COMPRESSING: number}}
     */
    self.DOWNLOAD_STATUS = {
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
})()
