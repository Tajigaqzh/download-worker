importScripts('./lib/jszip.min.js');




// const db = new IndexedDBSingleton();
// await db.initialize();

// 状态管理模块
class DownloadStateManager {
    constructor() {
        this.db = null;
        this.initializeDB();
    }

    async initializeDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('DownloadDB', 1);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('downloadStates')) {
                    const store = db.createObjectStore('downloadStates', {keyPath: 'fileId'});
                    store.createIndex('session', 'sessionId', {unique: false});
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };

            request.onerror = reject;
        });
    }

    async saveState(sessionId, fileId, state) {
        const tx = this.db.transaction('downloadStates', 'readwrite');
        tx.objectStore('downloadStates').put({
            ...state,
            fileId,
            sessionId,
            timestamp: Date.now()
        });
        return tx.done;
    }

    async getStates(sessionId) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('downloadStates', 'readonly');
            const store = tx.objectStore('downloadStates');
            const index = store.index('session');
            const request = index.getAll(IDBKeyRange.only(sessionId));

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = reject;
        });
    }

    async deleteState(fileId) {
        const tx = this.db.transaction('downloadStates', 'readwrite');
        tx.objectStore('downloadStates').delete(fileId);
        return tx.done;
    }
}

// 下载控制器基类
class DownloadController {
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.stateManager = new DownloadStateManager();
        this.activeDownloads = new Map(); // { fileId: AbortController }
        this.fileStates = new Map();     // { fileId: { status, progress } }
    }

    async initialize() {
        const states = await this.stateManager.getStates(this.sessionId);
        debugger;
        states.forEach(state => {
            this.fileStates.set(state.fileId, {
                status: state.status,
                progress: state.progress,
                data: state
            });
        });
    }

    async updateState(fileId, state) {
        const current = this.fileStates.get(fileId) || {};
        this.fileStates.set(fileId, {...current, ...state});
        await this.stateManager.saveState(
            this.sessionId,
            fileId,
            this.fileStates.get(fileId)
        );
    }

    async pauseFile(fileId) {
        if (this.activeDownloads.has(fileId)) {
            const controller = this.activeDownloads.get(fileId);
            controller.abort();
            this.activeDownloads.delete(fileId);
            await this.updateState(fileId, {status: 'paused'});
            return true;
        }
        return false;
    }

    async resumeFile(fileId) {
        const state = this.fileStates.get(fileId);
        if (state?.status === 'paused') {
            await this.startDownload(fileId, state.data);
            return true;
        }
        return false;
    }

    async cancelFile(fileId) {
        await this.pauseFile(fileId);
        await this.stateManager.deleteState(fileId);
        this.fileStates.delete(fileId);
    }
}

// ZIP下载器实现
class ControlledZipDownloader extends DownloadController {
    constructor(sessionId, files) {
        super(sessionId);
        this.zip = new JSZip();
        this.fileList = files.map(file => ({
            ...file,
            fileId: file.fileId || generateFileId(file.url),
            downloaded: 0,
            totalSize: 0,
            status: 'pending',
            blob: null
        }));
    }

    async process(options) {
        console.log("处理逻辑")
        await this.initialize();

        debugger
        // await this.restoreDownloads();
        await this.downloadFiles(options);
        return this.generateZip(options.zipName);
    }

    async restoreDownloads() {
        await Promise.all(this.fileList.map(async (file) => {
            const state = this.fileStates.get(file.fileId);
            if (state) {
                Object.assign(file, state.data);
                if (file.status === 'paused') {
                    await this.startDownload(file.fileId, file);
                }
            }
        }));
    }

    async downloadFiles({maxConcurrent}) {
        const queue = this.fileList.filter(f =>
            ['pending', 'paused'].includes(f.status)
        );

        const workers = Array(Math.min(maxConcurrent, queue.length))
            .fill(null)
            .map(() => this.processQueue(queue));

        await Promise.all(workers);
    }

