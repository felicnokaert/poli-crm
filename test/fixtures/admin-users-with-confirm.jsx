import { ConfirmProvider } from "../../src/ConfirmDialog";
import { AdminUsers } from "../../src/AdminUsers.jsx";

export function AdminUsersWithConfirm(props) {
  return (
    <ConfirmProvider>
      <AdminUsers {...props} />
    </ConfirmProvider>
  );
}
