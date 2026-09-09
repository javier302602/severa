import { Pool } from 'pg';
import { Analista } from '../../../../../domain/entities/Analista';
import { AnalistaRepository, UmbralCriticoPersistido } from '../../../../../application/ports/out/persistencia/repositorios/AnalistaRepository';
import { Correo } from '../../../../../domain/shared/value-objects/Correo';
import { VariableNumericaVulnerabilidad } from '../../../../../domain/services/classification/VariablesVulnerabilidad';

export class PostgresAnalistaRepository implements AnalistaRepository {
  constructor(private readonly pool: Pool) {}

  async guardar(analista: Analista): Promise<void> {
    const query = `INSERT INTO analistas (id, nombre, correo, contrasena_hash, rol, bloqueado, intentos_fallidos, bloqueado_hasta)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET nombre = $2, correo = $3, contrasena_hash = $4, rol = $5, bloqueado = $6, intentos_fallidos = $7, bloqueado_hasta = $8`;
    await this.pool.query(query, [
      analista.id,
      analista.nombre,
      analista.correo.valor,
      analista.contrasenaHash,
      analista.rol,
      analista.bloqueado,
      analista.intentosFallidos,
      analista.bloqueadoHasta
    ]);
  }

  async buscarPorCorreo(correo: string): Promise<Analista | null> {
    const result = await this.pool.query('SELECT * FROM analistas WHERE correo = $1', [correo.toLowerCase()]);
    if (result.rowCount === 0) return null;
    return this.mapearFila(result.rows[0]);
  }

  async buscarPorId(id: string): Promise<Analista | null> {
    const result = await this.pool.query('SELECT * FROM analistas WHERE id = $1', [id]);
    if (result.rowCount === 0) return null;
    return this.mapearFila(result.rows[0]);
  }

  // RF-98: DELETE es idempotente por naturaleza — si el id ya no existe (p. ej.
  // doble click, o el token sigue vigente tras una eliminación previa), no es
  // un error, simplemente no afecta filas.
  async eliminar(id: string): Promise<void> {
    await this.pool.query('DELETE FROM analistas WHERE id = $1', [id]);
  }

  // RF-99 (M-13, retoma): UPDATE acotado, sin pasar por guardar() — mismo
  // criterio que actualizarCriterioClasificacion (M-09).
  async actualizarUmbralCritico(analistaId: string, variable: VariableNumericaVulnerabilidad, valor: number): Promise<void> {
    await this.pool.query('UPDATE analistas SET variable_umbral_critico = $1, valor_umbral_critico = $2 WHERE id = $3', [
      variable,
      valor,
      analistaId
    ]);
  }

  async obtenerUmbralCritico(analistaId: string): Promise<UmbralCriticoPersistido | null> {
    const result = await this.pool.query(
      'SELECT variable_umbral_critico, valor_umbral_critico FROM analistas WHERE id = $1',
      [analistaId]
    );
    const fila = result.rows[0] as { variable_umbral_critico: VariableNumericaVulnerabilidad | null; valor_umbral_critico: number | null } | undefined;
    if (!fila || fila.variable_umbral_critico === null || fila.valor_umbral_critico === null) {
      return null;
    }
    return { variable: fila.variable_umbral_critico, valor: fila.valor_umbral_critico };
  }

  // RF-100 (M-13, retoma): sin WHERE — recorre todos los analistas, único
  // consumidor es el cron de plazos próximos a vencer.
  async listarTodos(): Promise<Analista[]> {
    const result = await this.pool.query('SELECT * FROM analistas');
    return result.rows.map((row) => this.mapearFila(row));
  }

  private mapearFila(row: {
    id: string;
    nombre: string;
    correo: string;
    contrasena_hash: string;
    rol: 'analista' | 'administrador';
    bloqueado: boolean;
    intentos_fallidos: number;
    bloqueado_hasta: Date | null;
  }): Analista {
    return new Analista(
      row.id,
      row.nombre,
      new Correo(row.correo),
      row.contrasena_hash,
      row.rol,
      row.bloqueado,
      row.intentos_fallidos,
      row.bloqueado_hasta
    );
  }
}
