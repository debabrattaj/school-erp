import axios from "axios";

export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const API = axios.create({
  baseURL: API_BASE,
});

let requestSequence = 0;

function notifyButtonFeedback(type, id) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(`school-erp-request-${type}`, { detail: { id } })
  );
}

API.interceptors.request.use((config) => {
  const requestId = ++requestSequence;
  config.__schoolErpRequestId = requestId;
  const token = localStorage.getItem("school_erp_token");
  const accountCode = localStorage.getItem("school_erp_account_code");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (accountCode) {
    config.headers["X-School-Code"] = accountCode;
  }

  notifyButtonFeedback("start", requestId);

  return config;
});

API.interceptors.response.use(
  (response) => {
    notifyButtonFeedback("end", response.config?.__schoolErpRequestId);
    return response;
  },
  (error) => {
    notifyButtonFeedback("end", error.config?.__schoolErpRequestId);
    return Promise.reject(error);
  }
);

export default API;
