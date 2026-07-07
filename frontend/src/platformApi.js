import axios from "axios";

const PlatformAPI = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000",
});

PlatformAPI.interceptors.request.use((config) => {
  const token = localStorage.getItem("platform_owner_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function savePlatformAuth(token, owner) {
  localStorage.setItem("platform_owner_token", token);
  localStorage.setItem("platform_owner", JSON.stringify(owner || {}));
}

export function getPlatformOwner() {
  try {
    return JSON.parse(localStorage.getItem("platform_owner") || "null");
  } catch {
    return null;
  }
}

export function isPlatformLoggedIn() {
  return Boolean(localStorage.getItem("platform_owner_token"));
}

export function platformLogout() {
  localStorage.removeItem("platform_owner_token");
  localStorage.removeItem("platform_owner");
}

export default PlatformAPI;
