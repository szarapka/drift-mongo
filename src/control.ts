import MongoDBService, { type DatabaseService } from "./mongo.js"
import envTempalte from "./templates/environment.js"
import { fileURLToPath } from "node:url"
import * as fs from "node:fs/promises"
import ps from "p-each-series"
import colors from "colors"
import path from "node:path"
import ora from "ora"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface DriftConfig {
  migration_folder: string
  envs: Record<string, EnvironmentConfig>
}

interface EnvironmentConfig {
  mongo_host: string
  mongo_db: string
  mongo_collection: string
}

interface Migration {
  filename: string
  status: string
  on: Date
}

export default class Control {
  static readonly DEFAULT_CONFIG = "drift.json" as const
  private FOLDER_NAME = "migrations" as const
  private readonly CONFIG_PATH: string
  private readonly MIGRATIONS_PATH: string
  private CONFIG?: DriftConfig
  private dbService?: DatabaseService

  constructor(private readonly ENV: string = "dev") {
    this.CONFIG_PATH = checkPath(path.join("./drift", Control.DEFAULT_CONFIG))
    this.MIGRATIONS_PATH = checkPath(path.join("./drift", this.FOLDER_NAME))
  }

  async initDrift() {
    try {
      await Control.checkForConfig()
      console.log("")
      console.log(colors.red.underline("Drift is already configured"))
      console.log(`If you want to reconfigure drift, edit ${colors.blue.underline('drift/drift.json')}`, "\n")
      process.exit(1)
    } catch (err) {
      console.log("Initializing drift config...", "\n")
      const dir = checkPath(path.join("./drift", this.FOLDER_NAME))
      await fs.mkdir(dir, { recursive: true })
      return await fs.writeFile(checkPath(path.join("./drift/", "drift.json")), JSON.stringify({
        migration_folder: this.FOLDER_NAME,
        envs: {
          dev: envTempalte
        }
      }, null, 2))
    }
  }

  /**
   * Loads the drift config file
   * @returns {Object} - The drift config object
   */
  async loadConfig() {
    try {
      await Control.checkForConfig()
      const c = JSON.parse(await fs.readFile(checkPath(this.CONFIG_PATH), "utf-8"))
      if (!c.envs[this.ENV]) {
        console.log("")
        console.log(colors.red.underline(`Environment not found: ${this.ENV}`))
        console.log("Please add the environment to the drift config", "\n")
        process.exit(1)
      }
      this.CONFIG = c
      this.FOLDER_NAME = c.migration_folder

      this.dbService = new MongoDBService(
        c.envs[this.ENV].mongo_host,
        c.envs[this.ENV].mongo_db
      )
      return c
    } catch (err) {
      throw new Error(`Could not find drift config at ${this.CONFIG_PATH}`)
    }
  }

  /**
   * Adds a new environment to the config file (using the environment template)
   * @param env - The environment to create the config for
   */
  async addEnv(env: string) {
    if (!this.CONFIG) {
      throw new Error("Drift config not found")
    }
    this.CONFIG.envs[env] = envTempalte
    try {
      await fs.writeFile(checkPath(this.CONFIG_PATH), JSON.stringify(this.CONFIG, null, 2))
    } catch (err) {
      throw new Error(`Could not write to drift config at ${this.CONFIG_PATH}`)
    }
  }

  async createMigration(desc: string) {
    console.log("")
    console.log("Creating migration:", desc, "\n")

    const filename = `${Date.now()}-${desc.split(" ").join("_")}.js`
    const filepath = checkPath(path.join("./drift", this.FOLDER_NAME, filename))
    const templatePath = checkPath(path.join(__dirname, "./templates", "migration.js"))

    try {
      await fs.copyFile(templatePath, filepath)
      return Promise.resolve(filename)
    } catch (err) {
      return Promise.reject(err)
    }
  }

  async getMigrationStatus(persist:boolean = false): Promise<[string, string, string][]> {
    await this.dbService!.connect()
    const collection = this.dbService!.getCollection<Migration>(this.CONFIG!.envs[this.ENV].mongo_collection)
    const migrations = await collection.find().toArray()
    const files = await fs.readdir(checkPath(this.MIGRATIONS_PATH))

    const statusMap = files.map((fileName): [string, string, string] => {
      const migration = migrations.find((m) => m.filename === fileName)
      const status = migration?.status ?? "pending"
      const on = migration ? new Date(migration.on).toLocaleString() : "n/a"
      return [fileName, status, on]
    })

    if (!persist) await this.dbService!.close()
    return statusMap
  }

  async up(): Promise<string[]> {
    try {
      const migrationItems = await this.getMigrationStatus(true)
      const pendingMigrations = migrationItems.filter((m) => m[1] === "pending")
      const collection = this.dbService!.getCollection<Migration>(this.CONFIG!.envs[this.ENV].mongo_collection)
      const migrated: string[] = []

      const migrateItem = async (item: [string, string, string]) => {
        const spinner = ora(`Migrating: ${item[0]}`).start()
        try {
          const migration = await import(path.join(this.MIGRATIONS_PATH, item[0]))
          await migration.up(this.dbService!.getDB(), this.dbService!.getClient())

          await collection.insertOne({
            filename: item[0],
            status: "migrated",
            on: new Date()
          })

          spinner.succeed()
          migrated.push(item[0])
        } catch (error) {
          spinner.fail()
          throw error instanceof Error
            ? error
            : new Error(`Unknown error during migration: ${item[0]}`)
        }
      }

      await ps(pendingMigrations, migrateItem)
      return migrated
    } finally {
      await this.dbService!.close()
    }
  }

  async down(): Promise<string[]> {
    const migrationItems = await this.getMigrationStatus(true)
    const completedMigrations = migrationItems.filter((m) => m[1] !== "pending")
    const lastMigrated = completedMigrations.at(-1)
    const collection = this.dbService!.getCollection<Migration>(this.CONFIG!.envs[this.ENV].mongo_collection)
    const downgraded = []

    if (lastMigrated) {
      const spinner = ora(`Downgrading: ${lastMigrated[0]}`).start()
      try {
        const migration = await import(checkPath(path.join("./drift", this.FOLDER_NAME, lastMigrated[0])))
        await migration.down(this.dbService!.getDB(), this.dbService!.getClient())
        spinner.succeed()
      } catch (err: any) {
        spinner.fail()
        throw new Error(
          `Could not downgrade migration ${lastMigrated[0]}: ${err.message}`
        )
      }
      try {
        await collection.deleteOne({ filename: lastMigrated[0] })
        downgraded.push(lastMigrated[0])
        spinner.succeed()
      } catch (err: any) {
        spinner.fail()
        throw new Error(`Could not update migration log: ${err.message}`)
      }
    }

    await this.dbService!.close()
    return downgraded
  }

  /**
   * Checks to see if the contig file exists
   * @returns {Promise} - The path to the migrations folder
   */
  static async checkForConfig(): Promise<any> {
    return await fs.stat(checkPath(path.join("./drift", Control.DEFAULT_CONFIG)))
  }
}

/**
 * Checks if the path is absolute and if not, joins it with the current working directory
 * @param pathToCheck - The path to check
 * @returns The path to the migrations folder
 */
function checkPath(pathToCheck: string): string {
  return path.isAbsolute(pathToCheck)
    ? pathToCheck
    : path.join(process.cwd(), pathToCheck)
}
