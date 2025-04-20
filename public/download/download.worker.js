"use strict";

importScripts('./IndexDB.worker.js');
importScripts('./downloader.worker.js');
importScripts('./download-utils.worker.js');


// 用闭包防止污染
(function() {
    // 数据库是否初始化
    let isInitDB = false;

    // 数据库实例，new的时候还未初始化，第一次收到下载任务才会创建连接
    const dbInstance = new SingletonDBInstance({
        dbName: "classPlatWebDB"
    });

    // 下载器为单例模式，懒加载，共用一个数据库实例，避免频繁创建销毁对象
    let listDownLoaderInstance = null;
    let zipDownLoaderInstance = null;

    /**
     * 1. 初始化数据库和表
     * @returns {Promise<void>}
     */
    async function initDBAndTable() {
        try {
            // 创建/连接数据库
            if (!dbInstance.isExistDB()) {
                await dbInstance.initialize();
            }

            // 创建表
            if (!dbInstance.isExistTable("uploadTask")) {
                console.log("有表吗")
                await dbInstance.addStore({
                    name: "uploadTask",
                    options: {
                        keyPath: "taskId",
                    },
                    indexes: [
                        {
                            name: "taskIdIndex",
                            keyPath: "taskId",
                            options: {
                                unique: true
                            }
                        },
                    ]
                })

            }


            /**
             * 单独计一个任务状态的表，不然下载文件大的话，频繁读写带blob缓存的数据消耗大
             */
            if (!dbInstance.isExistTable("taskStatus")) {
                await dbInstance.addStore({
                    name: "taskStatus",
                    options: {
                        keyPath: "taskId",
                    },
                    indexes: [
                        {
                            name: "taskIdIndex",
                            keyPath: "taskId",
                            options: {
                                unique: true
                            }
                        },
                    ]
                })
            }
            isInitDB = true;

        } catch (e) {
            self.postMessage({
                type: 'db-error',
                message: "初始化数据库表失败"
            })
            isInitDB = false;
        }
    }


    const downloadCallback = (message) => {
        // console.log("回调", message)

    }

    /**
     * 初始化下载器并处理下载任务debugger
     * @param data
     * @returns {Promise<void>}
     */
    async function initDownLoaderInstanceAndProcessTask(data) {

        /**
         * 公用的下载器配置 {maxRetries：最大错误重试次数，maxConcurrent：最大并发，tableName：数据库表名}
         * @type {{maxRetries: number, maxConcurrent: number, tableName: string}}
         */
        const loaderConfig = {
            maxConcurrent: 10,
            maxRetries: 3,
            tableName: "uploadTask",
            statusTableName: "taskStatus"
        }


        if (isInitDB) {
            switch (data.downloadType) {
                case DOWNLOAD_TYPE_WORKER.FILE_LIST: {
                    if (!listDownLoaderInstance) {
                        listDownLoaderInstance = new ListDownLoaderController(dbInstance, downloadCallback, loaderConfig);
                    }
                    // 执行list下载任务
                    await listDownLoaderInstance.process(data)
                    break;
                }
                case DOWNLOAD_TYPE_WORKER.ZIP: {
                    if (!zipDownLoaderInstance) {
                        zipDownLoaderInstance = new ZipDownLoaderController(dbInstance, downloadCallback, loaderConfig);
                    }
                    // 执行zip下载任务
                    await zipDownLoaderInstance.process(data);
                    break;
                }
            }

        } else {
            // todo
            console.log("不支持缓存的下载")
        }

    }


    /**
     * 暂停下载
     * @returns {Promise<void>}
     */
    async function pauseProcessTask(data) {
        if (isInitDB) {
            switch (data.downloadType) {
                case DOWNLOAD_TYPE_WORKER.FILE_LIST: {
                    console.log("收到指令",data);
                    await listDownLoaderInstance.pauseTask(data.taskId);
                    break;
                }
            }
        }

    }

    /**
     * 批量暂停下载
     * @returns {Promise<void>}
     */
    async function batchPauseProcessTask(data) {

    }

    /**
     * 继续下载
     * @returns {Promise<void>}
     */
    async function resumeProcessTask(data) {

    }

    /**
     * 批量继续下载
     * @returns {Promise<void>}
     */
    async function batchResumeProcessTask(data) {

    }


    /**
     * 取消下载
     * @returns {Promise<void>}
     */
    async function cancelProcessTask(data) {

    }


    /**
     * 批量取消下载
     * @returns {Promise<void>}
     */
    async function batchCancelProcessTask(data) {

    }

    self.onmessage = async (event) => {
        // 1. 判断是否数据库和表被初始化了，如果没有初始化，执行初始化逻辑
        await initDBAndTable();
        if (event.data.type === "startDownload") {
            console.log("初始化")
            // await initDownLoaderInstanceAndProcessTask(event.data);
        }

        const {type} = event.data;

        switch (type) {
            case 'start':
                await initDownLoaderInstanceAndProcessTask(event.data);
                break;

            case 'pause-file':
                await pauseProcessTask(event.data);
                break;

            case 'resume-file':
                await resumeProcessTask(event.data);
                break;

            case 'cancel-file':
                await cancelProcessTask(event.data)
                break;

            case 'pause-all':
                await pauseProcessTask(event.data);
                break;

            case 'cancel-all':
                await batchCancelProcessTask(event.data);
                // currentController?.cancelAll();
                break;
            case 'resume-all':
                await batchCancelProcessTask(event.data);
                break;

        }
    }


})()





