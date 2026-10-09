import { CorregirTipoDeVariableUseCase, ResultadoCorreccionDeTipo } from '../../ports/in/module_deteccion_variables/CorregirTipoDeVariableUseCase';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import { DatasetGenericoRepository } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import {
  CorreccionesDeTipo,
  ETIQUETA_DE_TIPO_DETALLADO,
  TipoColumnaDetallado,
  esVacio,
  inferirTipoColumnaDetallado,
  motivoDeTipoNoAplicable,
  resolverTipoColumnaDetallado
} from '../../../domain/services/variable-detection/DetectorDeTipoDeColumna';
import { analizarDataset } from '../../../domain/services/data-cleaning/CalidadDeDatosGenerico';
import { calcularEstadisticasDescriptivas } from '../../../domain/services/descriptive-statistics/EstadisticasDescriptivasGenerico';
import { ColumnaDeDatasetInvalidaError } from '../../../domain/errors/ColumnaDeDatasetInvalidaError';
import { SesionAnalisisNoEncontradaError } from '../../../domain/errors/SesionAnalisisNoEncontradaError';
import { obtenerSesionConDataset } from '../../utils/ResolverDatasetDeSesion';

// RF-111 (M-14, Ronda 2): el analista fija a mano el tipo de una variable (o
// vuelve al detectado).
//
// Los tres criterios de aceptación:
//  - "puede cambiar el tipo detectado de cualquier variable": cualquier
//    columna, a cualquiera de los 9 tipos, siempre que sus valores lo admitan
//    (ver motivoDeTipoNoAplicable).
//  - "el sistema recalcula los análisis dependientes": la corrección queda en
//    la sesión y cada análisis posterior (descriptivas, univariado,
//    correlación, atípicos, calidad, informe) se calcula con ella, porque
//    todos resuelven el tipo por resolverTipoColumna. Acá además se devuelven
//    ya recalculados el diagnóstico y el perfil de variables.
//  - "el cambio queda registrado en la bitácora": una entrada 'corregir_tipo'
//    con el tipo anterior y el nuevo.
// También se guarda en el dataset, así sigue vigente al reabrirlo.
export class CorregirTipoDeVariable implements CorregirTipoDeVariableUseCase {
  constructor(
    private readonly sesionAnalisisStore: SesionAnalisisStore,
    private readonly datasetGenericoRepository: DatasetGenericoRepository
  ) {}

  async ejecutar(analistaId: string, sesionId: string, columna: string, tipo: TipoColumnaDetallado | null): Promise<ResultadoCorreccionDeTipo> {
    const { datos, dataset } = await obtenerSesionConDataset(this.sesionAnalisisStore, this.datasetGenericoRepository, analistaId, sesionId);

    if (!datos.columnas.includes(columna)) {
      throw new ColumnaDeDatasetInvalidaError(`La columna "${columna}" no existe en este dataset`);
    }

    const valores = datos.filas.map((fila) => fila[columna]);
    const tipoDetectado = inferirTipoColumnaDetallado(valores);
    const tipoAnterior = resolverTipoColumnaDetallado(columna, valores, datos.tiposCorregidos);

    if (tipo !== null) {
      const motivo = motivoDeTipoNoAplicable(tipo, valores);
      if (motivo !== null) {
        throw new ColumnaDeDatasetInvalidaError(`No se puede tratar "${columna}" como ${ETIQUETA_DE_TIPO_DETALLADO[tipo]}: ${motivo}.`);
      }
    }

    // Elegir el mismo tipo que detecta el sistema equivale a no corregir: no
    // se guarda una "corrección" que no cambia nada.
    const tiposCorregidos: Record<string, TipoColumnaDetallado> = { ...(datos.tiposCorregidos ?? {}) };
    if (tipo === null || tipo === tipoDetectado) {
      delete tiposCorregidos[columna];
    } else {
      tiposCorregidos[columna] = tipo;
    }
    const tipoVigente = resolverTipoColumnaDetallado(columna, valores, tiposCorregidos);

    // Se guarda cada vez que cambia lo que hay anotado para la columna, aunque
    // el tipo vigente termine siendo el mismo (por ejemplo, al quitar una
    // corrección vieja que ya no se podía aplicar a estos datos): si no,
    // quedaría guardada para siempre.
    const anotadoAntes = datos.tiposCorregidos?.[columna];
    if (tiposCorregidos[columna] !== anotadoAntes) {
      await this.datasetGenericoRepository.actualizarTiposCorregidos(dataset.id, analistaId, tiposCorregidos);
      if (!this.sesionAnalisisStore.actualizarTiposCorregidos(analistaId, sesionId, tiposCorregidos)) {
        throw new SesionAnalisisNoEncontradaError();
      }
    }

    // A la bitácora (RF-123) va lo que cambia para el análisis: el tipo con
    // el que se va a tratar la variable de acá en adelante.
    if (tipoVigente !== tipoAnterior) {
      await this.datasetGenericoRepository.registrarEnBitacora(
        dataset,
        [
          {
            operacion: 'corregir_tipo',
            variable: columna,
            // Los valores cuya interpretación cambia: todos los no vacíos.
            registrosAfectados: valores.filter((valor) => !esVacio(valor)).length,
            metodo: tipo === null || tipo === tipoDetectado ? 'manual (vuelve al tipo detectado)' : 'manual',
            detalle: { tipoAnterior, tipoNuevo: tipoVigente, tipoDetectado }
          }
        ],
        new Date()
      );
    }

    const vigentes: CorreccionesDeTipo = tiposCorregidos;
    return {
      datasetOriginalId: dataset.idDelOriginal,
      nombreArchivo: dataset.nombreArchivo,
      version: dataset.version,
      huboCambio: tipoVigente !== tipoAnterior,
      columna,
      tipoAnterior,
      tipoVigente,
      tipoDetectado,
      tiposCorregidos: vigentes,
      diagnostico: analizarDataset(datos.columnas, datos.filas, vigentes),
      perfilVariables: calcularEstadisticasDescriptivas(datos.columnas, datos.filas, vigentes)
    };
  }
}
