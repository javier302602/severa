export class IdentificadorCVE {
  public readonly valor: string;

  constructor(valor: string) {
    const regex = /^CVE-\d{4}-\d{4,}$/;
    if (!regex.test(valor)) {
      throw new Error(`Identificador CVE inválido: ${valor}`);
    }

    this.valor = valor.toUpperCase();
  }
}
