import { BloqueDeInforme, FragmentoDeTexto } from './BloquesDeInforme';

// RF-133: el informe como código fuente LaTeX compilable, para llevarlo a un
// paper o una tesis. Renderer de bloques (ver BloquesDeInforme.ts): mismo
// contenido que Word y HTML.
//
// El resultado no es un solo archivo: un .tex no puede llevar imágenes
// adentro, así que las figuras van como PNG en una carpeta aparte y el
// llamador (GeneradorInformePDF.generarInformeEnFormato) lo entrega todo en
// un .zip. `figuras` es la lista de esos archivos, con la ruta relativa que
// el .tex ya usa en cada \includegraphics.
//
// Compila con pdfLaTeX y XeLaTeX sin tocar nada: verificado con los dos, 0
// errores, sobre TeX Live básico (el caso más restrictivo: sin babel español
// ni Latin Modern Type 1 instalados) y con un dataset armado para romperlo
// (comandos LaTeX, marcado HTML, griego, cirílico, CJK y emoji en nombres de
// columna y celdas). LuaLaTeX usa el mismo camino que XeLaTeX en el
// preámbulo y también termina sin errores, pero no se pudo comprobar cómo
// compone: el LuaLaTeX del entorno de pruebas no carga fuentes OpenType (ni
// con un documento vacío) y cae a una codificación sin letras acentuadas.
// Para eso el preámbulo:
//   - elige codificación según el motor (iftex): inputenc/fontenc en pdfTeX;
//     nada en los otros dos, que leen UTF-8 nativo. No se carga fontspec:
//     no hace falta para compilar, y en una instalación sin luaotfload
//     operativo hace fallar a LuaLaTeX aun con un documento vacío;
//   - carga babel-spanish y lmodern SOLO si están instalados
//     (\IfFileExists) — mejoran el resultado, pero no pueden ser la razón de
//     que el documento no compile en una instalación mínima;
//   - no usa flotantes: cada figura queda exactamente donde el informe la
//     pone, igual que en los otros formatos.
export interface FiguraLatex {
  ruta: string;
  png: Buffer;
}

export interface InformeLatex {
  tex: string;
  figuras: FiguraLatex[];
}

// Caracteres con significado propio en LaTeX. El orden no importa porque se
// reemplaza carácter por carácter en una sola pasada (ver escaparLatex): así
// la barra invertida de "\textbackslash{}" no vuelve a escaparse.
const ESPECIALES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  _: '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  '<': '\\textless{}',
  '>': '\\textgreater{}',
  '|': '\\textbar{}',
  // Con babel-spanish las comillas rectas pueden ser un carácter activo
  // ("a = ª). Se cargan sin atajos (es-noshorthands), pero un .tex que el
  // usuario pegue en SU documento puede tenerlos activos. \symbol{34} y no
  // \textquotedbl: este último no existe en la codificación OT1, y hay
  // instalaciones donde LuaLaTeX cae a OT1.
  '"': '\\symbol{34}'
};

// Símbolos que el propio informe escribe (fórmulas en prosa, rayas,
// viñetas) y que pdfLaTeX no trae definidos en UTF-8. Los que LaTeX ya
// entiende solo (letras acentuadas, ñ, ¿, ¡) no necesitan estar acá.
const SIMBOLOS: Record<string, string> = {
  '×': '\\(\\times\\)',
  '÷': '\\(\\div\\)',
  '±': '\\(\\pm\\)',
  '≥': '\\(\\geq\\)',
  '≤': '\\(\\leq\\)',
  '≠': '\\(\\neq\\)',
  '≈': '\\(\\approx\\)',
  '→': '\\(\\rightarrow\\)',
  Σ: '\\(\\Sigma\\)',
  σ: '\\(\\sigma\\)',
  // Letra griega mu (U+03BC) y signo micro (U+00B5): se ven igual.
  'μ': '\\(\\mu\\)',
  'µ': '\\(\\mu\\)',
  '²': '\\textsuperscript{2}',
  '³': '\\textsuperscript{3}',
  '°': '\\textdegree{}',
  '—': '---',
  '–': '--',
  '…': '\\ldots{}',
  '“': '``',
  '”': "''",
  '‘': '`',
  '’': "'",
  '«': '\\guillemotleft{}',
  '»': '\\guillemotright{}',
  '•': '\\textbullet{}',
  '●': '\\textbullet{}',
  '€': '\\texteuro{}',
  // Espacio de no separación y espacio fino de no separación.
  ' ': '~',
  ' ': '\\,',
  '\t': ' '
};

