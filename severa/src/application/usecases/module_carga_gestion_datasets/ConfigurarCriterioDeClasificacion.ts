import {
  ConfigurarCriterioDeClasificacionUseCase,
  ConfigurarCriterioDeClasificacionInput,
  ResultadoConfiguracionDeCriterio
} from '../../ports/in/module_carga_gestion_datasets/ConfigurarCriterioDeClasificacionUseCase';
import { DatasetGenericoRepository } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { DatasetGenericoNoEncontradoError } from '../../../domain/errors/DatasetGenericoNoEncontradoError';
import { ColumnaDeDatasetInvalidaError } from '../../../domain/errors/ColumnaDeDatasetInvalidaError';
import { resolverTipoColumna } from '../../../domain/services/variable-detection/DetectorDeTipoDeColumna';
import { construirCriterioParaColumna } from '../../../domain/services/classification/ValidacionDeCriterioDeClasificacion';

// RF-139: pieza habilitadora. NO genera ranking ni filtra nada — solo valida
// y persiste la elección del analista, consumida más adelante por
// ClasificadorDeRiesgoGenerico (ver auditoría M-09, frentes A/B/C).
//
// Cada cambio queda en la bitácora del dataset (RF-123) con el criterio
// anterior y el nuevo; la auditoría central la agrega el decorador
// (ConfigurarCriterioDeClasificacionConAuditoria). Volver a mandar el mismo
// criterio con la misma columna clave no guarda ni anota nada.
export class ConfigurarCriterioDeClasificacion implements ConfigurarCriterioDeClasificacionUseCase {
  constructor(private readonly datasetGenericoRepository: DatasetGenericoRepository) {}

  async ejecutar(datasetId: string, analistaId: string, input: ConfigurarCriterioDeClasificacionInput): Promise<ResultadoConfiguracionDeCriterio> {
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
    // El tipo vigente: el detectado, o el que el analista fijó a mano (RF-111).
    const tipoVigente = resolverTipoColumna(input.nombreColumna, valoresDeLaColumna, dataset.tiposCorregidos);

    const criterio = construirCriterioParaColumna(input, tipoVigente);
    const columnaClave = input.columnaClave ?? dataset.columnaClave;
    const criterioAnterior = dataset.criterioClasificacion;
    const columnaClaveAnterior = dataset.columnaClave;

    if (criterio.esIgualA(criterioAnterior) && columnaClave === columnaClaveAnterior) {
      return { dataset, huboCambio: false, criterioAnterior, columnaClaveAnterior };
    }

    await this.datasetGenericoRepository.actualizarCriterioClasificacion(datasetId, analistaId, criterio, columnaClave);
    await this.datasetGenericoRepository.registrarEnBitacora(
      dataset,
      [
        {
          operacion: 'configurar_criterio',
          variable: criterio.nombreColumna,
          // Las filas que pasan a clasificarse con este criterio: todas.
          registrosAfectados: registros.length,
          metodo: criterio.tipo === 'numerica' ? 'umbrales numéricos' : 'orden de categorías',
          detalle: {
            anterior: { criterio: criterioAnterior?.toJSON() ?? null, columnaClave: columnaClaveAnterior },
            nuevo: { criterio: criterio.toJSON(), columnaClave }
          }
        }
      ],
      new Date()
    );

    return {
      dataset: dataset.conConfiguracion({ criterioClasificacion: criterio, columnaClave }),
      huboCambio: true,
      criterioAnterior,
      columnaClaveAnterior
    };
  }
}
