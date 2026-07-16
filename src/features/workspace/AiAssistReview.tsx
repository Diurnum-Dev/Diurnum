import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type {
  AiAssistPassState,
  ApproveAiAssistBatchInput,
  SuggestedEntry,
} from "../../lib/workspace/types";
import { buildAiAssistGroups, type AiAssistReviewRow } from "./aiAssistGroups";
import { formatInboxAmount, formatInboxDate } from "./inboxFormat";

type AiAssistReviewProps = {
  pass: AiAssistPassState;
  entries: SuggestedEntry[];
  onApprove: (selection: {
    entries: ApproveAiAssistBatchInput["entries"];
    rules: ApproveAiAssistBatchInput["rules"];
  }) => Promise<void> | void;
  onDismiss: () => Promise<void> | void;
  onRetry: () => Promise<void> | void;
  onEditRow: (statementRowId: string) => void;
};

type ReviewStep =
  | { kind: "group"; groupIndex: number }
  | { kind: "needsEye" }
  | { kind: "signing" };

function callSafely(action: () => Promise<void> | void) {
  try {
    void Promise.resolve(action()).catch(() => undefined);
  } catch {
    // The owning screen presents command errors after refreshing session state.
  }
}

function updateSet<T>(current: Set<T>, value: T, included: boolean): Set<T> {
  const next = new Set(current);
  if (included) next.add(value);
  else next.delete(value);
  return next;
}

