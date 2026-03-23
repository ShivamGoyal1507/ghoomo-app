
import React from "react";
import { useSelector } from "react-redux";
import { NavigationContainer } from "@react-navigation/native";
import AuthNavigator from "./AuthNavigator";
import UserNavigator from "./UserNavigator";
import DriverNavigator from "./DriverNavigator";
import AdminNavigator from "./AdminNavigator";

export default function RootNavigator() {
  const { isAuthenticated, user } = useSelector(s => s.auth);

  React.useEffect(() => {
    console.log("[RootNavigator] Auth state changed - isAuthenticated:", isAuthenticated, "role:", user?.role);
  }, [isAuthenticated, user]);

  const getNavigator = () => {
    if (!isAuthenticated) {
      console.log("[RootNavigator] Rendering AuthNavigator");
      return <AuthNavigator />;
    }
    switch (user?.role) {
      case "driver":
        console.log("[RootNavigator] Rendering DriverNavigator");
        return <DriverNavigator />;
      case "admin":
        console.log("[RootNavigator] Rendering AdminNavigator");
        return <AdminNavigator />;
      default:
        console.log("[RootNavigator] Rendering UserNavigator");
        return <UserNavigator />;
    }
  };

  return (
    <NavigationContainer>
      {getNavigator()}
    </NavigationContainer>
  );
}
