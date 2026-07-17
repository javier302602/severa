import { CvssFueraDeRangoError } from '../errors/CvssFueraDeRangoError';

export class CvssScore {
  public readonly valor: number;

  constructor(valor: number) {
    if (!Number.isFinite(valor) || valor < 0 || valor > 10) {
      throw new CvssFueraDeRangoError();
    }

    this.valor = valor;
  }
}
