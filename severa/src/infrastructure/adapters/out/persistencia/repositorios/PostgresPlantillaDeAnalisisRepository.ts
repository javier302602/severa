import { Pool } from 'pg';
import { PlantillaDeAnalisisRepository } from '../../../../../application/ports/out/persistencia/repositorios/PlantillaDeAnalisisRepository';
import { ConfiguracionDePlantilla, PlantillaDeAnalisis } from '../../../../../domain/entities/PlantillaDeAnalisis';
import { NombreDePlantillaRepetidoError } from '../../../../../domain/errors/PlantillaDeAnalisisErrors';

// Código de PostgreSQL para "violación de restricción única".
const VIOLACION_DE_UNICIDAD = '23505';

interface FilaPlantilla {
  id: string;
  analista_id: string;
  nombre: string;
  configuracion: ConfiguracionDePlantilla;
  fecha_creacion: Date;
}

// RF-12 (M-02), migración 018. Cada consulta filtra por analista_id.
export class PostgresPlantillaDeAnalisisRepository implements PlantillaDeAnalisisRepository {
  constructor(private readonly pool: Pool) {}

  async guardar(plantilla: PlantillaDeAnalisis): Promise<void> {
    try {
      // INSERT sin ON CONFLICT a propósito: un nombre repetido se rechaza,
      // nunca reemplaza la plantilla que ya existe.
      await this.pool.query(
        `INSERT INTO plantillas_analisis (id, analista_id, nombre, configuracion, fecha_creacion)
         VALUES ($1, $2, $3, $4, $5)`,
        [plantilla.id, plantilla.analistaId, plantilla.nombre, JSON.stringify(plantilla.configuracion), plantilla.fechaCreacion]
      );
    } catch (error) {
      if ((error as { code?: string }).code === VIOLACION_DE_UNICIDAD) {
        throw new NombreDePlantillaRepetidoError(plantilla.nombre);
      }
      throw error;
    }
  }

  async listarPorAnalista(analistaId: string): Promise<PlantillaDeAnalisis[]> {
    const resultado = await this.pool.query<FilaPlantilla>(
      'SELECT * FROM plantillas_analisis WHERE analista_id = $1 ORDER BY fecha_creacion DESC, id',
      [analistaId]
    );
    return resultado.rows.map(aPlantilla);
  }

  async buscarPorId(id: string, analistaId: string): Promise<PlantillaDeAnalisis | null> {
    const resultado = await this.pool.query<FilaPlantilla>('SELECT * FROM plantillas_analisis WHERE id = $1 AND analista_id = $2', [
      id,
      analistaId
    ]);
    return resultado.rows[0] ? aPlantilla(resultado.rows[0]) : null;
  }

  async eliminar(id: string, analistaId: string): Promise<boolean> {
    const resultado = await this.pool.query('DELETE FROM plantillas_analisis WHERE id = $1 AND analista_id = $2', [id, analistaId]);
    return (resultado.rowCount ?? 0) > 0;
  }
}

function aPlantilla(fila: FilaPlantilla): PlantillaDeAnalisis {
  return new PlantillaDeAnalisis(fila.id, fila.analista_id, fila.nombre, fila.configuracion, new Date(fila.fecha_creacion));
}
