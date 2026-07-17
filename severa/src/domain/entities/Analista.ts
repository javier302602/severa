import { Correo } from '../value-objects/Correo';

export type RolAnalista = 'analista' | 'administrador';

const MAX_INTENTOS_FALLIDOS = 5;
const DURACION_BLOQUEO_MS = 15 * 60 * 1000;

export class Analista {
  constructor(
    public readonly id: string,
    public nombre: string,
    public correo: Correo,
    public contrasenaHash: string,
    public rol: RolAnalista,
    public bloqueado = false,
    public intentosFallidos = 0,
    public bloqueadoHasta: Date | null = null
  ) {}

  actualizarPerfil(nombre: string, correo: Correo): void {
    this.nombre = nombre;
    this.correo = correo;
  }

  bloquear(hasta: Date | null = null): void {
    this.bloqueado = true;
    this.bloqueadoHasta = hasta;
  }

  desbloquear(): void {
    this.bloqueado = false;
    this.bloqueadoHasta = null;
    this.intentosFallidos = 0;
  }

  // RF-06: bloqueo temporal por 15 minutos, no indefinido (ver SDS_SEVERA.txt línea 1831).
  // Se recalcula contra la hora actual en cada intento en vez de depender de un job
  // externo, para no requerir infraestructura de scheduling adicional.
  bloqueoExpirado(ahora: Date = new Date()): boolean {
    return this.bloqueado && this.bloqueadoHasta !== null && this.bloqueadoHasta <= ahora;
  }

  registrarIntentoFallido(ahora: Date = new Date()): void {
    this.intentosFallidos += 1;
    if (this.intentosFallidos >= MAX_INTENTOS_FALLIDOS) {
      this.bloquear(new Date(ahora.getTime() + DURACION_BLOQUEO_MS));
    }
  }

  registrarIntentoExitoso(): void {
    this.intentosFallidos = 0;
    this.bloqueado = false;
    this.bloqueadoHasta = null;
  }
}
