import PDFDocument from 'pdfkit';
import {
  dibujarBarras,
  dibujarBarrasHorizontales,
  dibujarHistograma,
  dibujarBoxplot,
  dibujarBoxplotDoble,
  dibujarDispersion,
  dibujarPastel,
  dibujarHeatmap
} from '../../../../../src/infrastructure/adapters/out/reportes/DibujoDeGraficosPdf';

// Bug real: las coordenadas de la geometría (relativas al lienzo del gráfico)
// se usaban como coordenadas absolutas de la página. Con el margen de 72 pt
// del informe, cada gráfico quedaba corrido 72 pt a la izquierda del texto, y
// en los Top 10 las barras tapaban los nombres que debían leerse a su
// izquierda: los gráficos 9 y 10 del informe PDF salían sin etiquetas.
// Los tests de "genera un PDF válido" no lo veían — el PDF era válido.
//
// Acá se espía lo que pdfkit recibe (posición de cada texto, rectángulo y
// círculo) para verificar DÓNDE se dibuja, no solo que se dibuja.
const MARGEN = 72;

interface Registro {
  textos: Array<{ texto: string; x: number; y: number; ancho?: number }>;
  rectangulos: Array<{ x: number; y: number; ancho: number; alto: number }>;
  circulos: Array<{ x: number; y: number }>;
  lineas: Array<{ x: number; y: number }>;
}

function documentoEspiado(): { doc: PDFKit.PDFDocument; registro: Registro } {
  const doc = new PDFDocument({ margin: MARGEN, size: 'LETTER' });
  const registro: Registro = { textos: [], rectangulos: [], circulos: [], lineas: [] };

  const textoOriginal = doc.text.bind(doc);
  jest.spyOn(doc, 'text').mockImplementation(((...args: unknown[]) => {
    const [texto, x, y, opciones] = args as [string, number | undefined, number | undefined, { width?: number } | undefined];
    if (typeof x === 'number' && typeof y === 'number') registro.textos.push({ texto, x, y, ancho: opciones?.width });
    return (textoOriginal as (...a: unknown[]) => PDFKit.PDFDocument)(...args);
  }) as typeof doc.text);

  const rectOriginal = doc.rect.bind(doc);
  jest.spyOn(doc, 'rect').mockImplementation((x: number, y: number, ancho: number, alto: number) => {
    registro.rectangulos.push({ x, y, ancho, alto });
    return rectOriginal(x, y, ancho, alto);
  });

  const circuloOriginal = doc.circle.bind(doc);
  jest.spyOn(doc, 'circle').mockImplementation((x: number, y: number, radio: number) => {
    registro.circulos.push({ x, y });
    return circuloOriginal(x, y, radio);
  });

  for (const metodo of ['moveTo', 'lineTo'] as const) {
    const original = doc[metodo].bind(doc);
    jest.spyOn(doc, metodo).mockImplementation((x: number, y: number) => {
      registro.lineas.push({ x, y });
      return original(x, y);
    });
  }

  return { doc, registro };
}

const BORDE_IZQUIERDO = MARGEN;
const BORDE_DERECHO = 612 - MARGEN; // LETTER mide 612 pt de ancho

const TOP = [
  { etiqueta: 'Apache Log4j', valor: 12 },
  { etiqueta: 'Microsoft Windows Server 2019 Datacenter Edition', valor: 9 },
  { etiqueta: 'OpenSSL', valor: 4 }
];

