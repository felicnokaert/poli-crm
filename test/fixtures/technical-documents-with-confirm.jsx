// Fixture para test/technical-documents-interaction.test.mjs.
//
// TechnicalDocumentsAdmin usa useConfirm() (src/ConfirmDialog.jsx), que
// exige un <ConfirmProvider> ancestro - en la app real, App.jsx envuelve
// todo con él una sola vez. Si el test cargara TechnicalDocuments.jsx y
// ConfirmDialog.jsx como dos módulos compilados por separado (dos llamadas
// a loadJsxModule), cada compilación inlinearía su propia copia de
// ConfirmDialog con su propio React.createContext() - dos Context
// distintos, así que un <ConfirmProvider> "de afuera" no matchearía el
// useConfirm() "de adentro" (seguiría tirando "useConfirm debe usarse
// dentro de <ConfirmProvider>" aunque el provider esté ahí). Este fixture
// importa ambos desde un único entry, para que rolldown los empaquete en
// el mismo grafo y comparta una sola instancia del Context.
import { ConfirmProvider } from "../../src/ConfirmDialog.jsx";
import { TechnicalDocumentsAdmin } from "../../src/TechnicalDocuments.jsx";

export function TechnicalDocumentsAdminWithConfirm({ session }) {
  return (
    <ConfirmProvider>
      <TechnicalDocumentsAdmin session={session} />
    </ConfirmProvider>
  );
}
