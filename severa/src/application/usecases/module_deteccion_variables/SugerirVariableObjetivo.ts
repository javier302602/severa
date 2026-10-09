import { EstadoDeVariableObjetivo, SugerirVariableObjetivoUseCase } from '../../ports/in/module_deteccion_variables/VariableObjetivoUseCases';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import { DatasetGenericoRepository } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { esAptaComoVariableObjetivo, sugerirVariablesObjetivo } from '../../../domain/services/variable-detection/VariableObjetivoGenerico';
import { resolverTipoColumnaDetallado } from '../../../domain/services/variable-detection/DetectorDeTipoDeColumna';
import { obtenerSesionConDataset } from '../../utils/ResolverDatasetDeSesion';

// RF-110 (M-14, Ronda 2): candidatas a variable objetivo + la decisión que el
// analista ya haya tomado. Es solo lectura: nunca fija nada.
export class SugerirVariableObjetivo implements SugerirVariableObjetivoUseCase {
  constructor(
    private readonly sesionAnalisisStore: SesionAnalisisStore,
    private readonly datasetGenericoRepository: DatasetGenericoRepository
  ) {}

  async ejecutar(analistaId: string, sesionId: string): Promise<EstadoDeVariableObjetivo> {
    const { datos, dataset } = await obtenerSesionConDataset(this.sesionAnalisisStore, this.datasetGenericoRepository, analistaId, sesionId);

    const sugerencia = sugerirVariablesObjetivo(datos.columnas, datos.filas, datos.tiposCorregidos);
    const columnasElegibles = datos.columnas.filter((nombre) =>
      esAptaComoVariableObjetivo(
        resolverTipoColumnaDetallado(
          nombre,
          datos.filas.map((fila) => fila[nombre]),
          datos.tiposCorregidos
        )
      )
    );

    return { candidatas: sugerencia.candidatas, nota: sugerencia.nota, decision: dataset.variableObjetivo, columnasElegibles };
  }
}
