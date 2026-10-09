import { AuditoriaRepository } from '../../../ports/out/persistencia/repositorios/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../../ports/out/notificaciones/ServicioDeNotificaciones';
import {
  AplicarLimpiezaDeDatasetUseCase,
  ResultadoDeLimpiezaAplicada,
  ResumenDeLimpieza
} from '../../../ports/in/module_limpieza_calidad_datos/LimpiezaDeDatasetUseCases';
import { CorregirTipoDeVariableUseCase, ResultadoCorreccionDeTipo } from '../../../ports/in/module_deteccion_variables/CorregirTipoDeVariableUseCase';
import {
  DefinirVariableObjetivoUseCase,
  ResultadoDefinicionDeVariableObjetivo
} from '../../../ports/in/module_deteccion_variables/VariableObjetivoUseCases';
import { DatasetExportado, ExportarDatasetGenericoUseCase } from '../../../ports/in/module_carga_gestion_datasets/ExportarDatasetGenericoUseCase';
import { DecisionDeTratamiento } from '../../../../domain/services/data-cleaning/TratamientoDeFaltantesGenerico';
import { RegistrarEnHistorialDeAnalisisUseCase } from '../../../ports/in/module_perfil_analista/RegistrarEnHistorialDeAnalisisUseCase';
import { ETIQUETA_DE_TIPO_DETALLADO, TipoColumnaDetallado } from '../../../../domain/services/variable-detection/DetectorDeTipoDeColumna';
import {
  ConfigurarCriterioDeClasificacionInput,
  ConfigurarCriterioDeClasificacionUseCase,
  ResultadoConfiguracionDeCriterio
} from '../../../ports/in/module_carga_gestion_datasets/ConfigurarCriterioDeClasificacionUseCase';
import { CriterioDeClasificacionValue } from '../../../../domain/shared/value-objects/CriterioDeClasificacion';
import {
  AplicarPlantillaDeAnalisisUseCase,
  ResultadoDeAplicacionDePlantilla,
  VistaPreviaDePlantilla
} from '../../../ports/in/module_perfil_analista/PlantillasDeAnalisisUseCases';

// RF-138 (M-12): la auditoría central registra las operaciones relevantes
// sobre datasets genéricos, cada una con el id del dataset ORIGINAL en
// `datasetId` — así "la auditoría completa de un dataset" (GET
// /auditoria?datasetId=...) reúne lo hecho sobre cualquiera de sus versiones.
// De las operaciones que enumera el requisito:
//   - carga:        AnalizarDatasetGenericoConAuditoria (ya existía; ahora
//                   también guarda el datasetId)
//   - limpieza:     AplicarLimpiezaDeDatasetConAuditoria ('LimpiarDatasetGenerico')
//   - imputación:   ídem, un segundo registro ('ImputarDatasetGenerico')
//                   cuando la limpieza imputó algo
//   - exportación:  ExportarDatasetGenericoConAuditoria
//   - eliminación:  no existe como operación — el sistema no tiene forma de
//                   borrar un dataset genérico (solo se va con la cuenta,
//                   RF-98, que ya audita EliminarCuentaConAuditoria)
// y además las tres que cambian cómo se interpreta un dataset: corrección de
// tipo (RF-111), variable objetivo (RF-110) y criterio de clasificación
// (RF-139).
//
// Complementa, no reemplaza, la bitácora de RF-123: la bitácora es del
// analista y tiene el detalle operación por operación; esto es el registro
// transversal que consulta el administrador.

function describirVersion(nombreArchivo: string, version: number): string {
  return version === 0 ? `"${nombreArchivo}" (original)` : `"${nombreArchivo}" (versión ${version})`;
}

// RF-120/121/123 + RF-122: además de auditar, emite LA notificación de
// resumen de la limpieza — una sola por proceso — y la anota en el historial
// de análisis del analista (RF-11), contra la versión que la limpieza generó.
export class AplicarLimpiezaDeDatasetConAuditoria implements AplicarLimpiezaDeDatasetUseCase {
  constructor(
    private readonly usecase: AplicarLimpiezaDeDatasetUseCase,
    private readonly auditoriaRepository: AuditoriaRepository,
    private readonly servicioDeNotificaciones: ServicioDeNotificaciones,
    private readonly historial: RegistrarEnHistorialDeAnalisisUseCase
  ) {}

