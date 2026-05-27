import { useState, useRef } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { CsvSourceMappingInput } from "../../lib/workspace/types";

type CsvImportSetupProps = {
  onImportStatementRows: (input: {
    sourceAccount: string;
    sourceFileName: string;
    csvContents: string;
    mapping: CsvSourceMappingInput;
  }) => Promise<void> | void;
};

export function CsvImportSetup({ onImportStatementRows }: CsvImportSetupProps) {
  const [sourceAccount, setSourceAccount] = useState("");
  const [sourceFileName, setSourceFileName] = useState("");
  const [csvContents, setCsvContents] = useState("");
  const [postedDateColumn, setPostedDateColumn] = useState("Date");
  const [descriptionColumn, setDescriptionColumn] = useState("Description");
  const [amountColumn, setAmountColumn] = useState("Amount");
  const [debitColumn, setDebitColumn] = useState("");
  const [creditColumn, setCreditColumn] = useState("");
  const [transactionTypeColumn, setTransactionTypeColumn] = useState("");
  const [debitTypeValue, setDebitTypeValue] = useState("Debit");
  const [memoColumn, setMemoColumn] = useState("");
  const [referenceIdColumn, setReferenceIdColumn] = useState("");
  const [payeeColumn, setPayeeColumn] = useState("");
  const [categoryColumn, setCategoryColumn] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSourceFileName(file.name);
    const text = await readFileAsText(file);
    setCsvContents(text);
    applyAutoDetectedColumns(text);
    // Reset so the same file can be re-selected if needed
    event.target.value = "";
  }

  function applyAutoDetectedColumns(csvText: string) {
    const headers = parseCsvHeaders(csvText);
    if (headers.length === 0) return;

    const find = (...candidates: string[]): string => {
      for (const c of candidates) {
        const match = headers.find((h) => h.toLowerCase() === c.toLowerCase());
        if (match) return match;
      }
      // Partial match fallback
      for (const c of candidates) {
        const match = headers.find((h) => h.toLowerCase().includes(c.toLowerCase()));
        if (match) return match;
      }
      return "";
    };

    const detectedDate = find("Date", "Transaction Date", "Posted Date", "Posting Date", "Post Date");
    const detectedDesc = find("Description", "Transaction Description", "Memo", "Narrative", "Details");
    const detectedAmount = find("Amount", "Transaction Amount");
    const detectedDebit = find("Debit Amount", "Debit");
    const detectedCredit = find("Credit Amount", "Credit");
    const detectedType = find("Transaction Type", "Type");
    const detectedMemo = find("Memo", "Note", "Notes");
    const detectedRef = find("Reference", "Reference ID", "Reference Number", "Check Number");
    const detectedPayee = find("Payee", "Merchant", "Vendor");
    const detectedCategory = find("Category", "Spending Category");

    if (detectedDate) setPostedDateColumn(detectedDate);
    if (detectedDesc) setDescriptionColumn(detectedDesc);

    // Prefer separate debit/credit columns if both found; otherwise use amount.
    // Clear whichever pair isn't being used to avoid confusing the backend.
    if (detectedDebit && detectedCredit) {
      setDebitColumn(detectedDebit);
      setCreditColumn(detectedCredit);
      setAmountColumn("");
      setTransactionTypeColumn("");
      setDebitTypeValue("Debit");
    } else if (detectedAmount) {
      setAmountColumn(detectedAmount);
      setDebitColumn("");
      setCreditColumn("");
      // Wire up the type column when found alongside a single amount column
      if (detectedType) {
        setTransactionTypeColumn(detectedType);
        setDebitTypeValue("Debit");
      } else {
        setTransactionTypeColumn("");
      }
    }

    if (detectedMemo) setMemoColumn(detectedMemo);
    if (detectedRef) setReferenceIdColumn(detectedRef);
    if (detectedPayee) setPayeeColumn(detectedPayee);
    if (detectedCategory) setCategoryColumn(detectedCategory);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onImportStatementRows({
        sourceAccount: sourceAccount.trim(),
        sourceFileName: sourceFileName.trim(),
        csvContents,
        mapping: {
          postedDateColumn: postedDateColumn.trim(),
          descriptionColumn: descriptionColumn.trim(),
          amountColumn: optionalColumn(amountColumn),
          debitColumn: optionalColumn(debitColumn),
          creditColumn: optionalColumn(creditColumn),
          transactionTypeColumn: optionalColumn(transactionTypeColumn),
          debitTypeValue: optionalColumn(debitTypeValue),
          memoColumn: optionalColumn(memoColumn),
          referenceIdColumn: optionalColumn(referenceIdColumn),
          payeeColumn: optionalColumn(payeeColumn),
          categoryColumn: optionalColumn(categoryColumn),
        },
      });
      setCsvContents("");
      setSourceFileName("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="csv-import-setup" aria-labelledby="csv-import-setup-title">
      <div className="section-heading">
        <p className="eyebrow">CSV Import</p>
        <h2 id="csv-import-setup-title">Import Statement Rows</h2>
      </div>

      <form className="workspace-form" onSubmit={handleSubmit}>
        <label>
          Source Account
          <input
            value={sourceAccount}
            onChange={(event) => setSourceAccount(event.target.value)}
            placeholder="Assets:Bank:Operating-Checking"
          />
        </label>

        <div className="directory-field">
          <label>
            Source file name
            <input
              value={sourceFileName}
              onChange={(event) => setSourceFileName(event.target.value)}
              placeholder="checking.csv"
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose CSV
          </button>
        </div>
        {/* Hidden file input — triggered by the Choose CSV button above.
            Selecting a file auto-populates the filename, CSV contents, and
            column mapping fields. */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,text/csv,text/plain"
          style={{ display: "none" }}
          aria-hidden="true"
          onChange={handleFileChange}
        />

        <label>
          CSV contents
          <textarea
            value={csvContents}
            onChange={(event) => setCsvContents(event.target.value)}
            rows={6}
            placeholder="Paste CSV here, or use Choose CSV above to load a file."
          />
        </label>

        <div className="mapping-grid">
          <label>
            Posted date column
            <input value={postedDateColumn} onChange={(event) => setPostedDateColumn(event.target.value)} />
          </label>
          <label>
            Description column
            <input value={descriptionColumn} onChange={(event) => setDescriptionColumn(event.target.value)} />
          </label>
          <label>
            Amount column
            <input value={amountColumn} onChange={(event) => setAmountColumn(event.target.value)} />
          </label>
          <label>
            Debit column
            <input value={debitColumn} onChange={(event) => setDebitColumn(event.target.value)} />
          </label>
          <label>
            Credit column
            <input value={creditColumn} onChange={(event) => setCreditColumn(event.target.value)} />
          </label>
          <label>
            Transaction type column
            <input value={transactionTypeColumn} onChange={(event) => setTransactionTypeColumn(event.target.value)} />
          </label>
          <label>
            Debit type value
            <input value={debitTypeValue} onChange={(event) => setDebitTypeValue(event.target.value)} />
          </label>
          <label>
            Memo column
            <input value={memoColumn} onChange={(event) => setMemoColumn(event.target.value)} />
          </label>
          <label>
            Reference id column
            <input value={referenceIdColumn} onChange={(event) => setReferenceIdColumn(event.target.value)} />
          </label>
          <label>
            Payee column
            <input value={payeeColumn} onChange={(event) => setPayeeColumn(event.target.value)} />
          </label>
          <label>
            Category column
            <input value={categoryColumn} onChange={(event) => setCategoryColumn(event.target.value)} />
          </label>
        </div>

        <button
          className="primary-button"
          type="submit"
          disabled={
            !sourceAccount.trim() ||
            !sourceFileName.trim() ||
            !csvContents.trim() ||
            !postedDateColumn.trim() ||
            !descriptionColumn.trim() ||
            (!amountColumn.trim() && (!debitColumn.trim() || !creditColumn.trim())) ||
            isSubmitting
          }
        >
          Import Statement Rows
        </button>
      </form>
    </section>
  );
}

function optionalColumn(value: string): string | null {
  return value.trim() || null;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Extract header names from the first non-empty CSV line. */
function parseCsvHeaders(csvText: string): string[] {
  const firstLine = csvText.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) return [];
  return firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
}
