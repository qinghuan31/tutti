# Standalone Agent Sidebar Motion Design

## Goal

Make right-sidebar tools feel immediate and continuous instead of pausing for
native window resize and heavy panel initialization before appearing.

## Interaction

Panel selection updates immediately. The outer sidebar clips its full-width
content while its reserved width grows from the right over 260 milliseconds,
using the existing workbench motion curve. The conversation narrows during the
same transition, so the panel reads as an adjacent surface growing into place.

Native content-width expansion starts on the next animation frame and never
gates renderer state. macOS uses Electron's native bounds animation; other
platforms keep the existing bounds behavior.

## Loading and lifecycle

Files, Browser, Apps, and Message Center defer their first body mount until the
outer transition finishes. The lightweight title and panel controls appear
immediately, so the first frame is cheap. Once mounted, tool bodies remain
mounted while hidden to preserve browser state, file selection, and later-open
performance.

Rapid panel changes cancel any queued native resize frame. Stale IPC responses
continue to be rejected by the existing resize request sequence. A system
`prefers-reduced-motion` preference removes the CSS transition and mount delay.

## Verification

- source-level component checks cover immediate dispatch, clipped motion,
  delayed first mount, and reduced-motion behavior
- pure main-process tests cover macOS-only native animation policy
- desktop typecheck, build, renderer boundaries, and changed-aware checks cover
  integration
