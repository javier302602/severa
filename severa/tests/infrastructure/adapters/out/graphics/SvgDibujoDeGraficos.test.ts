import { dibujarHistogramaFecha, dibujarHeatmap } from '../../../../../src/infrastructure/adapters/out/graphics/SvgDibujoDeGraficos';
import { colorDivergenteCorrelacion } from '../../../../../src/domain/services/graphs/GeometriaDeGraficos';
import type { MatrizCorrelacion } from '../../../../../src/domain/services/descriptive-statistics/CorrelacionGenerico';

describe('dibujarHistogramaFecha — RF-58 (M-07, genérico)', () => {
  test('dibuja una barra por día calendario, con el rango de fechas en vez de media/mediana', () => {
    const bins = [
      { intervalo: '2024-01-15', frecuencia: 2 },
      { intervalo: '2024-03-10', frecuencia: 1 }
    ];

    const svg = dibujarHistogramaFecha(bins, '2024-01-15T00:00:00.000Z', '2024-03-10T00:00:00.000Z', {
      titulo: 'Histograma de fecha',
      etiquetaEjeX: 'fecha',
      etiquetaEjeY: 'Frecuencia'
    });

    expect(svg).toContain('<svg');
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(svg).toContain('2024-01-15');
    expect(svg).toContain('Rango: 2024-01-15 a 2024-03-10');
    expect(svg).not.toContain('Media=');
    expect(svg).not.toContain('Mediana=');
  });

  test('sin minimo/maximo (null), no dibuja la anotación de rango pero sigue siendo un SVG válido', () => {
    const svg = dibujarHistogramaFecha([], null, null, { titulo: 'Sin datos' });

    expect(svg).toContain('<svg');
    expect(svg).not.toContain('Rango:');
  });

  test('el SVG cambia según los bins recibidos (no es un placeholder fijo)', () => {
    const svgA = dibujarHistogramaFecha([{ intervalo: '2024-01-01', frecuencia: 1 }], '2024-01-01', '2024-01-01', { titulo: 'A' });
    const svgB = dibujarHistogramaFecha(
      [
        { intervalo: '2024-01-01', frecuencia: 1 },
        { intervalo: '2024-02-01', frecuencia: 5 }
      ],
      '2024-01-01',
      '2024-02-01',
      { titulo: 'A' }
    );

    expect(svgA).not.toBe(svgB);
  });
});

// M-10 Ronda 2, Pasada 2-D Paso 2 (RF-130): heatmap SVG para el informe Word
// del pipeline genérico.
describe('dibujarHeatmap — heatmap de correlación en SVG', () => {
  function matriz(columnas: string[], valores: Array<Array<number | null>>): MatrizCorrelacion {
    return {
      columnas,
      filas: columnas.map((columna, fila) => ({
        columna,
        correlaciones: columnas.map((otra, indice) => ({ columna: otra, valor: valores[fila][indice] }))
      })),
      columnasExcluidas: []
    };
  }

  test('dibuja una celda por par de columnas, pintada con la escala divergente del dominio', () => {
    const svg = dibujarHeatmap(
      matriz(['Precio', 'Unidades'], [
        [1, -0.8],
        [-0.8, 1]
      ]),
      { titulo: 'Heatmap de correlación de Pearson' }
    );

    // 4 celdas + el rectángulo de fondo blanco.
    expect((svg.match(/<rect/g) ?? []).length).toBe(5);
    expect((svg.match(new RegExp(`fill="${colorDivergenteCorrelacion(1)}"`, 'g')) ?? []).length).toBe(2);
    expect((svg.match(new RegExp(`fill="${colorDivergenteCorrelacion(-0.8)}"`, 'g')) ?? []).length).toBe(2);
    expect(svg).toContain('>-0.80<');
    expect(svg).toContain('Heatmap de correlación de Pearson');
    expect(svg).toContain('>Precio<');
  });

  test('un par sin datos suficientes (null) se rotula N/D en vez de inventar un color de la escala', () => {
    const svg = dibujarHeatmap(
      matriz(['A', 'B'], [
        [1, null],
        [null, 1]
      ]),
      { titulo: 'Heatmap' }
    );

    expect((svg.match(/>N\/D</g) ?? []).length).toBe(2);
    expect((svg.match(/fill="#e2e8f0"/g) ?? []).length).toBe(2);
  });

  test('el lienzo crece con la cantidad de columnas', () => {
    const alto = (svg: string) => Number(/viewBox="0 0 \d+ ([\d.]+)"/.exec(svg)?.[1]);
    const identidad = (n: number) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    const nombres = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);

    const chico = dibujarHeatmap(matriz(nombres(2), identidad(2)), { titulo: 'Heatmap' });
    const grande = dibujarHeatmap(matriz(nombres(9), identidad(9)), { titulo: 'Heatmap' });

    expect(alto(grande)).toBeGreaterThan(alto(chico));
  });

  test('nombres de columna con caracteres de marcado no rompen el SVG', () => {
    const svg = dibujarHeatmap(
      matriz(['a<b', 'c&d'], [
        [1, 0.5],
        [0.5, 1]
      ]),
      { titulo: 'Heatmap' }
    );

    expect(svg).toContain('a&lt;b');
    expect(svg).toContain('c&amp;d');
    expect(svg).not.toContain('>a<b<');
  });

  test('sin columnas elegibles devuelve un SVG válido con el aviso, sin celdas', () => {
    const svg = dibujarHeatmap({ columnas: [], filas: [], columnasExcluidas: [] }, { titulo: 'Heatmap' });

    expect(svg).toContain('<svg');
    expect(svg).toContain('No hay columnas numéricas elegibles para el heatmap.');
    expect((svg.match(/<rect/g) ?? []).length).toBe(1);
  });
});

describe('colorDivergenteCorrelacion — escala compartida por el heatmap PDF y el SVG', () => {
  test('extremos y centro de la escala: azul (-1), blanco (0), rojo (+1)', () => {
    expect(colorDivergenteCorrelacion(-1)).toBe('#1e40af');
    expect(colorDivergenteCorrelacion(0)).toBe('#ffffff');
    expect(colorDivergenteCorrelacion(1)).toBe('#dc2626');
  });

  test('valores fuera de [-1, 1] se acotan al extremo', () => {
    expect(colorDivergenteCorrelacion(3)).toBe(colorDivergenteCorrelacion(1));
    expect(colorDivergenteCorrelacion(-3)).toBe(colorDivergenteCorrelacion(-1));
  });
});
