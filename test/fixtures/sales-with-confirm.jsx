// Fixture para test/pipeline-sales-whatsapp-interaction.test.mjs.
//
// SaleModal (dentro de src/Sales.jsx) usa useConfirm() (src/ConfirmDialog.jsx)
// para el aviso de venta duplicada - exige un <ConfirmProvider> ancestro,
// igual que App.jsx en la app real. Ver la nota larga en
// test/fixtures/technical-documents-with-confirm.jsx sobre por qué esto
// tiene que importarse desde un único entry (mismo Context compartido).
import { ConfirmProvider } from "../../src/ConfirmDialog.jsx";
import Sales from "../../src/Sales.jsx";

export function SalesWithConfirm(props) {
  return (
    <ConfirmProvider>
      <Sales {...props} />
    </ConfirmProvider>
  );
}