    async processQueue(queue) {
        while (queue.length > 0) {
            const file = queue.shift();
            if (this.fileStates.get(file.fileId)?.status === 'cancelled') continue;

            await this.startDownload(file.fileId, file);
        }
    }

    async startDownload(fileId, file) {
        if (this.activeDownloads.has(fileId)) return;

        const controller = new AbortController();
        this.activeDownloads.set(fileId, controller);

        try {
            await this.updateState(fileId, {status: 'downloading'});

            const response = await fetch(file.url, {
                signal: controller.signal,
                headers: this.getRangeHeaders(file)
            });

            await this.processResponse(response, file);
            await this.updateState(fileId, {status: 'completed'});
        } catch (error) {
            if (error.name === 'AbortError') {
                await this.updateState(fileId, {status: 'paused'});
            } else {
                await this.updateState(fileId, {status: 'failed', error: error.message});
            }
        } finally {
            this.activeDownloads.delete(fileId);
        }
    }

    getRangeHeaders(file) {
        return file.downloaded > 0 ?
            {'Range': `bytes=${file.downloaded}-`} :
            {};
    }

    async processResponse(response, file) {
        if (!response.ok && response.status !== 206) {
            throw new Error(`HTTP ${response.status}`);
        }

        file.totalSize = parseInt(response.headers.get('Content-Length')) + file.downloaded;
        const reader = response.body.getReader();

        while (true) {
            const {done, value} = await reader.read();
            if (done) break;

            file.downloaded += value.length;
            file.blob = this.mergeChunks(file.blob, value);

            const progress = (file.downloaded / file.totalSize) * 100;
            await this.updateState(file.fileId, {progress});

            self.postMessage({
                type: 'file-progress',
                fileId: file.fileId,
                progress: Math.round(progress),
                downloaded: file.downloaded,
                total: file.totalSize
            });
        }
    }

    mergeChunks(existing, chunk) {
        return existing ?
            new Blob([existing, chunk], {type: existing.type}) :
            new Blob([chunk]);
    }

    async generateZip(zipName) {
        const validFiles = this.fileList.filter(f =>
            f.status === 'completed' &&
            !['cancelled', 'paused'].includes(this.fileStates.get(f.fileId)?.status)
        );

        validFiles.forEach(file => {
            this.zip.file(file.path, file.blob, {
                binary: true,
                date: new Date(),
                comment: `Downloaded from ${file.url}`
            });
        });

        return this.zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: {level: 9},
            streamFiles: true
        }, metadata => {
            self.postMessage({
                type: 'zip-progress',
                current: metadata.currentFile,
                total: metadata.totalFiles,
                percent: metadata.percent
            });
        });
    }
}

// 单文件下载器实现
class ControlledSingleDownloader extends DownloadController {
    constructor(sessionId, files) {
        super(sessionId);
        this.fileList = files.map(file => ({
            ...file,
            fileId: file.fileId || generateFileId(file.url),
            downloaded: 0,
            totalSize: 0,
            status: 'pending',
            blob: null
        }));
    }

    async process(options) {
        await this.initialize();
        await this.restoreDownloads();
        await this.downloadFiles(options);
        return this.getCompletedFiles();
    }

    async restoreDownloads() {
        await Promise.all(this.fileList.map(async (file) => {
            const state = this.fileStates.get(file.fileId);
            if (state) {
                Object.assign(file, state.data);
                if (file.status === 'paused') {
                    await this.startDownload(file.fileId, file);
                }
            }
        }));
    }

    async downloadFiles({ maxConcurrent }) {
        const queue = this.fileList.filter(f =>
            ['pending', 'paused'].includes(f.status)
        );

        const workers = Array(Math.min(maxConcurrent, queue.length))
            .fill(null)
            .map(() => this.processQueue(queue));

        await Promise.all(workers);
    }

    async processQueue(queue) {
        while (queue.length > 0) {
            const file = queue.shift();
            if (this.fileStates.get(file.fileId)?.status === 'cancelled') continue;

            await this.startDownload(file.fileId, file);
        }
    }