  // La vista previa no guarda nada: no hay operación que auditar.
  previsualizar(analistaId: string, sesionId: string, decisiones: DecisionDeTratamiento[]): Promise<ResumenDeLimpieza> {
    return this.usecase.previsualizar(analistaId, sesionId, decisiones);
  }

  async ejecutar(
    analistaId: string,
    sesionId: string,
    decisiones: DecisionDeTratamiento[],
    confirmado: boolean
  ): Promise<ResultadoDeLimpiezaAplicada> {
    const resultado = await this.usecase.ejecutar(analistaId, sesionId, decisiones, confirmado);
    const { resumen } = resultado;

    await this.auditoriaRepository.registrar({
      usuario: analistaId,
      accion: 'LimpiarDatasetGenerico',
      detalle:
        `Versión ${resultado.version} de "${resultado.nombreArchivo}" generada desde la versión ${resultado.versionBase}: ` +
        `${resumen.filasEliminadas} fila(s) eliminada(s), ${resumen.columnasEliminadas.length} columna(s) eliminada(s), ` +
        `${resumen.celdasImputadas} valor(es) imputado(s)`,
      datasetId: resultado.datasetOriginalId
    });

    const imputaciones = resumen.operaciones.filter((operacion) => operacion.operacion === 'imputar');
    if (imputaciones.length > 0) {
      await this.auditoriaRepository.registrar({
        usuario: analistaId,
        accion: 'ImputarDatasetGenerico',
        detalle:
          `Versión ${resultado.version} de "${resultado.nombreArchivo}": ` +
          imputaciones.map((operacion) => `${operacion.variable} (${operacion.metodo}, ${operacion.registrosAfectados} valor(es))`).join('; '),
        datasetId: resultado.datasetOriginalId
      });
    }

    await this.servicioDeNotificaciones.notificarLimpiezaCompletada(analistaId, {
      nombreArchivo: resultado.nombreArchivo,
      version: resultado.version,
      filasAntes: resumen.filasAntes,
      filasEliminadas: resumen.filasEliminadas,
      columnasEliminadas: resumen.columnasEliminadas,
      celdasImputadas: resumen.celdasImputadas,
      metodosPorVariable: resumen.operaciones.map((operacion) => ({ variable: operacion.variable, metodo: operacion.metodo }))
    });

    await this.historial.deSesion(analistaId, resultado.sesionId, 'LimpiezaDeDatos', {
      cadaVez: true,
      detalle:
        `Generó la versión ${resultado.version}: ${resumen.filasEliminadas} fila(s) eliminada(s), ` +
        `${resumen.columnasEliminadas.length} variable(s) eliminada(s), ${resumen.celdasImputadas} valor(es) imputado(s)`
    });

    return resultado;
  }
}

