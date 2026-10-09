import { DatosInformeDataset, OperacionDeLimpiezaEnInforme } from '../../../../application/ports/out/reportes/GeneradorDeInformes';
import { ETIQUETA_DE_TIPO_DETALLADO } from '../../../../domain/services/variable-detection/DetectorDeTipoDeColumna';
import { formatearMomento } from './FormatoDeFechasInforme';

// Lo que el informe genérico dice sobre de dónde salen sus datos y qué
// decisiones del analista los afectan: la sección 8 "Limpieza realizada"
// (RF-120 a RF-123, RF-136), las correcciones de tipo (RF-111) y la variable
// objetivo (RF-110).
//
// Vive en un archivo aparte porque el informe tiene dos renderers (el PDF
// dibuja con pdfkit, los demás formatos salen de bloques neutros) y los dos
// tienen que decir exactamente lo mismo: acá se arma el contenido como texto
// y tablas simples, y cada renderer solo lo dibuja.

const ETIQUETA_DE_OPERACION: Record<OperacionDeLimpiezaEnInforme['operacion'], string> = {
  eliminar_registros: 'Eliminación de registros',
  eliminar_columna: 'Eliminación de la variable',
  imputar: 'Imputación'
};

// Hasta 4 decimales, sin ceros de relleno: 30 -> "30", 1.25 -> "1.25",
// 37.77777 -> "37.7778".
function valorComoTexto(valor: number | string | boolean): string {
  return typeof valor === 'number' ? String(Number(valor.toFixed(4))) : String(valor);
}

// Con la preposición incluida, para que no quede "a partir de el dataset".
function deLaVersion(version: number | null): string {
  if (version === null) return 'de una versión anterior';
  return version === 0 ? 'del dataset original' : `de la versión ${version}`;
}

// "del original a v1", "de v1 a v2". Con palabras y no con una flecha: las
// fuentes estándar del PDF no tienen ese carácter.
function pasoDeVersion(operacion: OperacionDeLimpiezaEnInforme): string {
  return `${operacion.versionOrigen === 0 ? 'del original' : `de v${operacion.versionOrigen}`} a v${operacion.versionResultado}`;
}

// En la tabla la columna "Operación" ya dice qué se hizo; para las
// eliminaciones el método se abrevia (el texto completo está en la bitácora).
function metodoParaLaTabla(operacion: OperacionDeLimpiezaEnInforme): string {
  switch (operacion.operacion) {
    case 'eliminar_registros':
      return 'filas con el valor faltante';
    case 'eliminar_columna':
      return 'columna completa';
    case 'imputar':
      return operacion.valorImputado !== undefined ? `${operacion.metodo} (valor: ${valorComoTexto(operacion.valorImputado)})` : operacion.metodo;
    default: {
      const exhaustivo: never = operacion.operacion;
      throw new Error(`Operación no manejada: ${String(exhaustivo)}`);
    }
  }
}

export interface TablaDeNarrativa {
  encabezados: string[];
  filas: string[][];
  // Anchos sugeridos para el PDF (puntos), uno por columna.
  anchos: number[];
}

export interface NarrativaDeLimpieza {
  parrafos: string[];
  operaciones: TablaDeNarrativa | null;
  // Aclaraciones de operaciones puntuales (moda con empate, media no entera).
  notas: string[];
  // Cómo leer el resto del informe a la luz de la limpieza.
  advertencias: string[];
}

function fraseDeDuplicados(datos: DatosInformeDataset): string {
  return datos.filasDuplicadas === 0
    ? 'No se detectaron filas duplicadas exactas.'
    : `Se detectaron ${datos.filasDuplicadas} fila(s) duplicada(s) exacta(s) (ver sección 6): SIADE no las elimina ni modifica automáticamente.`;
}

