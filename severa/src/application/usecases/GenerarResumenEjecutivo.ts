import { GenerarResumenEjecutivoUseCase } from '../ports/in/GenerarResumenEjecutivoUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { AuditoriaRepository } from '../ports/out/AuditoriaRepository';
import { GeneradorDeInformes } from '../ports/out/GeneradorDeInformes';
import { recopilarDatosDeInforme } from './RecopilarDatosDeInforme';

export class GenerarResumenEjecutivo implements GenerarResumenEjecutivoUseCase {
  constructor(
    private readonly vulnerabilidadRepository: VulnerabilidadRepository,
    private readonly geradorDeInformes: GeneradorDeInformes,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(): Promise<Buffer> {
    const datos = await recopilarDatosDeInforme(this.vulnerabilidadRepository, this.auditoriaRepository);
    return this.geradorDeInformes.generarResumenEjecutivo(datos);
  }
}
