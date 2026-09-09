import PDFDocument from 'pdfkit';
import { DatosInforme, DatosInformeDataset } from '../../../../application/ports/out/reportes/GeneradorDeInformes';
import { MAPEO_PLANTILLA_UNIVERSAL_RF130 } from '../../../../domain/services/reportes/MapeoPlantillaUniversalRF130';
import { interpretarComposicionDataset, interpretarCorrelacionMasFuerte } from '../../../../domain/services/InterpretadorDeResultadosGenerico';
import { detectarVocabularioDataset } from '../../../../domain/services/reportes/VocabularioDeDominioGenerico';
import { interpretarDispersionCvssDias } from '../../../../domain/services/graphs/InterpretacionDeGraficos';
import { formatearEstadistico } from '../../../../domain/services/inferential-statistics/ComparadorDeCategorias';
import { AnalisisUnivariadoNumerico } from '../../../../domain/services/descriptive-statistics/AnalisisUnivariadoGenerico';
import {
  nuevaSeccion,
  subseccion,
  parrafo,
  formula,
  dibujarTabla,
  dibujarBadge,
  reservarPaginaDeIndice,
  completarIndice,
  numerarPaginas
} from './LayoutInformePdf';
import { dibujarHistograma, dibujarHeatmap } from './DibujoDeGraficosPdf';
import {
  nivelDeRiesgoDesdeCvss,
  construirDefinicionesGraficos,
  resumenColumnaComoTexto,
  celdaComoTexto,
  dibujarEtiquetaTipoAnalisis
} from './GeneradorInformePDF';

// M-10 Ronda 2, Pasada 2-A (RF-130): orquestador nuevo de la plantilla
// universal de 20 secciones. NO ESTÁ CONECTADO al puerto público
// GeneradorDeInformes todavía — el cutover (cambiar generarInformeCompleto/
// generarInformeDataset/etc. para que llamen acá) es el último paso de la
// Pasada 2-C, cuando las 20 secciones estén completas. Hasta entonces, solo
// es alcanzable desde InformeUniversalRF130.test.ts.
//
// DatosInforme/DatosInformeDataset NO se fusionan en un DTO único (decisión
// ya confirmada en el diagnóstico de Ronda 2: "no hay forma honesta de que
// un dataset arbitrario encaje en la forma de Vulnerabilidad"). En su lugar,
// una unión discriminada explícita: hace que un estado inválido (los dos
// presentes, o los dos ausentes) sea IRREPRESENTABLE en el tipo, y permite
// chequeo de exhaustividad (switch + never) en cada función de sección en
// vez de validar presencia/ausencia a mano. Mismo criterio que
// RelacionPlazoReal (MotorDePriorizacion.ts) o EstadoSeccionRF130 (el propio
// mapeo).
export type ContextoInformeUniversal =
  | { pipeline: 'cvss'; datos: DatosInforme }
  | { pipeline: 'generico'; datos: DatosInformeDataset };

type FuncionDeSeccion = (doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal) => void;

// Gris distinto del 'Pendiente' de TipoDeAnalisis (#64748b, ver
// GeneradorInformePDF.ts) — a propósito: son dos ejes conceptuales
// distintos. "Pendiente" (TipoDeAnalisis) responde "¿qué tipo de análisis es
// este contenido?" y vive DENTRO de una sección con datos reales. "No
// aplicable" responde "¿esta sección del documento existe para este tipo de
// dataset?" y reemplaza TODO el cuerpo de la sección (o de una subsección,
// cuando una sección RF-130 agrupa más de un concepto — ver
// dibujarSeccionReferenciasYAnexos).
const COLOR_NO_APLICABLE = '#94a3b8';

// Sección/subsección entera sin contenido aplicable a este pipeline —
// reemplaza el cuerpo, nunca convive con contenido parcial de la misma
// subsección.
function dibujarSeccionNoAplicable(doc: PDFKit.PDFDocument, motivo: string): void {
  dibujarBadge(doc, 'No aplicable', COLOR_NO_APLICABLE);
  parrafo(doc, motivo);
}

// Placeholder temporal para las 9 secciones que todavía no se migraron
// (Pasada 2-B/2-C) — mantiene el documento generable de punta a punta desde
// esta sub-pasada (útil para probar índice/paginación con el esqueleto
// completo), pero NUNCA llega a un analista real: esta función no está
// conectada al puerto público, y cada entrada se borra de SECCIONES a medida
// que su sub-pasada la completa.
function dibujarSeccionEnConstruccion(doc: PDFKit.PDFDocument, numero: number, nombre: string): void {
  parrafo(doc, `Sección "${nombre}" (#${numero}) pendiente de migrar en una sub-pasada posterior de RF-130.`);
}

