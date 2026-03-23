
import { createSlice } from "@reduxjs/toolkit";
import { BOOKING_STATUS } from "../../constants";
import { api } from "../../services/api";
import { BUS_WAITLIST_LIMIT } from "../../utils/bus";
import { sendLocalNotification } from "../../services/notifications";

const generateId = () => "bk_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
const generateQR = (bookingId, userId, busId, seatNo, waitlistPosition) =>
  JSON.stringify({ bookingId, userId, busId, seatNo, waitlistPosition, ts: Date.now() });

const resequenceWaitingList = (bookings, routeId) => {
  const waitingBookings = bookings
    .filter((booking) => booking.routeId === routeId && booking.isWaiting && booking.status !== BOOKING_STATUS.CANCELLED)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  waitingBookings.forEach((booking, index) => {
    booking.waitlistPosition = index + 1;
    booking.qrCode = generateQR(booking.id, booking.userId, booking.routeId, booking.seatNumber, booking.waitlistPosition);
  });
};

const initialState = {
  activeBooking: null,
  bookingHistory: [],
  busBookings: [],
  currentQuote: null,
  loading: false,
  error: null,
};

const bookingSlice = createSlice({
  name: "booking",
  initialState,
  reducers: {
    requestStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    requestFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },
    setQuote: (state, action) => {
      state.loading = false;
      state.currentQuote = action.payload;
      state.error = null;
    },
    setActiveBooking: (state, action) => {
      state.loading = false;
      state.activeBooking = action.payload;
      state.currentQuote = action.payload
        ? {
            pickup: action.payload.pickup,
            drop: action.payload.drop,
            route: action.payload.route,
            estimate: {
              fare: action.payload.fare,
              distanceKm: action.payload.distance,
              durationMinutes: action.payload.durationMinutes,
            },
            driver: action.payload.driver,
            availability: {
              available: action.payload.status === BOOKING_STATUS.PENDING || Boolean(action.payload.driver),
              message:
                action.payload.status === BOOKING_STATUS.PENDING
                  ? `${action.payload.requestedDrivers?.length || 0} nearby drivers received your request.`
                  : action.payload.driver
                    ? `${action.payload.driver.name} is assigned to your ride.`
                    : "No online driver is currently assigned.",
            },
          }
        : null;
      state.error = null;
    },
    finalizeBooking: (state, action) => {
      state.loading = false;
      state.error = null;
      if (action.payload) {
        state.bookingHistory.unshift(action.payload);
      }
      state.activeBooking = null;
      state.currentQuote = null;
    },
    updateBookingStatus: (state, action) => {
      if (state.activeBooking) {
        state.activeBooking.status = action.payload;
        if (action.payload === BOOKING_STATUS.COMPLETED || action.payload === BOOKING_STATUS.CANCELLED) {
          state.bookingHistory.unshift({ ...state.activeBooking });
          state.activeBooking = null;
          state.currentQuote = null;
        }
      }
    },
    bookBusSeat: (state, action) => {
      const { routeId, seatNumber, userId, userName, isWaiting, waitlistPosition, bookingId: incomingBookingId } = action.payload;
      const existingActiveBooking = state.busBookings.find(
        (booking) =>
          booking.routeId === routeId &&
          booking.userId === userId &&
          booking.status !== BOOKING_STATUS.CANCELLED
      );
      if (existingActiveBooking) {
        state.error = "You already have an active booking for this bus route.";
        return;
      }
      const bookingId = incomingBookingId || generateId();
      const qrData = generateQR(bookingId, userId, routeId, seatNumber, waitlistPosition || null);
      const busBooking = {
        id: bookingId,
        type: 'bus',
        routeId,
        seatNumber: isWaiting ? null : seatNumber,
        waitlistPosition: isWaiting ? waitlistPosition : null,
        userId,
        userName,
        isWaiting,
        status: isWaiting ? 'waiting' : BOOKING_STATUS.ACCEPTED,
        verified: false,
        verifiedAt: null,
        verifiedBy: null,
        qrCode: qrData,
        createdAt: new Date().toISOString(),
      };
      state.busBookings.push(busBooking);
      state.bookingHistory.unshift(busBooking);
      if (isWaiting) {
        resequenceWaitingList(state.busBookings, routeId);
        resequenceWaitingList(state.bookingHistory, routeId);
      }
    },
    cancelBusBooking: (state, action) => {
      const { bookingId } = action.payload;
      const cancelledBooking = state.busBookings.find((booking) => booking.id === bookingId);
      if (cancelledBooking?.verified) {
        state.error = "Verified tickets cannot be cancelled.";
        return;
      }
      state.busBookings = state.busBookings.filter(b => b.id !== bookingId);
      const histIdx = state.bookingHistory.findIndex(b => b.id === bookingId);
      if (histIdx !== -1) {
        state.bookingHistory[histIdx].status = BOOKING_STATUS.CANCELLED;
      }
      if (!cancelledBooking) return;

      if (!cancelledBooking.isWaiting && typeof cancelledBooking.seatNumber === "number") {
        const nextWaiting = state.busBookings
          .filter((booking) => booking.routeId === cancelledBooking.routeId && booking.isWaiting && booking.status !== BOOKING_STATUS.CANCELLED)
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];

        if (nextWaiting) {
          nextWaiting.isWaiting = false;
          nextWaiting.status = BOOKING_STATUS.ACCEPTED;
          nextWaiting.seatNumber = cancelledBooking.seatNumber;
          nextWaiting.waitlistPosition = null;
          nextWaiting.qrCode = generateQR(
            nextWaiting.id,
            nextWaiting.userId,
            nextWaiting.routeId,
            nextWaiting.seatNumber,
            null
          );
          const historyBooking = state.bookingHistory.find((booking) => booking.id === nextWaiting.id);
          if (historyBooking) {
            historyBooking.isWaiting = false;
            historyBooking.status = BOOKING_STATUS.ACCEPTED;
            historyBooking.seatNumber = cancelledBooking.seatNumber;
            historyBooking.waitlistPosition = null;
            historyBooking.qrCode = nextWaiting.qrCode;
          }
        }
      }

      resequenceWaitingList(state.busBookings, cancelledBooking.routeId);
      resequenceWaitingList(state.bookingHistory, cancelledBooking.routeId);
    },
    verifyBusTicket: (state, action) => {
      const { bookingId, verifiedBy } = action.payload;
      const booking = state.busBookings.find((item) => item.id === bookingId);
      if (booking) {
        booking.verified = true;
        booking.verifiedAt = new Date().toISOString();
        booking.verifiedBy = verifiedBy;
      }
      const historyBooking = state.bookingHistory.find((item) => item.id === bookingId);
      if (historyBooking) {
        historyBooking.verified = true;
        historyBooking.verifiedAt = booking?.verifiedAt || new Date().toISOString();
        historyBooking.verifiedBy = verifiedBy;
      }
    },
    cancelActiveBooking: (state) => {
      if (state.activeBooking) {
        state.activeBooking.status = BOOKING_STATUS.CANCELLED;
        state.bookingHistory.unshift({ ...state.activeBooking });
        state.activeBooking = null;
        state.currentQuote = null;
      }
    },
    setHistory: (state, action) => {
      state.bookingHistory = [...action.payload, ...state.bookingHistory.filter((item) => item.type === "bus")];
    },
    setBusBookings: (state, action) => {
      state.busBookings = Array.isArray(action.payload) ? action.payload : [];
    },
  },
});

