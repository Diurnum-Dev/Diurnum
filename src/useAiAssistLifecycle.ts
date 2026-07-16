import { useCallback, useEffect, useRef, useState } from "react";
import { userFacingError } from "./lib/workspace/session";
import type {
  AiAssistPassState,
  ApproveAiAssistBatchInput,
} from "./lib/workspace/types";

export type AiAssistLifecycleApi = {
  getPass: (workspaceRootPath: string) => Promise<AiAssistPassState | null>;
  startPass: (workspaceRootPath: string) => Promise<AiAssistPassState>;
  runNextChunk: (
    workspaceRootPath: string,
    passId: string,
  ) => Promise<AiAssistPassState>;
  retryFailedRows: (
    workspaceRootPath: string,
    passId: string,
  ) => Promise<AiAssistPassState>;
  dismissPass: (workspaceRootPath: string, passId: string) => Promise<void>;
};

export type AiAssistLifecycleSession = {
  approveAiAssistBatch: (input: ApproveAiAssistBatchInput) => Promise<void>;
  setError: (error: string | null) => void;
};

type PassToken = {
  workspaceRootPath: string;
  passId: string;
  lifecycle: number;
  generation: number;
};

type DriverRecord = {
  active: PassToken;
  queued: PassToken | null;
  promise: Promise<void>;
};

function passKey(token: Pick<PassToken, "workspaceRootPath" | "passId">) {
  return `${token.workspaceRootPath}\u0000${token.passId}`;
}

function sameToken(left: PassToken, right: PassToken) {
  return (
    left.workspaceRootPath === right.workspaceRootPath &&
    left.passId === right.passId &&
    left.lifecycle === right.lifecycle &&
    left.generation === right.generation
  );
}

