import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.js';
import AuthGate from './components/auth/AuthGate.js';
import { trackViewportHeight } from './lib/viewport.js';
import './styles.css';

// Before the first render, so the shell is the right height from the first
// paint rather than resizing a frame later.
trackViewportHeight();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Calendar data changes only when this user changes it, so aggressive
      // refetching just causes flicker.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element');

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <App />
      </AuthGate>
    </QueryClientProvider>
  </StrictMode>,
);
