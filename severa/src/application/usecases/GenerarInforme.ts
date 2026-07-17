import { GenerarInformeUseCase } from '../ports/in/GenerarInformeUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { AuditoriaRepository } from '../ports/out/AuditoriaRepository';
import { GeneradorDeInformes } from '../ports/out/GeneradorDeInformes';
import { recopilarDatosDeInforme } from './RecopilarDatosDeInforme';

export class GenerarInforme implements GenerarInformeUseCase {
  constructor(
    private readonly vulnerabilidadRepository: VulnerabilidadRepository,
    private readonly geradorDeInformes: GeneradorDeInformes,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(formato: 'pdf' | 'docx'): Promise<Buffer> {
    const datos = await recopilarDatosDeInforme(this.vulnerabilidadRepository, this.auditoriaRepository);

    return formato === 'pdf'
      ? this.geradorDeInformes.generarInformeCompleto(datos)
      : this.geradorDeInformes.generarInformeWord(datos);
  }
}
