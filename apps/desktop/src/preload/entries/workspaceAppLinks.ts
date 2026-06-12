const workspaceAppOpenUrlChannel = "workspace-app:open-url";
const sameOriginWindowOpenFallbackDelayMs = 30_000;

interface WorkspaceAppLinkInterceptionOptions {
  reportDiagnostic?: (
    diagnostic: WorkspaceAppLinkInterceptionDiagnostic
  ) => void;
  scope: Window;
  send(this: void, channel: string, payload: unknown): void;
}

export function installWorkspaceAppLinkInterception({
  reportDiagnostic,
  scope,
  send
}: WorkspaceAppLinkInterceptionOptions): () => void {
  return installPreloadLinkInterception({
    reportDiagnostic,
    scope,
    sendOpenUrl(url) {
      send(workspaceAppOpenUrlChannel, { url });
    }
  });
}

export function installPreloadLinkInterception({
  reportDiagnostic,
  scope,
  sendOpenUrl
}: {
  reportDiagnostic?: (
    diagnostic: WorkspaceAppLinkInterceptionDiagnostic
  ) => void;
  scope: Window;
  sendOpenUrl: (url: string) => void;
}): () => void {
  const handleClick = (event: MouseEvent) => {
    const anchor = resolveAnchorTarget(event);
    if (!anchor) {
      return;
    }

    const href = anchor.href.trim();
    const target = anchor.getAttribute("target")?.trim().toLowerCase() ?? "";
    if (target !== "_blank") {
      return;
    }
    if (!isInterceptableBlankTarget(anchor)) {
      reportDiagnostic?.({
        action: "skip",
        href,
        reason: anchor.hasAttribute("download")
          ? "download-link"
          : href.startsWith("javascript:")
            ? "javascript-url"
            : "invalid-url",
        target
      });
      return;
    }
    if (!shouldInterceptMouseOpen(event)) {
      reportDiagnostic?.({
        action: "skip",
        button: event.button,
        defaultPrevented: event.defaultPrevented,
        href,
        modifiers: getMouseModifiers(event),
        reason: event.defaultPrevented
          ? "default-prevented"
          : event.button !== 0
            ? "non-left-click"
            : hasMouseModifier(event)
              ? "modified-click"
              : "not-interceptable",
        target
      });
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    reportDiagnostic?.({
      action: "open-url",
      button: event.button,
      defaultPrevented: event.defaultPrevented,
      href,
      modifiers: getMouseModifiers(event),
      target
    });
    sendOpenUrl(href);
  };

  const disposeWindowOpenInterception = installPreloadWindowOpenInterception({
    scope,
    sendOpenUrl
  });

  reportDiagnostic?.({
    action: "installed",
    readyState: scope.document.readyState,
    url: scope.location.href
  });
  scope.addEventListener("click", handleClick, true);

  return () => {
    scope.removeEventListener("click", handleClick, true);
    disposeWindowOpenInterception();
  };
}

function installPreloadWindowOpenInterception({
  scope,
  sendOpenUrl
}: {
  scope: Window;
  sendOpenUrl: (url: string) => void;
}): () => void {
  const originalOpen =
    typeof scope.open === "function" ? scope.open.bind(scope) : () => null;
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  const interceptedOpen: typeof scope.open = (url, target, features) => {
    const normalizedTarget = target?.trim().toLowerCase() ?? "_blank";
    if (!shouldInterceptWindowOpenTarget(normalizedTarget)) {
      return originalOpen(url, target, features);
    }

    return createWorkspaceAppPopupProxy({
      initialUrl: resolveWindowOpenUrl(scope, url),
      onTimerCreated(timer) {
        pendingTimers.add(timer);
      },
      onTimerDisposed(timer) {
        pendingTimers.delete(timer);
      },
      resolveUrl(rawUrl) {
        return resolveWindowOpenUrl(scope, rawUrl);
      },
      sameOrigin: (resolvedUrl) => isSameOriginUrl(scope, resolvedUrl),
      sendOpenUrl
    });
  };
  scope.open = interceptedOpen;

  return () => {
    scope.open = originalOpen;
    for (const timer of pendingTimers) {
      clearTimeout(timer);
    }
    pendingTimers.clear();
  };
}

function shouldInterceptWindowOpenTarget(target: string): boolean {
  return target !== "_self" && target !== "_parent" && target !== "_top";
}

function resolveWindowOpenUrl(scope: Window, rawUrl: unknown): string | null {
  const rawValue =
    rawUrl instanceof URL
      ? rawUrl.toString()
      : typeof rawUrl === "string"
        ? rawUrl
        : rawUrl == null
          ? ""
          : null;
  if (rawValue === null) {
    return null;
  }

  const value = rawValue.trim();
  if (
    value.length === 0 ||
    value.toLowerCase().startsWith("javascript:") ||
    value.toLowerCase() === "about:blank"
  ) {
    return null;
  }

  try {
    return new URL(value, scope.location.href).toString();
  } catch {
    return null;
  }
}

function isSameOriginUrl(scope: Window, resolvedUrl: string): boolean {
  try {
    return new URL(resolvedUrl).origin === new URL(scope.location.href).origin;
  } catch {
    return false;
  }
}

function createWorkspaceAppPopupProxy({
  initialUrl,
  onTimerCreated,
  onTimerDisposed,
  resolveUrl,
  sameOrigin,
  sendOpenUrl
}: {
  initialUrl: string | null;
  onTimerCreated: (timer: ReturnType<typeof setTimeout>) => void;
  onTimerDisposed: (timer: ReturnType<typeof setTimeout>) => void;
  resolveUrl: (rawUrl: unknown) => string | null;
  sameOrigin: (resolvedUrl: string) => boolean;
  sendOpenUrl: (url: string) => void;
}): Window | null {
  let closed = false;
  let currentUrl = initialUrl;
  let dispatched = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  const disposeFallbackTimer = () => {
    if (!fallbackTimer) {
      return;
    }
    clearTimeout(fallbackTimer);
    onTimerDisposed(fallbackTimer);
    fallbackTimer = null;
  };

  const dispatchCurrentUrl = () => {
    if (closed || dispatched || !currentUrl) {
      return;
    }
    dispatched = true;
    disposeFallbackTimer();
    sendOpenUrl(currentUrl);
  };

  const setUrl = (rawUrl: unknown) => {
    const resolvedUrl = resolveUrl(rawUrl);
    if (!resolvedUrl) {
      return;
    }
    currentUrl = resolvedUrl;
    dispatchCurrentUrl();
  };

  const locationProxy = {
    assign: setUrl,
    replace: setUrl,
    toString() {
      return currentUrl ?? "about:blank";
    }
  };
  Object.defineProperty(locationProxy, "href", {
    get() {
      return currentUrl ?? "about:blank";
    },
    set(value: unknown) {
      setUrl(value);
    }
  });

  const popupProxy = {
    blur() {},
    close() {
      closed = true;
      disposeFallbackTimer();
    },
    focus() {
      dispatchCurrentUrl();
    },
    get closed() {
      return closed;
    },
    get location() {
      return locationProxy;
    },
    set location(value: unknown) {
      setUrl(value);
    },
    opener: null,
    postMessage() {}
  };

  if (currentUrl) {
    if (sameOrigin(currentUrl)) {
      fallbackTimer = setTimeout(
        dispatchCurrentUrl,
        sameOriginWindowOpenFallbackDelayMs
      );
      onTimerCreated(fallbackTimer);
    } else {
      dispatchCurrentUrl();
    }
  }

  return popupProxy as unknown as Window;
}

function resolveAnchorTarget(event: Event): HTMLAnchorElement | null {
  const path =
    typeof event.composedPath === "function"
      ? event.composedPath()
      : [event.target].filter(Boolean);

  for (const entry of path) {
    if (entry instanceof HTMLAnchorElement) {
      return entry;
    }
    if (entry instanceof Element) {
      const anchor = entry.closest("a[href]");
      if (anchor instanceof HTMLAnchorElement) {
        return anchor;
      }
    }
  }

  let current = event.target;
  while (current instanceof Element) {
    if (
      current instanceof HTMLAnchorElement &&
      current.href.trim().length > 0
    ) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function isInterceptableBlankTarget(anchor: HTMLAnchorElement): boolean {
  const href = anchor.href.trim();
  if (href.length === 0 || anchor.hasAttribute("download")) {
    return false;
  }

  const target = anchor.getAttribute("target")?.trim().toLowerCase() ?? "";
  if (target !== "_blank") {
    return false;
  }

  return !href.startsWith("javascript:");
}

interface WorkspaceAppLinkInterceptionDiagnostic {
  readonly action: "installed" | "open-url" | "skip";
  readonly button?: number;
  readonly defaultPrevented?: boolean;
  readonly href?: string;
  readonly modifiers?: {
    readonly alt: boolean;
    readonly ctrl: boolean;
    readonly meta: boolean;
    readonly shift: boolean;
  };
  readonly readyState?: string;
  readonly reason?: string;
  readonly target?: string;
  readonly url?: string;
}

function getMouseModifiers(event: MouseEvent): {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
} {
  return {
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey
  };
}

function hasMouseModifier(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function shouldInterceptMouseOpen(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented && event.button === 0 && !hasMouseModifier(event)
  );
}
