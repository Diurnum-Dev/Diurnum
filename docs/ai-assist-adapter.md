# AI Assist BYO Adapter Reference

Diurnum's AI Assist sends a batch categorization request to the configured
adapter command's standard input and reads one JSON response from standard
output. The adapter is a local subprocess; Diurnum does not give it direct
access to Workspace files.

All protocol field names are camelCase. The current batch request identifies
itself with `type: "batchSuggestionRequest"` and `version: 1`. An adapter should
reject request types or versions it does not support.

## Batch request

```json
{
  "type": "batchSuggestionRequest",
  "version": 1,
  "sharedContext": {
    "chartOfAccounts": ["Expenses:Software"],
    "categorizationRules": [
      {
        "id": "rule-id",
        "sourceAccount": "Assets:Bank:Checking",
        "matchText": "WEB PMTS",
        "ledgerAccount": "Expenses:Software",
        "enabled": true,
        "createdAt": "2026-07-14T12:00:00Z",
        "updatedAt": "2026-07-14T12:00:00Z"
      }
    ],
    "businessProfile": {
      "name": "Example Company",
      "baseCurrency": "USD",
      "booksStartDate": "2026-01-01"
    },
    "recentApprovedEntries": [
      {
        "description": "WEB PMTS AUTOBOOKS",
        "sourceAccount": "Assets:Bank:Checking"
      }
    ]
  },
  "rows": [
    {
      "id": "statement-row-id",
      "postedDate": "2026-07-01",
      "description": "WEB PMTS AUTOBOOKS",
      "sourceAccount": "Assets:Bank:Checking",
      "sourceAmount": "-49.00"
    }
  ]
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `type` | string | Always `batchSuggestionRequest` for this protocol. |
| `version` | integer | Currently `1`. |
| `sharedContext` | object | Context shared by every row in this invocation. |
| `rows` | array | Up to 40 pending standard Statement Rows in the current chunk. |

`sharedContext` contains:

| Field | Type | Meaning |
| --- | --- | --- |
| `chartOfAccounts` | string array | The exact ledger-account names available in the Workspace. |
| `categorizationRules` | object array | Current rules. Each has `id`, `sourceAccount`, `matchText`, `ledgerAccount`, `enabled`, `createdAt`, and `updatedAt`. |
| `businessProfile` | object | `name`, `baseCurrency`, and `booksStartDate` from the Workspace manifest. |
| `recentApprovedEntries` | object array | Up to 12 recent accounted rows, each with `description` and `sourceAccount`. |

Each `rows` item contains:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable Statement Row identifier; return it as `rowId`. |
| `postedDate` | string | The imported posting date. |
| `description` | string | Raw imported bank description. |
| `sourceAccount` | string | Workspace account containing the imported amount. |
| `sourceAmount` | string | Imported decimal amount, kept as a string. |

Context arrays can be empty. `rows` is non-empty in normal invocations because
Diurnum finishes a pass instead of invoking the adapter when no rows remain.

## Batch response

Write only the response JSON to standard output. Diagnostic output belongs on
standard error.

```json
{
  "suggestions": [
    {
      "rowId": "statement-row-id",
      "ledgerAccount": "Expenses:Software",
      "payee": "Autobooks",
      "narration": "Monthly bookkeeping software",
      "confidence": 0.93,
      "explanation": "The description matches the recurring software vendor.",
      "needsHumanAttention": false
    }
  ],
  "proposedRules": [
    {
      "matchText": "WEB PMTS AUTOBOOKS",
      "sourceAccount": "Assets:Bank:Checking",
      "ledgerAccount": "Expenses:Software",
      "matchedRowIds": ["statement-row-id"]
    }
  ]
}
```

Each `suggestions` item contains:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `rowId` | string | yes | The corresponding request row's `id`. |
| `ledgerAccount` | string or null | no | Proposed balancing account. Use an exact value from `sharedContext.chartOfAccounts`. |
| `payee` | string or null | no | Cleaned payee. |
| `narration` | string or null | no | Cleaned one-line transaction narration. |
| `confidence` | number or null | no | Adapter confidence. Values below `0.6`, and omitted or null confidence, go to “Needs your eye.” |
| `explanation` | string or null | no | Reason for the suggestion; stored locally for review. |
| `needsHumanAttention` | boolean | no | Defaults to `false`. Set `true` to put the row in “Needs your eye,” regardless of confidence. |

Each `proposedRules` item contains:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `matchText` | string | yes | Vendor substring for the proposed Categorization Rule. |
| `sourceAccount` | string | yes | Source Account to which the rule applies. |
| `ledgerAccount` | string | yes | Account the proposed rule selects; use an exact chart value. |
| `matchedRowIds` | string array | no | Defaults to an empty array; Diurnum currently uses its length as the displayed matched-row count. |

The top-level `suggestions` and `proposedRules` arrays each default to an empty
array when omitted. Do not send `null` in place of either array. A proposed rule
that duplicates an enabled rule with the same `sourceAccount` and `matchText` is
ignored, as is a duplicate proposal for the same pair elsewhere in the pass.
Rules are only created if the user selects them during approval.
Response ingestion does not independently chart-validate proposed rules or
cross-check `matchedRowIds`; adapters should therefore use request row ids,
request Source Accounts, and exact `chartOfAccounts` values.

## Validation and failure behavior

Diurnum compares each suggestion's `ledgerAccount` with
`sharedContext.chartOfAccounts` using an exact string match. A missing, null,
unknown, or differently formatted account cannot be a normal suggestion: the
row is placed in “Needs your eye.” An unknown account also replaces the supplied
explanation with a boundary-validation message. Diurnum does not normalize an
account name or add an adapter-suggested account at this boundary.

Unknown `rowId` values are ignored. Every requested row should appear exactly
once: a requested row omitted from `suggestions` is stored as failed and can be
retried. Invalid response JSON, a failure to start the adapter, or a non-zero
adapter exit marks every live row in that invocation as failed; other chunks in
the pass can continue. Diurnum currently imposes no adapter timeout, so wrappers
should terminate on their own when appropriate.

Suggestions and proposed rules are drafts. Normal suggestions start selected;
attention and failed rows start unselected. Nothing is written to Beancount and
no rule is created until the user reviews and approves a selection.

## Legacy per-row contract

The batch protocol coexists with the original per-row adapter contract. Ledger
Editor predictive completion can still invoke the same configured command once
for a row, after Categorization Rules and approved-entry history do not produce a
completion. It sends a camelCase `CuratedLedgerContext` object with
`statementRow`, `sourceAccount`, `chartOfAccounts`, `categorizationRules`,
`similarApprovedEntries`, and `businessProfile`; it expects one `AiSuggestion`
object rather than the batch response envelope.

That legacy response has `ledgerAccount`, optional `sourceAccount` and
`sourceAmount`, `payee`, `narration`, `confidence`, `explanation`, and
`needsHumanAttention`. Unlike the batch response, the legacy contract requires
`needsHumanAttention`. A single adapter executable must inspect the input shape
and return the matching legacy or batch response if both product paths use it.

## Claude Code CLI wrapper

Save this as `~/bin/diurnum-adapter`, run
`chmod +x ~/bin/diurnum-adapter`, and configure Diurnum's AI Adapter command as
`diurnum-adapter`:

```sh
#!/bin/sh
# Reads a Diurnum batchSuggestionRequest on stdin, returns suggestions JSON.
exec claude -p --output-format text "You are a bookkeeping assistant. Read the
JSON batchSuggestionRequest below. For every row, choose the best ledgerAccount
from sharedContext.chartOfAccounts, a short cleaned payee, and a one-line
narration. Respond with ONLY the JSON batchSuggestionResponse object — no prose,
no code fences. Set needsHumanAttention true when unsure. Also propose
proposedRules for recurring vendor substrings.

$(cat)"
```

This minimal wrapper implements the batch side of the adapter contract. If the
same configured command must also serve Ledger Editor predictive completion,
route on the input shape and add a prompt that returns the legacy response.
