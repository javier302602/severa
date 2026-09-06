import { GenerarResumenEjecutivoUseCase } from '../../ports/in/module_reportes_exportacion/GenerarResumenEjecutivoUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { AuditoriaRepository } from '../../ports/out/persistencia/repositorios/AuditoriaRepository';
import { AnalistaRepository } from '../../ports/out/persistencia/repositorios/AnalistaRepository';
import { GeneradorDeInformes } from '../../ports/out/reportes/GeneradorDeInformes';
import { recopilarDatosDeInforme } from './RecopilarDatosDeInforme';
import { resolverNombreAnalistaParaInforme } from '../../utils/ResolverNombreAnalistaParaInforme';

export class GenerarResumenEjecutivo implements GenerarResumenEjecutivoUseCase {
  constructor(
    private readonly vulnerabilidadRepository: VulnerabilidadRepository,
    private readonly geradorDeInformes: GeneradorDeInformes,
    private readonly auditoriaRepository: AuditoriaRepository,
    private readonly analistaRepository: AnalistaRepository
  ) {}

  async ejecutar(analistaId: string): Promise<Buffer> {
    const generadoPara = await resolverNombreAnalistaParaInforme(this.analistaRepository, analistaId);
    const datos = await recopilarDatosDeInforme(this.vulnerabilidadRepository, this.auditoriaRepository, generadoPara, analistaId);
    return this.geradorDeInformes.generarResumenEjecutivo(datos);
  }
}
