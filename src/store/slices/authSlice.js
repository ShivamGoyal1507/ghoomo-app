
import { createSlice } from "@reduxjs/toolkit";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../../services/api";
import { registerPushTokenForUser, unregisterPushTokenForUser } from "../../services/notifications";
import {
  signUpWithEmail,
  signInWithEmail,
  handleGoogleSignIn,
  signOutUser,
  getFirebaseToken,
} from "../../services/firebaseAuth";

const AUTH_STORAGE_KEY = "ghoomo.auth.user";

const initialState = {
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null,
  hydrated: false,
  firebaseUser: null,
  authMethod: null, // 'email' or 'google'
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    loginStart: (state) => { state.loading = true; state.error = null; },
    loginSuccess: (state, action) => {
      state.loading = false;
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.firebaseUser = action.payload.firebaseUser;
      state.authMethod = action.payload.authMethod;
      state.error = null;
      state.hydrated = true;
    },
    loginFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
      state.hydrated = true;
    },
    logout: (state) => {
      state.user = null;
      state.firebaseUser = null;
      state.isAuthenticated = false;
      state.error = null;
      state.hydrated = true;
      state.authMethod = null;
    },
    updateProfile: (state, action) => {
      state.user = { ...state.user, ...action.payload };
    },
    restoreSession: (state, action) => {
      const userData = action.payload;
      state.user = userData ? { ...userData } : null;
      state.firebaseUser = userData?.firebaseUser || null;
      state.authMethod = userData?.authMethod || null;
      state.isAuthenticated = Boolean(userData);
      state.loading = false;
      state.error = null;
      state.hydrated = true;
    },
  },
});

export const { loginStart, loginSuccess, loginFailure, logout, updateProfile, restoreSession } = authSlice.actions;

export const loginUser = (email, password) => async (dispatch) => {
  dispatch(loginStart());
  try {
    // Backend remains source of truth for seeded test users.
    const { user } = await api.login(email, password);

    let firebaseUser = null;
    let authMethod = "email";

    // If backend user is linked to Firebase, Firebase auth must succeed.
    // If not linked (e.g., seeded local dummy users), allow legacy backend login.
    if (user.firebaseUid) {
      const firebaseResult = await signInWithEmail(email, password);
      if (!firebaseResult.success) {
        throw new Error(firebaseResult.error || "Unable to sign in with Firebase");
      }
      firebaseUser = firebaseResult.user;
    } else {
      authMethod = "legacy";
    }

    // Store combined user info
    const combinedUser = {
      id: user.id,
      uid: firebaseUser?.uid || user.firebaseUid || null,
      email: firebaseUser?.email || user.email,
      displayName: firebaseUser?.displayName || user.name,
      role: user.role || firebaseUser?.role,
      name: user.name,
      phone: user.phone,
      city: user.city,
      photoURL: firebaseUser?.photoURL || user.photoURL || null,
      vehicleType: user.vehicleType || null,
      vehicleNo: user.vehicleNo || null,
      licenseNumber: user.licenseNumber || null,
      busRoute: user.busRoute || null,
      employeeId: user.employeeId || null,
      organization: user.organization || null,
    };

    dispatch(loginSuccess({ user: combinedUser, firebaseUser, authMethod }));
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      ...combinedUser,
      firebaseUser,
      authMethod,
    }));
    await registerPushTokenForUser(user.id);
  } catch (error) {
    dispatch(loginFailure(error.message || "Unable to sign in"));
  }
};

