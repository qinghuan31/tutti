import type { WorkbenchNode } from "../core/types.ts";
import type { WorkbenchController } from "../store/types.ts";
import { Button, MaximizeIcon, RestoreIcon } from "@tutti-os/ui-system";
import type { WorkbenchWindowChromeI18nRuntime } from "./workbenchWindowI18n.ts";

export function WorkbenchWindowFullscreenToggle<TData>({
  controller,
  disabled = false,
  i18n,
  node
}: {
  controller: WorkbenchController<TData>;
  disabled?: boolean;
  i18n: WorkbenchWindowChromeI18nRuntime;
  node: WorkbenchNode<TData>;
}) {
  const isFullscreen = node.displayMode === "fullscreen";
  const label = i18n.t(isFullscreen ? "exitFullscreen" : "enterFullscreen");
  const Icon = isFullscreen ? RestoreIcon : MaximizeIcon;

  return (
    <Button
      aria-label={label}
      aria-pressed={isFullscreen}
      className="order-2 rounded-md"
      data-workbench-action="fullscreen"
      disabled={disabled}
      size="icon-sm"
      title={label}
      type="button"
      variant="chrome"
      onClick={(event) => {
        if (disabled) {
          return;
        }

        controller.commands.focusNode(node.id);

        if (isFullscreen) {
          controller.commands.exitFullscreen(node.id);
          return;
        }

        event.currentTarget.blur();
        controller.commands.enterFullscreen(node.id);
      }}
    >
      <Icon aria-hidden className="size-[15px]" />
    </Button>
  );
}
