// Firebase Authentication Service
import {
  signInWithCredential,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebaseConfig";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";

// Set up web browser for OAuth
WebBrowser.maybeCompleteAuthSession();

// Google OAuth Configuration - configure platform-specific IDs in .env
const DEFAULT_GOOGLE_CLIENT_ID =
  "1024739915849-mfbsap813iku307ui69toqo4ljnlo5k3.apps.googleusercontent.com";

function normalizeClientId(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

const legacyClientId = normalizeClientId(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID);
const envWebClientId = normalizeClientId(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
const envIosClientId = normalizeClientId(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
const envAndroidClientId = normalizeClientId(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID);
const envExpoClientId = normalizeClientId(process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID);

const baseClientId =
  envWebClientId || envIosClientId || envAndroidClientId || envExpoClientId || legacyClientId;

const webClientId = envWebClientId || baseClientId || DEFAULT_GOOGLE_CLIENT_ID;
const iosClientId = envIosClientId || webClientId;
const androidClientId = envAndroidClientId || webClientId;
const expoClientId = envExpoClientId || webClientId;

function getGoogleRedirectConfig() {
  const isExpoGo =
    Constants.appOwnership === "expo" ||
    Constants.executionEnvironment === "storeClient";

  // Expo Go must use proxy redirect URI.
  const redirectUri = AuthSession.makeRedirectUri({
    useProxy: isExpoGo,
    scheme: "ghoomo",
  });

  return { isExpoGo, redirectUri };
}

// Must be called directly in component body (it is a React hook).
export function useGoogleAuthRequest() {
  const { isExpoGo, redirectUri } = getGoogleRedirectConfig();
  console.log("[Google OAuth] Request config", {
    isExpoGo,
    redirectUri,
    webClientId,
    iosClientId,
    androidClientId,
    expoClientId,
  });

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId,
    iosClientId,
    androidClientId,
    expoClientId,
    redirectUri,
    responseType: "id_token",
    scopes: ["profile", "email"],
  });

  return { request, response, promptAsync };
}

/**
 * Sign up user with email and password
 */
export async function signUpWithEmail(email, password, displayName, role = "user") {
  try {
    // Create user in Firebase Auth
    console.log("[Firebase] Creating auth user for:", email);
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log("[Firebase] Auth user created, UID:", user.uid);

    // Update display name
    console.log("[Firebase] Updating profile for:", user.uid);
    await updateProfile(user, {
      displayName: displayName,
      photoURL: null,
    });
    console.log("[Firebase] Profile updated");

    // Create user document in Firestore with role and profile info (with 10s timeout)
    console.log("[Firebase] Creating Firestore user document (10s timeout)");
    
    const firestorePromise = setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email: user.email,
      displayName: displayName,
      role: role, // user, driver, admin
      authMethod: "email",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      photoURL: null,
      phone: null,
      city: null,
      isActive: true,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Firestore write timeout after 10s")),
        10000
      )
    );

    try {
      await Promise.race([firestorePromise, timeoutPromise]);
      console.log("[Firebase] Firestore user document created");
    } catch (firestoreError) {
      console.error("[Firebase] Firestore write warning (non-blocking):", firestoreError.message);
      console.log("[Firebase] Continuing with backend registration...");
      // Non-blocking failure - continue to backend registration
    }

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        role: role,
      },
    };
  } catch (error) {
    console.error("[Firebase] Sign up error:", error.message, error.code);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Sign in user with email and password
 */
export async function signInWithEmail(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Get user role from Firestore
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : { role: "user" };

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        role: userData.role || "user",
        photoURL: user.photoURL,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Sign in with Google
 */
export async function handleGoogleSignIn(promptAsync, selectedRole = "user") {
  try {
    if (!promptAsync) {
      throw new Error("Google auth not initialized");
    }

    // Prompt user to select Google account
    const { isExpoGo } = getGoogleRedirectConfig();
    const result = await promptAsync({
      useProxy: isExpoGo,
      showInRecents: true,
    });

    if (result?.params?.error) {
      const providerError = `${result.params.error}: ${result.params.error_description || "OAuth request failed"}`;
      console.error("[Google OAuth] Provider error", result.params);
      return {
        success: false,
        error: providerError,
      };
    }

    if (result?.type !== "success") {
      return {
        success: false,
        error: "Google sign-in was cancelled",
      };
    }

    // Get the id token from Google
    const { id_token } = result.params;

    // Create credential
    const credential = GoogleAuthProvider.credential(id_token);

    // Sign in with Firebase
    const userCredential = await signInWithCredential(auth, credential);
    const user = userCredential.user;

    // Check if user exists in Firestore
    const userDoc = await getDoc(doc(db, "users", user.uid));

    if (!userDoc.exists()) {
      // New user - create document with selected role
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        role: selectedRole,
        authMethod: "google",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        photoURL: user.photoURL,
        phone: null,
        city: null,
        isActive: true,
      });
    } else {
      // Existing user - update last login
      await updateDoc(doc(db, "users", user.uid), {
        updatedAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      });
    }

    // Get user role
    const finalUserDoc = await getDoc(doc(db, "users", user.uid));
    const userData = finalUserDoc.data();

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        role: userData.role,
        photoURL: user.photoURL,
        authMethod: userData.authMethod,
      },
    };
  } catch (error) {
    console.error("Google sign-in error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get idToken for backend verification
 */
export async function getFirebaseToken() {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return {
        success: false,
        error: "No user signed in",
      };
    }
    const token = await currentUser.getIdToken();
    return {
      success: true,
      token,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Update user role (admin only)
 */
export async function updateUserRole(userId, newRole) {
  try {
    await updateDoc(doc(db, "users", userId), {
      role: newRole,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get user profile with role
 */
export async function getUserProfile(uid) {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      return {
        success: true,
        user: userDoc.data(),
      };
    } else {
      return {
        success: false,
        error: "User not found",
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(uid, profileData) {
  try {
    await updateDoc(doc(db, "users", uid), {
      ...profileData,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Sign out
 */
export async function signOutUser() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get current user
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Listen to auth state changes
 */
export function onAuthStateChange(callback) {
  return auth.onAuthStateChanged(callback);
}
