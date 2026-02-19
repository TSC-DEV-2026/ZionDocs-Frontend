import { Navigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import LoadingScreen from "@/components/ui/loadingScreen";
import Home from "@/pages/home/Home";

export default function HomeGate() {
  const { isLoading, isAuthenticated, mustChangePassword } = useUser();

  if (isLoading) return <LoadingScreen />;

  if (!isAuthenticated) return <Home />;

  if (mustChangePassword) {
    return <Navigate to="/trocar-senha" replace />;
  }

  return <Home />;
}
