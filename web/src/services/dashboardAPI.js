import api from './api';
import { hasSupabaseConfig, supabase } from './supabaseClient';

const BOOKING_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const USER_ROLES = {
  USER: 'user',
  DRIVER: 'driver',
  ADMIN: 'admin',
};

const ACTIVE_RIDE_STATUSES = new Set([
  BOOKING_STATUS.ACCEPTED,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.IN_PROGRESS,
]);

function toUserModel(row) {
  return {
    id: row.id,
    ...(row.payload || {}),
    role: row.role || row.payload?.role,
  };
}

function toRideModel(row) {
  return {
    id: row.id,
    status: row.status,
    ...(row.payload || {}),
    userId: row.user_id || row.payload?.userId,
    driverId: row.driver_id || row.payload?.driverId,
    createdAt: row.created_at || row.payload?.createdAt,
    updatedAt: row.updated_at || row.payload?.updatedAt,
  };
}

function toRouteModel(row) {
  return {
    id: row.id,
    name: row.name,
    ...(row.payload || {}),
  };
}

function toBusBookingModel(row) {
  return {
    id: row.id,
    status: row.status,
    ...(row.payload || {}),
    routeId: row.route_id || row.payload?.routeId,
    userId: row.user_id || row.payload?.userId,
    createdAt: row.created_at || row.payload?.createdAt,
    updatedAt: row.updated_at || row.payload?.updatedAt,
  };
}

function mapRouteWithAvailability(route, busBookings) {
  const routeBookings = busBookings.filter(
    (booking) => booking.routeId === route.id && booking.status !== BOOKING_STATUS.CANCELLED
  );
  const booked = routeBookings.filter((booking) => !booking.isWaiting).length;
  const waiting = routeBookings.filter((booking) => booking.isWaiting).length;
  const totalSeats = Number(route.totalSeats || 0);

  return {
    ...route,
    bookedSeats: booked,
    availableSeats: Math.max(totalSeats - booked, 0),
    waitingCount: waiting,
    loadFactor: totalSeats ? booked / totalSeats : 0,
  };
}

function mapRecentBookings({ rides, busBookings, routes }) {
  return [...rides, ...busBookings]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 10)
    .map((booking) => {
      if (booking.type === 'bus' || booking.routeId) {
        const route = routes.find((entry) => entry.id === booking.routeId);
        return {
          id: booking.id,
          type: 'bus',
          label: route?.name || booking.routeId,
          detail: booking.isWaiting
            ? `Waitlist #${booking.waitlistPosition || '-'}`
            : `Seat ${booking.seatNumber || '-'} • ${route?.from || ''} to ${route?.to || ''}`,
          status: booking.status,
          createdAt: booking.createdAt,
          userName: booking.userName || 'Passenger',
        };
      }

      return {
        id: booking.id,
        type: booking.rideType || booking.type || 'ride',
        label: `${booking.pickup?.name || booking.pickup || 'Pickup'} to ${booking.drop?.name || booking.drop || 'Drop'}`,
        detail: `${Number(booking.distance || booking.route?.distanceKm || 0).toFixed(1)} km • ${booking.durationMinutes || booking.route?.durationMinutes || 0} min`,
        fare: Number(booking.fare || 0),
        status: booking.status,
        createdAt: booking.createdAt,
        userId: booking.userId,
      };
    });
}

function assertSupabaseConfigured() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in web/.env.');
  }
}