export const {
  requestStart,
  requestFailure,
  setQuote,
  setActiveBooking,
  finalizeBooking,
  updateBookingStatus,
  bookBusSeat,
  cancelBusBooking,
  verifyBusTicket,
  cancelActiveBooking,
  setHistory,
  setBusBookings,
} = bookingSlice.actions;

export const fetchRideQuote = (payload) => async (dispatch) => {
  dispatch(requestStart());
  try {
    const { pickup, drop, route, estimate, driver, availability } = await api.fetchQuote(payload);
    dispatch(setQuote({ pickup, drop, route, estimate, driver, availability }));
    return { pickup, drop, route, estimate, driver, availability };
  } catch (error) {
    dispatch(requestFailure(error.message || "Unable to fetch ride quote"));
    throw error;
  }
};

export const fetchBusBookings = (params = {}) => async (dispatch) => {
  try {
    const { busBookings } = await api.getBusBookings(params);
    dispatch(setBusBookings(busBookings || []));
    return busBookings || [];
  } catch (error) {
    dispatch(requestFailure(error.message || "Unable to load bus bookings"));
    throw error;
  }
};

export const createBusSeatBooking = (payload) => async (dispatch) => {
  dispatch(requestStart());
  try {
    const { booking } = await api.createBusBooking(payload);
    const { busBookings } = await api.getBusBookings();
    dispatch(setBusBookings(busBookings || []));
    dispatch(setQuote(null));
    return booking;
  } catch (error) {
    dispatch(requestFailure(error.message || "Unable to create bus booking"));
    throw error;
  }
};

export const cancelBusSeatBooking = (bookingId) => async (dispatch) => {
  dispatch(requestStart());
  try {
    await api.cancelBusBooking(bookingId);
    const { busBookings } = await api.getBusBookings();
    dispatch(setBusBookings(busBookings || []));
    return true;
  } catch (error) {
    dispatch(requestFailure(error.message || "Unable to cancel bus booking"));
    throw error;
  }
};

export const verifyBusTicketRemote = (bookingId, verifiedBy) => async (dispatch) => {
  dispatch(requestStart());
  try {
    await api.verifyBusBooking(bookingId, verifiedBy);
    const { busBookings } = await api.getBusBookings();
    dispatch(setBusBookings(busBookings || []));
    return true;
  } catch (error) {
    dispatch(requestFailure(error.message || "Unable to verify bus ticket"));
    throw error;
  }
};

