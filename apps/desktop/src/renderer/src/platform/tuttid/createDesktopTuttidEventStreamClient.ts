import {
  createTuttidEventStreamClient,
  type TuttidEventStreamClient
} from "@tutti-os/client-tuttid-ts";
import type { DesktopRuntimeApi } from "@preload/types";

export function createDesktopTuttidEventStreamClient(
  runtimeApi: DesktopRuntimeApi
): TuttidEventStreamClient {
  return createTuttidEventStreamClient({
    resolveUrl: () => runtimeApi.getBusinessEventStreamUrl()
  });
}
