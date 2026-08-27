import { GenerarInformeUseCase } from '../ports/in/GenerarInformeUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { AuditoriaRepository } from '../ports/out/AuditoriaRepository';
import { AnalistaRepository } from '../ports/out/AnalistaRepository';
import { GeneradorDeInformes } from '../ports/out/GeneradorDeInformes';
import { recopilarDatosDeInforme } from './RecopilarDatosDeInforme';
import { resolverNombreAnalistaParaInforme } from './shared/ResolverNombreAnalistaParaInforme';

export class GenerarInforme implements GenerarInformeUseCase {
  constructor(
    private readonly vulnerabilidadRepository: VulnerabilidadRepository,
    private readonly geradorDeInformes: GeneradorDeInformes,
    private readonly auditoriaRepository: AuditoriaRepository,
    private readonly analistaRepository: AnalistaRepository
  ) {}

  async ejecutar(formato: 'pdf' | 'docx', analistaId: string): Promise<Buffer> {
    const generadoPara = await resolverNombreAnalistaParaInforme(this.analistaRepository, analistaId);
    const datos = await recopilarDatosDeInforme(this.vulnerabilidadRepository, this.auditoriaRepository, generadoPara, analistaId);

    return formato === 'pdf'
      ? this.geradorDeInformes.generarInformeCompleto(datos)
      : this.geradorDeInformes.generarInformeWord(datos);
  }
}
