import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, useTheme } from '../../src/contexts/ThemeContext';
import { AuthProvider } from '../../src/contexts/AuthContext';
import { useAuth } from '../../src/hooks/useAuth';

// RF-13 (M-02): el analista alterna el tema y la preferencia se conserva
// entre sesiones.
function Boton() {
  const { tema, alternarTema } = useTheme();
  return <button onClick={alternarTema}>tema: {tema}</button>;
}

function montar() {
  return render(
    <ThemeProvider>
      <Boton />
    </ThemeProvider>
  );
}

function simularTemaDelSistema(oscuro: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: oscuro })
  );
}

describe('ThemeContext — RF-13', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    simularTemaDelSistema(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('sin preferencia guardada arranca con el tema del sistema', () => {
    simularTemaDelSistema(true);
    montar();

    expect(screen.getByRole('button')).toHaveTextContent('tema: dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  test('alternar cambia el tema de la interfaz en el momento', async () => {
    montar();
    expect(document.documentElement).not.toHaveClass('dark');

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent('tema: dark');
    expect(document.documentElement).toHaveClass('dark');

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent('tema: light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  test('la preferencia elegida se conserva al volver a abrir la aplicación', async () => {
    const primeraVisita = montar();
    await userEvent.click(screen.getByRole('button'));
    primeraVisita.unmount();
    document.documentElement.classList.remove('dark');

    // Otra sesión: el sistema sigue en claro, pero el analista había elegido oscuro.
    montar();

    expect(screen.getByRole('button')).toHaveTextContent('tema: dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  test('cerrar sesión no borra la preferencia de tema', async () => {
    localStorage.setItem(
      'siade.sesion',
      JSON.stringify({ token: 't', analista: { id: 'a1', nombre: 'Ana', correo: 'ana@siade.test', rol: 'analista' } })
    );

    function CerrarSesion() {
      const { analista, logout } = useAuth();
      return analista ? <button onClick={logout}>Cerrar sesión</button> : <p>sin sesión</p>;
    }

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthProvider>
            <Boton />
            <CerrarSesion />
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: /tema:/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByText('sin sesión')).toBeInTheDocument();
    expect(localStorage.getItem('siade.sesion')).toBeNull();
    expect(localStorage.getItem('siade.tema')).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  test('quien nunca eligió un tema sigue al de su sistema, sin que se le fije el primero que vio', () => {
    const visita = montar();
    visita.unmount();
    expect(localStorage.getItem('siade.tema')).toBeNull();

    simularTemaDelSistema(true);
    montar();

    expect(screen.getByRole('button')).toHaveTextContent('tema: dark');
  });

  test('un valor guardado que no es un tema se ignora', () => {
    localStorage.setItem('siade.tema', 'fucsia');
    montar();

    expect(screen.getByRole('button')).toHaveTextContent('tema: light');
  });

  test('si el navegador no deja usar el almacenamiento, el tema igual se puede alternar', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('almacenamiento bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('almacenamiento bloqueado');
    });

    montar();
    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent('tema: dark');
    expect(document.documentElement).toHaveClass('dark');
  });
});
