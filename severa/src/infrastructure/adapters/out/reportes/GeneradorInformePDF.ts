import PDFDocument from 'pdfkit';
import { GeneradorDeInformes, DatosInforme, DatosInformeDataset } from '../../../../application/ports/out/reportes/GeneradorDeInformes';
import { GeneradorInformeWord } from './GeneradorInformeWord';
import {
  dibujarBarras,
  dibujarBarrasHorizontales,
  dibujarHistograma,
  dibujarBoxplot,
  dibujarBoxplotDoble,
  dibujarDispersion,
  dibujarPastel
} from './DibujoDeGraficosPdf';
import {
  interpretarHistogramaCvss,
  interpretarBarrasSeveridad,
  interpretarPastelSeveridad,
  interpretarBoxplotCvss,
  interpretarHistogramaAgrupado,
  interpretarDispersionCvssDias,
  interpretarHistogramaDiasParche,
  interpretarTopTipos,
  interpretarTopSoftware
} from '../../../../domain/services/graphs/InterpretacionDeGraficos';
import { interpretarComparacionAcceso } from '../../../../domain/services/InterpretadorDeResultados';
import { formatearEstadistico } from '../../../../domain/services/inferential-statistics/ComparadorDeCategorias';
// M-10 Ronda 2, Pasada 2-A (RF-130): extraídos a LayoutInformePdf.ts, sin
// ningún cambio de comportamiento — ver ese archivo para el porqué
// (InformeUniversalRF130.ts, el orquestador nuevo de 20 secciones, necesita
// estos mismos primitivos y antes eran privados acá).
import {
  nuevaSeccion,
  reservarPaginaDeIndice,
  completarIndice,
  numerarPaginas,
  subseccion,
  parrafo,
  formula,
  asegurarEspacio,
  dibujarTabla,
  dibujarBadge
} from './LayoutInformePdf';
// M-10 Ronda 2, Pasada 2-C — Cutover, Paso 1 de 2: generarInformeCompleto
// (CVSS) pasa a delegar en el orquestador de 20 secciones. generarResumenEjecutivo
// (RF-82) NO se toca acá — sigue en renderizarPdf/resumido=true con las
// dibujarX() viejas, sin ningún cambio. El cutover del pipeline genérico
// (generarInformeDataset) es el Paso 2, aparte.
import { renderizarInformeUniversal } from './InformeUniversalRF130';

// RF-77/RF-82: implementación única del puerto GeneradorDeInformes (mismo
// patrón de "un solo adaptador por puerto de salida" que SvgGraficosAdapter
// en Sprint 07). Compone GeneradorInformeWord para el método .docx, así los
// dos archivos pedidos quedan separados por formato sin duplicar el puerto
// en dos clases que no podrían implementarlo completo por separado.
//
// Fase 1 (retrofit): estructura y estilo de redacción tomados del informe de
// referencia verificado (Proyecto_Final_2.qmd — análisis real en R/Quarto de
// 150 vulnerabilidades NVD), adaptados a un informe que SIADE genera bajo
// demanda sobre datos que cambian con el tiempo, no sobre un dataset fijo de
// tesis: se cae el "diseño de investigación" narrado en 10 pasos, la
// justificación personal del autor y el capítulo de "pensamiento
// estadístico" (son reflexión de quien hizo el trabajo, no algo que un
// backend pueda generar con honestidad) — se conserva el patrón real que sí
// es transferible: fórmula → sustitución con datos reales → interpretación
// en prosa, y cada gráfico con Objetivo/Fundamento/Relación con lo
// anterior/figura/Funcionamiento del algoritmo/Análisis y conclusiones.
export class GeneradorInformePDF implements GeneradorDeInformes {
  constructor(private readonly generadorInformeWord: GeneradorInformeWord = new GeneradorInformeWord()) {}

  async generarInformeCompleto(datos: DatosInforme): Promise<Buffer> {
    return renderizarInformeUniversal({ pipeline: 'cvss', datos });
  }

  async generarInformeWord(datos: DatosInforme): Promise<Buffer> {
    return this.generadorInformeWord.generar(datos);
  }

  async generarResumenEjecutivo(datos: DatosInforme): Promise<Buffer> {
    return this.renderizarPdf('Resumen Ejecutivo SIADE', datos, true);
  }

  // M-10 Ronda 2, Pasada 2-C — Cutover, Paso 2 de 2: generarInformeDataset
  // (genérico) pasa a delegar en el orquestador de 20 secciones, mismo
  // criterio que generarInformeCompleto (Paso 1). renderizarPdfDataset y las
  // 11 dibujarXDataset() que orquestaba se retiraron — sin otro consumidor
  // (ver diagnóstico previo, confirmado de nuevo antes de borrar).
  async generarInformeDataset(datos: DatosInformeDataset): Promise<Buffer> {
    return renderizarInformeUniversal({ pipeline: 'generico', datos });
  }

  async generarInformeDatasetWord(datos: DatosInformeDataset): Promise<Buffer> {
    return this.generadorInformeWord.generarDataset(datos);
  }

