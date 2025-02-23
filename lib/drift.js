import { Command } from "commander";
import Control from "./control.js";
import table from "cli-table3";
import colors from "colors";
const pkg = await import('../package.json', {
    with: { type: 'json' }
});
const program = new Command();
function handleError(err) {
    console.error(err);
    process.exit(1);
}
function printTable(data) {
    const t = new table({
        head: ["Filename", "Status", "Ran On"]
    });
    data.forEach((row) => {
        t.push(row);
    });
    console.log(t.toString(), "\n");
}
export default () => {
    program
        .name("drift")
        .description("A CLI for multi-environment MongoDB migrations with Node.js")
        .version(pkg.default.version);
    program.command("init")
        .description("initializes drift config")
        .action(() => {
        const control = new Control();
        control.initDrift()
            .then(() => {
            console.log(colors.green.underline("Drift configuration generated."));
            console.log("Use your favorite editor to edit the config file at", colors.blue.underline("drift/drift.json"), "\n");
        })
            .catch(handleError);
    });
    program.command("create <desc>")
        .description("creates a new migration")
        .action(async (desc) => {
        const control = new Control();
        await control.loadConfig();
        control.createMigration(desc)
            .then((filename) => {
            console.log(colors.green.underline("Migration created!"), "\n");
            console.log("Edit the migration at", colors.blue.underline(`drift/migrations/${filename}`), "\n");
        })
            .catch(handleError);
    });
    program.command("env <env>")
        .description("adds a new environment to use")
        .action(async (env) => {
        const control = new Control();
        await control.loadConfig();
        control.addEnv(env)
            .then(() => {
            console.log("");
            console.log(colors.green.underline(`Environment added: ${env}`));
            console.log("Edit the environment at", colors.blue.underline(`drift/drift.json`), "\n");
        });
    });
    program.command("status")
        .description("checks the status of migrations")
        .option("-e --env <environment>", "environment to check status for (default: dev)", "dev")
        .action(async (options) => {
        const control = new Control(options.env);
        await control.loadConfig();
        control.getMigrationStatus()
            .then((status) => {
            console.log("");
            console.log(colors.blue.underline("Migration Status"));
            console.log(`Environment: ${options.env}`, "\n");
            if (status.length === 0) {
                console.log(colors.yellow("No migrations found."));
                console.log("Use", colors.blue.underline("drift create"), "to create a new migration", "\n");
            }
            else {
                return printTable(status);
            }
        })
            .catch(handleError);
    });
    program.command("up")
        .description("runs all pending migrations")
        .option("-e --env <environment>", "environment to run migrations for (default: dev)", "dev")
        .action(async (options) => {
        console.log('Starting migrations...');
        const control = new Control(options.env);
        await control.loadConfig();
        control.up()
            .then(() => {
            console.log('Migrations complete!');
        })
            .catch((err) => handleError(err));
    });
    program.command("down")
        .description("rolls back the last migration")
        .option("-e --env <environment>", "environment to run migrations for (default: dev)", "dev")
        .action(async (options) => {
        console.log('Rolling back migrations...');
        const control = new Control(options.env);
        await control.loadConfig();
        control.down()
            .then(() => {
            console.log('Rollback complete!');
        })
            .catch((err) => handleError(err));
    });
    program.parse();
};