// Sección 8.
export function narrarLimpiezaRealizada(datos: DatosInformeDataset): NarrativaDeLimpieza {
  const { procedencia } = datos;

  if (!procedencia || procedencia.version === 0) {
    const sujeto = procedencia ? `el dataset original («${procedencia.nombreArchivo}»)` : 'los datos';
    return {
      parrafos: [
        `Este informe se calculó sobre ${sujeto} tal como ${procedencia ? 'fue importado' : 'fueron importados'}: no se le aplicó ninguna limpieza ni transformación.`,
        fraseDeDuplicados(datos)
      ],
      operaciones: null,
      notas: [],
      advertencias: []
    };
  }

  const { operaciones } = procedencia;
  const parrafos = [
    `Este informe se calculó sobre la versión ${procedencia.version} de «${procedencia.nombreArchivo}», generada a partir ${deLaVersion(procedencia.versionBase)}. ` +
      'El dataset original no se modificó: se conserva como fue importado y se puede volver a abrir.',
    fraseDeDuplicados(datos)
  ];

  if (operaciones.length === 0) {
    return {
      parrafos: [...parrafos, 'No se encontró en la bitácora el detalle de las operaciones que generaron esta versión.'],
      operaciones: null,
      notas: [],
      advertencias: []
    };
  }

  const ultima = operaciones[operaciones.length - 1];
  parrafos.push(
    `Para llegar a esta versión se aplicaron ${operaciones.length} operación(es) de limpieza, todas elegidas y confirmadas por el analista ` +
      `(la última, el ${formatearMomento(ultima.fecha)}). El detalle completo está en la bitácora del dataset.`
  );

  const imputaciones = operaciones.filter((operacion) => operacion.operacion === 'imputar');
  const advertencias: string[] = [];
  if (imputaciones.length > 0) {
    const variables = [...new Set(imputaciones.map((operacion) => `«${operacion.variable}»`))].join(', ');
    advertencias.push(
      `Los valores imputados (${variables}) son valores calculados a partir de los datos presentes, no observaciones. ` +
        'Reemplazar los faltantes por un único valor reduce la dispersión de la variable (varianza, desviación estándar, rango ' +
        'intercuartílico) respecto de la que tendrían los datos completos, y puede atenuar su correlación con otras variables: ' +
        'las medidas de esas variables en las secciones siguientes deben leerse con esa salvedad.'
    );
  }
  const filasEliminadas = operaciones
    .filter((operacion) => operacion.operacion === 'eliminar_registros')
    .reduce((suma, operacion) => suma + operacion.registrosAfectados, 0);
  if (filasEliminadas > 0) {
    advertencias.push(
      `Se eliminaron ${filasEliminadas} registro(s) por tener valores faltantes. Si esos faltantes no se distribuyen al azar ` +
        '(por ejemplo, si faltan más en un grupo que en otro), los resultados describen a los registros que quedaron, no al conjunto original.'
    );
  }

  return {
    parrafos,
    operaciones: {
      encabezados: ['Paso', 'Operación', 'Variable', 'Registros', 'Método'],
      filas: operaciones.map((operacion) => [
        pasoDeVersion(operacion),
        ETIQUETA_DE_OPERACION[operacion.operacion],
        operacion.variable,
        String(operacion.registrosAfectados),
        metodoParaLaTabla(operacion)
      ]),
      // Suman 468 pt: el ancho útil de una hoja carta con márgenes de 72.
      anchos: [78, 115, 105, 50, 120]
    },
    notas: operaciones.filter((operacion) => operacion.nota !== undefined).map((operacion) => `«${operacion.variable}»: ${operacion.nota}`),
    advertencias
  };
}

// RF-111. Encabezado de la columna de tipo en las tablas de variables: deja
// de llamarse "Tipo detectado" cuando alguno no es el detectado.
export function encabezadoDeColumnaTipo(datos: DatosInformeDataset): string {
  return datos.columnas.some((columna) => columna.tipoCorregidoManualmente) ? 'Tipo' : 'Tipo detectado';
}

// RF-111. Una frase por variable cuyo tipo fijó el analista (sección 5).
// Vacío si no corrigió ninguna.
export function narrarTiposCorregidos(datos: DatosInformeDataset): string[] {
  const corregidas = datos.columnas.filter((columna) => columna.tipoCorregidoManualmente);
  if (corregidas.length === 0) return [];

  return [
    `El analista fijó a mano el tipo de ${corregidas.length} variable(s); todos los cálculos de este informe usan el tipo fijado, no el detectado:`,
    ...corregidas.map((columna) => {
      // tipoDetallado/tipoDetectado son opcionales en el diagnóstico (lo
      // arman también código y pruebas anteriores a M-14); si faltan se usa
      // el tipo general.
      const vigente = columna.tipoDetallado ? ETIQUETA_DE_TIPO_DETALLADO[columna.tipoDetallado] : columna.tipo;
      const detectado = columna.tipoDetectado ? ` (el sistema había detectado ${ETIQUETA_DE_TIPO_DETALLADO[columna.tipoDetectado]})` : '';
      return `«${columna.nombre}» se trata como ${vigente}${detectado}.`;
    })
  ];
}

// RF-110. Solo si el analista confirmó una; el sistema no la usa para ningún
// cálculo (eso sería M-16), se informa como parte de la descripción.
export function narrarVariableObjetivo(datos: DatosInformeDataset): string | null {
  const columna = datos.procedencia?.variableObjetivo;
  if (!columna) return null;
  return `Variable objetivo definida por el analista: «${columna}». Es una anotación sobre el propósito del análisis: este informe no construye ningún modelo a partir de ella.`;
}
