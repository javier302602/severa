import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { AuditoriaRepository } from '../ports/out/AuditoriaRepository';
import { DatosInforme, ResumenEstadisticoInforme, FilaMuestraInforme, AnexoDatasetInforme } from '../ports/out/GeneradorDeInformes';
import {
  calcularMedia,
  calcularMediana,
  calcularModa,
  calcularCuartiles,
  calcularRango,
  calcularVarianzaMuestral,
  calcularDesviacionEstandarMuestral,
  calcularCoeficienteVariacion,
  calcularResumenCincoNumeros,
  ResumenCincoNumeros
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

// Anexo A ("Dataset completo"): límite razonable para que el PDF/Word siga
// siendo un documento manejable — más allá de esto, un dataset de miles de
// filas generaría un anexo de cientos de páginas. Por debajo del límite se
// listan TODAS las filas (dataset "completo" de verdad, no una muestra);
// por encima, se recurre a la misma técnica de muestreo sistemático de
// muestraRepresentativa (espaciado uniforme, no solo los primeros casos),
// pero con este tamaño en vez de los 10 de MuestraDeRegistrosInforme.
const LIMITE_ANEXO_DATASET_COMPLETO = 300;

// Bug real (2026-07-19): calcularResumenCincoNumeros tira ValorEstadisticoError
// sobre una lista vacía — un catálogo sin ninguna vulnerabilidad de un tipo de
// acceso (ej. todo Remoto, cero Local) rompía TODO el informe/resumen. null
// de ese lado en vez de tirar (mismo criterio que compararGrupos).
function resumenCincoNumerosSeguro(scores: number[]): ResumenCincoNumeros | null {
  return scores.length > 0 ? calcularResumenCincoNumeros(scores) : null;
}

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
  auditoriaRepository: AuditoriaRepository,
  generadoPara: string,
  analistaId: string
): Promise<DatosInforme> {
  const vulnerabilidades = await vulnerabilidadRepository.listar(analistaId);
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

  const anexoDataset: AnexoDatasetInforme =
    vulnerabilidades.length <= LIMITE_ANEXO_DATASET_COMPLETO
      ? { filas: vulnerabilidades.map(aFilaMuestra), esMuestra: false, tamanoOriginal: vulnerabilidades.length }
      : {
          filas: muestraRepresentativa(vulnerabilidades, LIMITE_ANEXO_DATASET_COMPLETO).map(aFilaMuestra),
          esMuestra: true,
          tamanoOriginal: vulnerabilidades.length
        };

  // Ver comentario en OrigenYCalidadDatosInforme (GeneradorDeInformes.ts):
  // es lo único que sobrevive de una importación más allá de su propia
  // respuesta HTTP — el conteo agregado, no el detalle por fila.
  //
  // registros_auditoria es GLOBAL por decisión de diseño (registro de
  // sistema para que un administrador audite eventos de todos los
  // analistas, no dato de negocio de uno solo — ver migración 006) — pero
  // el informe SÍ es un documento del analista autenticado, así que acá se
  // filtra por `usuario === analistaId` antes de elegir "el último import".
  // Sin este filtro, el informe de un analista mostraría el último import
  // de CUALQUIER analista del sistema — una fuga cross-tenant real, aunque
  // la tabla subyacente sea intencionalmente global.
  const registrosAuditoria = await auditoriaRepository.listar();
  const ultimoImport =
    registrosAuditoria.find((registro) => registro.accion === 'ImportarDataset' && registro.usuario === analistaId) ?? null;
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
      remoto: resumenCincoNumerosSeguro(remotos),
      local: resumenCincoNumerosSeguro(locales)
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
    generadoPara,
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
    graficos,
    anexoDataset
  };
}
