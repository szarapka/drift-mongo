Drift
=====

Drift is a multi-environment MongoDB migrations CLI tool for Node.js.

## Installation

```
npm install drift-mongo --save-dev
```

## Usage

You can run `drift` or `drift --help` to see the CLI commands.

```
Usage: drift [options] [command]

A CLI for multi-environment MongoDB migrations with Node.js

Options:
  -V, --version     output the version number
  -h, --help        display help for command

Commands:
  init              initializes drift config
  create <desc>     creates a new migration
  env <env>         adds a new environment to use
  status [options]  checks the status of migrations
  up [options]      runs all pending migrations
  down [options]    rolls back the last migration
  help [command]    display help for command
```

## Initialization

Drift requries [Node 18](https://nodejs.org/en) (or higher) installed.

In the root of the project you'd like to setup migrations for, initialize a new drift configuration.

```
$ drift init

Initializing drift config...

Drift configuration generated.
Use your favorite editor to edit the config file at drift/drift.json
```

Running this command did two things:

1. created these folders: `drift/migrations`
2. created a `drift.json` file in the `drift` folder

The configuration file, `drift.json`, was created with a default environment: `dev`. Edit this file with your development environment details.

## Configuration

The `drift.json` file maintains your drift configuration for this project, with this initial object structure:

```json
{
  "migration_folder": "migrations",
  "envs": {
    "dev": {
      "mongo_host": "mongodb://localhost:27017",
      "mongo_db": "platform",
      "mogno_collection": "migrations"
    }
  }
}
```

- `migration_folder`: Lets you change the name/path of the migrations folder.
- `envs`: Holds a environment config object for each configured environment.

**Note:** You should add the `drift.json` file to your `.gitignore`.

## Adding Environments

You can add an environment using the CLI, or by editing the `drift.json` file.

```
Usage: drift env [options] <env>

Adds a new environment to use

Options:
  -h, --help  display help for command
```

To add a production environment, you can use the following command:

```
$ drift env prod

Environment added: prod
Edit the environment at drift/drift.json
```

Running this command added a new object to the `envs` object in the `drift.json` configuration file.

```json
"envs": {
  "prod": {
    "mongo_host": "mongodb://localhost:27017",
    "mongo_db": "platform",
    "mogno_collection": "migrations"
  }
}
```

Edit `drift.json` to add your connection and DB details.

## Adding Migrations

Use the CLI to add a new migration to drift.

```
Usage: drift create [options] <desc>

Creates a new migration

Options:
  -h, --help  display help for command
```

To add a (test) migration, you can use the following command:

```
$ drift create test

Creating migration: test

Migration created!

Edit the migration at drift/migrations/1664591812475-test.js
```

Running this command added a new migration to the configured migrations folder (`migrations` by default).

## Migrations

Use migration files to perform changes to your database. New migration files are created in the configured migrations folder (`migrations` by default):

```javascript
export const up = async (db, client) => {
  // Migration code goes here
}
export const down = async (db, client) => {
  // Rollback code goes here
}
```

Edit this file with your migration code. The `db` object is the official MongoDB object, the `client` object is a MongoClient instance.

Migrations use async-await and your migration code must use async-await and return a promise.

#### Example

```javascript
export const up = async (db, client) => {
  await db.collection('test').insertOne({test: 'test'})
}
export const down = async (db, client) => {
  await db.collection('test').deleteOne({test: 'test'})
}
```

## Migrating up

Run all pending migrations on a given environment. If no environment is specified, `dev` is configured as default.

```
Usage: drift up [options]

runs all pending migrations

Options:
  -e --env <environment>  environment to run migrations for (default: dev) (default: "dev")
  -h, --help              display help for command
```

To run all pending migrations for the `dev` (default) environment use the following command:

```
$ drift up

Migrated: 1664591812475-test.js

Migrations complete!
```

To run all pending migrations for the `prod` environment, use the following command:

```
$ drift up --env prod

Migrated: 1664591812475-test.js

Migrations complete!
```

Any error caught will stop the process.

## Migrating down

When you need to revert migrations for a given environment, migrating down will revert back through the completed migrations one at a time.

```
Usage: drift down [options]

rolls back the last migration

Options:
  -e --env <environment>  environment to run migrations for (default: dev) (default: "dev")
  -h, --help              display help for command
```

To revert the last completed migration for the `dev` (default) environment use the following command:

```
$ drift down

Downgraded: 1664591812475-test.js

Rollback complete!
```

To rever the last completed migration for the `prod` environment, use the following command:

```
$ drift down --env prod

Downgraded: 1664591812475-test.js

Migrations complete!
```

## Migration status

Easily check the status of the migrations for a given environment.

```
Usage: drift status [options]

checks the status of migrations

Options:
  -e --env <environment>  environment to check status for (default: dev) (default: "dev")
  -h, --help              display help for command
```

To check the status of migrations for the `dev` (default) environment, use the following command:

```bash
$ drift status

Migration Status
Environment: dev

┌─────────────────────────┬──────────┬───────────────────────┐
│ Filename                │ Status   │ Ran On                │
├─────────────────────────┼──────────┼───────────────────────┤
│ 1664591812475-test.js   │ migrated │ 9/30/2022, 2:07:06 PM │
└─────────────────────────┴──────────┴───────────────────────┘
```
