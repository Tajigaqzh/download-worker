importScripts('./lib/jszip.min.js');

const urlPrefix = ["http://", "https://"];


/**
 * 下载错误类型
 * @type {{INVALID_URL: {code: number, message: string}, HTTP_ERROR: {code: number, message: string}, NETWORK_ERROR: {code: number, message: string}}}
 */
const DOWNLOAD_ERROR = {
    INVALID_URL: {
        code: 1001,
        message: 'Invalid URL'
    },
    NETWORK_ERROR: {
        code: 1002,
        message: 'Network Error'
    },
    HTTP_ERROR: {
        code: 1003,
        message: 'HTTP Error'
    },
};

/**
 * 检查URL是否有效
 * @param url
 * @returns {boolean}
 */
const isValidUrl = (url) => {
    if (!url) return false;
    return urlPrefix.some(prefix => url.startsWith(prefix));
}


/**
 * zip包下载器
 */
class ZipDownloader {
    constructor(files) {
        this.zip = new JSZip();
        this.downloadedCount = 0;
        this.errorDetails = [];
        // 初始化时复制原始文件列表并添加状态
        this.fileList = files.map(file => ({
            ...file,
            blob: null,
            status: 'pending'
        }));
    }

    async process(options) {
        const {maxConcurrent, maxRetries,zipName} = options;
        // 下载文件
        await this.processDownloadTask(maxConcurrent, maxRetries);
        // 生成ZIP
        return await this.generateZip(zipName);

    }

    async processDownloadTask(maxConcurrent, maxRetries) {
        const queue = [...this.fileList];
        const totalFiles = this.fileList.length;
        const worker = async () => {
            while (queue.length > 0) {
                const file = queue.shift();
                try {
                    await this.downloadWithRetry(file, maxRetries);
                    file.status = 'success';
                } catch (error) {
                    file.status = 'failed';
                    console.warn(error.message);


                }
                // 不管失败还是错误，都会更新下载状态
                this.downloadedCount++;

                self.postMessage({
                    type: 'download-progress',
                    progress: Math.round((this.downloadedCount / totalFiles) * 100),
                    downloadedCount: this.downloadedCount,
                });
            }
        };

        const workers = Array(Math.min(maxConcurrent, totalFiles))
            .fill(null)
            .map(() => worker());

        await Promise.all(workers);
    }

    async downloadWithRetry(fileInfo, maxRetries) {
        let retries = 0;

        while (retries <= maxRetries) {
            try {
                fileInfo.blob = await this.fetchFile(fileInfo.url);
                return;
            } catch (error) {
                if (retries++ >= maxRetries) {
                    throw new Error(`文件 ${fileInfo.path} 下载失败: ${error.message}`);
                }
                await this.wait(1000);
            }
        }
    }
    /**
     * 请求文件
     * @param url
     * @returns {Promise<Blob>}
     */
    async fetchFile(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.blob();
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async generateZip(zipName) {
        let processed = 0;
        const totalFiles = this.fileList.filter(f => f.status === 'success').length;

        // 添加成功文件到ZIP
        this.fileList.forEach(file => {
            if (file.status === 'success') {
                this.zip.file(file.path, file.blob);
                processed++;

                self.postMessage({
                    type: 'zip-progress',
                    progress: Math.round((processed / totalFiles) * 100)
                });
            }
        });

        // 生成ZIP
        return this.zip.generateAsync({
            type: 'blob',
            compression: "DEFLATE",
            compressionOptions: {level: 9}
        });
    }


}

/**
 * 单文件下载器
 */
class SingleDownLoader {

    constructor(files) {
        this.downloadedCount = 0;
        this.errorDetails = [];
        // 初始化时复制原始文件列表并添加状态
        this.fileList = files.map(file => ({
            ...file,
            blob: null,
            status: 'pending'
        }));
    }


    async process(options) {
        const {maxConcurrent, maxRetries} = options;
        await this.processDownloadTask(maxConcurrent, maxRetries);
    }


