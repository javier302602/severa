// RF-136: las versiones de un dataset forman un árbol, no una fila. La
// versión 3 puede haber salido de la 1 o directamente del original (cada una
// guarda de cuál partió, `versionBase`), así que "qué se le hizo a los datos
// para llegar a la versión N" NO es "todo lo que hay en la bitácora con un
// número menor": son solo las versiones que están en el camino desde el
// original hasta N.
export interface NodoDeVersion {
  version: number;
  versionBase: number | null;
}

// Las versiones procesadas por las que se pasó para llegar a `version`, del
// original hacia ella, sin incluir el original (versión 0).
//   versiones 0, 1(←0), 2(←1), 3(←0):  camino a 2 = [1, 2];  camino a 3 = [3]
// Si la cadena está rota (falta una versión intermedia, o los datos tienen un
// ciclo) devuelve el tramo que sí se pudo reconstruir, empezando por la
// versión pedida hacia atrás: es preferible un informe con la parte del
// camino que se conoce a un informe que no se genera.
export function versionesEnElCamino(versiones: NodoDeVersion[], version: number): number[] {
  const porNumero = new Map(versiones.map((nodo) => [nodo.version, nodo]));
  const camino: number[] = [];
  const visitadas = new Set<number>();

  let actual: number | null = version;
  while (actual !== null && actual !== 0 && !visitadas.has(actual)) {
    const nodo = porNumero.get(actual);
    if (!nodo) break;
    visitadas.add(actual);
    camino.unshift(actual);
    actual = nodo.versionBase;
  }

  return camino;
}
