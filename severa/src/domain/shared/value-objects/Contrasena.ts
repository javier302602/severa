import { ContrasenaInvalidaError } from '../../errors/ContrasenaInvalidaError';

const LONGITUD_MINIMA = 8;

// HU-01: "contraseña mínimo 8 caracteres". Usado hoy solo por el flujo de
// restablecimiento (RF-03) — RegistrarAnalista.ts (RF-01) queda pendiente de
// adoptar esta misma validación, como punto separado fuera de este RF.
export class Contrasena {
  public readonly valor: string;

  constructor(valor: string) {
    if (!valor || valor.length < LONGITUD_MINIMA) {
      throw new ContrasenaInvalidaError();
    }
    this.valor = valor;
  }
}
