import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { AuditoriaRepository } from '../ports/out/AuditoriaRepository';
import { DatosInforme, ResumenEstadisticoInforme, FilaMuestraInforme } from '../ports/out/GeneradorDeInformes';
import {
  calcularMedia,
  calcularMediana,
  calcularModa,
  calcularCuartiles,
  calcularRango,
  calcularVarianzaMuestral,
  calcularDesviacionEstandarMuestral,
  calcularCoeficienteVariacion,
  calcularResumenCincoNumeros
} from '../../domain/services/EstadisticaDescriptiva';
import { generarTablaAgrupada, generarTablaSinAgrupar } from '../../domain/services/DistribucionFrecuencias';
import { compararGrupos } from '../../domain/services/ComparadorDeCategorias';
import { generarRanking } from '../../domain/services/MotorDePriorizacion';
import { generarInterpretacion } from '../../domain/services/InterpretadorDeResultados';
import { calcularCorrelacionPearson } from '../../domain/services/Correlacion';
import { clasificar } from '../../domain/services/ClasificadorDeRiesgo';
import {
  generarDatosHistogramaCvss,
  generarDatosHistogramaAgrupado,
  generarDatosHistogramaDiasParche,
  contarPorSeveridad,
  generarTopN,
  generarTopTiposClasificados,
  ETIQUETA_POR_NIVEL
} from '../../domain/services/GraficosEstadisticos';
import { Vulnerabilidad } from '../../domain/entities/Vulnerabilidad';

const LIMITACIONES_CONOCIDAS: string[] = [
  'El plazo de remediación (¿está vencido o no?) se calcula desde la fecha en que SEVERA importó cada registro, no desde la fecha real de publicación pública del CVE en la NVD — el dataset que consume SEVERA no incluye esa fecha (ver LIMITACIÓN CONOCIDA en MotorDePriorizacion.ts).',
  'Los filtros de fecha de Búsqueda avanzada ("cargado desde/hasta") se aplican por el mismo motivo sobre la fecha de carga, no sobre la fecha de divulgación real del CVE.',
  'Este informe aplica estadística descriptiva sobre el conjunto de vulnerabilidades cargado en el sistema al momento de generarlo — no es una muestra probabilística ni se aplican pruebas de hipótesis; los hallazgos describen este conjunto de datos, no se generalizan estadísticamente más allá de él.'
];

const TAMANO_MUESTRA = 10;

function aFilaMuestra(vulnerabilidad: Vulnerabilidad): FilaMuestraInforme {
  return {
    cve: vulnerabilidad.cve.valor,
    software: vulnerabilidad.software,
    cvssScore: vulnerabilidad.cvssScore.valor,
    severidad: ETIQUETA_POR_NIVEL[clasificar(vulnerabilidad.cvssScore).valor],
    tipoAcceso: vulnerabilidad.tipoAcceso?.valor ?? 'N/A',
    estadoRemediacion: vulnerabilidad.estadoRemediacion.valor,
    fechaCarga: vulnerabilidad.fechaCarga
  };
}

// Muestreo sistemático (misma técnica que la sección 5.2 del informe de
// referencia): espaciado uniforme sobre el total de filas, para que la
// muestra represente todo el conjunto y no solo los primeros casos
// cargados.
function muestraRepresentativa(vulnerabilidades: Vulnerabilidad[], tamano: number): Vulnerabilidad[] {
  if (vulnerabilidades.length <= tamano) {
    return vulnerabilidades;
  }

  const paso = (vulnerabilidades.length - 1) / (tamano - 1);
  const indices = Array.from({ length: tamano }, (_, i) => Math.round(i * paso));
  return [...new Set(indices)].map((indice) => vulnerabilidades[indice]);
}

