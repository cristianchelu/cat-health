import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Outlet } from "react-router";
import Header from "./components/layout/Header";

import "./App.css";

function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <div id="app">
        <Header/>
        <main>
          <div id="content">
            <Outlet />
          </div>
        </main>
      </div>
    </QueryClientProvider>
  );
}

export default App;
