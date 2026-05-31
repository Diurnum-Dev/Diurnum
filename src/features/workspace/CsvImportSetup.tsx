import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { analyzeCsvImport } from "../../lib/workspace/api";
import type {
  CsvImportAnalysis,
  CsvSourceMappingInput,
} from "../../lib/workspace/types";

type CsvImportSetupProps = {
  workspaceRootPath: string;
  onImportStatementRows: (input: {
    sourceAccount: string;
    sourceFileName: string;
    csvContents: string;
    mapping: CsvSourceMappingInput;
  }) => Promise<void> | void;
};

const emptyMapping = {
  postedDateColumn: "Date",
  descriptionColumn: "Description",
  amountColumn: "Amount",
  debitColumn: "",
  creditColumn: "",
  transactionTypeColumn: "",
  debitTypeValue: "Debit",
  statusColumn: "",
  checkNumberColumn: "",
  memoColumn: "",
  referenceIdColumn: "",
  payeeColumn: "",
  categoryColumn: "",
  dateFormat: "",
};

export function CsvImportSetup({
  workspaceRootPath,
  onImportStatementRows,
}: CsvImportSetupProps) {
  const [sourceAccount, setSourceAccount] = useState("");
  const [sourceFileName, setSourceFileName] = useState("");
  const [csvContents, setCsvContents] = useState("");
  const [postedDateColumn, setPostedDateColumn] = useState(emptyMapping.postedDateColumn);
  const [descriptionColumn, setDescriptionColumn] = useState(emptyMapping.descriptionColumn);
  const [amountColumn, setAmountColumn] = useState(emptyMapping.amountColumn);
  const [debitColumn, setDebitColumn] = useState(emptyMapping.debitColumn);
  const [creditColumn, setCreditColumn] = useState(emptyMapping.creditColumn);
  const [transactionTypeColumn, setTransactionTypeColumn] = useState(
    emptyMapping.transactionTypeColumn,
  );
  const [debitTypeValue, setDebitTypeValue] = useState(emptyMapping.debitTypeValue);
  const [statusColumn, setStatusColumn] = useState(emptyMapping.statusColumn);
  const [checkNumberColumn, setCheckNumberColumn] = useState(emptyMapping.checkNumberColumn);
  const [memoColumn, setMemoColumn] = useState(emptyMapping.memoColumn);
  const [referenceIdColumn, setReferenceIdColumn] = useState(emptyMapping.referenceIdColumn);
  const [payeeColumn, setPayeeColumn] = useState(emptyMapping.payeeColumn);
  const [categoryColumn, setCategoryColumn] = useState(emptyMapping.categoryColumn);
  const [dateFormat, setDateFormat] = useState(emptyMapping.dateFormat);
  const [analysis, setAnalysis] = useState<CsvImportAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisRequestId = useRef(0);

  useEffect(() => {
    if (!sourceFileName.trim() || !csvContents.trim()) {
      setAnalysis(null);
      setAnalysisError(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      void refreshAnalysis(false);
    }, 180);
    return () => window.clearTimeout(timeout);
    // Mapping fields intentionally drive the live preview.
  }, [
    workspaceRootPath,
    sourceAccount,
    sourceFileName,
    csvContents,
    postedDateColumn,
    descriptionColumn,
    amountColumn,
    debitColumn,
    creditColumn,
    transactionTypeColumn,
    debitTypeValue,
    statusColumn,
    checkNumberColumn,
    memoColumn,
    referenceIdColumn,
    payeeColumn,
    categoryColumn,
    dateFormat,
  ]);

  async function refreshAnalysis(
    applyMapping: boolean,
    overrides?: { sourceFileName?: string; csvContents?: string; sourceAccount?: string },
  ) {
    const requestId = ++analysisRequestId.current;
    const sourceFileNameValue = overrides?.sourceFileName ?? sourceFileName;
    const csvContentsValue = overrides?.csvContents ?? csvContents;
    const sourceAccountValue = overrides?.sourceAccount ?? sourceAccount;
    try {
      const result = await analyzeCsvImport({
        workspaceRootPath,
        sourceAccount: sourceAccountValue.trim() || null,
        sourceFileName: sourceFileNameValue.trim(),
        csvContents: csvContentsValue,
      });
      if (requestId !== analysisRequestId.current) return;
      setAnalysis(result);
      setAnalysisError(result.blockedReason ?? null);
      if (applyMapping) {
        applyDetectedMapping(result.mapping);
      }
    } catch (caught) {
      if (requestId !== analysisRequestId.current) return;
      setAnalysis(null);
      setAnalysisError(messageFromError(caught));
    }
  }

  function applyDetectedMapping(mapping: CsvSourceMappingInput) {
    setPostedDateColumn(mapping.postedDateColumn || emptyMapping.postedDateColumn);
    setDescriptionColumn(mapping.descriptionColumn || emptyMapping.descriptionColumn);
    setAmountColumn(mapping.amountColumn || "");
    setDebitColumn(mapping.debitColumn || "");
    setCreditColumn(mapping.creditColumn || "");
    setTransactionTypeColumn(mapping.transactionTypeColumn || "");
    setDebitTypeValue(mapping.debitTypeValue || emptyMapping.debitTypeValue);
    setStatusColumn(mapping.statusColumn || "");
    setCheckNumberColumn(mapping.checkNumberColumn || "");
    setMemoColumn(mapping.memoColumn || "");
    setReferenceIdColumn(mapping.referenceIdColumn || "");
    setPayeeColumn(mapping.payeeColumn || "");
    setCategoryColumn(mapping.categoryColumn || "");
    setDateFormat(mapping.dateFormat || "");
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await readFileAsText(file);
    setSourceFileName(file.name);
    setCsvContents(text);
    event.target.value = "";
    await refreshAnalysis(true, { sourceFileName: file.name, csvContents: text });
  }

  function handleReset() {
    applyDetectedMapping(analysis?.mapping ?? {
      postedDateColumn: emptyMapping.postedDateColumn,
      descriptionColumn: emptyMapping.descriptionColumn,
      amountColumn: emptyMapping.amountColumn,
      debitColumn: null,
      creditColumn: null,
      transactionTypeColumn: null,
      debitTypeValue: emptyMapping.debitTypeValue,
      statusColumn: null,
      checkNumberColumn: null,
      memoColumn: null,
      referenceIdColumn: null,
      payeeColumn: null,
      categoryColumn: null,
      dateFormat: null,
    });
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
          statusColumn: optionalColumn(statusColumn),
          checkNumberColumn: optionalColumn(checkNumberColumn),
          memoColumn: optionalColumn(memoColumn),
          referenceIdColumn: optionalColumn(referenceIdColumn),
          payeeColumn: optionalColumn(payeeColumn),
          categoryColumn: optionalColumn(categoryColumn),
          dateFormat: optionalColumn(dateFormat),
        },
      });
      setCsvContents("");
      setSourceFileName("");
      setAnalysis(null);
      setAnalysisError(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  const importableCount = analysis?.importableRowCount ?? 0;
  const footerStatus = analysis?.blockedReason
    ? analysis.blockedReason
    : analysis
      ? `Mapping valid · ${analysis.requiredMappedCount} of ${analysis.requiredFieldCount} required fields mapped · ${analysis.likelyDuplicateCount} likely duplicates flagged`
      : "Select a CSV to start analysis.";

  return (
    <section className="csv-import-setup" aria-labelledby="csv-import-setup-title">
      <div className="section-heading">
        <p className="eyebrow">CSV Import</p>
        <h2 id="csv-import-setup-title">Import Statement Rows</h2>
      </div>

      {analysis ? (
        <div className="csv-import-meta">
          <div>
            <strong>{analysis.fileName}</strong>
            <span>
              {analysis.rowCount} rows · {analysis.delimiter}-separated · {analysis.encoding}
            </span>
          </div>
          <div className="csv-import-meta-badge">
            {analysis.autoDetected && !analysis.blockedReason ? "Auto-detected" : "Manual mapping"}
          </div>
        </div>
      ) : null}

      {analysisError ? (
        <div className="error-banner" role="alert">
          {analysisError}
        </div>
      ) : null}

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

        {analysis ? (
          <div className="csv-import-stats">
            <div>{analysis.rowCount} rows in file</div>
            <div>{analysis.skippedRowCount} skipped</div>
            <div>{analysis.importableRowCount} to import</div>
          </div>
        ) : null}

        <div className="mapping-toolbar">
          <button type="button" className="secondary-button" onClick={handleReset}>
            Reset
          </button>
        </div>

        <div className="mapping-grid">
          <MappingField
            label="Posted date column"
            value={postedDateColumn}
            onChange={setPostedDateColumn}
            required
          />
          <MappingField
            label="Description column"
            value={descriptionColumn}
            onChange={setDescriptionColumn}
            required
          />
          <MappingField label="Amount column" value={amountColumn} onChange={setAmountColumn} />
          <MappingField label="Debit column" value={debitColumn} onChange={setDebitColumn} />
          <MappingField label="Credit column" value={creditColumn} onChange={setCreditColumn} />
          <MappingField
            label="Transaction type column"
            value={transactionTypeColumn}
            onChange={setTransactionTypeColumn}
          />
          <MappingField label="Debit type value" value={debitTypeValue} onChange={setDebitTypeValue} />
          <MappingField label="Status column" value={statusColumn} onChange={setStatusColumn} />
          <MappingField
            label="Check number column"
            value={checkNumberColumn}
            onChange={setCheckNumberColumn}
          />
          <MappingField label="Memo column" value={memoColumn} onChange={setMemoColumn} />
          <MappingField
            label="Reference id column"
            value={referenceIdColumn}
            onChange={setReferenceIdColumn}
          />
          <MappingField label="Payee column" value={payeeColumn} onChange={setPayeeColumn} />
          <MappingField label="Category column" value={categoryColumn} onChange={setCategoryColumn} />
          <MappingField label="Date format" value={dateFormat} onChange={setDateFormat} />
        </div>

        {analysis ? (
          <section className="csv-import-preview" aria-labelledby="csv-import-preview-title">
            <div className="section-heading">
              <p className="eyebrow">Preview</p>
              <h3 id="csv-import-preview-title">Statement Rows</h3>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {analysis.previewRows.map((row, index) => (
                  <tr key={`${row.postedDate}-${row.description}-${index}`}>
                    <td>{row.postedDate}</td>
                    <td>{row.description}</td>
                    <td>{row.signedAmount}</td>
                    <td>{row.status || "Posted"}</td>
                    <td>{row.duplicate ? "Duplicate" : "+ New"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {analysis ? (
          <section className="csv-import-columns" aria-labelledby="csv-import-columns-title">
            <div className="section-heading">
              <p className="eyebrow">Columns</p>
              <h3 id="csv-import-columns-title">Detected Fields</h3>
            </div>
            <ul>
              {analysis.columns.map((column) => (
                <li key={column.header} className={column.status === "unknown" ? "unknown-column" : ""}>
                  <strong>{column.header}</strong>
                  <span>{column.sampleValue || "No sample value"}</span>
                  <span>{column.diurnumField || "Choose diurnum field"}</span>
                  <span>{column.required ? "required" : "optional"}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="csv-import-footer">
          <span>{footerStatus}</span>
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
              Boolean(analysis?.blockedReason) ||
              isSubmitting
            }
          >
            Import {importableCount} rows
          </button>
        </div>
      </form>
    </section>
  );
}

function MappingField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className={required ? "required-field" : ""}>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
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

function messageFromError(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "CSV Import could not complete that action.";
}
