import { Pool } from 'pg';
import { FiltroFavorito } from '../../../../domain/entities/FiltroFavorito';
import { FiltroFavoritoRepository } from '../../../../application/ports/out/FiltroFavoritoRepository';
import { CriteriosFiltroVulnerabilidad } from '../../../../domain/value-objects/FiltroVulnerabilidad';

export class PostgresFiltroFavoritoRepository implements FiltroFavoritoRepository {
  constructor(private readonly pool: Pool) {}

  async guardar(filtroFavorito: FiltroFavorito): Promise<void> {
    await this.pool.query(
      `INSERT INTO filtros_favoritos (id, analista_id, nombre, criterios, fecha_creacion)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET nombre = $3, criterios = $4`,
      [
        filtroFavorito.id,
        filtroFavorito.analistaId,
        filtroFavorito.nombre,
        JSON.stringify(filtroFavorito.criterios),
        filtroFavorito.fechaCreacion
      ]
    );
  }

  async listarPorAnalista(analistaId: string): Promise<FiltroFavorito[]> {
    const result = await this.pool.query(
      'SELECT * FROM filtros_favoritos WHERE analista_id = $1 ORDER BY fecha_creacion DESC',
      [analistaId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: {
    id: string;
    analista_id: string;
    nombre: string;
    criterios: CriteriosFiltroVulnerabilidad;
    fecha_creacion: Date;
  }): FiltroFavorito {
    return new FiltroFavorito(row.id, row.analista_id, row.nombre, row.criterios, new Date(row.fecha_creacion));
  }
}
