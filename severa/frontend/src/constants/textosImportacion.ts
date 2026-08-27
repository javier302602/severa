// Texto compartido entre ImportarDatasetPage.tsx ("Importar desde link") e
// InformesPage.tsx ("Convertir link a Excel") — 2026-07-18: se eliminó la
// allowlist de dominios (nvd.nist.gov/Google Sheets/Dropbox) como filtro de
// entrada del backend (ver DetectorDeTipoDeLink.ts) y el límite de tamaño
// subió de 5MB a 1GB. El texto viejo describía una allowlist y un límite que
// ya no existen; se define UNA sola vez acá para que ambas pantallas queden
// consistentes automáticamente si el límite real vuelve a cambiar.
export const TEXTO_AYUDA_LINK_DATASET =
  'Se acepta cualquier URL pública (https) compatible — NVD, Google Sheets, Dropbox o cualquier otro origen que sirva un archivo .csv/.xlsx/.xls (o .csv.gz). Tamaño máximo: 1 GB.';
