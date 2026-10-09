import {
  AplicarLimpiezaDeDatasetUseCase,
  ResultadoDeLimpiezaAplicada,
  ResumenDeLimpieza
} from '../../ports/in/module_limpieza_calidad_datos/LimpiezaDeDatasetUseCases';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import { DatasetGenericoRepository, OperacionParaBitacora } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import {
  DecisionDeTratamiento,
  ResultadoDeTratamiento,
  aplicarTratamientoDeFaltantes
} from '../../../domain/services/data-cleaning/TratamientoDeFaltantesGenerico';
import { analizarDataset } from '../../../domain/services/data-cleaning/CalidadDeDatosGenerico';
import { calcularEstadisticasDescriptivas } from '../../../domain/services/descriptive-statistics/EstadisticasDescriptivasGenerico';
import { TipoColumnaDetallado } from '../../../domain/services/variable-detection/DetectorDeTipoDeColumna';
import { TratamientoDeFaltantesInvalidoError } from '../../../domain/errors/TratamientoDeFaltantesInvalidoError';
import { obtenerSesion, obtenerSesionConDataset } from '../../utils/ResolverDatasetDeSesion';

function resumir(resultado: ResultadoDeTratamiento): ResumenDeLimpieza {
  return {
    filasAntes: resultado.filasAntes,
    filasDespues: resultado.filasDespues,
    filasEliminadas: resultado.filasEliminadas,
    columnasEliminadas: resultado.columnasEliminadas,
    celdasImputadas: resultado.celdasImputadas,
    operaciones: resultado.operaciones
  };
}

// M-15, Ronda 2 — RF-120/121/123, y de M-12 RF-136/137.
//
// Limpiar NO modifica nada de lo que ya existe. El resultado es un dataset
// nuevo (otra versión de la misma familia) con sus propios registros, una
// sesión de análisis nueva sobre esas filas, y una entrada de bitácora por
// cada operación. El dataset y la sesión de los que se partió quedan tal cual
// y se pueden seguir usando: "volver atrás" es simplemente abrir otra versión.
export class AplicarLimpiezaDeDataset implements AplicarLimpiezaDeDatasetUseCase {
  constructor(
    private readonly sesionAnalisisStore: SesionAnalisisStore,
    private readonly datasetGenericoRepository: DatasetGenericoRepository
  ) {}

  async previsualizar(analistaId: string, sesionId: string, decisiones: DecisionDeTratamiento[]): Promise<ResumenDeLimpieza> {
    const datos = obtenerSesion(this.sesionAnalisisStore, analistaId, sesionId);
    return resumir(aplicarTratamientoDeFaltantes(datos.columnas, datos.filas, decisiones, datos.tiposCorregidos));
  }

  async ejecutar(
    analistaId: string,
    sesionId: string,
    decisiones: DecisionDeTratamiento[],
    confirmado: boolean
  ): Promise<ResultadoDeLimpiezaAplicada> {
    // RF-120: "el sistema nunca aplica una estrategia de tratamiento sin
    // confirmación explícita del analista".
    if (confirmado !== true) {
      throw new TratamientoDeFaltantesInvalidoError(
        'La limpieza no se aplica sin confirmación explícita. Revisá la vista previa y confirmá para generar la versión procesada.'
      );
    }

    const { datos, dataset: base } = await obtenerSesionConDataset(this.sesionAnalisisStore, this.datasetGenericoRepository, analistaId, sesionId);
    const resultado = aplicarTratamientoDeFaltantes(datos.columnas, datos.filas, decisiones, datos.tiposCorregidos);

    // Las correcciones de tipo siguen valiendo para las columnas que quedan.
    const tiposCorregidos: Record<string, TipoColumnaDetallado> = {};
    Object.entries(datos.tiposCorregidos ?? {}).forEach(([columna, tipo]) => {
      if (resultado.columnas.includes(columna)) tiposCorregidos[columna] = tipo;
    });

    const diagnostico = analizarDataset(resultado.columnas, resultado.filas, tiposCorregidos);

    const operaciones: OperacionParaBitacora[] = resultado.operaciones.map((operacion) => ({
      operacion: operacion.operacion,
      variable: operacion.variable,
      registrosAfectados: operacion.registrosAfectados,
      metodo: operacion.metodo,
      detalle: {
        ...(operacion.valorImputado !== undefined ? { valorImputado: operacion.valorImputado } : {}),
        ...(operacion.nota !== undefined ? { nota: operacion.nota } : {})
      }
    }));

    const version = await this.datasetGenericoRepository.crearVersionProcesada({
      base,
      columnas: resultado.columnas,
      filas: resultado.filas,
      filasDuplicadas: diagnostico.filasDuplicadas,
      tiposCorregidos,
      operaciones,
      fecha: new Date()
    });

    const nuevaSesionId = this.sesionAnalisisStore.crear(analistaId, {
      columnas: resultado.columnas,
      filas: resultado.filas,
      datasetId: version.id,
      tiposCorregidos
    });

    return {
      sesionId: nuevaSesionId,
      datasetId: version.id,
      datasetOriginalId: version.idDelOriginal,
      nombreArchivo: version.nombreArchivo,
      version: version.version,
      versionBase: base.version,
      diagnostico,
      perfilVariables: calcularEstadisticasDescriptivas(resultado.columnas, resultado.filas, tiposCorregidos),
      tiposCorregidos,
      variableObjetivo: version.variableObjetivo,
      resumen: resumir(resultado)
    };
  }
}
