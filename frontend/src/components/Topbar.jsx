import { Bell, Search, UserCircle, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getUser, logout } from "../auth";

export default function Topbar() {
  const navigate = useNavigate();
  const user = getUser();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <header className="topbar">
      <div>
        <h1>Dashboard</h1>
        <p>Welcome back, {user?.name || "User"}</p>
      </div>

      <div className="topbar-actions">
        <div className="search-box">
          <Search size={17} />
          <input type="text" placeholder="Search student, teacher, class..." />
        </div>

        <button className="icon-button">
          <Bell size={20} />
        </button>

        <div className="user-profile">
          <UserCircle size={32} />
          <div>
            <strong>{user?.name || "User"}</strong>
            <span>{user?.role || "Role"}</span>
          </div>
        </div>

        <button className="logout-button" onClick={handleLogout}>
          <LogOut size={17} />
          Logout
        </button>
      </div>
    </header>
  );
}