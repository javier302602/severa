import { createHash } from 'crypto';
import {
  AplicarPlantillaDeAnalisisUseCase,
  ResultadoDeAplicacionDePlantilla,
  VistaPreviaDePlantilla
} from '../../ports/in/module_perfil_analista/PlantillasDeAnalisisUseCases';
import { PlantillaDeAnalisisRepository } from '../../ports/out/persistencia/repositorios/PlantillaDeAnalisisRepository';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import { DatasetGenericoRepository } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { CorregirTipoDeVariableUseCase } from '../../ports/in/module_deteccion_variables/CorregirTipoDeVariableUseCase';
import { DefinirVariableObjetivoUseCase } from '../../ports/in/module_deteccion_variables/VariableObjetivoUseCases';
import { ConfigurarCriterioDeClasificacionUseCase } from '../../ports/in/module_carga_gestion_datasets/ConfigurarCriterioDeClasificacionUseCase';
import { PlantillaDeAnalisis } from '../../../domain/entities/PlantillaDeAnalisis';
import { DatasetGenerico } from '../../../domain/entities/DatasetGenerico';
import {
  CambioDePlantilla,
  PlanDeAplicacionDePlantilla,
  planificarAplicacionDePlantilla
} from '../../../domain/services/plantillas/PlanDeAplicacionDePlantilla';
import { analizarDataset } from '../../../domain/services/data-cleaning/CalidadDeDatosGenerico';
import {
  AplicacionDePlantillaSinConfirmarError,
  PlantillaDeAnalisisNoEncontradaError,
  PlantillaIncompatibleError,
  VistaPreviaDePlantillaDesactualizadaError
} from '../../../domain/errors/PlantillaDeAnalisisErrors';
import { obtenerSesion, obtenerSesionConDataset } from '../../utils/ResolverDatasetDeSesion';

interface Preparacion {
  plantilla: PlantillaDeAnalisis;
  dataset: DatasetGenerico;
  plan: PlanDeAplicacionDePlantilla;
  huella: string;
}

// RF-12 (M-02): "la plantilla puede reaplicarse sobre un nuevo dataset
// compatible". En dos pasos, como la limpieza (RF-120):
//   previsualizar  qué cambiaría, qué falta y qué no se puede. No guarda nada.
//   ejecutar       con la confirmación del analista y la huella de la vista
//                  previa que confirmó, aplica lo pendiente.
//
// Aplicar NO escribe por su cuenta: llama a los mismos casos de uso que usa el
// analista a mano (ya decorados con auditoría), así cada cambio queda en la
// auditoría (RF-138) y en la bitácora del dataset (RF-123) igual que si lo
// hubiera hecho él, y valen las mismas reglas.
//
// "No se aplica nada a medias": antes de escribir se recalcula el plan y, si
// algo no se puede aplicar, no se escribe nada. Si la base falla en el medio
// (riesgo aceptado), aplicar es repetible: el plan solo contiene lo que el
// dataset todavía no tiene, así que volver a aplicar completa lo que faltó.
export class AplicarPlantillaDeAnalisis implements AplicarPlantillaDeAnalisisUseCase {
  constructor(
    private readonly sesionAnalisisStore: SesionAnalisisStore,
    private readonly datasetGenericoRepository: DatasetGenericoRepository,
    private readonly plantillaRepository: PlantillaDeAnalisisRepository,
    private readonly corregirTipoDeVariable: CorregirTipoDeVariableUseCase,
    private readonly definirVariableObjetivo: DefinirVariableObjetivoUseCase,
    private readonly configurarCriterioDeClasificacion: ConfigurarCriterioDeClasificacionUseCase
  ) {}

  async previsualizar(analistaId: string, sesionId: string, plantillaId: string): Promise<VistaPreviaDePlantilla> {
    const { plantilla, dataset, plan, huella } = await this.preparar(analistaId, sesionId, plantillaId);
    return { ...datosDeLaAplicacion(plantilla, dataset), plan, huella };
  }

