import { Vulnerabilidad } from '../entities/Vulnerabilidad';
import { calcularMedia, calcularMediana } from './EstadisticaDescriptiva';
import { generarTablaAgrupada } from './DistribucionFrecuencias';
import { minimoDe, maximoDe } from './MinMax';
import { clasificar } from './ClasificadorDeRiesgo';
import { CvssScore } from '../value-objects/CvssScore';
import { NivelDeRiesgo } from '../value-objects/NivelDeRiesgo';

export interface BinHistograma {
  intervalo: string;
  frecuencia: number;
}

export interface DatosHistogramaCvss {
  bins: BinHistograma[];
  media: number;
  mediana: number;
}

export interface DatoConteo {
  etiqueta: string;
  valor: number;
}

export interface OpcionesHistograma {
  intervalos?: number;
}

function normalizarIntervalos(cantidad: number, intervalos: number): number {
  return Math.max(1, intervalos > 0 ? intervalos : Math.ceil(Math.sqrt(cantidad)));
}

// Fase 0b: algoritmo de binning por min/max dinámico — ya era genérico (no
// dependía de ningún nombre ni rango de CVSS), solo estaba duplicado línea
// por línea entre generarDatosHistogramaCvss y generarDatosHistogramaDiasParche.
// Se extrae una sola vez y se reusa desde ambas, y queda disponible tal cual
// para el histograma de cualquier columna numérica del módulo de Análisis de
// Datos General.
function calcularHistograma(valores: number[], intervalos: number, etiqueta?: string): DatosHistogramaCvss {
  if (valores.length === 0) {
    return { bins: [], media: 0, mediana: 0 };
  }

  const min = minimoDe(valores);
  const max = maximoDe(valores);
  const ancho = (max - min) / intervalos || 1;

  const bins = Array.from({ length: intervalos }, (_, index) => {
    const inicio = min + index * ancho;
    const fin = index === intervalos - 1 ? max : inicio + ancho;
    return {
      intervalo: `${inicio.toFixed(1)}-${fin.toFixed(1)}`,
      frecuencia: 0
    };
  });

  valores.forEach((valor) => {
    const indice = Math.min(intervalos - 1, Math.floor((valor - min) / ancho));
    bins[indice].frecuencia += 1;
  });

  return {
    bins,
    media: calcularMedia(valores, etiqueta),
    mediana: calcularMediana(valores, etiqueta)
  };
}

export function generarDatosHistograma(valores: number[], opciones: OpcionesHistograma = {}, etiqueta?: string): DatosHistogramaCvss {
  const intervalos = normalizarIntervalos(valores.length, opciones.intervalos ?? 5);
  return calcularHistograma(valores, intervalos, etiqueta);
}

export function generarDatosHistogramaCvss(scores: number[], opciones: OpcionesHistograma = {}): DatosHistogramaCvss {
  return generarDatosHistograma(scores, opciones);
}

// Etiquetas de gráfico en femenino (concuerdan con "severidad"), distintas de
// los valores del enum de dominio NivelDeRiesgo (masculino, concuerda con
// "nivel"). El único origen de los umbrales es ClasificadorDeRiesgo.
export const ETIQUETA_POR_NIVEL: Record<NivelDeRiesgo, string> = {
  Bajo: 'Baja',
  Moderado: 'Media',
  Alto: 'Alta',
  Crítico: 'Crítica'
};

export function contarPorSeveridad(scores: number[]): DatoConteo[] {
  const conteos: Record<NivelDeRiesgo, number> = { Bajo: 0, Moderado: 0, Alto: 0, Crítico: 0 };

  scores.forEach((score) => {
    const nivel = clasificar(new CvssScore(score)).valor;
    conteos[nivel] += 1;
  });

  return (['Bajo', 'Moderado', 'Alto', 'Crítico'] as NivelDeRiesgo[]).map((nivel) => ({
    etiqueta: ETIQUETA_POR_NIVEL[nivel],
    valor: conteos[nivel]
  }));
}