// Helper compartido por GenerarInforme y GenerarResumenEjecutivo: ambos casos
// de uso necesitan exactamente el mismo DatosInforme, solo cambia a qué
// método del puerto de salida se lo pasan. Se extrae aquí para no duplicar
// la orquestación de EstadisticaDescriptiva + DistribucionFrecuencias +
// ComparadorDeCategorias + MotorDePriorizacion + InterpretadorDeResultados +
// GraficosEstadisticos (Fase 1: ahora también arma los datos de los 10
// gráficos que antes solo vivían en pantalla, para incrustarlos en el
// informe).
export async function recopilarDatosDeInforme(
  vulnerabilidadRepository: VulnerabilidadRepository,
  auditoriaRepository: AuditoriaRepository
): Promise<DatosInforme> {
  const vulnerabilidades = await vulnerabilidadRepository.listar();
  const scores = vulnerabilidades.map((item) => item.cvssScore.valor);

  const { q1, q3 } = calcularCuartiles(scores);
  const resumenEstadistico: ResumenEstadisticoInforme = {
    media: calcularMedia(scores),
    mediana: calcularMediana(scores),
    moda: calcularModa(scores),
    q1,
    q3,
    rango: calcularRango(scores),
    varianza: calcularVarianzaMuestral(scores),
    desviacionEstandar: calcularDesviacionEstandarMuestral(scores),
    coeficienteVariacion: calcularCoeficienteVariacion(scores)
  };

  const distribucionFrecuencias = generarTablaAgrupada(scores);
  const distribucionSinAgrupar = generarTablaSinAgrupar(scores);

  const remotos = vulnerabilidades.filter((item) => item.tipoAcceso?.valor === 'Remoto').map((item) => item.cvssScore.valor);
  const locales = vulnerabilidades.filter((item) => item.tipoAcceso?.valor === 'Local').map((item) => item.cvssScore.valor);
  const comparacionAccesoRemotoLocal = compararGrupos(remotos, locales);

  const rankingUrgencia = generarRanking(vulnerabilidades);

  const interpretacion = generarInterpretacion(
    vulnerabilidades.length,
    { media: resumenEstadistico.media, mediana: resumenEstadistico.mediana, coeficienteVariacion: resumenEstadistico.coeficienteVariacion },
    comparacionAccesoRemotoLocal,
    rankingUrgencia
  );

  const muestraDeRegistros = {
    primeros: vulnerabilidades.slice(0, TAMANO_MUESTRA).map(aFilaMuestra),
    representativa: muestraRepresentativa(vulnerabilidades, TAMANO_MUESTRA).map(aFilaMuestra)
  };

  // Ver comentario en OrigenYCalidadDatosInforme (GeneradorDeInformes.ts):
  // es lo único que sobrevive de una importación más allá de su propia
  // respuesta HTTP — el conteo agregado, no el detalle por fila.
  const registrosAuditoria = await auditoriaRepository.listar();
  const ultimoImport = registrosAuditoria.find((registro) => registro.accion === 'ImportarDataset') ?? null;
  const origenYCalidad = {
    ultimoCambioRegistrado: ultimoImport
      ? { detalle: ultimoImport.detalle, fecha: ultimoImport.fechaHora, usuario: ultimoImport.usuario }
      : null
  };

  // Pares CVSS/Días para Parche: solo las vulnerabilidades que tienen el
  // dato (diasParaParche es opcional). Con menos de 2 pares no hay
  // correlación posible — se degrada a "sin dato" en vez de romper todo el
  // informe por un campo opcional.
  const paresDispersión = vulnerabilidades
    .filter((item) => item.diasParaParche !== undefined)
    .map((item) => ({ x: item.cvssScore.valor, y: item.diasParaParche as number }));
  const diasParaParche = paresDispersión.map((par) => par.y);

  // Bug real reportado con capturas: "Sin clasificar" (ausencia de tipo, no
  // un tipo real) dominaba tan fuertemente el Top Tipos que las 9
  // categorías reales quedaban invisibles — mismo criterio de exclusión que
  // GenerarGrafico.ts aplica para la versión en pantalla.
  const topTiposClasificados = generarTopTiposClasificados(vulnerabilidades, 10);

  const graficos = {
    histogramaCvss: generarDatosHistogramaCvss(scores),
    barrasSeveridad: contarPorSeveridad(scores),
    pastelSeveridad: contarPorSeveridad(scores),
    boxplotCvss: calcularResumenCincoNumeros(scores),
    histogramaAgrupado: generarDatosHistogramaAgrupado(scores),
    boxplotPorAcceso: {
      remoto: calcularResumenCincoNumeros(remotos),
      local: calcularResumenCincoNumeros(locales)
    },
    dispersionCvssDias: {
      puntos: paresDispersión,
      correlacion: paresDispersión.length >= 2 ? calcularCorrelacionPearson(paresDispersión) : 0
    },
    histogramaDiasParche: generarDatosHistogramaDiasParche(diasParaParche),
    topTipos: topTiposClasificados.datos,
    totalTiposSinClasificar: topTiposClasificados.totalSinClasificar,
    topSoftware: generarTopN(vulnerabilidades, 'software', 10)
  };

  return {
    generadoEn: new Date(),
    totalVulnerabilidades: vulnerabilidades.length,
    resumenEstadistico,
    distribucionFrecuencias,
    distribucionSinAgrupar,
    comparacionAccesoRemotoLocal,
    rankingUrgencia,
    interpretacion,
    muestraDeRegistros,
    origenYCalidad,
    limitacionesConocidas: LIMITACIONES_CONOCIDAS,
    graficos
  };
}
