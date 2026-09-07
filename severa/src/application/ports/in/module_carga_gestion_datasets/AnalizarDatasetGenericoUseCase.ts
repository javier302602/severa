import { DiagnosticoDataset } from '../../../../domain/services/data-cleaning/CalidadDeDatosGenerico';

export interface ResultadoAnalisisDataset {
  diagnostico: DiagnosticoDataset;
  sesionId: string;
  // Generalización de M-03: id del DatasetGenerico persistido (tablas
  // datasets_genericos/registros_datasets_genericos), distinto de sesionId
  // (efímero, memoria del proceso, solo para Fase 3/4/5) — ver
  // AnalizarDatasetGenerico.ts. Se mantienen separados a propósito en esta
  // ronda: unificarlos tocaría SesionAnalisisStore, fuera de alcance.
  datasetId: string;
}

export interface AnalizarDatasetGenericoUseCase {
  // analistaId viene siempre del token (req.analistaAutenticado.id, nunca
  // del body) — Fase 3: la sesión creada queda atada a ese id para que las
  // rutas de estadísticas/análisis univariado puedan verificar dueño.
  // nombreArchivoOriginal: RF-21, se persiste tal cual (saneado) en
  // DatasetGenerico.nombreArchivo.
  ejecutar(rutaArchivo: string, analistaId: string, nombreArchivoOriginal: string): Promise<ResultadoAnalisisDataset>;
}
