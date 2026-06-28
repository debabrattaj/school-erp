import axios from "axios";

const API = axios.create({
  baseURL: "http://127.0.0.1:8000",
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("school_erp_token");
  const accountCode = localStorage.getItem("school_erp_account_code");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (accountCode) {
    config.headers["X-School-Code"] = accountCode;
  }

  return config;
});

export default API;
