import { RegistroDeAlertasEmitidas } from '../../src/application/ports/out/notificaciones/RegistroDeAlertasEmitidas';
import { ServicioDeNotificaciones } from '../../src/application/ports/out/notificaciones/ServicioDeNotificaciones';
import { EmisorDeAlertasDePlazo } from '../../src/application/usecases/module_notificaciones_alertas/EmisorDeAlertasDePlazo';
import { TipoDeAlertaDePlazo } from '../../src/domain/services/notificaciones/AlertasDePlazo';

// Doble de prueba de la memoria de alertas ya emitidas. Misma regla que
// PostgresRegistroDeAlertasEmitidas: una alerta de un tipo, para una
// vulnerabilidad de un analista, se registra una sola vez.
export class RegistroDeAlertasEmitidasEnMemoria implements RegistroDeAlertasEmitidas {
  readonly emitidas = new Set<string>();

  private clave(analistaId: string, tipo: TipoDeAlertaDePlazo, id: string): string {
    return `${analistaId}|${tipo}|${id}`;
  }

  async registrarNuevas(analistaId: string, tipo: TipoDeAlertaDePlazo, vulnerabilidadIds: string[]): Promise<string[]> {
    const nuevas: string[] = [];
    vulnerabilidadIds.forEach((id) => {
      const clave = this.clave(analistaId, tipo, id);
      if (!this.emitidas.has(clave)) {
        this.emitidas.add(clave);
        nuevas.push(id);
      }
    });
    return nuevas;
  }

  async olvidar(analistaId: string, tipo: TipoDeAlertaDePlazo, vulnerabilidadIds: string[]): Promise<void> {
    vulnerabilidadIds.forEach((id) => this.emitidas.delete(this.clave(analistaId, tipo, id)));
  }
}

// Un emisor de alertas de plazo con memoria en memoria, para los tests de los
// casos de uso que lo reciben.
export function emisorDeAlertasDePrueba(servicioDeNotificaciones: ServicioDeNotificaciones): EmisorDeAlertasDePlazo {
  return new EmisorDeAlertasDePlazo(new RegistroDeAlertasEmitidasEnMemoria(), servicioDeNotificaciones);
}
