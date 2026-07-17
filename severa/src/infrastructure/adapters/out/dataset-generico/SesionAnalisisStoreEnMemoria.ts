import { randomUUID } from 'crypto';
import { DatosDataset, SesionAnalisisStore } from '../../../../application/ports/out/SesionAnalisisStore';

// Mejora 4 (Análisis de Datos General) — Fase 3. Guarda en memoria del
// proceso las filas ya parseadas de un archivo subido, para que las Fases
// 3/4 (estadísticas descriptivas, análisis univariado, y lo que venga
// después) trabajen sobre un sesionId en vez de tener que volver a mandar el
// archivo — y en vez de reparsear el Excel/CSV crudo en cada request.
//
// LIMITACIÓN CONOCIDA (documentada con el mismo criterio que "sin
// persistencia" en AnalizarDatasetGenerico.ts): este store vive en un
// `Map` dentro del proceso de Node, no en una base de datos ni en un cache
// compartido (Redis, etc.). Si SEVERA llegara a correr con más de una
// instancia detrás de un load balancer (hoy no es el caso: ver
// docker-compose.yml, un solo contenedor de la API), una sesión creada en
// la instancia A no existe en la instancia B — /analisis-datos/analizar y
// las rutas de las Fases 3/4 que reciben ese sesionId tendrían que caer
// siempre en la misma instancia, o esto se rompe (404 falso, "sesión no
// encontrada" aunque exista en otro proceso). Aceptado para v1 del módulo,
// igual que las demás limitaciones conocidas del proyecto — no se resuelve
// acá, se documenta.
const TTL_MS = 30 * 60 * 1000;
const MAX_SESIONES = 100;

interface EntradaSesion {
  analistaId: string;
  datos: DatosDataset;
  expiraEn: number;
}

export class SesionAnalisisStoreEnMemoria implements SesionAnalisisStore {
  private readonly sesiones = new Map<string, EntradaSesion>();

  crear(analistaId: string, datos: DatosDataset): string {
    this.purgarExpiradas();

    // Tope de sesiones concurrentes: `Map` conserva el orden de inserción,
    // y como `obtener()` desliza `expiraEn` sin volver a insertar la clave,
    // ese orden sigue siendo el orden de CREACIÓN (no el de último acceso).
    // Por eso la primera clave que entrega el iterador es siempre la más
    // vieja por creación, que es el criterio de descarte pedido — no LRU.
    if (this.sesiones.size >= MAX_SESIONES) {
      const masVieja = this.sesiones.keys().next().value;
      if (masVieja !== undefined) {
        this.sesiones.delete(masVieja);
      }
    }

    const sesionId = randomUUID();
    this.sesiones.set(sesionId, { analistaId, datos, expiraEn: Date.now() + TTL_MS });
    return sesionId;
  }

  obtener(analistaId: string, sesionId: string): DatosDataset | undefined {
    const entrada = this.sesiones.get(sesionId);
    if (!entrada) return undefined;

    if (Date.now() > entrada.expiraEn) {
      this.sesiones.delete(sesionId);
      return undefined;
    }

    // IDOR (mismo criterio de Sprint 11/12): un sesionId válido pero de otro
    // analista se trata exactamente igual que uno inexistente — undefined,
    // nunca se revela que el id existe.
    if (entrada.analistaId !== analistaId) {
      return undefined;
    }

    // Expiración deslizante: cada acceso válido renueva los 30 minutos.
    entrada.expiraEn = Date.now() + TTL_MS;
    return entrada.datos;
  }

  private purgarExpiradas(): void {
    const ahora = Date.now();
    for (const [id, entrada] of this.sesiones) {
      if (ahora > entrada.expiraEn) {
        this.sesiones.delete(id);
      }
    }
  }
}
