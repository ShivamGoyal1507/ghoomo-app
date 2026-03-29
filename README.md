# ghoomo
Digitize ride coordination between IIT Ropar students and registered auto/cab drivers.

## Backend database (Supabase)

The backend now supports normalized PostgreSQL storage on Supabase.

- Schema file: `backend/supabase/schema.sql`
- Storage adapter: `backend/src/storage.js`
- API server: `backend/server.js`

### Tables

- `users`
- `rides`
- `bus_routes`
- `bus_bookings`
- `shared_ride_requests`

### Setup

1. Create a Supabase project.
2. Open SQL editor in Supabase and run `backend/supabase/schema.sql`.
3. In `backend/.env` set `SUPABASE_DB_URL` (see `backend/.env.example`).
4. Start backend from `backend/` with `npm start`.

### One-time migration from existing JSON data

If you want to import existing `backend/data/store.json` once:

1. Set `SUPABASE_BOOTSTRAP_FROM_JSON=true`.
2. Start backend once.
3. Set it back to `false`.

The bootstrap only runs when database tables are empty.
