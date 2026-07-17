import { DiagnosticoDataset } from './CalidadDeDatosGenerico';
import { MatrizCorrelacion } from './CorrelacionGenerico';
import { ResultadoDeteccionOutliers } from './DeteccionOutliersGenerico';

// Mejora 4 (Análisis de Datos General) — Fase 5. Mismo rol que
// InterpretadorDeResultados.ts (RF-81) pero para el módulo de dataset
// genérico: función pura de dominio, recibe valores YA calculados por
// CalidadDeDatosGenerico/CorrelacionGenerico/DeteccionOutliersGenerico y
// devuelve prosa — no repite ningún cálculo, no sabe nada de PDF/Word/HTTP.
// No se reutiliza InterpretadorDeResultados.ts directamente porque su
// vocabulario (CVSS, severidad, ranking de urgencia) es específico del
// dataset de vulnerabilidades; acá se replica el mismo PATRÓN (umbral ->
// frase), no el contenido.
const UMBRAL_FALTANTE_ALTO_PORCENTAJE = 20;
const UMBRAL_CORRELACION_DEBIL = 0.3;
const UMBRAL_CORRELACION_FUERTE = 0.7;

export function generarInterpretacionDataset(
  diagnostico: DiagnosticoDataset,
  matrizCorrelacion: MatrizCorrelacion,
  outliers: ResultadoDeteccionOutliers
): string[] {
  return [
    interpretarComposicionDataset(diagnostico),
    interpretarCalidadDatos(diagnostico),
    interpretarCorrelacionMasFuerte(matrizCorrelacion),
    interpretarOutliers(outliers)
  ];
}

export function interpretarComposicionDataset(diagnostico: DiagnosticoDataset): string {
  const conteoPorTipo = new Map<string, number>();
  diagnostico.columnas.forEach((columna) => {
    conteoPorTipo.set(columna.tipo, (conteoPorTipo.get(columna.tipo) ?? 0) + 1);
  });
  const composicion = [...conteoPorTipo.entries()].map(([tipo, cantidad]) => `${cantidad} ${tipo}`).join(', ');

  return `El dataset contiene ${diagnostico.totalFilas} fila(s) y ${diagnostico.columnas.length} columna(s) (${composicion}).`;
}

export function interpretarCalidadDatos(diagnostico: DiagnosticoDataset): string {
  const baseDuplicados = diagnostico.filasDuplicadas === 0
    ? 'No se detectaron filas duplicadas exactas.'
    : `Se detectaron ${diagnostico.filasDuplicadas} fila(s) duplicada(s) exacta(s).`;

  const columnasConFaltantesAltos = diagnostico.columnas.filter(
    (columna) => columna.porcentajeFaltante > UMBRAL_FALTANTE_ALTO_PORCENTAJE
  );

  if (columnasConFaltantesAltos.length === 0) {
    return `${baseDuplicados} Ninguna columna supera el ${UMBRAL_FALTANTE_ALTO_PORCENTAJE}% de valores faltantes.`;
  }

  const nombres = columnasConFaltantesAltos
    .map((columna) => `"${columna.nombre}" (${columna.porcentajeFaltante.toFixed(1)}%)`)
    .join(', ');
  return `${baseDuplicados} Las columnas ${nombres} superan el ${UMBRAL_FALTANTE_ALTO_PORCENTAJE}% de valores faltantes, ` +
    'lo que podría sesgar sus estadísticos.';
}

export function interpretarCorrelacionMasFuerte(matriz: MatrizCorrelacion): string {
  if (matriz.columnas.length < 2) {
    return 'No hay al menos dos columnas numéricas elegibles para calcular correlaciones entre pares.';
  }

  let mejorA: string | null = null;
  let mejorB: string | null = null;
  let mejorValor = 0;

  for (const fila of matriz.filas) {
    for (const celda of fila.correlaciones) {
      if (celda.columna === fila.columna || celda.valor === null) continue;
      if (mejorA === null || Math.abs(celda.valor) > Math.abs(mejorValor)) {
        mejorA = fila.columna;
        mejorB = celda.columna;
        mejorValor = celda.valor;
      }
    }
  }

  if (mejorA === null || mejorB === null) {
    return 'No se pudo calcular ninguna correlación entre las columnas numéricas disponibles (pares de datos insuficientes).';
  }

  const a = mejorA;
  const b = mejorB;
  const valor = mejorValor;
  const fuerza =
    Math.abs(valor) < UMBRAL_CORRELACION_DEBIL ? 'débil' : Math.abs(valor) < UMBRAL_CORRELACION_FUERTE ? 'moderada' : 'fuerte';
  const direccion = valor >= 0 ? 'positiva' : 'negativa';
  return `La relación lineal más fuerte encontrada es entre "${a}" y "${b}" (r = ${valor.toFixed(3)}), una correlación ${fuerza} y ${direccion}.`;
}

export function interpretarOutliers(resultado: ResultadoDeteccionOutliers): string {
  const total = resultado.columnas.reduce((acumulado, columna) => acumulado + columna.cantidadValoresAtipicos, 0);

  if (total === 0) {
    return 'No se detectaron valores atípicos (criterio 1.5×IQR) en ninguna columna numérica.';
  }

  const detalle = resultado.columnas
    .filter((columna) => columna.cantidadValoresAtipicos > 0)
    .map((columna) => `"${columna.columna}" (${columna.cantidadValoresAtipicos})`)
    .join(', ');
  return `Se detectaron ${total} valor(es) atípico(s) en total (criterio 1.5×IQR), concentrados en: ${detalle}.`;
}
