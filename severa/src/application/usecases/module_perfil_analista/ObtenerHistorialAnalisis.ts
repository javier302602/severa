import { HistorialAnalisisRepository } from '../../ports/out/persistencia/repositorios/HistorialAnalisisRepository';
import {
  ObtenerHistorialAnalisisUseCase,
  PaginaDeHistorialDeAnalisis,
  PaginaDeHistorialSolicitada
} from '../../ports/in/module_perfil_analista/ObtenerHistorialAnalisisUseCase';
import { presentarAnalisisRealizado } from '../../../domain/services/historial/HistorialDeAnalisis';

export const LIMITE_DE_HISTORIAL_POR_DEFECTO = 50;
export const LIMITE_MAXIMO_DE_HISTORIAL = 200;

function enteroEntre(valor: number | undefined, minimo: number, maximo: number, porDefecto: number): number {
  if (valor === undefined || !Number.isFinite(valor)) return porDefecto;
  return Math.min(maximo, Math.max(minimo, Math.trunc(valor)));
}

// RF-11: historial de análisis del analista autenticado, con fecha, dataset
// y tipo de análisis. El id SIEMPRE debe venir de req.analistaAutenticado.id
// (ver PerfilController) — mismo criterio sin-IDOR que VerPerfil. Devuelve
// siempre una página acotada, nunca el historial entero.
export class ObtenerHistorialAnalisis implements ObtenerHistorialAnalisisUseCase {
  constructor(private readonly historialAnalisisRepository: HistorialAnalisisRepository) {}

  async ejecutar(analistaId: string, pagina: PaginaDeHistorialSolicitada = {}): Promise<PaginaDeHistorialDeAnalisis> {
    const limite = enteroEntre(pagina.limite, 1, LIMITE_MAXIMO_DE_HISTORIAL, LIMITE_DE_HISTORIAL_POR_DEFECTO);
    const desplazamiento = enteroEntre(pagina.desplazamiento, 0, Number.MAX_SAFE_INTEGER, 0);

    const [eventos, total] = await Promise.all([
      this.historialAnalisisRepository.listarPorAnalista(analistaId, { limite, offset: desplazamiento }),
      this.historialAnalisisRepository.contarPorAnalista(analistaId)
    ]);

    return { eventos: eventos.map(presentarAnalisisRealizado), total, limite, desplazamiento };
  }
}
