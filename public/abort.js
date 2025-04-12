// ================== 新增核心功能模块 ==================
class DownloadController {
    constructor() {
        this.activeDownloads = new Map(); // { fileId: { controller, progress } }
        this.fileStates = new Map();     // { fileId: 'downloading' | 'paused' | 'cancelled' }
        this.stateDB = new StateManager(); // 自定义状态管理（IndexedDB实现）
    }

    // 文件级操作
    async pauseFile(fileId) {
        if (this.activeDownloads.has(fileId)) {
            const { controller } = this.activeDownloads.get(fileId);
            controller.abort();
            this.fileStates.set(fileId, 'paused');
            await this.stateDB.save(fileId, { status: 'paused' });
        }
    }

    async resumeFile(fileId) {
        const state = await this.stateDB.get(fileId);
        if (state && state.status === 'paused') {
            this.fileStates.set(fileId, 'downloading');
            this.restartDownload(fileId, state);
        }
    }

    cancelFile(fileId) {
        if (this.activeDownloads.has(fileId)) {
            const { controller } = this.activeDownloads.get(fileId);
            controller.abort();
            this.fileStates.delete(fileId);
            this.activeDownloads.delete(fileId);
            this.stateDB.delete(fileId);
        }
    }

    // 批量操作
    pauseAll() {
        this.activeDownloads.forEach((_, fileId) => this.pauseFile(fileId));
    }

    cancelAll() {
        this.activeDownloads.forEach((_, fileId) => this.cancelFile(fileId));
    }
}

// ================== Zip下载器改进 ==================
class ControlledZipDownloader extends DownloadController {
    constructor(files) {
        super();
        this.zip = new JSZip();
        this.fileList = files.map(file => ({
            ...file,
            blob: null,
            downloaded: 0,
            total: 0,
            status: 'pending'
        }));
    }

    async process(options) {
        await this.restoreStates(); // 从DB恢复状态
        await this.downloadFiles(options);
        return this.generateFilteredZip(options.zipName);
    }

    async downloadFiles({ maxConcurrent }) {
        const pendingFiles = this.fileList.filter(f =>
            f.status === 'pending' || f.status === 'paused'
        );

        const queue = [...pendingFiles];
        const workers = Array(Math.min(maxConcurrent, queue.length))
            .fill().map(() => this.createWorker(queue));

        await Promise.all(workers);
    }

    async createWorker(queue) {
        while (queue.length > 0) {
            const file = queue.shift();
            if (this.fileStates.get(file.id) === 'cancelled') continue;

            await this.downloadFile(file);
        }
    }

    async downloadFile(file) {
        const controller = new AbortController();
        this.activeDownloads.set(file.id, { controller });

        try {
            const response = await fetch(file.url, {
                signal: controller.signal,
                headers: this.getRangeHeader(file)
            });

            await this.processStream(response, file);
            file.status = 'completed';
        } catch (error) {
            file.status = error.name === 'AbortError' ? 'paused' : 'failed';
        } finally {
            this.activeDownloads.delete(file.id);
            await this.stateDB.save(file.id, file);
        }
    }

    async processStream(response, file) {
        const reader = response.body.getReader();
        file.total = parseInt(response.headers.get('Content-Length')) + file.downloaded;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            file.downloaded += value.length;
            file.blob = this.mergeChunks(file.blob, value);

            self.postMessage({
                type: 'file-progress',
                fileId: file.id,
                progress: (file.downloaded / file.total) * 100
            });

            await this.stateDB.save(file.id, file);
        }
    }

    mergeChunks(existing, newChunk) {
        return existing ?
            new Blob([existing, newChunk], { type: existing.type }) :
            new Blob([newChunk]);
    }

    async generateFilteredZip(zipName) {
        const validFiles = this.fileList.filter(f =>
            f.status === 'completed' && !this.fileStates.get(f.id)
        );

        validFiles.forEach(file => {
            this.zip.file(file.path, file.blob);
        });

        return this.zip.generateAsync({ type: 'blob' });
    }
}

// ================== 单文件下载器改进 ==================
class ControlledSingleDownloader extends DownloadController {
    // 实现类似Zip下载器的控制逻辑，区别在于直接发送文件而非打包
}

// ================== 状态管理器 ==================
class StateManager {
    constructor() {
        this.dbPromise = this.initDB();
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('DownloadStates', 1);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('states')) {
                    db.createObjectStore('states', { keyPath: 'id' });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = reject;
        });
    }

    async save(id, state) {
        const db = await this.dbPromise;
        const tx = db.transaction('states', 'readwrite');
        tx.objectStore('states').put({ id, ...state });
        return tx.done;
    }

    async get(id) {
        const db = await this.dbPromise;
        const tx = db.transaction('states', 'readonly');
        return tx.objectStore('states').get(id);
    }

    async delete(id) {
        const db = await this.dbPromise;
        const tx = db.transaction('states', 'readwrite');
        tx.objectStore('states').delete(id);
        return tx.done;
    }
}

// ================== 消息处理改进 ==================
let currentController = null;

self.onmessage = async (e) => {
    const { type, data } = e.data;

    switch(type) {
        case 'start':
            currentController = createController(data);
            currentController.process(data.options);
            break;

        case 'pause-file':
            await currentController?.pauseFile(data.fileId);
            break;

        case 'resume-file':
            await currentController?.resumeFile(data.fileId);
            break;

        case 'cancel-file':
            currentController?.cancelFile(data.fileId);
            break;

        case 'pause-all':
            currentController?.pauseAll();
            break;

        case 'cancel-all':
            currentController?.cancelAll();
            break;
    }
};
