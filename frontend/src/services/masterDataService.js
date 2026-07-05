import API from "../api";

export async function getMasterData(category) {
  const response = await API.get(
    `/master-data/${category}`
  );

  return response.data.values || [];
}

export async function getMasterValues(category) {
  const values = await getMasterData(category);

  return values.map((item) => item.value);
}