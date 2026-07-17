import {
  interpretarHistogramaCvss,
  interpretarHistogramaAgrupado,
  interpretarHistogramaDiasParche,
  interpretarBarrasSeveridad,
  interpretarPastelSeveridad,
  interpretarBoxplotCvss,
  interpretarCvssPorAcceso,
  interpretarDispersionCvssDias,
  interpretarTopTipos,
  interpretarTopSoftware
} from '../../src/domain/services/InterpretacionDeGraficos';

// Mejora "interpretación en prosa en Gráficos": estas funciones eran texto
// duplicado y con drift real entre GeneradorInformePDF.ts y
// GeneradorInformeWord.ts — extraídas acá para que las use también el
// endpoint en vivo. Cada test usa la MISMA forma de `datos` que ya recibe
// GraficosOutputPort.renderizarX (armada por GenerarGrafico.ts), no un
// fixture inventado.
describe('InterpretacionDeGraficos', () => {
  test('interpretarHistogramaCvss menciona la media y la mediana reales', () => {
    const texto = interpretarHistogramaCvss({ bins: [], media: 8.05, mediana: 8.6 });
    expect(texto).toContain('8.05');
    expect(texto).toContain('8.60');
  });

  test('interpretarHistogramaAgrupado no depende de datos (mismo texto genérico usado en las 3 superficies)', () => {
    expect(interpretarHistogramaAgrupado()).toContain('intervalo con mayor frecuencia');
  });

  test('interpretarHistogramaDiasParche: sin bins, dice que no hay datos', () => {
    expect(interpretarHistogramaDiasParche({ bins: [], media: 0, mediana: 0 })).toContain('No hay vulnerabilidades');
  });

  test('interpretarHistogramaDiasParche: con bins, informa el promedio real', () => {
    const texto = interpretarHistogramaDiasParche({ bins: [{ intervalo: '0-5', frecuencia: 3 }], media: 12.3, mediana: 10 });
    expect(texto).toContain('12.3');
  });

  test('interpretarBarrasSeveridad calcula el % de Crítica+Alta a partir de las 4 categorías, sin que se lo pasen aparte', () => {
    const datos = [
      { etiqueta: 'Baja', valor: 10 },
      { etiqueta: 'Media', valor: 40 },
      { etiqueta: 'Alta', valor: 30 },
      { etiqueta: 'Crítica', valor: 20 }
    ];
    // (30+20)/100 = 50%
    expect(interpretarBarrasSeveridad(datos)).toContain('50.0%');
  });

  test('interpretarBarrasSeveridad con total 0 no divide por cero', () => {
    const datos = [
      { etiqueta: 'Baja', valor: 0 },
      { etiqueta: 'Media', valor: 0 },
      { etiqueta: 'Alta', valor: 0 },
      { etiqueta: 'Crítica', valor: 0 }
    ];
    expect(interpretarBarrasSeveridad(datos)).toContain('0.0%');
  });

  test('interpretarPastelSeveridad es texto fijo (mismos datos que las barras, solo cambia la presentación)', () => {
    expect(interpretarPastelSeveridad()).toContain('leyenda');
  });

  test('interpretarBoxplotCvss menciona el máximo real', () => {
    expect(interpretarBoxplotCvss({ minimo: 0, q1: 2, mediana: 5, q3: 8, maximo: 9.8, media: 5 })).toContain('9.8');
  });

  test('interpretarCvssPorAcceso: diferencia despreciable (<0.05) dice que son prácticamente iguales', () => {
    const texto = interpretarCvssPorAcceso([
      { etiqueta: 'Remoto', valor: 7.0 },
      { etiqueta: 'Local', valor: 7.02 }
    ]);
    expect(texto).toContain('prácticamente igual');
  });

  test('interpretarCvssPorAcceso: remoto más severo lo nombra a él, con la diferencia real', () => {
    const texto = interpretarCvssPorAcceso([
      { etiqueta: 'Remoto', valor: 8.5 },
      { etiqueta: 'Local', valor: 6.0 }
    ]);
    expect(texto).toContain('remoto');
    expect(texto).toContain('2.50');
  });

  test('interpretarCvssPorAcceso: local más severo lo nombra a él', () => {
    const texto = interpretarCvssPorAcceso([
      { etiqueta: 'Remoto', valor: 5.0 },
      { etiqueta: 'Local', valor: 8.0 }
    ]);
    expect(texto).toContain('local');
  });

  test('interpretarDispersionCvssDias: menos de 2 puntos, dice que no hay datos suficientes', () => {
    expect(interpretarDispersionCvssDias({ puntos: [{ x: 5, y: 3 }], correlacion: 0 })).toContain('No hay suficientes');
  });

  test('interpretarDispersionCvssDias: con datos, informa la correlación real y su fuerza', () => {
    const debil = interpretarDispersionCvssDias({ puntos: [{ x: 1, y: 1 }, { x: 2, y: 2 }], correlacion: 0.1 });
    expect(debil).toContain('0.100');
    expect(debil).toContain('débil');

    const fuerte = interpretarDispersionCvssDias({ puntos: [{ x: 1, y: 1 }, { x: 2, y: 2 }], correlacion: 0.8 });
    expect(fuerte).toContain('apreciable');
  });

  test('interpretarTopTipos: sin datos, dice que no hay suficientes', () => {
    expect(interpretarTopTipos([])).toBe('No hay datos suficientes.');
  });

  test('interpretarTopTipos: nombra el primero de la lista real', () => {
    const texto = interpretarTopTipos([{ etiqueta: 'Code Injection', valor: 12 }, { etiqueta: 'XSS', valor: 5 }]);
    expect(texto).toContain('Code Injection');
    expect(texto).toContain('12');
  });

  // Bug real reportado con capturas: "Sin clasificar" dominaba el gráfico —
  // se excluye del ranking (ver generarTopTiposClasificados) y se informa
  // acá como nota aparte.
  test('interpretarTopTipos: con vulnerabilidades sin clasificar, agrega una nota con el conteo excluido', () => {
    const texto = interpretarTopTipos([{ etiqueta: 'Code Injection', valor: 12 }], 14231);
    expect(texto).toContain('Code Injection');
    expect(texto).toContain('14231');
    expect(texto).toContain('excluy');
  });

  test('interpretarTopTipos: si TODAS están sin clasificar (ranking vacío), lo dice explícitamente', () => {
    const texto = interpretarTopTipos([], 5);
    expect(texto).toContain('5');
    expect(texto).not.toBe('No hay datos suficientes.');
  });

  test('interpretarTopSoftware: nombra el primero de la lista real', () => {
    const texto = interpretarTopSoftware([{ etiqueta: 'Apache Log4j', valor: 9 }]);
    expect(texto).toContain('Apache Log4j');
    expect(texto).toContain('9');
  });
});
