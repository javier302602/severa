import ExcelJS from 'exceljs';
import { PassThrough } from 'stream';
import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';
import {
  ENCABEZADO_EXPORTACION,
  agruparPorSeveridad,
  filaDeExportacion,
  GrupoDeSeveridad
} from '../../../../domain/services/ExportacionAgrupadaPorSeveridad';

// Bug real reportado: la descarga de vulnerabilidades era "un solo cuadro
// sin separación visual". Se arma un .xlsx real con exceljs (la librería
// "xlsx"/SheetJS Community Edition ya usada en el resto del proyecto NO
// escribe estilos de celda al guardar — verificado escribiendo y releyendo
// un archivo — así que el color de fondo y la fusión de celdas de acá son
// posibles solo porque exceljs sí los soporta) — un bloque por severidad,
// con encabezado de fila fusionada y color, encabezado de columnas propio,
// datos, y una fila en blanco antes del siguiente bloque.
const COLOR_POR_SEVERIDAD: Record<GrupoDeSeveridad['severidad'], string> = {
  Crítica: 'FFDC2626', // rojo
  Alta: 'FFEA580C', // naranja
  Media: 'FFCA8A04', // amarillo/ámbar (texto oscuro por contraste, ver abajo)
  Baja: 'FF16A34A' // verde
};

const TEXTO_OSCURO_POR_SEVERIDAD = new Set<GrupoDeSeveridad['severidad']>(['Media']);

function estiloEncabezadoDeBloque(severidad: GrupoDeSeveridad['severidad']): Partial<ExcelJS.Style> {
  return {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_POR_SEVERIDAD[severidad] } },
    font: { bold: true, size: 12, color: { argb: TEXTO_OSCURO_POR_SEVERIDAD.has(severidad) ? 'FF1E293B' : 'FFFFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'middle' }
  };
}

const ESTILO_ENCABEZADO_COLUMNAS: Partial<ExcelJS.Style> = {
  font: { bold: true },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } },
  border: {
    top: { style: 'thin', color: { argb: 'FF94A3B8' } },
    bottom: { style: 'thin', color: { argb: 'FF94A3B8' } }
  }
};

// Ancho de columna automático (2026-07-20): exceljs no tiene un "autofit"
// nativo (es una función que la propia aplicación Excel calcula al abrir el
// archivo, no algo que se guarde en el formato .xlsx) — se aproxima con el
// mismo criterio que cualquier hoja de cálculo real: ancho = longitud del
// contenido más largo de esa columna (incluido el encabezado), con un techo
// para que un dato atípicamente largo (ej. un nombre de software enorme) no
// deje una columna absurdamente ancha. Como el array completo de
// vulnerabilidades ya está en memoria (se lo pasan entero al llamar esta
// función), se puede pre-calcular esto en una sola pasada ANTES de empezar a
// escribir el stream, sin romper el streaming de las filas en sí.
const ANCHO_MAXIMO_COLUMNA = 40;
const ANCHO_MINIMO_COLUMNA = 8;

function calcularAnchosDeColumnas(vulnerabilidades: Vulnerabilidad[]): number[] {
  const anchos = ENCABEZADO_EXPORTACION.map((titulo) => titulo.length);
  for (const vulnerabilidad of vulnerabilidades) {
    const fila = filaDeExportacion(vulnerabilidad);
    fila.forEach((valor, indice) => {
      anchos[indice] = Math.min(ANCHO_MAXIMO_COLUMNA, Math.max(anchos[indice], valor.length));
    });
  }
  return anchos.map((ancho) => Math.max(ANCHO_MINIMO_COLUMNA, ancho + 2));
}

