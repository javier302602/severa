import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun, WidthType, TableOfContents, ImageRun, AlignmentType } from 'docx';
import { generarImagenesDeGraficosInforme, ANCHO_IMAGEN_GRAFICO, ALTO_IMAGEN_GRAFICO } from './RasterizadorDeGraficosWord';
import { DatosInforme, DatosInformeDataset } from '../../../../application/ports/out/GeneradorDeInformes';
import {
  interpretarComposicionDataset,
  interpretarCalidadDatos,
  interpretarCorrelacionMasFuerte,
  interpretarOutliers
} from '../../../../domain/services/InterpretadorDeResultadosGenerico';
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
} from '../../../../domain/services/InterpretacionDeGraficos';
import { interpretarComparacionAcceso } from '../../../../domain/services/InterpretadorDeResultados';
import { formatearEstadistico } from '../../../../domain/services/ComparadorDeCategorias';
import type { ResumenCincoNumeros } from '../../../../domain/services/EstadisticaDescriptiva';

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

// RF-78: genera el .docx real con la librería "docx". No implementa
// GeneradorDeInformes directamente: es un colaborador interno que
// GeneradorInformePDF compone para resolver el método generarInformeWord del
// puerto (así el archivo queda separado por formato, como se pidió).
//
// Fase 1 (retrofit): misma estructura de contenido que GeneradorInformePDF.ts
// (mapeo confirmado contra el .qmd de referencia). La librería "docx" no
// tiene ninguna API de dibujo vectorial (solo puede insertar imágenes ya
// renderizadas vía ImageRun, o texto/tablas) — a diferencia de pdfkit, que sí
// permite pintar rect/line/path directamente. Bug real reportado: esto
// dejaba cada gráfico solo con su tabla de datos y una nota, sin imagen —
// corregido rasterizando las mismas funciones SVG que ya sirven /graficos/:tipo
// en pantalla (ver RasterizadorDeGraficosWord.ts, agrega "sharp" como
// dependencia nueva, confirmada con el usuario).
// Formato APA 7 (2026-07-20): fuente Times New Roman 12pt (24 en
// "half-points", la unidad que usa docx) para el cuerpo, interlineado 1.5
// (line: 360 = 1.5 × 240, donde 240 es "un renglón" en docx) y un espacio
// después de cada párrafo. Los márgenes de 1 pulgada van en `sections.properties.page.margin`
// de cada Document (1440 twips = 1 pulgada), no acá.
const ESTILOS_APA7 = {
  default: {
    document: {
      run: { font: 'Times New Roman', size: 24 },
      paragraph: { spacing: { line: 360, after: 200 } }
    }
  }
};

const MARGEN_APA7_TWIPS = 1440; // 1 pulgada = 1440 twips (unidad de docx)

export class GeneradorInformeWord {
  async generar(datos: DatosInforme): Promise<Buffer> {
    const documento = new Document({
      styles: ESTILOS_APA7,
      sections: [{ properties: { page: { margin: { top: MARGEN_APA7_TWIPS, bottom: MARGEN_APA7_TWIPS, left: MARGEN_APA7_TWIPS, right: MARGEN_APA7_TWIPS } } }, children: await construirContenido(datos) }]
    });

    return Packer.toBuffer(documento);
  }

  // Fase 5 (Mejora 4 — Análisis de Datos General): mismo patrón, "documento
  // de datos" distinto — ver DatosInformeDataset en GeneradorDeInformes.ts.
  async generarDataset(datos: DatosInformeDataset): Promise<Buffer> {
    const documento = new Document({
      styles: ESTILOS_APA7,
      sections: [{ properties: { page: { margin: { top: MARGEN_APA7_TWIPS, bottom: MARGEN_APA7_TWIPS, left: MARGEN_APA7_TWIPS, right: MARGEN_APA7_TWIPS } } }, children: construirContenidoDataset(datos) }]
    });

    return Packer.toBuffer(documento);
  }
}

function nivelDeRiesgoDesdeCvss(cvss: number): string {
  if (cvss >= 9.0) return 'Crítico';
  if (cvss >= 7.0) return 'Alto';
  if (cvss >= 4.0) return 'Moderado';
  return 'Bajo';
}

