create extension if not exists pgcrypto;

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
);

create index if not exists idx_users_role on users(role);
create index if not exists idx_users_online on users(online);
create index if not exists idx_users_bus_route on users(bus_route);

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
);

create index if not exists idx_rides_user_id on rides(user_id);
create index if not exists idx_rides_status on rides(status);
create index if not exists idx_rides_created_at on rides(created_at desc);
create index if not exists idx_rides_candidate_driver_ids on rides using gin(candidate_driver_ids);

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
);

create index if not exists idx_bus_routes_name on bus_routes(name);

create table if not exists bus_bookings (
  id text primary key,
  route_id text not null references bus_routes(id) on delete cascade,
  user_id text references users(id) on delete set null,
  seat_no integer,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bus_bookings_route_id on bus_bookings(route_id);
create index if not exists idx_bus_bookings_user_id on bus_bookings(user_id);

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
);

create index if not exists idx_shared_ride_requests_ride_id on shared_ride_requests(ride_id);
create index if not exists idx_shared_ride_requests_owner_id on shared_ride_requests(owner_id);
create index if not exists idx_shared_ride_requests_status on shared_ride_requests(status);
create index if not exists idx_shared_ride_requests_created_at on shared_ride_requests(created_at desc);
