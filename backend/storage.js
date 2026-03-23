const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const STORE_KEY = "primary";
const DEFAULT_DATA_PATH = path.join(__dirname, "data", "store.json");

const CREATE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS app_bus_routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_bus_routes_name_unique ON app_bus_routes (LOWER(name));

CREATE TABLE IF NOT EXISTS app_rides (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  driver_id TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  CONSTRAINT fk_app_rides_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_app_rides_driver FOREIGN KEY (driver_id) REFERENCES app_users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS app_shared_ride_requests (
  id TEXT PRIMARY KEY,
  ride_id TEXT,
  owner_id TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  CONSTRAINT fk_shared_ride_owner FOREIGN KEY (owner_id) REFERENCES app_users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_shared_ride_ride FOREIGN KEY (ride_id) REFERENCES app_rides(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS app_bus_bookings (
  id TEXT PRIMARY KEY,
  route_id TEXT,
  user_id TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  CONSTRAINT fk_bus_booking_route FOREIGN KEY (route_id) REFERENCES app_bus_routes(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_bus_booking_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS app_store_meta (
  key TEXT PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_store_meta (key, version)
VALUES ('primary', 1)
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users (role);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_app_rides_user_id ON app_rides (user_id);
CREATE INDEX IF NOT EXISTS idx_app_rides_driver_id ON app_rides (driver_id);
CREATE INDEX IF NOT EXISTS idx_app_rides_status ON app_rides (status);
CREATE INDEX IF NOT EXISTS idx_app_rides_created_at ON app_rides (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_shared_ride_ride_id ON app_shared_ride_requests (ride_id);
CREATE INDEX IF NOT EXISTS idx_app_shared_ride_owner_id ON app_shared_ride_requests (owner_id);
CREATE INDEX IF NOT EXISTS idx_app_shared_ride_status ON app_shared_ride_requests (status);
CREATE INDEX IF NOT EXISTS idx_app_bus_bookings_route_id ON app_bus_bookings (route_id);
CREATE INDEX IF NOT EXISTS idx_app_bus_bookings_user_id ON app_bus_bookings (user_id);
`;

function cloneData(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeStore(input) {
  const source = input || {};
  return {
    users: Array.isArray(source.users) ? source.users : [],
    rides: Array.isArray(source.rides) ? source.rides : [],
    busRoutes: Array.isArray(source.busRoutes) ? source.busRoutes : [],
    busBookings: Array.isArray(source.busBookings) ? source.busBookings : [],
    sharedRideRequests: Array.isArray(source.sharedRideRequests) ? source.sharedRideRequests : [],
    __version: Number(source.__version || 1),
  };
}

function loadBootstrapStore(seedStore) {
  const shouldBootstrapFromJson = String(process.env.SUPABASE_BOOTSTRAP_FROM_JSON || "false").toLowerCase() === "true";
  if (!shouldBootstrapFromJson || !fs.existsSync(DEFAULT_DATA_PATH)) {
    return normalizeStore(seedStore);
  }
  try {
    const fromJson = JSON.parse(fs.readFileSync(DEFAULT_DATA_PATH, "utf8"));
    return normalizeStore(fromJson);
  } catch {
    return normalizeStore(seedStore);
  }
}

function toJsonParam(rows) {
  return JSON.stringify(Array.isArray(rows) ? rows : []);
}

async function replaceUsers(client, users) {
  const rows = users
    .filter((user) => user && user.id)
    .map((user) => ({
      id: String(user.id),
      email: user.email || null,
      role: user.role || "user",
      created_at: user.createdAt || null,
      updated_at: user.updatedAt || null,
      payload: user,
    }));

  await client.query(
    `
    WITH incoming AS (
      SELECT
        id,
        NULLIF(email, '') AS email,
        COALESCE(NULLIF(role, ''), 'user') AS role,
        created_at,
        updated_at,
        payload
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        email text,
        role text,
        created_at timestamptz,
        updated_at timestamptz,
        payload jsonb
      )
    ),
    upserted AS (
      INSERT INTO app_users (id, email, role, created_at, updated_at, payload)
      SELECT
        id,
        email,
        role,
        COALESCE(created_at, NOW()),
        COALESCE(updated_at, NOW()),
        payload
      FROM incoming
      ON CONFLICT (id)
      DO UPDATE SET
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        updated_at = NOW(),
        payload = EXCLUDED.payload
      RETURNING id
    )
    DELETE FROM app_users current_rows
    WHERE NOT EXISTS (
      SELECT 1 FROM incoming incoming_rows WHERE incoming_rows.id = current_rows.id
    )
    `,
    [toJsonParam(rows)]
  );
}

async function replaceRides(client, rides) {
  const rows = rides
    .filter((ride) => ride && ride.id)
    .map((ride) => ({
      id: String(ride.id),
      user_id: ride.userId || null,
      driver_id: ride.driver?.id || null,
      status: ride.status || "pending",
      created_at: ride.createdAt || null,
      updated_at: ride.updatedAt || null,
      payload: ride,
    }));

  await client.query(
    `
    WITH incoming AS (
      SELECT
        id,
        user_id,
        driver_id,
        COALESCE(NULLIF(status, ''), 'pending') AS status,
        created_at,
        updated_at,
        payload
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        user_id text,
        driver_id text,
        status text,
        created_at timestamptz,
        updated_at timestamptz,
        payload jsonb
      )
    ),
    upserted AS (
      INSERT INTO app_rides (id, user_id, driver_id, status, created_at, updated_at, payload)
      SELECT
        id,
        user_id,
        driver_id,
        status,
        COALESCE(created_at, NOW()),
        COALESCE(updated_at, NOW()),
        payload
      FROM incoming
      ON CONFLICT (id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        driver_id = EXCLUDED.driver_id,
        status = EXCLUDED.status,
        updated_at = NOW(),
        payload = EXCLUDED.payload
      RETURNING id
    )
    DELETE FROM app_rides current_rows
    WHERE NOT EXISTS (
      SELECT 1 FROM incoming incoming_rows WHERE incoming_rows.id = current_rows.id
    )
    `,
    [toJsonParam(rows)]
  );
}

async function replaceBusRoutes(client, busRoutes) {
  const rows = busRoutes
    .filter((route) => route && route.id)
    .map((route) => ({
      id: String(route.id),
      name: route.name || route.id,
      created_at: route.createdAt || null,
      updated_at: route.updatedAt || null,
      payload: route,
    }));

  await client.query(
    `
    WITH incoming AS (
      SELECT
        id,
        COALESCE(NULLIF(name, ''), id) AS name,
        created_at,
        updated_at,
        payload
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        name text,
        created_at timestamptz,
        updated_at timestamptz,
        payload jsonb
      )
    ),
    upserted AS (
      INSERT INTO app_bus_routes (id, name, created_at, updated_at, payload)
      SELECT
        id,
        name,
        COALESCE(created_at, NOW()),
        COALESCE(updated_at, NOW()),
        payload
      FROM incoming
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW(),
        payload = EXCLUDED.payload
      RETURNING id
    )
    DELETE FROM app_bus_routes current_rows
    WHERE NOT EXISTS (
      SELECT 1 FROM incoming incoming_rows WHERE incoming_rows.id = current_rows.id
    )
    `,
    [toJsonParam(rows)]
  );
}

async function replaceBusBookings(client, busBookings) {
  const rows = busBookings
    .filter((booking) => booking && booking.id)
    .map((booking) => ({
      id: String(booking.id),
      route_id: booking.routeId || null,
      user_id: booking.userId || null,
      status: booking.status || "pending",
      created_at: booking.createdAt || null,
      updated_at: booking.updatedAt || null,
      payload: booking,
    }));

  await client.query(
    `
    WITH incoming AS (
      SELECT
        id,
        route_id,
        user_id,
        COALESCE(NULLIF(status, ''), 'pending') AS status,
        created_at,
        updated_at,
        payload
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        route_id text,
        user_id text,
        status text,
        created_at timestamptz,
        updated_at timestamptz,
        payload jsonb
      )
    ),
    upserted AS (
      INSERT INTO app_bus_bookings (id, route_id, user_id, status, created_at, updated_at, payload)
      SELECT
        id,
        route_id,
        user_id,
        status,
        COALESCE(created_at, NOW()),
        COALESCE(updated_at, NOW()),
        payload
      FROM incoming
      ON CONFLICT (id)
      DO UPDATE SET
        route_id = EXCLUDED.route_id,
        user_id = EXCLUDED.user_id,
        status = EXCLUDED.status,
        updated_at = NOW(),
        payload = EXCLUDED.payload
      RETURNING id
    )
    DELETE FROM app_bus_bookings current_rows
    WHERE NOT EXISTS (
      SELECT 1 FROM incoming incoming_rows WHERE incoming_rows.id = current_rows.id
    )
    `,
    [toJsonParam(rows)]
  );
}

async function replaceSharedRideRequests(client, sharedRideRequests) {
  const rows = sharedRideRequests
    .filter((request) => request && request.id)
    .map((request) => ({
      id: String(request.id),
      ride_id: request.rideId || null,
      owner_id: request.ownerId || null,
      status: request.status || "active",
      created_at: request.createdAt || null,
      updated_at: request.updatedAt || null,
      payload: request,
    }));

  await client.query(
    `
    WITH incoming AS (
      SELECT
        id,
        ride_id,
        owner_id,
        COALESCE(NULLIF(status, ''), 'active') AS status,
        created_at,
        updated_at,
        payload
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        ride_id text,
        owner_id text,
        status text,
        created_at timestamptz,
        updated_at timestamptz,
        payload jsonb
      )
    ),
    upserted AS (
      INSERT INTO app_shared_ride_requests (id, ride_id, owner_id, status, created_at, updated_at, payload)
      SELECT
        id,
        ride_id,
        owner_id,
        status,
        COALESCE(created_at, NOW()),
        COALESCE(updated_at, NOW()),
        payload
      FROM incoming
      ON CONFLICT (id)
      DO UPDATE SET
        ride_id = EXCLUDED.ride_id,
        owner_id = EXCLUDED.owner_id,
        status = EXCLUDED.status,
        updated_at = NOW(),
        payload = EXCLUDED.payload
      RETURNING id
    )
    DELETE FROM app_shared_ride_requests current_rows
    WHERE NOT EXISTS (
      SELECT 1 FROM incoming incoming_rows WHERE incoming_rows.id = current_rows.id
    )
    `,
    [toJsonParam(rows)]
  );
}

async function readStoreFromDb(pool) {
  const result = await pool.query(
    `
    SELECT
      COALESCE((SELECT jsonb_agg(payload ORDER BY created_at DESC, id DESC) FROM app_users), '[]'::jsonb) AS users,
      COALESCE((SELECT jsonb_agg(payload ORDER BY created_at DESC, id DESC) FROM app_rides), '[]'::jsonb) AS rides,
      COALESCE((SELECT jsonb_agg(payload ORDER BY created_at DESC, id DESC) FROM app_bus_routes), '[]'::jsonb) AS bus_routes,
      COALESCE((SELECT jsonb_agg(payload ORDER BY created_at DESC, id DESC) FROM app_bus_bookings), '[]'::jsonb) AS bus_bookings,
      COALESCE((SELECT jsonb_agg(payload ORDER BY created_at DESC, id DESC) FROM app_shared_ride_requests), '[]'::jsonb) AS shared_ride_requests,
      (SELECT version FROM app_store_meta WHERE key = $1) AS version
    `,
    [STORE_KEY]
  );

  const row = result.rows[0] || {};
  return normalizeStore({
    users: row.users,
    rides: row.rides,
    busRoutes: row.bus_routes,
    busBookings: row.bus_bookings,
    sharedRideRequests: row.shared_ride_requests,
    __version: Number(row.version || 1),
  });
}

async function writeStoreToDb(pool, store) {
  const normalizedStore = normalizeStore(store);
  const expectedVersion = Number(normalizedStore.__version || 1);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await client.query("SET CONSTRAINTS ALL DEFERRED");

    const versionResult = await client.query(
      "SELECT version FROM app_store_meta WHERE key = $1 FOR UPDATE",
      [STORE_KEY]
    );
    const currentVersion = Number(versionResult.rows[0]?.version || 1);

    if (expectedVersion !== currentVersion) {
      const versionError = new Error("Store was modified by another request. Please retry.");
      versionError.code = "STORE_VERSION_CONFLICT";
      throw versionError;
    }

    await replaceUsers(client, normalizedStore.users);
    await replaceBusRoutes(client, normalizedStore.busRoutes);
    await replaceRides(client, normalizedStore.rides);
    await replaceSharedRideRequests(client, normalizedStore.sharedRideRequests);
    await replaceBusBookings(client, normalizedStore.busBookings);

    await client.query(
      "UPDATE app_store_meta SET version = version + 1, updated_at = NOW() WHERE key = $1",
      [STORE_KEY]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function createStorage({ seedStore }) {
  const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "";
  if (!databaseUrl) {
    throw new Error("SUPABASE_DB_URL (or DATABASE_URL) is required. JSON file storage is disabled.");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX || 20),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000),
  });

  await pool.query(CREATE_SCHEMA_SQL);

  const snapshot = await readStoreFromDb(pool);
  const isEmpty =
    snapshot.users.length === 0 &&
    snapshot.rides.length === 0 &&
    snapshot.busRoutes.length === 0 &&
    snapshot.busBookings.length === 0 &&
    snapshot.sharedRideRequests.length === 0;

  if (isEmpty) {
    const bootstrapStore = loadBootstrapStore(seedStore);
    await writeStoreToDb(pool, { ...bootstrapStore, __version: 1 });
  }

  return {
    mode: "supabase-postgres",
    async readStore() {
      return cloneData(await readStoreFromDb(pool));
    },
    async writeStore(store) {
      await writeStoreToDb(pool, store);
    },
  };
}

module.exports = {
  createStorage,
};
