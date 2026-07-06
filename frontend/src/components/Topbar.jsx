import { useEffect, useState } from "react";
import { Bell, Search, UserCircle, LogOut, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getUser, logout } from "../auth";
import API from "../api";

export default function Topbar() {
  const navigate = useNavigate();
  const user = getUser();
  const [notifications, setNotifications] = useState([]);
  const [showPanel, setShowPanel] = useState(false);

  async function loadNotifications() {
    try {
      const response = await API.get("/platform/my-notifications");
      setNotifications(response.data || []);
    } catch {
      // silently ignore — endpoint may not exist for older backends
    }
  }

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 120000);
    return () => clearInterval(interval);
  }, []);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const unread = notifications.filter((n) => !n.is_read).length;

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

        <div style={{ position: "relative" }}>
          <button
            className="icon-button"
            onClick={() => setShowPanel((prev) => !prev)}
          >
            <Bell size={20} />
            {unread > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: "2px",
                  right: "2px",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  background: "#be123c",
                  color: "#fff",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {unread}
              </span>
            )}
          </button>

          {showPanel && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                width: "340px",
                maxWidth: "calc(100vw - 2rem)",
                maxHeight: "400px",
                overflowY: "auto",
                background: "#fff",
                borderRadius: "12px",
                boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)",
                border: "1px solid var(--saas-border)",
                zIndex: 999,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.75rem 1rem",
                  borderBottom: "1px solid var(--saas-border)",
                }}
              >
                <strong>Notifications</strong>
                <button
                  onClick={() => setShowPanel(false)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              {notifications.length === 0 ? (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--saas-muted)" }}>
                  No notifications
                </div>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: "0.75rem 1rem",
                      borderBottom: "1px solid var(--saas-border)",
                      background: n.notification_type === "urgent" ? "#fff5f5" : n.notification_type === "warning" ? "#fffbeb" : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <strong
                        style={{
                          fontSize: "0.85rem",
                          color:
                            n.notification_type === "urgent"
                              ? "#be123c"
                              : n.notification_type === "warning"
                              ? "#d97706"
                              : "var(--saas-text)",
                        }}
                      >
                        {n.title}
                      </strong>
                      <span style={{ fontSize: "0.7rem", color: "var(--saas-muted)" }}>
                        {n.created_at?.slice(0, 10)}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "var(--saas-muted)", marginTop: "0.2rem" }}>
                      {n.message}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div
          className="user-profile"
          role="button"
          tabIndex={0}
          onClick={() => navigate("/profile")}
          onKeyDown={(e) => { if (e.key === "Enter") navigate("/profile"); }}
          style={{ cursor: "pointer" }}
          title="Profile & security"
        >
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
