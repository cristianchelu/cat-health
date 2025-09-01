import apiClient from "./apiClient";

export const postMigrate = async () => {
  const params = new URLSearchParams();
  params.append('startDate', (new Date(Date.now() - 48 * 60 * 60 * 1000)).toISOString());
  params.append('endDate', (new Date()).toISOString());
  const response = await apiClient.post(`/migrate?${params.toString()}`);
  return response.data;
};
