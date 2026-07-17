import { SvgGraficosAdapter } from '../../src/infrastructure/adapters/out/graphics/SvgGraficosAdapter';

// Bug real encontrado en vivo (auditoría de cierre de Mejora 4): GET
// /graficos/:tipo devolvía SIEMPRE el mismo SVG placeholder — un rectángulo
// blanco con el título nomás — sin importar los datos reales calculados por
// GenerarGrafico.ts. Confirmado pidiendo el gráfico real contra un dataset
// importado: la respuesta nunca cambiaba con los datos. Este test falla
// contra esa versión (dos datasets distintos producían el mismo SVG) y pasa
// una vez que el adapter dibuja de verdad con GeometriaDeGraficos.ts, la
// misma capa de geometría que ya usa GeneradorInformePDF.ts para el PDF.
describe('SvgGraficosAdapter — dibuja de verdad, no un placeholder fijo', () => {
  const adapter = new SvgGraficosAdapter();

  test('renderizarHistograma: el SVG cambia según los bins recibidos y contiene una barra por bin con frecuencia > 0', async () => {
    const datosA = { bins: [{ intervalo: '0-2', frecuencia: 3 }], media: 1, mediana: 1 };
    const datosB = {
      bins: [
        { intervalo: '0-2', frecuencia: 3 },
        { intervalo: '2-4', frecuencia: 9 },
        { intervalo: '4-6', frecuencia: 0 }
      ],
      media: 2.5,
      mediana: 2
    };

    const svgA = (await adapter.renderizarHistograma(datosA, 'svg')) as string;
    const svgB = (await adapter.renderizarHistograma(datosB, 'svg')) as string;

    expect(svgA).not.toBe(svgB);
    expect(svgB).toContain('<rect');
    // 2 barras con frecuencia > 0 (la de frecuencia 0 no debería dibujar una
    // barra de altura negativa ni romper el SVG).
    expect((svgB.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test('renderizarBarras: una barra por elemento de datos, con la etiqueta real como texto', async () => {
    const datos = [
      { etiqueta: 'Crítica', valor: 5 },
      { etiqueta: 'Alta', valor: 2 }
    ];

    const svg = (await adapter.renderizarBarras(datos, 'svg')) as string;

    expect(svg).toContain('Crítica');
    expect(svg).toContain('Alta');
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test('renderizarBarrasHorizontales: una barra por elemento, con las etiquetas reales (ej. nombres de software)', async () => {
    const datos = [
      { etiqueta: 'Apache Log4j', valor: 12 },
      { etiqueta: 'OpenSSL', valor: 7 }
    ];

    const svg = (await adapter.renderizarBarrasHorizontales(datos, 'svg')) as string;

    expect(svg).toContain('Apache Log4j');
    expect(svg).toContain('OpenSSL');
  });

  // Bug real reportado con capturas en modo oscuro: el nombre de cada barra
  // (y la leyenda del pastel, más abajo) SÍ estaba en el SVG, pero dibujado
  // con el mismo color hex (#1e293b) que dark:bg-slate-800 — el fondo de la
  // tarjeta en modo oscuro — así que era invisible aunque técnicamente
  // "estuviera ahí". Confirmado visualmente con captura antes/después. El
  // fix es que el SVG lleve su propio fondo blanco fijo (envolverSvg), no
  // que dependa del fondo de la página que lo rodea.
  test('el SVG trae su propio fondo blanco, para que el texto sea legible sin importar el tema de la tarjeta que lo contiene', async () => {
    const datos = [
      { etiqueta: 'Apache Log4j', valor: 12 },
      { etiqueta: 'OpenSSL', valor: 7 }
    ];

    const svg = (await adapter.renderizarBarrasHorizontales(datos, 'svg')) as string;
    expect(svg).toMatch(/<rect[^>]*fill="#ffffff"/);
  });

  test('renderizarPastel: una porción (path) por categoría con datos', async () => {
    const datos = [
      { etiqueta: 'Crítica', valor: 3 },
      { etiqueta: 'Alta', valor: 1 },
      { etiqueta: 'Media', valor: 0 },
      { etiqueta: 'Baja', valor: 0 }
    ];

    const svg = (await adapter.renderizarPastel(datos, 'svg')) as string;

    // Las porciones con valor 0 no aportan ángulo — solo 2 arcos reales.
    expect((svg.match(/<path/g) ?? []).length).toBe(2);
    // Bug real reportado con capturas: la leyenda mostraba los cuadritos de
    // color pero sin texto al lado — el nombre de categoría y el
    // porcentaje ya estaban en el SVG (dibujarPastel los arma desde
    // siempre), el problema real era de contraste en modo oscuro (ver test
    // de fondo blanco más arriba), no de contenido faltante.
    expect(svg).toContain('Crítica: 3 (75.0%)');
    expect(svg).toContain('Alta: 1 (25.0%)');
    expect(svg).toMatch(/<rect[^>]*fill="#ffffff"/);
  });

  test('renderizarBoxplot: dibuja la caja según el resumen de cinco números recibido, no un placeholder fijo', async () => {
    const resumenA = { minimo: 0, q1: 2, mediana: 5, q3: 8, maximo: 10, media: 5 };
    const resumenB = { minimo: 1, q1: 1, mediana: 1, q3: 1, maximo: 1, media: 1 };

    const svgA = (await adapter.renderizarBoxplot(resumenA, 'svg')) as string;
    const svgB = (await adapter.renderizarBoxplot(resumenB, 'svg')) as string;

    expect(svgA).not.toBe(svgB);
  });

  test('renderizarDispersion: un punto por par (x,y), y muestra la correlación recibida', async () => {
    const puntos = [
      { x: 1, y: 10 },
      { x: 2, y: 20 },
      { x: 3, y: 15 }
    ];

    const svg = (await adapter.renderizarDispersion({ puntos, correlacion: 0.42 }, 'svg')) as string;

    expect((svg.match(/<circle/g) ?? []).length).toBe(3);
    expect(svg).toContain('0.42');
  });

  test('escapa texto con caracteres especiales de XML en las etiquetas (no rompe el SVG)', async () => {
    const datos = [{ etiqueta: 'R&D <Tool> "especial"', valor: 3 }];

    const svg = (await adapter.renderizarBarras(datos, 'svg')) as string;

    expect(svg).toContain('R&amp;D &lt;Tool&gt;');
    expect(svg).not.toContain('<Tool>');
  });

  test('formato json sigue devolviendo el passthrough {tipo, datos} tal cual (comportamiento preexistente, no debe romperse)', async () => {
    const datos = [{ etiqueta: 'Crítica', valor: 5 }];
    const resultado = await adapter.renderizarBarras(datos, 'json');
    expect(resultado).toEqual({ tipo: 'barras', datos });
  });

  test('formato png/pdf sigue devolviendo el aviso de exportación pendiente (comportamiento preexistente, no debe romperse)', async () => {
    const datosHistograma = { bins: [], media: 0, mediana: 0 };
    const svgPng = (await adapter.renderizarHistograma(datosHistograma, 'png')) as string;
    const svgPdf = (await adapter.renderizarHistograma(datosHistograma, 'pdf')) as string;

    expect(svgPng).toContain('PNG');
    expect(svgPdf).toContain('PDF');
    expect(svgPng).toContain('pendiente');
  });
});