// Rango que pdfLaTeX moderno (inputenc utf8 + T1) compone sin ayuda:
// ASCII imprimible y Latin-1/Latin Extended-A (español, portugués, francés,
// alemán...). Cualquier otra cosa — griego, cirílico, CJK, emoji en un valor
// de celda — pasa por \siadeunicode, que el preámbulo define según el motor:
// el carácter real en XeLaTeX/LuaLaTeX, un signo de pregunta en pdfLaTeX.
// Perder un carácter raro en un motor es mejor que un informe que no compila.
//
// Las 9 excepciones dentro del rango salen de probarlo: se compiló cada
// carácter de U+00A1 a U+017F con pdfLaTeX (T1 + utf8 + textcomp) y estos
// son los únicos que dan "Unicode character ... not set up for use with LaTeX".
const SIN_GLIFO_EN_PDFLATEX = new Set([0x126, 0x127, 0x138, 0x13f, 0x140, 0x149, 0x166, 0x167, 0x17f]);

function esComponibleDirecto(codigo: number): boolean {
  if (codigo >= 0x20 && codigo <= 0x7e) return true;
  return codigo >= 0xa1 && codigo <= 0x17f && !SIN_GLIFO_EN_PDFLATEX.has(codigo);
}

const MACRON_COMBINABLE = '̄';

export function escaparLatex(valor: string): string {
  // Por code point (no por unidad UTF-16): un emoji son dos unidades.
  const caracteres = Array.from(valor.normalize('NFC'));

  let salida = '';
  for (let i = 0; i < caracteres.length; i++) {
    const caracter = caracteres[i];
    const codigo = caracter.codePointAt(0)!;

    // "x̄" (letra + macrón combinable) es como el informe escribe la media
    // muestral. Las letras que tienen forma precompuesta (ā, ē...) ya las
    // unió la normalización NFC; esto cubre las que no la tienen.
    if (/^[A-Za-z]$/.test(caracter) && caracteres[i + 1] === MACRON_COMBINABLE) {
      salida += `\\(\\bar{${caracter}}\\)`;
      i += 1;
    } else if (caracter === '\n' || caracter === '\r') salida += ' ';
    else if (ESPECIALES[caracter] !== undefined) salida += ESPECIALES[caracter];
    else if (SIMBOLOS[caracter] !== undefined) salida += SIMBOLOS[caracter];
    else if (esComponibleDirecto(codigo)) salida += caracter;
    // Caracteres de control y marcas combinables sueltas: no tienen forma
    // de componerse en ningún motor, se descartan.
    else if (codigo < 0x20 || (codigo >= 0x7f && codigo <= 0xa0) || (codigo >= 0x300 && codigo <= 0x36f)) salida += '';
    else salida += `\\siadeunicode{${codigo.toString(16).toUpperCase()}}`;
  }
  return salida;
}

function fragmentosALatex(fragmentos: FragmentoDeTexto[]): string {
  return fragmentos
    .map((fragmento) => {
      let tex = escaparLatex(fragmento.texto);
      if (fragmento.cursiva) tex = `\\textit{${tex}}`;
      if (fragmento.negrita) tex = `\\textbf{${tex}}`;
      return tex;
    })
    .join('');
}

