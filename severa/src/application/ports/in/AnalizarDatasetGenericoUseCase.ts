import { DiagnosticoDataset } from '../../../domain/services/CalidadDeDatosGenerico';

export interface ResultadoAnalisisDataset {
  diagnostico: DiagnosticoDataset;
  sesionId: string;
}

export interface AnalizarDatasetGenericoUseCase {
  // analistaId viene siempre del token (req.analistaAutenticado.id, nunca
  // del body) — Fase 3: la sesión creada queda atada a ese id para que las
  // rutas de estadísticas/análisis univariado puedan verificar dueño.
  ejecutar(rutaArchivo: string, analistaId: string): Promise<ResultadoAnalisisDataset>;
}
