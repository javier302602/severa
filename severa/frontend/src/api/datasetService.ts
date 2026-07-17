import { httpClient } from './httpClient';

// Contrato verificado contra DatasetController.ts.
export interface ResumenImportacion {
  importados: number;
  rechazados: number;
  errores: string[];
}

// Mapeo flexible de columnas: espejo de MapeoColumnas (LectorExcelDataset.ts,
// backend). Deliberadamente sin "severidad" — el backend siempre la deriva
// del CVSS Score al guardar (PostgresVulnerabilidadRepository.calcularSeveridad),
// nunca lee un valor importado, así que mapear esa columna no tendría ningún
// efecto real.
export interface MapeoColumnas {
  cve?: string;
  cvssScore?: string;
  software?: string;
  tipoVulnerabilidad?: string;
  accesoRemoto?: string;
  diasParaParche?: string;
}

export const datasetService = {
  // Se llama apenas el usuario elige el archivo, ANTES de importar nada —
  // solo lee los headers para poder mostrar el selector de mapeo.
  detectarColumnas: async (archivo: File): Promise<string[]> => {
    const formData = new FormData();
    formData.append('archivo', archivo);
    const respuesta = await httpClient.postForm<{ columnas: string[] }>('/dataset/columnas', formData);
    return respuesta.columnas;
  },
  importar: (archivo: File, mapeoColumnas?: MapeoColumnas): Promise<ResumenImportacion> => {
    const formData = new FormData();
    formData.append('archivo', archivo);
    // Solo se manda si el usuario efectivamente mapeó algo — un mapeo vacío
    // ({}) equivale a no mandar el campo (mismo comportamiento por defecto
    // del backend), no hace falta serializar "{}" de más.
    if (mapeoColumnas && Object.keys(mapeoColumnas).length > 0) {
      formData.append('mapeoColumnas', JSON.stringify(mapeoColumnas));
    }
    return httpClient.postForm('/dataset/importar', formData);
  },
  // Sprint 17: NVD, Google Sheets o Dropbox — el backend clasifica el link y
  // valida el dominio/IP (allowlist deny-by-default, ver DetectorDeTipoDeLink.ts
  // y DescargadorDeArchivosHttp.ts); el frontend no reimplementa nada de eso,
  // solo manda el string y muestra el error si el backend lo rechaza.
  importarDesdeUrl: (url: string): Promise<ResumenImportacion> => httpClient.post('/dataset/importar-url', { url }),
  exportar: (): Promise<string> => httpClient.get('/dataset/exportar')
};
