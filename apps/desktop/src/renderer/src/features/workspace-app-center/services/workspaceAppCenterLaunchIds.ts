export const workspaceAppCenterNodeID = "workspace-app-center";
export const workspaceAppWebviewTypeID = "workspace-app-webview";

export function workspaceAppWebviewInstanceId(appId: string): string {
  return `app:${encodeURIComponent(appId)}`;
}
