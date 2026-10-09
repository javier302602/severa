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

// Node 25+ define su propio `localStorage` global (Web Storage experimental),
// que sin `--localstorage-file` vale `undefined` y tapa al de jsdom: los tests
// que lo usan caen con "Cannot read properties of undefined (reading 'clear')".
// Se reponen los de jsdom solo si el global no sirve, así con Node 22 no cambia nada.
const ventanaJsdom = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
for (const nombre of ['localStorage', 'sessionStorage'] as const) {
  if (ventanaJsdom && !globalThis[nombre]) {
    Object.defineProperty(globalThis, nombre, {
      value: ventanaJsdom[nombre],
      configurable: true,
      writable: true,
    });
  }
}
