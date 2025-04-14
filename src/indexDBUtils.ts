interface IndexedDBSingletonOptions {
    dbName: string,
    batchMax?: number,
    maxInitialLimitCount?: number
}

// interface DKey
class IndexedDBSingleton {
    private static instance: IndexedDBSingleton;
    private db: IDBDatabase | null = null;
    private dbName: string = "classPlatWebDB";
    private version: number = 1;
    private storeConfigs: StoreConfig[] = [];
    private batchMax = 100;
    private maxReInitialLimitCount = 1000;


    constructor({
                    dbName,
                    batchMax = 100,
                    maxInitialLimitCount = 1000
                }: IndexedDBSingletonOptions) {
        if (!dbName || dbName.trim().length === 0) {
            throw new Error("db name error");
        }
        if (maxInitialLimitCount && maxInitialLimitCount > this.maxReInitialLimitCount) {
            this.maxReInitialLimitCount = maxInitialLimitCount;
        }

        if (IndexedDBSingleton.instance) {
            return IndexedDBSingleton.instance;
        }
        this.dbName = dbName;
        this.batchMax = batchMax;
        IndexedDBSingleton.instance = this;
    }

    /**
     * 检查表是否存在
     * @param tableName
     */
    public isExistTable = (tableName: string) => {
        if (this.db) {
            return this.db.objectStoreNames.contains(tableName);
        }
        return false;

    }

    /**
     * 初始化数据库连接，同步本地版本和数据库实际版本
     */
    public async initialize() {
        if (this.db) return Promise.resolve(true);

        let reInitialLized = false;

        let currentTryTimes = 0;

        const initFn = () => {
            console.log("初始化数据库");

            return new Promise((resolve, _reject) => {
                const request = indexedDB.open(this.dbName, this.version);

                request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
                    const db = (event.target as IDBOpenDBRequest).result;
                    this.handleUpgrade(db, event.oldVersion);
                };

                request.onsuccess = (event: Event) => {
                    this.db = (event.target as IDBOpenDBRequest).result;


                    resolve(true);
                };

                request.onerror = (_event: Event) => {
                    resolve(false);
                };
            });
        };

