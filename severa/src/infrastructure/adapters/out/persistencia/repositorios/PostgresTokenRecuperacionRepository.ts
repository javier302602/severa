import { Pool } from 'pg';
import { TokenRecuperacion } from '../../../../../domain/entities/TokenRecuperacion';
import { TokenRecuperacionRepository } from '../../../../../application/ports/out/persistencia/repositorios/TokenRecuperacionRepository';

export class PostgresTokenRecuperacionRepository implements TokenRecuperacionRepository {
  constructor(private readonly pool: Pool) {}

  async guardar(token: TokenRecuperacion): Promise<void> {
    const query = `INSERT INTO tokens_recuperacion (id, analista_id, token_hash, expira_en, usado)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET usado = $5`;
    await this.pool.query(query, [token.id, token.analistaId, token.tokenHash, token.expiraEn, token.usado]);
  }

  async buscarPorHash(tokenHash: string): Promise<TokenRecuperacion | null> {
    const result = await this.pool.query('SELECT * FROM tokens_recuperacion WHERE token_hash = $1', [tokenHash]);
    if (result.rowCount === 0) return null;
    return this.mapearFila(result.rows[0]);
  }

  async invalidarVigentesDeAnalista(analistaId: string): Promise<void> {
    await this.pool.query(
      'UPDATE tokens_recuperacion SET usado = TRUE WHERE analista_id = $1 AND usado = FALSE AND expira_en > now()',
      [analistaId]
    );
  }

  private mapearFila(row: {
    id: string;
    analista_id: string;
    token_hash: string;
    expira_en: Date;
    usado: boolean;
  }): TokenRecuperacion {
    return new TokenRecuperacion(row.id, row.analista_id, row.token_hash, row.expira_en, row.usado);
  }
}
