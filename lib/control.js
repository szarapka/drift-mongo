import envTempalte from "./templates/environment.js";
import { MongoClient } from "mongodb";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs/promises";
import ps from "p-each-series";
import colors from "colors";
import path from "node:path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export default class Control {
    static DEFAULT_CONFIG = "drift.json";
    FOLDER_NAME = "migrations";
    CONFIG_PATH;
    MIGRATIONS_PATH;
    MONGO_HOST = "";
    MONGO_DB = "";
    MONGO_COLLECTION = "";
    ENV;
    CONFIG;
    Client;
    DB;
    constructor(env = "dev") {
        this.CONFIG_PATH = checkPath(path.join("./drift", Control.DEFAULT_CONFIG));
        this.MIGRATIONS_PATH = checkPath(path.join("./drift", this.FOLDER_NAME));
        this.ENV = env;
    }
    async initDrift() {
        try {
            await Control.checkForConfig();
            console.log("");
            console.log(colors.red.underline("Drift is already configured"));
            console.log(`If you want to reconfigure drift, edit ${colors.blue.underline('drift/drift.json')}`, "\n");
            process.exit(1);
        }
        catch (err) {
            console.log("Initializing drift config...", "\n");
            const dir = checkPath(path.join("./drift", this.FOLDER_NAME));
            await fs.mkdir(dir, { recursive: true });
            return await fs.writeFile(checkPath(path.join("./drift/", "drift.json")), JSON.stringify({
                migration_folder: this.FOLDER_NAME,
                envs: {
                    dev: envTempalte
                }
            }, null, 2));
        }
    }
    /**
     * Loads the drift config file
     * @returns {Object} - The drift config object
     */
    async loadConfig() {
        try {
            await Control.checkForConfig();
            const c = JSON.parse(await fs.readFile(checkPath(this.CONFIG_PATH), "utf-8"));
            if (!c.envs[this.ENV]) {
                console.log("");
                console.log(colors.red.underline(`Environment not found: ${this.ENV}`));
                console.log("Please add the environment to the drift config", "\n");
                process.exit(1);
            }
            this.FOLDER_NAME = c.migration_folder;
            this.MONGO_HOST = c.envs[this.ENV].mongo_host;
            this.MONGO_DB = c.envs[this.ENV].mongo_db;
            this.MONGO_COLLECTION = c.envs[this.ENV].mogno_collection;
            this.CONFIG = c;
            return c;
        }
        catch (err) {
            throw new Error(`Could not find drift config at ${this.CONFIG_PATH}`);
        }
    }
    /**
     * Adds a new environment to the config file (using the environment template)
     * @param env - The environment to create the config for
     */
    async addEnv(env) {
        this.CONFIG.envs[env] = envTempalte;
        try {
            await fs.writeFile(checkPath(this.CONFIG_PATH), JSON.stringify(this.CONFIG, null, 2));
        }
        catch (err) {
            throw new Error(`Could not write to drift config at ${this.CONFIG_PATH}`);
        }
    }
    async createMigration(desc) {
        console.log("");
        console.log("Creating migration:", desc, "\n");
        const filename = `${Date.now()}-${desc.split(" ").join("_")}.js`;
        const filepath = checkPath(path.join("./drift", this.FOLDER_NAME, filename));
        const templatePath = checkPath(path.join(__dirname, "./templates", "migration.js"));
        try {
            await fs.copyFile(templatePath, filepath);
            return Promise.resolve(filename);
        }
        catch (err) {
            return Promise.reject(err);
        }
    }
    async getMigrationStatus(persist = false) {
        await this.connect();
        const collection = this.DB.collection(this.MONGO_COLLECTION);
        const migrations = await collection.find().toArray();
        const files = await fs.readdir(checkPath(this.MIGRATIONS_PATH));
        const statusMap = files.map((fileName) => {
            const migration = migrations.find((m) => m.filename === fileName);
            let status, on;
            if (migration) {
                status = migration.status;
                on = new Date(migration.on).toLocaleString();
            }
            else {
                status = "pending",
                    on = "n/a";
            }
            return [fileName, status, on];
        });
        if (!persist)
            await this.Client?.close();
        return Promise.resolve(statusMap);
    }
    async up() {
        const migrationItems = await this.getMigrationStatus(true);
        const pendingMigrations = migrationItems.filter((m) => m[1] === "pending");
        const collection = this.DB.collection(this.MONGO_COLLECTION);
        const migrated = [];
        console.log("");
        const migrateItem = async (item) => {
            try {
                const migration = await import(checkPath(path.join("./drift", this.FOLDER_NAME, item[0])));
                await migration.up(this.DB, this.Client);
            }
            catch (err) {
                throw new Error(`Could not run the migration: ${item[0]}`);
            }
            try {
                await collection.insertOne({
                    filename: item[0],
                    status: "migrated",
                    on: new Date()
                });
            }
            catch (err) {
                throw new Error(`Could not update migration log: ${err.message}`);
            }
            console.log(`Migrated: ${item[0]}`);
            migrated.push(item.fileName);
        };
        await ps(pendingMigrations, migrateItem);
        await this.Client?.close();
        return migrated;
    }
    async down() {
        const migrationItems = await this.getMigrationStatus(true);
        const completedMigrations = migrationItems.filter((m) => m[1] !== "pending");
        const lastMigrated = completedMigrations.at(-1);
        const collection = this.DB.collection(this.MONGO_COLLECTION);
        const downgraded = [];
        if (lastMigrated) {
            try {
                const migration = await import(checkPath(path.join("./drift", this.FOLDER_NAME, lastMigrated[0])));
                await migration.down(this.DB, this.Client);
            }
            catch (err) {
                throw new Error(`Could not downgrade migration ${lastMigrated[0]}: ${err.message}`);
            }
            try {
                await collection.deleteOne({ filename: lastMigrated[0] });
                downgraded.push(lastMigrated[0]);
                console.log("");
                console.log(`Downgraded: ${lastMigrated[0]}`);
            }
            catch (err) {
                throw new Error(`Could not update migration log: ${err.message}`);
            }
        }
        await this.Client?.close();
        return downgraded;
    }
    /**
     * Connects to the configured MongoDB instance
     */
    async connect() {
        this.Client = new MongoClient(this.MONGO_HOST);
        try {
            await this.Client.connect();
            this.DB = this.Client.db(this.MONGO_DB);
        }
        catch (err) {
            console.error(err);
            process.exit(1);
        }
    }
    /**
     * Checks to see if the contig file exists
     * @returns {Promise} - The path to the migrations folder
     */
    static async checkForConfig() {
        return await fs.stat(checkPath(path.join("./drift", Control.DEFAULT_CONFIG)));
    }
}
function checkPath(pathToCheck) {
    if (path.isAbsolute(pathToCheck))
        return pathToCheck;
    return path.join(process.cwd(), pathToCheck);
}
