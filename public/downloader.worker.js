"use strict";
importScripts('./lib/jszip.min.js');
importScripts("./download-utils.worker.js");


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
        }
        // 回调函数
        #cb = null;


        // 任务队列
        tasks = [];

        // 下载任务map，用于取消下载
        activeDownloadsMap = null;


        errorTasks = [];


        // 暂停的任务队列
        pausedTasks = [];


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
        }

        // ********************************************缓存逻辑********************************************************//

        /**
         * 批量添加到缓存中
         * @returns {Promise<void>}
         * @param taskList
         */
        async addDBCache(taskList) {
            if (this.#dbInstance && this.#config.tableName) {
                // 添加创建任务的时间戳
                taskList && taskList.forEach(item => {
                    item.taskTimeStamp = new Date().getTime();
                });
                return this.#dbInstance.putAll(this.#config.tableName, taskList);
            }
            // todo 统一处理错误回调
            return Promise.reject("添加失败");
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
         * @returns {Promise<void>}
         */
        async changeDBCache(data) {
            if (this.#dbInstance && this.#config.tableName) {
                const taskId = await this.#dbInstance.put(this.#config.tableName, data);
                if (taskId) {
                    return Promise.resolve(taskId);
                }
                // todo 错误
                return Promise.reject(null);
            }
            return Promise.reject("更新失败");


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
                return Promise.reject(null);

            }
            return Promise.reject(null);
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
         * 暂停任务
         * @returns {Promise<void>}
         */
        async pauseTask(taskId) {
            // 有任务
            if (this.activeDownloadsMap.has(taskId)) {


            }
        }

        /**
         * 批量暂停
         * @returns {Promise<void>}
         * @param taskIds
         */
        async batchPauseTask(taskIds = []) {

        }


        /**
         * 重新开启任务
         * @returns {Promise<void>}
         */
        async resumeTask(taskId) {

            this.tasks.push()

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

            console.log(this.activeDownloadsMap);
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
                    const updateRes = await this.changeDBCache(currentTask);
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

        /**
         * todo 这个方法的错误要捕获并抛给父级
         * @param response
         * @param fileItem
         * @returns {Promise<void>}
         */

        async processResponse(response, fileItem) {
            if (!response.ok && response.status !== 206) {
                console.log("错误")
                throw new Error(`HTTP ${response.status}`);
            }

            const totalSize = parseInt(response.headers.get('Content-Length'));
            const contentType = response.headers.get('Content-Type');

            // 初始化缓存数据（只读取一次）
            let cacheData = await this.getDBCacheByTaskId(fileItem.taskId);
            cacheData.totalSize = totalSize;
            cacheData.downloaded = cacheData.downloaded || 0;
            cacheData.chunks = cacheData.chunks || []; // 改用数组暂存数据块
            cacheData.progress = cacheData.progress || 0;

            const reader = response.body.getReader();
            let lastSaveTime = Date.now();
            let isFinalSave = false;

            try {
                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;

                    // 更新下载状态
                    cacheData.downloaded += value.length;
                    cacheData.chunks.push(value); // 存储数据块引用
                    cacheData.progress = totalSize ?
                        Math.round((cacheData.downloaded / totalSize) * 100) : 0;

                    // 触发进度更新
                    this.callback({
                        type: 'file-progress',
                        fileId: fileItem.taskId,
                        progress: cacheData.progress,
                        downloaded: cacheData.downloaded,
                        total: totalSize
                    });

                    // 间隔保存逻辑
                    const now = Date.now();
                    if (now - lastSaveTime >= 10000) {
                        await this.saveToCache(cacheData, contentType);
                        lastSaveTime = now;
                    }
                }

                // 最终保存（包含剩余数据）
                isFinalSave = true;
                cacheData.progress = 100;
                cacheData.endTimestamp = Date.now();
                await this.saveToCache(cacheData, contentType);
            } finally {
                // 确保最终保存（异常时也尝试保存）
                if (!isFinalSave) {
                    cacheData.endTimestamp = Date.now();
                    await this.saveToCache(cacheData, contentType);
                }
            }

            cacheData.blob = new Blob(cacheData.chunks, {type: contentType});
            cacheData.chunks = [];
            return cacheData;
        }

        // 专用保存方法
        async saveToCache(cacheData, contentType) {
            // 生成当前进度对应的Blob
            const currentBlob = new Blob(cacheData.chunks, {type: contentType});

            // 准备保存的数据副本
            const saveData = {
                ...cacheData,
                blob: currentBlob,
                chunks: [] // 清空已保存的块
            };

            // 保存到数据库
            await this.changeDBCache(saveData);

            // 保留未保存的块（确保后续继续累积）
            cacheData.chunks = [...cacheData.chunks];
        }

        /**
         * 下载文件
         * @returns {Promise<void>}
         */
        async downloadFile(taskItem) {
            console.log("开始前")
            try {
                if (this.activeDownloadsMap.has(taskItem.taskId)) {
                    const controller = this.activeDownloadsMap.get(taskItem.taskId);

                    const response = await fetch(taskItem.url, {
                        signal: controller.signal,
                    })
                    debugger;

                    if (response) {
                        const resData = await this.processResponse(response, taskItem);
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
            // 暂停。
            // let timer = setTimeout(() => {
            //
            //     console.log("成功");
            //
            //     return Promise.resolve({key: taskItem.taskId});
            //
            // }, 3000);


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
        async process(data) {
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
                    // 前置处理
                    const validTask = await this.beforeDownload(currentTask);

                    if (validTask) {
                        // 合法的任务
                        const res = await this.downloadWithRetry(validTask, config);

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
     * zip下载类，单例模式且为懒加载
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
                        this.compress(batchId, currentBatchTask.userId);
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