export const createRideBooking = (payload) => async (dispatch) => {
  dispatch(requestStart());
  try {
    const { ride, sharedRequest } = await api.createRide(payload);
    await sendLocalNotification({
      key: `ride-created-${ride.id}`,
      title: ride.status === BOOKING_STATUS.PENDING ? "Ride request sent" : "Ride booked",
      body:
        ride.status === BOOKING_STATUS.PENDING
          ? `${ride.requestedDrivers?.length || 0} nearby drivers received your request.`
          : ride.driver
            ? `${ride.driver.name} has been assigned to your ride.`
            : "Your ride request has been created.",
      data: { rideId: ride.id, status: ride.status, role: "user" },
    });
    if (sharedRequest) {
      await sendLocalNotification({
        key: `shared-ride-created-${sharedRequest.id}`,
        title: "Shared ride request posted",
        body: `Your shared ${ride.rideType} request is live for ${sharedRequest.requestedSeats} co-rider${sharedRequest.requestedSeats === 1 ? "" : "s"}.`,
        data: { sharedRideRequestId: sharedRequest.id, rideId: ride.id, role: "user" },
      });
    }
    dispatch(setActiveBooking(ride));
    return ride;
  } catch (error) {
    dispatch(requestFailure(error.message || "Unable to create booking"));
    throw error;
  }
};

export const syncRideStatus = (rideId, status) => async (dispatch) => {
  dispatch(requestStart());
  try {
    const { ride } = await api.updateRideStatus(rideId, status);
    await sendLocalNotification({
      key: `ride-status-${ride.id}-${ride.status}`,
      title:
        ride.status === BOOKING_STATUS.COMPLETED
          ? "Ride completed"
          : ride.status === BOOKING_STATUS.CANCELLED
            ? "Ride cancelled"
            : "Ride updated",
      body:
        ride.status === BOOKING_STATUS.COMPLETED
          ? "Your trip has ended successfully."
          : ride.status === BOOKING_STATUS.CANCELLED
            ? "Your trip has been cancelled."
            : "Your ride status changed.",
      data: { rideId: ride.id, status: ride.status, role: "user" },
    });
    if (ride.status === BOOKING_STATUS.COMPLETED || ride.status === BOOKING_STATUS.CANCELLED) {
      dispatch(finalizeBooking(ride));
    } else {
      dispatch(setActiveBooking(ride));
    }
    return ride;
  } catch (error) {
    dispatch(requestFailure(error.message || "Unable to update ride"));
    throw error;
  }
};

export const fetchRideHistory = (userId) => async (dispatch) => {
  try {
    const { rides } = await api.getRideHistory(userId);
    dispatch(setHistory(rides));
  } catch (error) {
    dispatch(requestFailure(error.message || "Unable to load ride history"));
  }
};

export const refreshActiveRide = (rideId) => async (dispatch, getState) => {
  try {
    const previousRide = getState().booking.activeBooking;
    const { ride } = await api.getRide(rideId);
    if (previousRide?.id === ride.id && previousRide.driver?.id !== ride.driver?.id && ride.driver?.name) {
      await sendLocalNotification({
        key: `ride-driver-${ride.id}-${ride.driver.id}`,
        title: "Driver updated",
        body: `${ride.driver.name} is now assigned to your trip.`,
        data: { rideId: ride.id, driverId: ride.driver.id, role: "user" },
      });
    }
    if (previousRide?.id === ride.id && previousRide.status !== ride.status) {
      await sendLocalNotification({
        key: `ride-status-${ride.id}-${ride.status}`,
        title:
          ride.status === BOOKING_STATUS.IN_PROGRESS
            ? "Ride started"
            : ride.status === BOOKING_STATUS.COMPLETED
              ? "Ride completed"
              : ride.status === BOOKING_STATUS.CANCELLED
                ? "Ride cancelled"
                : "Ride updated",
        body:
          ride.status === BOOKING_STATUS.IN_PROGRESS
            ? "Your driver verified the OTP and the trip is now live."
            : ride.status === BOOKING_STATUS.COMPLETED
              ? "Your trip has been completed."
              : ride.status === BOOKING_STATUS.CANCELLED
                ? "Your trip was cancelled."
                : "There is a live update for your ride.",
        data: { rideId: ride.id, status: ride.status, role: "user" },
      });
    }
    if (ride.status === BOOKING_STATUS.COMPLETED || ride.status === BOOKING_STATUS.CANCELLED) {
      dispatch(finalizeBooking(ride));
    } else {
      dispatch(setActiveBooking(ride));
    }
    return ride;
  } catch (error) {
    dispatch(requestFailure(error.message || "Unable to refresh ride"));
    throw error;
  }
};

export default bookingSlice.reducer;
