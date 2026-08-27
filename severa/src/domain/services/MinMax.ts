// Bug real reproducido en vivo (2026-07-19, dataset de 150k-350k filas):
// "Math.min(...valores)" / "Math.max(...valores)" pasan cada elemento del
// array como un argumento de función aparte (spread) — V8 tiene un límite de
// ~120k-130k argumentos por llamada, así que con un dataset grande esto
// lanza "RangeError: Maximum call stack size exceeded" (confirmado contra
// /graficos/histogramaCvss, /graficos/histogramaDiasParche,
// /graficos/dispersionCvssDias, y contra GenerarInforme/GenerarResumenEjecutivo,
// que reusan la misma función vía RecopilarDatosDeInforme). reduce() no tiene
// ese límite: itera un elemento a la vez sin acumular argumentos en la pila.
export function minimoDe(valores: number[]): number {
  return valores.reduce((minimo, valor) => (valor < minimo ? valor : minimo), valores[0]);
}

export function maximoDe(valores: number[]): number {
  return valores.reduce((maximo, valor) => (valor > maximo ? valor : maximo), valores[0]);
}