// Bug real reproducido en vivo (2026-07-20, dataset real de 343.441 filas):
// construir el libro con la API "en memoria" normal de exceljs (Workbook +
// addRow) mantiene TODAS las filas como objetos Cell/Row vivos hasta el
// final — mismo patrón que ya había crasheado el proceso antes con SheetJS
// ("FATAL ERROR: JavaScript heap out of memory", contenedor reiniciado
// solo). Se usa el WRITER EN STREAMING de exceljs (ExcelJS.stream.xlsx.WorkbookWriter):
// cada fila se compromete (`.commit()`) al stream de salida apenas se
// escribe y se libera de la memoria, así que el pico de memoria no depende
// de cuántas filas tenga el dataset. El contrato externo (Promise<Buffer>)
// no cambia — se junta el stream de salida en un Buffer acá adentro, no en
// el controller.
export async function construirExcelAgrupadoPorSeveridad(vulnerabilidades: Vulnerabilidad[]): Promise<Buffer> {
  const destino = new PassThrough();
  const chunks: Buffer[] = [];
  destino.on('data', (chunk: Buffer) => chunks.push(chunk));
  const listo = new Promise<void>((resolve, reject) => {
    destino.on('end', resolve);
    destino.on('error', reject);
  });

  const libro = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: destino, useStyles: true });
  const hoja = libro.addWorksheet('Vulnerabilidades por severidad');
  hoja.columns = calcularAnchosDeColumnas(vulnerabilidades).map((width) => ({ width }));

  let hayCeldasVacias = false;
  const indiceRevisar = ENCABEZADO_EXPORTACION.length - 1;

  for (const grupo of agruparPorSeveridad(vulnerabilidades)) {
    const filaTitulo = hoja.addRow([`SEVERIDAD: ${grupo.severidad.toUpperCase()} (${grupo.vulnerabilidades.length} vulnerabilidades)`]);
    hoja.mergeCells(filaTitulo.number, 1, filaTitulo.number, ENCABEZADO_EXPORTACION.length);
    filaTitulo.height = 20;
    filaTitulo.getCell(1).style = estiloEncabezadoDeBloque(grupo.severidad);
    filaTitulo.commit();

    const filaEncabezado = hoja.addRow(ENCABEZADO_EXPORTACION);
    filaEncabezado.eachCell((celda) => {
      celda.style = ESTILO_ENCABEZADO_COLUMNAS;
    });
    filaEncabezado.commit();

    // Bug real reproducido en vivo (2026-07-20, 343.441 filas reales, límite
    // del contenedor ya subido a 3g): asignar un borde a cada una de las 8
    // celdas de CADA fila (2.750.000 asignaciones de estilo en total) bajo
    // useStyles:true hacía que exceljs registrara/comparara cada asignación
    // contra su caché interna de estilos — con ese volumen, el heap seguía
    // creciendo hasta agotar el nuevo límite igual ("FATAL ERROR:
    // JavaScript heap out of memory" real, confirmado con docker logs, en
    // vez de los ~22s que tardaba sin este borde por fila). El color y la
    // fusión del título de cada bloque (unas pocas decenas de celdas en
    // total, no millones) se mantienen — esas sí son baratas a cualquier
    // escala.
    for (const vulnerabilidad of grupo.vulnerabilidades) {
      const datos = filaDeExportacion(vulnerabilidad);
      if (datos[indiceRevisar] === '✓') {
        hayCeldasVacias = true;
      }
      const fila = hoja.addRow(datos);
      fila.commit();
    }

    const filaSeparadora = hoja.addRow([]); // separador en blanco antes del próximo bloque
    filaSeparadora.commit();
  }

  if (hayCeldasVacias) {
    const filaNota = hoja.addRow(['Datos incompletos: revisar la fila si aparece "✓" en la columna "Revisar".']);
    filaNota.commit();
  }

  hoja.commit();
  // WorkbookWriter.commit() finaliza el archivo zip internamente (vía
  // "archiver") y eso ya cierra el stream de salida — llamar destino.end()
  // acá de nuevo sería redundante (o peor, terminar el stream antes de que
  // el zip termine de escribirse). Solo hace falta esperar a que ese cierre
  // interno dispare 'end' para saber que ya se juntaron todos los chunks.
  await libro.commit();
  await listo;

  return Buffer.concat(chunks);
}