  async ejecutar(
    analistaId: string,
    sesionId: string,
    plantillaId: string,
    huella: string,
    confirmado: boolean
  ): Promise<ResultadoDeAplicacionDePlantilla> {
    if (!confirmado) {
      throw new AplicacionDePlantillaSinConfirmarError();
    }

    const preparacion = await this.preparar(analistaId, sesionId, plantillaId);
    const { plantilla, dataset, plan } = preparacion;
    if (!plan.aplicable) {
      throw new PlantillaIncompatibleError(plan.columnasFaltantes, plan.problemas);
    }
    if (huella !== preparacion.huella) {
      throw new VistaPreviaDePlantillaDesactualizadaError();
    }

    // plan.cambios ya viene en el orden en que se aplica: tipos, variable
    // objetivo, criterio.
    for (const cambio of plan.cambios) {
      await this.aplicar(analistaId, sesionId, dataset, cambio);
    }

    const datos = obtenerSesion(this.sesionAnalisisStore, analistaId, sesionId);
    const tiposCorregidos = datos.tiposCorregidos ?? {};
    return {
      ...datosDeLaAplicacion(plantilla, dataset),
      cambiosAplicados: plan.cambios,
      tiposCorregidos,
      diagnostico: analizarDataset(datos.columnas, datos.filas, tiposCorregidos)
    };
  }

  private async aplicar(analistaId: string, sesionId: string, dataset: DatasetGenerico, cambio: CambioDePlantilla): Promise<void> {
    switch (cambio.tipo) {
      case 'tipo_de_variable':
        await this.corregirTipoDeVariable.ejecutar(analistaId, sesionId, cambio.columna, cambio.tipoNuevo);
        return;
      case 'variable_objetivo':
        await this.definirVariableObjetivo.ejecutar(analistaId, sesionId, cambio.columna);
        return;
      case 'criterio_de_clasificacion': {
        const { nombreColumna, tipo, umbrales, ordenCategorias } = cambio.criterioNuevo;
        await this.configurarCriterioDeClasificacion.ejecutar(dataset.id, analistaId, {
          nombreColumna,
          tipo,
          umbrales,
          ordenCategorias,
          columnaClave: cambio.columnaClaveNueva ?? undefined
        });
        return;
      }
      default: {
        const exhaustivo: never = cambio;
        throw new Error(`Cambio de plantilla no manejado: ${JSON.stringify(exhaustivo)}`);
      }
    }
  }

  private async preparar(analistaId: string, sesionId: string, plantillaId: string): Promise<Preparacion> {
    const plantilla = await this.plantillaRepository.buscarPorId(plantillaId, analistaId);
    if (!plantilla) {
      throw new PlantillaDeAnalisisNoEncontradaError();
    }
    const { datos, dataset } = await obtenerSesionConDataset(this.sesionAnalisisStore, this.datasetGenericoRepository, analistaId, sesionId);

    const plan = planificarAplicacionDePlantilla(plantilla.configuracion, {
      columnas: datos.columnas,
      filas: datos.filas,
      tiposCorregidos: dataset.tiposCorregidos,
      variableObjetivo: dataset.variableObjetivo,
      criterioClasificacion: dataset.criterioClasificacion,
      columnaClave: dataset.columnaClave
    });

    // La huella cubre exactamente lo que se mostró: qué plantilla, sobre qué
    // dataset y qué cambios. Si cualquiera de los tres cambia, cambia ella.
    const huella = createHash('sha256')
      .update(JSON.stringify({ plantilla: plantilla.id, dataset: dataset.id, cambios: plan.cambios }))
      .digest('hex');

    return { plantilla, dataset, plan, huella };
  }
}

function datosDeLaAplicacion(plantilla: PlantillaDeAnalisis, dataset: DatasetGenerico) {
  return {
    plantilla: { id: plantilla.id, nombre: plantilla.nombre },
    datasetOriginalId: dataset.idDelOriginal,
    nombreArchivo: dataset.nombreArchivo,
    version: dataset.version
  };
}
