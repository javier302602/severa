import {
  ConfigurarCriterioDeClasificacionUseCase,
  ConfigurarCriterioDeClasificacionInput
} from '../../ports/in/module_carga_gestion_datasets/ConfigurarCriterioDeClasificacionUseCase';
import { DatasetGenericoRepository } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { DatasetGenerico } from '../../../domain/entities/DatasetGenerico';
import { DatasetGenericoNoEncontradoError } from '../../../domain/errors/DatasetGenericoNoEncontradoError';
import { ColumnaDeDatasetInvalidaError } from '../../../domain/errors/ColumnaDeDatasetInvalidaError';
import { CriterioDeClasificacionValue } from '../../../domain/shared/value-objects/CriterioDeClasificacion';
import { inferirTipoColumna } from '../../../domain/services/variable-detection/DetectorDeTipoDeColumna';

// RF-139: pieza habilitadora. NO genera ranking ni filtra nada — solo valida
// y persiste la elección del analista, consumida más adelante por
// ClasificadorDeRiesgoGenerico (ver auditoría M-09, frentes A/B/C).
export class ConfigurarCriterioDeClasificacion implements ConfigurarCriterioDeClasificacionUseCase {
  constructor(private readonly datasetGenericoRepository: DatasetGenericoRepository) {}

  async ejecutar(datasetId: string, analistaId: string, input: ConfigurarCriterioDeClasificacionInput): Promise<DatasetGenerico> {
    const dataset = await this.datasetGenericoRepository.buscarPorId(datasetId, analistaId);
    if (!dataset) {
      throw new DatasetGenericoNoEncontradoError();
    }

    if (!dataset.columnas.includes(input.nombreColumna)) {
      throw new ColumnaDeDatasetInvalidaError(`La columna "${input.nombreColumna}" no existe en este dataset`);
    }
    if (input.columnaClave !== undefined && !dataset.columnas.includes(input.columnaClave)) {
      throw new ColumnaDeDatasetInvalidaError(`La columna clave "${input.columnaClave}" no existe en este dataset`);
    }

    const registros = await this.datasetGenericoRepository.listarRegistros(datasetId, analistaId);
    const valoresDeLaColumna = registros.map((registro) => registro.valores[input.nombreColumna]);
    const tipoDetectado = inferirTipoColumna(valoresDeLaColumna);

    if (tipoDetectado === 'texto' || tipoDetectado === 'fecha') {
      throw new ColumnaDeDatasetInvalidaError(
        `La columna "${input.nombreColumna}" no es apta para clasificación (tipo detectado: ${tipoDetectado}). RF-139 exige una variable numérica u ordinal.`
      );
    }

    const criterio = this.construirCriterio(input, tipoDetectado);
    const columnaClave = input.columnaClave ?? dataset.columnaClave;

    await this.datasetGenericoRepository.actualizarCriterioClasificacion(datasetId, analistaId, criterio, columnaClave);

    return new DatasetGenerico(
      dataset.id,
      dataset.analistaId,
      dataset.nombreArchivo,
      dataset.columnas,
      dataset.fuente,
      dataset.preset,
      dataset.filasDuplicadas,
      dataset.fechaCarga,
      criterio,
      columnaClave
    );
  }

  private construirCriterio(
    input: ConfigurarCriterioDeClasificacionInput,
    tipoDetectado: 'numerica' | 'categorica'
  ): CriterioDeClasificacionValue {
    if (tipoDetectado === 'numerica') {
      if (input.tipo !== 'numerica' || !input.umbrales || input.umbrales.length === 0) {
        throw new ColumnaDeDatasetInvalidaError(
          `La columna "${input.nombreColumna}" es numérica: debe indicar tipo "numerica" y al menos un umbral`
        );
      }
      return CriterioDeClasificacionValue.numerica(input.nombreColumna, input.umbrales);
    }

    if (input.tipo !== 'ordinal' || !input.ordenCategorias || input.ordenCategorias.length === 0) {
      throw new ColumnaDeDatasetInvalidaError(
        `La columna "${input.nombreColumna}" es categórica: debe indicar tipo "ordinal" y el orden de categorías`
      );
    }
    return CriterioDeClasificacionValue.ordinal(input.nombreColumna, input.ordenCategorias);
  }
}
