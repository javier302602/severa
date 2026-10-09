import { GenerarInformeDatasetUseCase } from '../../ports/in/module_reportes_exportacion/GenerarInformeDatasetUseCase';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import {
  GeneradorDeInformes,
  ArchivoGenerado,
  FormatoDeInforme,
  OpcionesDeInforme,
  OperacionDeLimpiezaEnInforme,
  ProcedenciaDeDatasetEnInforme
} from '../../ports/out/reportes/GeneradorDeInformes';
import { DatasetGenericoRepository } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { versionesEnElCamino } from '../../../domain/services/data-cleaning/LinajeDeVersiones';
import { AnalistaRepository } from '../../ports/out/persistencia/repositorios/AnalistaRepository';
import { recopilarDatosDeInformeDataset } from './RecopilarDatosDeInformeDataset';
import { SesionAnalisisNoEncontradaError } from '../../../domain/errors/SesionAnalisisNoEncontradaError';
import { resolverNombreAnalistaParaInforme } from '../../utils/ResolverNombreAnalistaParaInforme';

// Mejora 4 (Análisis de Datos General) — Fase 5.
export class GenerarInformeDataset implements GenerarInformeDatasetUseCase {
  constructor(
    private readonly sesionAnalisisStore: SesionAnalisisStore,
    private readonly geradorDeInformes: GeneradorDeInformes,
    private readonly analistaRepository: AnalistaRepository,
    private readonly datasetGenericoRepository: DatasetGenericoRepository
  ) {}

  async ejecutar(analistaId: string, sesionId: string, formato: FormatoDeInforme, opciones: OpcionesDeInforme = {}): Promise<ArchivoGenerado> {
    const datosSesion = this.sesionAnalisisStore.obtener(analistaId, sesionId);
    if (!datosSesion) {
      throw new SesionAnalisisNoEncontradaError();
    }

    const generadoPara = await resolverNombreAnalistaParaInforme(this.analistaRepository, analistaId);
    const datos = recopilarDatosDeInformeDataset(datosSesion.columnas, datosSesion.filas, generadoPara, datosSesion.tiposCorregidos);
    const procedencia = await this.resolverProcedencia(analistaId, datosSesion.datasetId);

    return this.geradorDeInformes.generarInformeEnFormato(
      { pipeline: 'generico', datos: procedencia ? { ...datos, procedencia } : datos },
      formato,
      opciones
    );
  }

  // RF-123/136: de qué versión son los datos y qué limpieza la produjo. Sale
  // de lo guardado (versiones y bitácora), no de la sesión, para que el
  // informe diga lo mismo que vería el analista en la bitácora. Si el dataset
  // ya no existe se genera el informe igual, sin esa parte.
  private async resolverProcedencia(analistaId: string, datasetId: string | undefined): Promise<ProcedenciaDeDatasetEnInforme | undefined> {
    if (!datasetId) return undefined;
    const dataset = await this.datasetGenericoRepository.buscarPorId(datasetId, analistaId);
    if (!dataset) return undefined;

    let operaciones: OperacionDeLimpiezaEnInforme[] = [];
    if (!dataset.esOriginal) {
      const [versiones, bitacora] = await Promise.all([
        this.datasetGenericoRepository.listarVersiones(dataset.idDelOriginal, analistaId),
        this.datasetGenericoRepository.listarBitacora(dataset.idDelOriginal, analistaId)
      ]);
      const camino = versionesEnElCamino(
        versiones.map((version) => ({ version: version.version, versionBase: version.linaje.versionBase })),
        dataset.version
      );

      // Por versión del camino, y dentro de cada una en el orden en que se
      // aplicaron (la bitácora ya viene ordenada por fecha y secuencia).
      operaciones = camino.flatMap((version) =>
        bitacora
          .filter((entrada) => entrada.versionResultado === version && esOperacionDeLimpieza(entrada.operacion) && entrada.variable !== null)
          .map((entrada) => {
            const valorImputado = entrada.detalle.valorImputado;
            const nota = entrada.detalle.nota;
            return {
              fecha: entrada.fecha,
              versionOrigen: entrada.versionOrigen,
              versionResultado: version,
              operacion: entrada.operacion as OperacionDeLimpiezaEnInforme['operacion'],
              variable: entrada.variable as string,
              registrosAfectados: entrada.registrosAfectados,
              metodo: entrada.metodo,
              ...(typeof valorImputado === 'number' || typeof valorImputado === 'string' || typeof valorImputado === 'boolean' ? { valorImputado } : {}),
              ...(typeof nota === 'string' ? { nota } : {})
            };
          })
      );
    }

    return {
      nombreArchivo: dataset.nombreArchivo,
      version: dataset.version,
      versionBase: dataset.linaje.versionBase,
      operaciones,
      variableObjetivo: dataset.variableObjetivo.estado === 'confirmada' ? dataset.variableObjetivo.columna : null
    };
  }
}

function esOperacionDeLimpieza(operacion: string): boolean {
  return operacion === 'eliminar_registros' || operacion === 'eliminar_columna' || operacion === 'imputar';
}