// Tabla de ancho completo con columnas iguales que parten línea (p{...}):
// las celdas llevan texto arbitrario del dataset, y una columna "l" con un
// valor largo se sale de la página. longtable porque el anexo puede tener
// cientos de filas; el encabezado se repite en cada página.
function tablaALatex(encabezados: string[], filas: string[][]): string {
  const columnas = Math.max(1, encabezados.length);
  const tamano = columnas <= 4 ? '\\small' : columnas <= 7 ? '\\footnotesize' : '\\scriptsize';
  const ancho = `\\dimexpr(\\linewidth-${columnas * 2}\\tabcolsep-${columnas + 1}\\arrayrulewidth)/${columnas}\\relax`;
  const especificacion = `|${`>{\\raggedright\\arraybackslash}p{${ancho}}|`.repeat(columnas)}`;
  const fila = (celdas: string[], negrita: boolean) =>
    // Una fila con menos celdas que columnas se completa: longtable no
    // compila con una fila corta seguida de \hline bajo reglas verticales.
    Array.from({ length: columnas }, (_, indice) => {
      const celda = escaparLatex(celdas[indice] ?? '');
      return negrita && celda !== '' ? `\\textbf{${celda}}` : celda;
    }).join(' & ') + ' \\\\ \\hline';

  return [
    `{${tamano}`,
    '\\setlength{\\tabcolsep}{4pt}',
    `\\begin{longtable}{${especificacion}}`,
    '\\hline',
    fila(encabezados, true),
    '\\endhead',
    ...filas.map((celdas) => fila(celdas, false)),
    '\\end{longtable}',
    '}'
  ].join('\n');
}

const PREAMBULO = String.raw`% Informe generado por SIADE.
% Compila con pdflatex o xelatex (dos pasadas para el índice):
%   pdflatex informe.tex && pdflatex informe.tex
\documentclass[11pt,a4paper]{article}

\usepackage{iftex}
\ifPDFTeX
  \usepackage[T1]{fontenc}
  \usepackage[utf8]{inputenc}
  \usepackage{textcomp}
  % Carácter fuera de lo que pdfLaTeX compone por sí solo.
  \newcommand{\siadeunicode}[1]{?}
\else
  % XeLaTeX/LuaLaTeX leen UTF-8 de forma nativa y el propio LaTeX ya carga
  % Latin Modern OpenType: no hace falta fontspec para compilar. Si tu
  % dataset tiene texto en griego, cirílico, chino, etc., agrega aquí
  %   \usepackage{fontspec}\setmainfont{<una fuente que los tenga>}
  \newcommand{\siadeunicode}[1]{\symbol{"#1}}
\fi
\IfFileExists{lmodern.sty}{\usepackage{lmodern}}{}
\IfFileExists{spanish.ldf}{\usepackage[spanish,es-noshorthands]{babel}}{}

\usepackage[margin=2.5cm]{geometry}
\usepackage{array}
\usepackage{longtable}
\usepackage{graphicx}
\usepackage[hidelinks]{hyperref}

\providecommand{\contentsname}{}
\renewcommand{\contentsname}{Índice}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0.6em}
\setcounter{tocdepth}{1}
\sloppy
`;

function nombreDeFigura(numero: number): string {
  return `figuras/figura-${String(numero).padStart(2, '0')}.png`;
}

