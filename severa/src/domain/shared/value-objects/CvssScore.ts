import { CvssFueraDeRangoError } from '../../errors/CvssFueraDeRangoError';

export class CvssScore {
  public readonly valor: number;

  constructor(valor: number) {
    if (!Number.isFinite(valor) || valor < 0 || valor > 10) {
      throw new CvssFueraDeRangoError();
    }

    this.valor = valor;
  }

  // El puntaje tal como lo guarda la base: la columna cvss_score es
  // NUMERIC(3,1) y PostgreSQL redondea a un decimal, la mitad hacia arriba,
  // sobre el valor DECIMAL (8.95 → 9.0). Al leer un archivo o NVD hay que
  // redondear igual: si no, un 8.95 se clasifica como Alto mientras se importa
  // (alerta crítica, resumen de la importación) y queda guardado como 9.0,
  // Crítico, en el catálogo. Se redondea sobre la representación decimal del
  // número (la exponencial con 'e1') y no multiplicando el binario, para que
  // la regla sea literalmente la de PostgreSQL sobre el texto que recibe, sin
  // depender de cómo quede cada producto en coma flotante.
  static redondeado(valor: number): CvssScore {
    if (!Number.isFinite(valor)) return new CvssScore(valor);
    const enDecimas = Math.round(Number(`${valor}e1`));
    return new CvssScore(Number(`${enDecimas}e-1`));
  }
}
