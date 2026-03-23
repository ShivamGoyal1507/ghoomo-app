-- Ghoomo Supabase schema for normalized transactional storage
-- Run this in the Supabase SQL editor if you want to pre-provision tables.

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
