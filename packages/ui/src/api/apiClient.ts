import axios from 'axios';

export const API_BASE_URL = 'api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) return fallback;
  const data = error.response?.data;
  if (
    data &&
    typeof data === 'object' &&
    'message' in data &&
    typeof data.message === 'string' &&
    data.message.trim() !== ''
  ) {
    return data.message;
  }
  return fallback;
}

export default apiClient;
