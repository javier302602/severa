// Una hoja de cálculo de una sola tabla. Las celdas conservan su tipo: un
// número se exporta como número y una fecha como fecha (para que Excel las
// pueda ordenar y filtrar), no como texto.
export type CeldaDeTabla = string | number | Date | null;

export interface TablaParaExcel {
  nombreDeHoja: string;
  encabezados: string[];
  filas: CeldaDeTabla[][];
}

export interface ExportadorDeTablaExcel {
  exportar(tabla: TablaParaExcel): Promise<Buffer>;
}
