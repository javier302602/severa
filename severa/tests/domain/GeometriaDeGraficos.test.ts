import {
  calcularGeometriaBarras,
  calcularGeometriaBarrasHorizontales,
  calcularGeometriaBoxplot,
  calcularGeometriaDispersion,
  calcularGeometriaPastel,
  calcularMarcasDeEje,
  puntoEnCirculo
} from '../../src/domain/services/GeometriaDeGraficos';

describe('GeometriaDeGraficos', () => {
  const lienzo = { ancho: 400, alto: 200 };

  describe('calcularMarcasDeEje', () => {
    test('rango pequeño de enteros (0-10): paso redondo, min/max cubren el rango de datos', () => {
      const marcas = calcularMarcasDeEje(0, 9);
      expect(marcas.minimo).toBeLessThanOrEqual(0);
      expect(marcas.maximo).toBeGreaterThanOrEqual(9);
      // Heckbert: el paso siempre es 1, 2 o 5 (por una potencia de 10) — nunca un número arbitrario como 3 o 7.
      const mantisaPaso = marcas.paso / Math.pow(10, Math.floor(Math.log10(marcas.paso)));
      expect([1, 2, 5]).toContain(Number(mantisaPaso.toFixed(5)));
    });

    test('rango grande (miles): paso también redondo, no fragmentado en números arbitrarios', () => {
      const marcas = calcularMarcasDeEje(0, 7430);
      expect(marcas.maximo).toBeGreaterThanOrEqual(7430);
      expect(marcas.valores[0]).toBe(marcas.minimo);
      expect(marcas.valores[marcas.valores.length - 1]).toBeCloseTo(marcas.maximo, 6);
      // Diferencia constante entre marcas consecutivas (progresión aritmética real).
      for (let i = 1; i < marcas.valores.length; i++) {
        expect(marcas.valores[i] - marcas.valores[i - 1]).toBeCloseTo(marcas.paso, 6);
      }
    });

    test('rango con decimales (CVSS 0-10) no deja marcas con arrastre de punto flotante', () => {
      const marcas = calcularMarcasDeEje(0.2, 9.8);
      marcas.valores.forEach((valor) => {
        // Ej.: nada como 2.6000000000000005 — el valor debe sobrevivir un round-trip de toFixed(10).
        expect(valor).toBeCloseTo(Number(valor.toFixed(10)), 10);
      });
    });

    test('con min === max (rango degenerado) no rompe y produce un rango no vacío', () => {
      const marcas = calcularMarcasDeEje(5, 5);
      expect(marcas.maximo).toBeGreaterThan(marcas.minimo);
      expect(marcas.valores.length).toBeGreaterThan(1);
    });

    test('con min === max === 0 no rompe (caso borde: catálogo vacío/todo en cero)', () => {
      const marcas = calcularMarcasDeEje(0, 0);
      expect(marcas.maximo).toBeGreaterThan(0);
      expect(Number.isFinite(marcas.paso)).toBe(true);
    });

    test('min y max invertidos (max < min) se reordenan solos', () => {
      const marcas = calcularMarcasDeEje(10, 0);
      expect(marcas.minimo).toBeLessThanOrEqual(0);
      expect(marcas.maximo).toBeGreaterThanOrEqual(10);
    });
  });

  describe('calcularGeometriaBarras', () => {
    // Antes (bug real reportado con capturas): las barras escalaban contra
    // el valor máximo CRUDO de los datos, así que la barra más alta SIEMPRE
    // tocaba el 100% del área — sin dejar lugar a que un eje con marcas en
    // números redondos (0, 2, 4...) se dibujara alineado. Ahora el 100% del
    // área representa marcasEje.maximo (el techo "lindo"), igual que
    // matplotlib/ggplot2 — la barra más alta llega a `valor/techo`, no
    // necesariamente al borde.
    test('la barra con el valor máximo se escala contra marcasEje.maximo, no contra su propio valor', () => {
      const { barras, area, marcasEje } = calcularGeometriaBarras(
        [
          { etiqueta: 'A', valor: 10 },
          { etiqueta: 'B', valor: 5 }
        ],
        lienzo
      );

      expect(barras).toHaveLength(2);
      const altoEsperadoA = (10 / marcasEje.maximo) * area.alto;
      const altoEsperadoB = (5 / marcasEje.maximo) * area.alto;
      expect(barras[0].alto).toBeCloseTo(altoEsperadoA, 5);
      expect(barras[1].alto).toBeCloseTo(altoEsperadoB, 5);
      // y + alto de cada barra siempre debe tocar la base del área (barras "paradas" desde abajo).
      barras.forEach((barra) => expect(barra.y + barra.alto).toBeCloseTo(area.y + area.alto, 5));
    });

    test('expone marcasEje calculado con calcularMarcasDeEje(0, valorMaximo)', () => {
      const { marcasEje } = calcularGeometriaBarras([{ etiqueta: 'A', valor: 7430 }], lienzo);
      expect(marcasEje).toEqual(calcularMarcasDeEje(0, 7430));
    });

    test('con datos vacíos no rompe (valorMaximo mínimo de 1, sin barras)', () => {
      const { barras, valorMaximo } = calcularGeometriaBarras([], lienzo);
      expect(barras).toHaveLength(0);
      expect(valorMaximo).toBe(1);
    });
  });

  describe('calcularGeometriaBarrasHorizontales', () => {
    test('la barra con el valor máximo se escala contra marcasEje.maximo, no contra su propio valor', () => {
      const { barras, area, marcasEje } = calcularGeometriaBarrasHorizontales(
        [
          { etiqueta: 'Code Injection', valor: 8 },
          { etiqueta: 'Buffer Overflow', valor: 4 }
        ],
        lienzo
      );

      expect(barras).toHaveLength(2);
      expect(barras[0].ancho).toBeCloseTo((8 / marcasEje.maximo) * area.ancho, 5);
      expect(barras[1].ancho).toBeCloseTo((4 / marcasEje.maximo) * area.ancho, 5);
      // Todas las barras horizontales arrancan en el mismo borde izquierdo del área.
      barras.forEach((barra) => expect(barra.x).toBeCloseTo(area.x, 5));
    });

    test('con datos vacíos no rompe (valorMaximo mínimo de 1, sin barras)', () => {
      const { barras, valorMaximo } = calcularGeometriaBarrasHorizontales([], lienzo);
      expect(barras).toHaveLength(0);
      expect(valorMaximo).toBe(1);
    });
  });

  describe('calcularGeometriaBoxplot', () => {
    test('la mediana queda dentro del rango vertical de la caja (entre Q1 y Q3)', () => {
      const geometria = calcularGeometriaBoxplot({ minimo: 1, q1: 3, mediana: 5, q3: 8, maximo: 10, media: 5.5 }, lienzo);

      // En coordenadas y-hacia-abajo, Q3 (valor mayor) debe quedar MÁS ARRIBA (y menor) que Q1.
      expect(geometria.caja.y).toBeLessThan(geometria.caja.y + geometria.caja.alto);
      expect(geometria.lineaMediana.y1).toBeGreaterThanOrEqual(geometria.caja.y);
      expect(geometria.lineaMediana.y1).toBeLessThanOrEqual(geometria.caja.y + geometria.caja.alto);
    });

    test('el bigote superior conecta Q3 con el máximo, más arriba que la caja', () => {
      const geometria = calcularGeometriaBoxplot({ minimo: 0, q1: 2, mediana: 4, q3: 6, maximo: 10, media: 4 }, lienzo);
      expect(geometria.bigoteSuperior.y2).toBeLessThan(geometria.caja.y);
    });
  });

  describe('calcularGeometriaDispersion', () => {
    test('devuelve un punto posicionado por cada dato de entrada', () => {
      const { puntos } = calcularGeometriaDispersion(
        [
          { x: 1, y: 10 },
          { x: 2, y: 20 },
          { x: 3, y: 15 }
        ],
        lienzo
      );
      expect(puntos).toHaveLength(3);
    });

    test('con una relación lineal perfecta, la línea de tendencia pasa por los puntos', () => {
      const { puntos, lineaTendencia } = calcularGeometriaDispersion(
        [
          { x: 0, y: 0 },
          { x: 10, y: 10 }
        ],
        lienzo
      );
      expect(lineaTendencia).toBeDefined();
      // Con solo 2 puntos en una recta perfecta, la línea de tendencia coincide exactamente con ellos.
      expect(lineaTendencia!.x1).toBeCloseTo(puntos[0].cx, 5);
      expect(lineaTendencia!.y1).toBeCloseTo(puntos[0].cy, 5);
    });

    test('sin puntos, no rompe y no arma línea de tendencia', () => {
      const { puntos, lineaTendencia } = calcularGeometriaDispersion([], lienzo);
      expect(puntos).toHaveLength(0);
      expect(lineaTendencia).toBeUndefined();
    });
  });

  describe('calcularGeometriaPastel', () => {
    test('las porciones cubren los 360 grados completos, en el mismo orden que los datos', () => {
      const { porciones } = calcularGeometriaPastel(
        [
          { etiqueta: 'Crítica', valor: 30 },
          { etiqueta: 'Alta', valor: 40 },
          { etiqueta: 'Baja', valor: 30 }
        ],
        lienzo
      );

      expect(porciones[0].anguloInicioGrados).toBe(0);
      expect(porciones[porciones.length - 1].anguloFinGrados).toBeCloseTo(360, 5);
      expect(porciones[1].anguloInicioGrados).toBeCloseTo(porciones[0].anguloFinGrados, 5);
      expect(porciones.reduce((total, porcion) => total + porcion.porcentaje, 0)).toBeCloseTo(1, 5);
    });

    test('con total 0, ninguna porción rompe con división por cero', () => {
      const { porciones } = calcularGeometriaPastel([{ etiqueta: 'A', valor: 0 }], lienzo);
      expect(porciones[0].porcentaje).toBe(0);
    });
  });

  describe('puntoEnCirculo', () => {
    test('a 0 grados (arriba) el punto queda directamente sobre el centro', () => {
      const punto = puntoEnCirculo({ x: 100, y: 100 }, 50, 0);
      expect(punto.x).toBeCloseTo(100, 5);
      expect(punto.y).toBeCloseTo(50, 5);
    });

    test('a 90 grados el punto queda a la derecha del centro', () => {
      const punto = puntoEnCirculo({ x: 100, y: 100 }, 50, 90);
      expect(punto.x).toBeCloseTo(150, 5);
      expect(punto.y).toBeCloseTo(100, 5);
    });
  });
});
