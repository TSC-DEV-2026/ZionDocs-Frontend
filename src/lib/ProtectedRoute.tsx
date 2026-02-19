import { Navigate, Outlet } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import LoadingScreen from "@/components/ui/loadingScreen";

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, mustChangePassword } = useUser();

  if (isLoading) return <LoadingScreen />;

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (mustChangePassword) {
    return <Navigate to="/trocar-senha" replace />;
  }

  return <Outlet />;
}
