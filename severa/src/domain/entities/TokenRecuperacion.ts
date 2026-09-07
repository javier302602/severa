export class TokenRecuperacion {
  constructor(
    public readonly id: string,
    public readonly analistaId: string,
    public readonly tokenHash: string,
    public readonly expiraEn: Date,
    public usado = false
  ) {}

  expirado(ahora: Date = new Date()): boolean {
    return this.expiraEn <= ahora;
  }

  marcarComoUsado(): void {
    this.usado = true;
  }
}