export const registerUser = (userData) => async (dispatch) => {
  dispatch(loginStart());
  try {
    // Sign up with Firebase
    console.log("[Auth] Step 1: Starting Firebase signup for", userData.email);
    const firebaseResult = await signUpWithEmail(
      userData.email,
      userData.password,
      userData.name,
      userData.role
    );

    if (!firebaseResult.success) {
      console.error("[Auth] Firebase signup failed:", firebaseResult.error);
      throw new Error(`Firebase signup failed: ${firebaseResult.error}`);
    }

    console.log("[Auth] Step 1 ✓: Firebase signup successful, UID:", firebaseResult.user.uid);
    const firebaseUser = firebaseResult.user;

    // Call backend to create user record
    console.log("[Auth] Step 2: Creating backend user record");
    const { user } = await api.register(userData);
    console.log("[Auth] Step 2 ✓: Backend user created, ID:", user.id);

    // Store combined user info
    const combinedUser = {
      id: user.id,
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      role: user.role || firebaseUser.role,
      name: user.name,
      phone: user.phone,
      city: user.city,
      photoURL: firebaseUser.photoURL,
      vehicleType: user.vehicleType || null,
      vehicleNo: user.vehicleNo || null,
      licenseNumber: user.licenseNumber || null,
      busRoute: user.busRoute || null,
      employeeId: user.employeeId || null,
      organization: user.organization || null,
    };

    console.log("[Auth] Step 3: Storing auth data locally");
    dispatch(loginSuccess({ user: combinedUser, firebaseUser, authMethod: "email" }));
    console.log("[Auth] Step 3 ✓: Redux state updated, isAuthenticated =", true);
    
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      ...combinedUser,
      firebaseUser,
      authMethod: "email",
    }));
    
    console.log("[Auth] Step 4: Registering push token");
    try {
      await registerPushTokenForUser(user.id);
    } catch (tokenError) {
      console.warn("[Auth] Push token registration failed (non-blocking):", tokenError.message);
    }
    console.log("[Auth] ✓ Registration complete!");
  } catch (error) {
    console.error("[Auth] Registration error:", error.message, error.stack);
    dispatch(loginFailure(error.message || "Unable to register"));
  }
};

/**
 * Google sign-in/sign-up
 */
export const googleSignIn = (promptAsync, selectedRole = "user") => async (dispatch) => {
  dispatch(loginStart());
  try {
    // Sign in with Google via Firebase
    const firebaseResult = await handleGoogleSignIn(promptAsync, selectedRole);

    if (!firebaseResult.success) {
      throw new Error(firebaseResult.error);
    }

    const firebaseUser = firebaseResult.user;

    // Get Firebase ID token
    const tokenResult = await getFirebaseToken();
    if (!tokenResult.success) {
      throw new Error("Failed to get Firebase token");
    }

    // Call backend to create/update user with Firebase auth
    const { user } = await api.googleLogin({
      firebaseUid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      role: selectedRole,
      idToken: tokenResult.token,
    });

    // Store combined user info
    const combinedUser = {
      id: user.id,
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      role: user.role || firebaseUser.role,
      name: user.name || firebaseUser.displayName,
      phone: user.phone,
      city: user.city,
      photoURL: firebaseUser.photoURL,
      vehicleType: user.vehicleType || null,
      vehicleNo: user.vehicleNo || null,
      licenseNumber: user.licenseNumber || null,
      busRoute: user.busRoute || null,
      employeeId: user.employeeId || null,
      organization: user.organization || null,
    };

    dispatch(loginSuccess({ user: combinedUser, firebaseUser, authMethod: "google" }));
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      ...combinedUser,
      firebaseUser,
      authMethod: "google",
    }));
    await registerPushTokenForUser(user.id);
  } catch (error) {
    dispatch(loginFailure(error.message || "Unable to sign in with Google"));
  }
};

export const logoutUser = () => async (dispatch, getState) => {
  const userId = getState().auth.user?.id;
  await unregisterPushTokenForUser(userId);
  await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  await signOutUser();
  dispatch(logout());
};

export const hydrateAuthSession = () => async (dispatch) => {
  try {
    const storedUser = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    const parsedUser = storedUser ? JSON.parse(storedUser) : null;
    dispatch(restoreSession(parsedUser));
    if (parsedUser?.id) {
      await registerPushTokenForUser(parsedUser.id);
    }
  } catch (_error) {
    dispatch(restoreSession(null));
  }
};

export default authSlice.reducer;
