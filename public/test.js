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
            .fill()
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
