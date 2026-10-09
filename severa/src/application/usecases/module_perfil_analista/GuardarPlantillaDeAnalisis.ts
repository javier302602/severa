import { randomUUID } from 'crypto';
import { GuardarPlantillaDeAnalisisUseCase } from '../../ports/in/module_perfil_analista/PlantillasDeAnalisisUseCases';
import { PlantillaDeAnalisisRepository } from '../../ports/out/persistencia/repositorios/PlantillaDeAnalisisRepository';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import { DatasetGenericoRepository } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { ConfiguracionDePlantilla, PlantillaDeAnalisis } from '../../../domain/entities/PlantillaDeAnalisis';
import { TipoColumnaDetallado, motivoDeTipoNoAplicable } from '../../../domain/services/variable-detection/DetectorDeTipoDeColumna';
import { PlantillaDeAnalisisInvalidaError } from '../../../domain/errors/PlantillaDeAnalisisErrors';
import { obtenerSesionConDataset } from '../../utils/ResolverDatasetDeSesion';

// RF-12 (M-02): "el analista puede guardar una plantilla con nombre". Se
// guarda la configuración de análisis que el dataset abierto tiene AHORA: lo
// que el analista decidió sobre él (tipos corregidos, variable objetivo
// confirmada, criterio de clasificación y columna clave).
export class GuardarPlantillaDeAnalisis implements GuardarPlantillaDeAnalisisUseCase {
  constructor(
    private readonly sesionAnalisisStore: SesionAnalisisStore,
    private readonly datasetGenericoRepository: DatasetGenericoRepository,
    private readonly plantillaRepository: PlantillaDeAnalisisRepository
  ) {}

  async ejecutar(analistaId: string, sesionId: string, nombre: string): Promise<PlantillaDeAnalisis> {
    const nombreNormalizado = PlantillaDeAnalisis.normalizarNombre(nombre);
    const { datos, dataset } = await obtenerSesionConDataset(this.sesionAnalisisStore, this.datasetGenericoRepository, analistaId, sesionId);

    // Solo las correcciones que hoy están en efecto: una corrección vieja que
    // ya no se puede aplicar a estos datos (ver resolverTipoColumnaDetallado)
    // no forma parte de cómo se está analizando el dataset.
    const tiposCorregidos: Record<string, TipoColumnaDetallado> = {};
    for (const [columna, tipo] of Object.entries(dataset.tiposCorregidos)) {
      if (!datos.columnas.includes(columna)) continue;
      if (motivoDeTipoNoAplicable(tipo, datos.filas.map((fila) => fila[columna])) === null) {
        tiposCorregidos[columna] = tipo;
      }
    }

    const configuracion: ConfiguracionDePlantilla = {
      tiposCorregidos,
      variableObjetivo: dataset.variableObjetivo.estado === 'confirmada' ? dataset.variableObjetivo.columna : null,
      clasificacion: dataset.criterioClasificacion
        ? { criterio: dataset.criterioClasificacion.toJSON(), columnaClave: dataset.columnaClave }
        : null
    };
    if (PlantillaDeAnalisis.estaVacia(configuracion)) {
      throw new PlantillaDeAnalisisInvalidaError(
        'Este dataset todavía no tiene configuración para guardar: corregí el tipo de alguna variable, confirmá la variable objetivo o fijá un criterio de clasificación.'
      );
    }

    const plantilla = new PlantillaDeAnalisis(randomUUID(), analistaId, nombreNormalizado, configuracion, new Date());
    await this.plantillaRepository.guardar(plantilla);
    return plantilla;
  }
}