export function generarDatosHistogramaAgrupado(scores: number[]): DatosHistogramaCvss {
  const tabla = generarTablaAgrupada(scores);
  return {
    bins: tabla.map((fila) => ({
      intervalo: fila.intervalo,
      frecuencia: fila.frecuenciaAbsoluta
    })),
    media: calcularMedia(scores),
    mediana: calcularMediana(scores)
  };
}

export function generarDatosCvssPorAcceso(vulnerabilidades: Vulnerabilidad[]): DatoConteo[] {
  const remotos = vulnerabilidades.filter((item) => item.tipoAcceso?.valor === 'Remoto').map((item) => item.cvssScore.valor);
  const locales = vulnerabilidades.filter((item) => item.tipoAcceso?.valor === 'Local').map((item) => item.cvssScore.valor);

  return [
    { etiqueta: 'Remoto', valor: remotos.length ? calcularMedia(remotos) : 0 },
    { etiqueta: 'Local', valor: locales.length ? calcularMedia(locales) : 0 }
  ];
}

// Antes duplicaba el algoritmo de calcularHistograma línea por línea Y
// llamaba a calcularMedia/calcularMediana sin etiqueta — lo que producía el
// bug real encontrado en vivo: "Días para Parche" legítimamente supera 10
// (ver comentario en EstadisticaDescriptiva.ts), y con la validación vieja
// (rango 0-10 hardcodeado) esto rompía con un mensaje que hablaba de "CVSS
// Score" para un histograma que no tiene nada que ver con CVSS.
export function generarDatosHistogramaDiasParche(scores: number[]): DatosHistogramaCvss {
  return generarDatosHistograma(scores, { intervalos: 5 }, 'Días para Parche');
}

// Fase 1 (bug real encontrado en vivo): la rama 'tipo' ignoraba por completo
// item.tipoVulnerabilidad y devolvía siempre la etiqueta literal
// 'Desconocido' — confirmado contra GET /graficos/topTipos?formato=json,
// que agrupaba las 9 vulnerabilidades del dataset real en un solo bucket
// "Desconocido" en vez de mostrar los tipos reales (Code Injection, Buffer
// Overflow, etc.), a diferencia de la rama 'software' (misma función), que
// sí funcionaba.
export function generarTopN(vulnerabilidades: Vulnerabilidad[], tipo: 'software' | 'tipo', limite: number): DatoConteo[] {
  const datos = vulnerabilidades.reduce<Map<string, number>>((acumulador, item) => {
    const etiqueta = tipo === 'software' ? item.descripcion : item.tipoVulnerabilidad;
    acumulador.set(etiqueta, (acumulador.get(etiqueta) ?? 0) + 1);
    return acumulador;
  }, new Map());

  return [...datos.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(1, limite))
    .map(([etiqueta, valor]) => ({ etiqueta, valor }));
}

// Bug real reportado con capturas: en un dataset NVD real, "Sin clasificar"
// (marcador del dataset externo — ver LectorExcelDataset.ts, SEVERA nunca
// escribe ese string, solo lo lee tal cual viene del archivo) concentraba el
// 89.9% de las filas (14231 de 15829) y dominaba tan fuertemente la escala
// lineal que las 9 categorías reales quedaban como líneas invisibles.
// Decisión (confirmada con el usuario, ver GenerarGrafico.ts): "Sin
// clasificar" no es un tipo de vulnerabilidad real, es una ausencia de dato
// — no compite en el ranking; se excluye del gráfico y se informa aparte
// como nota en la interpretación (interpretarTopTipos). 'N/A' es el
// default propio de SEVERA (Vulnerabilidad.ts) para el mismo caso cuando la
// columna directamente falta en el archivo — mismo criterio, mismo destino.
const MARCADORES_SIN_CLASIFICAR = new Set(['Sin clasificar', 'N/A']);

export interface TopTiposClasificados {
  datos: DatoConteo[];
  totalSinClasificar: number;
}

export function generarTopTiposClasificados(vulnerabilidades: Vulnerabilidad[], limite: number): TopTiposClasificados {
  const clasificadas = vulnerabilidades.filter((item) => !MARCADORES_SIN_CLASIFICAR.has(item.tipoVulnerabilidad));
  return {
    datos: generarTopN(clasificadas, 'tipo', limite),
    totalSinClasificar: vulnerabilidades.length - clasificadas.length
  };
}
