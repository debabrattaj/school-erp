import API from "../api";

export async function listReportViews(moduleName) {
  const response = await API.get("/report-views", {
    params: moduleName ? { module_name: moduleName } : {},
  });

  return response.data || [];
}

export async function createReportView(payload) {
  const response = await API.post("/report-views", payload);
  return response.data;
}

export async function deleteReportView(viewId) {
  const response = await API.delete(`/report-views/${viewId}`);
  return response.data;
}
