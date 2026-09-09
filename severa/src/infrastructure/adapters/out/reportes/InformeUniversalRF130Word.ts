import { Paragraph, HeadingLevel, Table, TextRun, AlignmentType, ImageRun } from 'docx';
import { generarImagenesDeGraficosInforme, ANCHO_IMAGEN_GRAFICO, ALTO_IMAGEN_GRAFICO } from './RasterizadorDeGraficosWord';
import { DatosInforme } from '../../../../application/ports/out/reportes/GeneradorDeInformes';
import { MAPEO_PLANTILLA_UNIVERSAL_RF130 } from '../../../../domain/services/reportes/MapeoPlantillaUniversalRF130';
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
import type { ResumenCincoNumeros } from '../../../../domain/services/descriptive-statistics/EstadisticaDescriptiva';
import { ElementoDocumento, heading, texto, tabla, indice } from './LayoutInformeWord';

// M-10 Ronda 2, Pasada 2-D (RF-130), Paso 1: orquestador nuevo de la
// plantilla universal de 20 secciones para el pipeline CVSS en Word,
// análogo a InformeUniversalRF130.ts (PDFKit) — mismo criterio: recorre
// MAPEO_PLANTILLA_UNIVERSAL_RF130 para decidir número/orden/título de cada
// sección, la fuente real ya no es un comentario auditado sino el array que
// también usa el renderer PDF. El pipeline genérico NO se toca en este
// paso — sigue en GeneradorInformeWord.ts (construirContenidoDataset),
// paso aparte.
//
// La redacción de cada sección se tomó como referencia de la rama 'cvss' de
// cada dibujarSeccionX() de InformeUniversalRF130.ts (PDFKit, imperativo,
// no reutilizable en código — solo como fuente de qué texto va en cada
// sección, ya decidido en las Pasadas 2-A/2-B/2-C). Donde Word ya tenía
// redacción equivalente (informe viejo de 12 secciones), se reusa ese texto
// tal cual, solo reordenado bajo la numeración RF-130.

function nivelDeRiesgoDesdeCvss(cvss: number): string {
  if (cvss >= 9.0) return 'Crítico';
  if (cvss >= 7.0) return 'Alto';
  if (cvss >= 4.0) return 'Moderado';
  return 'Bajo';
}

// "No aplicable" (eje: ¿esta sección existe para este tipo de dataset?) —
// docx no tiene un equivalente simple al badge de color redondeado de
// PDFKit (dibujarBadge), así que se usa el mismo patrón bold-label que ya
// existía en este archivo para TipoDeAnalisis (ver etiquetaTipoWord), solo
// con una etiqueta distinta ("Estado: ") para no confundir los dos ejes
// conceptuales — mismo criterio que documenta InformeUniversalRF130.ts.
function dibujarSeccionNoAplicableWord(motivo: string): ElementoDocumento[] {
  return [new Paragraph({ children: [new TextRun({ text: 'Estado: ', bold: true }), new TextRun('No aplicable')] }), texto(motivo)];
}

// TipoDeAnalisis (Descriptivo/Inferencial/Pendiente) — mismo patrón bold-label
// que ya usaba construirContenidoDataset (genérico) para "Análisis
// inferencial"/"Predicción" antes de esta pasada.
function etiquetaTipoWord(tipo: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: 'Tipo: ', bold: true }), new TextRun(tipo)] });
}

