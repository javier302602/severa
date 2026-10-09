import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Tema = 'light' | 'dark';

const CLAVE_TEMA = 'siade.tema';

interface ThemeContextValor {
  tema: Tema;
  alternarTema: () => void;
}

const ThemeContext = createContext<ThemeContextValor | undefined>(undefined);

// El almacenamiento del navegador puede no estar disponible (modo privado,
// datos del sitio bloqueados): en ese caso el tema sigue funcionando durante
// la visita y solo se pierde el recuerdo, en vez de romper la aplicación.
function leerTemaGuardado(): Tema | null {
  try {
    const guardado = localStorage.getItem(CLAVE_TEMA);
    return guardado === 'light' || guardado === 'dark' ? guardado : null;
  } catch {
    return null;
  }
}

function guardarTema(tema: Tema): void {
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // Sin almacenamiento no hay nada que guardar; el tema ya quedó aplicado.
  }
}

function temaDelSistema(): Tema {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// RF-13 (M-02). Valor inicial: la preferencia guardada si el analista ya
// eligió un tema alguna vez; si no, el del sistema. Se calcula de forma
// sincrónica (no en un useEffect) para que el <html> ya tenga la clase
// correcta en el primer render y no haya un destello del tema equivocado.
function temaInicial(): Tema {
  return leerTemaGuardado() ?? temaDelSistema();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'dark');
  }, [tema]);

  // La preferencia se guarda recién cuando el analista elige: quien nunca
  // tocó el botón sigue al tema de su sistema, también si lo cambia después.
  // Vive en el navegador y no en la sesión, así que se conserva al cerrar
  // sesión y volver a entrar.
  const alternarTema = useCallback(() => {
    setTema((actual) => {
      const siguiente: Tema = actual === 'dark' ? 'light' : 'dark';
      guardarTema(siguiente);
      return siguiente;
    });
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
