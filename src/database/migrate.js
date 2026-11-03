'use strict';

/**
 * AirdropNexus AI — Migration runner (sql.js).
 * Applies schema.sql and records each migration in schema_migrations.
 */

const fs = require('fs');
const path = require('path');
const { initDb, all, get, run, exec } = require('./db');
const logger = require('../config/logger');

const MIGRATION_NAME = 'init_schema_v1';

async function runMigrations() {
  await initDb();

  // Ensure migrations table exists
  run(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      migration_name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );

  const alreadyApplied = get(
    `SELECT 1 AS applied FROM schema_migrations WHERE migration_name = ?`,
    [MIGRATION_NAME]
  );

  if (alreadyApplied && alreadyApplied.applied === 1) {
    logger.info(`Migration "${MIGRATION_NAME}" already applied.`);
    return;
  }

  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  exec(schemaSql);

  run(
    `INSERT OR IGNORE INTO schema_migrations (migration_name) VALUES (?)`,
    [MIGRATION_NAME]
  );

  logger.info(`Migration "${MIGRATION_NAME}" applied successfully.`);
}

function rollbackMigration() {
  const migration = get(
    `SELECT migration_name FROM schema_migrations WHERE migration_name = ?`,
    [MIGRATION_NAME]
  );

  if (!migration || Object.keys(migration).length === 0) {
    logger.warn(`Migration "${MIGRATION_NAME}" not found. Nothing to rollback.`);
    return;
  }

  run(
    `DELETE FROM schema_migrations WHERE migration_name = ?`,
    [MIGRATION_NAME]
  );
  logger.info(`Migration "${MIGRATION_NAME}" rolled back.`);
}

module.exports = { runMigrations, rollbackMigration };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--rollback')) {
    rollbackMigration();
  } else {
    runMigrations().catch((err) => {
      logger.error('Migration failed', { message: err.message });
      process.exit(1);
    });
  }
}