  private renderizarPdf(titulo: string, datos: DatosInforme, resumido: boolean): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // Formato APA 7 (2026-07-20): márgenes de 1 pulgada (72pt) en las 4
      // direcciones, tamaño Carta (el estándar del formato) — antes eran
      // márgenes de 50pt (~0.7in) sobre A4.
      const doc = new PDFDocument({ margin: 72, size: 'LETTER', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      dibujarPortada(doc, titulo, datos);
      // El resumen ejecutivo es, por diseño, un documento corto de 3
      // gráficos — un índice de una sola página para un puñado de secciones
      // no aporta nada; se reserva solo para el informe completo.
      const paginaIndice = resumido ? null : reservarPaginaDeIndice(doc);
      dibujarIntroduccion(doc, datos);
      dibujarOrigenYCalidad(doc, datos);
      if (!resumido) dibujarMetodologia(doc);
      dibujarOrganizacionDeDatos(doc, datos, resumido);
      dibujarTendenciaCentral(doc, datos);
      dibujarVariabilidad(doc, datos);
      if (!resumido) dibujarDistribucionDeDatos(doc, datos);
      dibujarGraficos(doc, datos, resumido);
      dibujarAplicacionPractica(doc, datos, resumido);
      dibujarConclusiones(doc, datos);
      if (!resumido) {
        dibujarReferencias(doc);
        dibujarAnexos(doc, datos);
      }

      if (paginaIndice !== null) completarIndice(doc, paginaIndice);
      numerarPaginas(doc);
      doc.end();
    });
  }
}

// ---------------------------------------------------------------------
// Portada e introducción (capítulos 1-2 del .qmd, adaptados: sin período/
// ubicación/docente/institución/justificación personal — no aplica a un
// informe generado por software bajo demanda).
// ---------------------------------------------------------------------

