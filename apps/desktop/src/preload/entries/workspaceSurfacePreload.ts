export function shouldExposeWorkspaceSurfaceApis(search: string): boolean {
  const view = new URLSearchParams(search).get("view");
  return view === "workspace" || view === "agent";
}