// ---------------------------------------------------------------------
// 1. Portada — caso especial deliberado: NO pasa por nuevaSeccion() (no
// tiene entrada en el índice), igual que hoy en renderizarPdf/
// renderizarPdfDataset — una portada no es un "capítulo". Por eso vive fuera
// del loop principal de renderizarInformeUniversal en vez de en SECCIONES.
// ---------------------------------------------------------------------
function dibujarSeccionPortada(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss': {
      const datos = contexto.datos;
      doc.fontSize(20).fillColor('#0f172a').font('Times-Bold').text('Informe SEVERA — Análisis Estadístico de Vulnerabilidades', { align: 'center' });
      doc.moveDown(1);
      doc.fontSize(12).fillColor('#334155').font('Times-Bold').text(`Generado por SEVERA para ${datos.generadoPara}`, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#64748b').font('Times-Roman').text(`Generado: ${datos.generadoEn.toLocaleString()}`, { align: 'center' });
      doc.text(`Total de vulnerabilidades analizadas: ${datos.totalVulnerabilidades}`, { align: 'center' });
      doc.moveDown(2);
      return;
    }
    case 'generico': {
      const datos = contexto.datos;
      doc.fontSize(20).fillColor('#0f172a').font('Times-Bold').text('Informe SEVERA — Análisis de Datos General', { align: 'center' });
      doc.moveDown(1);
      doc.fontSize(12).fillColor('#334155').font('Times-Bold').text(`Generado por SEVERA para ${datos.generadoPara}`, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#64748b').font('Times-Roman').text(`Generado: ${datos.generadoEn.toLocaleString()}`, { align: 'center' });
      doc.text(`${datos.totalFilas} fila(s) — ${datos.totalColumnas} columna(s)`, { align: 'center' });
      doc.moveDown(2);
      return;
    }
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// ---------------------------------------------------------------------
// 3. Descripción del dataset — CVSS: cuerpo trasladado de
// dibujarOrganizacionDeDatos (GeneradorInformePDF.ts), con resumido=false
// fijo (este documento nunca es la versión resumida — esa sigue siendo
// exclusiva de generarResumenEjecutivo, fuera de este archivo). Genérico:
// cuerpo trasladado de dibujarDescripcionDataset, PERO CORREGIDO respecto al
// hallazgo colateral encontrado en la auditoría de esta pasada — la función
// vieja llama interpretarComposicionDataset(datos) sin vocabulario (siempre
// usa el default neutro "fila(s)"), a diferencia de Conclusiones, que sí lo
// deriva. Acá se deriva correctamente. No se toca dibujarDescripcionDataset
// (código vivo, fuera de alcance) — esta función nace ya consistente.
// ---------------------------------------------------------------------
function dibujarSeccionDescripcionDataset(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss': {
      const datos = contexto.datos;
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
          .slice(0, 10)
          .map((fila) => [fila.cve, fila.software, fila.cvssScore.toFixed(1), fila.severidad, fila.tipoAcceso, fila.estadoRemediacion]),
        anchos
      );

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
      return;
    }
    case 'generico': {
      const datos = contexto.datos;
      const vocabulario = detectarVocabularioDataset(datos.columnas.map((columna) => columna.nombre));
      parrafo(doc, interpretarComposicionDataset(datos, vocabulario));

      dibujarTabla(
        doc,
        ['Columna', 'Tipo detectado', 'Faltantes', '% faltante', 'Únicos'],
        datos.columnas.map((columna) => [
          columna.nombre,
          columna.tipo,
          String(columna.valoresFaltantes),
          `${columna.porcentajeFaltante.toFixed(1)}%`,
          String(columna.valoresUnicos)
        ]),
        [150, 90, 70, 80, 70]
      );
      return;
    }
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// ---------------------------------------------------------------------
// 4. Número de registros/variables — M-10 Ronda 2, Pasada 2-B: callout
// dedicado y corto, distinto de la prosa de §3 (que ya menciona el total
// como parte de una oración más larga) — mismos campos ya calculados en
// ambos pipelines, sin ningún cálculo nuevo. CVSS: "variables" = los 8
// campos fijos del esquema, ya enumerados en §3 (Vulnerabilidad no expone
// un conteo propio porque no lo necesita — el esquema es una lista fija de
// nombres, no algo que se cuenta en tiempo de ejecución). Genérico:
// totalFilas/totalColumnas ya calculados por RecopilarDatosDeInformeDataset.
// ---------------------------------------------------------------------
function dibujarSeccionNumeroDeRegistrosYVariables(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss': {
      const datos = contexto.datos;
      parrafo(
        doc,
        `${datos.totalVulnerabilidades} registro(s). El esquema es fijo, con 8 variables (campos): CVE, Software, ` +
          'CVSS Score, Severidad, Tipo de Vulnerabilidad, Acceso Remoto, Estado de Remediación y Fecha de carga.'
      );
      return;
    }
    case 'generico': {
      const datos = contexto.datos;
      parrafo(doc, `${datos.totalFilas} registro(s) y ${datos.totalColumnas} variable(s) (columnas).`);
      return;
    }
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// ---------------------------------------------------------------------
// 5. Tipos de variables — no aplica a CVSS (esquema fijo conocido de
// antemano, no hay tipos que detectar). Genérico: extraído de la tabla de
// §3 (columna "Tipo detectado" + un resumen de composición por tipo).
// ---------------------------------------------------------------------
function dibujarSeccionTiposDeVariables(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss':
      dibujarSeccionNoAplicable(
        doc,
        'El esquema de una Vulnerabilidad es fijo y conocido de antemano (CVE, CVSS Score, Severidad, Tipo de ' +
          'Vulnerabilidad, Acceso Remoto, Estado de Remediación, Fecha de carga) — no hay tipos de columna que ' +
          'detectar, a diferencia de un dataset genérico de columnas arbitrarias.'
      );
      return;
    case 'generico': {
      const datos = contexto.datos;
      const conteoPorTipo = new Map<string, number>();
      datos.columnas.forEach((columna) => conteoPorTipo.set(columna.tipo, (conteoPorTipo.get(columna.tipo) ?? 0) + 1));
      const composicion = [...conteoPorTipo.entries()].map(([tipo, cantidad]) => `${cantidad} ${tipo}`).join(', ');
      parrafo(doc, `Composición por tipo detectado: ${composicion}.`);

      dibujarTabla(
        doc,
        ['Columna', 'Tipo detectado'],
        datos.columnas.map((columna) => [columna.nombre, columna.tipo]),
        [250, 200]
      );
      return;
    }
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// ---------------------------------------------------------------------
// 6. Calidad de datos — CVSS: cuerpo trasladado de dibujarOrigenYCalidad
// (auditoría de importación — no hay diagnóstico estadístico posible sobre
// un esquema fijo). Genérico: cuerpo trasladado de dibujarCalidadDatosDataset
// completo, sin recortar (ver nota sobre superposición con §7/§8 en el
// resumen de la implementación).
// ---------------------------------------------------------------------
function dibujarSeccionCalidadDeDatos(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss': {
      const datos = contexto.datos;
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
        'SEVERA no conserva el motivo de cada fila rechazada más allá de la respuesta inmediata de esa importación — ' +
          'solo el conteo agregado (importados/rechazados) queda registrado en el historial de auditoría.'
      );
      return;
    }
    case 'generico': {
      const datos = contexto.datos;
      formula(doc, '% faltante = (valores faltantes de la columna / total de filas) × 100');
      parrafo(
        doc,
        datos.filasDuplicadas === 0
          ? 'No se detectaron filas duplicadas exactas.'
          : `Se detectaron ${datos.filasDuplicadas} fila(s) duplicada(s) exacta(s) (copias exactas de otra fila ya presente).`
      );

      const peorColumna = [...datos.columnas].sort((a, b) => b.porcentajeFaltante - a.porcentajeFaltante)[0];
      if (peorColumna && peorColumna.porcentajeFaltante > 0) {
        parrafo(
          doc,
          `La columna con más valores faltantes es "${peorColumna.nombre}": ${peorColumna.valoresFaltantes} de ${datos.totalFilas} ` +
            `(${peorColumna.porcentajeFaltante.toFixed(1)}%).`
        );
      } else {
        parrafo(doc, 'Ninguna columna tiene valores faltantes.');
      }

      const columnasConInconsistencias = datos.columnas.filter((columna) => columna.valoresInconsistentes > 0);
      parrafo(
        doc,
        columnasConInconsistencias.length === 0
          ? 'Ninguna columna tiene valores que no calcen con su tipo mayoritario detectado.'
          : `Columnas con valores que no calzan con su tipo mayoritario detectado: ${columnasConInconsistencias
              .map((columna) => `"${columna.nombre}" (${columna.valoresInconsistentes})`)
              .join(', ')}.`
      );
      return;
    }
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// ---------------------------------------------------------------------
// 7. Valores faltantes — no aplica a CVSS (esquema fijo, sin faltantes por
// diseño). Genérico: tabla dedicada (Columna/Faltantes/% faltante) — mismos
// campos ya calculados que la tabla de §3, sin repetir la frase de "columna
// con más valores faltantes" que ya dice §6 (evita duplicar la misma
// oración dos veces en el mismo documento).
// ---------------------------------------------------------------------
function dibujarSeccionValoresFaltantes(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss':
      dibujarSeccionNoAplicable(
        doc,
        'El esquema fijo de Vulnerabilidad no admite valores faltantes por diseño — todos los campos se validan al importar.'
      );
      return;
    case 'generico': {
      const datos = contexto.datos;
      dibujarTabla(
        doc,
        ['Columna', 'Faltantes', '% faltante'],
        datos.columnas.map((columna) => [columna.nombre, String(columna.valoresFaltantes), `${columna.porcentajeFaltante.toFixed(1)}%`]),
        [200, 120, 120]
      );
      return;
    }
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// ---------------------------------------------------------------------
// 8. Limpieza realizada — no aplica a CVSS (SEVERA no transforma datos de
// vulnerabilidades). Genérico: SEVERA tampoco transforma datos genéricos —
// solo se reporta el CONTEO de duplicados ya detectado, con la aclaración
// explícita de que no hay una bitácora de limpieza real (nota ya redactada
// y confirmada en el mapeo de RF-130).
// ---------------------------------------------------------------------
function dibujarSeccionLimpiezaRealizada(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss':
      dibujarSeccionNoAplicable(doc, 'SEVERA no transforma datos de vulnerabilidades — solo diagnostica lo que se importa tal cual.');
      return;
    case 'generico': {
      const datos = contexto.datos;
      parrafo(
        doc,
        datos.filasDuplicadas === 0
          ? 'No se detectó ninguna limpieza necesaria: sin filas duplicadas exactas.'
          : `Se detectaron ${datos.filasDuplicadas} fila(s) duplicada(s) exacta(s) (ver sección 6) — SEVERA no las ` +
            'elimina ni modifica automáticamente.'
      );
      parrafo(
        doc,
        'SEVERA no transforma datos: esta sección reporta únicamente lo que se detectó, no una bitácora de limpieza ' +
          'aplicada — el análisis se ejecuta siempre sobre el dataset tal cual fue importado.'
      );
      return;
    }
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// ---------------------------------------------------------------------
// 9. Estadística descriptiva — CVSS: fusiona dibujarTendenciaCentral +
// dibujarVariabilidad (dos secciones separadas hoy) en una sola, como dos
// subsecciones de primer nivel — subseccion() no soporta un segundo nivel de
// jerarquía visual, así que "Media aritmética"/"Mediana"/etc. quedan al
// mismo nivel tipográfico que "Tendencia central"/"Variabilidad" (mismo
// límite que ya tenían los primitivos existentes, no una regresión nueva).
// Genérico: reuso directo de dibujarEstadisticasDescriptivasDataset.
// ---------------------------------------------------------------------
function dibujarSeccionEstadisticaDescriptiva(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss': {
      const datos = contexto.datos;
      const r = datos.resumenEstadistico;
      const n = datos.totalVulnerabilidades;
      const suma = r.media * n;

      subseccion(doc, 'Tendencia central');
      parrafo(doc, 'Estas medidas indican dónde se concentra típicamente la severidad (CVSS Score) del conjunto analizado.');

      subseccion(doc, 'Media aritmética');
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

      subseccion(doc, 'Variabilidad');
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
              'justifica comparar por subgrupos en vez de tratar el conjunto como homogéneo.'
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
      return;
    }
    case 'generico': {
      const datos = contexto.datos;
      parrafo(
        doc,
        'Resumen por columna: medidas de tendencia central y dispersión para columnas numéricas, valores más ' +
          'frecuentes para categóricas/texto, y rango para fechas.'
      );

      dibujarTabla(
        doc,
        ['Columna', 'Tipo', 'Resumen'],
        datos.estadisticasDescriptivas.map((columna) => [columna.nombre, columna.tipo, resumenColumnaComoTexto(columna)]),
        [130, 70, 260]
      );
      return;
    }
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// Type-guard compartido por §10/§11/§12 (genérico): datos.analisisUnivariado
// hoy solo contiene columnas numéricas (RecopilarDatosDeInformeDataset.ts ya
// filtra antes de calcular), pero el tipo sigue siendo la unión completa
// (AnalisisUnivariadoNumerico | Categorico | Fecha) — el narrowing hace
// falta para acceder a resumenCincoNumeros/distribucion sin castear a mano.
function columnasNumericas(datos: DatosInformeDataset): AnalisisUnivariadoNumerico[] {
  return datos.analisisUnivariado.filter((analisis): analisis is AnalisisUnivariadoNumerico => analisis.tipo === 'numerica');
}

// ---------------------------------------------------------------------
// 10. Análisis individual de variables — no aplica a CVSS (CVSS Score es la
// única variable continua del esquema, ya cubierta en detalle en
// Estadística descriptiva — no hay múltiples variables que analizar una por
// una). Genérico: cuerpo trasladado de dibujarAnalisisUnivariadoDataset,
// PERO SIN el dibujo del histograma (dibujarHistograma) — esa parte se
// separa a Visualizaciones (§12), esta sección se queda solo con los
// estadísticos de cada columna. Hoy ambas cosas viven en la misma
// función/loop; esta es la reestructuración real de esta pasada.
// ---------------------------------------------------------------------
function dibujarSeccionAnalisisIndividualDeVariables(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss':
      dibujarSeccionNoAplicable(
        doc,
        'CVSS Score es la única variable continua del esquema fijo de Vulnerabilidad, y ya se cubre en detalle en la ' +
          'sección de Estadística descriptiva — no hay múltiples variables numéricas que analizar una por una.'
      );
      return;
    case 'generico': {
      const datos = contexto.datos;
      const numericas = columnasNumericas(datos);
      if (numericas.length === 0) {
        parrafo(doc, 'Este dataset no tiene columnas numéricas para analizar individualmente.');
        return;
      }
      numericas.forEach((analisis, indice) => {
        const r = analisis.resumenCincoNumeros;
        subseccion(doc, `${indice + 1}. ${analisis.nombre}`);
        formula(doc, `Media = (suma de ${analisis.valoresValidos} valores) / n = ${r.media.toFixed(2)}`);
        parrafo(
          doc,
          `Mediana = ${r.mediana.toFixed(2)}, Q1 = ${r.q1.toFixed(2)}, Q3 = ${r.q3.toFixed(2)}, mínimo = ${r.minimo.toFixed(2)}, ` +
            `máximo = ${r.maximo.toFixed(2)}. ${analisis.valoresFaltantes} valor(es) faltante(s) de ${analisis.valoresValidos + analisis.valoresFaltantes}.`
        );
        if (analisis.desviacionEstandar !== null) {
          formula(doc, `Desviación estándar = ${analisis.desviacionEstandar.toFixed(4)}    CV = ${(analisis.coeficienteVariacion ?? 0).toFixed(2)}%`);
        }
        const diferencia = Math.abs(r.media - r.mediana);
        parrafo(
          doc,
          diferencia < r.media * 0.05 || diferencia < 0.5
            ? `La media y la mediana están cerca, lo que sugiere una distribución relativamente simétrica para "${analisis.nombre}".`
            : `La media (${r.media.toFixed(2)}) se aleja de la mediana (${r.mediana.toFixed(2)}) en "${analisis.nombre}", lo que sugiere asimetría o presencia de valores extremos.`
        );
      });
      return;
    }
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// ---------------------------------------------------------------------
// 11. Distribuciones — CVSS: cuerpo trasladado de dibujarDistribucionDeDatos
// (reuso directo, sin reestructurar — ya eran tablas, sin gráfico embebido).
// Genérico: tabla de intervalos agrupados por columna numérica, extraída de
// analisis.distribucion (TablaFrecuencia[], ya calculada por
// AnalisisUnivariadoGenerico.ts) — mismo dato que antes alimentaba el
// histograma de dibujarAnalisisUnivariadoDataset, ahora mostrado como tabla
// en vez de (o además de, en Visualizaciones) figura.
// ---------------------------------------------------------------------
function dibujarSeccionDistribuciones(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss': {
      const datos = contexto.datos;
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
      return;
    }
    case 'generico': {
      const datos = contexto.datos;
      const numericas = columnasNumericas(datos);
      if (numericas.length === 0) {
        parrafo(doc, 'Este dataset no tiene columnas numéricas para calcular distribuciones.');
        return;
      }
      numericas.forEach((analisis) => {
        subseccion(doc, analisis.nombre);
        dibujarTabla(
          doc,
          ['Intervalo', 'Frec. absoluta', 'Frec. relativa (%)', 'Frec. acumulada'],
          analisis.distribucion.map((fila) => [
            fila.intervalo,
            String(fila.frecuenciaAbsoluta),
            `${fila.frecuenciaRelativaPorcentaje.toFixed(1)}%`,
            String(fila.frecuenciaAcumulada)
          ]),
          [110, 110, 130, 110]
        );
      });
      return;
    }
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// ---------------------------------------------------------------------
// 12. Visualizaciones — la pieza más grande de esta pasada. CVSS: reuso
// directo de dibujarGraficos (los 10 gráficos con su tratamiento de 6
// bloques ya existente). Genérico: NO existe hoy una galería consolidada —
// los gráficos están dispersos (histograma dentro de
// dibujarAnalisisUnivariadoDataset, heatmap dentro de
// dibujarCorrelacionDataset). Se construye acá una galería nueva, pero
// DELIBERADAMENTE liviana: título + badge + figura + UNA línea de
// interpretación ya calculada en otro lado (la misma frase de simetría que
// usaba dibujarAnalisisUnivariadoDataset, la misma interpretarCorrelacionMasFuerte
// que usaba dibujarCorrelacionDataset) — sin inventar el tratamiento de 6
// bloques (Objetivo/Fundamento/Relación/Funcionamiento del algoritmo/Análisis)
// que tiene CVSS, porque esa prosa adicional sería contenido narrativo
// nuevo, fuera del alcance de esta pasada (eso es 2-C, si corresponde).
// ---------------------------------------------------------------------
function dibujarSeccionVisualizaciones(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss': {
      const datos = contexto.datos;
      const definiciones = construirDefinicionesGraficos(datos);
      definiciones.forEach((definicion) => {
        doc.addPage();
        doc.fontSize(12).font('Times-Bold').fillColor('#0f172a').text(`12.${definicion.numero} Gráfico ${definicion.numero}: ${definicion.titulo}`);
        doc.moveDown(0.3);
        dibujarEtiquetaTipoAnalisis(doc, definicion.tipo);

        doc.fontSize(9.5).font('Times-Bold').fillColor('#1e293b').text('Objetivo del gráfico: ', { continued: true });
        doc.font('Times-Roman').fillColor('#334155').text(definicion.objetivo);

        doc.font('Times-Bold').fillColor('#1e293b').text('Fundamento estadístico: ', { continued: true });
        doc.font('Times-Roman').fillColor('#334155').text(definicion.fundamento);

        doc.font('Times-Bold').fillColor('#1e293b').text('Relación con secciones anteriores: ', { continued: true });
        doc.font('Times-Roman').fillColor('#334155').text(definicion.relacion);
        doc.moveDown(0.5);

        definicion.dibujar(doc);
        doc.moveDown(0.5);

        doc.fontSize(9.5).font('Times-Bold').fillColor('#1e293b').text('Funcionamiento del algoritmo: ', { continued: true });
        doc
          .font('Times-Roman')
          .fillColor('#334155')
          .text(
            'los datos se calculan a partir del conjunto completo de vulnerabilidades vigente al generar el informe y ' +
              'se posicionan geométricamente antes de dibujarse — sin pasos manuales ni aproximaciones visuales.'
          );

        doc.fontSize(9.5).font('Times-Bold').fillColor('#1e293b').text('Análisis de resultados y conclusiones:');
        definicion.analisis(doc);
      });
      return;
    }
    case 'generico': {
      const datos = contexto.datos;
      const numericas = columnasNumericas(datos);
      let numeroFigura = 0;

      numericas.forEach((analisis) => {
        numeroFigura += 1;
        const r = analisis.resumenCincoNumeros;
        doc.addPage();
        doc.fontSize(12).font('Times-Bold').fillColor('#0f172a').text(`12.${numeroFigura} Distribución de "${analisis.nombre}"`);
        doc.moveDown(0.3);
        dibujarEtiquetaTipoAnalisis(doc, 'Descriptivo');

        doc.y = dibujarHistograma(
          doc,
          analisis.distribucion.map((bin) => ({ intervalo: bin.intervalo, frecuencia: bin.frecuenciaAbsoluta })),
          r.media,
          r.mediana,
          { titulo: `Distribución de "${analisis.nombre}"`, etiquetaEjeX: analisis.nombre, etiquetaEjeY: 'Frecuencia' }
        );
        doc.moveDown(0.5);

        const diferencia = Math.abs(r.media - r.mediana);
        parrafo(
          doc,
          diferencia < r.media * 0.05 || diferencia < 0.5
            ? `La media y la mediana están cerca, lo que sugiere una distribución relativamente simétrica para "${analisis.nombre}".`
            : `La media (${r.media.toFixed(2)}) se aleja de la mediana (${r.mediana.toFixed(2)}) en "${analisis.nombre}", lo que sugiere asimetría o presencia de valores extremos.`
        );
      });

      if (datos.matrizCorrelacion.columnas.length > 0) {
        numeroFigura += 1;
        doc.addPage();
        doc.fontSize(12).font('Times-Bold').fillColor('#0f172a').text(`12.${numeroFigura} Heatmap de correlación de Pearson`);
        doc.moveDown(0.3);
        dibujarEtiquetaTipoAnalisis(doc, 'Descriptivo');

        doc.y = dibujarHeatmap(doc, datos.matrizCorrelacion, { titulo: 'Heatmap de correlación de Pearson' });
        doc.moveDown(0.5);
        parrafo(doc, interpretarCorrelacionMasFuerte(datos.matrizCorrelacion));
      }

      if (numeroFigura === 0) {
        parrafo(doc, 'Este dataset no generó ninguna figura (sin columnas numéricas).');
      }
      return;
    }
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// ---------------------------------------------------------------------
// 13. Relaciones entre variables — CVSS: extrae el coeficiente de Pearson y
// su interpretación del Gráfico 7 (Relación CVSS/Días para Parche), dejando
// la FIGURA en Visualizaciones (§12, reuso directo de construirDefinicionesGraficos
// — no se duplica el dibujo, solo el texto). Genérico: separa la TABLA
// numérica de la matriz (contenido nuevo — hoy no existe ninguna
// representación tabular de la matriz, solo el heatmap visual; se construye
// acá con datos ya calculados, sin ningún cálculo nuevo) del HEATMAP en sí,
// que se mueve a §12.
// ---------------------------------------------------------------------
function dibujarSeccionRelacionesEntreVariables(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss': {
      const datos = contexto.datos;
      const dispersion = datos.graficos.dispersionCvssDias;
      parrafo(
        doc,
        `Coeficiente de correlación de Pearson entre CVSS Score y Días para Parche: r = ${dispersion.correlacion.toFixed(3)} ` +
          '(ver Gráfico 7 en la sección de Visualizaciones).'
      );
      parrafo(doc, interpretarDispersionCvssDias(dispersion));
      return;
    }
    case 'generico': {
      const datos = contexto.datos;
      const matriz = datos.matrizCorrelacion;
      if (matriz.columnasExcluidas.length > 0) {
        parrafo(
          doc,
          `Columnas no incluidas: ${matriz.columnasExcluidas.map((columna) => `"${columna.nombre}" (${columna.motivo})`).join(', ')}.`
        );
      }
      if (matriz.columnas.length === 0) {
        parrafo(doc, 'No hay columnas numéricas elegibles para calcular correlaciones.');
        return;
      }
      dibujarTabla(
        doc,
        ['', ...matriz.columnas],
        matriz.filas.map((fila) => [fila.columna, ...fila.correlaciones.map((celda) => (celda.valor !== null ? celda.valor.toFixed(3) : '—'))])
      );
      parrafo(doc, interpretarCorrelacionMasFuerte(matriz));
      parrafo(doc, 'Ver Heatmap de correlación de Pearson en la sección de Visualizaciones.');
      return;
    }
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// ---------------------------------------------------------------------
// 14. Análisis inferencial — CVSS: extrae la comparación Remoto/Local de
// "Aplicación práctica" (pregunta 3, ya con badge 'Inferencial' desde
// Pasada 1) a esta sección propia — el resto de Aplicación práctica (nivel
// típico de riesgo, % urgente, tiempo de parche, ranking) NO tiene slot
// propio en RF-130 y queda fuera del alcance de esta pasada (decisión ya
// señalada en el diagnóstico: se resuelve en 2-C junto con Conclusiones).
// dibujarAplicacionPractica (código vivo) NO se toca — sigue mostrando las
// 4 preguntas tal cual, esta función reconstruye la misma lógica de forma
// independiente a partir de datos.comparacionAccesoRemotoLocal. Genérico: ya
// resuelto en Pasada 1 (dibujarConclusionesDataset), reuso directo.
// ---------------------------------------------------------------------
function dibujarSeccionAnalisisInferencial(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss': {
      const datos = contexto.datos;
      const remotoVsLocal = datos.comparacionAccesoRemotoLocal;
      dibujarEtiquetaTipoAnalisis(doc, 'Inferencial');
      parrafo(
        doc,
        `Media CVSS remoto = ${formatearEstadistico(remotoVsLocal.mediaA)}, local = ${formatearEstadistico(remotoVsLocal.mediaB)} ` +
          `(diferencia de ${formatearEstadistico(remotoVsLocal.diferenciaMedias)} puntos). Comparación descriptiva de medias, ` +
          'sin prueba de hipótesis formal.'
      );
      return;
    }
    case 'generico':
      dibujarEtiquetaTipoAnalisis(doc, 'Pendiente');
      parrafo(doc, 'El sistema no realiza comparación entre grupos sobre datasets genéricos en esta versión.');
      return;
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// ---------------------------------------------------------------------
// 15/16. Predicción / Evaluación de modelos — mismo motivo en ambos
// pipelines (M-16 bloqueado, no depende del tipo de dataset cargado): badge
// 'Pendiente' de TipoDeAnalisis (no dibujarSeccionNoAplicable — este eje es
// "va a existir cuando se desbloquee M-16", no "nunca va a aplicar").
// Contenido idéntico en las dos ramas del switch a propósito: se mantiene el
// chequeo de exhaustividad por consistencia con el resto de las funciones de
// sección, aunque acá no cambie nada entre pipelines.
// ---------------------------------------------------------------------
function dibujarSeccionPrediccion(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss':
    case 'generico':
      dibujarEtiquetaTipoAnalisis(doc, 'Pendiente');
      parrafo(
        doc,
        'M-16 (Predicción y Modelado) está pendiente de material académico antes de implementar o sugerir cualquier ' +
          'método (ver IMotorPrediccion.ts).'
      );
      return;
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

function dibujarSeccionEvaluacionDeModelos(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss':
    case 'generico':
      dibujarEtiquetaTipoAnalisis(doc, 'Pendiente');
      parrafo(doc, 'Misma dependencia que la sección de Predicción — no hay modelos que evaluar sin M-16.');
      return;
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// ---------------------------------------------------------------------
// 19. Recomendaciones — CVSS: subsección trasladada de dibujarConclusiones.
// Genérico: no aplica (decisión ya documentada — no hay caso de uso
// conocido de antemano para un dataset arbitrario sobre el cual recomendar).
// ---------------------------------------------------------------------
function dibujarSeccionRecomendaciones(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss':
      parrafo(
        doc,
        'Priorizar la remediación siguiendo el ranking de urgencia, dando prioridad adicional a las vulnerabilidades ' +
          'de acceso remoto y a las de mayor tiempo de exposición sin parche disponible.'
      );
      return;
    case 'generico':
      dibujarSeccionNoAplicable(
        doc,
        'No existe un caso de uso conocido de antemano para un dataset genérico arbitrario sobre el cual basar una ' +
          'recomendación — a diferencia del dominio de vulnerabilidades, donde "priorizar remediación" es un objetivo ya definido.'
      );
      return;
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// ---------------------------------------------------------------------
// 20. Referencias/anexos — fusiona 2 secciones separadas de hoy (Referencias
// + Anexos) en una, como 2 subsecciones. Genérico: Anexos tiene contenido
// real (trasladado de dibujarAnexosDataset); Referencias es "No aplicable"
// — el badge se dibuja DENTRO de la subsección "Referencias", sin afectar
// el contenido real de "Anexos" que sigue después.
// ---------------------------------------------------------------------
function dibujarSeccionReferenciasYAnexos(doc: PDFKit.PDFDocument, contexto: ContextoInformeUniversal): void {
  switch (contexto.pipeline) {
    case 'cvss': {
      const datos = contexto.datos;

      subseccion(doc, 'Referencias');
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

      subseccion(doc, 'Anexos');
      parrafo(
        doc,
        'Material de respaldo que sustenta los resultados del informe: el dataset completo (o una muestra ' +
          'representativa, si excede el límite razonable de este anexo), la tabla de frecuencias sin agrupar en su ' +
          'versión íntegra y el índice de las figuras generadas.'
      );

      subseccion(doc, 'Anexo A: Dataset completo');
      const anexoDataset = datos.anexoDataset;
      parrafo(
        doc,
        anexoDataset.esMuestra
          ? `El dataset completo tiene ${anexoDataset.tamanoOriginal} registros, más de lo que este anexo puede listar ` +
            `de forma legible. Se muestran ${anexoDataset.filas.length} registros seleccionados por muestreo ` +
            'sistemático (espaciado uniforme sobre el total, no solo los primeros casos cargados).'
          : `Se listan los ${anexoDataset.filas.length} registros completos del dataset analizado.`
      );
      dibujarTabla(
        doc,
        ['CVE', 'Software', 'CVSS', 'Severidad', 'Acceso', 'Estado'],
        anexoDataset.filas.map((fila) => [fila.cve, fila.software, fila.cvssScore.toFixed(1), fila.severidad, fila.tipoAcceso, fila.estadoRemediacion]),
        [90, 140, 40, 55, 55, 70]
      );

      subseccion(doc, 'Anexo B: Tabla sin agrupar completa');
      parrafo(doc, `Los ${datos.distribucionSinAgrupar.length} valores únicos de CVSS Score, con su frecuencia.`);
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
      return;
    }
    case 'generico': {
      const datos = contexto.datos;

      subseccion(doc, 'Referencias');
      dibujarSeccionNoAplicable(
        doc,
        'Las referencias citadas en el pipeline de vulnerabilidades (CVSS/NVD) son específicas de ese dominio — un ' +
          'dataset genérico no tiene una fuente bibliográfica fija que citar.'
      );

      subseccion(doc, 'Anexos');
      parrafo(doc, 'Material de respaldo del informe: una muestra cruda de filas del dataset y el índice de las figuras generadas.');

      subseccion(doc, 'Anexo A: Muestra de filas');
      const anexo = datos.anexoMuestraFilas;
      parrafo(
        doc,
        anexo.totalColumnas > anexo.columnasMostradas.length
          ? `Se muestran las primeras ${anexo.columnasMostradas.length} de ${anexo.totalColumnas} columnas y las primeras ` +
            `${anexo.filas.length} de ${anexo.totalFilas} filas, para mantener la tabla legible dentro del ancho de una página.`
          : `Se muestran las primeras ${anexo.filas.length} de ${anexo.totalFilas} filas del dataset.`
      );
      if (anexo.filas.length === 0) {
        parrafo(doc, 'El dataset no tiene filas.');
      } else {
        dibujarTabla(
          doc,
          anexo.columnasMostradas,
          anexo.filas.map((fila) => anexo.columnasMostradas.map((columna) => celdaComoTexto(fila[columna])))
        );
      }

      subseccion(doc, 'Anexo B: Índice de figuras generadas');
      const figuras: string[][] = [
        ...datos.analisisUnivariado
          .filter((analisis) => analisis.tipo === 'numerica')
          .map((analisis, indice): [string, string] => [String(indice + 1), `Distribución de "${analisis.nombre}"`])
      ];
      if (datos.matrizCorrelacion.columnas.length > 0) {
        figuras.push([String(figuras.length + 1), 'Heatmap de correlación de Pearson']);
      }
      if (figuras.length === 0) {
        parrafo(doc, 'Este dataset no generó ninguna figura (sin columnas numéricas).');
      } else {
        dibujarTabla(doc, ['#', 'Título'], figuras, [40, 400]);
      }
      return;
    }
    default: {
      const exhaustivo: never = contexto;
      throw new Error(`Pipeline no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

// Mapa numero RF-130 -> función de sección. Solo las 10 de Pasada 2-A tienen
// entrada acá — el resto cae en dibujarSeccionEnConstruccion hasta que
// 2-B/2-C las agregue. La sección 1 (Portada) NO va acá — se dibuja aparte,
// antes del loop (ver renderizarInformeUniversal).
const SECCIONES: Partial<Record<number, FuncionDeSeccion>> = {
  3: dibujarSeccionDescripcionDataset,
  4: dibujarSeccionNumeroDeRegistrosYVariables,
  5: dibujarSeccionTiposDeVariables,
  6: dibujarSeccionCalidadDeDatos,
  7: dibujarSeccionValoresFaltantes,
  8: dibujarSeccionLimpiezaRealizada,
  9: dibujarSeccionEstadisticaDescriptiva,
  10: dibujarSeccionAnalisisIndividualDeVariables,
  11: dibujarSeccionDistribuciones,
  12: dibujarSeccionVisualizaciones,
  13: dibujarSeccionRelacionesEntreVariables,
  14: dibujarSeccionAnalisisInferencial,
  15: dibujarSeccionPrediccion,
  16: dibujarSeccionEvaluacionDeModelos,
  19: dibujarSeccionRecomendaciones,
  20: dibujarSeccionReferenciasYAnexos
};

// Orquestador — recorre MAPEO_PLANTILLA_UNIVERSAL_RF130 para decidir número
// y título de cada nuevaSeccion(): el mapeo pasa a ser la fuente real del
// orden del documento, no solo documentación auditada. NO CONECTADO al
// puerto público GeneradorDeInformes — sin ruta HTTP, sin controller, sin
// registro en container.ts. Solo alcanzable desde InformeUniversalRF130.test.ts
// hasta el cutover explícito de la Pasada 2-C.
export function renderizarInformeUniversal(contexto: ContextoInformeUniversal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 72, size: 'LETTER', bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    dibujarSeccionPortada(doc, contexto);
    const paginaIndice = reservarPaginaDeIndice(doc);

    MAPEO_PLANTILLA_UNIVERSAL_RF130.filter((entrada) => entrada.numero !== 1).forEach((entrada) => {
      nuevaSeccion(doc, String(entrada.numero), entrada.nombreRF130);
      const dibujarCuerpo = SECCIONES[entrada.numero];
      if (dibujarCuerpo) {
        dibujarCuerpo(doc, contexto);
      } else {
        dibujarSeccionEnConstruccion(doc, entrada.numero, entrada.nombreRF130);
      }
    });

    completarIndice(doc, paginaIndice);
    numerarPaginas(doc);
    doc.end();
  });
}
