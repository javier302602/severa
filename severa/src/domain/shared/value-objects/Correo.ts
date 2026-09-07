import { CorreoInvalidoError } from '../../errors/CorreoInvalidoError';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// RF-07 (Verificación de Correo Institucional) existe en el SDS pero está
// intencionalmente desactivado por decisión de producto: SEVERA no restringe
// el registro a un dominio de correo específico, para que cualquier
// investigador (gmail.com, .edu.pe, correo institucional u otro) pueda
// registrarse sin restricciones. `Correo` solo valida formato general.
export class Correo {
  public readonly valor: string;

  constructor(valor: string) {
    if (!EMAIL_REGEX.test(valor)) {
      throw new CorreoInvalidoError('El correo no tiene un formato válido');
    }

    this.valor = valor.toLowerCase();
  }
}
