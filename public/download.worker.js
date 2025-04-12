"use strict";
importScripts('./lib/jszip.min.js');
importScripts("./downloadUtils.worker.js");


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
            console.log(this.#dbInstance, this.#config)
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
         * 修改缓存
         * @param data {taskId}
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

        }

        /**
         * 根据批次id查询多个缓存
         * @param batchId
         * @returns {Promise<void>}
         */
        async getDBCacheByBatchId(batchId) {

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
            this.activeDownloadsMap.put(taskItem.taskId, {
                controller: abortController
            });

            const {maxRetries, waitTime} = config;

            let isCurrentSuccess = false;

            // 状态改变引起的暂停下载，取消下载
            let statusChange = false;


            while (retryCount < maxRetries && !isCurrentSuccess && !statusChange) {
                const currentCacheData = this.getDBCacheByTaskId(taskItem.taskId);

                // 缓存中有数据
                if (currentCacheData) {

                } else {

                }
                try {

                    // 成功逻辑
                    isCurrentSuccess = true;
                } catch (e) {
                    if (retryCount > maxRetries) {
                        // 更新cache中的错误状态，删除cache
                        // todo 错误处理
                        return Promise.resolve(null);
                    }

                    // todo，更新cache中的错误状态
                    const currentWaitTime = taskItem.waitTime ?? waitTime;
                    await this.wait(currentWaitTime);

                }
                // const res = await this.downloadFile(taskItem)
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
         * 下载文件
         * @returns {Promise<void>}
         */
        async downloadFile() {

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
    }

    self.ListDownLoaderController = ListDownLoaderController;
    self.ZipDownLoaderController = ZipDownLoaderController;
})()
