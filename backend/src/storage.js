const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

// Load env from backend/.env and workspace .env so backend can run from either cwd.
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const DEFAULT_DATA_PATH = path.join(__dirname, "..", "data", "store.json");
const FILE_DATA_PATH =
  process.env.DATA_PATH ||
  path.join(process.env.DATA_DIR || path.join(__dirname, "..", "data"), "store.json");

const DB_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "";
const useSupabase = Boolean(DB_URL);

const pool = useSupabase
  ? new Pool({
      connectionString: DB_URL,
      ssl: { rejectUnauthorized: false },
      max: Number(process.env.DB_POOL_MAX || 10),
    })
  : null;

let initialized = false;

function createEmptyStore() {
  return {
    users: [],
    rides: [],
    busRoutes: [],
    busBookings: [],
    sharedRideRequests: [],
  };
}

function ensureDataFile() {
  const dataDir = path.dirname(FILE_DATA_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (fs.existsSync(FILE_DATA_PATH)) {
    return;
  }
  if (fs.existsSync(DEFAULT_DATA_PATH)) {
    fs.copyFileSync(DEFAULT_DATA_PATH, FILE_DATA_PATH);
    return;
  }
  fs.writeFileSync(FILE_DATA_PATH, JSON.stringify(createEmptyStore(), null, 2));
}

function normalizeStore(store) {
  return {
    users: Array.isArray(store.users) ? store.users : [],
    rides: Array.isArray(store.rides) ? store.rides : [],
    busRoutes: Array.isArray(store.busRoutes) ? store.busRoutes : [],
    busBookings: Array.isArray(store.busBookings) ? store.busBookings : [],
    sharedRideRequests: Array.isArray(store.sharedRideRequests) ? store.sharedRideRequests : [],
  };
}

async function bootstrapFromJsonIfConfigured() {
  if (!useSupabase || process.env.SUPABASE_BOOTSTRAP_FROM_JSON !== "true") {
    return;
  }

  ensureDataFile();
  const raw = fs.readFileSync(FILE_DATA_PATH, "utf8");
  const parsed = normalizeStore(JSON.parse(raw));

  const client = await pool.connect();
  try {
    const counts = await Promise.all([
      client.query("select count(*)::int as count from users"),
      client.query("select count(*)::int as count from rides"),
      client.query("select count(*)::int as count from bus_routes"),
      client.query("select count(*)::int as count from shared_ride_requests"),
    ]);

    const totalRows = counts.reduce((sum, result) => sum + Number(result.rows[0].count || 0), 0);
    if (totalRows > 0) {
      return;
    }
  } finally {
    client.release();
  }

  await writeStore(parsed);
}

async function initStorage() {
  if (initialized) return;

  if (!useSupabase) {
    ensureDataFile();
    initialized = true;
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query(`
      create table if not exists users (
        id text primary key,
        name text not null,
        email text not null unique,
        phone text,
        password text not null,
        role text not null check (role in ('user', 'driver', 'admin')),
        city text,
        emergency_contact text,
        vehicle_type text,
        vehicle_no text,
        license_number text,
        rating numeric(3,2),
        online boolean not null default false,
        current_location jsonb,
        bus_route text,
        employee_id text,
        organization text,
        push_token text,
        last_seen_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    await client.query("create index if not exists idx_users_role on users(role)");
    await client.query("create index if not exists idx_users_online on users(online)");
    await client.query("create index if not exists idx_users_bus_route on users(bus_route)");

    await client.query(`
      create table if not exists rides (
        id text primary key,
        type text not null default 'ride',
        user_id text not null references users(id) on delete cascade,
        ride_type text not null,
        is_share boolean not null default false,
        pickup jsonb not null,
        dropoff jsonb not null,
        route jsonb,
        fare numeric(10,2),
        distance numeric(10,2),
        duration_minutes integer,
        status text not null,
        otp text,
        otp_verified_at timestamptz,
        driver jsonb,
        candidate_driver_ids text[] not null default '{}',
        requested_drivers jsonb not null default '[]'::jsonb,
        shared_seats_wanted integer,
        shared_seats_joined integer,
        accepted_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    await client.query("create index if not exists idx_rides_user_id on rides(user_id)");
    await client.query("create index if not exists idx_rides_status on rides(status)");
    await client.query("create index if not exists idx_rides_created_at on rides(created_at desc)");
    await client.query("create index if not exists idx_rides_candidate_driver_ids on rides using gin(candidate_driver_ids)");

    await client.query(`
      create table if not exists bus_routes (
        id text primary key,
        name text not null unique,
        from_stop text not null,
        to_stop text not null,
        departure_time text not null,
        return_time text not null,
        total_seats integer not null,
        waiting_seats integer not null,
        fare numeric(10,2) not null,
        booked_seats integer[] not null default '{}',
        stops text[] not null default '{}',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    await client.query("create index if not exists idx_bus_routes_name on bus_routes(name)");

    await client.query(`
      create table if not exists bus_bookings (
        id text primary key,
        route_id text not null references bus_routes(id) on delete cascade,
        user_id text references users(id) on delete set null,
        seat_no integer,
        status text,
        payload jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    await client.query("create index if not exists idx_bus_bookings_route_id on bus_bookings(route_id)");
    await client.query("create index if not exists idx_bus_bookings_user_id on bus_bookings(user_id)");

    await client.query(`
      create table if not exists shared_ride_requests (
        id text primary key,
        ride_id text not null references rides(id) on delete cascade,
        owner_id text not null references users(id) on delete cascade,
        owner_name text,
        ride_type text,
        pickup jsonb,
        dropoff jsonb,
        requested_seats integer not null default 0,
        accepted_users jsonb not null default '[]'::jsonb,
        status text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    await client.query("create index if not exists idx_shared_ride_requests_ride_id on shared_ride_requests(ride_id)");
    await client.query("create index if not exists idx_shared_ride_requests_owner_id on shared_ride_requests(owner_id)");
    await client.query("create index if not exists idx_shared_ride_requests_status on shared_ride_requests(status)");
    await client.query("create index if not exists idx_shared_ride_requests_created_at on shared_ride_requests(created_at desc)");

    await client.query("commit");
    initialized = true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  await bootstrapFromJsonIfConfigured();
}

async function readStore() {
  if (!useSupabase) {
    ensureDataFile();
    const store = JSON.parse(fs.readFileSync(FILE_DATA_PATH, "utf8"));
    return normalizeStore(store);
  }

  await initStorage();
  const client = await pool.connect();
  try {
    const [usersResult, ridesResult, busRoutesResult, busBookingsResult, sharedResult] = await Promise.all([
      client.query("select * from users"),
      client.query("select * from rides order by created_at desc"),
      client.query("select * from bus_routes order by created_at asc"),
      client.query("select * from bus_bookings order by created_at desc"),
      client.query("select * from shared_ride_requests order by created_at desc"),
    ]);

    return {
      users: usersResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        password: row.password,
        role: row.role,
        city: row.city,
        emergencyContact: row.emergency_contact,
        vehicleType: row.vehicle_type,
        vehicleNo: row.vehicle_no,
        licenseNumber: row.license_number,
        rating: row.rating == null ? undefined : Number(row.rating),
        online: row.online,
        currentLocation: row.current_location || undefined,
        busRoute: row.bus_route,
        employeeId: row.employee_id,
        organization: row.organization,
        pushToken: row.push_token,
        lastSeenAt: row.last_seen_at,
      })),
      rides: ridesResult.rows.map((row) => ({
        id: row.id,
        type: row.type,
        userId: row.user_id,
        rideType: row.ride_type,
        isShare: row.is_share,
        pickup: row.pickup,
        drop: row.dropoff,
        route: row.route,
        fare: row.fare == null ? undefined : Number(row.fare),
        distance: row.distance == null ? undefined : Number(row.distance),
        durationMinutes: row.duration_minutes,
        status: row.status,
        otp: row.otp,
        otpVerifiedAt: row.otp_verified_at,
        driver: row.driver || null,
        candidateDriverIds: Array.isArray(row.candidate_driver_ids) ? row.candidate_driver_ids : [],
        requestedDrivers: Array.isArray(row.requested_drivers) ? row.requested_drivers : [],
        sharedSeatsWanted: row.shared_seats_wanted,
        sharedSeatsJoined: row.shared_seats_joined,
        acceptedAt: row.accepted_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      busRoutes: busRoutesResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        from: row.from_stop,
        to: row.to_stop,
        departureTime: row.departure_time,
        returnTime: row.return_time,
        totalSeats: row.total_seats,
        waitingSeats: row.waiting_seats,
        fare: row.fare == null ? 0 : Number(row.fare),
        bookedSeats: Array.isArray(row.booked_seats) ? row.booked_seats : [],
        stops: Array.isArray(row.stops) ? row.stops : [],
      })),
      busBookings: busBookingsResult.rows.map((row) => ({
        id: row.id,
        routeId: row.route_id,
        userId: row.user_id,
        seatNo: row.seat_no,
        status: row.status,
        ...(row.payload || {}),
      })),
      sharedRideRequests: sharedResult.rows.map((row) => ({
        id: row.id,
        rideId: row.ride_id,
        ownerId: row.owner_id,
        ownerName: row.owner_name,
        rideType: row.ride_type,
        pickup: row.pickup,
        drop: row.dropoff,
        requestedSeats: row.requested_seats,
        acceptedUsers: Array.isArray(row.accepted_users) ? row.accepted_users : [],
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  } finally {
    client.release();
  }
}

async function deleteMissingIds(client, tableName, ids) {
  if (!ids.length) {
    await client.query(`delete from ${tableName}`);
    return;
  }
  await client.query(`delete from ${tableName} where not (id = any($1::text[]))`, [ids]);
}

async function writeStore(store) {
  const normalized = normalizeStore(store);

  if (!useSupabase) {
    ensureDataFile();
    fs.writeFileSync(FILE_DATA_PATH, JSON.stringify(normalized, null, 2));
    return;
  }

  await initStorage();
  const client = await pool.connect();
  try {
    await client.query("begin isolation level serializable");

    for (const user of normalized.users) {
      await client.query(
        `
          insert into users (
            id, name, email, phone, password, role, city, emergency_contact, vehicle_type, vehicle_no,
            license_number, rating, online, current_location, bus_route, employee_id, organization,
            push_token, last_seen_at, updated_at
          )
          values (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,
            $18,$19,now()
          )
          on conflict (id) do update set
            name = excluded.name,
            email = excluded.email,
            phone = excluded.phone,
            password = excluded.password,
            role = excluded.role,
            city = excluded.city,
            emergency_contact = excluded.emergency_contact,
            vehicle_type = excluded.vehicle_type,
            vehicle_no = excluded.vehicle_no,
            license_number = excluded.license_number,
            rating = excluded.rating,
            online = excluded.online,
            current_location = excluded.current_location,
            bus_route = excluded.bus_route,
            employee_id = excluded.employee_id,
            organization = excluded.organization,
            push_token = excluded.push_token,
            last_seen_at = excluded.last_seen_at,
            updated_at = now()
        `,
        [
          user.id,
          user.name,
          user.email,
          user.phone || null,
          user.password,
          user.role,
          user.city || null,
          user.emergencyContact || null,
          user.vehicleType || null,
          user.vehicleNo || null,
          user.licenseNumber || null,
          user.rating == null ? null : Number(user.rating),
          Boolean(user.online),
          user.currentLocation || null,
          user.busRoute || null,
          user.employeeId || null,
          user.organization || null,
          user.pushToken || null,
          user.lastSeenAt || null,
        ]
      );
    }
    await deleteMissingIds(client, "users", normalized.users.map((entry) => entry.id));

    for (const route of normalized.busRoutes) {
      await client.query(
        `
          insert into bus_routes (
            id, name, from_stop, to_stop, departure_time, return_time,
            total_seats, waiting_seats, fare, booked_seats, stops, updated_at
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
          on conflict (id) do update set
            name = excluded.name,
            from_stop = excluded.from_stop,
            to_stop = excluded.to_stop,
            departure_time = excluded.departure_time,
            return_time = excluded.return_time,
            total_seats = excluded.total_seats,
            waiting_seats = excluded.waiting_seats,
            fare = excluded.fare,
            booked_seats = excluded.booked_seats,
            stops = excluded.stops,
            updated_at = now()
        `,
        [
          route.id,
          route.name,
          route.from,
          route.to,
          route.departureTime,
          route.returnTime,
          Number(route.totalSeats || 0),
          Number(route.waitingSeats || 0),
          Number(route.fare || 0),
          Array.isArray(route.bookedSeats) ? route.bookedSeats : [],
          Array.isArray(route.stops) ? route.stops : [],
        ]
      );
    }
    await deleteMissingIds(client, "bus_routes", normalized.busRoutes.map((entry) => entry.id));

    for (const ride of normalized.rides) {
      await client.query(
        `
          insert into rides (
            id, type, user_id, ride_type, is_share, pickup, dropoff, route, fare, distance,
            duration_minutes, status, otp, otp_verified_at, driver, candidate_driver_ids,
            requested_drivers, shared_seats_wanted, shared_seats_joined, accepted_at, created_at, updated_at
          )
          values (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,
            $17,$18,$19,$20,$21,coalesce($22, now())
          )
          on conflict (id) do update set
            type = excluded.type,
            user_id = excluded.user_id,
            ride_type = excluded.ride_type,
            is_share = excluded.is_share,
            pickup = excluded.pickup,
            dropoff = excluded.dropoff,
            route = excluded.route,
            fare = excluded.fare,
            distance = excluded.distance,
            duration_minutes = excluded.duration_minutes,
            status = excluded.status,
            otp = excluded.otp,
            otp_verified_at = excluded.otp_verified_at,
            driver = excluded.driver,
            candidate_driver_ids = excluded.candidate_driver_ids,
            requested_drivers = excluded.requested_drivers,
            shared_seats_wanted = excluded.shared_seats_wanted,
            shared_seats_joined = excluded.shared_seats_joined,
            accepted_at = excluded.accepted_at,
            updated_at = coalesce(excluded.updated_at, now())
        `,
        [
          ride.id,
          ride.type || "ride",
          ride.userId,
          ride.rideType,
          Boolean(ride.isShare),
          ride.pickup || null,
          ride.drop || null,
          ride.route || null,
          ride.fare == null ? null : Number(ride.fare),
          ride.distance == null ? null : Number(ride.distance),
          ride.durationMinutes == null ? null : Number(ride.durationMinutes),
          ride.status,
          ride.otp || null,
          ride.otpVerifiedAt || null,
          ride.driver || null,
          Array.isArray(ride.candidateDriverIds) ? ride.candidateDriverIds : [],
          Array.isArray(ride.requestedDrivers) ? ride.requestedDrivers : [],
          ride.sharedSeatsWanted == null ? null : Number(ride.sharedSeatsWanted),
          ride.sharedSeatsJoined == null ? null : Number(ride.sharedSeatsJoined),
          ride.acceptedAt || null,
          ride.createdAt || new Date().toISOString(),
          ride.updatedAt || null,
        ]
      );
    }
    await deleteMissingIds(client, "rides", normalized.rides.map((entry) => entry.id));

    for (const request of normalized.sharedRideRequests) {
      await client.query(
        `
          insert into shared_ride_requests (
            id, ride_id, owner_id, owner_name, ride_type, pickup, dropoff,
            requested_seats, accepted_users, status, created_at, updated_at
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,coalesce($12, now()))
          on conflict (id) do update set
            ride_id = excluded.ride_id,
            owner_id = excluded.owner_id,
            owner_name = excluded.owner_name,
            ride_type = excluded.ride_type,
            pickup = excluded.pickup,
            dropoff = excluded.dropoff,
            requested_seats = excluded.requested_seats,
            accepted_users = excluded.accepted_users,
            status = excluded.status,
            updated_at = coalesce(excluded.updated_at, now())
        `,
        [
          request.id,
          request.rideId,
          request.ownerId,
          request.ownerName || null,
          request.rideType || null,
          request.pickup || null,
          request.drop || null,
          Number(request.requestedSeats || 0),
          Array.isArray(request.acceptedUsers) ? request.acceptedUsers : [],
          request.status,
          request.createdAt || new Date().toISOString(),
          request.updatedAt || null,
        ]
      );
    }
    await deleteMissingIds(client, "shared_ride_requests", normalized.sharedRideRequests.map((entry) => entry.id));

    for (const booking of normalized.busBookings) {
      await client.query(
        `
          insert into bus_bookings (id, route_id, user_id, seat_no, status, payload, created_at, updated_at)
          values ($1,$2,$3,$4,$5,$6,$7,coalesce($8, now()))
          on conflict (id) do update set
            route_id = excluded.route_id,
            user_id = excluded.user_id,
            seat_no = excluded.seat_no,
            status = excluded.status,
            payload = excluded.payload,
            updated_at = coalesce(excluded.updated_at, now())
        `,
        [
          booking.id,
          booking.routeId,
          booking.userId || null,
          booking.seatNo == null ? null : Number(booking.seatNo),
          booking.status || null,
          booking,
          booking.createdAt || new Date().toISOString(),
          booking.updatedAt || null,
        ]
      );
    }
    await deleteMissingIds(client, "bus_bookings", normalized.busBookings.map((entry) => entry.id));

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  initStorage,
  readStore,
  writeStore,
  useSupabase,
};
