const workspaceBrowserSearchBaseUrl = "https://www.google.com/search";

export function resolveWorkspaceBrowserSearchUrl(query: string): string {
  const searchUrl = new URL(workspaceBrowserSearchBaseUrl);
  searchUrl.searchParams.set("q", query);
  return searchUrl.toString();
}
