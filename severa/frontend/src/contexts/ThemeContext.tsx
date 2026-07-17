import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Tema = 'light' | 'dark';

const CLAVE_TEMA = 'severa.tema';

interface ThemeContextValor {
  tema: Tema;
  alternarTema: () => void;
}

const ThemeContext = createContext<ThemeContextValor | undefined>(undefined);

// Valor inicial: preferencia guardada en localStorage si existe (el usuario
// ya tocó el toggle alguna vez), si no, prefers-color-scheme del sistema. Se
// calcula de forma sincrónica (no en un useEffect) para que el <html> ya
// tenga la clase correcta en el primer render y no haya un flash de tema
// equivocado.
function temaInicial(): Tema {
  const guardado = localStorage.getItem(CLAVE_TEMA);
  if (guardado === 'light' || guardado === 'dark') {
    return guardado;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'dark');
    localStorage.setItem(CLAVE_TEMA, tema);
  }, [tema]);

  const alternarTema = useCallback(() => {
    setTema((actual) => (actual === 'dark' ? 'light' : 'dark'));
  }, []);

  const valor = useMemo<ThemeContextValor>(() => ({ tema, alternarTema }), [tema, alternarTema]);

  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValor {
  const contexto = useContext(ThemeContext);
  if (!contexto) {
    throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  }
  return contexto;
}
