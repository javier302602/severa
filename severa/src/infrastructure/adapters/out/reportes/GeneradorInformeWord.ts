import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import { DatosInforme, DatosInformeDataset } from '../../../../application/ports/out/reportes/GeneradorDeInformes';
import {
  interpretarComposicionDataset,
  interpretarCalidadDatos,
  interpretarCorrelacionMasFuerte,
  interpretarOutliers
} from '../../../../domain/services/InterpretadorDeResultadosGenerico';
import { ESTILOS_APA7, MARGEN_APA7_TWIPS, ElementoDocumento, heading, texto, tabla, indice } from './LayoutInformeWord';
import { construirContenidoWord } from './InformeUniversalRF130Word';

// RF-78: genera el .docx real con la librería "docx". No implementa
// GeneradorDeInformes directamente: es un colaborador interno que
// GeneradorInformePDF compone para resolver el método generarInformeWord del
// puerto (así el archivo queda separado por formato, como se pidió).
//
// M-10 Ronda 2, Pasada 2-D (RF-130), Paso 1: generar() (CVSS) pasa a
// delegar en construirContenidoWord() (InformeUniversalRF130Word.ts, el
// orquestador nuevo de 20 secciones, análogo al cutover de PDF). construirContenido()
// y construirDefinicionesGraficosWord() (su helper exclusivo) se retiraron —
// a diferencia del cutover de PDF, acá no existe un equivalente a RF-82
// (no hay "Resumen Ejecutivo" en .docx, GeneradorDeInformes no lo declara),
// así que no hace falta mantener las funciones viejas vivas para nada: se
// retiran completas en este mismo paso. generarDataset()
// (construirContenidoDataset, pipeline genérico) NO se toca — queda para un
// Paso 2 aparte, mismo criterio que el cutover de PDF.
//
// La librería "docx" no tiene ninguna API de dibujo vectorial (solo puede
// insertar imágenes ya renderizadas vía ImageRun, o texto/tablas) — a
// diferencia de pdfkit, que sí permite pintar rect/line/path directamente.
// Bug real reportado: esto dejaba cada gráfico solo con su tabla de datos y
// una nota, sin imagen — corregido rasterizando las mismas funciones SVG que
// ya sirven /graficos/:tipo en pantalla (ver RasterizadorDeGraficosWord.ts,
// agrega "sharp" como dependencia nueva, confirmada con el usuario).
export class GeneradorInformeWord {
  async generar(datos: DatosInforme): Promise<Buffer> {
    const documento = new Document({
      styles: ESTILOS_APA7,
      sections: [{ properties: { page: { margin: { top: MARGEN_APA7_TWIPS, bottom: MARGEN_APA7_TWIPS, left: MARGEN_APA7_TWIPS, right: MARGEN_APA7_TWIPS } } }, children: await construirContenidoWord(datos) }]
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

// Celda genérica para el Anexo A del informe de dataset: los valores de un
// dataset arbitrario pueden ser de cualquier tipo (number/string/Date/null),
// mismo criterio de normalización que celdaComoTexto() en GeneradorInformePDF.ts.
function celdaGenericaComoTexto(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (valor instanceof Date) return valor.toLocaleDateString();
  return String(valor);
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
    new Paragraph({ text: 'Informe SIADE — Análisis de Datos General', heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Generado por SIADE para ${datos.generadoPara}`, bold: true, size: 24 })] }),
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

  // 9. Conclusiones. RF-81/RF-134 (M-10 Ronda 2, Pasada 1): mismo criterio
  // de distinción Descriptivo/Inferencial/Pendiente que GeneradorInformePDF.ts
  // (dibujarConclusionesDataset) — acá sin el badge de color de PDFKit
  // (Word no tiene ese lenguaje visual), con una etiqueta en negrita en su
  // lugar, mismo patrón ya usado para "Objetivo del gráfico"/"Fundamento
  // estadístico" más arriba en este archivo.
  contenido.push(
    heading('9. Conclusiones', HeadingLevel.HEADING_1),
    heading('Síntesis de hallazgos', HeadingLevel.HEADING_2),
    new Paragraph({ children: [new TextRun({ text: 'Tipo: ', bold: true }), new TextRun('Descriptivo')] }),
    ...datos.interpretacion.map((parrafo) => new Paragraph({ text: parrafo, bullet: { level: 0 } })),
    heading('Análisis inferencial', HeadingLevel.HEADING_2),
    new Paragraph({ children: [new TextRun({ text: 'Tipo: ', bold: true }), new TextRun('Pendiente')] }),
    texto('El sistema no realiza comparación entre grupos sobre datasets genéricos en esta versión.'),
    heading('Predicción', HeadingLevel.HEADING_2),
    new Paragraph({ children: [new TextRun({ text: 'Tipo: ', bold: true }), new TextRun('Pendiente')] }),
    texto(
      'M-16 (Predicción y Modelado) está pendiente de material académico antes de implementar o sugerir cualquier método (ver IMotorPrediccion.ts).'
    ),
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