// Bug real reportado: las tablas no tenían bordes visibles. BORDE_CELDA se
// aplica a las 4 caras de cada celda (docx no hereda un borde "de tabla" a
// las celdas si no se lo pasa explícito a cada una).
const BORDE_CELDA = { style: 'single' as const, size: 4, color: '94A3B8' };
const BORDES_DE_CELDA = { top: BORDE_CELDA, bottom: BORDE_CELDA, left: BORDE_CELDA, right: BORDE_CELDA };

function celda(texto: string, encabezado = false): TableCell {
  return new TableCell({
    children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: texto, bold: encabezado })] })],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDES_DE_CELDA,
    shading: encabezado ? { fill: 'E2E8F0' } : undefined
  });
}

function tabla(encabezados: string[], filas: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: encabezados.map((texto) => celda(texto, true)) }),
      ...filas.map((fila) => new TableRow({ children: fila.map((texto) => celda(texto)) }))
    ]
  });
}

function heading(texto: string, nivel: (typeof HeadingLevel)[keyof typeof HeadingLevel], saltoDePaginaAntes = false): Paragraph {
  return new Paragraph({ text: texto, heading: nivel, pageBreakBefore: saltoDePaginaAntes });
}

function texto(contenido: string): Paragraph {
  return new Paragraph({ text: contenido });
}

// TableOfContents (ver indice() más abajo) es un FileChild como Paragraph y
// Table, pero no un subtipo de ninguno de los dos — se necesita esta unión
// para que las listas de contenido de la sección puedan incluir los tres.
type ElementoDocumento = Paragraph | Table | TableOfContents;

// Índice: a diferencia del PDF (que puede calcular la página real de cada
// capítulo con bufferPages, ver GeneradorInformePDF.ts), .docx no tiene forma
// de saber en qué página cae un heading hasta que Word abre el archivo y
// compone el layout con sus propias fuentes/tamaño de papel — por eso esto
// es un CAMPO (field code), no texto ya calculado: Word lo rellena solo al
// abrir el documento (o al presionar F9/"Actualizar campo" si ya estaba
// abierto). headingStyleRange '1-1' limita el índice a los headings de nivel
// 1 (los capítulos numerados), igual que el índice del PDF, que tampoco
// lista subsecciones.
function indice(): ElementoDocumento[] {
  return [
    new Paragraph({ text: 'Índice', heading: HeadingLevel.HEADING_1 }),
    new TableOfContents('Índice', { hyperlink: true, headingStyleRange: '1-1' })
  ];
}

// Celda genérica para el Anexo A del informe de dataset: los valores de un
// dataset arbitrario pueden ser de cualquier tipo (number/string/Date/null),
// mismo criterio de normalización que celdaComoTexto() en GeneradorInformePDF.ts.
function celdaGenericaComoTexto(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (valor instanceof Date) return valor.toLocaleDateString();
  return String(valor);
}

interface DefinicionGraficoWord {
  numero: number;
  titulo: string;
  objetivo: string;
  fundamento: string;
  relacion: string;
  tablaDatos: Table;
  analisis: string;
}