function dibujarPortada(doc: PDFKit.PDFDocument, titulo: string, datos: DatosInforme): void {
  doc.fontSize(20).fillColor('#0f172a').font('Times-Bold').text(titulo, { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(12).fillColor('#334155').font('Times-Bold').text(`Generado por SIADE para ${datos.generadoPara}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#64748b').font('Times-Roman').text(`Generado: ${datos.generadoEn.toLocaleString()}`, { align: 'center' });
  doc.text(`Total de vulnerabilidades analizadas: ${datos.totalVulnerabilidades}`, { align: 'center' });
  doc.moveDown(2);
}

function dibujarIntroduccion(doc: PDFKit.PDFDocument, datos: DatosInforme): void {
  nuevaSeccion(doc, '1', 'Introducción');
  parrafo(
    doc,
    `Este informe aplica técnicas de estadística descriptiva sobre el conjunto de ${datos.totalVulnerabilidades} ` +
      'vulnerabilidades de seguridad actualmente cargadas en SIADE, con el fin de caracterizar su severidad ' +
      '(CVSS Score — Common Vulnerability Scoring System, el estándar abierto de FIRST/NIST para evaluar la ' +
      'gravedad de una vulnerabilidad en una escala de 0.0 a 10.0) y fundamentar, con evidencia numérica, una ' +
      'propuesta de priorización de remediación.'
  );
}

// ---------------------------------------------------------------------
// Origen y calidad de los datos (capítulo 4 del .qmd, adaptado: acá no hay
// un archivo fijo conocido de antemano, así que se reporta lo único que
// SIADE conserva más allá de la respuesta de un import puntual — ver
// OrigenYCalidadDatosInforme en GeneradorDeInformes.ts).
// ---------------------------------------------------------------------

function dibujarOrigenYCalidad(doc: PDFKit.PDFDocument, datos: DatosInforme): void {
  nuevaSeccion(doc, '2', 'Origen y calidad de los datos');
  const ultimo = datos.origenYCalidad.ultimoCambioRegistrado;
  if (ultimo) {
    parrafo(
      doc,
      `El último cambio de importación registrado en el historial de auditoría fue: "${ultimo.detalle}", el ` +
        `${ultimo.fecha.toLocaleString()} (analista: ${ultimo.usuario}).`
    );
  } else {
    parrafo(doc, 'No hay ningún registro de auditoría de importación disponible todavía para este dataset.');
  }
  parrafo(
    doc,
    'SIADE no conserva el motivo de cada fila rechazada más allá de la respuesta inmediata de esa importación — ' +
      'solo el conteo agregado (importados/rechazados) queda registrado en el historial de auditoría.'
  );
}

// ---------------------------------------------------------------------
// Metodología (capítulo 3.5 del .qmd — "Fórmulas estadísticas utilizadas",
// sin los "10 pasos narrados" del diseño de investigación ni los objetivos
// de tesis, que no tienen equivalente en un informe generado por software).
// ---------------------------------------------------------------------

function dibujarMetodologia(doc: PDFKit.PDFDocument): void {
  nuevaSeccion(doc, '3', 'Metodología');
  parrafo(
    doc,
    'Este informe aplica estadística descriptiva, no inferencial: no se realizan pruebas de hipótesis ni se ' +
      'generalizan los hallazgos más allá del conjunto de vulnerabilidades cargado en SIADE al momento de generarlo.'
  );
  const formulas: Array<[string, string]> = [
    ['Media, mediana, moda', 'nivel de severidad típico, contrastando el promedio con el valor central y el más frecuente.'],
    ['Cuartiles (Q1/Q3)', 'reparto de las puntuaciones en el 25% inferior y el 25% superior de la escala.'],
    ['Rango, varianza, desviación estándar, coeficiente de variación', 'qué tan dispersas están las puntuaciones alrededor de la media.'],
    ['Correlación de Pearson', 'grado y dirección de la relación lineal entre CVSS Score y Días para Parche.']
  ];
  formulas.forEach(([nombre, uso]) => {
    doc.fontSize(9.5).font('Times-Bold').fillColor('#1e293b').text(`${nombre}: `, { continued: true });
    doc.font('Times-Roman').fillColor('#334155').text(uso);
  });
  doc.moveDown(0.4);
}

// ---------------------------------------------------------------------
// Organización de datos (capítulo 5 del .qmd): antes el informe solo
// mostraba agregados — acá se agrega una muestra de filas reales, primeros
// N y una muestra representativa por muestreo sistemático.
// ---------------------------------------------------------------------

function dibujarOrganizacionDeDatos(doc: PDFKit.PDFDocument, datos: DatosInforme, resumido: boolean): void {
  nuevaSeccion(doc, '4', 'Organización de los datos');
  parrafo(
    doc,
    `El dataset analizado contiene ${datos.totalVulnerabilidades} registros, con los campos CVE, Software, CVSS ` +
      'Score, Severidad (derivada del CVSS Score), Tipo de Vulnerabilidad, Acceso Remoto, Estado de Remediación y ' +
      'Fecha de carga.'
  );

  const encabezados = ['CVE', 'Software', 'CVSS', 'Severidad', 'Acceso', 'Estado'];
  const anchos = [90, 140, 40, 55, 55, 70];

  subseccion(doc, 'Primeros registros cargados');
  dibujarTabla(
    doc,
    encabezados,
    datos.muestraDeRegistros.primeros
      .slice(0, resumido ? 5 : 10)
      .map((fila) => [fila.cve, fila.software, fila.cvssScore.toFixed(1), fila.severidad, fila.tipoAcceso, fila.estadoRemediacion]),
    anchos
  );

  if (!resumido) {
    subseccion(doc, 'Muestra representativa (muestreo sistemático sobre todo el conjunto)');
    dibujarTabla(
      doc,
      encabezados,
      datos.muestraDeRegistros.representativa.map((fila) => [
        fila.cve,
        fila.software,
        fila.cvssScore.toFixed(1),
        fila.severidad,
        fila.tipoAcceso,
        fila.estadoRemediacion
      ]),
      anchos
    );
  }
}

// ---------------------------------------------------------------------
// Tendencia central / Variabilidad (capítulos 6-7 del .qmd): mismo patrón
// fórmula -> sustitución con datos reales -> interpretación en prosa que ya
// exigía el .qmd, aplicado a los mismos números que antes solo se imprimían
// como 8 líneas planas.
// ---------------------------------------------------------------------

// Exportada (M-10 Ronda 2, Pasada 2-A): InformeUniversalRF130.ts la reusa
// tal cual para la sección "Estadística descriptiva" del pipeline CVSS —
// mismo motivo que las otras 3 exportaciones de este archivo, evitar una
// segunda copia de la misma regla.
export function nivelDeRiesgoDesdeCvss(cvss: number): string {
  if (cvss >= 9.0) return 'Crítico';
  if (cvss >= 7.0) return 'Alto';
  if (cvss >= 4.0) return 'Moderado';
  return 'Bajo';
}

function dibujarTendenciaCentral(doc: PDFKit.PDFDocument, datos: DatosInforme): void {
  const r = datos.resumenEstadistico;
  const n = datos.totalVulnerabilidades;
  const suma = r.media * n;

  nuevaSeccion(doc, '5', 'Medidas de tendencia central');
  parrafo(doc, 'Estas medidas indican dónde se concentra típicamente la severidad (CVSS Score) del conjunto analizado.');

  subseccion(doc, 'Media aritmética');
  // Los símbolos "x̄"/"Σ" (macrón combinado, sigma griega) rompen la
  // codificación WinAnsi de las fuentes estándar de pdfkit (Helvetica) —
  // bug real confirmado leyendo el PDF generado en vivo, se veía como
  // mojibake ("x0BÒ£xi..."). Se usa notación ASCII-segura en su lugar.
  formula(doc, `Media = (suma de las ${n} puntuaciones) / n = ${suma.toFixed(2)} / ${n} = ${r.media.toFixed(2)}`);
  parrafo(
    doc,
    `En promedio, cada vulnerabilidad analizada tiene una puntuación CVSS de ${r.media.toFixed(2)}, un nivel que ` +
      `corresponde a riesgo "${nivelDeRiesgoDesdeCvss(r.media)}" según la escala CVSS.`
  );

  subseccion(doc, 'Mediana');
  formula(doc, `Me = ${r.mediana.toFixed(2)} (valor central de las ${n} puntuaciones ordenadas)`);
  const diferenciaMediaMediana = Math.abs(r.media - r.mediana);
  parrafo(
    doc,
    diferenciaMediaMediana < 0.5
      ? `La mediana (${r.mediana.toFixed(2)}) está cerca de la media (${r.media.toFixed(2)}), lo que indica una ` +
        'distribución relativamente simétrica, sin unos pocos casos extremos arrastrando el promedio.'
      : `La mediana (${r.mediana.toFixed(2)}) se aleja de la media (${r.media.toFixed(2)}) en ${diferenciaMediaMediana.toFixed(2)} ` +
        'puntos, lo que sugiere una distribución con cierta asimetría.'
  );

  subseccion(doc, 'Moda');
  parrafo(doc, `Moda = ${r.moda.map((valor) => valor.toFixed(1)).join(', ')} — el/los valor(es) que más se repiten en la muestra.`);

  subseccion(doc, 'Cuartiles');
  formula(doc, `Q1 = ${r.q1.toFixed(2)}    Q3 = ${r.q3.toFixed(2)}`);
  parrafo(
    doc,
    `El 25% de las vulnerabilidades tiene una puntuación igual o inferior a ${r.q1.toFixed(2)} (Q1), y el 75% tiene ` +
      `una puntuación igual o inferior a ${r.q3.toFixed(2)} (Q3).`
  );

  dibujarTabla(
    doc,
    ['Medida', 'Valor', 'Interpretación'],
    [
      ['Media', r.media.toFixed(2), 'Promedio de severidad CVSS'],
      ['Mediana', r.mediana.toFixed(2), 'El 50% está por debajo de este valor'],
      ['Moda', r.moda.map((v) => v.toFixed(1)).join(', '), 'Valor(es) más frecuente(s)'],
      ['Q1 (25%)', r.q1.toFixed(2), 'El 25% está por debajo'],
      ['Q3 (75%)', r.q3.toFixed(2), 'El 75% está por debajo']
    ],
    [110, 90, 260]
  );
}

function dibujarVariabilidad(doc: PDFKit.PDFDocument, datos: DatosInforme): void {
  const r = datos.resumenEstadistico;

  nuevaSeccion(doc, '6', 'Medidas de variabilidad');
  parrafo(doc, 'Conocido el nivel típico de severidad, estas medidas cuantifican cuánto se dispersan los datos alrededor de él.');

  subseccion(doc, 'Rango, varianza y desviación estándar');
  formula(doc, `R = ${r.rango.toFixed(2)}    s² = ${r.varianza.toFixed(4)}    s = ${r.desviacionEstandar.toFixed(4)}`);
  parrafo(
    doc,
    `Una desviación estándar de ${r.desviacionEstandar.toFixed(2)} puntos alrededor de una media de ${r.media.toFixed(2)} ` +
      'indica que no todas las vulnerabilidades son igual de severas, incluso si el promedio general es alto.'
  );

  subseccion(doc, 'Coeficiente de variación');
  formula(doc, `CV = (desviación estándar / media) x 100 = ${r.coeficienteVariacion.toFixed(2)}%`);
  parrafo(
    doc,
    r.coeficienteVariacion < 15
      ? `Un CV de ${r.coeficienteVariacion.toFixed(2)}% indica baja dispersión: la severidad es relativamente homogénea.`
      : r.coeficienteVariacion <= 30
        ? `Un CV de ${r.coeficienteVariacion.toFixed(2)}% indica dispersión moderada en la severidad de las vulnerabilidades.`
        : `Un CV de ${r.coeficienteVariacion.toFixed(2)}% indica alta dispersión: la severidad es heterogénea, lo que ` +
          'justifica comparar por subgrupos (ver Gráfico 6, sección 8) en vez de tratar el conjunto como homogéneo.'
  );

  dibujarTabla(
    doc,
    ['Medida', 'Valor', 'Interpretación'],
    [
      ['Rango', r.rango.toFixed(2), 'Diferencia entre máximo y mínimo'],
      ['Varianza', r.varianza.toFixed(4), 'Promedio de desviaciones cuadradas'],
      ['Desv. estándar', r.desviacionEstandar.toFixed(4), 'Dispersión típica respecto a la media'],
      ['Coef. variación', `${r.coeficienteVariacion.toFixed(2)}%`, 'Variabilidad relativa al promedio']
    ],
    [110, 90, 260]
  );
}

// ---------------------------------------------------------------------
// Distribución de datos (capítulo 8 del .qmd): sin agrupar + agrupada. Solo
// en la versión completa (el resumen ejecutivo se salta esta sección, igual
// que ya hacía la versión anterior de este generador).
// ---------------------------------------------------------------------

function dibujarDistribucionDeDatos(doc: PDFKit.PDFDocument, datos: DatosInforme): void {
  nuevaSeccion(doc, '7', 'Distribución de los datos');
  parrafo(
    doc,
    'Las medidas de los capítulos anteriores resumen la severidad en unos pocos números; ver la distribución ' +
      'completa muestra además cómo se reparten los valores.'
  );

  subseccion(doc, 'Sin agrupar (primeros 20 valores únicos)');
  dibujarTabla(
    doc,
    ['CVSS Score', 'Frecuencia'],
    datos.distribucionSinAgrupar.slice(0, 20).map((fila) => [fila.valor.toFixed(1), String(fila.frecuencia)]),
    [200, 200]
  );

  subseccion(doc, 'Agrupada en intervalos, con frecuencia acumulada');
  dibujarTabla(
    doc,
    ['Intervalo', 'Frec. absoluta', 'Frec. relativa (%)', 'Frec. acumulada'],
    datos.distribucionFrecuencias.map((fila) => [
      fila.intervalo,
      String(fila.frecuenciaAbsoluta),
      `${fila.frecuenciaRelativaPorcentaje.toFixed(1)}%`,
      String(fila.frecuenciaAcumulada)
    ]),
    [110, 110, 130, 110]
  );
}

// ---------------------------------------------------------------------
// Gráficos explicados detalladamente (capítulo 9 del .qmd): los 10 gráficos,
// cada uno con el mismo patrón de 6 bloques. En el resumen ejecutivo solo se
// incluyen 3 gráficos clave (histograma, boxplot, pastel).
// ---------------------------------------------------------------------

// RF-131/RF-81 (M-10 Ronda 2, Pasada 1): distingue visualmente qué contenido
// es descriptivo puro, cuál es una comparación entre grupos (etiquetada
// "Inferencial" — decisión confirmada: sigue siendo una comparación
// descriptiva de medias SIN prueba de hipótesis formal, ver el "Fundamento
// estadístico"/caveat de cada uso más abajo, la etiqueta cambia de nombre
// pero no de naturaleza) y cuál está deliberadamente pendiente (M-16 sigue
// bloqueado, ver IMotorPrediccion.ts — "Pendiente" para no omitir en
// silencio la ausencia de análisis predictivo, mismo criterio que RF-130).
type TipoDeAnalisis = 'Descriptivo' | 'Inferencial' | 'Pendiente';

const COLOR_ETIQUETA_TIPO_ANALISIS: Record<TipoDeAnalisis, string> = {
  Descriptivo: '#0369a1',
  Inferencial: '#7c3aed',
  Pendiente: '#64748b'
};

// Badge en miniatura, mismo lenguaje visual que el encabezado de dibujarTabla
// (rect de color + texto claro encima), en una paleta deliberadamente
// distinta de las de severidad (rojo/naranja/ámbar/verde) para no generar
// confusión semántica con "Crítico/Alto/Moderado/Bajo".
// M-10 Ronda 2, Pasada 2-A: el dibujo en sí (rect redondeado + texto claro
// encima) vive ahora en dibujarBadge (LayoutInformePdf.ts) — extraído para
// que InformeUniversalRF130.ts lo reuse con su propia paleta (badge de
// sección "No aplicable"). Este wrapper solo resuelve el color desde
// TipoDeAnalisis, comportamiento idéntico al de antes. Exportada (Pasada
// 2-A): InformeUniversalRF130.ts reusa el badge 'Pendiente' tal cual para
// las secciones 15/16 (bloqueadas por M-16), en vez de duplicar el color.
export function dibujarEtiquetaTipoAnalisis(doc: PDFKit.PDFDocument, tipo: TipoDeAnalisis): void {
  dibujarBadge(doc, tipo, COLOR_ETIQUETA_TIPO_ANALISIS[tipo]);
}

interface DefinicionGrafico {
  numero: number;
  titulo: string;
  tipo: TipoDeAnalisis;
  objetivo: string;
  fundamento: string;
  relacion: string;
  dibujar: (doc: PDFKit.PDFDocument) => void;
  analisis: (doc: PDFKit.PDFDocument) => void;
}

// Extraído de dibujarGraficos (antes vivía inline ahí) para que Anexo C
// ("Índice de figuras") pueda listar número + título de las 10 figuras sin
// duplicar esta lista a mano en dos lugares — una sola fuente de verdad.
// Exportada (M-10 Ronda 2, Pasada 2-A): InformeUniversalRF130.ts la reusa
// para el índice de figuras del Anexo C unificado (§20) — misma lista de 10
// gráficos, sin duplicarla.
export function construirDefinicionesGraficos(datos: DatosInforme): DefinicionGrafico[] {
  const g = datos.graficos;
  const r = datos.resumenEstadistico;
  const remotoVsLocal = datos.comparacionAccesoRemotoLocal;

  return [
    {
      numero: 1,
      titulo: 'Histograma de CVSS Score (distribución sin agrupar)',
      tipo: 'Descriptivo',
      objetivo: 'representar visualmente la forma completa de la distribución de CVSS Score.',
      fundamento: 'un histograma agrupa los valores continuos en clases y representa su frecuencia como la altura de cada barra.',
      relacion: 'las líneas de media y mediana coinciden con las calculadas en la sección 5; las barras reflejan la Tabla de la sección 7.',
      dibujar: (d) => (d.y = dibujarHistograma(d, g.histogramaCvss.bins, g.histogramaCvss.media, g.histogramaCvss.mediana, { titulo: 'Gráfico 1: Histograma de CVSS Score', etiquetaEjeX: 'CVSS Score', etiquetaEjeY: 'Frecuencia' })),
      analisis: (d) => parrafo(d, interpretarHistogramaCvss(g.histogramaCvss))
    },
    {
      numero: 2,
      titulo: 'Distribución por severidad (barras)',
      tipo: 'Descriptivo',
      objetivo: 'comparar cuántas vulnerabilidades hay en cada categoría de severidad.',
      fundamento: 'un gráfico de barras representa la frecuencia absoluta de una variable cualitativa ordinal.',
      relacion: 'los conteos son los mismos usados para calcular el porcentaje "Crítica+Alta" de la sección de Aplicación práctica.',
      dibujar: (d) => (d.y = dibujarBarras(d, g.barrasSeveridad, { titulo: 'Gráfico 2: Distribución por severidad', etiquetaEjeX: 'Severidad', etiquetaEjeY: 'Cantidad' })),
      analisis: (d) => parrafo(d, interpretarBarrasSeveridad(g.barrasSeveridad))
    },
    {
      numero: 3,
      titulo: 'Composición por severidad (pastel)',
      tipo: 'Descriptivo',
      objetivo: 'mostrar la proporción de cada categoría de severidad sobre el total, de un solo vistazo.',
      fundamento: 'mismos datos del Gráfico 2, expresados como porcentaje del total en vez de conteo absoluto.',
      relacion: 'reutiliza exactamente los mismos conteos del Gráfico 2 — no se recalcula nada nuevo.',
      dibujar: (d) => (d.y = dibujarPastel(d, g.pastelSeveridad, { titulo: 'Gráfico 3: Composición por severidad' })),
      analisis: (d) => parrafo(d, interpretarPastelSeveridad())
    },
    {
      numero: 4,
      titulo: 'Boxplot de CVSS Score',
      tipo: 'Descriptivo',
      objetivo: 'visualizar mediana, dispersión y posibles valores atípicos en un solo gráfico.',
      fundamento: 'la caja cubre el rango intercuartílico (Q1-Q3); los bigotes llegan hasta el mínimo y el máximo.',
      relacion: `los valores de la caja son los mismos Q1=${r.q1.toFixed(2)} y Q3=${r.q3.toFixed(2)} de la sección 5.`,
      dibujar: (d) => (d.y = dibujarBoxplot(d, g.boxplotCvss, { titulo: 'Gráfico 4: Boxplot de CVSS Score', etiquetaEjeY: 'CVSS Score' })),
      analisis: (d) => parrafo(d, interpretarBoxplotCvss(g.boxplotCvss))
    },
    {
      numero: 5,
      titulo: 'Histograma con intervalos agrupados',
      tipo: 'Descriptivo',
      objetivo: 'facilitar la lectura de en qué tramo de severidad se concentran las vulnerabilidades, con menos barras que el Gráfico 1.',
      fundamento: 'mismos datos del Gráfico 1, agrupados en intervalos de amplitud fija (ver sección 7).',
      relacion: 'los conteos por intervalo son los mismos de la tabla agrupada de la sección 7.',
      dibujar: (d) => (d.y = dibujarHistograma(d, g.histogramaAgrupado.bins, g.histogramaAgrupado.media, g.histogramaAgrupado.mediana, { titulo: 'Gráfico 5: Histograma agrupado', etiquetaEjeX: 'CVSS Score', etiquetaEjeY: 'Frecuencia' })),
      analisis: (d) => parrafo(d, `${interpretarHistogramaAgrupado()} (ver Tabla de la sección 7).`)
    },
    {
      numero: 6,
      titulo: 'Comparación de CVSS por tipo de acceso',
      tipo: 'Inferencial',
      objetivo: 'comparar la severidad entre vulnerabilidades de acceso remoto y de acceso local.',
      fundamento: 'dos boxplots lado a lado permiten comparar mediana, dispersión y atípicos de cada grupo sin una prueba estadística formal.',
      relacion: `las medias (remoto=${formatearEstadistico(remotoVsLocal.mediaA)}, local=${formatearEstadistico(remotoVsLocal.mediaB)}) son las mismas de la Comparación acceso remoto/local.`,
      dibujar: (d) =>
        (d.y = dibujarBoxplotDoble(
          d,
          { etiqueta: 'Remoto', resumen: g.boxplotPorAcceso.remoto },
          { etiqueta: 'Local', resumen: g.boxplotPorAcceso.local },
          { titulo: 'Gráfico 6: CVSS por tipo de acceso', etiquetaEjeY: 'CVSS Score' }
        )),
      analisis: (d) => parrafo(d, interpretarComparacionAcceso(remotoVsLocal))
    },
    {
      numero: 7,
      titulo: 'Relación entre CVSS Score y Días para Parche',
      tipo: 'Descriptivo',
      objetivo: 'explorar si existe relación entre la severidad y el tiempo que tarda en estar disponible un parche.',
      fundamento: 'un diagrama de dispersión ubica cada vulnerabilidad como un punto; la línea de tendencia resume esa nube por regresión lineal simple, y la correlación de Pearson (sección 3) resume el grado y dirección de esa relación en un solo número.',
      relacion: 'primera vez que se presenta este resultado — no hay tabla previa equivalente.',
      dibujar: (d) => (d.y = dibujarDispersion(d, g.dispersionCvssDias.puntos, g.dispersionCvssDias.correlacion, { titulo: 'Gráfico 7: CVSS Score vs. Días para Parche', etiquetaEjeX: 'CVSS Score', etiquetaEjeY: 'Días para Parche' })),
      analisis: (d) => parrafo(d, interpretarDispersionCvssDias(g.dispersionCvssDias))
    },
    {
      numero: 8,
      titulo: 'Distribución de Días para Parche',
      tipo: 'Descriptivo',
      objetivo: 'mostrar cómo se distribuyen los tiempos de espera hasta que un parche está disponible.',
      fundamento: 'al ser una variable cuantitativa discreta, un histograma sigue siendo la herramienta adecuada.',
      relacion: 'complementa al Gráfico 7, que solo usaba esta variable en conjunto con CVSS Score.',
      dibujar: (d) => (d.y = dibujarHistograma(d, g.histogramaDiasParche.bins, g.histogramaDiasParche.media, g.histogramaDiasParche.mediana, { titulo: 'Gráfico 8: Distribución de Días para Parche', etiquetaEjeX: 'Días para parche', etiquetaEjeY: 'Frecuencia' })),
      analisis: (d) => parrafo(d, interpretarHistogramaDiasParche(g.histogramaDiasParche))
    },
    {
      numero: 9,
      titulo: 'Tipos de vulnerabilidad más frecuentes (Top 10)',
      tipo: 'Descriptivo',
      objetivo: 'identificar los tipos técnicos de vulnerabilidad más frecuentes en la muestra.',
      fundamento: 'tabla de frecuencias sobre una variable cualitativa nominal (Tipo de Vulnerabilidad), ordenada de mayor a menor.',
      relacion: 'primera vez que se analiza esta variable de forma individual en el informe.',
      dibujar: (d) => (d.y = dibujarBarrasHorizontales(d, g.topTipos, { titulo: 'Gráfico 9: Tipos de vulnerabilidad más frecuentes', etiquetaEjeX: 'Cantidad' })),
      analisis: (d) => parrafo(d, interpretarTopTipos(g.topTipos, g.totalTiposSinClasificar))
    },
    {
      numero: 10,
      titulo: 'Software más afectado (Top 10)',
      tipo: 'Descriptivo',
      objetivo: 'identificar qué software o plataformas concentran más vulnerabilidades reportadas.',
      fundamento: 'tabla de frecuencias sobre la variable Software, ordenada de mayor a menor.',
      relacion: 'complementa al Gráfico 9 con una dimensión distinta: no de qué tipo son las vulnerabilidades, sino a qué sistema afectan.',
      dibujar: (d) => (d.y = dibujarBarrasHorizontales(d, g.topSoftware, { titulo: 'Gráfico 10: Software más afectado', etiquetaEjeX: 'Cantidad', colorBarra: '#166534' })),
      analisis: (d) => parrafo(d, interpretarTopSoftware(g.topSoftware))
    }
  ];
}

function dibujarGraficos(doc: PDFKit.PDFDocument, datos: DatosInforme, resumido: boolean): void {
  const definiciones = construirDefinicionesGraficos(datos);
  const seleccionados = resumido ? definiciones.filter((d) => [1, 4, 3].includes(d.numero)) : definiciones;

  nuevaSeccion(doc, '8', 'Gráficos explicados en detalle');
  seleccionados.forEach((definicion) => {
    doc.addPage();
    doc.fontSize(12).font('Times-Bold').fillColor('#0f172a').text(`8.${definicion.numero} Gráfico ${definicion.numero}: ${definicion.titulo}`);
    doc.moveDown(0.3);
    dibujarEtiquetaTipoAnalisis(doc, definicion.tipo);

    doc.fontSize(9.5).font('Times-Bold').fillColor('#1e293b').text('Objetivo del gráfico: ', { continued: true });
    doc.font('Times-Roman').fillColor('#334155').text(definicion.objetivo);

    doc.font('Times-Bold').fillColor('#1e293b').text('Fundamento estadístico: ', { continued: true });
    doc.font('Times-Roman').fillColor('#334155').text(definicion.fundamento);

    doc.font('Times-Bold').fillColor('#1e293b').text('Relación con secciones anteriores: ', { continued: true });
    doc.font('Times-Roman').fillColor('#334155').text(definicion.relacion);
    doc.moveDown(0.5);

    asegurarEspacio(doc, 260);
    definicion.dibujar(doc);
    doc.moveDown(0.5);

    doc.fontSize(9.5).font('Times-Bold').fillColor('#1e293b').text('Funcionamiento del algoritmo: ', { continued: true });
    doc.font('Times-Roman').fillColor('#334155').text('los datos se calculan a partir del conjunto completo de vulnerabilidades vigente al generar el informe (ver Metodología, sección 3) y se posicionan geométricamente antes de dibujarse — sin pasos manuales ni aproximaciones visuales.');

    doc.fontSize(9.5).font('Times-Bold').fillColor('#1e293b').text('Análisis de resultados y conclusiones:');
    definicion.analisis(doc);
  });
}

// ---------------------------------------------------------------------
// Aplicación práctica (capítulo 10 del .qmd, "Caso de estudio", adaptado:
// mismo patrón de preguntas concretas respondidas con datos reales, sobre
// el ranking de urgencia real de SIADE en vez de un problema de negocio
// inventado).
// ---------------------------------------------------------------------

function dibujarAplicacionPractica(doc: PDFKit.PDFDocument, datos: DatosInforme, resumido: boolean): void {
  const r = datos.resumenEstadistico;
  const remotoVsLocal = datos.comparacionAccesoRemotoLocal;
  const criticasYAltas = datos.graficos.barrasSeveridad
    .filter((item) => item.etiqueta === 'Crítica' || item.etiqueta === 'Alta')
    .reduce((total, item) => total + item.valor, 0);
  const porcentajeUrgente = datos.totalVulnerabilidades === 0 ? 0 : (criticasYAltas / datos.totalVulnerabilidades) * 100;

  nuevaSeccion(doc, '9', 'Aplicación práctica: priorización de remediación');

  subseccion(doc, '¿Cuál es el nivel típico de riesgo?');
  dibujarEtiquetaTipoAnalisis(doc, 'Descriptivo');
  parrafo(doc, `Media CVSS = ${r.media.toFixed(2)}, mediana = ${r.mediana.toFixed(2)} — riesgo típico "${nivelDeRiesgoDesdeCvss(r.media)}".`);

  subseccion(doc, '¿Qué proporción requiere atención urgente?');
  dibujarEtiquetaTipoAnalisis(doc, 'Descriptivo');
  parrafo(doc, `${criticasYAltas} de ${datos.totalVulnerabilidades} vulnerabilidades (${porcentajeUrgente.toFixed(1)}%) son Crítica o Alta.`);

  subseccion(doc, '¿Influye el acceso remoto en la severidad?');
  dibujarEtiquetaTipoAnalisis(doc, 'Inferencial');
  parrafo(
    doc,
    `Media CVSS remoto = ${formatearEstadistico(remotoVsLocal.mediaA)}, local = ${formatearEstadistico(remotoVsLocal.mediaB)} ` +
      `(diferencia de ${formatearEstadistico(remotoVsLocal.diferenciaMedias)} puntos). Comparación descriptiva de medias, ` +
      'sin prueba de hipótesis formal.'
  );

  subseccion(doc, '¿Cuánto tiempo toma en promedio disponer de un parche?');
  dibujarEtiquetaTipoAnalisis(doc, 'Descriptivo');
  parrafo(
    doc,
    datos.graficos.histogramaDiasParche.bins.length === 0
      ? 'No hay vulnerabilidades con "Días para Parche" registrado en este conjunto.'
      : `${datos.graficos.histogramaDiasParche.media.toFixed(1)} días en promedio.`
  );

  subseccion(doc, `Ranking de urgencia de remediación (top ${resumido ? 5 : 10})`);
  dibujarTabla(
    doc,
    ['#', 'CVE', 'CVSS', 'Nivel de riesgo', 'Estado'],
    datos.rankingUrgencia
      .slice(0, resumido ? 5 : 10)
      .map((entrada) => [
        String(entrada.posicion),
        entrada.vulnerabilidad.cve.valor,
        entrada.vulnerabilidad.cvssScore.valor.toFixed(1),
        entrada.nivelDeRiesgo,
        entrada.vulnerabilidad.estadoRemediacion.valor
      ]),
    [40, 130, 60, 110, 110]
  );
}

// ---------------------------------------------------------------------
// Conclusiones (capítulo 12 del .qmd): interpretación automática ya
// calculada (InterpretadorDeResultados.ts) + limitaciones reales
// documentadas en el código, sin el capítulo de "pensamiento estadístico"
// (reflexión personal que un backend no puede generar con honestidad).
// ---------------------------------------------------------------------

function dibujarConclusiones(doc: PDFKit.PDFDocument, datos: DatosInforme): void {
  nuevaSeccion(doc, '10', 'Conclusiones');

  subseccion(doc, 'Síntesis de hallazgos');
  datos.interpretacion.forEach((parrafoTexto) => {
    doc.fontSize(9.5).fillColor('#334155').font('Times-Roman').text(`•  ${parrafoTexto}`, { align: 'justify' });
    doc.moveDown(0.3);
  });

  subseccion(doc, 'Limitaciones conocidas');
  datos.limitacionesConocidas.forEach((limitacion) => {
    doc.fontSize(9).fillColor('#64748b').font('Times-Roman').text(`•  ${limitacion}`, { align: 'justify' });
    doc.moveDown(0.3);
  });

  subseccion(doc, 'Recomendaciones');
  parrafo(
    doc,
    'Priorizar la remediación siguiendo el ranking de urgencia de la sección anterior, dando prioridad adicional a ' +
      'las vulnerabilidades de acceso remoto y a las de mayor tiempo de exposición sin parche disponible.'
  );
}

function dibujarReferencias(doc: PDFKit.PDFDocument): void {
  nuevaSeccion(doc, '11', 'Referencias');
  parrafo(
    doc,
    'FIRST — Forum of Incident Response and Security Teams. Common Vulnerability Scoring System (CVSS), ' +
      'versión 3.1. https://www.first.org/cvss/'
  );
  parrafo(
    doc,
    'National Institute of Standards and Technology. National Vulnerability Database (NVD). ' +
      'https://nvd.nist.gov/'
  );
}

// ---------------------------------------------------------------------
// Anexos (capítulo 12 del .qmd de referencia, adaptado): material de
// respaldo que sustenta el resto del informe pero que, por su extensión,
// dificultaría la lectura de los capítulos de análisis si estuviera ahí en
// vez de acá. Solo se incluye en el informe completo (nunca en el resumen
// ejecutivo, ver renderizarPdf) — un resumen de 3 gráficos no necesita un
// dataset completo de respaldo.
// ---------------------------------------------------------------------

function dibujarAnexos(doc: PDFKit.PDFDocument, datos: DatosInforme): void {
  nuevaSeccion(doc, '12', 'Anexos');
  parrafo(
    doc,
    'Este capítulo reúne el material de respaldo que sustenta los resultados del informe: el dataset completo (o ' +
      'una muestra representativa, si excede el límite razonable de este anexo), la tabla de frecuencias sin ' +
      'agrupar en su versión íntegra y el índice de las figuras generadas.'
  );

  subseccion(doc, 'Anexo A: Dataset completo');
  const anexoDataset = datos.anexoDataset;
  parrafo(
    doc,
    anexoDataset.esMuestra
      ? `El dataset completo tiene ${anexoDataset.tamanoOriginal} registros, más de lo que este anexo puede listar ` +
        `de forma legible. Se muestran ${anexoDataset.filas.length} registros seleccionados por muestreo ` +
        'sistemático (espaciado uniforme sobre el total, no solo los primeros casos cargados) — misma técnica que ' +
        'la muestra representativa de la sección 4.'
      : `Se listan los ${anexoDataset.filas.length} registros completos del dataset analizado.`
  );
  dibujarTabla(
    doc,
    ['CVE', 'Software', 'CVSS', 'Severidad', 'Acceso', 'Estado'],
    anexoDataset.filas.map((fila) => [fila.cve, fila.software, fila.cvssScore.toFixed(1), fila.severidad, fila.tipoAcceso, fila.estadoRemediacion]),
    [90, 140, 40, 55, 55, 70]
  );

  subseccion(doc, 'Anexo B: Tabla sin agrupar completa');
  parrafo(doc, `Los ${datos.distribucionSinAgrupar.length} valores únicos de CVSS Score, con su frecuencia — sin el recorte a 20 filas de la sección 7.`);
  dibujarTabla(
    doc,
    ['CVSS Score', 'Frecuencia'],
    datos.distribucionSinAgrupar.map((fila) => [fila.valor.toFixed(1), String(fila.frecuencia)]),
    [200, 200]
  );

  subseccion(doc, 'Anexo C: Índice de figuras');
  dibujarTabla(
    doc,
    ['#', 'Título'],
    construirDefinicionesGraficos(datos).map((definicion) => [String(definicion.numero), definicion.titulo]),
    [40, 400]
  );
}

// Exportada (M-10 Ronda 2, Pasada 2-A): InformeUniversalRF130.ts la reusa
// para la sección "Estadística descriptiva" del pipeline genérico.
export function resumenColumnaComoTexto(columna: DatosInformeDataset['estadisticasDescriptivas'][number]): string {
  if (columna.tipo === 'numerica') {
    return `media=${columna.media.toFixed(2)}, mediana=${columna.mediana.toFixed(2)}, min=${columna.minimo.toFixed(2)}, max=${columna.maximo.toFixed(2)}`;
  }
  if (columna.tipo === 'fecha') {
    return columna.minimo && columna.maximo ? `de ${new Date(columna.minimo).toLocaleDateString()} a ${new Date(columna.maximo).toLocaleDateString()}` : 'sin fechas válidas';
  }
  const top = columna.masFrecuente[0];
  return top ? `${columna.valoresUnicos} valor(es) único(s); más frecuente: "${top.valor}" (${top.frecuencia})` : 'sin valores';
}

// Valores de un dataset genérico pueden ser de cualquier tipo (number,
// string, Date, null/undefined por celdas faltantes) — se normalizan a texto
// para la tabla del Anexo A sin asumir un formato de columna en particular.
// Exportada (M-10 Ronda 2, Pasada 2-A): InformeUniversalRF130.ts la reusa
// para el Anexo del pipeline genérico.
export function celdaComoTexto(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (valor instanceof Date) return valor.toLocaleDateString();
  return String(valor);
}
