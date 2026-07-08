import { describe, expect, it } from "vitest";
import {
  resolveComposerSubmitPolicy,
  sessionIsOccupied,
  shouldHoldPromptInLocalQueue,
  type ComposerSubmitPolicyInput
} from "./composerSubmitPolicy";

function openGatesInput(
  overrides: Partial<ComposerSubmitPolicyInput> = {}
): ComposerSubmitPolicyInput {
  return {
    hasActiveConversation: true,
    liveState: "active",
    isCreatingConversation: false,
    resumeUnavailable: false,
    occupancy: {
      displayStatusBusy: false,
      hasPendingSubmittedTurn: false,
      submitBlocked: false
    },
    pendingInteractive: false,
    isSubmitting: false,
    isInterrupting: false,
    approvalPending: false,
    interactivePromptPending: false,
    authRequired: false,
    providerTargetsLoading: false,
    selectedProviderTargetDisabled: false,
    gatewayNotReady: false,
    ...overrides
  };
}

describe("sessionIsOccupied", () => {
  it("treats any one occupancy signal as occupied, since each can lag alone", () => {
    expect(
      sessionIsOccupied({
        displayStatusBusy: false,
        hasPendingSubmittedTurn: false,
        submitBlocked: false
      })
    ).toBe(false);
    expect(
      sessionIsOccupied({
        displayStatusBusy: true,
        hasPendingSubmittedTurn: false,
        submitBlocked: false
      })
    ).toBe(true);
    expect(
      sessionIsOccupied({
        displayStatusBusy: false,
        hasPendingSubmittedTurn: true,
        submitBlocked: false
      })
    ).toBe(true);
    expect(
      sessionIsOccupied({
        displayStatusBusy: false,
        hasPendingSubmittedTurn: false,
        submitBlocked: true
      })
    ).toBe(true);
  });
});

describe("resolveComposerSubmitPolicy", () => {
  it("submits directly when every gate is open and the session is free", () => {
    const policy = resolveComposerSubmitPolicy(openGatesInput());
    expect(policy).toEqual({
      sessionOccupied: false,
      canSubmit: true,
      canQueueWhileBusy: false,
      disposition: "submit"
    });
  });

  it("queues while a live turn blocks the direct path", () => {
    const policy = resolveComposerSubmitPolicy(
      openGatesInput({
        occupancy: {
          displayStatusBusy: false,
          hasPendingSubmittedTurn: false,
          submitBlocked: true
        }
      })
    );
    expect(policy.canSubmit).toBe(false);
    expect(policy.canQueueWhileBusy).toBe(true);
    expect(policy.disposition).toBe("queue");
  });

  it("queues while a local submit is still in flight", () => {
    const policy = resolveComposerSubmitPolicy(
      openGatesInput({ isSubmitting: true })
    );
    expect(policy.canSubmit).toBe(false);
    expect(policy.disposition).toBe("queue");
  });

  it("queues while the session waits on an interactive prompt", () => {
    const policy = resolveComposerSubmitPolicy(
      openGatesInput({ pendingInteractive: true })
    );
    expect(policy.canQueueWhileBusy).toBe(true);
    expect(policy.disposition).toBe("queue");
  });

  it("prefers the queue when both paths are open (busy display status only)", () => {
    // Display-status busy alone does not close canSubmit (only the derived
    // submitBlocked does), but a busy signal means a direct submit would
    // race the daemon's single-active-turn slot — the queue must win.
    const policy = resolveComposerSubmitPolicy(
      openGatesInput({
        occupancy: {
          displayStatusBusy: true,
          hasPendingSubmittedTurn: false,
          submitBlocked: false
        }
      })
    );
    expect(policy.canSubmit).toBe(true);
    expect(policy.canQueueWhileBusy).toBe(true);
    expect(policy.disposition).toBe("queue");
  });

  it("never queues without an active conversation", () => {
    const policy = resolveComposerSubmitPolicy(
      openGatesInput({
        hasActiveConversation: false,
        isSubmitting: true
      })
    );
    expect(policy.canQueueWhileBusy).toBe(false);
    expect(policy.disposition).toBe("blocked");
  });

  it.each([
    ["providerTargetsLoading", { providerTargetsLoading: true }],
    ["liveState activating", { liveState: "activating" as const }],
    ["liveState failed", { liveState: "failed" as const }],
    ["resumeUnavailable", { resumeUnavailable: true }],
    ["gatewayNotReady", { gatewayNotReady: true }],
    ["approvalPending", { approvalPending: true }],
    ["interactivePromptPending", { interactivePromptPending: true }],
    ["authRequired", { authRequired: true }],
    ["isCreatingConversation", { isCreatingConversation: true }],
    ["isInterrupting", { isInterrupting: true }]
  ])(
    "blocks the direct path when %s",
    (_label, overrides: Partial<ComposerSubmitPolicyInput>) => {
      const policy = resolveComposerSubmitPolicy(openGatesInput(overrides));
      expect(policy.canSubmit).toBe(false);
    }
  );

  it("blocks a home-composer send when the selected provider target is disabled", () => {
    const policy = resolveComposerSubmitPolicy(
      openGatesInput({
        hasActiveConversation: false,
        selectedProviderTargetDisabled: true
      })
    );
    expect(policy.canSubmit).toBe(false);
    expect(policy.disposition).toBe("blocked");
  });

  it("ignores a disabled provider target once a conversation is active", () => {
    const policy = resolveComposerSubmitPolicy(
      openGatesInput({ selectedProviderTargetDisabled: true })
    );
    expect(policy.canSubmit).toBe(true);
  });

  it("documents today's gap: the pre-activation create window is fully blocked", () => {
    // First-message create: the conversation is entered optimistically but
    // no backend session exists yet, so no occupancy signal fires and the
    // queue path stays closed — the composer is disabled with no hint.
    const policy = resolveComposerSubmitPolicy(
      openGatesInput({
        liveState: "activating",
        isCreatingConversation: true
      })
    );
    expect(policy.canSubmit).toBe(false);
    expect(policy.canQueueWhileBusy).toBe(false);
    expect(policy.disposition).toBe("blocked");
  });
});

describe("shouldHoldPromptInLocalQueue", () => {
  it("dispatches directly when nothing holds the prompt", () => {
    expect(
      shouldHoldPromptInLocalQueue({
        commandInFlight: false,
        hasPendingSubmittedTurn: false,
        pendingInteractive: false,
        displayStatusBusy: false
      })
    ).toBe(false);
  });

  it.each([
    ["commandInFlight", { commandInFlight: true }],
    ["hasPendingSubmittedTurn", { hasPendingSubmittedTurn: true }],
    ["pendingInteractive", { pendingInteractive: true }],
    ["displayStatusBusy", { displayStatusBusy: true }]
  ])("holds the prompt when %s", (_label, overrides) => {
    expect(
      shouldHoldPromptInLocalQueue({
        commandInFlight: false,
        hasPendingSubmittedTurn: false,
        pendingInteractive: false,
        displayStatusBusy: false,
        ...overrides
      })
    ).toBe(true);
  });
});
