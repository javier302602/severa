import { GenerarInformeDatasetUseCase } from '../../ports/in/module_reportes_exportacion/GenerarInformeDatasetUseCase';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import { GeneradorDeInformes } from '../../ports/out/reportes/GeneradorDeInformes';
import { AnalistaRepository } from '../../ports/out/persistencia/repositorios/AnalistaRepository';
import { recopilarDatosDeInformeDataset } from './RecopilarDatosDeInformeDataset';
import { SesionAnalisisNoEncontradaError } from '../../../domain/errors/SesionAnalisisNoEncontradaError';
import { resolverNombreAnalistaParaInforme } from '../../utils/ResolverNombreAnalistaParaInforme';

// Mejora 4 (Análisis de Datos General) — Fase 5.
export class GenerarInformeDataset implements GenerarInformeDatasetUseCase {
  constructor(
    private readonly sesionAnalisisStore: SesionAnalisisStore,
    private readonly geradorDeInformes: GeneradorDeInformes,
    private readonly analistaRepository: AnalistaRepository
  ) {}

  async ejecutar(analistaId: string, sesionId: string, formato: 'pdf' | 'docx'): Promise<Buffer> {
    const datosSesion = this.sesionAnalisisStore.obtener(analistaId, sesionId);
    if (!datosSesion) {
      throw new SesionAnalisisNoEncontradaError();
    }

    const generadoPara = await resolverNombreAnalistaParaInforme(this.analistaRepository, analistaId);
    const datos = recopilarDatosDeInformeDataset(datosSesion.columnas, datosSesion.filas, generadoPara);

    return formato === 'pdf' ? this.geradorDeInformes.generarInformeDataset(datos) : this.geradorDeInformes.generarInformeDatasetWord(datos);
  }
}
