import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Compartido por los tests de hooks/componentes que usan React Query — mismo
// retry:false que main.tsx (ver comentario ahí: un 400/404 real no debe
// esconderse detrás de reintentos silenciosos), para que los tests de estado
// de error no tengan que esperar reintentos.
export function crearQueryClientDePrueba(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
}

export function EnvoltorioQuery({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={crearQueryClientDePrueba()}>{children}</QueryClientProvider>;
}
