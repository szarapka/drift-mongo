import { MongoClient, Db, Collection, Document } from "mongodb"

export interface DatabaseService {
  connect(): Promise<void>
  close(): Promise<void>
  getClient(): MongoClient
  getDB(): Db
  getCollection<T extends Document>(name: string): Collection<T>
  isConnected(): boolean
}

export class MongoDBService implements DatabaseService {
  private client: MongoClient
  private db?: Db

  constructor(
    private readonly host: string,
    private readonly dbName: string
  ) {
    this.client = new MongoClient(host)
  }

  async connect(): Promise<void> {
    await this.client.connect()
    this.db = this.client.db(this.dbName)
  }

  async close(): Promise<void> {
    await this.client.close()
  }

  getClient(): MongoClient {
    return this.client
  }

  getDB(): Db {
    return this.db!
  }

  getCollection<T extends Document>(name: string): Collection<T> {
    if (!this.db) {
      throw new Error('Database not connected')
    }
    return this.db.collection<T>(name)
  }

  isConnected(): boolean {
    return this.db !== undefined
  }
}

export default MongoDBService
