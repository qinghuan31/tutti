export function retainWorkspaceAppInlineAppIds(input: {
  activeAppId: string | null | undefined;
  availableAppIds?: readonly string[];
  retainedAppIds: readonly string[];
}): readonly string[] {
  const availableAppIds = input.availableAppIds
    ? new Set(input.availableAppIds.map(normalizeAppId).filter(Boolean))
    : null;
  const nextRetainedAppIds: string[] = [];
  const seenAppIds = new Set<string>();

  for (const candidate of input.retainedAppIds) {
    const appId = normalizeAppId(candidate);
    if (
      !appId ||
      seenAppIds.has(appId) ||
      (availableAppIds && !availableAppIds.has(appId))
    ) {
      continue;
    }
    seenAppIds.add(appId);
    nextRetainedAppIds.push(appId);
  }

  const activeAppId = normalizeAppId(input.activeAppId);
  if (
    activeAppId &&
    !seenAppIds.has(activeAppId) &&
    (!availableAppIds || availableAppIds.has(activeAppId))
  ) {
    nextRetainedAppIds.push(activeAppId);
  }

  return stringArraysEqual(nextRetainedAppIds, input.retainedAppIds)
    ? input.retainedAppIds
    : nextRetainedAppIds;
}

function normalizeAppId(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function stringArraysEqual(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
