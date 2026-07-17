export type TipoAcceso = 'Remoto' | 'Local';

export class TipoAccesoValue {
  public readonly valor: TipoAcceso;

  constructor(valor: string) {
    const normalizado = valor.trim().toLowerCase();
    if (normalizado === 'remoto' || normalizado === 'sí' || normalizado === 'si' || normalizado === 'yes' || normalizado === 'true') {
      this.valor = 'Remoto';
      return;
    }
    if (normalizado === 'local' || normalizado === 'no' || normalizado === 'false') {
      this.valor = 'Local';
      return;
    }
    throw new Error(`Tipo de acceso inválido: ${valor}`);
  }
}
