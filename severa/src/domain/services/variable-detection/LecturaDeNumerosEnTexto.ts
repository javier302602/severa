// Cómo se lee un número escrito como texto, con coma o con punto decimal. Una
// sola definición para la lectura de CSV (LecturaDeTextoDelimitado, que
// convierte las celdas) y para el detector de tipos (DetectorDeTipoDeColumna,
// que decide si una columna es numérica): si la lectura deja un valor como
// texto por ser un código o por ser ambiguo, el detector no puede volver a
// leerlo como número por su cuenta.

export const ENTERO = /^[+-]?\d+$/;
// Punto decimal, con o sin coma de miles, con notación científica ("1,234.56",
// "1234.56", ".5", "3.", "2e-3", "1.5E+4").
export const CON_PUNTO = /^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
// Coma decimal, con o sin punto de miles, con notación científica ("1.234,56",
// "1234,56", "25,5", ",5", "1,5e-3").
export const CON_COMA = /^[+-]?(?:(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d*)?|,\d+)(?:[eE][+-]?\d+)?$/;
// "07001", "00123": un código, no un número. Leerlo como número le borra los
// ceros.
const CON_CERO_A_LA_IZQUIERDA = /^[+-]?0\d/;

export function leerConPunto(valor: string): number {
  return Number(valor.replace(/,/g, ''));
}

export function leerConComa(valor: string): number {
  return Number(valor.replace(/\./g, '').replace(',', '.'));
}

export function esCodigoConCerosALaIzquierda(valor: string): boolean {
  return CON_CERO_A_LA_IZQUIERDA.test(valor.trim());
}

// Se puede leer con las dos convenciones y da números distintos: "1,234"
// (¿mil doscientos treinta y cuatro o uno coma dos?), "196.627".
export function tieneLecturaAmbigua(valor: string): boolean {
  const limpio = valor.trim();
  return CON_PUNTO.test(limpio) && CON_COMA.test(limpio) && leerConPunto(limpio) !== leerConComa(limpio);
}
