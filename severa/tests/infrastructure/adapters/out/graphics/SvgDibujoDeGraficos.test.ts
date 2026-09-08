import { dibujarHistogramaFecha } from '../../../../../src/infrastructure/adapters/out/graphics/SvgDibujoDeGraficos';

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
