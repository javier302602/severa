import { versionesEnElCamino } from '../../../../src/domain/services/data-cleaning/LinajeDeVersiones';

// RF-136: las versiones forman un árbol. "Qué se hizo para llegar a la
// versión N" son solo las versiones del camino desde el original hasta N.
describe('versionesEnElCamino', () => {
  // 0 ── 1 ── 2 ── 5
  //  └── 3 ── 4
  const VERSIONES = [
    { version: 0, versionBase: null },
    { version: 1, versionBase: 0 },
    { version: 2, versionBase: 1 },
    { version: 3, versionBase: 0 },
    { version: 4, versionBase: 3 },
    { version: 5, versionBase: 2 }
  ];

  test('el original no tiene camino: no se le hizo nada', () => {
    expect(versionesEnElCamino(VERSIONES, 0)).toEqual([]);
  });

  test('una versión generada desde el original', () => {
    expect(versionesEnElCamino(VERSIONES, 1)).toEqual([1]);
    expect(versionesEnElCamino(VERSIONES, 3)).toEqual([3]);
  });

  test('una versión generada desde otra: todo el camino, del original hacia ella', () => {
    expect(versionesEnElCamino(VERSIONES, 2)).toEqual([1, 2]);
    expect(versionesEnElCamino(VERSIONES, 5)).toEqual([1, 2, 5]);
  });

  test('no incluye versiones de otras ramas, aunque tengan un número menor', () => {
    // 4 salió de 3, que salió del original: 1 y 2 no tienen nada que ver.
    expect(versionesEnElCamino(VERSIONES, 4)).toEqual([3, 4]);
  });

  test('no depende del orden en que vengan las versiones', () => {
    expect(versionesEnElCamino([...VERSIONES].reverse(), 5)).toEqual([1, 2, 5]);
  });

  test('una versión que no existe no tiene camino', () => {
    expect(versionesEnElCamino(VERSIONES, 9)).toEqual([]);
  });

  test('si falta una versión intermedia, devuelve el tramo que se pudo reconstruir', () => {
    const conHueco = VERSIONES.filter((nodo) => nodo.version !== 1);

    expect(versionesEnElCamino(conHueco, 5)).toEqual([2, 5]);
  });

  test('datos con un ciclo no cuelgan el proceso', () => {
    const conCiclo = [
      { version: 1, versionBase: 2 },
      { version: 2, versionBase: 1 }
    ];

    expect(versionesEnElCamino(conCiclo, 2)).toEqual([1, 2]);
  });
});
