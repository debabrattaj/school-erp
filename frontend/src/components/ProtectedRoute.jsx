import { Navigate } from "react-router-dom";
import { isLoggedIn, hasAccess, getUser } from "../auth";

export default function ProtectedRoute({ children, allowedRoles }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }

  if (!hasAccess(allowedRoles)) {
    const user = getUser();
    const fallback = ["Parent", "Student"].includes(user?.role) ? "/portal" : "/";
    return <Navigate to={fallback} replace />;
  }

  return children;
}
