import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Globe, LogOut, Search, X } from "lucide-react";
import { getUser, logout } from "../auth";
import API from "../api";
import { useI18n } from "../i18n";
import { LANGUAGES } from "../i18n/translations";

export default function Topbar() {
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const [user, setUser] = useState(getUser());
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const notifyWrapRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (notifyWrapRef.current && !notifyWrapRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const scrollEl = document.querySelector(".main-area");
    if (!scrollEl) return undefined;

    function handleScroll() {
      setScrolled(scrollEl.scrollTop > 4);
    }

    handleScroll();
    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    function refreshUser() {
      setUser(getUser());
    }

    window.addEventListener("school-erp-auth-updated", refreshUser);
    window.addEventListener("storage", refreshUser);

    return () => {
      window.removeEventListener("school-erp-auth-updated", refreshUser);
      window.removeEventListener("storage", refreshUser);
    };
  }, []);

  useEffect(() => {
    async function loadNotifications() {
      try {
        const response = await API.get("/platform/my-notifications");
        setNotifications(response.data || []);
      } catch {
        // silently ignore — endpoint may not exist for older backends
      }
    }

    loadNotifications();
    const interval = setInterval(loadNotifications, 120000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();

    if (query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }

    setSearching(true);
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await API.get("/search", { params: { q: query } });
        setSearchResults(response.data?.results || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  function openSearchResult(result) {
    setSearchQuery("");
    setSearchResults([]);
    setSearchOpen(false);
    navigate(result.path);
  }

  const groupedSearchResults = searchResults.reduce((groups, result) => {
    if (!groups[result.group]) groups[result.group] = [];
    groups[result.group].push(result);
    return groups;
  }, {});

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <header className={scrolled ? "topbar topbar-scrolled" : "topbar"}>
      <div className="topbar-spacer" />

      <div className="topbar-search-wrap">
        <div className="topbar-search">
          <Search size={16} />
          <input
            type="text"
            placeholder={t("Search students, teachers, classes, exams…")}
            value={searchQuery}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
          />
        </div>

        {searchOpen && searchQuery.trim().length >= 2 && (
          <div className="topbar-search-panel">
            {searching ? (
              <div className="topbar-search-empty">{t("Searching…")}</div>
            ) : searchResults.length === 0 ? (
              <div className="topbar-search-empty">{t("No matches")}</div>
            ) : (
              Object.entries(groupedSearchResults).map(([group, items]) => (
                <div key={group} className="topbar-search-group">
                  <div className="topbar-search-group-label">{t(group)}</div>
                  {items.map((item) => (
                    <button
                      key={`${item.group}-${item.id}`}
                      type="button"
                      className="topbar-search-result"
                      onMouseDown={() => openSearchResult(item)}
                    >
                      <span className="topbar-search-result-label">{item.label}</span>
                      {item.subtitle && (
                        <span className="topbar-search-result-subtitle">{item.subtitle}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="topbar-actions">
        <div className="topbar-lang">
          <Globe size={14} />
          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t("Language")}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>

        <div className="topbar-notify-wrap" ref={notifyWrapRef}>
          <button
            type="button"
            className="topbar-notify-button"
            onClick={() => setShowNotifications((prev) => !prev)}
            aria-label={t("Notifications")}
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <div className="topbar-notify-badge">{unreadCount}</div>
            )}
          </button>

          {showNotifications && (
            <div className="topbar-notify-panel">
              <div className="topbar-notify-panel-header">
                <div className="topbar-notify-panel-title">{t("Notifications")}</div>
                <button type="button" className="topbar-notify-close" onClick={() => setShowNotifications(false)}>
                  <X size={16} />
                </button>
              </div>
              {notifications.length === 0 ? (
                <div className="topbar-notify-empty">{t("No notifications")}</div>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <div key={n.id} className={`topbar-notify-item topbar-notify-item-${n.notification_type || "info"}`}>
                    <div className="topbar-notify-item-top">
                      <div className="topbar-notify-item-title">{n.title}</div>
                      <div className="topbar-notify-item-date">{n.created_at?.slice(0, 10)}</div>
                    </div>
                    <div className="topbar-notify-item-message">{n.message}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="topbar-divider" />

        <div
          className="topbar-identity"
          title={`${t("Logged in as")} ${user?.name || user?.role || "User"}`}
        >
          {(user?.name || user?.role || "U").trim().charAt(0).toUpperCase()}
        </div>

        <button type="button" className="topbar-logout" onClick={handleLogout}>
          <LogOut size={15} />
          {t("Logout")}
        </button>
      </div>
    </header>
  );
}