        while (currentTryTimes < this.maxReInitialLimitCount && !reInitialLized) {
            const initRes = await initFn();
            currentTryTimes++;
            if (initRes) {
                reInitialLized = true;
                return Promise.resolve(true);
            } else {
                this.version++;
            }
        }
    }

    /**
     * 添加事件监听器
     * @param type 事件类型
     * @param eventListener 事件处理函数
     */
    public addEventListener<K extends keyof IDBDatabaseEventMap>(type: K, eventListener: (this: IDBDatabase, ev: IDBDatabaseEventMap[K]) => void) {
        if (this.db) {
            this.db.addEventListener(type, eventListener);
        }
    }

    /**
     * 移除事件监听器
     * @param type 事件类型
     * @param eventListener 事件处理函数
     */
    public removeEventListener<K extends keyof IDBDatabaseEventMap>(type: K, eventListener: (this: IDBDatabase, ev: IDBDatabaseEventMap[K]) => void) {
        if (this.db) {
            this.db.removeEventListener(type, eventListener);
        }
    }

    /**
     * 销毁数据库
     */
    public destroy() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    /**
     * 处理数据库升级
     */
    private handleUpgrade(db: IDBDatabase, _oldVersion: number) {
        // 删除不再需要的表
        Array.from(db.objectStoreNames).forEach((storeName) => {
            if (!this.storeConfigs.some((c) => c.name === storeName)) {
                db.deleteObjectStore(storeName);
            }
        });

        // 创建新表
        this.storeConfigs.forEach((config) => {
            if (!db.objectStoreNames.contains(config.name)) {
                this.createStore(db, config);
            }
        });
    }

    /**
     * 创建对象存储
     */
    private createStore(db: IDBDatabase, config: StoreConfig) {
        const store = db.createObjectStore(config.name, config.options);

        config.indexes?.forEach((index) => {
            store.createIndex(index.name, index.keyPath, index.options);
        });
    }

    /**
     * 添加新的表
     */
    public async addStore(config: StoreConfig): Promise<void> {
        if (this.storeConfigs.some((c) => c.name === config.name)) {
            throw new Error(`Store ${config.name} already exists`);
        }

        this.storeConfigs.push(config);
        this.version++;
        await this.reconnect();
    }

    /**
     * 删除数据库表
     */
    public async deleteStore(storeName: string): Promise<void> {
        this.storeConfigs = this.storeConfigs.filter((c) => c.name !== storeName);
        this.version++;
        await this.reconnect();
    }

    /**
     * 重新连接数据库
     */
    private async reconnect(): Promise<void> {
        this.destroy();
        await this.initialize();
    }

    /**
     * 添加数据，如果主键已存在则抛出错误
     * @throws {Error}主键已存在
     * @param storeName
     * @param data
     * @returns Promise<IDBValidKey>返回主键key
     */
    public async add<T>(storeName: string, data: T): Promise<IDBValidKey> {
        return this.execute(storeName, "readwrite", (store) => {
            return store.add(data);
        });
    }

    /**
     * 根据主键获取数据
     * @param storeName
     * @param key
     */
    public async get<T>(
        storeName: string,
        key: IDBValidKey
    ): Promise<T | undefined> {
        return this.execute(storeName, "readonly", (store) => {
            return store.get(key);
        });
    }

    /**
     * 获取所有数据
     * @param storeName
     * @param query 主键key或比较条件
     * @param count 数量
     */
    public async getAll<T>(storeName: string, query?: IDBValidKey | IDBKeyRange | null, count?: number): Promise<T[]> {
        return this.execute(storeName, "readonly", (store) => {
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
    public async getAllByIndexName<T>(storeName: string, indexName: string, query?: IDBValidKey | IDBKeyRange | null, count?: number): Promise<T[]> {
        return this.execute(storeName, "readonly", (store) => {
            const index = store.index(indexName);
            return index.getAll(query, count);
        });
    }


    /**
     * @example db.getCount("storeName");
     * 获取数据的数量
     * @param storeName
     */
    public async getCount(storeName: string): Promise<number> {
        return this.execute(storeName, "readonly", (store) => {
            return store.count();
        });
    }

    /**
     * @example db.put("storeName", { id: 1, name: "test" });
     * 添加数据，如果主键已存在则更新
     * @param storeName
     * @param data
     * @returns Promise<IDBValidKey>返回主键key
     */
    public async put<T>(storeName: string, data: T): Promise<IDBValidKey> {
        return this.execute(storeName, "readwrite", (store) => {
            return store.put(data);
        });
    }


    /**
     * 批量put
     * @param storeName
     * @param dataList
     * @param batchSize
     */
    async putAll<T>(storeName: string, dataList: Array<T>, batchSize: number = this.batchMax) {
        let total = 0;
        for (let i = 0; i < dataList.length; i += batchSize) {
            const batch = dataList.slice(i, i + batchSize);
            const count = await this.executeBatch<T>(
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
    public async delete(storeName: string, key: IDBValidKey): Promise<void> {
        return this.execute(storeName, "readwrite", (store) => {
            return store.delete(key);
        });
    }


    /**
     * 批量删除数据
     * @param storeName 存储对象名称
     * @param keys 主键列表
     * @param batchSize 分批大小（默认100）
     */
    public async deleteAll(storeName: string, keys: Array<IDBValidKey> = [], batchSize = this.batchMax) {
        let total: number = 0;
        for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            const count: number = await this.executeBatch<IDBValidKey>(
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
    public async clear(storeName: string): Promise<void> {
        return this.execute(storeName, "readwrite", (store) => {
            return store.clear();
        });
    }

    /**
     * 通用事务执行方法
     */
    private async execute<T>(
        storeName: string,
        mode: IDBTransactionMode,
        operation: (store: IDBObjectStore) => IDBRequest<T>
    ): Promise<T> {
        if (!this.db) throw new Error("Database not initialized");

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, mode);
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
    async executeBatch<T>(storeName: string,
                          mode: IDBTransactionMode,
                          operation: (store: IDBObjectStore, item: T) => IDBRequest, batch: Array<T>): Promise<number> {
        if (!this.db) {
            throw new Error("Database not initialized");
        }
        return new Promise((resolve, reject) => {
            let successCount = 0;
            let errorOccurred = false;

            const transaction = this.db!.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);

            batch && batch.forEach((item) => {
                if (errorOccurred) return Promise.reject(successCount);

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
                    // console.log()
                    reject(event.target);
                };

            })

            transaction.oncomplete = () => {
                if (!errorOccurred) resolve(successCount);
            };
            transaction.onerror = () => reject(transaction.error);
        });

    }

}

// 类型定义
interface StoreConfig {
    name: string;
    options: IDBObjectStoreParameters;
    indexes?: IndexConfig[];
}

interface IndexConfig {
    name: string;
    keyPath: string | string[];
    options: IDBIndexParameters;
}

// 创建并导出单例实例
const dbInstance = new IndexedDBSingleton({
    dbName: "classPlatWebDB"
});
// initialize，内部包含更新版本号，是异步的，必须要await
await dbInstance.initialize();

export default dbInstance;
