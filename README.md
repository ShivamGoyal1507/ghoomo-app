# Ghoomo

Smart campus mobility platform for students, drivers, and administrators.

Ghoomo digitizes day-to-day transportation operations with role-based experiences for:
- Riders (book rides, track trips, book campus buses)
- Drivers (accept rides, share live location, verify bus bookings)
- Admins (manage routes and monitor platform activity)

## Why Ghoomo

Campus transportation typically involves fragmented communication, uncertain ETAs, and manual coordination. Ghoomo addresses this by combining:
- Real-time ride lifecycle updates
- Role-based workflows
- Bus route + seat booking with waitlist handling
- Firebase-powered authentication with Google Sign-In

## Product Capabilities

### Rider App (User)
- Email/password + Google authentication
- Select ride type (bike, auto, cab, share variants)
- Create and track rides from pending to completion
- Book bus seats with QR-ready booking flow
- View ride history and shared rides

### Driver App
- Role-aware experience for cab/auto drivers and bus drivers
- Online/offline availability control
- Background location sync for live tracking
- Ride status updates and OTP verification flow
- Driver history and profile management

### Admin App
- Admin dashboard overview
- Add and manage bus routes
- Platform oversight for operational continuity

## System Workflow

### 1. Authentication and Role Resolution
1. User signs in via email/password or Google OAuth.
2. Firebase Auth validates identity.
3. Firestore user profile stores role (`user`, `driver`, `admin`).
4. App routes to role-specific navigator:
	- User -> User tabs + ride flow
	- Driver -> Driver flow (bus or non-bus)
	- Admin -> Admin dashboard

### 2. Ride Booking Lifecycle
1. Rider requests quote and creates ride.
2. Backend assigns/updates ride state (`pending`, `accepted`, `arrived`, `in_progress`, `completed`, `cancelled`).
3. Driver and rider receive near real-time updates.
4. Completion updates history and analytics surfaces.

### 3. Bus Booking Lifecycle
1. Admin creates bus routes.
2. Riders view routes and seat availability.
3. Booking is confirmed or placed in waitlist based on capacity.
4. Driver verifies boarding using booking identity/QR metadata.
5. Realtime route-booking updates keep seat counts accurate.

## Architecture Overview

```text
React Native (Expo) App
  |-- Auth + Profile: Firebase Auth + Firestore
  |-- State: Redux Toolkit
  |-- Navigation: React Navigation (role-based)
  |-- Services: REST API + background location
			  |
			  v
Node.js Backend (HTTP + WebSocket)
  |-- Auth sync + role-aware APIs
  |-- Ride, bus route, booking, and shared-ride endpoints
  |-- Realtime event broadcast for active ride/bus sessions
			  |
			  v
PostgreSQL / Supabase-backed storage layer
```

## Tech Stack

### Frontend (Mobile)
- React Native 0.81 + Expo 54
- React Navigation (stack + tabs)
- Redux Toolkit + React Redux
- Firebase Auth + Firestore
- Expo Location + Task Manager (background tracking)
- Expo Notifications

### Backend
- Node.js (>=18)
- HTTP server + WebSocket (`ws`)
- PostgreSQL driver (`pg`)
- `dotenv` configuration

### Data and Auth
- Firebase Authentication (email/password + Google)
- Firestore user profile + role metadata
- PostgreSQL/Supabase normalized app storage

### Dev and Build
- EAS build profiles for Android
- Expo CLI for local development
- TypeScript tooling in workspace (mixed JS/TS codebase)

## Repository Layout

```text
ghoomo-app/
  src/                 # React Native app source
	 navigation/        # Role-based navigation containers
	 screens/           # User/Driver/Admin/Auth screens
	 services/          # API, Firebase, notifications, realtime
	 store/             # Redux store and slices
  backend/             # Node backend
	 server.js          # APIs + websocket events
	 storage.js         # Postgres/Supabase storage adapter
  data/                # Seed/local data artifacts
  docs/                # Product and pitch documentation
```

## Local Setup

### Prerequisites
- Node.js 18+
- npm
- Expo CLI (via `npx expo`)
- Firebase project with Auth + Firestore enabled
- PostgreSQL/Supabase database connection string
- Android Studio emulator and/or iOS Simulator

### 1. Install dependencies

```bash
npm install
cd backend && npm install
```

### 2. Configure environment files

Create app env:

```bash
cp .env.example .env
```

Create backend env:

```bash
cp backend/.env.example backend/.env
```

Important variables to set:

```bash
# Mobile app (.env)
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=

EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID=

# Backend (backend/.env)
PORT=4000
SUPABASE_DB_URL=postgresql://<user>:<password>@<host>:5432/<db>
# or
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>
```

Note: backend storage requires `SUPABASE_DB_URL` or `DATABASE_URL`.

### 3. Run backend

```bash
cd backend
npm start
```

### 4. Run mobile app

```bash
npm start
```

Then launch using Expo QR / simulator.

## Presentation-Ready Demo Workflow

Use this sequence in your pitch/demo:

1. Problem Statement
	- Campus commute friction: availability, trust, and coordination gaps.
2. Solution Positioning
	- Ghoomo as a unified rider-driver-admin mobility platform.
3. Authentication Demo
	- Google Sign-In and role-based routing.
4. Rider Journey
	- Select ride type -> request -> track trip -> view history.
5. Driver Journey
	- Go online -> accept/update ride -> live location behavior.
6. Bus Use Case
	- Show route seats, booking, waitlist/verification concept.
7. Admin Journey
	- Add/manage route and monitor system activity.
8. Tech Credibility Slide
	- React Native + Expo, Firebase auth, Node backend, PostgreSQL/Supabase.
9. Scale and Future Scope
	- Pricing optimization, safety analytics, institutional integrations.

## API Domains (High-Level)

- Authentication: login, register, Google login sync
- Rides: quote, create, status updates, history
- Drivers: availability, location updates, dashboard
- Bus: routes, booking, cancellation, verification
- Shared rides: list, join, close
- Admin: dashboard summaries

## Security and Production Notes

- Keep all `.env` files out of version control.
- Validate Firebase and Firestore security rules before production.
- Use HTTPS endpoints in production environments.
- Add stricter rate-limiting and token verification for backend auth routes.

## Documentation Pointers

- `FIREBASE_SETUP.md`
- `AUTH_QUICK_REFERENCE.md`
- `GOOGLE_AUTH_IMPLEMENTATION.md`
- `API_DOCUMENTATION.md` (under backend)

## License

This project is licensed under the MIT License.
