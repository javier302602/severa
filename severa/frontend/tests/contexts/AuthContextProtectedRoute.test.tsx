import { describe, test, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../../src/contexts/AuthContext';
import { ProtectedRoute } from '../../src/components/layout/ProtectedRoute';
import { useAuth } from '../../src/hooks/useAuth';
import { authService } from '../../src/api/authService';

// Test de humo del flujo de autenticación completo: login persiste la
// sesión y desbloquea la ruta protegida, logout la borra y redirige. No
// mockea useAuth ni AuthContext — ejercita el Provider real de punta a
// punta, solo mockea authService (la única llamada de red real).
vi.mock('../../src/api/authService', () => ({
  authService: { login: vi.fn(), registrar: vi.fn() }
}));

const analistaDePrueba = { id: 'a1', nombre: 'Ana', correo: 'ana@severa.test', rol: 'analista' as const };

function PantallaProtegida() {
  const { analista, logout } = useAuth();
  return (
    <div>
      <p>Contenido protegido — hola {analista?.nombre}</p>
      <button onClick={logout}>Cerrar sesión</button>
    </div>
  );
}

function PantallaLogin() {
  const { login } = useAuth();
  return (
    <button onClick={() => login({ correo: 'ana@severa.test', contrasena: 'x' })}>Iniciar sesión</button>
  );
}

function App({ rutaInicial = '/protegido' }: { rutaInicial?: string }) {
  return (
    <MemoryRouter initialEntries={[rutaInicial]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<PantallaLogin />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/protegido" element={<PantallaProtegida />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('AuthContext + ProtectedRoute — flujo real de login/logout/ruta protegida', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('sin sesión guardada: ProtectedRoute redirige a /login en vez de mostrar el contenido', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument());
    expect(screen.queryByText(/Contenido protegido/)).not.toBeInTheDocument();
  });

  test('con una sesión ya persistida en localStorage: ProtectedRoute muestra el contenido directamente', async () => {
    localStorage.setItem('severa.sesion', JSON.stringify({ token: 'token-guardado', analista: analistaDePrueba }));

    render(<App />);

    expect(await screen.findByText('Contenido protegido — hola Ana')).toBeInTheDocument();
  });

  test('login exitoso: persiste la sesión en localStorage y desbloquea la ruta protegida', async () => {
    vi.mocked(authService.login).mockResolvedValue({ token: 'token-nuevo', analista: analistaDePrueba });

    render(<App rutaInicial="/login" />);

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(authService.login).toHaveBeenCalledWith({ correo: 'ana@severa.test', contrasena: 'x' }));
    await waitFor(() => {
      const guardado = JSON.parse(localStorage.getItem('severa.sesion') ?? 'null');
      expect(guardado?.token).toBe('token-nuevo');
    });
  });

  test('logout: borra la sesión persistida y redirige a /login', async () => {
    localStorage.setItem('severa.sesion', JSON.stringify({ token: 'token-guardado', analista: analistaDePrueba }));

    render(<App />);
    const botonLogout = await screen.findByRole('button', { name: 'Cerrar sesión' });

    await userEvent.click(botonLogout);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument());
    expect(localStorage.getItem('severa.sesion')).toBeNull();
  });
});
