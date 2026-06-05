import { AppWorkspace } from "./AppWorkspace";
import { useAppWorkspaceContext } from "./useAppWorkspaceContext";

export default function App() {
  const ctx = useAppWorkspaceContext();
  return <AppWorkspace ctx={ctx} />;
}
