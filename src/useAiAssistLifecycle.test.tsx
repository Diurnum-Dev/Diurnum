import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AiAssistPassState, ApproveAiAssistBatchInput } from "./lib/workspace/types";
import { useAiAssistLifecycle } from "./useAiAssistLifecycle";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function pass(
  passId: string,
  status: AiAssistPassState["status"] = "complete",
): AiAssistPassState {
  return {
    passId,
    status,
    totalRows: 1,
    processedRows: status === "running" ? 0 : 1,
    suggestions: [],
    proposedRules: [],
  } satisfies AiAssistPassState;
}

const selection: Pick<ApproveAiAssistBatchInput, "entries" | "rules"> = {
  entries: [],
  rules: [],
};

function setup(initialPass: AiAssistPassState | null) {
  const session = {
    approveAiAssistBatch: vi.fn(async (): Promise<void> => undefined),
    setError: vi.fn(),
  };
  const api = {
    getPass: vi.fn(async () => initialPass),
    startPass: vi.fn(async () => pass("pass-new")),
    runNextChunk: vi.fn(async () => pass("pass-old")),
    retryFailedRows: vi.fn(async () => pass("pass-old", "running")),
    dismissPass: vi.fn(async (): Promise<void> => undefined),
  };
  const view = renderHook(() =>
    useAiAssistLifecycle({ workspaceRootPath: "/books", session, api }),
  );
  return { ...view, session, api };
}

describe("useAiAssistLifecycle", () => {
  it("does not let a stale or duplicate approval clear a newer pass", async () => {
    const approval = deferred<void>();
    const { result, session } = setup(pass("pass-old"));
    session.approveAiAssistBatch.mockReturnValue(approval.promise);
    await waitFor(() => expect(result.current.pass?.passId).toBe("pass-old"));

    let first!: Promise<void>;
    let duplicate!: Promise<void>;
    act(() => {
      first = result.current.approve(selection);
      duplicate = result.current.approve(selection);
    });
    expect(session.approveAiAssistBatch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.pass?.passId).toBe("pass-new");
    await act(async () => {
      approval.resolve();
      await Promise.all([first, duplicate]);
    });

    expect(result.current.pass?.passId).toBe("pass-new");
  });

  it("does not let a stale or duplicate dismissal clear a newer pass", async () => {
    const dismissal = deferred<void>();
    const { result, api } = setup(pass("pass-old"));
    api.dismissPass.mockReturnValue(dismissal.promise);
    await waitFor(() => expect(result.current.pass?.passId).toBe("pass-old"));

    let first!: Promise<void>;
    let duplicate!: Promise<void>;
    act(() => {
      first = result.current.dismiss();
      duplicate = result.current.dismiss();
    });
    expect(api.dismissPass).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      dismissal.resolve();
      await Promise.all([first, duplicate]);
    });

    expect(result.current.pass?.passId).toBe("pass-new");
  });

  it("serializes a retry behind an unresolved driver for the same pass", async () => {
    const firstChunk = deferred<AiAssistPassState>();
    const { result, api } = setup(pass("pass-old", "running"));
    api.runNextChunk
      .mockReturnValueOnce(firstChunk.promise)
      .mockResolvedValueOnce(pass("pass-old"));
    await waitFor(() => expect(api.runNextChunk).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.retry();
    });
    expect(api.runNextChunk).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstChunk.resolve(pass("pass-old", "running"));
      await firstChunk.promise;
    });
    await waitFor(() => expect(api.runNextChunk).toHaveBeenCalledTimes(2));
    expect(api.runNextChunk.mock.invocationCallOrder[1]).toBeGreaterThan(
      api.runNextChunk.mock.invocationCallOrder[0],
    );
  });

  it("releases the pass action guard after a recoverable failure", async () => {
    const { result, api } = setup(pass("pass-old"));
    api.dismissPass.mockRejectedValueOnce(new Error("dismiss failed"));
    await waitFor(() => expect(result.current.pass?.passId).toBe("pass-old"));

    await act(async () => {
      await result.current.dismiss();
    });
    expect(result.current.actionBusy).toBe(false);
    expect(result.current.pass?.passId).toBe("pass-old");

    await act(async () => {
      await result.current.dismiss();
    });
    expect(api.dismissPass).toHaveBeenCalledTimes(2);
    expect(result.current.pass).toBeNull();
  });

  it("ignores a mismatched pass returned by the chunk API", async () => {
    const { result, api } = setup(pass("pass-old", "running"));
    api.runNextChunk.mockResolvedValue(pass("pass-wrong"));
    await waitFor(() => expect(api.runNextChunk).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.running).toBe(false));

    expect(result.current.pass?.passId).toBe("pass-old");
    expect(api.runNextChunk).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.dismiss();
    });
    expect(api.dismissPass).toHaveBeenCalledWith("/books", "pass-old");
  });

  it("ignores a mismatched pass returned by retry without starting a continuation", async () => {
    const { result, api } = setup(pass("pass-old"));
    await waitFor(() => expect(result.current.pass?.passId).toBe("pass-old"));
    api.retryFailedRows.mockResolvedValue(pass("pass-wrong", "running"));

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.pass?.passId).toBe("pass-old");
    expect(api.getPass).toHaveBeenCalledTimes(1);
    expect(api.runNextChunk).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.dismiss();
    });
    expect(api.dismissPass).toHaveBeenCalledWith("/books", "pass-old");
  });

  it("never reports running once the pass it reflects has reached a terminal status", async () => {
    const { result, api } = setup(pass("pass-old", "complete"));
    await waitFor(() => expect(result.current.pass?.passId).toBe("pass-old"));

    // The pass is already complete, but a retry kicks off a driver anyway
    // (e.g. the backend replies "nothing left to retry, already complete").
    // The driver's own bookkeeping still flips its internal running flag on
    // before it has a chance to confirm the pass is done; the signal the
    // hook exposes must not echo that internal flicker back to the UI.
    const getPassGate = deferred<AiAssistPassState | null>();
    api.retryFailedRows.mockResolvedValueOnce(pass("pass-old", "complete"));
    api.getPass.mockReturnValueOnce(getPassGate.promise);

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.pass?.status).toBe("complete");
    expect(result.current.running).toBe(false);

    getPassGate.resolve(pass("pass-old", "complete"));
    await waitFor(() => expect(result.current.running).toBe(false));
  });

  it("does not call retryFailedRows a second time while a driver is already mid-flight", async () => {
    const chunkGate = deferred<AiAssistPassState>();
    const { result, api } = setup(pass("pass-old", "running"));
    api.runNextChunk.mockReturnValueOnce(chunkGate.promise);
    await waitFor(() => expect(api.runNextChunk).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.retry();
    });
    expect(api.retryFailedRows).not.toHaveBeenCalled();

    await act(async () => {
      chunkGate.resolve(pass("pass-old", "complete"));
      await chunkGate.promise;
    });
    await waitFor(() => expect(result.current.pass?.status).toBe("complete"));
  });

  it("does not call startPass a second time while a driver is already mid-flight", async () => {
    const chunkGate = deferred<AiAssistPassState>();
    const { result, api } = setup(pass("pass-old", "running"));
    api.runNextChunk.mockReturnValueOnce(chunkGate.promise);
    await waitFor(() => expect(api.runNextChunk).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.start();
    });
    expect(api.startPass).not.toHaveBeenCalled();

    await act(async () => {
      chunkGate.resolve(pass("pass-old", "complete"));
      await chunkGate.promise;
    });
    await waitFor(() => expect(result.current.pass?.status).toBe("complete"));
  });
});
