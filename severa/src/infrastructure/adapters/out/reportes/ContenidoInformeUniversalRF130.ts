import { generarFigurasDeInformeCvss, generarFigurasDeInformeDataset } from './RasterizadorDeGraficosWord';
import { DatosInforme, DatosInformeDataset } from '../../../../application/ports/out/reportes/GeneradorDeInformes';
import { MAPEO_PLANTILLA_UNIVERSAL_RF130, REFERENCIAS_DE_SECCION_RF130 } from '../../../../domain/services/reportes/MapeoPlantillaUniversalRF130';
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
import type { AnalisisUnivariadoNumerico } from '../../../../domain/services/descriptive-statistics/AnalisisUnivariadoGenerico';
import {
  interpretarComposicionDataset,
  interpretarCorrelacionMasFuerte,
  interpretarOutliers
} from '../../../../domain/services/InterpretadorDeResultadosGenerico';
import { detectarVocabularioDataset } from '../../../../domain/services/reportes/VocabularioDeDominioGenerico';
import {
  BloqueDeInforme,
  titulo,
  subtituloDePortada,
  indice,
  encabezado,
  subtitulo,
  texto,
  etiquetado,
  vineta,
  tabla,
  figura,
  epigrafe
} from './BloquesDeInforme';
// Solo el tipo (se borra al compilar): InformeUniversalRF130.ts es el
// renderer PDF, y este archivo no debe depender de pdfkit en tiempo de
// ejecución. La unión discriminada es la misma para todos los formatos a
// propósito — un pipeline nuevo tiene que resolverse en todos.
import type { ContextoInformeUniversal } from './InformeUniversalRF130';
import { formatearMomento, formatearDiaCalendario } from './FormatoDeFechasInforme';

// Contenido del informe de 20 secciones (RF-130) para los dos pipelines,
// como lista de bloques neutros (ver BloquesDeInforme.ts). Es la única copia
// del contenido que comparten Word, HTML, LaTeX y la exportación de tablas a
// Excel; el PDF conserva la suya en InformeUniversalRF130.ts (pdfkit), y es
// de ahí de donde salió la redacción de cada sección.
//
// Historia: este archivo nació en la Pasada 2-D como InformeUniversalRF130Word.ts
// y devolvía objetos de la librería "docx". La Pasada 3 cambió únicamente QUÉ
// devuelve cada función (bloques en vez de Paragraph/Table); la prosa, el
// orden y las tablas son los mismos, y el .docx que resulta es idéntico byte
// a byte al de antes. Los comentarios de cada sección que dicen "ya existía
// en Word como ..." se refieren al informe Word viejo de 12/10 secciones.
//
// Estructura: recorre MAPEO_PLANTILLA_UNIVERSAL_RF130 para decidir
// número/orden/título de cada sección — el mismo array que usa el renderer
// PDF. Las funciones "...Cvss" reciben DatosInforme y las "...Generico"
// DatosInformeDataset; el único punto que distingue un pipeline del otro es
// cuerpoDeSeccion(), con chequeo de exhaustividad sobre ContextoInformeUniversal.

function nivelDeRiesgoDesdeCvss(cvss: number): string {
  if (cvss >= 9.0) return 'Crítico';
  if (cvss >= 7.0) return 'Alto';
  if (cvss >= 4.0) return 'Moderado';
  return 'Bajo';
}

// "No aplicable" (eje: ¿esta sección existe para este tipo de dataset?) — el
// PDF lo dibuja como un badge de color; acá es una etiqueta en negrita, con
// un rótulo distinto ("Estado: ") del de TipoDeAnalisis ("Tipo: ") para no
// confundir los dos ejes — mismo criterio que documenta InformeUniversalRF130.ts.
function bloquesNoAplicable(motivo: string): BloqueDeInforme[] {
  return [etiquetado('Estado: ', 'No aplicable'), texto(motivo)];
}

// TipoDeAnalisis (Descriptivo/Inferencial/Pendiente).
function etiquetaTipo(tipo: string): BloqueDeInforme {
  return etiquetado('Tipo: ', tipo);
}

// ---------------------------------------------------------------------
// 1. Portada — caso especial, igual que en PDF: no pasa por el loop de
// nuevaSeccion()/heading() (no tiene entrada en el índice). Ya existía
// prácticamente igual en Word — se mueve tal cual.
// ---------------------------------------------------------------------
function seccionPortadaCvss(datos: DatosInforme): BloqueDeInforme[] {
  return [
    titulo('Informe SIADE — Análisis Estadístico de Vulnerabilidades'),
    subtituloDePortada(`Generado por SIADE para ${datos.generadoPara}`),
    texto(`Generado: ${formatearMomento(datos.generadoEn)}`),
    texto(`Total de vulnerabilidades analizadas: ${datos.totalVulnerabilidades}`)
  ];
}

