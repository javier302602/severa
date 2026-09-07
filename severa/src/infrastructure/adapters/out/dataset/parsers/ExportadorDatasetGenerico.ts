import * as XLSX from 'xlsx';

// RF-24 generalizado: exporta el dataset genérico tal cual fue importado —
// sin agrupar por severidad ni ningún otro criterio de dominio (a diferencia
// de construirExcelAgrupadoPorSeveridad, que es específico del preset de
// ciberseguridad). Mismo patrón XLSX que construirExcelDeRechazadas
// (LectorExcelDataset.ts): json_to_sheet + book_new + write.
export function construirExcelDeDatasetGenerico(columnas: string[], filas: Array<Record<string, unknown>>): Buffer {
  const hoja = XLSX.utils.json_to_sheet(filas, { header: columnas });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Dataset');
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