async function fetchDashboardFromSupabase() {
  assertSupabaseConfigured();

  const [usersResult, ridesResult, routesResult, busBookingsResult] = await Promise.all([
    supabase.from('app_users').select('id, role, payload, created_at, updated_at'),
    supabase.from('app_rides').select('id, user_id, driver_id, status, payload, created_at, updated_at'),
    supabase.from('app_bus_routes').select('id, name, payload, created_at, updated_at'),
    supabase.from('app_bus_bookings').select('id, route_id, user_id, status, payload, created_at, updated_at'),
  ]);

  if (usersResult.error) throw usersResult.error;
  if (ridesResult.error) throw ridesResult.error;
  if (routesResult.error) throw routesResult.error;
  if (busBookingsResult.error) throw busBookingsResult.error;

  const allUsers = (usersResult.data || []).map(toUserModel);
  const rides = (ridesResult.data || []).map(toRideModel);
  const routes = (routesResult.data || []).map(toRouteModel);
  const busBookings = (busBookingsResult.data || []).map(toBusBookingModel);

  const users = allUsers.filter((user) => user.role === USER_ROLES.USER);
  const drivers = allUsers
    .filter((user) => user.role === USER_ROLES.DRIVER)
    .sort((a, b) => Number(Boolean(b.online)) - Number(Boolean(a.online)));
  const admins = allUsers.filter((user) => user.role === USER_ROLES.ADMIN);
  const activeRides = rides.filter((ride) => ACTIVE_RIDE_STATUSES.has(ride.status));
  const completedRides = rides.filter((ride) => ride.status === BOOKING_STATUS.COMPLETED);
  const activeDriverIds = new Set(activeRides.map((ride) => ride.driver?.id || ride.driverId).filter(Boolean));
  const confirmedBusBookings = busBookings.filter(
    (booking) => !booking.isWaiting && booking.status !== BOOKING_STATUS.CANCELLED
  );
  const waitingBusBookings = busBookings.filter(
    (booking) => booking.isWaiting && booking.status !== BOOKING_STATUS.CANCELLED
  );
  const totalRevenue = completedRides.reduce((sum, ride) => sum + Number(ride.fare || 0), 0);
  const routesWithAvailability = routes.map((route) => mapRouteWithAvailability(route, busBookings));

  return {
    stats: {
      totalUsers: users.length,
      totalDrivers: drivers.length,
      totalAdmins: admins.length,
      totalRides: rides.length,
      completedRides: completedRides.length,
      activeDrivers: drivers.filter((driver) => driver.online).length,
      driversOnTrip: activeDriverIds.size,
      totalRevenue,
      busBookings: confirmedBusBookings.length,
      waitingList: waitingBusBookings.length,
    },
    users,
    drivers,
    admins,
    rides,
    recentBookings: mapRecentBookings({ rides, busBookings, routes }),
    routes: routesWithAvailability,
  };
}

function withBackendFallback(supabaseHandler, backendHandler) {
  return async (...args) => {
    if (!hasSupabaseConfig) {
      return backendHandler(...args);
    }

    try {
      return await supabaseHandler(...args);
    } catch (error) {
      console.error('Supabase request failed, falling back to backend API:', error);
      return backendHandler(...args);
    }
  };
}

async function getDashboardFromBackend() {
  const response = await api.get('/admin/dashboard');
  return response.data || {};
}

