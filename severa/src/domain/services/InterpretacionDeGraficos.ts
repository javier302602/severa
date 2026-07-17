import { DatosHistogramaCvss, DatoConteo } from './GraficosEstadisticos';
import { ResumenCincoNumeros } from './EstadisticaDescriptiva';

// Mejora de Gráficos — "análisis de resultados" (uno de los 6 bloques del
// patrón fórmula → sustitución → interpretación de la Fase 1 del informe).
// Hasta ahora este texto vivía DUPLICADO y con drift real entre
// GeneradorInformePDF.ts (dibujarGraficos) y GeneradorInformeWord.ts
// (construirDefinicionesGraficosWord) — confirmado comparando ambos
// archivos línea por línea antes de escribir esto. Se extrae acá porque
// ahora hay un tercer consumidor (GET /graficos/:tipo, para la página web),
// y triplicarlo a mano hubiera sido el mismo error de nuevo.
//
// Cada función toma EXACTAMENTE la misma forma de `datos` que ya recibe
// GraficosOutputPort.renderizarX (la que arma GenerarGrafico.ts) — no hace
// falta ningún dato adicional del informe completo (DatosInforme) para
// ninguno de los 10 gráficos, así que la misma función sirve para el PDF,
// el Word y el endpoint en vivo sin necesitar el contexto completo del
// informe. Deliberadamente NO incluye "objetivo"/"fundamento"/"relación":
// esos son prosa mayormente estática o hacen referencia a la estructura de
// secciones del informe (p. ej. "ver Tabla de la sección 7"), que no tiene
// sentido fuera de un documento con esas secciones — para la tarjeta web,
// "análisis" solo (2-3 frases) alcanza, tal como se pidió.
const UMBRAL_CORRELACION_DEBIL = 0.3;
const UMBRAL_DIFERENCIA_DESPRECIABLE = 0.05;

export function interpretarHistogramaCvss(datos: DatosHistogramaCvss): string {
  return (
    `La distribución tiene media ${datos.media.toFixed(2)} y mediana ${datos.mediana.toFixed(2)} — su cercanía indica que la ` +
    'severidad alta no es un puñado de casos aislados, sino un patrón consistente en buena parte de la muestra.'
  );
}

export function interpretarHistogramaAgrupado(): string {
  return 'El intervalo con mayor frecuencia es el que concentra la mayor proporción de vulnerabilidades de la muestra.';
}

export function interpretarHistogramaDiasParche(datos: DatosHistogramaCvss): string {
  if (datos.bins.length === 0) {
    return 'No hay vulnerabilidades con "Días para Parche" registrado.';
  }
  return `El tiempo promedio de espera es de ${datos.media.toFixed(1)} días.`;
}

// El total de vulnerabilidades no se recibe aparte: contarPorSeveridad
// siempre devuelve las 4 categorías completas, así que sumar `datos` YA da
// el total (mismo dato, sin pedirlo dos veces).
export function interpretarBarrasSeveridad(datos: DatoConteo[]): string {
  const total = datos.reduce((acumulado, item) => acumulado + item.valor, 0);
  const criticasYAltas = datos
    .filter((item) => item.etiqueta === 'Crítica' || item.etiqueta === 'Alta')
    .reduce((acumulado, item) => acumulado + item.valor, 0);
  const porcentaje = total === 0 ? 0 : (criticasYAltas / total) * 100;
  return `${porcentaje.toFixed(1)}% de las vulnerabilidades analizadas son Crítica o Alta.`;
}

export function interpretarPastelSeveridad(): string {
  return 'La proporción de cada color corresponde exactamente a los porcentajes de la leyenda.';
}

export function interpretarBoxplotCvss(resumen: ResumenCincoNumeros): string {
  return `El bigote superior llega hasta ${resumen.maximo.toFixed(1)}, mostrando que la muestra incluye casos cercanos al máximo teórico de la escala CVSS.`;
}

// A diferencia del boxplot doble del informe (que compara resúmenes de
// cinco números completos), el endpoint en vivo de cvssPorAcceso solo
// calcula el promedio por grupo (generarDatosCvssPorAcceso) — la
// interpretación se basa en esos dos promedios nomás, sin necesitar el
// resto de ComparadorDeCategorias.
export function interpretarCvssPorAcceso(datos: DatoConteo[]): string {
  const remoto = datos.find((item) => item.etiqueta === 'Remoto')?.valor ?? 0;
  const local = datos.find((item) => item.etiqueta === 'Local')?.valor ?? 0;
  const diferencia = remoto - local;

  if (Math.abs(diferencia) < UMBRAL_DIFERENCIA_DESPRECIABLE) {
    return 'La severidad promedio entre acceso remoto y local es prácticamente igual en esta muestra.';
  }

  const cual = diferencia > 0 ? 'remoto' : 'local';
  return (
    `Las vulnerabilidades de acceso ${cual} presentan, en promedio, una severidad ${Math.abs(diferencia).toFixed(2)} puntos mayor, ` +
    'lo que sugiere priorizar su remediación.'
  );
}

export function interpretarDispersionCvssDias(datos: { puntos: Array<{ x: number; y: number }>; correlacion: number }): string {
  if (datos.puntos.length < 2) {
    return 'No hay suficientes vulnerabilidades con "Días para Parche" registrado para calcular una correlación.';
  }
  const fuerza =
    Math.abs(datos.correlacion) < UMBRAL_CORRELACION_DEBIL
      ? 'una relación lineal débil: la severidad, por sí sola, no determina la velocidad de respuesta ante una vulnerabilidad.'
      : 'una relación lineal apreciable entre severidad y tiempo de parche.';
  return `La correlación obtenida es ${datos.correlacion.toFixed(3)} — ${fuerza}`;
}

// `totalSinClasificar`: cantidad de vulnerabilidades excluidas del ranking
// por no tener un tipo real asignado (ver generarTopTiposClasificados en
// GraficosEstadisticos.ts) — se informa como nota aparte en vez de
// graficarse junto a los tipos reales (decisión confirmada con el usuario:
// "Sin clasificar" es ausencia de dato, no una categoría comparable).
export function interpretarTopTipos(datos: DatoConteo[], totalSinClasificar = 0): string {
  if (datos.length === 0 && totalSinClasificar === 0) return 'No hay datos suficientes.';
  if (datos.length === 0) {
    return `Ninguna vulnerabilidad tiene un tipo clasificado (${totalSinClasificar} sin clasificar).`;
  }
  const base = `"${datos[0].etiqueta}" encabeza la lista con ${datos[0].valor} caso(s).`;
  return totalSinClasificar > 0
    ? `${base} Se excluyeron ${totalSinClasificar} vulnerabilidad(es) sin tipo clasificado.`
    : base;
}

export function interpretarTopSoftware(datos: DatoConteo[]): string {
  if (datos.length === 0) return 'No hay datos suficientes.';
  return `"${datos[0].etiqueta}" es el software con más vulnerabilidades reportadas (${datos[0].valor}).`;
}