export function useAiAssistLifecycle({
  workspaceRootPath,
  session,
  api,
}: {
  workspaceRootPath: string | null;
  session: AiAssistLifecycleSession;
  api: AiAssistLifecycleApi;
}) {
  const [pass, setPass] = useState<AiAssistPassState | null>(null);
  const [running, setRunning] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const identityRef = useRef({
    workspaceRootPath: null as string | null,
    passId: null as string | null,
    lifecycle: 0,
    generation: 0,
  });
  const driversRef = useRef(new Map<string, DriverRecord>());
  const actionsRef = useRef(new Map<string, PassToken>());
  const busyTokenRef = useRef<PassToken | null>(null);
  const startRef = useRef<{ workspaceRootPath: string; lifecycle: number; generation: number } | null>(
    null,
  );

  const isCurrent = useCallback((token: PassToken) => {
    const current = identityRef.current;
    return (
      current.workspaceRootPath === token.workspaceRootPath &&
      current.passId === token.passId &&
      current.lifecycle === token.lifecycle &&
      current.generation === token.generation
    );
  }, []);

  const acceptsPassState = useCallback(
    (token: PassToken, state: AiAssistPassState) =>
      state.passId === token.passId && isCurrent(token),
    [isCurrent],
  );

  const driveOnce = useCallback(
    async (token: PassToken) => {
      if (!isCurrent(token)) return;
      setRunning(true);
      try {
        let state = await api.getPass(token.workspaceRootPath);
        while (state?.status === "running" && acceptsPassState(token, state)) {
          state = await api.runNextChunk(token.workspaceRootPath, token.passId);
          if (!acceptsPassState(token, state)) return;
          setPass(state);
        }
        if (state && acceptsPassState(token, state)) setPass(state);
      } catch (caught) {
        if (isCurrent(token)) session.setError(userFacingError(caught));
      } finally {
        if (isCurrent(token)) setRunning(false);
      }
    },
    [acceptsPassState, api, isCurrent, session],
  );

  const queueDriver = useCallback(
    (token: PassToken) => {
      const key = passKey(token);
      const existing = driversRef.current.get(key);
      if (existing) {
        const newestGeneration = Math.max(
          existing.active.generation,
          existing.queued?.generation ?? -1,
        );
        if (token.generation > newestGeneration) existing.queued = token;
        return existing.promise;
      }

      const record: DriverRecord = {
        active: token,
        queued: null,
        promise: Promise.resolve(),
      };
      driversRef.current.set(key, record);
      record.promise = (async () => {
        let next: PassToken | null = token;
        while (next) {
          record.active = next;
          record.queued = null;
          await driveOnce(next);
          next = record.queued;
        }
      })().finally(() => {
        if (driversRef.current.get(key) === record) driversRef.current.delete(key);
      });
      return record.promise;
    },
    [driveOnce],
  );

  const releaseAction = useCallback((key: string, token: PassToken) => {
    if (actionsRef.current.get(key) === token) actionsRef.current.delete(key);
    if (busyTokenRef.current && sameToken(busyTokenRef.current, token)) {
      busyTokenRef.current = null;
      setActionBusy(false);
    }
  }, []);

  const start = useCallback(async () => {
    const current = identityRef.current;
    if (!current.workspaceRootPath || startRef.current) return;
    const request = {
      workspaceRootPath: current.workspaceRootPath,
      lifecycle: current.lifecycle,
      generation: current.generation + 1,
    };
    identityRef.current = { ...request, passId: null };
    startRef.current = request;
    busyTokenRef.current = null;
    setActionBusy(false);
    try {
      const state = await api.startPass(request.workspaceRootPath);
      const latest = identityRef.current;
      if (
        latest.workspaceRootPath !== request.workspaceRootPath ||
        latest.lifecycle !== request.lifecycle ||
        latest.generation !== request.generation
      ) {
        return;
      }
      const token = { ...request, passId: state.passId };
      identityRef.current = token;
      setPass(state);
      void queueDriver(token);
    } catch (caught) {
      const latest = identityRef.current;
      if (
        latest.workspaceRootPath === request.workspaceRootPath &&
        latest.lifecycle === request.lifecycle &&
        latest.generation === request.generation
      ) {
        session.setError(userFacingError(caught));
        setRunning(false);
      }
    } finally {
      if (startRef.current === request) startRef.current = null;
    }
  }, [api, queueDriver, session]);

  const approve = useCallback(
    async (selection: Pick<ApproveAiAssistBatchInput, "entries" | "rules">) => {
      const current = identityRef.current;
      if (!current.workspaceRootPath || !current.passId) return;
      const token = current as PassToken;
      const key = passKey(token);
      if (actionsRef.current.has(key)) return;
      actionsRef.current.set(key, token);
      busyTokenRef.current = token;
      setActionBusy(true);
      try {
        await session.approveAiAssistBatch({
          workspaceRootPath: token.workspaceRootPath,
          passId: token.passId,
          ...selection,
        });
        if (isCurrent(token)) {
          identityRef.current = {
            ...token,
            passId: null,
            generation: token.generation + 1,
          };
          setPass(null);
          setRunning(false);
        }
      } catch {
        // Session owns the error; the active pass stays recoverable.
      } finally {
        releaseAction(key, token);
      }
    },
    [isCurrent, releaseAction, session],
  );

  const dismiss = useCallback(async () => {
    const current = identityRef.current;
    if (!current.workspaceRootPath || !current.passId) return;
    const token = current as PassToken;
    const key = passKey(token);
    if (actionsRef.current.has(key)) return;
    actionsRef.current.set(key, token);
    busyTokenRef.current = token;
    setActionBusy(true);
    try {
      await api.dismissPass(token.workspaceRootPath, token.passId);
      if (isCurrent(token)) {
        identityRef.current = {
          ...token,
          passId: null,
          generation: token.generation + 1,
        };
        setPass(null);
        setRunning(false);
      }
    } catch (caught) {
      if (isCurrent(token)) {
        session.setError(userFacingError(caught));
      }
    } finally {
      releaseAction(key, token);
    }
  }, [api, isCurrent, releaseAction, session]);

  const retry = useCallback(async () => {
    const current = identityRef.current;
    if (!current.workspaceRootPath || !current.passId) return;
    const previous = current as PassToken;
    const key = passKey(previous);
    if (actionsRef.current.has(key)) return;
    const token = { ...previous, generation: previous.generation + 1 };
    identityRef.current = token;
    actionsRef.current.set(key, token);
    busyTokenRef.current = token;
    setActionBusy(true);
    try {
      const state = await api.retryFailedRows(token.workspaceRootPath, token.passId);
      if (!acceptsPassState(token, state)) return;
      setPass(state);
      void queueDriver(token);
    } catch (caught) {
      if (isCurrent(token)) {
        session.setError(userFacingError(caught));
        setRunning(false);
      }
    } finally {
      releaseAction(key, token);
    }
  }, [acceptsPassState, api, isCurrent, queueDriver, releaseAction, session]);

  useEffect(() => {
    const previous = identityRef.current;
    const lifecycle = previous.lifecycle + 1;
    const generation = previous.generation + 1;
    identityRef.current = { workspaceRootPath, passId: null, lifecycle, generation };
    startRef.current = null;
    busyTokenRef.current = null;
    setPass(null);
    setRunning(false);
    setActionBusy(false);
    if (!workspaceRootPath) return;

    let cancelled = false;
    void api
      .getPass(workspaceRootPath)
      .then((state) => {
        const current = identityRef.current;
        if (
          cancelled ||
          current.workspaceRootPath !== workspaceRootPath ||
          current.lifecycle !== lifecycle ||
          current.generation !== generation
        ) {
          return;
        }
        if (!state) {
          setPass(null);
          return;
        }
        const token = { workspaceRootPath, passId: state.passId, lifecycle, generation };
        identityRef.current = token;
        setPass(state);
        if (state.status === "running") void queueDriver(token);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      busyTokenRef.current = null;
      const current = identityRef.current;
      if (current.lifecycle === lifecycle) {
        identityRef.current = {
          workspaceRootPath: null,
          passId: null,
          lifecycle: lifecycle + 1,
          generation: current.generation + 1,
        };
      }
    };
  }, [api, queueDriver, workspaceRootPath]);

  return { pass, running, actionBusy, start, approve, dismiss, retry };
}
