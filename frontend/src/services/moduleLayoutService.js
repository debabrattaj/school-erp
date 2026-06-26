import API from "../api";

export async function getModuleLayout(moduleName) {
  try {
    const response = await API.get(`/module-layouts/${moduleName}`);
    return response.data.layout_json;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }

    throw error;
  }
}

export async function saveModuleLayout(moduleName, layoutJson) {
  const response = await API.put(`/module-layouts/${moduleName}`, {
    layout_json: layoutJson,
  });

  return response.data.layout_json;
}

export async function deleteModuleLayout(moduleName) {
  const response = await API.delete(`/module-layouts/${moduleName}`);
  return response.data;
}