import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const path = new URL('./Plantillas_Administracion_Catalogo_Inventario_v1.xlsx', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const input = await FileBlob.load(path);
const wb = await SpreadsheetFile.importXlsx(input);
const check = await wb.inspect({ kind: 'sheet,table', maxChars: 5000, tableMaxRows: 8, tableMaxCols: 10 });
const errors = await wb.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',
  options: { useRegex: true, maxResults: 100 },
  summary: 'saved workbook formula error scan',
});
console.log(check.ndjson);
console.log(errors.ndjson);
