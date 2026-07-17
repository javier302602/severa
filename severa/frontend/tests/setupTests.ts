import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// React Testing Library desmonta automáticamente después de cada test SOLO
// si detecta un framework de test con hooks globales (Jest, o Vitest con
// `globals: true`). Este proyecto usa imports explícitos de vitest (sin
// `globals: true` en vite.config.ts — decisión deliberada para no tener que
// tocar tsconfig.app.json con tipos globales de test), así que ese
// auto-cleanup nunca se dispara solo: sin esto, el DOM de un test queda
// montado y el siguiente test que use screen.getByText/queryByText puede
// encontrar elementos de una renderización anterior (bug real confirmado
// escribiendo los primeros tests: un valor de un test "filtraba" al
// siguiente sin que el componente hubiera cambiado).
afterEach(() => {
  cleanup();
});
