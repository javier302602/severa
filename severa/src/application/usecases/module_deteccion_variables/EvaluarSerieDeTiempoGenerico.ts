import { EvaluarSerieDeTiempoGenericoUseCase } from '../../ports/in/module_deteccion_variables/EvaluarSerieDeTiempoGenericoUseCase';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import { EvaluacionDeSerieDeTiempo, evaluarSerieDeTiempo } from '../../../domain/services/variable-detection/SerieDeTiempoGenerico';
import { obtenerSesion } from '../../utils/ResolverDatasetDeSesion';

// RF-108 (M-14, Ronda 2): qué columnas son temporales y si el dataset se
// puede tratar como serie de tiempo. Solo describe; ver SerieDeTiempoGenerico.ts.
export class EvaluarSerieDeTiempoGenerico implements EvaluarSerieDeTiempoGenericoUseCase {
  constructor(private readonly sesionAnalisisStore: SesionAnalisisStore) {}

  async ejecutar(analistaId: string, sesionId: string): Promise<EvaluacionDeSerieDeTiempo> {
    const datos = obtenerSesion(this.sesionAnalisisStore, analistaId, sesionId);
    return evaluarSerieDeTiempo(datos.columnas, datos.filas, datos.tiposCorregidos);
  }
}
