import type { DesktopLocale } from "@shared/i18n";
import type {
  DesktopAgentComposerDefaultsByProvider,
  DesktopAgentGuiConversationRailCollapsedByProvider,
  DesktopAgentProvider,
  DesktopAppCatalogChannel,
  DesktopBrowserUseConnectionMode,
  DesktopDockIconStyle,
  DesktopDockPlacement,
  DesktopFileDefaultOpenersByExtension,
  DesktopMinimizeAnimation,
  DesktopSleepPreventionMode,
  DesktopUpdateChannel,
  DesktopUpdatePolicy
} from "@shared/preferences";
import type { DesktopThemeSource, DesktopThemeState } from "@shared/theme";

export interface DesktopPreferencesStoreState {
  changingDefaultAgentProvider: DesktopAgentProvider | null;
  changingAppCatalogChannel: DesktopAppCatalogChannel | null;
  changingBrowserUseConnectionMode: DesktopBrowserUseConnectionMode | null;
  changingDockIconStyle: DesktopDockIconStyle | null;
  changingDockPlacement: DesktopDockPlacement | null;
  changingLocale: DesktopLocale | null;
  changingMinimizeAnimation: DesktopMinimizeAnimation | null;
  changingSleepPreventionMode: DesktopSleepPreventionMode | null;
  changingThemeSource: DesktopThemeSource | null;
  changingUpdateChannel: DesktopUpdateChannel | null;
  changingUpdatePolicy: DesktopUpdatePolicy | null;
  agentComposerDefaultsByProvider: DesktopAgentComposerDefaultsByProvider;
  agentGuiConversationRailCollapsedByProvider: DesktopAgentGuiConversationRailCollapsedByProvider;
  appCatalogChannel: DesktopAppCatalogChannel;
  browserUseConnectionMode: DesktopBrowserUseConnectionMode;
  defaultAgentProvider: DesktopAgentProvider;
  dockIconStyle: DesktopDockIconStyle;
  dockPlacement: DesktopDockPlacement;
  fileDefaultOpenersByExtension: DesktopFileDefaultOpenersByExtension;
  locale: DesktopLocale;
  minimizeAnimation: DesktopMinimizeAnimation;
  sleepPreventionMode: DesktopSleepPreventionMode;
  theme: DesktopThemeState;
  updateChannel: DesktopUpdateChannel;
  updatePolicy: DesktopUpdatePolicy;
}

export interface DesktopPreferencesReadableStoreState {
  readonly changingDefaultAgentProvider: DesktopAgentProvider | null;
  readonly changingAppCatalogChannel: DesktopAppCatalogChannel | null;
  readonly changingBrowserUseConnectionMode: DesktopBrowserUseConnectionMode | null;
  readonly changingDockIconStyle: DesktopDockIconStyle | null;
  readonly changingDockPlacement: DesktopDockPlacement | null;
  readonly changingLocale: DesktopLocale | null;
  readonly changingMinimizeAnimation: DesktopMinimizeAnimation | null;
  readonly changingSleepPreventionMode: DesktopSleepPreventionMode | null;
  readonly changingThemeSource: DesktopThemeSource | null;
  readonly changingUpdateChannel: DesktopUpdateChannel | null;
  readonly changingUpdatePolicy: DesktopUpdatePolicy | null;
  readonly agentComposerDefaultsByProvider: DesktopAgentComposerDefaultsByProvider;
  readonly agentGuiConversationRailCollapsedByProvider: DesktopAgentGuiConversationRailCollapsedByProvider;
  readonly appCatalogChannel: DesktopAppCatalogChannel;
  readonly browserUseConnectionMode: DesktopBrowserUseConnectionMode;
  readonly defaultAgentProvider: DesktopAgentProvider;
  readonly dockIconStyle: DesktopDockIconStyle;
  readonly dockPlacement: DesktopDockPlacement;
  readonly fileDefaultOpenersByExtension: DesktopFileDefaultOpenersByExtension;
  readonly locale: DesktopLocale;
  readonly minimizeAnimation: DesktopMinimizeAnimation;
  readonly sleepPreventionMode: DesktopSleepPreventionMode;
  readonly theme: DesktopThemeState;
  readonly updateChannel: DesktopUpdateChannel;
  readonly updatePolicy: DesktopUpdatePolicy;
}
