import { GenerarInformeDatasetUseCase } from '../ports/in/GenerarInformeDatasetUseCase';
import { SesionAnalisisStore } from '../ports/out/SesionAnalisisStore';
import { GeneradorDeInformes } from '../ports/out/GeneradorDeInformes';
import { recopilarDatosDeInformeDataset } from './RecopilarDatosDeInformeDataset';
import { SesionAnalisisNoEncontradaError } from '../../domain/errors/SesionAnalisisNoEncontradaError';

// Mejora 4 (Análisis de Datos General) — Fase 5.
export class GenerarInformeDataset implements GenerarInformeDatasetUseCase {
  constructor(
    private readonly sesionAnalisisStore: SesionAnalisisStore,
    private readonly geradorDeInformes: GeneradorDeInformes
  ) {}

  async ejecutar(analistaId: string, sesionId: string, formato: 'pdf' | 'docx'): Promise<Buffer> {
    const datosSesion = this.sesionAnalisisStore.obtener(analistaId, sesionId);
    if (!datosSesion) {
      throw new SesionAnalisisNoEncontradaError();
    }

    const datos = recopilarDatosDeInformeDataset(datosSesion.columnas, datosSesion.filas);

    return formato === 'pdf' ? this.geradorDeInformes.generarInformeDataset(datos) : this.geradorDeInformes.generarInformeDatasetWord(datos);
  }
}
