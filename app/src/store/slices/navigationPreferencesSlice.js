import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  userFooterMode: "shared",
};

const navigationPreferencesSlice = createSlice({
  name: "navigationPreferences",
  initialState,
  reducers: {
    setUserFooterMode: (state, action) => {
      state.userFooterMode = action.payload === "bus" ? "bus" : "shared";
    },
  },
});

export const { setUserFooterMode } = navigationPreferencesSlice.actions;
export default navigationPreferencesSlice.reducer;