    /**
     * 处理下载的方法
     * @param maxConcurrent 最大并发
     * @param maxRetries 最大重试次数
     * @returns {Promise<void>}
     */
    async processDownloadTask(maxConcurrent, maxRetries) {
        // 任务队列
        const queue = [...this.fileList];

        // 计算总文件数
        const totalFiles = this.fileList.length;

        /**
         * 单个任务处理函数,这个必须要用箭头函数this才会指向当前实例
         * @returns {Promise<void>}
         */
        const workerFn = async () => {
            while (queue.length > 0) {
                const fileInfo = queue.shift();
                await this.downloadWithRetry(fileInfo, maxRetries);
            }
        }

        // 填充任务队列
        const workers = Array(Math.min(maxConcurrent, totalFiles))
            .fill(null)
            .map(() => workerFn());

        // 执行任务队列
        await Promise.all(workers);
    }


    async downloadWithRetry(fileInfo, maxRetries) {
        // 重试次数
        let retryCount = 0;
        // 错误信息
        let lastError = null;

        while (retryCount <= maxRetries) {
            try {
                await this.downloadFile(fileInfo);
                return; // 成功则退出
            } catch (error) {
                lastError = error;
                retryCount++;
                if (retryCount <= maxRetries) {
                    await this.waitExponential(retryCount); // 指数退避等待
                }
            }
        }

        // todo，统一封装错误信息
        // 全部重试失败后发送错误
        self.postMessage({
            type: 'error',
            url: fileInfo.url,
            error: `失败重试超过 ${maxRetries} 次: ${lastError.message}`,
            retries: maxRetries
        });
    }


    async downloadFile(fileInfo) {
        return new Promise(async (resolve, reject) => {
            const {url, filename} = fileInfo;
            try {
                if (!isValidUrl(url)) {
                    // todo 统一封装错误信息
                    self.postMessage({
                        type: 'error',
                        url,
                        error: `无效的URL: ${url}`,
                    });
                    console.log("出错了", url)
                    resolve();
                }
                const response = await fetch(url);
                if (!response.ok) {
                    // todo 统一封装错误信息
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const reader = response.body.getReader();
                const contentLength = +response.headers.get('Content-Length') || 0;

                let received = 0;
                const chunks = [];

                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;

                    chunks.push(value);
                    received += value.length;

                    self.postMessage({
                        type: 'progress',
                        url,
                        loaded: received,
                        total: contentLength
                    });
                }

                const blob = new Blob(chunks);

                self.postMessage({
                    type: 'complete',
                    url,
                    blob,
                    filename
                });
                resolve();

            } catch (error) {
                // 抛出错误给外层
                reject(error);
            }
        })
    }


    async waitExponential(_retryCount) {
        // const baseDelay = 1000; // 基础等待时间 1s
        // const maxDelay = 30000; // 最大等待时间 30s
        // const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
        return new Promise(resolve => setTimeout(resolve, 1000));
    }

}


const DOWNLOAD_TYPE = {
    ZIP: 0,
    SINGLE: 1
}

/**
 * 根据下载类型生成对应下载loader
 * @param files 文件列表
 * @param downloadType {number} 0: zip, 1: single
 */
function handleDownloadType(files, downloadType = DOWNLOAD_TYPE.SINGLE) {
    switch (downloadType) {
        case DOWNLOAD_TYPE.ZIP:
            return new ZipDownloader(files);
        case DOWNLOAD_TYPE.SINGLE:
            return new SingleDownLoader(files);
        default:
            throw new Error('Invalid download type');
    }

}

self.onmessage = async (e) => {
    if (e.data.type === 'start') {
        // 加载对应的下载loader
        const downloader = handleDownloadType(e.data.files, e.data.downloadType ?? DOWNLOAD_TYPE.SINGLE);
        // 传入文件列表
        try {
            const blob = await downloader.process({
                // 压缩包名
                zipName: e.data.zipName,
                // 最大下载并发数
                maxConcurrent: e.data.maxConcurrent ?? 10,
                // 最大重试次数
                maxRetries: e.data.maxRetries ?? 10
            });

            self.postMessage({
                type: 'done',
                blob: blob,
                zipName: e.data.zipName
            });
        } catch (error) {
            self.postMessage({
                type: 'error',
                error: error.message
            });
        }
    }
}
