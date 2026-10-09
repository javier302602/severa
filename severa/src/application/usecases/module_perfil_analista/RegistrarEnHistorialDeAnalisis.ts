import { createHash, randomUUID } from 'crypto';
import { AnalisisRealizado } from '../../../domain/entities/AnalisisRealizado';
import {
  claveDeAnalisisDeSesion,
  claveDeAnalisisDelDia,
  DatosDeAnalisisRealizado,
  DATASET_DEL_CATALOGO,
  DATASET_SIN_GUARDAR,
  TipoDeAnalisisDeDataset,
  TipoDeAnalisisDelCatalogo
} from '../../../domain/services/historial/HistorialDeAnalisis';
import {
  OpcionesDeRegistroEnHistorial,
  RegistrarEnHistorialDeAnalisisUseCase
} from '../../ports/in/module_perfil_analista/RegistrarEnHistorialDeAnalisisUseCase';
import { HistorialAnalisisRepository } from '../../ports/out/persistencia/repositorios/HistorialAnalisisRepository';
import { DatasetGenericoRepository } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';

// Cuántas claves "ya anotadas" recuerda el proceso para no volver a tocar la
// base por un análisis repetido. Es solo un atajo: lo que de verdad impide el
// duplicado es el id determinista (también entre reinicios y entre réplicas).
const MAXIMO_DE_CLAVES_RECORDADAS = 20_000;

function idDeAnalisisUnico(analistaId: string, clave: string): string {
  return createHash('sha256').update(`${analistaId}\u0000${clave}`).digest('hex').slice(0, 40);
}

// RF-11: productor único del historial de análisis. Lo invocan los
// decoradores de container.ts (ver ConHistorialDeAnalisis.ts) después de que
// un análisis terminó bien.
export class RegistrarEnHistorialDeAnalisis implements RegistrarEnHistorialDeAnalisisUseCase {
  private readonly clavesRecordadas = new Set<string>();

  constructor(
    private readonly historialAnalisisRepository: HistorialAnalisisRepository,
    private readonly sesionAnalisisStore: SesionAnalisisStore,
    private readonly datasetGenericoRepository: DatasetGenericoRepository,
    private readonly ahora: () => Date = () => new Date()
  ) {}

  async deSesion(
    analistaId: string,
    sesionId: string,
    tipo: TipoDeAnalisisDeDataset,
    opciones: OpcionesDeRegistroEnHistorial = {}
  ): Promise<void> {
    await this.registrar(analistaId, tipo, opciones, claveDeAnalisisDeSesion(sesionId, tipo), async () => {
      const sesion = this.sesionAnalisisStore.obtener(analistaId, sesionId);
      // Sin sesión no se sabe sobre qué dataset fue: no se anota nada antes
      // que anotar un análisis sin dataset.
      if (!sesion) return null;
      if (!sesion.datasetId) return { dataset: DATASET_SIN_GUARDAR };

      const dataset = await this.datasetGenericoRepository.buscarPorId(sesion.datasetId, analistaId);
      if (!dataset) return { dataset: DATASET_SIN_GUARDAR };
      return { dataset: dataset.nombreArchivo, datasetId: dataset.id, version: dataset.version };
    });
  }

  async delCatalogo(analistaId: string, tipo: TipoDeAnalisisDelCatalogo, opciones: OpcionesDeRegistroEnHistorial = {}): Promise<void> {
    await this.registrar(analistaId, tipo, opciones, claveDeAnalisisDelDia(this.ahora(), tipo), async () => ({ dataset: DATASET_DEL_CATALOGO }));
  }

  private async registrar(
    analistaId: string,
    tipo: string,
    opciones: OpcionesDeRegistroEnHistorial,
    claveUnica: string,
    resolverDataset: () => Promise<DatosDeAnalisisRealizado | null>
  ): Promise<void> {
    try {
      const recordada = `${analistaId}\u0000${claveUnica}`;
      if (!opciones.cadaVez && this.clavesRecordadas.has(recordada)) return;

      const datos = await resolverDataset();
      if (!datos) return;

      const payload: Record<string, unknown> = { ...datos };
      if (opciones.detalle) payload.detalle = opciones.detalle;

      const id = opciones.cadaVez ? randomUUID() : idDeAnalisisUnico(analistaId, claveUnica);
      await this.historialAnalisisRepository.registrarSiEsNuevo(new AnalisisRealizado(id, analistaId, tipo, payload, this.ahora()));

      if (!opciones.cadaVez) this.recordar(recordada);
    } catch (error) {
      // El historial es accesorio: nunca le quita al analista el análisis que pidió.
      console.error(`[RF-11] No se pudo anotar "${tipo}" en el historial del analista ${analistaId}:`, error);
    }
  }

  private recordar(clave: string): void {
    if (this.clavesRecordadas.size >= MAXIMO_DE_CLAVES_RECORDADAS) this.clavesRecordadas.clear();
    this.clavesRecordadas.add(clave);
  }
}
