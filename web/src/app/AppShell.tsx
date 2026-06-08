import { AppWorkspace } from "@app/AppWorkspace";
import { useAppWorkspaceContext } from "@app/useAppWorkspaceContext";

export default function App() {
  const ctx = useAppWorkspaceContext();
  return <AppWorkspace ctx={ctx} />;
}
