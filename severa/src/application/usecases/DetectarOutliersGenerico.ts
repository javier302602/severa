import { DetectarOutliersGenericoUseCase } from '../ports/in/DetectarOutliersGenericoUseCase';
import { SesionAnalisisStore } from '../ports/out/SesionAnalisisStore';
import { ResultadoDeteccionOutliers, detectarOutliers } from '../../domain/services/DeteccionOutliersGenerico';
import { SesionAnalisisNoEncontradaError } from '../../domain/errors/SesionAnalisisNoEncontradaError';

// Mejora 4 (Análisis de Datos General) — Fase 4.
export class DetectarOutliersGenerico implements DetectarOutliersGenericoUseCase {
  constructor(private readonly sesionAnalisisStore: SesionAnalisisStore) {}

  async ejecutar(analistaId: string, sesionId: string): Promise<ResultadoDeteccionOutliers> {
    const datos = this.sesionAnalisisStore.obtener(analistaId, sesionId);
    if (!datos) {
      throw new SesionAnalisisNoEncontradaError();
    }

    return detectarOutliers(datos.columnas, datos.filas);
  }
}
