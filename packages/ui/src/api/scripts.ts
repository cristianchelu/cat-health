import apiClient from "./apiClient";

export const postMigrate = async () => {
  const response = await apiClient.post("/migrate");
  return response.data;
};
