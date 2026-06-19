import type { ReferenceNode } from "../../../contracts/referenceSource.ts";

export function formatHierarchyTitle(
  hierarchy: readonly ReferenceNode[]
): string | null {
  if (hierarchy.length === 0) {
    return null;
  }
  return hierarchy.map((crumb) => crumb.displayName).join(" / ");
}