async function construirContenido(datos: DatosInforme): Promise<Array<ElementoDocumento>> {
  const r = datos.resumenEstadistico;
  const suma = r.media * datos.totalVulnerabilidades;
  const remotoVsLocal = datos.comparacionAccesoRemotoLocal;
  const g = datos.graficos;

  const criticasYAltas = g.barrasSeveridad
    .filter((item) => item.etiqueta === 'Crítica' || item.etiqueta === 'Alta')
    .reduce((total, item) => total + item.valor, 0);
  const porcentajeUrgente = datos.totalVulnerabilidades === 0 ? 0 : (criticasYAltas / datos.totalVulnerabilidades) * 100;

  const ultimo = datos.origenYCalidad.ultimoCambioRegistrado;

  const contenido: Array<ElementoDocumento> = [
    new Paragraph({ text: 'Informe SEVERA — Análisis Estadístico de Vulnerabilidades', heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Generado por SEVERA para ${datos.generadoPara}`, bold: true, size: 24 })] }),
    texto(`Generado: ${datos.generadoEn.toLocaleString()}`),
    texto(`Total de vulnerabilidades analizadas: ${datos.totalVulnerabilidades}`),

    ...indice(),

    // 1. Introducción
    heading('1. Introducción', HeadingLevel.HEADING_1, true),
    texto(
      `Este informe aplica técnicas de estadística descriptiva sobre el conjunto de ${datos.totalVulnerabilidades} ` +
        'vulnerabilidades de seguridad actualmente cargadas en SEVERA, con el fin de caracterizar su severidad ' +
        '(CVSS Score) y fundamentar, con evidencia numérica, una propuesta de priorización de remediación.'
    ),

    // 2. Origen y calidad de los datos
    heading('2. Origen y calidad de los datos', HeadingLevel.HEADING_1),
    texto(
      ultimo
        ? `Último cambio de importación registrado en auditoría: "${ultimo.detalle}", el ${ultimo.fecha.toLocaleString()} (analista: ${ultimo.usuario}).`
        : 'No hay ningún registro de auditoría de importación disponible todavía para este dataset.'
    ),
    texto(
      'SEVERA no conserva el motivo de cada fila rechazada más allá de la respuesta inmediata de esa importación — ' +
        'solo el conteo agregado queda registrado en el historial de auditoría.'
    ),

    // 3. Metodología
    heading('3. Metodología', HeadingLevel.HEADING_1),
    texto('Estadística descriptiva, no inferencial: no se aplican pruebas de hipótesis ni se generalizan los hallazgos más allá de este conjunto de datos.'),
    texto('Media/mediana/moda: nivel de severidad típico. Cuartiles: reparto en los extremos. Rango/varianza/desviación estándar/coeficiente de variación: dispersión. Correlación de Pearson: relación entre CVSS Score y Días para Parche.'),

    // 4. Organización de datos
    heading('4. Organización de los datos', HeadingLevel.HEADING_1),
    texto(
      `El dataset contiene ${datos.totalVulnerabilidades} registros, con los campos CVE, Software, CVSS Score, ` +
        'Severidad, Tipo de Vulnerabilidad, Acceso Remoto, Estado de Remediación y Fecha de carga.'
    ),
    heading('Primeros registros cargados', HeadingLevel.HEADING_2),
    tabla(
      ['CVE', 'Software', 'CVSS', 'Severidad', 'Acceso', 'Estado'],
      datos.muestraDeRegistros.primeros
        .slice(0, 10)
        .map((fila) => [fila.cve, fila.software, fila.cvssScore.toFixed(1), fila.severidad, fila.tipoAcceso, fila.estadoRemediacion])
    ),
    heading('Muestra representativa (muestreo sistemático)', HeadingLevel.HEADING_2),
    tabla(
      ['CVE', 'Software', 'CVSS', 'Severidad', 'Acceso', 'Estado'],
      datos.muestraDeRegistros.representativa.map((fila) => [
        fila.cve,
        fila.software,
        fila.cvssScore.toFixed(1),
        fila.severidad,
        fila.tipoAcceso,
        fila.estadoRemediacion
      ])
    ),

    // 5. Tendencia central
    heading('5. Medidas de tendencia central', HeadingLevel.HEADING_1),
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

    // 6. Variabilidad
    heading('6. Medidas de variabilidad', HeadingLevel.HEADING_1),
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
    ),

    // 7. Distribución de datos
    heading('7. Distribución de los datos', HeadingLevel.HEADING_1),
    heading('Sin agrupar (primeros 20 valores únicos)', HeadingLevel.HEADING_2),
    tabla(
      ['CVSS Score', 'Frecuencia'],
      datos.distribucionSinAgrupar.slice(0, 20).map((fila) => [fila.valor.toFixed(1), String(fila.frecuencia)])
    ),
    heading('Agrupada en intervalos', HeadingLevel.HEADING_2),
    tabla(
      ['Intervalo', 'Frec. absoluta', 'Frec. relativa (%)', 'Frec. acumulada'],
      datos.distribucionFrecuencias.map((fila) => [
        fila.intervalo,
        String(fila.frecuenciaAbsoluta),
        `${fila.frecuenciaRelativaPorcentaje.toFixed(1)}%`,
        String(fila.frecuenciaAcumulada)
      ])
    ),

    // 8. Gráficos — con imagen real (ver RasterizadorDeGraficosWord.ts)
    heading('8. Gráficos explicados en detalle', HeadingLevel.HEADING_1),
    texto('Cada gráfico de esta sección incluye su dibujo, un epígrafe, la explicación de 6 bloques y la tabla de datos subyacente.')
  ];

  const imagenes = await generarImagenesDeGraficosInforme(datos);

  construirDefinicionesGraficosWord(datos).forEach((definicion, indice) => {
    contenido.push(heading(`8.${definicion.numero} Gráfico ${definicion.numero}: ${definicion.titulo}`, HeadingLevel.HEADING_2));
    contenido.push(new Paragraph({ children: [new TextRun({ text: 'Objetivo del gráfico: ', bold: true }), new TextRun(definicion.objetivo)] }));
    contenido.push(new Paragraph({ children: [new TextRun({ text: 'Fundamento estadístico: ', bold: true }), new TextRun(definicion.fundamento)] }));
    contenido.push(new Paragraph({ children: [new TextRun({ text: 'Relación con secciones anteriores: ', bold: true }), new TextRun(definicion.relacion)] }));
    contenido.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: 'png',
            data: imagenes[indice],
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
    contenido.push(new Paragraph({ children: [new TextRun({ text: 'Análisis de resultados y conclusiones: ', bold: true }), new TextRun(definicion.analisis)] }));
  });

  contenido.push(
    // 9. Aplicación práctica
    heading('9. Aplicación práctica: priorización de remediación', HeadingLevel.HEADING_1),
    texto(`¿Cuál es el nivel típico de riesgo? Media CVSS = ${r.media.toFixed(2)}, mediana = ${r.mediana.toFixed(2)} — riesgo "${nivelDeRiesgoDesdeCvss(r.media)}".`),
    texto(`¿Qué proporción requiere atención urgente? ${criticasYAltas} de ${datos.totalVulnerabilidades} (${porcentajeUrgente.toFixed(1)}%) son Crítica o Alta.`),
    texto(`¿Influye el acceso remoto? Media remoto = ${formatearEstadistico(remotoVsLocal.mediaA)}, local = ${formatearEstadistico(remotoVsLocal.mediaB)} (diferencia ${formatearEstadistico(remotoVsLocal.diferenciaMedias)}).`),
    texto(
      g.histogramaDiasParche.bins.length === 0
        ? '¿Cuánto toma disponer de un parche? No hay vulnerabilidades con ese dato registrado.'
        : `¿Cuánto toma disponer de un parche? ${g.histogramaDiasParche.media.toFixed(1)} días en promedio.`
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

    // 10. Conclusiones
    heading('10. Conclusiones', HeadingLevel.HEADING_1),
    heading('Síntesis de hallazgos', HeadingLevel.HEADING_2),
    ...datos.interpretacion.map((parrafo) => new Paragraph({ text: parrafo, bullet: { level: 0 } })),
    heading('Limitaciones conocidas', HeadingLevel.HEADING_2),
    ...datos.limitacionesConocidas.map((limitacion) => new Paragraph({ text: limitacion, bullet: { level: 0 } })),
    heading('Recomendaciones', HeadingLevel.HEADING_2),
    texto(
      'Priorizar la remediación siguiendo el ranking de urgencia de la sección anterior, dando prioridad adicional ' +
        'a las vulnerabilidades de acceso remoto y a las de mayor tiempo de exposición sin parche disponible.'
    ),

    // 11. Referencias
    heading('11. Referencias', HeadingLevel.HEADING_1),
    texto('FIRST — Forum of Incident Response and Security Teams. Common Vulnerability Scoring System (CVSS), versión 3.1. https://www.first.org/cvss/'),
    texto('National Institute of Standards and Technology. National Vulnerability Database (NVD). https://nvd.nist.gov/'),

    // 12. Anexos — mismo contenido que dibujarAnexos() en GeneradorInformePDF.ts.
    heading('12. Anexos', HeadingLevel.HEADING_1),
    texto(
      'Material de respaldo que sustenta los resultados del informe: el dataset completo (o una muestra ' +
        'representativa si excede el límite razonable de este anexo), la tabla de frecuencias sin agrupar íntegra y ' +
        'el índice de las figuras generadas.'
    ),
    heading('Anexo A: Dataset completo', HeadingLevel.HEADING_2),
    texto(
      datos.anexoDataset.esMuestra
        ? `El dataset completo tiene ${datos.anexoDataset.tamanoOriginal} registros, más de lo que este anexo puede ` +
          `listar de forma legible. Se muestran ${datos.anexoDataset.filas.length} registros seleccionados por ` +
          'muestreo sistemático (espaciado uniforme sobre el total).'
        : `Se listan los ${datos.anexoDataset.filas.length} registros completos del dataset analizado.`
    ),
    tabla(
      ['CVE', 'Software', 'CVSS', 'Severidad', 'Acceso', 'Estado'],
      datos.anexoDataset.filas.map((fila) => [fila.cve, fila.software, fila.cvssScore.toFixed(1), fila.severidad, fila.tipoAcceso, fila.estadoRemediacion])
    ),
    heading('Anexo B: Tabla sin agrupar completa', HeadingLevel.HEADING_2),
    texto(`Los ${datos.distribucionSinAgrupar.length} valores únicos de CVSS Score, con su frecuencia.`),
    tabla(
      ['CVSS Score', 'Frecuencia'],
      datos.distribucionSinAgrupar.map((fila) => [fila.valor.toFixed(1), String(fila.frecuencia)])
    ),
    heading('Anexo C: Índice de figuras', HeadingLevel.HEADING_2),
    tabla(
      ['#', 'Título'],
      construirDefinicionesGraficosWord(datos).map((definicion) => [String(definicion.numero), definicion.titulo])
    )
  );

  return contenido;
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
        [
          filaResumenCincoNumeros('Remoto', g.boxplotPorAcceso.remoto),
          filaResumenCincoNumeros('Local', g.boxplotPorAcceso.local)
        ]
      ),
      analisis: interpretarComparacionAcceso(remotoVsLocal)
    },
    {
      numero: 7,
      titulo: 'Relación entre CVSS Score y Días para Parche',
      objetivo: 'explorar si existe relación entre la severidad y el tiempo que tarda en estar disponible un parche.',
      fundamento: 'la correlación de Pearson resume el grado y dirección de la relación lineal entre ambas variables en un solo número.',
      relacion: 'primera vez que se presenta este resultado en el informe.',
      tablaDatos: tabla(['Pares con dato registrado', 'Correlación de Pearson'], [[String(g.dispersionCvssDias.puntos.length), g.dispersionCvssDias.correlacion.toFixed(3)]]),
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

// =======================================================================
// Fase 5 (Mejora 4 — Análisis de Datos General): mismo contenido que
// GeneradorInformePDF.ts (sección por sección), sin imagen para el
// histograma/heatmap — mismo motivo documentado arriba en la clase: "docx"
// no tiene dibujo vectorial, así que cada gráfico queda con su tabla de
// datos subyacente y una nota, igual que el resto de este archivo.
// =======================================================================

function resumenColumnaComoTextoWord(columna: DatosInformeDataset['estadisticasDescriptivas'][number]): string {
  if (columna.tipo === 'numerica') {
    return `media=${columna.media.toFixed(2)}, mediana=${columna.mediana.toFixed(2)}, min=${columna.minimo.toFixed(2)}, max=${columna.maximo.toFixed(2)}`;
  }
  if (columna.tipo === 'fecha') {
    return columna.minimo && columna.maximo
      ? `de ${new Date(columna.minimo).toLocaleDateString()} a ${new Date(columna.maximo).toLocaleDateString()}`
      : 'sin fechas válidas';
  }
  const top = columna.masFrecuente[0];
  return top ? `${columna.valoresUnicos} valor(es) único(s); más frecuente: "${top.valor}" (${top.frecuencia})` : 'sin valores';
}

function construirContenidoDataset(datos: DatosInformeDataset): Array<ElementoDocumento> {
  const contenido: Array<ElementoDocumento> = [
    new Paragraph({ text: 'Informe SEVERA — Análisis de Datos General', heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Generado por SEVERA para ${datos.generadoPara}`, bold: true, size: 24 })] }),
    texto(`Generado: ${datos.generadoEn.toLocaleString()}`),
    texto(`${datos.totalFilas} fila(s) — ${datos.totalColumnas} columna(s)`),

    ...indice(),

    // 1. Introducción
    heading('1. Introducción', HeadingLevel.HEADING_1, true),
    texto(
      `Este informe aplica estadística descriptiva sobre un dataset genérico de ${datos.totalFilas} fila(s) y ` +
        `${datos.totalColumnas} columna(s) — el tipo de cada columna se infiere de sus propios valores, sin un ` +
        'esquema fijo de antemano.'
    ),

    // 2. Metodología
    heading('2. Metodología', HeadingLevel.HEADING_1),
    texto('Estadística descriptiva, no inferencial: no se aplican pruebas de hipótesis ni se generalizan los hallazgos más allá de este dataset.'),
    texto('Media/mediana/moda, cuartiles, varianza/desviación estándar: tendencia central y dispersión por columna numérica. Correlación de Pearson: relación lineal entre pares de columnas numéricas. Rango intercuartílico (1.5×IQR): criterio de valores atípicos.'),

    // 3. Descripción del dataset
    heading('3. Descripción del dataset', HeadingLevel.HEADING_1),
    texto(interpretarComposicionDataset(datos)),
    tabla(
      ['Columna', 'Tipo detectado', 'Faltantes', '% faltante', 'Únicos'],
      datos.columnas.map((columna) => [
        columna.nombre,
        columna.tipo,
        String(columna.valoresFaltantes),
        `${columna.porcentajeFaltante.toFixed(1)}%`,
        String(columna.valoresUnicos)
      ])
    ),

    // 4. Calidad de los datos
    heading('4. Calidad de los datos', HeadingLevel.HEADING_1),
    texto('% faltante = (valores faltantes de la columna / total de filas) × 100'),
    texto(interpretarCalidadDatos(datos)),

    // 5. Estadísticas descriptivas
    heading('5. Estadísticas descriptivas', HeadingLevel.HEADING_1),
    tabla(
      ['Columna', 'Tipo', 'Resumen'],
      datos.estadisticasDescriptivas.map((columna) => [columna.nombre, columna.tipo, resumenColumnaComoTextoWord(columna)])
    ),

    // 6. Análisis univariado
    heading('6. Análisis univariado (columnas numéricas)', HeadingLevel.HEADING_1)
  ];

  if (datos.analisisUnivariado.length === 0) {
    contenido.push(texto('Este dataset no tiene columnas numéricas para analizar individualmente.'));
  }

  datos.analisisUnivariado.forEach((analisis, indice) => {
    if (analisis.tipo !== 'numerica') return;
    const r = analisis.resumenCincoNumeros;

    contenido.push(heading(`6.${indice + 1} ${analisis.nombre}`, HeadingLevel.HEADING_2));
    contenido.push(texto(`Media = (suma de ${analisis.valoresValidos} valores) / n = ${r.media.toFixed(2)}`));
    contenido.push(
      texto(
        `Mediana = ${r.mediana.toFixed(2)}, Q1 = ${r.q1.toFixed(2)}, Q3 = ${r.q3.toFixed(2)}, mínimo = ${r.minimo.toFixed(2)}, máximo = ${r.maximo.toFixed(2)}. ` +
          `${analisis.valoresFaltantes} valor(es) faltante(s).`
      )
    );
    contenido.push(texto('Histograma disponible en la versión PDF de este informe. Tabla de datos subyacente:'));
    contenido.push(tabla(['Intervalo', 'Frecuencia'], analisis.distribucion.map((bin) => [bin.intervalo, String(bin.frecuenciaAbsoluta)])));
  });

  // 7. Matriz de correlación
  contenido.push(heading('7. Matriz de correlación', HeadingLevel.HEADING_1));
  const matriz = datos.matrizCorrelacion;
  if (matriz.columnasExcluidas.length > 0) {
    contenido.push(
      texto(`Columnas no incluidas: ${matriz.columnasExcluidas.map((columna) => `"${columna.nombre}" (${columna.motivo})`).join(', ')}.`)
    );
  }
  if (matriz.columnas.length > 0) {
    contenido.push(texto('Heatmap disponible en la versión PDF de este informe. Tabla de valores (r de Pearson) subyacente:'));
    contenido.push(
      tabla(
        ['', ...matriz.columnas],
        matriz.filas.map((fila) => [
          fila.columna,
          ...fila.correlaciones.map((celda) => (celda.valor === null ? 'N/D' : celda.valor.toFixed(3)))
        ])
      )
    );
    contenido.push(texto(interpretarCorrelacionMasFuerte(matriz)));
  } else {
    contenido.push(texto('No hay columnas numéricas elegibles para calcular correlaciones.'));
  }

  // 8. Valores atípicos
  contenido.push(heading('8. Valores atípicos (outliers)', HeadingLevel.HEADING_1));
  contenido.push(texto('Atípico si valor < Q1 - 1.5×IQR o valor > Q3 + 1.5×IQR, con IQR = Q3 - Q1'));
  if (datos.outliers.columnasExcluidas.length > 0) {
    contenido.push(
      texto(`Columnas no evaluadas: ${datos.outliers.columnasExcluidas.map((columna) => `"${columna.nombre}" (${columna.motivo})`).join(', ')}.`)
    );
  }
  if (datos.outliers.columnas.length > 0) {
    contenido.push(
      tabla(
        ['Columna', 'Q1', 'Q3', 'Límite inf.', 'Límite sup.', 'Cant. atípicos'],
        datos.outliers.columnas.map((columna) => [
          columna.columna,
          columna.q1.toFixed(2),
          columna.q3.toFixed(2),
          columna.limiteInferior.toFixed(2),
          columna.limiteSuperior.toFixed(2),
          String(columna.cantidadValoresAtipicos)
        ])
      )
    );
    contenido.push(texto(interpretarOutliers(datos.outliers)));
  } else {
    contenido.push(texto('No hay columnas numéricas para evaluar.'));
  }

  // 9. Conclusiones
  contenido.push(
    heading('9. Conclusiones', HeadingLevel.HEADING_1),
    heading('Síntesis de hallazgos', HeadingLevel.HEADING_2),
    ...datos.interpretacion.map((parrafo) => new Paragraph({ text: parrafo, bullet: { level: 0 } })),
    heading('Limitaciones conocidas', HeadingLevel.HEADING_2),
    ...datos.limitacionesConocidas.map((limitacion) => new Paragraph({ text: limitacion, bullet: { level: 0 } }))
  );

  // 10. Anexos — mismo contenido que dibujarAnexosDataset() en GeneradorInformePDF.ts.
  contenido.push(
    heading('10. Anexos', HeadingLevel.HEADING_1),
    texto('Material de respaldo del informe: una muestra cruda de filas del dataset y el índice de las figuras generadas.'),
    heading('Anexo A: Muestra de filas', HeadingLevel.HEADING_2),
    texto(
      datos.anexoMuestraFilas.totalColumnas > datos.anexoMuestraFilas.columnasMostradas.length
        ? `Se muestran las primeras ${datos.anexoMuestraFilas.columnasMostradas.length} de ${datos.anexoMuestraFilas.totalColumnas} ` +
          `columnas y las primeras ${datos.anexoMuestraFilas.filas.length} de ${datos.anexoMuestraFilas.totalFilas} filas.`
        : `Se muestran las primeras ${datos.anexoMuestraFilas.filas.length} de ${datos.anexoMuestraFilas.totalFilas} filas del dataset.`
    )
  );
  if (datos.anexoMuestraFilas.filas.length === 0) {
    contenido.push(texto('El dataset no tiene filas.'));
  } else {
    contenido.push(
      tabla(
        datos.anexoMuestraFilas.columnasMostradas,
        datos.anexoMuestraFilas.filas.map((fila) => datos.anexoMuestraFilas.columnasMostradas.map((columna) => celdaGenericaComoTexto(fila[columna])))
      )
    );
  }

  contenido.push(heading('Anexo B: Índice de figuras generadas', HeadingLevel.HEADING_2));
  const figuras: string[][] = datos.analisisUnivariado
    .filter((analisis) => analisis.tipo === 'numerica')
    .map((analisis, posicion): [string, string] => [String(posicion + 1), `Distribución de "${analisis.nombre}"`]);
  if (datos.matrizCorrelacion.columnas.length > 0) {
    figuras.push([String(figuras.length + 1), 'Heatmap de correlación de Pearson']);
  }
  contenido.push(
    figuras.length === 0
      ? texto('Este dataset no generó ninguna figura (sin columnas numéricas).')
      : tabla(['#', 'Título'], figuras)
  );

  return contenido;
}
