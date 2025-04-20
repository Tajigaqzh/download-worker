"use strict";

importScripts('download-utils.worker.js');
importScripts('./lib/jszip.min.js');

/**
 * 文件下载器
 * @description
 * @author
 * @date
 */
(function () {
    /**
     * 下载基础类,负责数据库管理以及公共方法封装
     * 使用时只有两个子类的实例且为懒加载（没有对应类型的任务不新建实例）
     * 两个实例共用一个数据库连接实例 #dbInstance
     */

    class BaseDownloaderController {
        // 数据库实例
        #dbInstance = null;
        // 配置对象
        #config = {
            // 最大并发
            maxConcurrent: 10,
            // 最大错误重试次数
            maxRetries: 3,
            waitTime: 1000,
            tableName: "",
            statusTableName: "",
        }
        // 回调函数
        #cb = null;


        // 任务队列
        tasks = [];

        // 下载任务map，用于取消下载
        activeDownloadsMap = null;


        errorTasks = [];


        /**
         * 暂停/重新下载的任务队列 (监听状态切换是每秒监听一次)，如果频繁操作就会有问题
         * 解决方案：
         * 1 . 外面设置防抖，降低用户触发的频率
         * 2. 内部将收到的暂停事件和继续下载事件根据taskId放到一个队列里面,
         * 如果相同时间间隔内有正在执行的事件，任务等待
         *      key:taskId
         *      value:[pauseEvent,pauseEvent,resumeEvent,pauseEvent];
         */
        pausedTasks = null;


        constructor(dbInstance, callback, config) {
            this.#dbInstance = dbInstance;
            if (callback) {
                this.#cb = callback;
            }
            if (config) {
                console.log(config, "配置")
                this.#config = {
                    ...this.#config,
                    ...config
                };
            }
            this.activeDownloadsMap = new Map();
            this.pausedTasks = new Map();
        }

        // ********************************************缓存逻辑********************************************************//

        /**
         * 批量添加到缓存中
         * @returns {Promise<void>}
         * @param taskList
         */
        async addDBCache(taskList) {
            if (this.#dbInstance && this.#config.tableName && taskList) {
                console.log(taskList);
                console.log("我被调用了")

                if (taskList) {
                    taskList.forEach(item => {
                        item.taskTimeStamp = new Date().getTime();
                    });
                    await this.#dbInstance.putAll(this.#config.tableName, taskList);
                }


            }
            if (this.#dbInstance && this.#config.statusTableName && taskList) {                // const statusList = [];
                const statusList = taskList.map((task) => {
                    return {
                        taskId: task.taskId,
                        status: task.status
                    }
                });
                // 添加状态
                await this.#dbInstance.putAll(this.#config.statusTableName, statusList);
            }
            return Promise.resolve(null);
            // todo 统一处理错误回调
        }

        /**
         * 删除缓存
         * @param taskId
         * @returns {Promise<void>}
         */
        async removeDBCache(taskId) {

        }

        /**
         * 单个修改缓存
         * @param data 任务
         * @param options 是否同步改变  状态表的状态
         * @returns {Promise<void>}
         */
        async changeDBCache(data, options = {
            changeStatus: false
        }) {
            if (this.#dbInstance && this.#config.tableName) {
                const taskIdRes = await this.#dbInstance.put(this.#config.tableName, data);
                if (taskIdRes) {
                    if (options.changeStatus) {
                        const changeRes = await this.changeCacheStatus(data.taskId, data.status);
                        if (changeRes) {
                            return Promise.resolve(changeRes);
                        } else {
                            return Promise.reject(null);
                        }
                    }
                    // 不同步改变状态库的缓存
                    return Promise.resolve(taskIdRes);
                }
                // todo 错误
                return Promise.resolve(null);
            }
            return Promise.resolve(null);
        }


        /**
         * 单独操作状态表的状态
         * @param taskId
         * @param status
         * @returns {Promise<Awaited<*>>}
         */
        async changeCacheStatus(taskId, status) {
            if (this.#dbInstance && this.#config.statusTableName) {
                const taskIdRes = await this.#dbInstance.put(this.#config.statusTableName, {
                    taskId,
                    status
                });
                if (taskIdRes) {
                    return Promise.resolve(taskIdRes);
                }
                return Promise.resolve(null);
            }
            return Promise.resolve(null);
        }

        /**
         * 根据任务id查询单个缓存
         * @param taskId
         * @returns {Promise<void>}
         */
        async getDBCacheByTaskId(taskId) {
            if (this.#dbInstance && this.#config.tableName) {
                const taskItem = await this.#dbInstance.get(this.#config.tableName, taskId);
                if (taskItem) {
                    return Promise.resolve(taskItem);
                }
                // todo 错误
                return Promise.resolve(null);

            }
            return Promise.resolve(null);
        }


        async getDBCacheStatusByTaskId(taskId) {
            if (this.#dbInstance && this.#config.statusTableName) {
                const taskItem = await this.#dbInstance.get(this.#config.statusTableName, taskId);
                if (taskItem) {
                    return Promise.resolve(taskItem);
                }
                // todo 错误
                return Promise.resolve(null);

            }
            return Promise.resolve(null);
        }

        /**
         * 根据批次id查询多个缓存
         * @param batchId
         * @param userId
         * @returns {Promise<void>}
         */
        async getDBCacheByBatchId(batchId, userId) {

        }

        /**
         * 根据用户id查询多个缓存
         * @returns {Promise<void>}
         */
        async getDBCacheByUserId() {

        }

        // ******************************************任务执行逻辑********************************************************//
        /**
         * 错误重试等待间隔
         * @param time
         * @returns {Promise<unknown>}
         */
        async wait(time = 0) {
            const waitTime = time ? time : this.#config.waitTime ? this.#config.waitTime : 1000;
            return new Promise(resolve => setTimeout(resolve, waitTime));
        }


        /**
         * 获取系统配置
         * @returns {{maxRetries: number, maxConcurrent: number, waitTime: number, tableName: string}}
         */
        getConfig() {
            return this.#config;
        }


        /**
         * 暂停任务 已经实现
         * 内部执行的时候暂停任务的信号也要去掉，重新下载的时候重新添加task
         * @returns {Promise<void>}
         */
        async pauseTask(taskId) {
            // 有任务
            if (this.activeDownloadsMap.has(taskId)) {
                console.log("有任务")

                const cacheTaskId = await this.getDBCacheByTaskId(taskId);
                if (cacheTaskId) {
                    // todo 暂停下载
                    await this.changeCacheStatus(taskId, DOWNLOAD_STATUS.PAUSE_DOWNLOAD);
                }
            } else {
                console.log("当前下载的任务没有")
            }
        }


        /**
         * 批量暂停
         * @returns {Promise<void>}
         * @param taskIds
         */
        async batchPauseTask(taskIds = []) {
            for (let index = 0; index < taskIds.length; index++) {
                // await this.pauseTask(taskIds[index]);
            }
        }


        /**
         * 重新开启任务
         * @returns {Promise<void>}
         */
        async resumeTask(taskId) {

            const resumeTask = await this.getDBCacheByTaskId(taskId);
            if (resumeTask) {
                resumeTask.status = DOWNLOAD_STATUS.RESUME_DOWNLOAD;

                await this.changeDBCache(resumeTask, {
                    changeStatus: true
                })


                // 当前有等待下载的的任务
                if (this.tasks.length > 0) {
                    // 创建一个任务
                    // 直接放入

                    this.tasks.push(resumeTask);
                } else {
                    // 创建一个任务，newPromise

                    const config = this.getConfig();
                    // }

                    /**
                     * 单个任务执行函数
                     */
                    const taskFn = async () => {
                        const res = await this.downloadWithRetry(resumeTask, config);
                    }
                    const workers = Array(1)
                        .fill(null)
                        .map(() => taskFn());

                    await Promise.all(workers);

                }
            }
        }

        /**
         * 批量重新开始任务
         * @param taskIds
         * @returns {Promise<void>}
         */
        async batchResumeTask(taskIds = []) {

        }

        /**
         * 清空还未开始执行的任务
         * @returns {Promise<void>}
         */
        async cleatPendingTasks() {
            this.tasks = [];
            // todo 删除数据库

        }

        /**
         * 取消任务
         * @param taskId
         * @returns {Promise<void>}
         */
        async cancelTask(taskId) {
            if (this.activeDownloadsMap.has(taskId)) {
                const controller = this.activeDownloadsMap.get(taskId);
                controller?.abort();
                this.activeDownloadsMap.delete(taskId);
                // todo 删除数据库缓存
                // this.callback()
                // todo,发送取消前的进度
            }

        }

        /**
         * 批量取消任务
         * @param taskIds
         * @returns {Promise<void>}
         */
        async batchCancelTask(taskIds = []) {

        }


        // ********************************************下载逻辑********************************************************//

        /**
         * 自动重试的下载
         * @returns {Promise<void>}
         */
        async downloadWithRetry(taskItem, config) {
            // 当前重试次数
            let retryCount = 0;

            // 添加可取消的下载器
            const abortController = new AbortController();
            console.log(this.activeDownloadsMap)

            this.activeDownloadsMap.set(taskItem.taskId, abortController);

            const {maxRetries, waitTime} = config;

            let isCurrentSuccess = false;

            // 状态改变引起的暂停下载，取消下载
            let statusChange = false;

            let reason = null;

            let currentCacheData;

            while (retryCount < maxRetries && !isCurrentSuccess && !statusChange) {

                try {
                    currentCacheData = await this.getDBCacheByTaskId(taskItem.taskId);
                    // 缓存中有数据
                    if (currentCacheData) {


                        // 拿数据库中的，状态准确
                        const downloadRes = await this.downloadFile(currentCacheData);

                        // 成功逻辑
                        isCurrentSuccess = true;
                        this.activeDownloadsMap.delete(taskItem.taskId);

                    } else {
                        reason = "没有缓存"
                        this.activeDownloadsMap.delete(taskItem.taskId);
                        statusChange = true;

                    }


                } catch (e) {
                    console.log("错误", e)
                    if (retryCount > maxRetries) {
                        // 更新cache中的错误状态，删除cache
                        this.activeDownloadsMap.delete(taskItem.taskId);
                        // 直接失败
                        currentCacheData.status = DOWNLOAD_STATUS.FAIL_DOWNLOAD;
                        // await this.changeDBCache(currentCacheData);
                        // todo 错误处理，删除缓存
                        return Promise.resolve(currentCacheData);
                    }

                    currentCacheData.status = DOWNLOAD_STATUS.FAIL_DOWNLOAD_RETRY;

                    // todo 错误处理，下面的缓存用不用解开
                    // todo，更新cache中的错误状态
                    const currentWaitTime = taskItem.waitTime ?? waitTime;

                    // 重置上一次失败下载的进度和二进制文件状态
                    // todo 错误捕获
                    await this.changeDBCache(currentCacheData);

                    // progress: Math.round(progress),
                    //     downloaded: fileItem.downloaded,
                    //     total
                    await this.wait(currentWaitTime);
                    retryCount++;

                }
            }


        }

        /**
         * 前置处理   校验URL以及下载状态，更改缓存状态
         * todo 错误要通过消息返回给顶层
         * @returns {Promise<void>}
         */
        async beforeDownload(currentTask) {
            if (currentTask.taskId) {

                if (!isValidUrl(currentTask.url)) {
                    this.callback({
                        type: "error",
                        message: "URL不合法"
                    })
                    return Promise.resolve(null);
                }

                // 更新下载状态
                currentTask.status = DOWNLOAD_STATUS.DOWNLOADING;
                // 开始任务的时间戳
                currentTask.startTimestamp = new Date().getTime();

                try {
                    const updateRes = await this.changeDBCache(currentTask, {
                        changeStatus: true
                    });

                    if (updateRes) {
                        // 正常返回
                        return Promise.resolve(currentTask);
                    }

                    this.callback({
                        type: "error",
                        message: "数据库更新失败"
                    })
                    return Promise.resolve(null);
                } catch (e) {
                    this.callback({
                        type: "error",
                        message: "数据库更新失败"
                    })
                    return Promise.resolve(null)
                }
            } else {
                this.callback({
                    type: "error",
                    message: "参数错误"
                })
                return Promise.resolve(null);
            }

        }


        /**
         * 后置处理 清除缓存
         * @returns {Promise<void>}
         */
        async afterDownload() {

        }


        async processCancelTask() {

        }

        /**
         * todo 这个方法的错误要捕获并抛给父级
         * @param response
         * @param fileItem
         * @param isResume 是否是续传的（是续传的，计算的进度要区分出来）
         * @returns {Promise<void>}
         */

        async processResponsePlus(response, fileItem, isResume = false) {
            if (!response.ok && response.status !== 206) {
                // Range: bytes = 500 -
                // 从500处下载


                console.log("错误")
                return Promise.reject();
                // throw new Error(`HTTP ${response.status}`);
            }

            let totalSize = parseInt(response.headers.get('Content-Length'));
            const contentType = response.headers.get('Content-Type') || 'application/octet-stream';

            // 初始化缓存数据（从数据库加载）
            let cacheData = await this.getDBCacheByTaskId(fileItem.taskId);

            if (isResume && cacheData.totalSize) {
                totalSize = cacheData.totalSize;
            }


            cacheData = {
                ...cacheData,
                totalSize,
                downloaded: cacheData?.downloaded || 0,
                chunks: cacheData?.chunks || [], // 始终使用数组存储chunks
                progress: cacheData?.progress || 0,
            };


            const reader = response.body.getReader();
            let lastSaveTime = Date.now();
            let lastStatusCheckTime = Date.now();
            let isFinalSave = false;


            try {
                while (true) {
                    // 状态检查（每秒1次）
                    if (Date.now() - lastStatusCheckTime >= 1000) {
                        const {status} = await this.getDBCacheStatusByTaskId(fileItem.taskId);

                        console.log("当前状态", status);
                        if (status === DOWNLOAD_STATUS.PAUSE_DOWNLOAD) { // 暂停

                            await reader.cancel();
                            // console.log("")
                            cacheData.status = DOWNLOAD_STATUS.PAUSE_DOWNLOAD;
                            // 当前的就不要了
                            console.log(cacheData, "暂停下载");


                            await this.saveToCache(cacheData);


                            // 删除下载
                            this.activeDownloadsMap.delete(cacheData.taskId);

                            console.log("下载已暂停");
                            return null;
                        }

                        if (status === DOWNLOAD_STATUS.RESUME_DOWNLOAD) {
                            // 重启的任务这次重新下载，把它的下载状态再改为下载中
                            cacheData.status = DOWNLOAD_STATUS.DOWNLOADING;
                            await this.changeDBCache(cacheData, {
                                changeStatus: true
                            })
                            cacheData.chunks = [];

                            // throw new Error('RESTART_DOWNLOAD');
                        }

                        lastStatusCheckTime = Date.now();
                    }

                    // 读取数据块
                    const {done, value} = await reader.read();
                    if (done) break;

                    // 更新下载状态
                    cacheData.downloaded += value.length;
                    cacheData.chunks.push(value); // 直接存储ArrayBuffer
                    cacheData.progress = totalSize ?
                        Math.min(99, Math.round((cacheData.downloaded / totalSize) * 100)) : 0;

                    // 触发进度回调
                    this.callback({
                        type: 'file-progress',
                        fileId: fileItem.taskId,
                        progress: cacheData.progress,
                        downloaded: cacheData.downloaded,
                        total: totalSize
                    });

                    // 定时保存（每5秒或每2MB）
                    if (Date.now() - lastSaveTime >= 5000 || cacheData.chunks.length > 200) {
                        await this.saveToCache(cacheData);
                        lastSaveTime = Date.now();
                    }
                }

                // 最终保存
                isFinalSave = true;
                cacheData.progress = 100;
                cacheData.status = DOWNLOAD_STATUS.COMPLETE_DOWNLOAD;
                // cacheData.status = 2; // 标记完成
                cacheData.endTimestamp = Date.now();
                await this.saveToCache(cacheData);

            } catch (error) {
                if (error.message === 'RESTART_DOWNLOAD') throw error;
                console.error("下载出错:", error);
                throw error;
            }

            const result = await this.mergeChunks(cacheData, contentType, true);
            console.log(result);
        }

        /**
         * 将当前的数据和缓存中的数据合并
         * @param cacheData
         * @param contentType
         * @param isCache
         * @returns {Promise<Blob|null>}
         */
        async mergeChunks(cacheData, contentType, isCache = false) {
            const cacheRes = await this.getDBCacheByTaskId(cacheData.taskId);
            if (!cacheRes) {
                return null;
            }
            // 缓存的放到前面，新加的放到后面
            const mergeChunks = [...(cacheRes.chunks || []), ...cacheData.chunks];
            const blob = new Blob(mergeChunks, {type: contentType});
            cacheData.chunks = [];
            cacheData.blob = blob;
            if (isCache) {
                await this.changeDBCache(cacheData, {
                    changeStatus: true
                });
            }
            return cacheData;

        }

        // 专用保存方法
        async saveToCache(cacheData) {
            const dbData = await this.getDBCacheByTaskId(cacheData.taskId) || {};

            // 2. 数据合并策略
            const mergedData = {
                ...dbData,                  // 保留数据库原有字段
                ...cacheData,               // 覆盖为最新进度
                // 合并chunks
                chunks: [
                    ...(dbData.chunks || []),
                    ...cacheData.chunks
                ],

                // 清空临时blob（只在最终完成时生成）
                blob: null,
                lastUpdated: Date.now()
            };

            console.log(mergedData, "合并的")

            // 保存到数据库
            await this.changeDBCache(mergedData);

            //更新本地引用（清空已保存的chunks）
            cacheData.chunks = [];
        }

        /**
         * 下载之前需要向activeDownloadsMap添加激活任务，以便取消
         * 下载文件，支持断点续传
         * Range: bytes = 500 -
         * @returns {Promise<void>}
         */
        async downloadFile(taskItem) {
            console.log("开始前")
            try {
                if (this.activeDownloadsMap.has(taskItem.taskId)) {
                    const controller = this.activeDownloadsMap.get(taskItem.taskId);
                    let response;
                    const isResume = taskItem.status === DOWNLOAD_STATUS.RESUME_DOWNLOAD
                    if (isResume) {
                        let rangeStr = "";
                        if (taskItem.downloaded > 0) {
                            rangeStr = `bytes = ${taskItem.downloaded + 1} -`
                        }
                        response = await fetch(taskItem.url, {
                            signal: controller.signal,
                            headers: {
                                "Range": rangeStr
                            }
                        });
                    } else {
                        response = await fetch(taskItem.url, {
                            signal: controller.signal,
                        })
                    }


                    if (response) {
                        const resData = await this.processResponsePlus(response, taskItem, isResume);
                        console.log(resData)
                    }
                } else {
                    console.log("没有任务")
                }
                // throw new Error("no task");
            } catch (error) {
                console.log(error)

            } finally {

            }
        }


        // ********************************************回调逻辑********************************************************//
        /**
         * 统一回调
         * @param message
         */
        callback(message) {
            if (this.#cb) {
                this.#cb(message);
            }
        }

    }

    /**
     * 文件列表下载类，单例模式且为懒加载
     */
    class ListDownLoaderController extends BaseDownloaderController {
        constructor(dbInstance, cb, config) {
            super(dbInstance, cb, config);
        }

        /**
         * 实现类
         * @param data
         * @returns {Promise<void>}
         */
        async process(data, processConfig = {
            isResume: false
        }) {

            // 先不考虑调用process的问题
            // if (processConfig.isResume) {
            //     // data，todo 在外面添加任务
            // } else {
            await this.addDBCache(data.taskList);
            this.tasks.push(...data.taskList);
            const config = this.getConfig();
            // }


            /**
             * 单个任务执行函数
             */
            const taskFn = async () => {
                while (this.tasks.length > 0) {
                    // 取出一个任务
                    const currentTask = this.tasks.shift();

                    let validTask;
                    if (currentTask.status === DOWNLOAD_STATUS.PENDING) {
                        validTask = await this.beforeDownload(currentTask);
                        //重启下载
                    } else if (currentTask.status === DOWNLOAD_STATUS.RESUME_DOWNLOAD) {
                        // todo 重启下载记得新任务中的chunks重置
                        validTask = currentTask;

                    }
                    // 前置处理


                    if (validTask) {
                        // 合法的任务
                        const res = await this.downloadWithRetry(validTask, config);
                    } else {
                        // todo 不合法的下载链接
                        // this.callback({})
                    }
                }
            }

            const workers = Array(Math.min(config.maxConcurrent, this.tasks.length))
                .fill(null)
                .map(() => taskFn());

            await Promise.all(workers);
        }


    }


    /**
     * zip下载类，单例模式且为懒加载,比文件列表下载类多一个压缩的操作，压缩也要能暂停和取消
     */
    class ZipDownLoaderController extends BaseDownloaderController {
        // todo 记录当前zip有多少文件，单独的压缩方法

        /**
         * 根据batchId保存taskId数组以及完成情况
         * {
         *      key :batchId,
         *      value:[ {
         *          taskId:string,
         *          status: 0处理中， 1完成  2失败
         *          message:错误/成功信息
         *      }],
         *      isComplete:false
         * }
         * */

        zipTask = new Map();


        constructor(dbInstance, cb, config) {
            super(dbInstance, cb, config);
        }

        /**
         * 执行处理函数
         * 1. 添加缓存
         * 2. 加入任务队列
         * 3. 生成单个任务执行函数
         * 4. 执行任务
         * 5. 错误处理/任务重试
         * @param data
         * @returns {Promise<void>}
         */
        async process(data) {
            console.log(this.tasks, "zip任务队列")
            if (!data.taskList || data.taskList.length === 0) {
                return
            }


            this.addZipTask(data.taskList);

            await this.addDBCache(data.taskList);


            this.tasks.push(...data.taskList);
            const config = this.getConfig();

            /**
             * 单个任务执行函数
             */
            const taskFn = async () => {

                while (this.tasks.length > 0) {
                    // 取出一个任务
                    const currentTask = this.tasks.shift();

                }
            }


            // const workers = Array(Math.min(this.#config., this.tasks.length))
            //     .fill(null)
            //     .map(() => worker());

        }


        addZipTask(taskList) {
            const batchId = taskList[0];
            const tasks = [];
            /**

             taskId:string,
             status: 0处理中， 1完成  2失败
             message:错误/成功信息
             */
            taskList.forEach((item) => {

                tasks.push({
                    taskId: item.taskId,
                    status: 0,
                    message: "",
                });
            });
            this.zipTask.set(batchId, {
                tasks,
                userId: taskList[0].userId,
                isComplete: false
            })
        }

        /**
         * 改变当前任务的完成状态，如果是批次的最后一个。调用压缩方法
         * @param batchId
         * @param taskId
         * @param status  0处理中， 1完成  2失败
         * @param message 任务信息
         */
        changeCurrentTaskStatus(batchId, taskId, status, message) {
            const currentBatchTask = this.zipTask.get(batchId);
            if (currentBatchTask) {
                const taskItemIndex = currentBatchTask.tasks.findIndex(item => {
                    return item.taskId === taskId
                });
                if (taskItemIndex !== -1) {
                    const oldItem = currentBatchTask.tasks[taskItemIndex];
                    currentBatchTask.tasks.splice(taskItemIndex, 1, {
                        ...oldItem,
                        status: status
                    });
                    const isComplete = currentBatchTask.isisComplete = currentBatchTask.tasks.filter((item) => {
                        return item.status !== 0;
                    }).length === currentBatchTask.tasks.length;
                    this.zipTask.set(batchId, currentBatchTask);

                    if (isComplete) {
                        const compressRes = this.compress(batchId, currentBatchTask.userId);
                    }
                }
            }
        }

        async compress(batchId, userId) {
            // const await
            await this.getDBCacheByBatchId(batchId, userId);


        }
    }

    self.ListDownLoaderController = ListDownLoaderController;
    self.ZipDownLoaderController = ZipDownLoaderController;
})()