// ---------------------------------------------------------------------
// 2. Resumen ejecutivo — contenido nuevo (no existía en el Word viejo de 12
// secciones), redacción tomada de dibujarSeccionResumenEjecutivo (caso
// 'cvss') en InformeUniversalRF130.ts.
// ---------------------------------------------------------------------
function seccionResumenEjecutivoCvss(datos: DatosInforme): BloqueDeInforme[] {
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
function seccionDescripcionDatasetCvss(datos: DatosInforme): BloqueDeInforme[] {
  const encabezados = ['CVE', 'Software', 'CVSS', 'Severidad', 'Acceso', 'Estado'];
  return [
    texto(
      `El dataset analizado contiene ${datos.totalVulnerabilidades} registros, con los campos CVE, Software, CVSS ` +
        'Score, Severidad (derivada del CVSS Score), Tipo de Vulnerabilidad, Acceso Remoto, Estado de Remediación y ' +
        'Fecha de carga.'
    ),
    subtitulo('Primeros registros cargados'),
    tabla(
      encabezados,
      datos.muestraDeRegistros.primeros
        .slice(0, 10)
        .map((fila) => [fila.cve, fila.software, fila.cvssScore.toFixed(1), fila.severidad, fila.tipoAcceso, fila.estadoRemediacion])
    ),
    subtitulo('Muestra representativa (muestreo sistemático sobre todo el conjunto)'),
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
function seccionNumeroDeRegistrosYVariablesCvss(datos: DatosInforme): BloqueDeInforme[] {
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
function seccionTiposDeVariablesCvss(): BloqueDeInforme[] {
  return bloquesNoAplicable(
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
function seccionCalidadDeDatosCvss(datos: DatosInforme): BloqueDeInforme[] {
  const ultimo = datos.origenYCalidad.ultimoCambioRegistrado;
  return [
    texto(
      ultimo
        ? `El último cambio de importación registrado en el historial de auditoría fue: "${ultimo.detalle}", el ` +
          `${formatearMomento(ultimo.fecha)} (analista: ${ultimo.usuario}).`
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
function seccionValoresFaltantesCvss(): BloqueDeInforme[] {
  return bloquesNoAplicable('El esquema fijo de Vulnerabilidad no admite valores faltantes por diseño — todos los campos se validan al importar.');
}

// ---------------------------------------------------------------------
// 8. Limpieza realizada — no aplica a CVSS, sección nueva en Word. Motivo
// tomado literal de dibujarSeccionLimpiezaRealizada (caso 'cvss').
// ---------------------------------------------------------------------
function seccionLimpiezaRealizadaCvss(): BloqueDeInforme[] {
  return bloquesNoAplicable('SIADE no transforma datos de vulnerabilidades — solo diagnostica lo que se importa tal cual.');
}

// ---------------------------------------------------------------------
// 9. Estadística descriptiva — fusiona "5. Medidas de tendencia central" +
// "6. Medidas de variabilidad" (informe Word viejo, ya escritas) en una
// sola sección con 2 subsecciones (heading nivel 2) — mismo criterio que
// dibujarSeccionEstadisticaDescriptiva (caso 'cvss') en el PDF. Contenido
// reusado tal cual, solo reestructurada la jerarquía de headings.
// ---------------------------------------------------------------------
function seccionEstadisticaDescriptivaCvss(datos: DatosInforme): BloqueDeInforme[] {
  const r = datos.resumenEstadistico;
  const suma = r.media * datos.totalVulnerabilidades;
  return [
    subtitulo('Tendencia central'),
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
    subtitulo('Variabilidad'),
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
function seccionAnalisisIndividualDeVariablesCvss(): BloqueDeInforme[] {
  return bloquesNoAplicable(
    'CVSS Score es la única variable continua del esquema fijo de Vulnerabilidad, y ya se cubre en detalle en la ' +
      'sección de Estadística descriptiva — no hay múltiples variables numéricas que analizar una por una.'
  );
}

// ---------------------------------------------------------------------
// 11. Distribuciones — ya existía en Word como "7. Distribución de los
// datos" (informe viejo). Reuso directo.
// ---------------------------------------------------------------------
function seccionDistribucionesCvss(datos: DatosInforme): BloqueDeInforme[] {
  return [
    texto(
      'Las medidas de los capítulos anteriores resumen la severidad en unos pocos números; ver la distribución ' +
        'completa muestra además cómo se reparten los valores.'
    ),
    subtitulo('Sin agrupar (primeros 20 valores únicos)'),
    tabla(
      ['CVSS Score', 'Frecuencia'],
      datos.distribucionSinAgrupar.slice(0, 20).map((fila) => [fila.valor.toFixed(1), String(fila.frecuencia)])
    ),
    subtitulo('Agrupada en intervalos, con frecuencia acumulada'),
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
interface DefinicionGrafico {
  numero: number;
  titulo: string;
  objetivo: string;
  fundamento: string;
  relacion: string;
  tablaDatos: BloqueDeInforme;
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

function construirDefinicionesGraficos(datos: DatosInforme): DefinicionGrafico[] {
  const g = datos.graficos;
  const remotoVsLocal = datos.comparacionAccesoRemotoLocal;

  return [
    {
      numero: 1,
      titulo: 'Histograma de CVSS Score (distribución sin agrupar)',
      objetivo: 'representar visualmente la forma completa de la distribución de CVSS Score.',
      fundamento: 'un histograma agrupa los valores continuos en clases y representa su frecuencia como la altura de cada barra.',
      relacion: `las líneas de media y mediana coinciden con las calculadas en ${REFERENCIAS_DE_SECCION_RF130.estadisticaDescriptiva}.`,
      tablaDatos: tabla(['Intervalo', 'Frecuencia'], g.histogramaCvss.bins.map((bin) => [bin.intervalo, String(bin.frecuencia)])),
      analisis: interpretarHistogramaCvss(g.histogramaCvss)
    },
    {
      numero: 2,
      titulo: 'Distribución por severidad (barras)',
      objetivo: 'comparar cuántas vulnerabilidades hay en cada categoría de severidad.',
      fundamento: 'un gráfico de barras representa la frecuencia absoluta de una variable cualitativa ordinal.',
      relacion: `mismos conteos usados en ${REFERENCIAS_DE_SECCION_RF130.indicadoresDePriorizacion}.`,
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
      relacion: `los valores de la caja son los mismos Q1=${datos.resumenEstadistico.q1.toFixed(2)} y Q3=${datos.resumenEstadistico.q3.toFixed(2)} de ${REFERENCIAS_DE_SECCION_RF130.estadisticaDescriptiva}.`,
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
      relacion: `los conteos por intervalo son los mismos de la tabla agrupada de ${REFERENCIAS_DE_SECCION_RF130.distribuciones}.`,
      tablaDatos: tabla(['Intervalo', 'Frecuencia'], g.histogramaAgrupado.bins.map((bin) => [bin.intervalo, String(bin.frecuencia)])),
      analisis: interpretarHistogramaAgrupado()
    },
    {
      numero: 6,
      titulo: 'Comparación de CVSS por tipo de acceso',
      objetivo: 'comparar la severidad entre vulnerabilidades de acceso remoto y de acceso local.',
      fundamento: 'dos resúmenes de cinco números (uno por grupo) permiten comparar mediana, dispersión y atípicos.',
      relacion: `las medias (remoto=${formatearEstadistico(remotoVsLocal.mediaA)}, local=${formatearEstadistico(remotoVsLocal.mediaB)}) son las de ${REFERENCIAS_DE_SECCION_RF130.comparacionPorAcceso}.`,
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

async function seccionVisualizacionesCvss(datos: DatosInforme): Promise<BloqueDeInforme[]> {
  const contenido: BloqueDeInforme[] = [
    texto('Cada gráfico de esta sección incluye su dibujo, un epígrafe, la explicación de 6 bloques y la tabla de datos subyacente.')
  ];

  const figuras = await generarFigurasDeInformeCvss(datos);

  construirDefinicionesGraficos(datos).forEach((definicion, indiceGrafico) => {
    contenido.push(subtitulo(`12.${definicion.numero} Gráfico ${definicion.numero}: ${definicion.titulo}`));
    contenido.push(etiquetado('Objetivo del gráfico: ', definicion.objetivo));
    contenido.push(etiquetado('Fundamento estadístico: ', definicion.fundamento));
    contenido.push(etiquetado('Relación con secciones anteriores: ', definicion.relacion));
    contenido.push(figura({ titulo: `Gráfico ${definicion.numero}: ${definicion.titulo}`, ...figuras[indiceGrafico] }));
    // Epígrafe (caption) — RF pedido explícitamente: "Gráfico X: [Título]".
    contenido.push(epigrafe(`Gráfico ${definicion.numero}: ${definicion.titulo}`));
    contenido.push(definicion.tablaDatos);
    // Bloque agregado en esta pasada (Pasada 2-D, Paso 1) — mismo texto fijo
    // que usa dibujarSeccionVisualizaciones (caso 'cvss') en el PDF, para
    // que la redacción quede pareja entre los dos formatos. No dependía de
    // datos antes en PDF tampoco: es la misma oración en los 10 gráficos.
    contenido.push(
      etiquetado(
        'Funcionamiento del algoritmo: ',
        'los datos se calculan a partir del conjunto completo de vulnerabilidades vigente al generar el informe y ' +
          'se posicionan geométricamente antes de dibujarse — sin pasos manuales ni aproximaciones visuales.'
      )
    );
    contenido.push(etiquetado('Análisis de resultados y conclusiones: ', definicion.analisis));
  });

  return contenido;
}

// ---------------------------------------------------------------------
// 13. Relaciones entre variables — contenido nuevo como sección propia (en
// el Word viejo el coeficiente de Pearson solo aparecía pegado al Gráfico 7
// dentro de "8. Gráficos"). Redacción tomada de
// dibujarSeccionRelacionesEntreVariables (caso 'cvss').
// ---------------------------------------------------------------------
function seccionRelacionesEntreVariablesCvss(datos: DatosInforme): BloqueDeInforme[] {
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
function seccionAnalisisInferencialCvss(datos: DatosInforme): BloqueDeInforme[] {
  const remotoVsLocal = datos.comparacionAccesoRemotoLocal;
  return [
    etiquetaTipo('Inferencial'),
    texto(
      `Media CVSS remoto = ${formatearEstadistico(remotoVsLocal.mediaA)}, local = ${formatearEstadistico(remotoVsLocal.mediaB)} ` +
        `(diferencia de ${formatearEstadistico(remotoVsLocal.diferenciaMedias)} puntos). Comparación descriptiva de medias, ` +
        'sin prueba de hipótesis formal.'
    )
  ];
}

// ---------------------------------------------------------------------
// 15. Predicción — compartida por los dos pipelines (M-16 está bloqueado sin
// importar qué tipo de dataset se cargó), igual que en el PDF.
// ---------------------------------------------------------------------
function seccionPrediccionCvss(): BloqueDeInforme[] {
  return [
    etiquetaTipo('Pendiente'),
    texto('M-16 (Predicción y Modelado) está pendiente de material académico antes de implementar o sugerir cualquier método (ver IMotorPrediccion.ts).')
  ];
}

// ---------------------------------------------------------------------
// 16. Evaluación de modelos — misma dependencia que Predicción, también
// compartida por los dos pipelines.
// ---------------------------------------------------------------------
function seccionEvaluacionDeModelosCvss(): BloqueDeInforme[] {
  return [etiquetaTipo('Pendiente'), texto('Misma dependencia que la sección de Predicción — no hay modelos que evaluar sin M-16.')];
}

// ---------------------------------------------------------------------
// 17. Interpretación — ya existía en Word como "Síntesis de hallazgos"
// dentro de "10. Conclusiones" (informe viejo) — se mueve a sección propia,
// mismo array de bullets (datos.interpretacion), sin recalcular. Sin
// etiqueta de tipo para CVSS, mismo criterio que el PDF (asimetría
// deliberada respecto al genérico, documentada en InformeUniversalRF130.ts).
// ---------------------------------------------------------------------
function seccionInterpretacionCvss(datos: DatosInforme): BloqueDeInforme[] {
  return datos.interpretacion.map((parrafo) => vineta(parrafo));
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
function seccionConclusionesCvss(datos: DatosInforme): BloqueDeInforme[] {
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
    subtitulo('¿Cuál es el nivel típico de riesgo?'),
    etiquetaTipo('Descriptivo'),
    texto(`Media CVSS = ${r.media.toFixed(2)}, mediana = ${r.mediana.toFixed(2)} — riesgo típico "${nivelDeRiesgoDesdeCvss(r.media)}".`),
    subtitulo('¿Qué proporción requiere atención urgente?'),
    etiquetaTipo('Descriptivo'),
    texto(`${criticasYAltas} de ${datos.totalVulnerabilidades} vulnerabilidades (${porcentajeUrgente.toFixed(1)}%) son Crítica o Alta.`),
    subtitulo('¿Cuánto tiempo toma en promedio disponer de un parche?'),
    etiquetaTipo('Descriptivo'),
    texto(
      datos.graficos.histogramaDiasParche.bins.length === 0
        ? 'No hay vulnerabilidades con "Días para Parche" registrado en este conjunto.'
        : `${datos.graficos.histogramaDiasParche.media.toFixed(1)} días en promedio.`
    ),
    subtitulo('Ranking de urgencia de remediación (top 10)'),
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
    subtitulo('Limitaciones conocidas'),
    ...datos.limitacionesConocidas.map((limitacion) => vineta(limitacion))
  ];
}

// ---------------------------------------------------------------------
// 19. Recomendaciones — ya existía en Word como subsección de "10.
// Conclusiones" (informe viejo). Se mueve a sección propia, mismo texto.
// ---------------------------------------------------------------------
function seccionRecomendacionesCvss(): BloqueDeInforme[] {
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
// ahora usa construirDefinicionesGraficos de este mismo archivo.
// ---------------------------------------------------------------------
function seccionReferenciasYAnexosCvss(datos: DatosInforme): BloqueDeInforme[] {
  return [
    subtitulo('Referencias'),
    texto('FIRST — Forum of Incident Response and Security Teams. Common Vulnerability Scoring System (CVSS), versión 3.1. https://www.first.org/cvss/'),
    texto('National Institute of Standards and Technology. National Vulnerability Database (NVD). https://nvd.nist.gov/'),

    subtitulo('Anexos'),
    texto(
      'Material de respaldo que sustenta los resultados del informe: el dataset completo (o una muestra ' +
        'representativa, si excede el límite razonable de este anexo), la tabla de frecuencias sin agrupar en su ' +
        'versión íntegra y el índice de las figuras generadas.'
    ),

    subtitulo('Anexo A: Dataset completo'),
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

    subtitulo('Anexo B: Tabla sin agrupar completa'),
    texto(`Los ${datos.distribucionSinAgrupar.length} valores únicos de CVSS Score, con su frecuencia.`),
    tabla(['CVSS Score', 'Frecuencia'], datos.distribucionSinAgrupar.map((fila) => [fila.valor.toFixed(1), String(fila.frecuencia)])),

    subtitulo('Anexo C: Índice de figuras'),
    tabla(
      ['#', 'Título'],
      construirDefinicionesGraficos(datos).map((definicion) => [String(definicion.numero), definicion.titulo])
    )
  ];
}

// Mapa numero RF-130 -> función de sección, pipeline CVSS. El número 12
// (Visualizaciones) es la única función async — el orquestador espera (await)
// el resultado de todas por igual, esperar un valor no-Promise es un no-op
// seguro en JS.
const SECCIONES_CVSS: Partial<Record<number, (datos: DatosInforme) => BloqueDeInforme[] | Promise<BloqueDeInforme[]>>> = {
  2: seccionResumenEjecutivoCvss,
  3: seccionDescripcionDatasetCvss,
  4: seccionNumeroDeRegistrosYVariablesCvss,
  5: seccionTiposDeVariablesCvss,
  6: seccionCalidadDeDatosCvss,
  7: seccionValoresFaltantesCvss,
  8: seccionLimpiezaRealizadaCvss,
  9: seccionEstadisticaDescriptivaCvss,
  10: seccionAnalisisIndividualDeVariablesCvss,
  11: seccionDistribucionesCvss,
  12: seccionVisualizacionesCvss,
  13: seccionRelacionesEntreVariablesCvss,
  14: seccionAnalisisInferencialCvss,
  15: seccionPrediccionCvss,
  16: seccionEvaluacionDeModelosCvss,
  17: seccionInterpretacionCvss,
  18: seccionConclusionesCvss,
  19: seccionRecomendacionesCvss,
  20: seccionReferenciasYAnexosCvss
};

// =====================================================================
// Pipeline genérico (Paso 2). La redacción de cada sección sale de la rama
// 'generico' de la función homónima de InformeUniversalRF130.ts (PDF), que
// es donde se decidió qué va en cada una de las 20 secciones para un dataset
// arbitrario. Lo que el Word viejo de 10 secciones ya decía con otras
// palabras se alinea al PDF: dos formatos del mismo informe no deberían
// contar cosas distintas.
// =====================================================================

// datos.analisisUnivariado hoy solo trae columnas numéricas
// (RecopilarDatosDeInformeDataset.ts filtra antes de calcular), pero el tipo
// sigue siendo la unión completa — hace falta el narrowing para leer
// resumenCincoNumeros/distribucion sin castear.
function columnasNumericas(datos: DatosInformeDataset): AnalisisUnivariadoNumerico[] {
  return datos.analisisUnivariado.filter((analisis): analisis is AnalisisUnivariadoNumerico => analisis.tipo === 'numerica');
}

// La misma frase acompaña a cada variable en §10 (junto a sus estadísticos)
// y en §12 (al pie de su histograma) — superposición intencional, igual que
// en el PDF.
function fraseDeSimetria(analisis: AnalisisUnivariadoNumerico): string {
  const r = analisis.resumenCincoNumeros;
  const diferencia = Math.abs(r.media - r.mediana);
  return diferencia < r.media * 0.05 || diferencia < 0.5
    ? `La media y la mediana están cerca, lo que sugiere una distribución relativamente simétrica para "${analisis.nombre}".`
    : `La media (${r.media.toFixed(2)}) se aleja de la mediana (${r.mediana.toFixed(2)}) en "${analisis.nombre}", lo que sugiere asimetría o presencia de valores extremos.`;
}

// Mismo texto que resumenColumnaComoTexto() de GeneradorInformePDF.ts. No se
// importa de ahí: GeneradorInformePDF.ts ya importa GeneradorInformeWord.ts,
// que importa este archivo — importarlo de vuelta cerraría un ciclo real en
// tiempo de ejecución. Vivía en GeneradorInformeWord.ts hasta este paso.
function resumenColumnaComoTexto(columna: DatosInformeDataset['estadisticasDescriptivas'][number]): string {
  if (columna.tipo === 'numerica') {
    return `media=${columna.media.toFixed(2)}, mediana=${columna.mediana.toFixed(2)}, min=${columna.minimo.toFixed(2)}, max=${columna.maximo.toFixed(2)}`;
  }
  if (columna.tipo === 'fecha') {
    return columna.minimo && columna.maximo
      ? `de ${formatearDiaCalendario(columna.minimo)} a ${formatearDiaCalendario(columna.maximo)}`
      : 'sin fechas válidas';
  }
  const top = columna.masFrecuente[0];
  return top ? `${columna.valoresUnicos} valor(es) único(s); más frecuente: "${top.valor}" (${top.frecuencia})` : 'sin valores';
}

// Los valores de un dataset arbitrario pueden ser de cualquier tipo
// (number/string/Date/null) — mismo criterio de normalización que
// celdaComoTexto() en GeneradorInformePDF.ts, y mismo motivo para no
// importarla que la función de arriba.
function celdaGenericaComoTexto(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (valor instanceof Date) return formatearDiaCalendario(valor);
  return String(valor);
}

// 1. Portada.
function seccionPortadaGenerico(datos: DatosInformeDataset): BloqueDeInforme[] {
  return [
    titulo('Informe SIADE — Análisis de Datos General'),
    subtituloDePortada(`Generado por SIADE para ${datos.generadoPara}`),
    texto(`Generado: ${formatearMomento(datos.generadoEn)}`),
    texto(`${datos.totalFilas} fila(s) — ${datos.totalColumnas} columna(s)`)
  ];
}

// 2. Resumen ejecutivo — contenido nuevo en Word (el informe viejo no tenía).
function seccionResumenEjecutivoGenerico(datos: DatosInformeDataset): BloqueDeInforme[] {
  const vocabulario = detectarVocabularioDataset(datos.columnas.map((columna) => columna.nombre));
  const unidad = datos.totalFilas === 1 ? vocabulario.unidadSingular : vocabulario.unidadPlural;
  return [
    texto(`Este informe analiza un dataset de ${datos.totalFilas} ${unidad} y ${datos.totalColumnas} columna(s) para ${datos.generadoPara}.`),
    texto(
      `${interpretarCorrelacionMasFuerte(datos.matrizCorrelacion)} Las secciones siguientes desarrollan la calidad de ` +
        'datos, la estadística descriptiva y las relaciones entre variables que sustentan este resultado; el cierre ' +
        `del documento (secciones 17-18) reúne ${datos.interpretacion.length} hallazgo(s) principal(es) y ` +
        `${datos.limitacionesConocidas.length} limitación(es) conocida(s) del análisis.`
    )
  ];
}

// 3. Descripción del dataset — ya existía en el Word viejo; ahora pasa el
// vocabulario de dominio (RF-134), que el Word viejo no pasaba.
function seccionDescripcionDatasetGenerico(datos: DatosInformeDataset): BloqueDeInforme[] {
  const vocabulario = detectarVocabularioDataset(datos.columnas.map((columna) => columna.nombre));
  return [
    texto(interpretarComposicionDataset(datos, vocabulario)),
    tabla(
      ['Columna', 'Tipo detectado', 'Faltantes', '% faltante', 'Únicos'],
      datos.columnas.map((columna) => [
        columna.nombre,
        columna.tipo,
        String(columna.valoresFaltantes),
        `${columna.porcentajeFaltante.toFixed(1)}%`,
        String(columna.valoresUnicos)
      ])
    )
  ];
}

// 4. Número de registros/variables.
function seccionNumeroDeRegistrosYVariablesGenerico(datos: DatosInformeDataset): BloqueDeInforme[] {
  return [texto(`${datos.totalFilas} registro(s) y ${datos.totalColumnas} variable(s) (columnas).`)];
}

// 5. Tipos de variables.
function seccionTiposDeVariablesGenerico(datos: DatosInformeDataset): BloqueDeInforme[] {
  const conteoPorTipo = new Map<string, number>();
  datos.columnas.forEach((columna) => conteoPorTipo.set(columna.tipo, (conteoPorTipo.get(columna.tipo) ?? 0) + 1));
  const composicion = [...conteoPorTipo.entries()].map(([tipo, cantidad]) => `${cantidad} ${tipo}`).join(', ');
  return [
    texto(`Composición por tipo detectado: ${composicion}.`),
    tabla(['Columna', 'Tipo detectado'], datos.columnas.map((columna) => [columna.nombre, columna.tipo]))
  ];
}

// 6. Calidad de datos — incluye la subsección de valores atípicos: era la
// sección 8 del Word viejo y RF-130 no le da número propio (misma ubicación
// que en el PDF, ver dibujarSeccionCalidadDeDatos).
function seccionCalidadDeDatosGenerico(datos: DatosInformeDataset): BloqueDeInforme[] {
  const contenido: BloqueDeInforme[] = [
    texto('% faltante = (valores faltantes de la columna / total de filas) × 100'),
    texto(
      datos.filasDuplicadas === 0
        ? 'No se detectaron filas duplicadas exactas.'
        : `Se detectaron ${datos.filasDuplicadas} fila(s) duplicada(s) exacta(s) (copias exactas de otra fila ya presente).`
    )
  ];

  const peorColumna = [...datos.columnas].sort((a, b) => b.porcentajeFaltante - a.porcentajeFaltante)[0];
  contenido.push(
    texto(
      peorColumna && peorColumna.porcentajeFaltante > 0
        ? `La columna con más valores faltantes es "${peorColumna.nombre}": ${peorColumna.valoresFaltantes} de ${datos.totalFilas} ` +
            `(${peorColumna.porcentajeFaltante.toFixed(1)}%).`
        : 'Ninguna columna tiene valores faltantes.'
    )
  );

  const columnasConInconsistencias = datos.columnas.filter((columna) => columna.valoresInconsistentes > 0);
  contenido.push(
    texto(
      columnasConInconsistencias.length === 0
        ? 'Ninguna columna tiene valores que no calcen con su tipo mayoritario detectado.'
        : `Columnas con valores que no calzan con su tipo mayoritario detectado: ${columnasConInconsistencias
            .map((columna) => `"${columna.nombre}" (${columna.valoresInconsistentes})`)
            .join(', ')}.`
    )
  );

  contenido.push(
    subtitulo('Valores atípicos (outliers)'),
    texto('Atípico si valor < Q1 - 1.5×IQR o valor > Q3 + 1.5×IQR (IQR = Q3 - Q1), o si |valor - media| > 3×desviación estándar')
  );
  if (datos.outliers.columnasExcluidas.length > 0) {
    contenido.push(
      texto(`Columnas no evaluadas: ${datos.outliers.columnasExcluidas.map((columna) => `"${columna.nombre}" (${columna.motivo})`).join(', ')}.`)
    );
  }
  if (datos.outliers.columnas.length === 0) {
    contenido.push(texto('No hay columnas numéricas para evaluar.'));
    return contenido;
  }
  contenido.push(
    tabla(
      ['Columna', 'Q1', 'Q3', 'Límite inf. (IQR)', 'Límite sup. (IQR)', 'Cant. atípicos'],
      datos.outliers.columnas.map((columna) => [
        columna.columna,
        columna.q1.toFixed(2),
        columna.q3.toFixed(2),
        columna.limiteInferior.toFixed(2),
        columna.limiteSuperior.toFixed(2),
        String(columna.cantidadValoresAtipicos)
      ])
    ),
    texto(interpretarOutliers(datos.outliers))
  );
  return contenido;
}

// 7. Valores faltantes.
function seccionValoresFaltantesGenerico(datos: DatosInformeDataset): BloqueDeInforme[] {
  return [
    tabla(
      ['Columna', 'Faltantes', '% faltante'],
      datos.columnas.map((columna) => [columna.nombre, String(columna.valoresFaltantes), `${columna.porcentajeFaltante.toFixed(1)}%`])
    )
  ];
}

// 8. Limpieza realizada.
function seccionLimpiezaRealizadaGenerico(datos: DatosInformeDataset): BloqueDeInforme[] {
  return [
    texto(
      datos.filasDuplicadas === 0
        ? 'No se detectó ninguna limpieza necesaria: sin filas duplicadas exactas.'
        : `Se detectaron ${datos.filasDuplicadas} fila(s) duplicada(s) exacta(s) (ver sección 6) — SIADE no las ` +
            'elimina ni modifica automáticamente.'
    ),
    texto(
      'SIADE no transforma datos: esta sección reporta únicamente lo que se detectó, no una bitácora de limpieza ' +
        'aplicada — el análisis se ejecuta siempre sobre el dataset tal cual fue importado.'
    )
  ];
}

// 9. Estadística descriptiva.
function seccionEstadisticaDescriptivaGenerico(datos: DatosInformeDataset): BloqueDeInforme[] {
  return [
    texto(
      'Resumen por columna: medidas de tendencia central y dispersión para columnas numéricas, valores más ' +
        'frecuentes para categóricas/texto, y rango para fechas.'
    ),
    tabla(
      ['Columna', 'Tipo', 'Resumen'],
      datos.estadisticasDescriptivas.map((columna) => [columna.nombre, columna.tipo, resumenColumnaComoTexto(columna)])
    )
  ];
}

// 10. Análisis individual de variables — solo los estadísticos de cada
// columna numérica; su histograma va a §12 y su tabla de intervalos a §11
// (en el Word viejo las tres cosas vivían juntas).
function seccionAnalisisIndividualDeVariablesGenerico(datos: DatosInformeDataset): BloqueDeInforme[] {
  const numericas = columnasNumericas(datos);
  if (numericas.length === 0) {
    return [texto('Este dataset no tiene columnas numéricas para analizar individualmente.')];
  }
  return numericas.flatMap((analisis, posicion) => {
    const r = analisis.resumenCincoNumeros;
    const bloque: BloqueDeInforme[] = [
      subtitulo(`10.${posicion + 1} ${analisis.nombre}`),
      texto(`Media = (suma de ${analisis.valoresValidos} valores) / n = ${r.media.toFixed(2)}`),
      texto(
        `Mediana = ${r.mediana.toFixed(2)}, Q1 = ${r.q1.toFixed(2)}, Q3 = ${r.q3.toFixed(2)}, mínimo = ${r.minimo.toFixed(2)}, ` +
          `máximo = ${r.maximo.toFixed(2)}. ${analisis.valoresFaltantes} valor(es) faltante(s) de ${analisis.valoresValidos + analisis.valoresFaltantes}.`
      )
    ];
    if (analisis.desviacionEstandar !== null) {
      bloque.push(texto(`Desviación estándar = ${analisis.desviacionEstandar.toFixed(4)}    CV = ${(analisis.coeficienteVariacion ?? 0).toFixed(2)}%`));
    }
    bloque.push(texto(fraseDeSimetria(analisis)));
    return bloque;
  });
}

// 11. Distribuciones.
function seccionDistribucionesGenerico(datos: DatosInformeDataset): BloqueDeInforme[] {
  const numericas = columnasNumericas(datos);
  if (numericas.length === 0) {
    return [texto('Este dataset no tiene columnas numéricas para calcular distribuciones.')];
  }
  return numericas.flatMap((analisis) => [
    subtitulo(analisis.nombre),
    tabla(
      ['Intervalo', 'Frec. absoluta', 'Frec. relativa (%)', 'Frec. acumulada'],
      analisis.distribucion.map((fila) => [
        fila.intervalo,
        String(fila.frecuenciaAbsoluta),
        `${fila.frecuenciaRelativaPorcentaje.toFixed(1)}%`,
        String(fila.frecuenciaAcumulada)
      ])
    )
  ]);
}

// 12. Visualizaciones — el Word viejo decía "Histograma/Heatmap disponible en
// la versión PDF de este informe" y dejaba solo la tabla de datos. Desde este
// paso las figuras van incrustadas como imagen, igual que las 10 del pipeline
// CVSS: mismas funciones SVG que usa la pantalla, rasterizadas con sharp
// (RasterizadorDeGraficosWord.generarFigurasDeInformeDataset). Galería
// liviana, como la del PDF: título, tipo, figura, epígrafe y una línea de
// interpretación ya calculada — sin el tratamiento de 6 bloques de CVSS.
async function seccionVisualizacionesGenerico(datos: DatosInformeDataset): Promise<BloqueDeInforme[]> {
  const figuras = await generarFigurasDeInformeDataset(datos);
  if (figuras.length === 0) {
    return [texto('Este dataset no generó ninguna figura (sin columnas numéricas).')];
  }

  // generarFigurasDeInformeDataset devuelve un histograma por columna
  // numérica, en el mismo orden, y el heatmap (si existe) al final.
  const numericas = columnasNumericas(datos);

  return figuras.flatMap((dibujo, posicion) => {
    const numero = posicion + 1;
    const analisis = numericas[posicion];
    return [
      subtitulo(`12.${numero} ${dibujo.titulo}`),
      etiquetaTipo('Descriptivo'),
      figura({ ...dibujo, titulo: `Figura ${numero}: ${dibujo.titulo}` }),
      epigrafe(`Figura ${numero}: ${dibujo.titulo}`),
      texto(analisis ? fraseDeSimetria(analisis) : interpretarCorrelacionMasFuerte(datos.matrizCorrelacion))
    ];
  });
}

// 13. Relaciones entre variables — la tabla numérica de la matriz; el heatmap
// en sí es una figura y va a §12.
function seccionRelacionesEntreVariablesGenerico(datos: DatosInformeDataset): BloqueDeInforme[] {
  const matriz = datos.matrizCorrelacion;
  const contenido: BloqueDeInforme[] = [];
  if (matriz.columnasExcluidas.length > 0) {
    contenido.push(texto(`Columnas no incluidas: ${matriz.columnasExcluidas.map((columna) => `"${columna.nombre}" (${columna.motivo})`).join(', ')}.`));
  }
  if (matriz.columnas.length === 0) {
    contenido.push(texto('No hay columnas numéricas elegibles para calcular correlaciones.'));
    return contenido;
  }
  contenido.push(
    tabla(
      ['', ...matriz.columnas],
      matriz.filas.map((fila) => [fila.columna, ...fila.correlaciones.map((celda) => (celda.valor !== null ? celda.valor.toFixed(3) : '—'))])
    ),
    texto(interpretarCorrelacionMasFuerte(matriz)),
    texto('Ver Heatmap de correlación de Pearson en la sección de Visualizaciones.')
  );
  return contenido;
}

// 14. Análisis inferencial.
function seccionAnalisisInferencialGenerico(): BloqueDeInforme[] {
  return [etiquetaTipo('Pendiente'), texto('El sistema no realiza comparación entre grupos sobre datasets genéricos en esta versión.')];
}

// 17. Interpretación — con etiqueta 'Descriptivo', a diferencia de CVSS
// (misma asimetría deliberada que el PDF).
function seccionInterpretacionGenerico(datos: DatosInformeDataset): BloqueDeInforme[] {
  return [etiquetaTipo('Descriptivo'), ...datos.interpretacion.map((parrafo) => vineta(parrafo))];
}

// 18. Conclusiones — sin "Aplicación práctica": ese contenido es propio del
// dominio de vulnerabilidades.
function seccionConclusionesGenerico(datos: DatosInformeDataset): BloqueDeInforme[] {
  return [
    texto(
      'A partir de los hallazgos de la sección anterior, este cierre reúne las limitaciones a tener en cuenta al usar ' +
        'este informe: SIADE diagnostica el dataset tal cual fue importado, sin ajustar el análisis a un caso de uso ' +
        'de negocio específico.'
    ),
    subtitulo('Limitaciones conocidas'),
    ...datos.limitacionesConocidas.map((limitacion) => vineta(limitacion))
  ];
}

// 19. Recomendaciones.
function seccionRecomendacionesGenerico(): BloqueDeInforme[] {
  return bloquesNoAplicable(
    'No existe un caso de uso conocido de antemano para un dataset genérico arbitrario sobre el cual basar una ' +
      'recomendación — a diferencia del dominio de vulnerabilidades, donde "priorizar remediación" es un objetivo ya definido.'
  );
}

// 20. Referencias/anexos — "No aplicable" solo dentro de la subsección
// Referencias; Anexos sí tiene contenido real.
function seccionReferenciasYAnexosGenerico(datos: DatosInformeDataset): BloqueDeInforme[] {
  const anexo = datos.anexoMuestraFilas;
  const contenido: BloqueDeInforme[] = [
    subtitulo('Referencias'),
    ...bloquesNoAplicable(
      'Las referencias citadas en el pipeline de vulnerabilidades (CVSS/NVD) son específicas de ese dominio — un ' +
        'dataset genérico no tiene una fuente bibliográfica fija que citar.'
    ),

    subtitulo('Anexos'),
    texto('Material de respaldo del informe: una muestra cruda de filas del dataset y el índice de las figuras generadas.'),

    subtitulo('Anexo A: Muestra de filas'),
    texto(
      anexo.totalColumnas > anexo.columnasMostradas.length
        ? `Se muestran las primeras ${anexo.columnasMostradas.length} de ${anexo.totalColumnas} columnas y las primeras ` +
            `${anexo.filas.length} de ${anexo.totalFilas} filas, para mantener la tabla legible dentro del ancho de una página.`
        : `Se muestran las primeras ${anexo.filas.length} de ${anexo.totalFilas} filas del dataset.`
    ),
    anexo.filas.length === 0
      ? texto('El dataset no tiene filas.')
      : tabla(
          anexo.columnasMostradas,
          anexo.filas.map((fila) => anexo.columnasMostradas.map((columna) => celdaGenericaComoTexto(fila[columna])))
        ),

    subtitulo('Anexo B: Índice de figuras generadas')
  ];

  const figuras: string[][] = columnasNumericas(datos).map((analisis, posicion) => [String(posicion + 1), `Distribución de "${analisis.nombre}"`]);
  if (datos.matrizCorrelacion.columnas.length > 0) {
    figuras.push([String(figuras.length + 1), 'Heatmap de correlación de Pearson']);
  }
  contenido.push(figuras.length === 0 ? texto('Este dataset no generó ninguna figura (sin columnas numéricas).') : tabla(['#', 'Título'], figuras));

  return contenido;
}

const SECCIONES_GENERICO: Partial<Record<number, (datos: DatosInformeDataset) => BloqueDeInforme[] | Promise<BloqueDeInforme[]>>> = {
  2: seccionResumenEjecutivoGenerico,
  3: seccionDescripcionDatasetGenerico,
  4: seccionNumeroDeRegistrosYVariablesGenerico,
  5: seccionTiposDeVariablesGenerico,
  6: seccionCalidadDeDatosGenerico,
  7: seccionValoresFaltantesGenerico,
  8: seccionLimpiezaRealizadaGenerico,
  9: seccionEstadisticaDescriptivaGenerico,
  10: seccionAnalisisIndividualDeVariablesGenerico,
  11: seccionDistribucionesGenerico,
  12: seccionVisualizacionesGenerico,
  13: seccionRelacionesEntreVariablesGenerico,
  14: seccionAnalisisInferencialGenerico,
  15: seccionPrediccionCvss,
  16: seccionEvaluacionDeModelosCvss,
  17: seccionInterpretacionGenerico,
  18: seccionConclusionesGenerico,
  19: seccionRecomendacionesGenerico,
  20: seccionReferenciasYAnexosGenerico
};

// Único punto del archivo que distingue un pipeline del otro. El default con
// `never` hace que agregar un pipeline a ContextoInformeUniversal sin
// resolverlo acá sea un error de compilación, no una sección vacía.
function portada(contexto: ContextoInformeUniversal): BloqueDeInforme[] {
  switch (contexto.pipeline) {
    case 'cvss':
      return seccionPortadaCvss(contexto.datos);
    case 'generico':
      return seccionPortadaGenerico(contexto.datos);
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

async function cuerpoDeSeccion(numero: number, contexto: ContextoInformeUniversal): Promise<BloqueDeInforme[]> {
  switch (contexto.pipeline) {
    case 'cvss': {
      const cuerpo = SECCIONES_CVSS[numero];
      return cuerpo ? cuerpo(contexto.datos) : [];
    }
    case 'generico': {
      const cuerpo = SECCIONES_GENERICO[numero];
      return cuerpo ? cuerpo(contexto.datos) : [];
    }
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// Orquestador — recorre MAPEO_PLANTILLA_UNIVERSAL_RF130 para decidir
// número/orden/título de cada heading(), igual que renderizarInformeUniversal
// en InformeUniversalRF130.ts (PDF). saltoDePaginaAntes=true solo en la
// primera sección del loop (§2, justo después del índice) — mismo criterio
// que ya tenía el Word viejo para "1. Introducción" (forzar página nueva
// después del/los página(s) del índice).
export async function construirContenidoInforme(contexto: ContextoInformeUniversal): Promise<BloqueDeInforme[]> {
  const contenido: BloqueDeInforme[] = [...portada(contexto), indice()];

  const entradas = MAPEO_PLANTILLA_UNIVERSAL_RF130.filter((entrada) => entrada.numero !== 1);
  for (let i = 0; i < entradas.length; i++) {
    const entrada = entradas[i];
    contenido.push(encabezado(`${entrada.numero}. ${entrada.nombreRF130}`, i === 0));
    contenido.push(...(await cuerpoDeSeccion(entrada.numero, contexto)));
  }

  return contenido;
}
