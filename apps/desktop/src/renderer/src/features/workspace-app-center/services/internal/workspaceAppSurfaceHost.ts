import type {
  IWorkspaceAppSurfaceHost,
  WorkspaceAppOpenAttempt,
  WorkspaceAppSurfacePreparedOpenInput,
  WorkspaceAppSurfacePresenter
} from "../workspaceAppSurfaceHost.interface.ts";

interface WorkspaceAppSurfaceRegistration {
  presenter: WorkspaceAppSurfacePresenter;
}

interface PendingWorkspaceAppOpen {
  attempt: WorkspaceAppOpenAttempt;
  registration: WorkspaceAppSurfaceRegistration;
}

export class WorkspaceAppSurfaceHost implements IWorkspaceAppSurfaceHost {
  readonly _serviceBrand = undefined;

  private nextAttemptId = 0;
  private readonly pendingByAttemptId = new Map<
    number,
    PendingWorkspaceAppOpen
  >();
  private registration: WorkspaceAppSurfaceRegistration | null = null;

  beginOpen(input: {
    appId: string;
    workspaceId: string;
  }): WorkspaceAppOpenAttempt {
    const attempt: WorkspaceAppOpenAttempt = {
      appId: input.appId,
      attemptId: ++this.nextAttemptId,
      workspaceId: input.workspaceId
    };
    const registration = this.registration;
    if (registration) {
      this.pendingByAttemptId.set(attempt.attemptId, {
        attempt,
        registration
      });
      registration.presenter.beginOpen(attempt);
    }
    return attempt;
  }

  close(input: { appId: string; workspaceId: string }): void {
    this.registration?.presenter.close(input);
  }

  isOpen(input: { appId: string; workspaceId: string }): boolean {
    return this.registration?.presenter.isOpen(input) === true;
  }

  async presentPrepared(
    input: WorkspaceAppSurfacePreparedOpenInput
  ): Promise<boolean> {
    const pending = this.takePending(input.attempt);
    if (!pending || pending.registration !== this.registration) {
      return false;
    }
    return (
      (await pending.registration.presenter.presentPrepared(input)) === true
    );
  }

  registerPresenter(presenter: WorkspaceAppSurfacePresenter): () => void {
    if (this.registration) {
      this.cancelPendingForRegistration(this.registration);
    }
    const registration = { presenter };
    this.registration = registration;
    return () => {
      this.cancelPendingForRegistration(registration);
      if (this.registration === registration) {
        this.registration = null;
      }
    };
  }

  rollbackOpen(attempt: WorkspaceAppOpenAttempt): void {
    const pending = this.takePending(attempt);
    if (!pending || pending.registration !== this.registration) {
      return;
    }
    pending.registration.presenter.rollbackOpen(attempt);
  }

  private cancelPendingForRegistration(
    registration: WorkspaceAppSurfaceRegistration
  ): void {
    for (const [attemptId, pending] of this.pendingByAttemptId) {
      if (pending.registration !== registration) {
        continue;
      }
      this.pendingByAttemptId.delete(attemptId);
      registration.presenter.rollbackOpen(pending.attempt);
    }
  }

  private takePending(
    attempt: WorkspaceAppOpenAttempt
  ): PendingWorkspaceAppOpen | null {
    const pending = this.pendingByAttemptId.get(attempt.attemptId) ?? null;
    this.pendingByAttemptId.delete(attempt.attemptId);
    return pending;
  }
}
