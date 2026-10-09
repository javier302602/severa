// Un rango de fechas de una columna (mínimo/máximo) llega del backend como un
// día de calendario a medianoche UTC ("2024-01-10T00:00:00.000Z"). Mostrarlo
// con toLocaleDateString() a secas lo convierte a la zona del navegador, y en
// cualquier zona al oeste de Greenwich (Perú es UTC-5) eso es el día
// anterior: una columna que empieza el 10 de enero se mostraba "9/1/2024".
// Se formatea en UTC, con el idioma del navegador.
export function formatearDiaCalendario(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleDateString(undefined, { timeZone: 'UTC' });
}
