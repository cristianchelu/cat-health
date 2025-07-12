import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import PetList from './pages/PetList';

function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <div className="card">
        <PetList />
      </div>
    </QueryClientProvider>
  )
}

export default App
