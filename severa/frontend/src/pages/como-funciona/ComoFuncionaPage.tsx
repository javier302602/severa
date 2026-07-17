interface Paso {
  numero: number;
  titulo: string;
  recibe: string;
  hace: string;
  produce: string;
}

// Mejora 2b. Ejemplo genérico (ventas.csv) a propósito, en vez de un dataset
// de vulnerabilidades: esta pantalla es para alguien que todavía no entiende
// el flujo general, así que usa un archivo cotidiano en vez de jargon de
// seguridad (CVE/CVSS) que recién se explica en el resto de la app.
//
// Los 8 pasos reflejan el pipeline REAL de SEVERA (verificado contra
// DatasetController.ts, LectorExcelDataset.ts, EstadisticaController.ts,
// GraficoController.ts, InformeController.ts) con una aclaración importante:
// estadísticas/gráficos/informe NO se generan automáticamente apenas se
// importa el archivo — se calculan al momento, cada vez que el analista
// entra a esa sección o pide el informe. Decir lo contrario sería inventar
// un comportamiento que el backend no tiene.
const PASOS: Paso[] = [
  {
    numero: 1,
    titulo: 'Carga del archivo',
    recibe: 'El archivo que subís (ej. ventas.csv o un .xlsx) desde el formulario de importación.',
    hace: 'Lo recibe a través de la API y lo guarda en un archivo temporal del servidor — nunca escribe directo a la base de datos.',
    produce: 'Un archivo temporal, listo para ser leído.'
  },
  {
    numero: 2,
    titulo: 'Validación de formato',
    recibe: 'El archivo temporal.',
    hace: 'Comprueba que sea un Excel/CSV válido (no esté corrupto) y que tenga las columnas obligatorias para interpretarlo.',
    produce: 'Luz verde para continuar, o un error claro indicando qué falta o qué está mal.'
  },
  {
    numero: 3,
    titulo: 'Almacenamiento temporal',
    recibe: 'El archivo ya validado.',
    hace: 'Lo mantiene en disco solo mientras dura la lectura; se borra automáticamente apenas termina de procesarlo, haya salido bien o mal.',
    produce: 'Nada permanente todavía — es un paso de trabajo intermedio, SEVERA no guarda una copia del archivo original.'
  },
  {
    numero: 4,
    titulo: 'Limpieza y validación de datos',
    recibe: 'Cada fila del archivo.',
    hace: 'Valida fila por fila (formatos, rangos, campos obligatorios) y separa lo que se puede interpretar de lo que no.',
    produce: 'Dos listas: filas importables (van a la base de datos) y filas rechazadas, cada una con el motivo puntual.'
  },
  {
    numero: 5,
    titulo: 'Estadísticas descriptivas',
    recibe: 'Los datos ya limpios y guardados.',
    hace: 'Cuando el analista entra a la sección de Estadísticas, calcula media, mediana, moda, desviación estándar, cuartiles, etc. en el momento.',
    produce: 'Un resumen numérico del dataset — no una copia guardada aparte, se recalcula cada vez que se pide.'
  },
  {
    numero: 6,
    titulo: 'Gráficos',
    recibe: 'Los mismos datos limpios.',
    hace: 'Cuando el analista entra a Gráficos, arma histogramas, boxplots, gráficos de torta y de barras, también al momento.',
    produce: 'Visualizaciones listas para ver en el navegador.'
  },
  {
    numero: 7,
    titulo: 'Redacción automática del informe',
    recibe: 'Los datos, las estadísticas y los gráficos ya calculados.',
    hace: 'Cuando se pide un informe, arma automáticamente el documento con sus secciones (resumen, comparaciones, priorización, interpretación) sin intervención manual.',
    produce: 'Un informe completo redactado, listo para revisar.'
  },
  {
    numero: 8,
    titulo: 'Exportación',
    recibe: 'El informe ya armado.',
    hace: 'Lo convierte al formato elegido por el analista.',
    produce: 'Un archivo PDF o Word, descargado directo al navegador.'
  }
];

function TarjetaPaso({ paso }: { paso: Paso }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white dark:bg-slate-200 dark:text-slate-900">
          {paso.numero}
        </span>
        {paso.numero < PASOS.length && <span className="mt-1 w-px flex-1 bg-slate-300 dark:bg-slate-600" />}
      </div>

      <div className="flex-1 space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 mb-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{paso.titulo}</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 font-medium text-slate-600 dark:text-slate-400">Recibe</dt>
            <dd className="text-slate-700 dark:text-slate-300">{paso.recibe}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 font-medium text-slate-600 dark:text-slate-400">Hace</dt>
            <dd className="text-slate-700 dark:text-slate-300">{paso.hace}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 font-medium text-slate-600 dark:text-slate-400">Produce</dt>
            <dd className="text-slate-700 dark:text-slate-300">{paso.produce}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export function ComoFuncionaPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Cómo funciona SEVERA</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          El recorrido completo de un archivo dentro del sistema, de punta a punta. Para explicarlo simple, usamos un
          archivo genérico de ejemplo (<code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-700">ventas.csv</code>)
          en vez de un dataset real de vulnerabilidades — el flujo es exactamente el mismo.
        </p>
      </div>

      <div>
        {PASOS.map((paso) => (
          <TarjetaPaso key={paso.numero} paso={paso} />
        ))}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-500">
        Los pasos 5 a 7 no ocurren automáticamente apenas se importa el archivo: se calculan en el momento, cada vez que
        entrás a esa sección o pedís el informe — SEVERA no guarda una copia recalculada de antemano.
      </p>
    </div>
  );
}