describe('DibujoDeGraficosPdf — posición de lo que se dibuja', () => {
  test('barras horizontales (Top 10): el nombre de cada barra termina antes de donde la barra empieza, no debajo de ella', () => {
    const { doc, registro } = documentoEspiado();

    dibujarBarrasHorizontales(doc, TOP, { titulo: 'Top 10 software', etiquetaEjeX: 'Cantidad' });

    expect(registro.rectangulos).toHaveLength(TOP.length);
    const inicioDeBarras = Math.min(...registro.rectangulos.map((rect) => rect.x));
    TOP.forEach((dato) => {
      // La etiqueta larga se trunca con "…": se busca por su comienzo.
      const etiqueta = registro.textos.find((texto) => texto.texto.startsWith(dato.etiqueta.slice(0, 10)));
      expect(etiqueta).toBeDefined();
      expect(etiqueta!.x).toBeGreaterThanOrEqual(BORDE_IZQUIERDO);
      expect(etiqueta!.x + (etiqueta!.ancho ?? 0)).toBeLessThanOrEqual(inicioDeBarras);
    });
  });

  test('barras horizontales: el valor de cada barra queda a su derecha', () => {
    const { doc, registro } = documentoEspiado();

    dibujarBarrasHorizontales(doc, TOP, { titulo: 'Top 10 software' });

    registro.rectangulos.forEach((rect, indice) => {
      const valor = registro.textos.find((texto) => texto.texto === String(TOP[indice].valor) && Math.abs(texto.y - (rect.y + rect.alto / 2 - 4)) < 0.01);
      expect(valor).toBeDefined();
      expect(valor!.x).toBeGreaterThan(rect.x + rect.ancho);
    });
  });

  const DIBUJOS: Array<[string, (doc: PDFKit.PDFDocument) => number]> = [
    ['dibujarBarras', (doc) => dibujarBarras(doc, [{ etiqueta: 'Crítica', valor: 5 }, { etiqueta: 'Alta', valor: 2 }], { titulo: 'Barras', etiquetaEjeX: 'Severidad', etiquetaEjeY: 'Cantidad' })],
    ['dibujarBarrasHorizontales', (doc) => dibujarBarrasHorizontales(doc, TOP, { titulo: 'Top', etiquetaEjeX: 'Cantidad' })],
    ['dibujarHistograma', (doc) => dibujarHistograma(doc, [{ intervalo: '0-2', frecuencia: 3 }, { intervalo: '2-4', frecuencia: 5 }], 2.5, 2, { titulo: 'Histograma', etiquetaEjeX: 'CVSS', etiquetaEjeY: 'Frecuencia' })],
    ['dibujarBoxplot', (doc) => dibujarBoxplot(doc, { minimo: 0, q1: 2, mediana: 5, q3: 8, maximo: 10, media: 5 }, { titulo: 'Boxplot', etiquetaEjeY: 'CVSS Score' })],
    [
      'dibujarBoxplotDoble',
      (doc) =>
        dibujarBoxplotDoble(
          doc,
          { etiqueta: 'Remoto', resumen: { minimo: 1, q1: 3, mediana: 6, q3: 8, maximo: 10, media: 6 } },
          { etiqueta: 'Local', resumen: null },
          { titulo: 'Boxplot doble', etiquetaEjeY: 'CVSS Score' }
        )
    ],
    ['dibujarDispersion', (doc) => dibujarDispersion(doc, [{ x: 1, y: 2 }, { x: 3, y: 9 }, { x: 5, y: 4 }], 0.4, { titulo: 'Dispersión', etiquetaEjeX: 'CVSS', etiquetaEjeY: 'Días para parche' })],
    ['dibujarPastel', (doc) => dibujarPastel(doc, [{ etiqueta: 'Crítica', valor: 5 }, { etiqueta: 'Baja', valor: 1 }], { titulo: 'Pastel' })],
    [
      'dibujarHeatmap',
      (doc) =>
        dibujarHeatmap(
          doc,
          {
            columnas: ['Precio', 'Cantidad'],
            filas: [
              { columna: 'Precio', correlaciones: [{ columna: 'Precio', valor: 1 }, { columna: 'Cantidad', valor: -0.3 }] },
              { columna: 'Cantidad', correlaciones: [{ columna: 'Precio', valor: -0.3 }, { columna: 'Cantidad', valor: 1 }] }
            ],
            columnasExcluidas: []
          },
          { titulo: 'Heatmap' }
        )
    ]
  ];

  test.each(DIBUJOS)('%s: todo lo que dibuja queda dentro de la columna de texto de la página (no invade los márgenes)', (_nombre, dibujar) => {
    const { doc, registro } = documentoEspiado();

    dibujar(doc);

    const tolerancia = 0.01;
    registro.rectangulos.forEach((rect) => {
      expect(rect.x).toBeGreaterThanOrEqual(BORDE_IZQUIERDO - tolerancia);
      expect(rect.x + rect.ancho).toBeLessThanOrEqual(BORDE_DERECHO + tolerancia);
    });
    registro.circulos.forEach((circulo) => {
      expect(circulo.x).toBeGreaterThanOrEqual(BORDE_IZQUIERDO - tolerancia);
      expect(circulo.x).toBeLessThanOrEqual(BORDE_DERECHO + tolerancia);
    });
    registro.lineas.forEach((punto) => {
      expect(punto.x).toBeGreaterThanOrEqual(BORDE_IZQUIERDO - 4);
      expect(punto.x).toBeLessThanOrEqual(BORDE_DERECHO + 4);
    });
    registro.textos.forEach((texto) => expect(texto.x).toBeGreaterThanOrEqual(BORDE_IZQUIERDO - 35));
    expect(registro.rectangulos.length + registro.circulos.length + registro.lineas.length).toBeGreaterThan(0);
  });

  test.each(DIBUJOS)('%s: deja el cursor horizontal en el margen, así el párrafo siguiente no arranca sangrado', (_nombre, dibujar) => {
    const { doc } = documentoEspiado();

    dibujar(doc);

    expect(doc.x).toBe(MARGEN);
  });

  test.each(DIBUJOS)('%s: nada del gráfico se dibuja por encima del título', (_nombre, dibujar) => {
    const { doc, registro } = documentoEspiado();
    const yInicial = doc.y;

    dibujar(doc);

    const titulo = registro.textos[0];
    expect(titulo.y).toBe(yInicial);
    registro.rectangulos.forEach((rect) => expect(rect.y).toBeGreaterThanOrEqual(yInicial + 9));
    registro.circulos.forEach((circulo) => expect(circulo.y).toBeGreaterThanOrEqual(yInicial + 9));
  });

  test('heatmap: los nombres de columna van en su propio renglón, debajo del título (antes caían encima y quedaban tapados)', () => {
    const { doc, registro } = documentoEspiado();
    const yTitulo = doc.y;

    DIBUJOS.find(([nombre]) => nombre === 'dibujarHeatmap')![1](doc);

    const etiquetasDeColumna = registro.textos.filter((texto) => (texto.texto === 'Precio' || texto.texto === 'Cantidad') && texto.x > MARGEN + 70);
    expect(etiquetasDeColumna).toHaveLength(2);
    const grillaY = Math.min(...registro.rectangulos.map((rect) => rect.y));
    etiquetasDeColumna.forEach((etiqueta) => {
      // Debajo de la línea del título (10 pt de fuente) y encima de la grilla.
      expect(etiqueta.y).toBeGreaterThanOrEqual(yTitulo + 11);
      expect(etiqueta.y).toBeLessThan(grillaY);
    });
  });

  test('la etiqueta del eje Y se escribe en una sola línea sobre el eje, no partida a la izquierda de las marcas', () => {
    const { doc, registro } = documentoEspiado();

    DIBUJOS.find(([nombre]) => nombre === 'dibujarDispersion')![1](doc);

    const etiqueta = registro.textos.find((texto) => texto.texto === 'Días para parche');
    expect(etiqueta).toBeDefined();
    expect(etiqueta!.ancho).toBeUndefined();
    const marcas = registro.textos.filter((texto) => /^\d+$/.test(texto.texto) && texto.ancho === 28 && texto.x < etiqueta!.x);
    marcas.forEach((marca) => expect(marca.y).toBeGreaterThan(etiqueta!.y + 6));
  });
});
