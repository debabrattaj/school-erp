import API from "../api";

export async function getModuleCustomFields(moduleName, recordId) {
  try {
    const response = await API.get(
      `/module-custom-fields/${moduleName}/${recordId}`
    );

    return response.data || [];
  } catch (error) {
    if (error.response?.status === 404) {
      return [];
    }

    throw error;
  }
}

export async function saveModuleCustomFields(moduleName, recordId, values) {
  const response = await API.post(
    `/module-custom-fields/${moduleName}/${recordId}`,
    {
      values,
    }
  );

  return response.data || [];
}

export async function deleteModuleCustomField(moduleName, recordId, fieldKey) {
  const response = await API.delete(
    `/module-custom-fields/${moduleName}/${recordId}/${encodeURIComponent(
      fieldKey
    )}`
  );

  return response.data;
}

export async function deleteAllModuleCustomFields(moduleName, recordId) {
  const response = await API.delete(
    `/module-custom-fields/${moduleName}/${recordId}`
  );

  return response.data;
}