export function renderizarInformeLatex(bloques: BloqueDeInforme[]): InformeLatex {
  const figuras: FiguraLatex[] = [];
  const cuerpo: string[] = [];
  let listaAbierta = false;

  const cerrarLista = () => {
    if (listaAbierta) {
      cuerpo.push('\\end{itemize}', '');
      listaAbierta = false;
    }
  };

  for (const bloque of bloques) {
    if (bloque.tipo !== 'vineta') cerrarLista();

    switch (bloque.tipo) {
      case 'titulo':
        cuerpo.push('\\begin{center}', `{\\LARGE\\bfseries ${escaparLatex(bloque.texto)}\\par}`, '\\end{center}', '');
        break;
      case 'subtituloDePortada':
        cuerpo.push('\\begin{center}', `{\\large\\bfseries ${escaparLatex(bloque.texto)}\\par}`, '\\end{center}', '');
        break;
      case 'indice':
        // \parskip a cero solo para el índice: el espacio entre párrafos del
        // cuerpo, aplicado a cada renglón del índice, lo estiraba a dos páginas.
        cuerpo.push('{\\setlength{\\parskip}{0pt}\\tableofcontents}', '\\clearpage', '');
        break;
      case 'encabezado': {
        // El texto ya trae su número ("9. Estadística descriptiva"), así que
        // se usa la forma con asterisco y se agrega al índice a mano — con
        // \section a secas LaTeX le antepondría su propia numeración.
        const textoEncabezado = escaparLatex(bloque.texto);
        if (bloque.nivel === 1) {
          if (bloque.saltoDePaginaAntes) cuerpo.push('\\clearpage');
          cuerpo.push(`\\phantomsection\\addcontentsline{toc}{section}{${textoEncabezado}}`, `\\section*{${textoEncabezado}}`, '');
        } else {
          cuerpo.push(`\\subsection*{${textoEncabezado}}`, '');
        }
        break;
      }
      case 'parrafo':
        cuerpo.push(fragmentosALatex(bloque.fragmentos), '');
        break;
      case 'vineta':
        if (!listaAbierta) {
          cuerpo.push('\\begin{itemize}');
          listaAbierta = true;
        }
        cuerpo.push(`  \\item ${escaparLatex(bloque.texto)}`);
        break;
      case 'tabla':
        cuerpo.push(tablaALatex(bloque.encabezados, bloque.filas), '');
        break;
      case 'figura': {
        const ruta = nombreDeFigura(figuras.length + 1);
        figuras.push({ ruta, png: bloque.png });
        cuerpo.push('\\begin{center}', `\\includegraphics[width=0.85\\linewidth]{${ruta}}`, '\\end{center}', '');
        break;
      }
      case 'epigrafe':
        cuerpo.push('\\begin{center}', `{\\small\\itshape ${escaparLatex(bloque.texto)}\\par}`, '\\end{center}', '');
        break;
      default: {
        const exhaustivo: never = bloque;
        throw new Error(`Bloque de informe no manejado: ${JSON.stringify(exhaustivo)}`);
      }
    }
  }
  cerrarLista();

  const tex = `${PREAMBULO}\n\\begin{document}\n\n${cuerpo.join('\n')}\n\\end{document}\n`;
  return { tex, figuras };
}

export const LEEME_LATEX = [
  'Informe SIADE en LaTeX',
  '======================',
  '',
  'Contenido de este paquete:',
  '  informe.tex   Código fuente del informe.',
  '  figuras/      Los gráficos del informe, en PNG. informe.tex los busca en esta carpeta.',
  '',
  'Para compilar (dos pasadas, la segunda arma el índice):',
  '  pdflatex informe.tex',
  '  pdflatex informe.tex',
  '',
  'También compila con xelatex.',
  '',
  'Si tu dataset tiene texto en alfabetos no latinos (griego, cirílico, chino...):',
  '  - con pdflatex esos caracteres salen como "?";',
  '  - con xelatex se conservan, pero solo se ven si la fuente los tiene.',
  '    La fuente por defecto (Latin Modern) no los trae: agrega en el preámbulo de',
  '    informe.tex, donde lo indica el comentario,',
  '      \\usepackage{fontspec}\\setmainfont{Noto Serif}',
  '    (o cualquier otra fuente instalada que cubra ese alfabeto).',
  '',
  'En Overleaf: sube este .zip con "New Project > Upload Project".',
  ''
].join('\n');
