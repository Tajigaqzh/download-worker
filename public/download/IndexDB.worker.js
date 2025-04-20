"use strict";
(function () {
    let maxReInitialLimitCount = 1000;

    class IndexedDBSingleton {
        static #instance = null;
        #version = 1;
        #db = null;
        #storeConfigs = [];
        #dbName = "";
        #batchMax = 100;

        constructor({
                        dbName,
                        batchMax = 100,
                        maxInitialLimitCount = 1000
                    }) {
            if (!dbName || dbName.trim().length === 0) {
                throw new Error("db name error");
            }
            if (maxReInitialLimitCount && maxInitialLimitCount > maxReInitialLimitCount) {
                maxReInitialLimitCount = maxInitialLimitCount;
            }
            if (IndexedDBSingleton.#instance) {
                return IndexedDBSingleton.#instance;
            }
            this.#dbName = dbName;
            this.#batchMax = batchMax;
            IndexedDBSingleton.#instance = this;
        }

        isExistDB = () => {
            return this.#db !== null;
        }

        isExistTable = (tableName) => {
            if (this.#db) {
                return this.#db.objectStoreNames.contains(tableName);
            }
            return false;
        }

        // 初始化
        async initialize() {
            if (!self.indexedDB) {
                throw new Error("current environment not supported IndexDB");
            }
            if (this.#db) return Promise.resolve(true);
            let reInitialed = false;

            let currentTryTimes = 0;
            const initFn = () => {
                return new Promise((resolve, _reject) => {
                    const request = self.indexedDB.open(this.#dbName, this.#version);
                    request.onupgradeneeded = (event) => {
                        const db = event.target.result;
                        this.#handleUpgrade(db, event.oldVersion);
                    };

                    request.onsuccess = (event) => {
                        this.#db = event.target.result;
                        resolve(true);
                    };

                    request.onerror = (_event) => {
                        resolve(false);
                    };
                })
            }

            while (currentTryTimes < maxReInitialLimitCount && !reInitialed) {
                const initRes = await initFn();
                currentTryTimes++;
                if (initRes) {
                    reInitialed = true;
                    return Promise.resolve(true);
                } else {
                    this.#version++;
                }
            }
            return Promise.reject("创建失败");
        }

        /**
         * 销毁数据库
         */
        destroy() {
            if (this.#db) {
                this.#db.close();
                this.#db = null;
            }
        }

        #handleUpgrade(db, _oldVersion) {
            // 删除不再需要的表
            Array.from(db.objectStoreNames).forEach((storeName) => {
                if (!this.#storeConfigs.some((c) => c.name === storeName)) {
                    db.deleteObjectStore(storeName);
                }
            });

            // 创建新表
            this.#storeConfigs.forEach((config) => {
                if (!db.objectStoreNames.contains(config.name)) {
                    this.#createStore(db, config);
                }
            });
        }

        /**
         * 创建对象存储
         */
        #createStore(db, config) {
            const store = db.createObjectStore(config.name, config.options);
            config.indexes?.forEach((index) => {
                store.createIndex(index.name, index.keyPath, index.options);
            });
        }


        /**
         * 添加新的表
         */
        async addStore(config) {
            if (this.#storeConfigs.some((c) => c.name === config.name)) {
                throw new Error(`Store ${config.name} already exists`);
            }

            this.#storeConfigs.push(config);
            this.#version++;
            await this.#reconnect();
        }

        /**
         * 删除数据库表
         */
        async deleteStore(storeName) {
            this.#storeConfigs = this.#storeConfigs.filter((c) => c.name !== storeName);
            this.#version++;
            await this.#reconnect();
        }

        /**
         * 重新连接数据库
         */
        async #reconnect() {
            this.destroy();
            await this.initialize();
        }


        /**
         * 通用事务执行方法
         */
        async #execute(
            storeName,
            mode,
            operation
        ) {
            if (!this.#db) throw new Error("Database not initialized");

            return new Promise((resolve, reject) => {
                const transaction = this.#db.transaction(storeName, mode);
                const store = transaction.objectStore(storeName);

                const request = operation(store);

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);

                transaction.oncomplete = () => {
                };
                transaction.onerror = () => reject(transaction.error);
            });
        }

        /**
         * 通用批量事务执行方法
         * @param storeName
         * @param mode
         * @param operation
         * @param batch
         * @returns {Promise<unknown>}
         */
        async #executeBatch(storeName,
                            mode,
                            operation, batch) {
            if (!this.#db) {
                throw new Error("Database not initialized");
            }
            return new Promise((resolve, reject) => {
                let successCount = 0;
                let errorOccurred = false;

                const transaction = this.#db.transaction(storeName, mode);
                const store = transaction.objectStore(storeName);

                batch && batch.forEach((item) => {
                    if (errorOccurred) return;

                    let request;
                    try {
                        // 执行具体操作（put/add/delete等）
                        request = operation(store, item);
                    } catch (error) {
                        errorOccurred = true;
                        transaction.abort();
                        reject(error);
                        return;
                    }
                    request.onsuccess = () => {
                        successCount++;
                    };

                    request.onerror = (event) => {
                        errorOccurred = true;
                        transaction.abort();
                        reject(event.target.error);
                    };

                })

                transaction.oncomplete = () => {
                    if (!errorOccurred) resolve(successCount);
                };
                transaction.onerror = () => reject(transaction.error);
            });

        }

        /**
         * 添加数据，如果主键已存在则抛出错误
         * @throws {Error}主键已存在
         * @param storeName
         * @param data
         * @returns 主键key
         */
        async add(storeName, data) {
            return this.#execute(storeName, "readwrite", (store) => {
                return store.add(data);
            });
        }

        /**
         * 批量添加数据（自动生成主键）
         * @param storeName 存储对象名称
         * @param dataList 数据列表
         * @param batchSize 分批大小（默认100）
         */
        async addAll(storeName, dataList, batchSize = this.#batchMax) {
            let total = 0;
            for (let i = 0; i < dataList.length; i += batchSize) {
                const batch = dataList.slice(i, i + batchSize);
                const count = await this.#executeBatch(
                    storeName,
                    "readwrite",
                    (store, item) => store.add(item),
                    batch
                );
                total += count;
            }
            return total;
        }

        /**
         * 根据主键获取数据
         * @param storeName
         * @param key
         */
        async get(storeName, key) {
            return this.#execute(storeName, "readonly", (store) => {
                return store.get(key);
            });
        }

        /**
         * 获取所有数据
         * @param storeName 表名
         * @param query 主键key或比较条件
         * @param count 数量
         */
        async getAll(storeName, query, count) {
            return this.#execute(storeName, "readonly", (store) => {
                return store.getAll(query, count);
            });
        }


        /**
         * @example db.getAllByIndexName("storeName", "indexName", "key", 10);
         * @example db.getAllByIndexName("storeName", "indexName", IDBKeyRange.only("1212"));
         * @param storeName 表名
         * @param indexName 索引名
         * @param query 主键key或比较条件
         * @param count 数量
         */
        async getAllByIndexName(storeName, indexName, query, count) {
            return this.#execute(storeName, "readonly", (store) => {
                const index = store.index(indexName);
                return index.getAll(query, count);
            });
        }

        /**
         * @example db.getCount("storeName");
         * 获取数据的数量
         * @param storeName
         */
        async getCount(storeName) {
            return this.#execute(storeName, "readonly", (store) => {
                return store.count();
            });
        }

        /**
         * @example db.put("storeName", { id: 1, name: "test" });
         * 添加数据，如果主键已存在则更新
         * @param storeName
         * @param data
         * @returns Promise<IDBValidKey> 返回主键key
         */
        async put(storeName, data) {
            return this.#execute(storeName, "readwrite", (store) => {
                return store.put(data);
            });
        }


        /**
         * 批量添加
         * @param storeName
         * @param dataList
         * @param batchSize
         * @returns {Promise<number>}
         */
        async putAll(storeName, dataList, batchSize = this.#batchMax) {
            let total = 0;
            for (let i = 0; i < dataList.length; i += batchSize) {
                const batch = dataList.slice(i, i + batchSize);
                const count = await this.#executeBatch(
                    storeName,
                    "readwrite",
                    (store, item) => store.put(item),
                    batch
                );
                total += count;
            }
            return total;

        }

        /**
         * @example db.delete("storeName", { id: 1, name: "test" });
         * 删除数据
         * @param storeName
         * @param key
         */
        async delete(storeName, key) {
            return this.#execute(storeName, "readwrite", (store) => {
                return store.delete(key);
            });
        }

        /**
         * 批量删除数据
         * @param storeName 存储对象名称
         * @param keys 主键列表
         * @param batchSize 分批大小（默认100）
         */
        async deleteAll(storeName, keys = [], batchSize = this.#batchMax) {
            let total = 0;
            for (let i = 0; i < keys.length; i += batchSize) {
                const batch = keys.slice(i, i + batchSize);
                const count = await this.#executeBatch(
                    storeName,
                    "readwrite",
                    (store, key) => store.delete(key),
                    batch
                );
                total += count;
            }
            return total;
        }

        /**
         * @example db.clear("storeName");
         * 清除所有数据
         * @param storeName
         */
        async clear(storeName) {
            return this.#execute(storeName, "readwrite", (store) => {
                return store.clear();
            });
        }
    }

    self.SingletonDBInstance = IndexedDBSingleton;
})();


