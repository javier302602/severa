import { AnalisisRealizado } from '../../../domain/entities/AnalisisRealizado';
import { HistorialAnalisisRepository } from '../../ports/out/persistencia/repositorios/HistorialAnalisisRepository';
import { Paginacion } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { ObtenerHistorialAnalisisUseCase } from '../../ports/in/module_perfil_analista/ObtenerHistorialAnalisisUseCase';

// RF-11: historial de análisis del analista autenticado. El id SIEMPRE debe
// venir de req.analistaAutenticado.id (ver PerfilController) — mismo
// criterio sin-IDOR que VerPerfil.
export class ObtenerHistorialAnalisis implements ObtenerHistorialAnalisisUseCase {
  constructor(private readonly historialAnalisisRepository: HistorialAnalisisRepository) {}

  async ejecutar(analistaId: string, paginacion?: Paginacion): Promise<AnalisisRealizado[]> {
    return this.historialAnalisisRepository.listarPorAnalista(analistaId, paginacion);
  }
}
