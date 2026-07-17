import { httpClient } from './httpClient';

// Contrato verificado contra ComparacionController.ts / ComparadorDeCategorias.ts.
// Los 3 endpoints devuelven la misma forma (compararGrupos), solo cambia qué
// dos grupos arma el backend antes de comparar.
export interface ComparacionGrupos {
  mediaA: number;
  mediaB: number;
  diferenciaMedias: number;
  sdA: number;
  sdB: number;
}

export const comparacionService = {
  // /acceso no toma parámetros: el backend arma los grupos fijos
  // Remoto/Local a partir de TODO el catálogo (GET /comparacion/acceso).
  compararAcceso: (): Promise<ComparacionGrupos> => httpClient.get('/comparacion/acceso'),
  // categoriaA/categoriaB son query params opcionales — si no se mandan, el
  // backend usa sus propios defaults ('N/A' vs 'N/A' para /tipo, 'Apache
  // Log4j' vs 'Nginx' para /software). Se omiten si vienen vacíos para no
  // pisar esos defaults con un string vacío.
  compararTipo: (categoriaA?: string, categoriaB?: string): Promise<ComparacionGrupos> =>
    httpClient.get('/comparacion/tipo', { categoriaA: categoriaA || undefined, categoriaB: categoriaB || undefined }),
  compararSoftware: (categoriaA?: string, categoriaB?: string): Promise<ComparacionGrupos> =>
    httpClient.get('/comparacion/software', { categoriaA: categoriaA || undefined, categoriaB: categoriaB || undefined })
};
