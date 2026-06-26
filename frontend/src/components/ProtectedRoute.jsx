import { Navigate } from "react-router-dom";
import { isLoggedIn, hasAccess } from "../auth";

export default function ProtectedRoute({ children, allowedRoles }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }

  if (!hasAccess(allowedRoles)) {
    return <Navigate to="/" replace />;
  }

  return children;
}