// ---------------------------------------------------------------------
// 1. Portada — caso especial, igual que en PDF: no pasa por el loop de
// nuevaSeccion()/heading() (no tiene entrada en el índice). Ya existía
// prácticamente igual en Word — se mueve tal cual.
// ---------------------------------------------------------------------
function dibujarSeccionPortadaWord(datos: DatosInforme): ElementoDocumento[] {
  return [
    new Paragraph({ text: 'Informe SIADE — Análisis Estadístico de Vulnerabilidades', heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Generado por SIADE para ${datos.generadoPara}`, bold: true, size: 24 })] }),
    texto(`Generado: ${datos.generadoEn.toLocaleString()}`),
    texto(`Total de vulnerabilidades analizadas: ${datos.totalVulnerabilidades}`)
  ];
}

// ---------------------------------------------------------------------
// 2. Resumen ejecutivo — contenido nuevo (no existía en el Word viejo de 12
// secciones), redacción tomada de dibujarSeccionResumenEjecutivo (caso
// 'cvss') en InformeUniversalRF130.ts.
// ---------------------------------------------------------------------
function dibujarSeccionResumenEjecutivoWord(datos: DatosInforme): ElementoDocumento[] {
  const r = datos.resumenEstadistico;
  return [
    texto(
      `Este informe analiza ${datos.totalVulnerabilidades} vulnerabilidad(es) registradas en SIADE para ${datos.generadoPara}. ` +
        `La severidad promedio observada es ${r.media.toFixed(2)} en la escala CVSS, un nivel de riesgo típico ` +
        `"${nivelDeRiesgoDesdeCvss(r.media)}".`
    ),
    texto(
      'Las secciones siguientes desarrollan la metodología completa, la estadística descriptiva e inferencial y las ' +
        `visualizaciones que sustentan estos resultados; el cierre del documento (secciones 17-18) reúne ` +
        `${datos.interpretacion.length} hallazgo(s) principal(es) y ${datos.limitacionesConocidas.length} limitación(es) ` +
        'conocida(s) del análisis.'
    )
  ];
}

// ---------------------------------------------------------------------
// 3. Descripción del dataset — ya existía en Word como "4. Organización de
// los datos" (informe viejo). Redacción alineada a la de PDF (dibujarSeccionDescripcionDataset,
// caso 'cvss'): "El dataset analizado contiene..." en vez de "El dataset
// contiene...", "(derivada del CVSS Score)" agregado, y el título de la
// segunda tabla alineado a "...sobre todo el conjunto".
// ---------------------------------------------------------------------
function dibujarSeccionDescripcionDatasetWord(datos: DatosInforme): ElementoDocumento[] {
  const encabezados = ['CVE', 'Software', 'CVSS', 'Severidad', 'Acceso', 'Estado'];
  return [
    texto(
      `El dataset analizado contiene ${datos.totalVulnerabilidades} registros, con los campos CVE, Software, CVSS ` +
        'Score, Severidad (derivada del CVSS Score), Tipo de Vulnerabilidad, Acceso Remoto, Estado de Remediación y ' +
        'Fecha de carga.'
    ),
    heading('Primeros registros cargados', HeadingLevel.HEADING_2),
    tabla(
      encabezados,
      datos.muestraDeRegistros.primeros
        .slice(0, 10)
        .map((fila) => [fila.cve, fila.software, fila.cvssScore.toFixed(1), fila.severidad, fila.tipoAcceso, fila.estadoRemediacion])
    ),
    heading('Muestra representativa (muestreo sistemático sobre todo el conjunto)', HeadingLevel.HEADING_2),
    tabla(
      encabezados,
      datos.muestraDeRegistros.representativa.map((fila) => [
        fila.cve,
        fila.software,
        fila.cvssScore.toFixed(1),
        fila.severidad,
        fila.tipoAcceso,
        fila.estadoRemediacion
      ])
    )
  ];
}

// ---------------------------------------------------------------------
// 4. Número de registros/variables — contenido nuevo (no existía en el
// Word viejo, estaba embebido en la prosa de "Organización de los datos").
// Redacción tomada de dibujarSeccionNumeroDeRegistrosYVariables (caso 'cvss').
// ---------------------------------------------------------------------
function dibujarSeccionNumeroDeRegistrosYVariablesWord(datos: DatosInforme): ElementoDocumento[] {
  return [
    texto(
      `${datos.totalVulnerabilidades} registro(s). El esquema es fijo, con 8 variables (campos): CVE, Software, ` +
        'CVSS Score, Severidad, Tipo de Vulnerabilidad, Acceso Remoto, Estado de Remediación y Fecha de carga.'
    )
  ];
}

// ---------------------------------------------------------------------
// 5. Tipos de variables — no aplica a CVSS, sección nueva en Word (no
// existía en el informe viejo). Motivo tomado literal de
// dibujarSeccionTiposDeVariables (caso 'cvss').
// ---------------------------------------------------------------------
function dibujarSeccionTiposDeVariablesWord(): ElementoDocumento[] {
  return dibujarSeccionNoAplicableWord(
    'El esquema de una Vulnerabilidad es fijo y conocido de antemano (CVE, CVSS Score, Severidad, Tipo de ' +
      'Vulnerabilidad, Acceso Remoto, Estado de Remediación, Fecha de carga) — no hay tipos de columna que ' +
      'detectar, a diferencia de un dataset genérico de columnas arbitrarias.'
  );
}

// ---------------------------------------------------------------------
// 6. Calidad de datos — ya existía en Word como "2. Origen y calidad de
// los datos" (informe viejo). Redacción alineada a la de PDF
// (dibujarSeccionCalidadDeDatos, caso 'cvss').
// ---------------------------------------------------------------------
function dibujarSeccionCalidadDeDatosWord(datos: DatosInforme): ElementoDocumento[] {
  const ultimo = datos.origenYCalidad.ultimoCambioRegistrado;
  return [
    texto(
      ultimo
        ? `El último cambio de importación registrado en el historial de auditoría fue: "${ultimo.detalle}", el ` +
          `${ultimo.fecha.toLocaleString()} (analista: ${ultimo.usuario}).`
        : 'No hay ningún registro de auditoría de importación disponible todavía para este dataset.'
    ),
    texto(
      'SIADE no conserva el motivo de cada fila rechazada más allá de la respuesta inmediata de esa importación — ' +
        'solo el conteo agregado (importados/rechazados) queda registrado en el historial de auditoría.'
    )
  ];
}

// ---------------------------------------------------------------------
// 7. Valores faltantes — no aplica a CVSS, sección nueva en Word. Motivo
// tomado literal de dibujarSeccionValoresFaltantes (caso 'cvss').
// ---------------------------------------------------------------------
function dibujarSeccionValoresFaltantesWord(): ElementoDocumento[] {
  return dibujarSeccionNoAplicableWord('El esquema fijo de Vulnerabilidad no admite valores faltantes por diseño — todos los campos se validan al importar.');
}

// ---------------------------------------------------------------------
// 8. Limpieza realizada — no aplica a CVSS, sección nueva en Word. Motivo
// tomado literal de dibujarSeccionLimpiezaRealizada (caso 'cvss').
// ---------------------------------------------------------------------
function dibujarSeccionLimpiezaRealizadaWord(): ElementoDocumento[] {
  return dibujarSeccionNoAplicableWord('SIADE no transforma datos de vulnerabilidades — solo diagnostica lo que se importa tal cual.');
}

// ---------------------------------------------------------------------
// 9. Estadística descriptiva — fusiona "5. Medidas de tendencia central" +
// "6. Medidas de variabilidad" (informe Word viejo, ya escritas) en una
// sola sección con 2 subsecciones (heading nivel 2) — mismo criterio que
// dibujarSeccionEstadisticaDescriptiva (caso 'cvss') en el PDF. Contenido
// reusado tal cual, solo reestructurada la jerarquía de headings.
// ---------------------------------------------------------------------
function dibujarSeccionEstadisticaDescriptivaWord(datos: DatosInforme): ElementoDocumento[] {
  const r = datos.resumenEstadistico;
  const suma = r.media * datos.totalVulnerabilidades;
  return [
    heading('Tendencia central', HeadingLevel.HEADING_2),
    texto(`Media: x̄ = Σxi / n = ${suma.toFixed(2)} / ${datos.totalVulnerabilidades} = ${r.media.toFixed(2)}`),
    texto(`En promedio, cada vulnerabilidad tiene CVSS ${r.media.toFixed(2)}, nivel "${nivelDeRiesgoDesdeCvss(r.media)}".`),
    texto(`Mediana: Me = ${r.mediana.toFixed(2)}`),
    texto(`Moda: ${r.moda.map((valor) => valor.toFixed(1)).join(', ')}`),
    texto(`Cuartiles: Q1 = ${r.q1.toFixed(2)}, Q3 = ${r.q3.toFixed(2)}`),
    tabla(
      ['Medida', 'Valor', 'Interpretación'],
      [
        ['Media', r.media.toFixed(2), 'Promedio de severidad CVSS'],
        ['Mediana', r.mediana.toFixed(2), 'El 50% está por debajo de este valor'],
        ['Moda', r.moda.map((v) => v.toFixed(1)).join(', '), 'Valor(es) más frecuente(s)'],
        ['Q1 (25%)', r.q1.toFixed(2), 'El 25% está por debajo'],
        ['Q3 (75%)', r.q3.toFixed(2), 'El 75% está por debajo']
      ]
    ),
    heading('Variabilidad', HeadingLevel.HEADING_2),
    texto(`Rango = ${r.rango.toFixed(2)}, Varianza = ${r.varianza.toFixed(4)}, Desviación estándar = ${r.desviacionEstandar.toFixed(4)}`),
    texto(`Coeficiente de variación: CV = (s / x̄) × 100 = ${r.coeficienteVariacion.toFixed(2)}%`),
    tabla(
      ['Medida', 'Valor', 'Interpretación'],
      [
        ['Rango', r.rango.toFixed(2), 'Diferencia entre máximo y mínimo'],
        ['Varianza', r.varianza.toFixed(4), 'Promedio de desviaciones cuadradas'],
        ['Desv. estándar', r.desviacionEstandar.toFixed(4), 'Dispersión típica respecto a la media'],
        ['Coef. variación', `${r.coeficienteVariacion.toFixed(2)}%`, 'Variabilidad relativa al promedio']
      ]
    )
  ];
}

// ---------------------------------------------------------------------
// 10. Análisis individual de variables — no aplica a CVSS, sección nueva en
// Word. Motivo tomado literal de dibujarSeccionAnalisisIndividualDeVariables
// (caso 'cvss').
// ---------------------------------------------------------------------
function dibujarSeccionAnalisisIndividualDeVariablesWord(): ElementoDocumento[] {
  return dibujarSeccionNoAplicableWord(
    'CVSS Score es la única variable continua del esquema fijo de Vulnerabilidad, y ya se cubre en detalle en la ' +
      'sección de Estadística descriptiva — no hay múltiples variables numéricas que analizar una por una.'
  );
}

// ---------------------------------------------------------------------
// 11. Distribuciones — ya existía en Word como "7. Distribución de los
// datos" (informe viejo). Reuso directo.
// ---------------------------------------------------------------------
function dibujarSeccionDistribucionesWord(datos: DatosInforme): ElementoDocumento[] {
  return [
    texto(
      'Las medidas de los capítulos anteriores resumen la severidad en unos pocos números; ver la distribución ' +
        'completa muestra además cómo se reparten los valores.'
    ),
    heading('Sin agrupar (primeros 20 valores únicos)', HeadingLevel.HEADING_2),
    tabla(
      ['CVSS Score', 'Frecuencia'],
      datos.distribucionSinAgrupar.slice(0, 20).map((fila) => [fila.valor.toFixed(1), String(fila.frecuencia)])
    ),
    heading('Agrupada en intervalos, con frecuencia acumulada', HeadingLevel.HEADING_2),
    tabla(
      ['Intervalo', 'Frec. absoluta', 'Frec. relativa (%)', 'Frec. acumulada'],
      datos.distribucionFrecuencias.map((fila) => [
        fila.intervalo,
        String(fila.frecuenciaAbsoluta),
        `${fila.frecuenciaRelativaPorcentaje.toFixed(1)}%`,
        String(fila.frecuenciaAcumulada)
      ])
    )
  ];
}

// ---------------------------------------------------------------------
// 12. Visualizaciones — ya existía en Word como "8. Gráficos explicados en
// detalle" (informe viejo), incluidas las 10 imágenes PNG reales
// incrustadas (RasterizadorDeGraficosWord.ts) — el activo más valioso de
// este archivo, es lo único que verifica el test real
// (GeneradorInformeWord.test.ts). Se mueve tal cual, con el único ajuste
// pedido explícitamente: agregar el bloque "Funcionamiento del algoritmo"
// (mismo texto fijo que usa dibujarSeccionVisualizaciones, caso 'cvss', en
// el PDF) para que la redacción quede pareja entre los dos formatos — antes
// de esta pasada Word no lo tenía.
// ---------------------------------------------------------------------
interface DefinicionGraficoWord {
  numero: number;
  titulo: string;
  objetivo: string;
  fundamento: string;
  relacion: string;
  tablaDatos: Table;
  analisis: string;
}

// resumen: null (2026-07-19, bug real): un catálogo sin ninguna vulnerabilidad
// de un tipo de acceso (ej. todo Remoto, cero Local) ya no tiene un
// ResumenCincoNumeros para ese lado (ver RecopilarDatosDeInforme.
// resumenCincoNumerosSeguro) — la fila queda con "sin datos" en vez de
// romper la generación del .docx entero.
function filaResumenCincoNumeros(etiqueta: string, resumen: ResumenCincoNumeros | null): string[] {
  if (resumen === null) {
    return [etiqueta, 'sin datos', 'sin datos', 'sin datos', 'sin datos', 'sin datos', 'sin datos'];
  }
  return [
    etiqueta,
    resumen.minimo.toFixed(2),
    resumen.q1.toFixed(2),
    resumen.mediana.toFixed(2),
    resumen.q3.toFixed(2),
    resumen.maximo.toFixed(2),
    resumen.media.toFixed(2)
  ];
}

function construirDefinicionesGraficosWord(datos: DatosInforme): DefinicionGraficoWord[] {
  const g = datos.graficos;
  const remotoVsLocal = datos.comparacionAccesoRemotoLocal;

  return [
    {
      numero: 1,
      titulo: 'Histograma de CVSS Score (distribución sin agrupar)',
      objetivo: 'representar visualmente la forma completa de la distribución de CVSS Score.',
      fundamento: 'un histograma agrupa los valores continuos en clases y representa su frecuencia como la altura de cada barra.',
      relacion: 'las líneas de media y mediana coinciden con las calculadas en la sección 5.',
      tablaDatos: tabla(['Intervalo', 'Frecuencia'], g.histogramaCvss.bins.map((bin) => [bin.intervalo, String(bin.frecuencia)])),
      analisis: interpretarHistogramaCvss(g.histogramaCvss)
    },
    {
      numero: 2,
      titulo: 'Distribución por severidad (barras)',
      objetivo: 'comparar cuántas vulnerabilidades hay en cada categoría de severidad.',
      fundamento: 'un gráfico de barras representa la frecuencia absoluta de una variable cualitativa ordinal.',
      relacion: 'mismos conteos usados en la sección de Aplicación práctica.',
      tablaDatos: tabla(['Severidad', 'Cantidad'], g.barrasSeveridad.map((item) => [item.etiqueta, String(item.valor)])),
      analisis: interpretarBarrasSeveridad(g.barrasSeveridad)
    },
    {
      numero: 3,
      titulo: 'Composición por severidad (pastel)',
      objetivo: 'mostrar la proporción de cada categoría de severidad sobre el total.',
      fundamento: 'mismos datos del Gráfico 2, expresados como porcentaje del total.',
      relacion: 'reutiliza los mismos conteos del Gráfico 2.',
      tablaDatos: tabla(
        ['Severidad', 'Cantidad', 'Porcentaje'],
        g.pastelSeveridad.map((item) => {
          const total = g.pastelSeveridad.reduce((acum, x) => acum + x.valor, 0);
          const porcentaje = total === 0 ? 0 : (item.valor / total) * 100;
          return [item.etiqueta, String(item.valor), `${porcentaje.toFixed(1)}%`];
        })
      ),
      analisis: interpretarPastelSeveridad()
    },
    {
      numero: 4,
      titulo: 'Boxplot de CVSS Score',
      objetivo: 'visualizar mediana, dispersión y posibles valores atípicos.',
      fundamento: 'la caja cubre el rango intercuartílico (Q1-Q3); los bigotes llegan hasta el mínimo y el máximo.',
      relacion: `los valores de la caja son los mismos Q1=${datos.resumenEstadistico.q1.toFixed(2)} y Q3=${datos.resumenEstadistico.q3.toFixed(2)} de la sección 5.`,
      tablaDatos: tabla(
        ['Mínimo', 'Q1', 'Mediana', 'Q3', 'Máximo', 'Media'],
        [
          [
            g.boxplotCvss.minimo.toFixed(2),
            g.boxplotCvss.q1.toFixed(2),
            g.boxplotCvss.mediana.toFixed(2),
            g.boxplotCvss.q3.toFixed(2),
            g.boxplotCvss.maximo.toFixed(2),
            g.boxplotCvss.media.toFixed(2)
          ]
        ]
      ),
      analisis: interpretarBoxplotCvss(g.boxplotCvss)
    },
    {
      numero: 5,
      titulo: 'Histograma con intervalos agrupados',
      objetivo: 'facilitar la lectura de en qué tramo de severidad se concentran las vulnerabilidades.',
      fundamento: 'mismos datos del Gráfico 1, agrupados en intervalos de amplitud fija.',
      relacion: 'los conteos por intervalo son los mismos de la tabla agrupada de la sección 7.',
      tablaDatos: tabla(['Intervalo', 'Frecuencia'], g.histogramaAgrupado.bins.map((bin) => [bin.intervalo, String(bin.frecuencia)])),
      analisis: interpretarHistogramaAgrupado()
    },
    {
      numero: 6,
      titulo: 'Comparación de CVSS por tipo de acceso',
      objetivo: 'comparar la severidad entre vulnerabilidades de acceso remoto y de acceso local.',
      fundamento: 'dos resúmenes de cinco números (uno por grupo) permiten comparar mediana, dispersión y atípicos.',
      relacion: `las medias (remoto=${formatearEstadistico(remotoVsLocal.mediaA)}, local=${formatearEstadistico(remotoVsLocal.mediaB)}) son las de la Comparación acceso remoto/local.`,
      tablaDatos: tabla(
        ['Grupo', 'Mínimo', 'Q1', 'Mediana', 'Q3', 'Máximo', 'Media'],
        [filaResumenCincoNumeros('Remoto', g.boxplotPorAcceso.remoto), filaResumenCincoNumeros('Local', g.boxplotPorAcceso.local)]
      ),
      analisis: interpretarComparacionAcceso(remotoVsLocal)
    },
    {
      numero: 7,
      titulo: 'Relación entre CVSS Score y Días para Parche',
      objetivo: 'explorar si existe relación entre la severidad y el tiempo que tarda en estar disponible un parche.',
      fundamento: 'la correlación de Pearson resume el grado y dirección de la relación lineal entre ambas variables en un solo número.',
      relacion: 'primera vez que se presenta este resultado en el informe.',
      tablaDatos: tabla(
        ['Pares con dato registrado', 'Correlación de Pearson'],
        [[String(g.dispersionCvssDias.puntos.length), g.dispersionCvssDias.correlacion.toFixed(3)]]
      ),
      analisis: interpretarDispersionCvssDias(g.dispersionCvssDias)
    },
    {
      numero: 8,
      titulo: 'Distribución de Días para Parche',
      objetivo: 'mostrar cómo se distribuyen los tiempos de espera hasta que un parche está disponible.',
      fundamento: 'al ser una variable cuantitativa discreta, un histograma es la herramienta adecuada.',
      relacion: 'complementa al Gráfico 7.',
      tablaDatos: tabla(['Intervalo', 'Frecuencia'], g.histogramaDiasParche.bins.map((bin) => [bin.intervalo, String(bin.frecuencia)])),
      analisis: interpretarHistogramaDiasParche(g.histogramaDiasParche)
    },
    {
      numero: 9,
      titulo: 'Tipos de vulnerabilidad más frecuentes (Top 10)',
      objetivo: 'identificar los tipos técnicos de vulnerabilidad más frecuentes en la muestra.',
      fundamento: 'tabla de frecuencias sobre la variable Tipo de Vulnerabilidad, ordenada de mayor a menor.',
      relacion: 'primera vez que se analiza esta variable de forma individual en el informe.',
      tablaDatos: tabla(['Tipo', 'Cantidad'], g.topTipos.map((item) => [item.etiqueta, String(item.valor)])),
      analisis: interpretarTopTipos(g.topTipos, g.totalTiposSinClasificar)
    },
    {
      numero: 10,
      titulo: 'Software más afectado (Top 10)',
      objetivo: 'identificar qué software o plataformas concentran más vulnerabilidades reportadas.',
      fundamento: 'tabla de frecuencias sobre la variable Software, ordenada de mayor a menor.',
      relacion: 'complementa al Gráfico 9 con una dimensión distinta: a qué sistema afectan las vulnerabilidades.',
      tablaDatos: tabla(['Software', 'Cantidad'], g.topSoftware.map((item) => [item.etiqueta, String(item.valor)])),
      analisis: interpretarTopSoftware(g.topSoftware)
    }
  ];
}

async function dibujarSeccionVisualizacionesWord(datos: DatosInforme): Promise<ElementoDocumento[]> {
  const contenido: ElementoDocumento[] = [
    texto('Cada gráfico de esta sección incluye su dibujo, un epígrafe, la explicación de 6 bloques y la tabla de datos subyacente.')
  ];

  const imagenes = await generarImagenesDeGraficosInforme(datos);

  construirDefinicionesGraficosWord(datos).forEach((definicion, indiceGrafico) => {
    contenido.push(heading(`12.${definicion.numero} Gráfico ${definicion.numero}: ${definicion.titulo}`, HeadingLevel.HEADING_2));
    contenido.push(new Paragraph({ children: [new TextRun({ text: 'Objetivo del gráfico: ', bold: true }), new TextRun(definicion.objetivo)] }));
    contenido.push(new Paragraph({ children: [new TextRun({ text: 'Fundamento estadístico: ', bold: true }), new TextRun(definicion.fundamento)] }));
    contenido.push(new Paragraph({ children: [new TextRun({ text: 'Relación con secciones anteriores: ', bold: true }), new TextRun(definicion.relacion)] }));
    contenido.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: 'png',
            data: imagenes[indiceGrafico],
            transformation: { width: ANCHO_IMAGEN_GRAFICO, height: ALTO_IMAGEN_GRAFICO }
          })
        ]
      })
    );
    // Epígrafe (caption) — RF pedido explícitamente: "Gráfico X: [Título]".
    contenido.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `Gráfico ${definicion.numero}: ${definicion.titulo}`, italics: true, size: 18 })]
      })
    );
    contenido.push(definicion.tablaDatos);
    // Bloque agregado en esta pasada (Pasada 2-D, Paso 1) — mismo texto fijo
    // que usa dibujarSeccionVisualizaciones (caso 'cvss') en el PDF, para
    // que la redacción quede pareja entre los dos formatos. No dependía de
    // datos antes en PDF tampoco: es la misma oración en los 10 gráficos.
    contenido.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Funcionamiento del algoritmo: ', bold: true }),
          new TextRun(
            'los datos se calculan a partir del conjunto completo de vulnerabilidades vigente al generar el informe y ' +
              'se posicionan geométricamente antes de dibujarse — sin pasos manuales ni aproximaciones visuales.'
          )
        ]
      })
    );
    contenido.push(new Paragraph({ children: [new TextRun({ text: 'Análisis de resultados y conclusiones: ', bold: true }), new TextRun(definicion.analisis)] }));
  });

  return contenido;
}

// ---------------------------------------------------------------------
// 13. Relaciones entre variables — contenido nuevo como sección propia (en
// el Word viejo el coeficiente de Pearson solo aparecía pegado al Gráfico 7
// dentro de "8. Gráficos"). Redacción tomada de
// dibujarSeccionRelacionesEntreVariables (caso 'cvss').
// ---------------------------------------------------------------------
function dibujarSeccionRelacionesEntreVariablesWord(datos: DatosInforme): ElementoDocumento[] {
  const dispersion = datos.graficos.dispersionCvssDias;
  return [
    texto(
      `Coeficiente de correlación de Pearson entre CVSS Score y Días para Parche: r = ${dispersion.correlacion.toFixed(3)} ` +
        '(ver Gráfico 7 en la sección de Visualizaciones).'
    ),
    texto(interpretarDispersionCvssDias(dispersion))
  ];
}

// ---------------------------------------------------------------------
// 14. Análisis inferencial — contenido nuevo como sección propia (en el
// Word viejo era la pregunta 3 de "9. Aplicación práctica", ahora extraída,
// mismo criterio que hizo el PDF en la Pasada 2-B). Redacción tomada de
// dibujarSeccionAnalisisInferencial (caso 'cvss'). NO se repite en §18.
// ---------------------------------------------------------------------
function dibujarSeccionAnalisisInferencialWord(datos: DatosInforme): ElementoDocumento[] {
  const remotoVsLocal = datos.comparacionAccesoRemotoLocal;
  return [
    etiquetaTipoWord('Inferencial'),
    texto(
      `Media CVSS remoto = ${formatearEstadistico(remotoVsLocal.mediaA)}, local = ${formatearEstadistico(remotoVsLocal.mediaB)} ` +
        `(diferencia de ${formatearEstadistico(remotoVsLocal.diferenciaMedias)} puntos). Comparación descriptiva de medias, ` +
        'sin prueba de hipótesis formal.'
    )
  ];
}

// ---------------------------------------------------------------------
// 15. Predicción — mismo motivo/redacción que ya usa construirContenidoDataset
// (genérico) para su "Predicción" — reuso del mismo texto exacto, ya
// decidido, sin inventar redacción nueva para CVSS.
// ---------------------------------------------------------------------
function dibujarSeccionPrediccionWord(): ElementoDocumento[] {
  return [
    etiquetaTipoWord('Pendiente'),
    texto('M-16 (Predicción y Modelado) está pendiente de material académico antes de implementar o sugerir cualquier método (ver IMotorPrediccion.ts).')
  ];
}

// ---------------------------------------------------------------------
// 16. Evaluación de modelos — misma dependencia que Predicción. Redacción
// tomada de dibujarSeccionEvaluacionDeModelos (compartida).
// ---------------------------------------------------------------------
function dibujarSeccionEvaluacionDeModelosWord(): ElementoDocumento[] {
  return [etiquetaTipoWord('Pendiente'), texto('Misma dependencia que la sección de Predicción — no hay modelos que evaluar sin M-16.')];
}

// ---------------------------------------------------------------------
// 17. Interpretación — ya existía en Word como "Síntesis de hallazgos"
// dentro de "10. Conclusiones" (informe viejo) — se mueve a sección propia,
// mismo array de bullets (datos.interpretacion), sin recalcular. Sin
// etiqueta de tipo para CVSS, mismo criterio que el PDF (asimetría
// deliberada respecto al genérico, documentada en InformeUniversalRF130.ts).
// ---------------------------------------------------------------------
function dibujarSeccionInterpretacionWord(datos: DatosInforme): ElementoDocumento[] {
  return datos.interpretacion.map((parrafo) => new Paragraph({ text: parrafo, bullet: { level: 0 } }));
}

// ---------------------------------------------------------------------
// 18. Conclusiones — la otra mitad del split de §17, más el resto de
// "Aplicación práctica" que RF-130 no le da slot propio: las preguntas 1/2/4
// y el ranking ya existían en Word dentro de "9. Aplicación práctica"
// (informe viejo, la pregunta 3 — Remoto/Local — NO se repite acá, ya está
// en §14), y Limitaciones conocidas ya existía en "10. Conclusiones". El
// párrafo de cierre es contenido nuevo, tomado de dibujarSeccionConclusiones
// (caso 'cvss').
// ---------------------------------------------------------------------
function dibujarSeccionConclusionesWord(datos: DatosInforme): ElementoDocumento[] {
  const r = datos.resumenEstadistico;
  const criticasYAltas = datos.graficos.barrasSeveridad
    .filter((item) => item.etiqueta === 'Crítica' || item.etiqueta === 'Alta')
    .reduce((total, item) => total + item.valor, 0);
  const porcentajeUrgente = datos.totalVulnerabilidades === 0 ? 0 : (criticasYAltas / datos.totalVulnerabilidades) * 100;

  return [
    texto(
      'A partir de los hallazgos de la sección anterior, este cierre reúne los indicadores prácticos de priorización ' +
        'y las limitaciones a tener en cuenta al usar este informe para tomar decisiones de remediación.'
    ),
    heading('¿Cuál es el nivel típico de riesgo?', HeadingLevel.HEADING_2),
    etiquetaTipoWord('Descriptivo'),
    texto(`Media CVSS = ${r.media.toFixed(2)}, mediana = ${r.mediana.toFixed(2)} — riesgo típico "${nivelDeRiesgoDesdeCvss(r.media)}".`),
    heading('¿Qué proporción requiere atención urgente?', HeadingLevel.HEADING_2),
    etiquetaTipoWord('Descriptivo'),
    texto(`${criticasYAltas} de ${datos.totalVulnerabilidades} vulnerabilidades (${porcentajeUrgente.toFixed(1)}%) son Crítica o Alta.`),
    heading('¿Cuánto tiempo toma en promedio disponer de un parche?', HeadingLevel.HEADING_2),
    etiquetaTipoWord('Descriptivo'),
    texto(
      datos.graficos.histogramaDiasParche.bins.length === 0
        ? 'No hay vulnerabilidades con "Días para Parche" registrado en este conjunto.'
        : `${datos.graficos.histogramaDiasParche.media.toFixed(1)} días en promedio.`
    ),
    heading('Ranking de urgencia de remediación (top 10)', HeadingLevel.HEADING_2),
    tabla(
      ['#', 'CVE', 'CVSS', 'Nivel de riesgo', 'Estado'],
      datos.rankingUrgencia
        .slice(0, 10)
        .map((entrada) => [
          String(entrada.posicion),
          entrada.vulnerabilidad.cve.valor,
          entrada.vulnerabilidad.cvssScore.valor.toFixed(1),
          entrada.nivelDeRiesgo,
          entrada.vulnerabilidad.estadoRemediacion.valor
        ])
    ),
    heading('Limitaciones conocidas', HeadingLevel.HEADING_2),
    ...datos.limitacionesConocidas.map((limitacion) => new Paragraph({ text: limitacion, bullet: { level: 0 } }))
  ];
}

// ---------------------------------------------------------------------
// 19. Recomendaciones — ya existía en Word como subsección de "10.
// Conclusiones" (informe viejo). Se mueve a sección propia, mismo texto.
// ---------------------------------------------------------------------
function dibujarSeccionRecomendacionesWord(): ElementoDocumento[] {
  return [
    texto(
      'Priorizar la remediación siguiendo el ranking de urgencia, dando prioridad adicional a las vulnerabilidades ' +
        'de acceso remoto y a las de mayor tiempo de exposición sin parche disponible.'
    )
  ];
}

// ---------------------------------------------------------------------
// 20. Referencias/anexos — ya existían en Word como "11. Referencias" + "12.
// Anexos" por separado (informe viejo). Se fusionan como 2 subsecciones,
// mismo criterio que dibujarSeccionReferenciasYAnexos (caso 'cvss') en PDF.
// Contenido reusado tal cual, incluido el Anexo C (índice de figuras), que
// ahora usa construirDefinicionesGraficosWord de este mismo archivo.
// ---------------------------------------------------------------------
function dibujarSeccionReferenciasYAnexosWord(datos: DatosInforme): ElementoDocumento[] {
  return [
    heading('Referencias', HeadingLevel.HEADING_2),
    texto('FIRST — Forum of Incident Response and Security Teams. Common Vulnerability Scoring System (CVSS), versión 3.1. https://www.first.org/cvss/'),
    texto('National Institute of Standards and Technology. National Vulnerability Database (NVD). https://nvd.nist.gov/'),

    heading('Anexos', HeadingLevel.HEADING_2),
    texto(
      'Material de respaldo que sustenta los resultados del informe: el dataset completo (o una muestra ' +
        'representativa, si excede el límite razonable de este anexo), la tabla de frecuencias sin agrupar en su ' +
        'versión íntegra y el índice de las figuras generadas.'
    ),

    heading('Anexo A: Dataset completo', HeadingLevel.HEADING_2),
    texto(
      datos.anexoDataset.esMuestra
        ? `El dataset completo tiene ${datos.anexoDataset.tamanoOriginal} registros, más de lo que este anexo puede ` +
          `listar de forma legible. Se muestran ${datos.anexoDataset.filas.length} registros seleccionados por ` +
          'muestreo sistemático (espaciado uniforme sobre el total, no solo los primeros casos cargados).'
        : `Se listan los ${datos.anexoDataset.filas.length} registros completos del dataset analizado.`
    ),
    tabla(
      ['CVE', 'Software', 'CVSS', 'Severidad', 'Acceso', 'Estado'],
      datos.anexoDataset.filas.map((fila) => [fila.cve, fila.software, fila.cvssScore.toFixed(1), fila.severidad, fila.tipoAcceso, fila.estadoRemediacion])
    ),

    heading('Anexo B: Tabla sin agrupar completa', HeadingLevel.HEADING_2),
    texto(`Los ${datos.distribucionSinAgrupar.length} valores únicos de CVSS Score, con su frecuencia.`),
    tabla(['CVSS Score', 'Frecuencia'], datos.distribucionSinAgrupar.map((fila) => [fila.valor.toFixed(1), String(fila.frecuencia)])),

    heading('Anexo C: Índice de figuras', HeadingLevel.HEADING_2),
    tabla(
      ['#', 'Título'],
      construirDefinicionesGraficosWord(datos).map((definicion) => [String(definicion.numero), definicion.titulo])
    )
  ];
}

// Mapa numero RF-130 -> función de sección (CVSS únicamente en este paso).
// El número 12 (Visualizaciones) es la única función async — el orquestador
// espera (await) el resultado de todas por igual, esperar un valor no-Promise
// es un no-op seguro en JS.
const SECCIONES_WORD: Partial<Record<number, (datos: DatosInforme) => ElementoDocumento[] | Promise<ElementoDocumento[]>>> = {
  2: dibujarSeccionResumenEjecutivoWord,
  3: dibujarSeccionDescripcionDatasetWord,
  4: dibujarSeccionNumeroDeRegistrosYVariablesWord,
  5: dibujarSeccionTiposDeVariablesWord,
  6: dibujarSeccionCalidadDeDatosWord,
  7: dibujarSeccionValoresFaltantesWord,
  8: dibujarSeccionLimpiezaRealizadaWord,
  9: dibujarSeccionEstadisticaDescriptivaWord,
  10: dibujarSeccionAnalisisIndividualDeVariablesWord,
  11: dibujarSeccionDistribucionesWord,
  12: dibujarSeccionVisualizacionesWord,
  13: dibujarSeccionRelacionesEntreVariablesWord,
  14: dibujarSeccionAnalisisInferencialWord,
  15: dibujarSeccionPrediccionWord,
  16: dibujarSeccionEvaluacionDeModelosWord,
  17: dibujarSeccionInterpretacionWord,
  18: dibujarSeccionConclusionesWord,
  19: dibujarSeccionRecomendacionesWord,
  20: dibujarSeccionReferenciasYAnexosWord
};

// Orquestador — recorre MAPEO_PLANTILLA_UNIVERSAL_RF130 para decidir
// número/orden/título de cada heading(), igual que renderizarInformeUniversal
// en InformeUniversalRF130.ts (PDF). saltoDePaginaAntes=true solo en la
// primera sección del loop (§2, justo después del índice) — mismo criterio
// que ya tenía el Word viejo para "1. Introducción" (forzar página nueva
// después del/los página(s) del índice).
export async function construirContenidoWord(datos: DatosInforme): Promise<ElementoDocumento[]> {
  const contenido: ElementoDocumento[] = [...dibujarSeccionPortadaWord(datos), ...indice()];

  const entradas = MAPEO_PLANTILLA_UNIVERSAL_RF130.filter((entrada) => entrada.numero !== 1);
  for (let i = 0; i < entradas.length; i++) {
    const entrada = entradas[i];
    contenido.push(heading(`${entrada.numero}. ${entrada.nombreRF130}`, HeadingLevel.HEADING_1, i === 0));
    const cuerpo = SECCIONES_WORD[entrada.numero];
    if (cuerpo) {
      contenido.push(...(await cuerpo(datos)));
    }
  }

  return contenido;
}
