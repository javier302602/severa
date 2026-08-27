import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { ReiniciarDatasetUseCase, ResumenReinicioDataset } from '../ports/in/ReiniciarDatasetUseCase';

// "Restablecer mis datos": borra SOLO las vulnerabilidades del analista que
// la invoca, para permitirle cargar un dataset nuevo sin arrastrar el
// anterior. Con la multi-tenancy de este módulo (migración 006), ya no hace
// falta que esto sea una acción administrativa — un analista nunca puede
// borrar datos de otro, porque eliminarTodas(analistaId) ya viene acotado al
// propio catálogo (ver PostgresVulnerabilidadRepository.eliminarTodas).
//
// Alcance confirmado: solo borra las filas propias de `vulnerabilidades`. No
// toca `filtros_favoritos` ni `notificaciones` — ninguna de las dos
// referencia vulnerabilidades (ambas referencian analista_id directamente,
// ver migraciones 004/005), así que no quedan filas huérfanas por limpiar.
export class ReiniciarDataset implements ReiniciarDatasetUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(analistaId: string): Promise<ResumenReinicioDataset> {
    const eliminados = await this.vulnerabilidadRepository.eliminarTodas(analistaId);
    return { eliminados };
  }
}
