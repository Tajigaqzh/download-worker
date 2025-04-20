import {getDBInstance} from "../utils/indexDBUtils";

/**
 * 单例获取数据库连接
 */

const getTaskTableInstance = async () => {
    const instance = await getDBInstance();
    if (!instance.isExistTable("uploadTask")) {
        await instance.addStore({
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
        return instance;
    }
    return instance;
}
