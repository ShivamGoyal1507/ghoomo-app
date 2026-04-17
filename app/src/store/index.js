
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice";
import bookingReducer from "./slices/bookingSlice";
import driverReducer from "./slices/driverSlice";
import busRoutesReducer from "./slices/busRoutesSlice";
import sharedRidesReducer from "./slices/sharedRidesSlice";
import navigationPreferencesReducer from "./slices/navigationPreferencesSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    booking: bookingReducer,
    driver: driverReducer,
    busRoutes: busRoutesReducer,
    sharedRides: sharedRidesReducer,
    navigationPreferences: navigationPreferencesReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }),
});
