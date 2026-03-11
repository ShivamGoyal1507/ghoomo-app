const fs = require("fs");
const path = require("path");

const DEFAULT_DATA_PATH = path.join(__dirname, "data", "store.json");
const DATA_PATH = process.env.DATA_PATH || path.join(process.env.DATA_DIR || path.join(__dirname, "data"), "store.json");
const STORE_KEY = "primary";

function ensureDataFile(seedStore) {
  const dataDir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (fs.existsSync(DATA_PATH)) {
    return;
  }
  if (fs.existsSync(DEFAULT_DATA_PATH)) {
    fs.copyFileSync(DEFAULT_DATA_PATH, DATA_PATH);
    return;
  }
  fs.writeFileSync(DATA_PATH, JSON.stringify(seedStore, null, 2));
}

function loadFileStore(seedStore) {
  ensureDataFile(seedStore);
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

function saveFileStore(store, seedStore) {
  ensureDataFile(seedStore);
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2));
}

async function createStorage({ seedStore }) {
  const databaseUrl = process.env.DATABASE_URL || "";
  let cache = null;
  let pgClient = null;
  let usingPostgres = false;

  if (databaseUrl) {
    const { Client } = require("pg");
    pgClient = new Client({
      connectionString: databaseUrl,
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
    });

    await pgClient.connect();
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const existing = await pgClient.query("SELECT data FROM app_state WHERE key = $1 LIMIT 1", [STORE_KEY]);
    if (existing.rows[0]?.data) {
      cache = existing.rows[0].data;
    } else {
      cache = loadFileStore(seedStore);
      await pgClient.query(
        `INSERT INTO app_state (key, data, updated_at) VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [STORE_KEY, JSON.stringify(cache)]
      );
    }
    usingPostgres = true;
  } else {
    cache = loadFileStore(seedStore);
  }

  const persist = async (store) => {
    cache = JSON.parse(JSON.stringify(store));
    if (usingPostgres) {
      await pgClient.query(
        `INSERT INTO app_state (key, data, updated_at) VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [STORE_KEY, JSON.stringify(cache)]
      );
      return;
    }
    saveFileStore(cache, seedStore);
  };

  return {
    mode: usingPostgres ? "postgres" : "file",
    readStore() {
      return JSON.parse(JSON.stringify(cache));
    },
    async writeStore(store) {
      await persist(store);
    },
  };
}

module.exports = {
  createStorage,
};