    async startDownload(fileId, file) {
        if (this.activeDownloads.has(fileId)) return;

        const controller = new AbortController();
        this.activeDownloads.set(fileId, controller);

        try {
            await this.updateState(fileId, { status: 'downloading' });

            const response = await fetch(file.url, {
                signal: controller.signal,
                headers: this.getRangeHeaders(file)
            });

            await this.processResponse(response, file);
            await this.updateState(fileId, { status: 'completed' });
            this.sendFileComplete(file);
        } catch (error) {
            if (error.name === 'AbortError') {
                await this.updateState(fileId, { status: 'paused' });
            } else {
                await this.updateState(fileId, { status: 'failed', error: error.message });
            }
        } finally {
            this.activeDownloads.delete(fileId);
        }
    }

    getRangeHeaders(file) {
        return file.downloaded > 0 ?
            { 'Range': `bytes=${file.downloaded}-` } :
            {};
    }

    async processResponse(response, file) {
        if (!response.ok && response.status !== 206) {
            throw new Error(`HTTP ${response.status}`);
        }

        file.totalSize = parseInt(response.headers.get('Content-Length')) + file.downloaded;
        const reader = response.body.getReader();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            file.downloaded += value.length;
            file.blob = this.mergeChunks(file.blob, value);

            const progress = (file.downloaded / file.totalSize) * 100;
            await this.updateState(file.fileId, { progress });

            self.postMessage({
                type: 'file-progress',
                fileId: file.fileId,
                progress: Math.round(progress),
                downloaded: file.downloaded,
                total: file.totalSize
            });
        }
    }

    mergeChunks(existing, chunk) {
        return existing ?
            new Blob([existing, chunk], { type: existing.type }) :
            new Blob([chunk]);
    }

    sendFileComplete(file) {
        self.postMessage({
            type: 'file-complete',
            fileId: file.fileId,
            blob: file.blob,
            filename: file.filename
        });
    }

    getCompletedFiles() {
        return this.fileList
            .filter(f => f.status === 'completed')
            .map(f => ({
                fileId: f.fileId,
                blob: f.blob,
                filename: f.filename
            }));
    }
}

// 消息处理器
let currentSession = null;

self.onmessage = async (e) => {
    const {type, data} = e.data;

    switch (type) {
        case 'start':
            currentSession = {
                id: data.sessionId,
                controller: data.downloadType === DOWNLOAD_TYPE.ZIP ?
                    new ControlledZipDownloader(data.sessionId, data.files) :
                    new ControlledSingleDownloader(data.sessionId, data.files)
            };

            try {
                const result = await currentSession.controller.process(data.options);
                self.postMessage({
                    type: 'done',
                    sessionId: data.sessionId,
                    result
                });
            } catch (error) {
                self.postMessage({
                    type: 'error',
                    sessionId: data.sessionId,
                    error: error.message
                });
            }
            break;

        case 'pause-file':
            await currentSession?.controller.pauseFile(data.fileId);
            self.postMessage({
                type: 'paused',
                sessionId: currentSession.id,
                fileId: data.fileId
            });
            break;

        case 'resume-file':
            await currentSession?.controller.resumeFile(data.fileId);
            self.postMessage({
                type: 'resumed',
                sessionId: currentSession.id,
                fileId: data.fileId
            });
            break;

        case 'cancel-file':
            await currentSession?.controller.cancelFile(data.fileId);
            self.postMessage({
                type: 'cancelled',
                sessionId: currentSession.id,
                fileId: data.fileId
            });
            break;

        case 'cancel-all':
            currentSession?.controller.cancelAll();
            self.postMessage({
                type: 'cancelled-all',
                sessionId: currentSession.id
            });
            break;
    }
};

// 工具函数
function generateFileId(url) {
    return btoa(url).replace(/=/g, '');
}

const DOWNLOAD_TYPE = {
    ZIP: 0,
    SINGLE: 1
};
