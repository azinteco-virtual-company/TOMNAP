import { getApiContextVersion } from '../lib/apiClient';

let spreadsheet: Promise<Pick<typeof import('xlsx'), 'utils' | 'writeFile'>> | undefined;
let pdf:
  | Promise<{
      jsPDF: typeof import('jspdf').jsPDF;
      autoTable: typeof import('jspdf-autotable').default;
    }>
  | undefined;

async function forCurrentSession<T>(pending: Promise<T>): Promise<T> {
  const context = getApiContextVersion();
  const loaded = await pending;
  if (context !== getApiContextVersion())
    throw new DOMException('Oturum və ya butik dəyişdi.', 'AbortError');
  return loaded;
}

// No document library is requested until an export action invokes its loader.
// Concurrent exports share one load; a failed fetch can be retried by the user.
export function loadSpreadsheet() {
  spreadsheet ??= import('xlsx')
    .then(({ utils, writeFile }) => ({ utils, writeFile }))
    .catch((error) => {
      spreadsheet = undefined;
      throw error;
    });
  return forCurrentSession(spreadsheet);
}

export function loadPdf() {
  pdf ??= Promise.all([import('jspdf'), import('jspdf-autotable')])
    .then(([library, tables]) => ({ jsPDF: library.jsPDF, autoTable: tables.default }))
    .catch((error) => {
      pdf = undefined;
      throw error;
    });
  return forCurrentSession(pdf);
}

export function reportDocumentError(error: unknown) {
  if ((error as Error)?.name !== 'AbortError')
    window.alert('Sənəd hazırlanmadı. Bağlantını yoxlayıb yenidən cəhd edin.');
}
