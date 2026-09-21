import { describe, expect, it } from 'vitest';
import { loadPdf, loadSpreadsheet } from '../src/utils/documentLibraries';
import { setApiTenant } from '../src/lib/apiClient';

describe('on-demand document engines', () => {
  it('roundtrips an XLSX export with customer text, zero payments and numeric totals intact', async () => {
    const XLSX = await loadSpreadsheet();
    const { read, write } = await import('xlsx');
    const rows = [
      ['Müştəri', 'Toplam', 'Ödənilən', 'Qalıq'],
      ['Sintetik Müştəri', 123.45, 0, 123.45],
      ['YEKUN', 123.45, 0, 123.45],
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Manifest');
    const binary = write(workbook, { type: 'array', bookType: 'xlsx' });
    const restored = read(binary, { type: 'array' });
    expect(XLSX.utils.sheet_to_json(restored.Sheets.Manifest, { header: 1 })).toEqual(rows);
    expect(restored.Sheets.Manifest.B2.t).toBe('n');
    expect(restored.Sheets.Manifest.C2.v).toBe(0);
  });

  it('creates a valid PDF table across multiple pages after loading the PDF engine', async () => {
    const { jsPDF, autoTable } = await loadPdf();
    const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    autoTable(document, {
      head: [['Customer', 'Amount', 'Paid', 'Remaining']],
      body: Array.from({ length: 100 }, (_, index) => [
        `Synthetic ${index + 1}`,
        '123.45 AZN',
        '0.00 AZN',
        '123.45 AZN',
      ]),
      foot: [['TOTAL', '12345.00 AZN', '0.00 AZN', '12345.00 AZN']],
    });
    expect(document.getNumberOfPages()).toBeGreaterThan(1);
    const content = document.output();
    expect(content.startsWith('%PDF-')).toBe(true);
    expect(content).toContain('Synthetic 100');
    expect(content).toContain('12345.00 AZN');
    expect(content).toContain('%%EOF');
  });

  it.each([
    ['spreadsheet', loadSpreadsheet],
    ['PDF', loadPdf],
  ] as const)(
    'cancels %s export preparation when the selected tenant changes during loading',
    async (_name, loader) => {
      setApiTenant('document-tenant-a');
      const pending = loader();
      setApiTenant('document-tenant-b');
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await expect(loader()).resolves.toBeDefined();
    }
  );
});