export class CorregirTipoDeVariableConAuditoria implements CorregirTipoDeVariableUseCase {
  constructor(
    private readonly usecase: CorregirTipoDeVariableUseCase,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(analistaId: string, sesionId: string, columna: string, tipo: TipoColumnaDetallado | null): Promise<ResultadoCorreccionDeTipo> {
    const resultado = await this.usecase.ejecutar(analistaId, sesionId, columna, tipo);

    if (resultado.huboCambio) {
      await this.auditoriaRepository.registrar({
        usuario: analistaId,
        accion: 'CorregirTipoDeVariable',
        detalle:
          `${describirVersion(resultado.nombreArchivo, resultado.version)}: "${resultado.columna}" pasa de ` +
          `${ETIQUETA_DE_TIPO_DETALLADO[resultado.tipoAnterior]} a ${ETIQUETA_DE_TIPO_DETALLADO[resultado.tipoVigente]}`,
        datasetId: resultado.datasetOriginalId
      });
    }

    return resultado;
  }
}

export class DefinirVariableObjetivoConAuditoria implements DefinirVariableObjetivoUseCase {
  constructor(
    private readonly usecase: DefinirVariableObjetivoUseCase,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(analistaId: string, sesionId: string, columna: string | null): Promise<ResultadoDefinicionDeVariableObjetivo> {
    const resultado = await this.usecase.ejecutar(analistaId, sesionId, columna);

    if (resultado.huboCambio) {
      await this.auditoriaRepository.registrar({
        usuario: analistaId,
        accion: 'DefinirVariableObjetivo',
        detalle:
          `${describirVersion(resultado.nombreArchivo, resultado.version)}: ` +
          (resultado.decision.estado === 'confirmada'
            ? `variable objetivo confirmada: "${resultado.decision.columna}"`
            : 'el analista descartó tener variable objetivo'),
        datasetId: resultado.datasetOriginalId
      });
    }

    return resultado;
  }
}

export class ExportarDatasetGenericoConAuditoria implements ExportarDatasetGenericoUseCase {
  constructor(
    private readonly usecase: ExportarDatasetGenericoUseCase,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(datasetId: string, analistaId: string): Promise<DatasetExportado> {
    const exportado = await this.usecase.ejecutar(datasetId, analistaId);

    await this.auditoriaRepository.registrar({
      usuario: analistaId,
      accion: 'ExportarDatasetGenerico',
      detalle: `${describirVersion(exportado.nombreArchivo, exportado.version)} exportado a Excel (${exportado.totalFilas} fila(s))`,
      datasetId: exportado.datasetOriginalId
    });

    return exportado;
  }
}

function describirCriterio(criterio: CriterioDeClasificacionValue): string {
  if (criterio.tipo === 'numerica') {
    const umbrales = (criterio.umbrales ?? []).map((umbral) => `${umbral.etiqueta} desde ${umbral.minimo}`).join(', ');
    return `"${criterio.nombreColumna}" por umbrales (${umbrales})`;
  }
  return `"${criterio.nombreColumna}" por orden de categorías (${(criterio.ordenCategorias ?? []).join(' < ')})`;
}

export class ConfigurarCriterioDeClasificacionConAuditoria implements ConfigurarCriterioDeClasificacionUseCase {
  constructor(
    private readonly usecase: ConfigurarCriterioDeClasificacionUseCase,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(datasetId: string, analistaId: string, input: ConfigurarCriterioDeClasificacionInput): Promise<ResultadoConfiguracionDeCriterio> {
    const resultado = await this.usecase.ejecutar(datasetId, analistaId, input);
    const { dataset } = resultado;

    if (resultado.huboCambio && dataset.criterioClasificacion) {
      await this.auditoriaRepository.registrar({
        usuario: analistaId,
        accion: 'ConfigurarCriterioDeClasificacion',
        detalle:
          `${describirVersion(dataset.nombreArchivo, dataset.version)}: criterio de clasificación ${describirCriterio(dataset.criterioClasificacion)}` +
          (dataset.columnaClave ? `, columna clave "${dataset.columnaClave}"` : ''),
        datasetId: dataset.idDelOriginal
      });
    }

    return resultado;
  }
}

// RF-12: cada cambio que aplica una plantilla ya se audita por su lado (pasa
// por los casos de uso decorados de arriba). Esto agrega UN registro que dice
// que vinieron de una plantilla y de cuál, para que el administrador pueda
// leer la historia completa.
export class AplicarPlantillaDeAnalisisConAuditoria implements AplicarPlantillaDeAnalisisUseCase {
  constructor(
    private readonly usecase: AplicarPlantillaDeAnalisisUseCase,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  // La vista previa no guarda nada: no hay operación que auditar.
  previsualizar(analistaId: string, sesionId: string, plantillaId: string): Promise<VistaPreviaDePlantilla> {
    return this.usecase.previsualizar(analistaId, sesionId, plantillaId);
  }

  async ejecutar(
    analistaId: string,
    sesionId: string,
    plantillaId: string,
    huella: string,
    confirmado: boolean
  ): Promise<ResultadoDeAplicacionDePlantilla> {
    const resultado = await this.usecase.ejecutar(analistaId, sesionId, plantillaId, huella, confirmado);

    if (resultado.cambiosAplicados.length > 0) {
      await this.auditoriaRepository.registrar({
        usuario: analistaId,
        accion: 'AplicarPlantillaDeAnalisis',
        detalle:
          `${describirVersion(resultado.nombreArchivo, resultado.version)}: plantilla "${resultado.plantilla.nombre}" aplicada ` +
          `(${resultado.cambiosAplicados.length} cambio(s))`,
        datasetId: resultado.datasetOriginalId
      });
    }

    return resultado;
  }
}
