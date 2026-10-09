import { DefinirVariableObjetivoUseCase, ResultadoDefinicionDeVariableObjetivo } from '../../ports/in/module_deteccion_variables/VariableObjetivoUseCases';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import { DatasetGenericoRepository } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { DecisionVariableObjetivo } from '../../../domain/entities/DatasetGenerico';
import { ColumnaDeDatasetInvalidaError } from '../../../domain/errors/ColumnaDeDatasetInvalidaError';
import { esAptaComoVariableObjetivo } from '../../../domain/services/variable-detection/VariableObjetivoGenerico';
import { resolverTipoColumnaDetallado } from '../../../domain/services/variable-detection/DetectorDeTipoDeColumna';
import { obtenerSesionConDataset } from '../../utils/ResolverDatasetDeSesion';

// RF-110 (M-14, Ronda 2): guarda la decisión del analista sobre la variable
// objetivo. Es el ÚNICO camino por el que un dataset llega a tener una
// variable objetivo confirmada, y siempre lo dispara el analista con una
// columna que él eligió — el sistema solo sugiere (SugerirVariableObjetivo).
// Guardar la decisión no desencadena ningún análisis: lo que se haga con ella
// corresponde a M-16, que sigue bloqueado.
export class DefinirVariableObjetivo implements DefinirVariableObjetivoUseCase {
  constructor(
    private readonly sesionAnalisisStore: SesionAnalisisStore,
    private readonly datasetGenericoRepository: DatasetGenericoRepository
  ) {}

  async ejecutar(analistaId: string, sesionId: string, columna: string | null): Promise<ResultadoDefinicionDeVariableObjetivo> {
    const { datos, dataset } = await obtenerSesionConDataset(this.sesionAnalisisStore, this.datasetGenericoRepository, analistaId, sesionId);

    let decision: DecisionVariableObjetivo;
    if (columna === null) {
      decision = { estado: 'rechazada', columna: null };
    } else {
      if (!datos.columnas.includes(columna)) {
        throw new ColumnaDeDatasetInvalidaError(`La columna "${columna}" no existe en este dataset`);
      }
      const tipo = resolverTipoColumnaDetallado(
        columna,
        datos.filas.map((fila) => fila[columna]),
        datos.tiposCorregidos
      );
      if (!esAptaComoVariableObjetivo(tipo)) {
        throw new ColumnaDeDatasetInvalidaError(
          `La columna "${columna}" no puede ser variable objetivo: es un identificador, un texto libre o una fecha.`
        );
      }
      decision = { estado: 'confirmada', columna };
    }

    const anterior = dataset.variableObjetivo;
    const resultado = {
      decision,
      anterior,
      datasetOriginalId: dataset.idDelOriginal,
      nombreArchivo: dataset.nombreArchivo,
      version: dataset.version
    };
    if (anterior.estado === decision.estado && anterior.columna === decision.columna) {
      return { ...resultado, huboCambio: false };
    }

    await this.datasetGenericoRepository.actualizarVariableObjetivo(dataset.id, analistaId, decision);
    await this.datasetGenericoRepository.registrarEnBitacora(
      dataset,
      [
        {
          operacion: 'definir_variable_objetivo',
          variable: decision.columna,
          registrosAfectados: 0,
          metodo: decision.estado === 'confirmada' ? 'confirmada por el analista' : 'descartada por el analista',
          detalle: { anterior, nueva: decision }
        }
      ],
      new Date()
    );

    return { ...resultado, huboCambio: true };
  }
}
