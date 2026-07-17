import { CorreoInvalidoError } from '../errors/CorreoInvalidoError';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Correo {
  public readonly valor: string;

  constructor(valor: string, allowedDomains?: string[]) {
    if (!EMAIL_REGEX.test(valor)) {
      throw new CorreoInvalidoError('El correo no tiene un formato válido');
    }

    const dominio = valor.split('@')[1].toLowerCase();
    if (allowedDomains && allowedDomains.length > 0) {
      const dominiosPermitidos = allowedDomains.map((domain) => domain.toLowerCase());
      if (!dominiosPermitidos.includes(dominio)) {
        throw new CorreoInvalidoError(`El dominio del correo '${dominio}' no está permitido`);
      }
    }

    this.valor = valor.toLowerCase();
  }
}