export function AiAssistReview({
  pass,
  entries,
  onApprove,
  onDismiss,
  onRetry,
  onEditRow,
}: AiAssistReviewProps) {
  const rootRef = useRef<HTMLElement>(null);
  const { groups, needsEye } = useMemo(
    () => buildAiAssistGroups(entries, pass),
    [entries, pass],
  );
  const suggestionById = useMemo(
    () =>
      new Map(
        pass.suggestions.map((suggestion) => [suggestion.statementRowId, suggestion]),
      ),
    [pass.suggestions],
  );
  const steps = useMemo<ReviewStep[]>(
    () => [
      ...groups.map((_, groupIndex) => ({ kind: "group" as const, groupIndex })),
      ...(needsEye.length > 0 ? [{ kind: "needsEye" as const }] : []),
      { kind: "signing" as const },
    ],
    [groups, needsEye.length],
  );
  const stepKeys = useMemo(
    () =>
      steps.map((step) =>
        step.kind === "group"
          ? `group:${groups[step.groupIndex].ledgerAccount}`
          : step.kind,
      ),
    [groups, steps],
  );
  const stepSignature = stepKeys.join("\u0000");
  const previousStepKeysRef = useRef(stepKeys);
  const previousPassIdRef = useRef(pass.passId);

  const [stepIndex, setStepIndex] = useState(0);
  const [reviewedSteps, setReviewedSteps] = useState<Set<number>>(new Set());
  const [skippedSteps, setSkippedSteps] = useState<Set<number>>(new Set());
  const [excludedRows, setExcludedRows] = useState<Set<string>>(new Set());
  const [includedNeedsEye, setIncludedNeedsEye] = useState<Set<string>>(new Set());
  const [excludedRules, setExcludedRules] = useState<Set<string>>(new Set());
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const currentStepIndex = Math.min(stepIndex, Math.max(steps.length - 1, 0));
  const currentStep = steps[currentStepIndex];
  const currentRows = useMemo(() => {
    if (currentStep?.kind === "group") return groups[currentStep.groupIndex]?.rows ?? [];
    if (currentStep?.kind === "needsEye") return needsEye;
    return [];
  }, [currentStep, groups, needsEye]);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    if (previousPassIdRef.current === pass.passId) return;
    previousPassIdRef.current = pass.passId;
    previousStepKeysRef.current = stepKeys;
    setStepIndex(0);
    setReviewedSteps(new Set());
    setSkippedSteps(new Set());
    setExcludedRows(new Set());
    setIncludedNeedsEye(new Set());
    setExcludedRules(new Set());
    setSelectedRowId(null);
    rootRef.current?.focus();
  }, [pass.passId, stepKeys]);

  useEffect(() => {
    if (stepIndex !== currentStepIndex) setStepIndex(currentStepIndex);
  }, [currentStepIndex, stepIndex]);

  useEffect(() => {
    const previousKeys = previousStepKeysRef.current;
    if (previousKeys.join("\u0000") === stepSignature) return;

    const remapGroupIndices = (current: Set<number>) => {
      const remapped = new Set<number>();
      current.forEach((oldIndex) => {
        const key = previousKeys[oldIndex];
        const nextIndex = key ? stepKeys.indexOf(key) : -1;
        if (nextIndex >= 0 && steps[nextIndex]?.kind === "group") remapped.add(nextIndex);
      });
      return remapped;
    };
    const currentKey = previousKeys[stepIndex];
    const nextCurrentIndex = currentKey ? stepKeys.indexOf(currentKey) : -1;

    setReviewedSteps(remapGroupIndices);
    setSkippedSteps(remapGroupIndices);
    setStepIndex(
      nextCurrentIndex >= 0
        ? nextCurrentIndex
        : Math.min(stepIndex, Math.max(stepKeys.length - 1, 0)),
    );
    previousStepKeysRef.current = stepKeys;
  }, [stepIndex, stepKeys, stepSignature, steps]);

  useEffect(() => {
    if (!currentRows.some((row) => row.statementRowId === selectedRowId)) {
      setSelectedRowId(currentRows[0]?.statementRowId ?? null);
    }
  }, [currentRows, selectedRowId]);

  const availableRowSignature = useMemo(
    () =>
      [...groups.flatMap((group) => group.rows), ...needsEye]
        .map((row) => row.statementRowId)
        .sort()
        .join("\u0000"),
    [groups, needsEye],
  );
  const availableRuleSignature = useMemo(
    () =>
      groups
        .flatMap((group) => group.rules)
        .map((rule) => rule.id)
        .sort()
        .join("\u0000"),
    [groups],
  );

  useEffect(() => {
    const availableRows = new Set(availableRowSignature.split("\u0000").filter(Boolean));
    const availableRules = new Set(availableRuleSignature.split("\u0000").filter(Boolean));
    setExcludedRows((current) =>
      new Set([...current].filter((rowId) => availableRows.has(rowId))),
    );
    setIncludedNeedsEye((current) =>
      new Set([...current].filter((rowId) => availableRows.has(rowId))),
    );
    setExcludedRules((current) =>
      new Set([...current].filter((ruleId) => availableRules.has(ruleId))),
    );
  }, [availableRowSignature, availableRuleSignature]);

  const groupHasCheckedRows = (groupIndex: number) =>
    groups[groupIndex]?.rows.some((row) => !excludedRows.has(row.statementRowId)) ?? false;

  const entriesSelection: ApproveAiAssistBatchInput["entries"] = [
    ...groups.flatMap((group) =>
      group.rows
        .filter((row) => !excludedRows.has(row.statementRowId))
        .map((row) => ({
          statementRowId: row.statementRowId,
          ledgerAccount: group.ledgerAccount,
          payee: suggestionById.get(row.statementRowId)?.payee ?? null,
          narration: suggestionById.get(row.statementRowId)?.narration ?? null,
        })),
    ),
    ...needsEye
      .filter((row) => includedNeedsEye.has(row.statementRowId))
      .flatMap((row) => {
        const suggestion = suggestionById.get(row.statementRowId);
        return suggestion?.ledgerAccount
          ? [
              {
                statementRowId: row.statementRowId,
                ledgerAccount: suggestion.ledgerAccount,
                payee: suggestion.payee ?? null,
                narration: suggestion.narration ?? null,
              },
            ]
          : [];
      }),
  ];
  const rulesSelection: ApproveAiAssistBatchInput["rules"] = groups.flatMap(
    (group, groupIndex) =>
      group.rules
        .filter(
          (rule) => !excludedRules.has(rule.id) && groupHasCheckedRows(groupIndex),
        )
        .map((rule) => ({
          sourceAccount: rule.sourceAccount,
          matchText: rule.matchText,
          ledgerAccount: rule.ledgerAccount,
        })),
  );

  const moveToNextStep = () =>
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));

  const acceptCurrentGroup = () => {
    if (currentStep?.kind !== "group") return;
    setReviewedSteps((current) => updateSet(current, currentStep.groupIndex, true));
    setSkippedSteps((current) => updateSet(current, currentStep.groupIndex, false));
    moveToNextStep();
  };

  const skipCurrentGroup = () => {
    if (currentStep?.kind !== "group") return;
    setSkippedSteps((current) => updateSet(current, currentStep.groupIndex, true));
    setReviewedSteps((current) => updateSet(current, currentStep.groupIndex, false));
    moveToNextStep();
  };

  const approveSelection = () =>
    callSafely(() => onApprove({ entries: entriesSelection, rules: rulesSelection }));

  const runPrimaryAction = () => {
    if (currentStep?.kind === "group") acceptCurrentGroup();
    else if (currentStep?.kind === "needsEye") moveToNextStep();
    else if (currentStep?.kind === "signing") approveSelection();
  };

  const toggleGroupRow = (rowId: string) => {
    const next = updateSet(excludedRows, rowId, !excludedRows.has(rowId));
    setExcludedRows(next);
  };

  const toggleSelectedRow = () => {
    if (!selectedRowId) return;
    if (currentStep?.kind === "group") {
      toggleGroupRow(selectedRowId);
      return;
    }
    if (currentStep?.kind === "needsEye") {
      const suggestion = suggestionById.get(selectedRowId);
      if (!suggestion?.ledgerAccount) return;
      setIncludedNeedsEye((current) =>
        updateSet(current, selectedRowId, !current.has(selectedRowId)),
      );
    }
  };

  const moveRowSelection = (offset: number) => {
    if (currentRows.length === 0) return;
    const selectedIndex = currentRows.findIndex(
      (row) => row.statementRowId === selectedRowId,
    );
    const nextIndex = Math.max(
      0,
      Math.min(
        currentRows.length - 1,
        (selectedIndex < 0 ? 0 : selectedIndex) + offset,
      ),
    );
    setSelectedRowId(currentRows[nextIndex].statementRowId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const isButton = target.closest("button") !== null;
    const isRowCheckbox =
      target instanceof HTMLInputElement && target.closest(".ai-assist-row") !== null;
    if (event.key === "Enter") {
      if (isButton) return;
      event.preventDefault();
      runPrimaryAction();
    } else if (event.key.toLowerCase() === "e" && selectedRowId) {
      event.preventDefault();
      onEditRow(selectedRowId);
    } else if (event.key.toLowerCase() === "j") {
      event.preventDefault();
      moveRowSelection(1);
    } else if (event.key.toLowerCase() === "k") {
      event.preventDefault();
      moveRowSelection(-1);
    } else if (event.key === " ") {
      if (event.target !== event.currentTarget && !isRowCheckbox) return;
      event.preventDefault();
      toggleSelectedRow();
    }
  };

  const reviewedGroupCount = [...reviewedSteps].filter(
    (index) => index < groups.length,
  ).length;

  return (
    <section
      ref={rootRef}
      className="ai-assist-review"
      aria-label="AI Assist review"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      {pass.status === "running" ? (
        <div className="ai-assist-progress" role="status" aria-live="polite">
          <strong>{`${pass.processedRows} of ${pass.totalRows} categorized…`}</strong>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {selectedRowId
          ? `Selected row ${currentRows.find((row) => row.statementRowId === selectedRowId)?.payee ?? ""}, ${Math.max(0, currentRows.findIndex((row) => row.statementRowId === selectedRowId)) + 1} of ${currentRows.length}`
          : "No row selected"}
      </p>

      <div className="ai-assist-flow">
        <aside className="ai-assist-rail" aria-label="AI Assist review steps">
          <p className="ai-assist-rail-label">Review by group</p>
          <p className="ai-assist-momentum" aria-live="polite">
            {reviewedGroupCount} of {groups.length} groups reviewed
          </p>
          <div className="ai-assist-meter" aria-hidden="true">
            {groups.map((group, index) => (
              <span
                key={group.ledgerAccount}
                className={reviewedSteps.has(index) ? "is-done" : ""}
              />
            ))}
          </div>
          <ol className="ai-assist-steps">
            {steps.map((step, index) => {
              const current = index === currentStepIndex;
              if (step.kind === "group") {
                const group = groups[step.groupIndex];
                const accepted = group.rows.filter(
                  (row) => !excludedRows.has(row.statementRowId),
                ).length;
                const reviewed = reviewedSteps.has(step.groupIndex);
                const skipped = skippedSteps.has(step.groupIndex);
                return (
                  <li key={group.ledgerAccount}>
                    <button
                      type="button"
                      className={`ai-assist-step${current ? " is-current" : ""}${reviewed ? " is-done" : ""}`}
                      aria-label={group.ledgerAccount}
                      aria-current={current ? "step" : undefined}
                      onClick={() => setStepIndex(index)}
                    >
                      <span className="ai-assist-step-marker" aria-hidden="true">
                        {reviewed ? "✓" : step.groupIndex + 1}
                      </span>
                      <span className="ai-assist-step-copy">
                        <strong>{group.ledgerAccount}</strong>
                        <small>
                          {reviewed
                            ? `${accepted} of ${group.rows.length} accepted`
                            : skipped
                              ? `Skipped · ${accepted} selected`
                              : `${group.rows.length} entries · ${formatSignedAmount(group.net)}`}
                        </small>
                      </span>
                    </button>
                  </li>
                );
              }
              const label = step.kind === "needsEye" ? "Needs your eye" : "Sign & approve";
              return (
                <li key={step.kind}>
                  <button
                    type="button"
                    className={`ai-assist-step ai-assist-step--${step.kind}${current ? " is-current" : ""}`}
                    aria-label={label}
                    aria-current={current ? "step" : undefined}
                    onClick={() => setStepIndex(index)}
                  >
                    <span className="ai-assist-step-marker" aria-hidden="true">
                      {step.kind === "needsEye" ? "•" : "✦"}
                    </span>
                    <span className="ai-assist-step-copy">
                      <strong>{label}</strong>
                      <small>
                        {step.kind === "needsEye"
                          ? `${needsEye.length} held back for review`
                          : `${entriesSelection.length} entries · ${rulesSelection.length} new rules`}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="ai-assist-stage">
          {currentStep?.kind === "group" ? (
            <GroupStep
              group={groups[currentStep.groupIndex]}
              groupIndex={currentStep.groupIndex}
              groupCount={groups.length}
              selectedRowId={selectedRowId}
              excludedRows={excludedRows}
              excludedRules={excludedRules}
              onSelectRow={setSelectedRowId}
              onToggleRow={toggleGroupRow}
              onToggleRule={(ruleId, checked) =>
                setExcludedRules((current) => updateSet(current, ruleId, !checked))
              }
              onEditRow={onEditRow}
              onSkip={skipCurrentGroup}
              onAccept={acceptCurrentGroup}
            />
          ) : null}
          {currentStep?.kind === "needsEye" ? (
            <NeedsEyeStep
              rows={needsEye}
              suggestionById={suggestionById}
              selectedRowId={selectedRowId}
              includedRows={includedNeedsEye}
              onSelectRow={setSelectedRowId}
              onToggleRow={(rowId, checked) =>
                setIncludedNeedsEye((current) => updateSet(current, rowId, checked))
              }
              onEditRow={onEditRow}
              onRetry={() => callSafely(onRetry)}
              onContinue={moveToNextStep}
            />
          ) : null}
          {currentStep?.kind === "signing" ? (
            <div className="ai-assist-card ai-assist-signing">
              <p className="ai-assist-stage-label">Final review</p>
              <h2>Sign &amp; approve</h2>
              <p className="ai-assist-signing-total">
                <strong>{entriesSelection.length}</strong> entries and{" "}
                <strong>{rulesSelection.length}</strong> new rules are staged.
              </p>
              <p className="ai-assist-snapshot-notice">
                A snapshot is taken before anything is written. You can revert this batch at
                any time.
              </p>
              <div className="ai-assist-actions">
                <button
                  type="button"
                  className="ai-assist-link-button"
                  onClick={() => callSafely(onDismiss)}
                >
                  Dismiss results
                </button>
                <button
                  type="button"
                  className="ai-assist-primary"
                  onClick={approveSelection}
                >
                  Approve {entriesSelection.length}{" "}
                  {entriesSelection.length === 1 ? "entry" : "entries"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <p className="ai-assist-staging-note">
        <strong>Approvals are staged.</strong> Nothing touches the ledger until you sign at the
        final step.
      </p>
    </section>
  );
}

type GroupStepProps = {
  group: ReturnType<typeof buildAiAssistGroups>["groups"][number];
  groupIndex: number;
  groupCount: number;
  selectedRowId: string | null;
  excludedRows: Set<string>;
  excludedRules: Set<string>;
  onSelectRow: (rowId: string) => void;
  onToggleRow: (rowId: string) => void;
  onToggleRule: (ruleId: string, checked: boolean) => void;
  onEditRow: (rowId: string) => void;
  onSkip: () => void;
  onAccept: () => void;
};

function GroupStep({
  group,
  groupIndex,
  groupCount,
  selectedRowId,
  excludedRows,
  excludedRules,
  onSelectRow,
  onToggleRow,
  onToggleRule,
  onEditRow,
  onSkip,
  onAccept,
}: GroupStepProps) {
  const hasCheckedRows = group.rows.some(
    (row) => !excludedRows.has(row.statementRowId),
  );
  const acceptedRows = group.rows.filter(
    (row) => !excludedRows.has(row.statementRowId),
  );
  const acceptedNet = acceptedRows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <>
      <div className="ai-assist-stage-heading">
        <p className="ai-assist-stage-label">
          Group {groupIndex + 1} of {groupCount} · AI suggested
        </p>
        <p className="ai-assist-key-hints" aria-hidden="true">
          <kbd>↵</kbd> accept <kbd>E</kbd> edit <kbd>J/K</kbd> move <kbd>Space</kbd> toggle
        </p>
      </div>
      <div className="ai-assist-card">
        <header className="ai-assist-card-header">
          <div>
            <h2>{group.ledgerAccount}</h2>
            <p>
              {group.rows.length} {group.rows.length === 1 ? "entry" : "entries"} · net{" "}
              <span className="ai-assist-amount">{formatSignedAmount(group.net)}</span>
            </p>
          </div>
          <p className="ai-assist-card-live" aria-live="polite">
            {acceptedRows.length} accepted · {formatSignedAmount(acceptedNet)} will be written
          </p>
        </header>

        {group.rules.length > 0 ? (
          <div className="ai-assist-rules" aria-label="Proposed rules">
            {group.rules.map((rule) => {
              const checked = hasCheckedRows && !excludedRules.has(rule.id);
              return (
                <label
                  key={rule.id}
                  className={`ai-assist-rule${checked ? "" : " is-excluded"}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`Include proposed rule ${group.rules.indexOf(rule) + 1}`}
                    checked={checked}
                    disabled={!hasCheckedRows}
                    onChange={(event) => onToggleRule(rule.id, event.target.checked)}
                  />
                  <span aria-hidden="true">⚡</span>
                  <span>
                    New rule: <code>{rule.matchText}</code> →{" "}
                    <code>{rule.ledgerAccount}</code>
                    <small>
                      {" "}· matches {rule.matchedRowCount}{" "}
                      {rule.matchedRowCount === 1 ? "row" : "rows"}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        ) : null}

        <div className="ai-assist-rows" role="list" aria-label={`${group.ledgerAccount} entries`}>
          {group.rows.map((row) => (
            <ReviewRow
              key={row.statementRowId}
              row={row}
              checked={!excludedRows.has(row.statementRowId)}
              selected={selectedRowId === row.statementRowId}
              onSelect={() => onSelectRow(row.statementRowId)}
              onToggle={() => onToggleRow(row.statementRowId)}
              onEdit={() => onEditRow(row.statementRowId)}
            />
          ))}
        </div>

        <footer className="ai-assist-card-footer">
          <p>Unchecked rows stay in the Inbox. Nothing is lost.</p>
          <div className="ai-assist-actions">
            <button type="button" className="ai-assist-secondary" onClick={onSkip}>
              Skip for now
            </button>
            <button type="button" className="ai-assist-primary" onClick={onAccept}>
              Looks right — next group <kbd>↵</kbd>
            </button>
          </div>
        </footer>
      </div>
    </>
  );
}

type NeedsEyeStepProps = {
  rows: AiAssistReviewRow[];
  suggestionById: Map<string, AiAssistPassState["suggestions"][number]>;
  selectedRowId: string | null;
  includedRows: Set<string>;
  onSelectRow: (rowId: string) => void;
  onToggleRow: (rowId: string, checked: boolean) => void;
  onEditRow: (rowId: string) => void;
  onRetry: () => void;
  onContinue: () => void;
};

function NeedsEyeStep({
  rows,
  suggestionById,
  selectedRowId,
  includedRows,
  onSelectRow,
  onToggleRow,
  onEditRow,
  onRetry,
  onContinue,
}: NeedsEyeStepProps) {
  return (
    <div className="ai-assist-card ai-assist-needs-eye">
      <header className="ai-assist-card-header">
        <div>
          <p className="ai-assist-stage-label">Held back for review</p>
          <h2>Needs your eye</h2>
          <p>Nothing here is included unless you check it.</p>
        </div>
      </header>
      <div className="ai-assist-rows" role="list" aria-label="Entries needing your eye">
        {rows.map((row) => {
          const suggestion = suggestionById.get(row.statementRowId);
          const canInclude = Boolean(suggestion?.ledgerAccount);
          return (
            <div key={row.statementRowId}>
              <ReviewRow
                row={row}
                checked={includedRows.has(row.statementRowId)}
                disabled={!canInclude}
                selected={selectedRowId === row.statementRowId}
                onSelect={() => onSelectRow(row.statementRowId)}
                onToggle={(checked) => onToggleRow(row.statementRowId, checked)}
                onEdit={() => onEditRow(row.statementRowId)}
                trailingAction={
                  row.failed ? (
                    <button type="button" className="ai-assist-link-button" onClick={onRetry}>
                      Retry
                    </button>
                  ) : null
                }
              />
              {row.explanation ? (
                <p className="ai-assist-explanation">{row.explanation}</p>
              ) : null}
            </div>
          );
        })}
      </div>
      <footer className="ai-assist-card-footer">
        <p>Edit rows without an account before including them.</p>
        <button type="button" className="ai-assist-primary" onClick={onContinue}>
          Review signing summary
        </button>
      </footer>
    </div>
  );
}

type ReviewRowProps = {
  row: AiAssistReviewRow;
  checked: boolean;
  disabled?: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
  trailingAction?: ReactNode;
};

function ReviewRow({
  row,
  checked,
  disabled = false,
  selected,
  onSelect,
  onToggle,
  onEdit,
  trailingAction,
}: ReviewRowProps) {
  return (
    <div
      className={`ai-assist-row${selected ? " is-selected" : ""}${checked ? "" : " is-excluded"}`}
      role="listitem"
      onMouseEnter={onSelect}
    >
      <input
        type="checkbox"
        aria-label={row.payee}
        checked={checked}
        disabled={disabled}
        onFocus={onSelect}
        onChange={(event) => onToggle(event.target.checked)}
      />
      <button type="button" className="ai-assist-row-copy" onClick={onEdit} onFocus={onSelect}>
        <strong>{row.payee}</strong>
        <span>{`was: ${row.rawDescription}`}</span>
        {selected ? <small className="ai-assist-selected-label">Selected</small> : null}
      </button>
      {trailingAction}
      <time dateTime={row.postedDate}>{formatInboxDate(row.postedDate)}</time>
      <span className="ai-assist-amount">{formatInboxAmount(row.sourceAmount)}</span>
    </div>
  );
}

function formatSignedAmount(amount: number): string {
  return formatInboxAmount(amount.toFixed(2));
}
