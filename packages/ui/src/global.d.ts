declare global {
  interface Window {
    baseUrl?: string;
    __TANSTACK_QUERY_CLIENT__?: import('@tanstack/query-core').QueryClient;
  }
}

export {};
