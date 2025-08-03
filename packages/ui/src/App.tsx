import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Outlet, Link } from 'react-router';
import './app.css';

function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app">
        <aside className="sidebar">
          <Link to="/" className="logo">Cat Health</Link>
          <nav className="nav">
            <Link to="/" className="nav-link">Pet List</Link>
          </nav>
          <div className="copyright">&copy; {new Date().getFullYear()} Cat Health</div>
        </aside>
        <main className="main">
          <header className="header">
            <h1 className="title">Cat Health Dashboard</h1>
          </header>
          <div className="content">
            <Outlet />
          </div>
        </main>
      </div>
    </QueryClientProvider>
  );
}

export default App;