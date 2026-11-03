'use strict';

/**
 * AirdropNexus AI — Database abstraction layer (SQLite via sql.js).
 * Pure JavaScript/WebAssembly SQLite — no native compilation required.
 * Provides a simple query/get/run API that returns objects with named properties.
 */

const SQL = require('sql.js');
const fs = require('fs');
const path = require('path');

let sqlDb = null;
let dbFile = null;

function getDbPath() {
  const envPath = process.env.DB_PATH;
  if (envPath) return path.resolve(envPath);
  return path.resolve(__dirname, '../../data/airdropnexus.sqlite');
}

/**
 * Escape a value for safe inline SQL interpolation.
 * Only used for column-name discovery queries (LIMIT 1), never for data.
 */
function escapeSql(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return "'" + String(value).replace(/'/g, "''") + "'";
}

/**
 * Get column names for a SQL query by running a LIMIT 1 version via db.exec.
 * Returns array of column names.
 */
function getColumnNames(sql) {
  // Remove trailing semicolon and any existing LIMIT clause, then add LIMIT 1
  // (LIMIT 0 returns no rows, so db.exec() won't include column info)
  let trimmed = sql.trim().replace(/;+\s*$/, '');
  // Strip existing LIMIT clause
  trimmed = trimmed.replace(/\s+LIMIT\s+.+$/i, '');
  // Replace positional parameter placeholders with dummy values so db.exec() works
  const dummySql = trimmed.replace(/\?/g, '1');
  const limitSql = dummySql + ' LIMIT 1';
  try {
    const result = sqlDb.exec(limitSql);
    if (result && result[0] && result[0].columns) {
      return result[0].columns;
    }
  } catch (e) {
    // If column discovery fails, return empty
  }
  return [];
}

/**
 * Map an array row to an object using column names.
 */
function rowToObject(row, columns) {
  const obj = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i]] = row[i];
  }
  return obj;
}

async function initDb() {
  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const SQLConstructor = await SQL();

  let existingData = null;
  if (fs.existsSync(dbPath)) {
    existingData = fs.readFileSync(dbPath);
  }

  sqlDb = new SQLConstructor.Database(existingData);
  dbFile = dbPath;

  sqlDb.run('PRAGMA journal_mode = WAL');
  sqlDb.run('PRAGMA foreign_keys = ON');

  return sqlDb;
}

/**
 * Execute a SELECT query and return all rows as objects.
 */
function all(sql, params = []) {
  const columns = getColumnNames(sql);
  const stmt = sqlDb.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    const row = stmt.get();
    rows.push(rowToObject(row, columns));
  }
  return rows;
}

/**
 * Execute a SELECT query and return the first row as an object, or undefined.
 */
function get(sql, params = []) {
  const columns = getColumnNames(sql);
  const stmt = sqlDb.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.get();
    return rowToObject(row, columns);
  }
  return undefined;
}

/**
 * Execute an INSERT/UPDATE/DELETE query and return { lastInsertRowid, changes }.
 */
function run(sql, params = []) {
  const stmt = sqlDb.prepare(sql);
  stmt.bind(params);
  const result = stmt.run();
  // Get last insert rowid
  let lastInsertRowid = undefined;
  try {
    const lid = sqlDb.prepare('SELECT last_insert_rowid() AS id').get([]);
    lastInsertRowid = lid && lid.id !== undefined ? lid.id : undefined;
  } catch (e) {}
  return {
    lastInsertRowid,
    changes: result.changes !== undefined ? result.changes : (result ? 1 : 0),
  };
}

/**
 * Execute arbitrary SQL (for schema migrations, PRAGMA, etc.).
 */
function exec(sql) {
  return sqlDb.exec(sql);
}

function saveDb() {
  if (!sqlDb || !dbFile) return;
  const data = sqlDb.export();
  fs.writeFileSync(dbFile, data);
}

function closeDb() {
  if (sqlDb) {
    saveDb();
    sqlDb.close();
    sqlDb = null;
    dbFile = null;
  }
}

// Auto-save on process exit
process.on('exit', () => {
  try { saveDb(); } catch (e) {}
});
process.on('SIGINT', () => {
  try { saveDb(); } catch (e) {}
  process.exit(0);
});
process.on('SIGTERM', () => {
  try { saveDb(); } catch (e) {}
  process.exit(0);
});

module.exports = { initDb, all, get, run, exec, saveDb, closeDb };