export const dashboardAPI = {
  getStats: withBackendFallback(
    async () => ({ data: await fetchDashboardFromSupabase() }),
    async () => {
      const data = await getDashboardFromBackend();
      return { data };
    }
  ),

  getUsers: withBackendFallback(
    async () => {
      const data = await fetchDashboardFromSupabase();
      return { data: data.users || [] };
    },
    async () => {
      const data = await getDashboardFromBackend();
      return { data: data.users || [] };
    }
  ),

  getDrivers: withBackendFallback(
    async () => {
      const data = await fetchDashboardFromSupabase();
      return { data: data.drivers || [] };
    },
    async () => {
      const data = await getDashboardFromBackend();
      return { data: data.drivers || [] };
    }
  ),

  getRides: withBackendFallback(
    async (params = {}) => {
      const data = await fetchDashboardFromSupabase();
      const rides = data.rides || [];
      if (!params.status) {
        return { data: rides };
      }
      return { data: rides.filter((ride) => ride.status === params.status) };
    },
    async (params = {}) => {
      const data = await getDashboardFromBackend();
      const rides = data.rides || [];
      if (!params.status) {
        return { data: rides };
      }
      return { data: rides.filter((ride) => ride.status === params.status) };
    }
  ),

  getRoutes: withBackendFallback(
    async () => {
      const data = await fetchDashboardFromSupabase();
      return { data: data.routes || [] };
    },
    async () => {
      const data = await getDashboardFromBackend();
      return { data: data.routes || [] };
    }
  ),

  suspendUser: withBackendFallback(
    async (userId) => {
      const { data: row, error } = await supabase
        .from('app_users')
        .select('id, payload')
        .eq('id', userId)
        .single();
      if (error) throw error;
      const nextPayload = { ...(row.payload || {}), isActive: false };
      const { error: updateError } = await supabase
        .from('app_users')
        .update({ payload: nextPayload })
        .eq('id', userId);
      if (updateError) throw updateError;
      return { data: { success: true } };
    },
    () => Promise.reject(new Error('Suspend user is not available on this backend.'))
  ),

  activateUser: withBackendFallback(
    async (userId) => {
      const { data: row, error } = await supabase
        .from('app_users')
        .select('id, payload')
        .eq('id', userId)
        .single();
      if (error) throw error;
      const nextPayload = { ...(row.payload || {}), isActive: true };
      const { error: updateError } = await supabase
        .from('app_users')
        .update({ payload: nextPayload })
        .eq('id', userId);
      if (updateError) throw updateError;
      return { data: { success: true } };
    },
    () => Promise.reject(new Error('Activate user is not available on this backend.'))
  ),

  suspendDriver: withBackendFallback(
    async (driverId) => {
      const { data: row, error } = await supabase
        .from('app_users')
        .select('id, payload')
        .eq('id', driverId)
        .single();
      if (error) throw error;
      const nextPayload = { ...(row.payload || {}), online: false, isActive: false };
      const { error: updateError } = await supabase
        .from('app_users')
        .update({ payload: nextPayload })
        .eq('id', driverId);
      if (updateError) throw updateError;
      return { data: { success: true } };
    },
    () => Promise.reject(new Error('Suspend driver is not available on this backend.'))
  ),

  activateDriver: withBackendFallback(
    async (driverId) => {
      const { data: row, error } = await supabase
        .from('app_users')
        .select('id, payload')
        .eq('id', driverId)
        .single();
      if (error) throw error;
      const nextPayload = { ...(row.payload || {}), isActive: true };
      const { error: updateError } = await supabase
        .from('app_users')
        .update({ payload: nextPayload })
        .eq('id', driverId);
      if (updateError) throw updateError;
      return { data: { success: true } };
    },
    () => Promise.reject(new Error('Activate driver is not available on this backend.'))
  ),

  cancelRide: withBackendFallback(
    async (rideId) => {
      const { data: row, error } = await supabase
        .from('app_rides')
        .select('id, payload')
        .eq('id', rideId)
        .single();
      if (error) throw error;
      const nextPayload = {
        ...(row.payload || {}),
        status: BOOKING_STATUS.CANCELLED,
        updatedAt: new Date().toISOString(),
      };
      const { error: updateError } = await supabase
        .from('app_rides')
        .update({ status: BOOKING_STATUS.CANCELLED, payload: nextPayload })
        .eq('id', rideId);
      if (updateError) throw updateError;
      return { data: { success: true } };
    },
    () => Promise.reject(new Error('Cancel ride is not available on this backend.'))
  ),

  completeRide: withBackendFallback(
    async (rideId) => {
      const { data: row, error } = await supabase
        .from('app_rides')
        .select('id, payload')
        .eq('id', rideId)
        .single();
      if (error) throw error;
      const nextPayload = {
        ...(row.payload || {}),
        status: BOOKING_STATUS.COMPLETED,
        updatedAt: new Date().toISOString(),
      };
      const { error: updateError } = await supabase
        .from('app_rides')
        .update({ status: BOOKING_STATUS.COMPLETED, payload: nextPayload })
        .eq('id', rideId);
      if (updateError) throw updateError;
      return { data: { success: true } };
    },
    () => Promise.reject(new Error('Complete ride is not available on this backend.'))
  ),

  createRoute: withBackendFallback(
    async (data) => {
      const routeId = `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const stops = Array.isArray(data.stops)
        ? data.stops
        : String(data.stops || '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
      const payload = {
        id: routeId,
        name: data.name,
        from: data.startPoint || data.from,
        to: data.endPoint || data.to,
        stops,
        totalSeats: Number(data.totalSeats || 40),
        createdAt: now,
        updatedAt: now,
      };

      const { error } = await supabase.from('app_bus_routes').insert({
        id: routeId,
        name: payload.name,
        payload,
        created_at: now,
        updated_at: now,
      });
      if (error) throw error;
      return { data: payload };
    },
    async (data) => {
      const to12Hour = (timeValue) => {
        const raw = String(timeValue || '').trim();
        const matched = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
        if (!matched) return raw;

        const hours24 = Number(matched[1]);
        const minutes = matched[2];
        const suffix = hours24 >= 12 ? 'PM' : 'AM';
        const hours12 = hours24 % 12 || 12;
        return `${String(hours12).padStart(2, '0')}:${minutes} ${suffix}`;
      };

      const normalizedStops = (Array.isArray(data.stops) ? data.stops : [])
        .map((stop) => {
          if (typeof stop === 'string') {
            return { name: stop.trim(), time: '' };
          }

          return {
            name: String(stop?.name || stop?.stop || '').trim(),
            time: String(stop?.time || stop?.arrivalTime || '').trim(),
          };
        })
        .filter((stop) => stop.name);

      const stopNames = normalizedStops.map((stop) => stop.name);
      const firstTimedStop = normalizedStops.find((stop) => stop.time);
      const lastTimedStop = [...normalizedStops].reverse().find((stop) => stop.time);

      const payload = {
        name: data.name,
        from: data.startPoint || data.from,
        to: data.endPoint || data.to,
        departureTime: to12Hour(data.departureTime || firstTimedStop?.time || ''),
        returnTime: to12Hour(data.returnTime || lastTimedStop?.time || firstTimedStop?.time || ''),
        totalSeats: Number(data.totalSeats || 40),
        stops: stopNames,
      };

      const response = await api.post('/bus-routes', payload);
      return { data: response.data?.route || payload };
    }
  ),

  updateRoute: withBackendFallback(
    async (routeId, data) => {
      const { data: row, error } = await supabase
        .from('app_bus_routes')
        .select('id, name, payload')
        .eq('id', routeId)
        .single();
      if (error) throw error;
      const stops = Array.isArray(data.stops)
        ? data.stops
        : String(data.stops || row.payload?.stops || '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
      const payload = {
        ...(row.payload || {}),
        ...data,
        from: data.startPoint || data.from || row.payload?.from,
        to: data.endPoint || data.to || row.payload?.to,
        stops,
        updatedAt: new Date().toISOString(),
      };
      const { error: updateError } = await supabase
        .from('app_bus_routes')
        .update({ name: payload.name || row.name, payload })
        .eq('id', routeId);
      if (updateError) throw updateError;
      return { data: payload };
    },
    () => Promise.reject(new Error('Update route is not available on this backend.'))
  ),

  deleteRoute: withBackendFallback(
    async (routeId) => {
      const { error } = await supabase.from('app_bus_routes').delete().eq('id', routeId);
      if (error) throw error;
      return { data: { success: true } };
    },
    () => Promise.reject(new Error('Delete route is not available on this backend.'))
  ),

  getBusSchedule: withBackendFallback(
    async () => {
      // Supabase: could store in a settings table, for now use backend
      return api.get('/bus-schedule').then((res) => ({ data: res.data }));
    },
    async () => {
      const res = await api.get('/bus-schedule');
      return { data: res.data };
    }
  ),

  uploadBusSchedule: withBackendFallback(
    async (data) => {
      return api.post('/bus-schedule/upload', data).then((res) => ({ data: res.data }));
    },
    async (data) => {
      const res = await api.post('/bus-schedule/upload', data);
      return { data: res.data };
    }
  ),
};

export default dashboardAPI;
