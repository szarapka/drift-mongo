import { MongoClient } from "mongodb";
export class MongoDBService {
    host;
    dbName;
    client;
    db;
    constructor(host, dbName) {
        this.host = host;
        this.dbName = dbName;
        this.client = new MongoClient(host);
    }
    async connect() {
        await this.client.connect();
        this.db = this.client.db(this.dbName);
    }
    async close() {
        await this.client.close();
    }
    getClient() {
        return this.client;
    }
    getDB() {
        return this.db;
    }
    getCollection(name) {
        if (!this.db) {
            throw new Error('Database not connected');
        }
        return this.db.collection(name);
    }
    isConnected() {
        return this.db !== undefined;
    }
}
export default MongoDBService;
