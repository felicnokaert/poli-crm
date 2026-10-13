import { ConfirmProvider } from "../../src/ConfirmDialog";
import { ChannelsAdmin } from "../../src/ChannelsAdmin";

export function ChannelsAdminWithConfirm() {
  return (
    <ConfirmProvider>
      <ChannelsAdmin />
    </ConfirmProvider>
  );
}
