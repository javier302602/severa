// Fase 0c: capa de cálculo de geometría de gráficos — pura, sin depender de
// SVG ni de pdfkit. Calcula POSICIONES (x, y, ancho, alto, coordenadas de
// puntos/ángulos) a partir de datos, en un sistema de coordenadas
// top-left/y-hacia-abajo — el mismo que usan tanto SVG como pdfkit — para
// que la misma geometría sirva de base tanto al renderizado en pantalla
// (SvgGraficosAdapter.ts) como al renderizado dentro del informe descargable
// (GeneradorInformePDF.ts), sin recalcular ni duplicar la lógica en dos
// lugares. Ningún renderer concreto vive acá: esto solo dice "dónde va cada
// cosa", nunca "cómo se dibuja".

import { minimoDe, maximoDe } from './MinMax';

export interface Lienzo {
  ancho: number;
  alto: number;
  margen?: { arriba: number; abajo: number; izquierda: number; derecha: number };
}

const MARGEN_POR_DEFECTO = { arriba: 30, abajo: 40, izquierda: 50, derecha: 20 };

export interface AreaDeTrazado {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

function areaDeTrazado(lienzo: Lienzo): AreaDeTrazado {
  const margen = lienzo.margen ?? MARGEN_POR_DEFECTO;
  return {
    x: margen.izquierda,
    y: margen.arriba,
    ancho: Math.max(0, lienzo.ancho - margen.izquierda - margen.derecha),
    alto: Math.max(0, lienzo.alto - margen.arriba - margen.abajo)
  };
}

// --- Marcas de eje ("nice numbers") ---
//
// Bug real reportado por el usuario con capturas: ningún gráfico con eje
// numérico (barras, histogramas, boxplot, dispersión) dibujaba marcas
// numéricas sobre el eje — solo la línea, sin valores. Esta función decide
// QUÉ números mostrar (no cómo dibujarlos: eso es de SvgDibujoDeGraficos.ts/
// DibujoDeGraficosPdf.ts), usando el algoritmo estándar de Paul Heckbert
// ("Nice Numbers for Graph Labels", Graphics Gems, 1990) — el mismo
// principio que matplotlib (MaxNLocator) y ggplot2 (scales::extended_breaks)
// usan para elegir marcas en números redondos (0, 2, 4, 6...) en vez de
// dividir el rango en partes arbitrarias. Es geometría/matemática pura (sin
// SVG ni pdfkit) para que la reutilicen ambos renderers sin duplicarla.
export interface MarcasDeEje {
  minimo: number;
  maximo: number;
  paso: number;
  valores: number[];
}

function numeroLindo(rango: number, redondearHaciaArriba: boolean): number {
  if (rango <= 0) return 1;
  const exponente = Math.floor(Math.log10(rango));
  const fraccion = rango / Math.pow(10, exponente);
  let fraccionLinda: number;

  if (redondearHaciaArriba) {
    if (fraccion <= 1) fraccionLinda = 1;
    else if (fraccion <= 2) fraccionLinda = 2;
    else if (fraccion <= 5) fraccionLinda = 5;
    else fraccionLinda = 10;
  } else {
    if (fraccion < 1.5) fraccionLinda = 1;
    else if (fraccion < 3) fraccionLinda = 2;
    else if (fraccion < 7) fraccionLinda = 5;
    else fraccionLinda = 10;
  }

  return fraccionLinda * Math.pow(10, exponente);
}

// `cantidadDeseada` es una meta (típicamente 5-6 marcas), no una garantía:
// el algoritmo prioriza que el paso entre marcas sea un número redondo por
// sobre respetar la cantidad exacta pedida — igual que matplotlib/ggplot2.
export function calcularMarcasDeEje(minimoDatos: number, maximoDatos: number, cantidadDeseada = 5): MarcasDeEje {
  let min = minimoDatos;
  let max = maximoDatos;
  if (min > max) {
    [min, max] = [max, min];
  }
  if (min === max) {
    // Rango degenerado (un solo valor, o todos los datos iguales): sin esto
    // numeroLindo(0, ...) forzaría un paso de 1 sin relación con la escala
    // real del valor (ej. todos los puntos en 1000.0 daría marcas 0..1, en
    // vez de algo entorno a 1000).
    const margen = min === 0 ? 1 : Math.abs(min) * 0.1;
    min -= margen;
    max += margen;
  }

  const rango = numeroLindo(max - min, false);
  const paso = numeroLindo(rango / Math.max(1, cantidadDeseada - 1), true);
  const minimo = Math.floor(min / paso) * paso;
  const maximo = Math.ceil(max / paso) * paso;

  const valores: number[] = [];
  const cantidadPasos = Math.round((maximo - minimo) / paso);
  for (let i = 0; i <= cantidadPasos; i++) {
    // Number(...toFixed(10)) purga el arrastre de coma flotante (ej.
    // 0.1 + 0.2 vueltas de suma) sin depender de sumar `paso` repetidamente,
    // que es justamente la operación que lo produce.
    valores.push(Number((minimo + i * paso).toFixed(10)));
  }

  return { minimo, maximo, paso, valores };
}

// --- Barras: también sirve para histogramas (un bin es una barra más) ---

export interface DatoBarra {
  etiqueta: string;
  valor: number;
}

export interface BarraPosicionada extends DatoBarra {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface GeometriaBarras {
  barras: BarraPosicionada[];
  valorMaximo: number;
  marcasEje: MarcasDeEje;
  area: AreaDeTrazado;
}

// Bug real reportado con capturas: las barras se escalaban contra el valor
// máximo CRUDO de los datos (ej. 7430), así que un eje con marcas en
// números redondos (0, 2000, 4000...) no tenía forma de dibujarse alineado
// con las barras — la marca de 8000, por ejemplo, quedaría por encima del
// techo del área de trazado. Ahora el 100% del área representa
// `marcasEje.maximo` (el techo "lindo", ej. 8000), no el dato máximo real
// (7430) — mismo criterio que el autoscaling de matplotlib/ggplot2, donde
// la barra más alta casi nunca toca literalmente el borde superior.
export function calcularGeometriaBarras(datos: DatoBarra[], lienzo: Lienzo): GeometriaBarras {
  const area = areaDeTrazado(lienzo);
  const valorMaximo = Math.max(1, ...datos.map((dato) => dato.valor));
  const marcasEje = calcularMarcasDeEje(0, valorMaximo);
  const techo = Math.max(marcasEje.maximo, 1);
  const espacioEntreBarras = datos.length > 0 ? area.ancho / datos.length : area.ancho;
  const anchoBarra = espacioEntreBarras * 0.7;

  const barras = datos.map((dato, indice) => {
    const alto = (dato.valor / techo) * area.alto;
    return {
      ...dato,
      x: area.x + indice * espacioEntreBarras + (espacioEntreBarras - anchoBarra) / 2,
      y: area.y + (area.alto - alto),
      ancho: anchoBarra,
      alto
    };
  });

  return { barras, valorMaximo, marcasEje, area };
}

// Igual que calcularGeometriaBarras pero con las barras corriendo en
// horizontal (de izquierda a derecha) — usada por los Top N (Gráfico 9/10
// del informe: tipos de vulnerabilidad y software más afectado), donde las
// etiquetas suelen ser demasiado largas para caber rotadas bajo una barra
// vertical.
export function calcularGeometriaBarrasHorizontales(datos: DatoBarra[], lienzo: Lienzo): GeometriaBarras {
  const area = areaDeTrazado(lienzo);
  const valorMaximo = Math.max(1, ...datos.map((dato) => dato.valor));
  const marcasEje = calcularMarcasDeEje(0, valorMaximo);
  const techo = Math.max(marcasEje.maximo, 1);
  const espacioEntreBarras = datos.length > 0 ? area.alto / datos.length : area.alto;
  const altoBarra = espacioEntreBarras * 0.7;

  const barras = datos.map((dato, indice) => {
    const ancho = (dato.valor / techo) * area.ancho;
    return {
      ...dato,
      x: area.x,
      y: area.y + indice * espacioEntreBarras + (espacioEntreBarras - altoBarra) / 2,
      ancho,
      alto: altoBarra
    };
  });

  return { barras, valorMaximo, marcasEje, area };
}

// --- Boxplot ---

export interface ResumenCincoNumeros {
  minimo: number;
  q1: number;
  mediana: number;
  q3: number;
  maximo: number;
  media: number;
}

export interface Segmento {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface GeometriaBoxplot extends ResumenCincoNumeros {
  caja: { x: number; y: number; ancho: number; alto: number };
  lineaMediana: Segmento;
  bigoteInferior: Segmento;
  bigoteSuperior: Segmento;
  puntoMedia: { x: number; y: number };
  marcasEje: MarcasDeEje;
  area: AreaDeTrazado;
}

export function calcularGeometriaBoxplot(valores: ResumenCincoNumeros, lienzo: Lienzo): GeometriaBoxplot {
  const area = areaDeTrazado(lienzo);
  const marcasEje = calcularMarcasDeEje(valores.minimo, valores.maximo);
  const rango = marcasEje.maximo - marcasEje.minimo || 1;
  const escalaY = (valor: number) => area.y + area.alto - ((valor - marcasEje.minimo) / rango) * area.alto;

  const anchoCaja = area.ancho * 0.4;
  const xCentro = area.x + area.ancho / 2;
  const xIzquierda = xCentro - anchoCaja / 2;

  return {
    ...valores,
    area,
    marcasEje,
    caja: { x: xIzquierda, y: escalaY(valores.q3), ancho: anchoCaja, alto: escalaY(valores.q1) - escalaY(valores.q3) },
    lineaMediana: { x1: xIzquierda, y1: escalaY(valores.mediana), x2: xIzquierda + anchoCaja, y2: escalaY(valores.mediana) },
    bigoteInferior: { x1: xCentro, y1: escalaY(valores.q1), x2: xCentro, y2: escalaY(valores.minimo) },
    bigoteSuperior: { x1: xCentro, y1: escalaY(valores.q3), x2: xCentro, y2: escalaY(valores.maximo) },
    puntoMedia: { x: xCentro, y: escalaY(valores.media) }
  };
}

// --- Dispersión (scatter), con línea de tendencia por regresión lineal ---

export interface PuntoDispersion {
  x: number;
  y: number;
}

export interface GeometriaDispersion {
  puntos: Array<{ cx: number; cy: number }>;
  lineaTendencia?: Segmento;
  marcasEjeX?: MarcasDeEje;
  marcasEjeY?: MarcasDeEje;
  area: AreaDeTrazado;
}

// Mínimos cuadrados — misma fórmula que usa lm() en el .qmd de referencia
// (Gráfico 7: CVSS vs. Días para Parche) para trazar la línea de tendencia.
function regresionLineal(puntos: PuntoDispersion[]): { pendiente: number; interseccion: number } | null {
  const n = puntos.length;
  if (n < 2) return null;

  const sumaX = puntos.reduce((acum, punto) => acum + punto.x, 0);
  const sumaY = puntos.reduce((acum, punto) => acum + punto.y, 0);
  const sumaXY = puntos.reduce((acum, punto) => acum + punto.x * punto.y, 0);
  const sumaX2 = puntos.reduce((acum, punto) => acum + punto.x * punto.x, 0);

  const denominador = n * sumaX2 - sumaX * sumaX;
  if (denominador === 0) return null;

  const pendiente = (n * sumaXY - sumaX * sumaY) / denominador;
  const interseccion = (sumaY - pendiente * sumaX) / n;
  return { pendiente, interseccion };
}

// Bug real reproducido en vivo (2026-07-19, /informes/completo con 350k
// puntos de dispersión): dibujar UN elemento vectorial por punto (círculo en
// PDFKit) sobre cientos de miles de puntos agota el heap construyendo el
// content stream del PDF ("FATAL ERROR: JavaScript heap out of memory" real,
// confirmado con docker logs). Un scatter plot con más de unos pocos miles
// de puntos tampoco es legible para un humano (se solapan). Se muestrea con
// paso uniforme (misma técnica que muestraRepresentativa en
// RecopilarDatosDeInforme.ts, para no inventar un segundo algoritmo de
// muestreo) solo para lo que se DIBUJA — min/max/línea de tendencia siguen
// calculándose sobre el conjunto COMPLETO, sin perder precisión estadística.
const LIMITE_PUNTOS_RENDERIZADOS = 2000;

function muestraDePuntos(puntos: PuntoDispersion[], limite: number): PuntoDispersion[] {
  if (puntos.length <= limite) {
    return puntos;
  }
  const paso = (puntos.length - 1) / (limite - 1);
  const indices = Array.from({ length: limite }, (_, i) => Math.round(i * paso));
  return [...new Set(indices)].map((indice) => puntos[indice]);
}

export function calcularGeometriaDispersion(puntos: PuntoDispersion[], lienzo: Lienzo): GeometriaDispersion {
  const area = areaDeTrazado(lienzo);

  if (puntos.length === 0) {
    return { puntos: [], area };
  }

  const xs = puntos.map((punto) => punto.x);
  const ys = puntos.map((punto) => punto.y);
  const minX = minimoDe(xs);
  const maxX = maximoDe(xs);
  const minY = minimoDe(ys);
  const maxY = maximoDe(ys);
  const marcasEjeX = calcularMarcasDeEje(minX, maxX);
  const marcasEjeY = calcularMarcasDeEje(minY, maxY);
  const rangoX = marcasEjeX.maximo - marcasEjeX.minimo || 1;
  const rangoY = marcasEjeY.maximo - marcasEjeY.minimo || 1;

  const escalaX = (x: number) => area.x + ((x - marcasEjeX.minimo) / rangoX) * area.ancho;
  const escalaY = (y: number) => area.y + area.alto - ((y - marcasEjeY.minimo) / rangoY) * area.alto;

  const puntosPosicionados = muestraDePuntos(puntos, LIMITE_PUNTOS_RENDERIZADOS).map((punto) => ({ cx: escalaX(punto.x), cy: escalaY(punto.y) }));

  const regresion = regresionLineal(puntos);
  const lineaTendencia = regresion
    ? {
        x1: escalaX(minX),
        y1: escalaY(regresion.pendiente * minX + regresion.interseccion),
        x2: escalaX(maxX),
        y2: escalaY(regresion.pendiente * maxX + regresion.interseccion)
      }
    : undefined;

  return { puntos: puntosPosicionados, lineaTendencia, marcasEjeX, marcasEjeY, area };
}

// --- Pastel (pie) ---

export interface DatoPastel {
  etiqueta: string;
  valor: number;
}

export interface PorcionPastel extends DatoPastel {
  anguloInicioGrados: number;
  anguloFinGrados: number;
  porcentaje: number;
}

export interface GeometriaPastel {
  porciones: PorcionPastel[];
  centro: { x: number; y: number };
  radio: number;
}

export function calcularGeometriaPastel(datos: DatoPastel[], lienzo: Lienzo): GeometriaPastel {
  const area = areaDeTrazado(lienzo);
  const total = datos.reduce((acum, dato) => acum + dato.valor, 0);
  const centro = { x: area.x + area.ancho / 2, y: area.y + area.alto / 2 };
  const radio = Math.min(area.ancho, area.alto) / 2;

  let anguloActual = 0;
  const porciones = datos.map((dato) => {
    const porcentaje = total === 0 ? 0 : dato.valor / total;
    const anguloInicioGrados = anguloActual;
    const anguloFinGrados = anguloActual + porcentaje * 360;
    anguloActual = anguloFinGrados;
    return { ...dato, anguloInicioGrados, anguloFinGrados, porcentaje };
  });

  return { porciones, centro, radio };
}

// --- Heatmap (matriz de correlación, Fase 5 de Mejora 4) ---

export interface CeldaHeatmapPosicionada {
  filaIndice: number;
  columnaIndice: number;
  x: number;
  y: number;
  ancho: number;
  alto: number;
  valor: number | null;
}

export interface GeometriaHeatmap {
  celdas: CeldaHeatmapPosicionada[];
  area: AreaDeTrazado;
  tamanoCelda: number;
}

// Grilla cuadrada N×N: cada celda es un cuadrado de lado `tamanoCelda`, sin
// escala de valor (a diferencia de barras/boxplot, acá el valor se codifica
// en el COLOR de la celda, no en su tamaño — ver colorDivergente en
// DibujoDeGraficosPdf.ts). `valor: null` (par de columnas sin datos
// suficientes en común, ver CorrelacionGenerico.ts) se posiciona igual que
// cualquier otra celda; es el renderer quien decide cómo pintarla.
export function calcularGeometriaHeatmap(valores: Array<Array<number | null>>, lienzo: Lienzo): GeometriaHeatmap {
  const area = areaDeTrazado(lienzo);
  const n = valores.length;
  const tamanoCelda = n > 0 ? Math.min(area.ancho, area.alto) / n : 0;

  const celdas: CeldaHeatmapPosicionada[] = [];
  for (let filaIndice = 0; filaIndice < n; filaIndice++) {
    for (let columnaIndice = 0; columnaIndice < n; columnaIndice++) {
      celdas.push({
        filaIndice,
        columnaIndice,
        x: area.x + columnaIndice * tamanoCelda,
        y: area.y + filaIndice * tamanoCelda,
        ancho: tamanoCelda,
        alto: tamanoCelda,
        valor: valores[filaIndice][columnaIndice]
      });
    }
  }

  return { celdas, area, tamanoCelda };
}

// Convierte un ángulo (grados, 0 = arriba, sentido horario) a un punto sobre
// una circunferencia — lo usan ambos renderers para construir los extremos
// de cada porción del pastel (SVG <path> con arco / pdfkit .path() o
// aproximación poligonal), sin que ninguno de los dos tenga que reimplementar
// trigonometría.
export function puntoEnCirculo(centro: { x: number; y: number }, radio: number, anguloGrados: number): { x: number; y: number } {
  const anguloRadianes = ((anguloGrados - 90) * Math.PI) / 180;
  return {
    x: centro.x + radio * Math.cos(anguloRadianes),
    y: centro.y + radio * Math.sin(anguloRadianes)
  };
}
