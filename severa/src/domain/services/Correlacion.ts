import { ValorEstadisticoError } from '../errors/ValorEstadisticoError';

export interface ParXY {
  x: number;
  y: number;
}

// Coeficiente de correlación de Pearson — misma fórmula documentada en la
// sección 3.5.3 del informe de referencia (.qmd), usada ahí para explorar
// la relación entre CVSS Score y Días para Parche (Gráfico 7). Es una
// fórmula genérica de estadística descriptiva, no específica de
// vulnerabilidades: opera sobre cualquier par de columnas numéricas, así
// que sirve igual para el informe de vulnerabilidades (Fase 1) como para el
// análisis bivariado del módulo de Análisis de Datos General (Fase 4).
export function calcularCorrelacionPearson(pares: ParXY[]): number {
  if (pares.length < 2) {
    throw new ValorEstadisticoError('Se requieren al menos dos pares de valores para calcular la correlación');
  }

  const n = pares.length;
  const mediaX = pares.reduce((acum, par) => acum + par.x, 0) / n;
  const mediaY = pares.reduce((acum, par) => acum + par.y, 0) / n;

  const covarianza = pares.reduce((acum, par) => acum + (par.x - mediaX) * (par.y - mediaY), 0);
  const sumaCuadradosX = pares.reduce((acum, par) => acum + (par.x - mediaX) ** 2, 0);
  const sumaCuadradosY = pares.reduce((acum, par) => acum + (par.y - mediaY) ** 2, 0);

  const denominador = Math.sqrt(sumaCuadradosX * sumaCuadradosY);
  if (denominador === 0) {
    // Si todos los X (o todos los Y) son idénticos, no hay variabilidad que
    // correlacionar — Pearson no está definido (0/0), no es un error del
    // caller, es una propiedad real de esos datos.
    return 0;
  }

  return covarianza / denominador;
}
