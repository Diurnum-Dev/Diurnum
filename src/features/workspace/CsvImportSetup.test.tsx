import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CsvImportSetup } from "./CsvImportSetup";

const CSV_CONTENTS = "Date,Description,Amount\n2026-01-03,Client payment,1500.00";
const workspaceRootPath = "/tmp/Acme Studio";

function installTestApi() {
  window.__DIURNUM_TEST_API__ = {
    async analyzeCsvImport(input: { sourceFileName: string; csvContents: string }) {
      return {
        fileName: input.sourceFileName,
        rowCount: 1,
        delimiter: "Comma",
        encoding: "UTF-8",
        autoDetected: true,
        requiredFieldCount: 3,
        requiredMappedCount: 3,
        likelyDuplicateCount: 0,
        importableRowCount: 1,
        skippedRowCount: 0,
        columns: [],
        previewRows: [
          {
            postedDate: "2026-01-03",
            description: "Client payment",
            signedAmount: "1500.00",
            status: "Posted",
            duplicate: false,
          },
        ],
        mapping: input.csvContents.includes("Transaction Date")
          ? {
              postedDateColumn: "Transaction Date",
              descriptionColumn: "Transaction Description",
              amountColumn: "Transaction Amount",
              debitColumn: null,
              creditColumn: null,
              transactionTypeColumn: "Transaction Type",
              debitTypeValue: "Debit",
              statusColumn: null,
              checkNumberColumn: null,
              memoColumn: null,
              referenceIdColumn: null,
              payeeColumn: null,
              categoryColumn: null,
              dateFormat: null,
            }
          : {
              postedDateColumn: "Date",
              descriptionColumn: "Description",
              amountColumn: "Amount",
              debitColumn: null,
              creditColumn: null,
              transactionTypeColumn: null,
              debitTypeValue: "Debit",
              statusColumn: null,
              checkNumberColumn: null,
              memoColumn: null,
              referenceIdColumn: null,
              payeeColumn: null,
              categoryColumn: null,
              dateFormat: null,
            },
        blockedReason: null,
      };
    },
    async importStatementRows(input: unknown) {
      return input;
    },
  } as any;
}

function uninstallTestApi() {
  delete window.__DIURNUM_TEST_API__;
}

describe("CsvImportSetup", () => {
  beforeEach(() => {
    installTestApi();
  });

  afterEach(() => {
    uninstallTestApi();
  });

  it("submits CSV import mapping details", async () => {
    const user = userEvent.setup();
    const onImportStatementRows = vi.fn().mockResolvedValue(undefined);

    render(
      <CsvImportSetup
        workspaceRootPath={workspaceRootPath}
        onImportStatementRows={onImportStatementRows}
      />,
    );

    fireEvent.change(screen.getByLabelText("Source Account"), {
      target: { value: "Assets:Bank:Operating-Checking" },
    });
    fireEvent.change(screen.getByLabelText("Source file name"), {
      target: { value: "checking.csv" },
    });
    fireEvent.change(screen.getByLabelText("CSV contents"), {
      target: { value: CSV_CONTENTS },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Import 1 rows" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Import 1 rows" }));

    expect(onImportStatementRows).toHaveBeenCalledWith({
      sourceAccount: "Assets:Bank:Operating-Checking",
      sourceFileName: "checking.csv",
      csvContents: CSV_CONTENTS,
        mapping: {
          postedDateColumn: "Date",
          descriptionColumn: "Description",
          amountColumn: "Amount",
          debitColumn: null,
          creditColumn: null,
          transactionTypeColumn: null,
          debitTypeValue: "Debit",
          statusColumn: null,
          checkNumberColumn: null,
          memoColumn: null,
          referenceIdColumn: null,
          payeeColumn: null,
          categoryColumn: null,
          dateFormat: null,
        },
      });
  });

  it("submits debit and credit columns when no amount column is mapped", async () => {
    const user = userEvent.setup();
    const onImportStatementRows = vi.fn().mockResolvedValue(undefined);

    render(
      <CsvImportSetup
        workspaceRootPath={workspaceRootPath}
        onImportStatementRows={onImportStatementRows}
      />,
    );

    fireEvent.change(screen.getByLabelText("Source Account"), {
      target: { value: "Assets:Bank:Operating-Checking" },
    });
    fireEvent.change(screen.getByLabelText("Source file name"), {
      target: { value: "checking.csv" },
    });
    fireEvent.change(screen.getByLabelText("CSV contents"), {
      target: {
        value: "Date,Description,Debit,Credit\n2026-01-03,Client payment,,1500.00",
      },
    });
    fireEvent.change(screen.getByLabelText("Amount column"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Debit column"), {
      target: { value: "Debit" },
    });
    fireEvent.change(screen.getByLabelText("Credit column"), {
      target: { value: "Credit" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Import 1 rows" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Import 1 rows" }));

    expect(onImportStatementRows).toHaveBeenCalledWith({
      sourceAccount: "Assets:Bank:Operating-Checking",
      sourceFileName: "checking.csv",
      csvContents: "Date,Description,Debit,Credit\n2026-01-03,Client payment,,1500.00",
        mapping: {
          postedDateColumn: "Date",
          descriptionColumn: "Description",
          amountColumn: null,
          debitColumn: "Debit",
          creditColumn: "Credit",
          transactionTypeColumn: null,
          debitTypeValue: "Debit",
          statusColumn: null,
          checkNumberColumn: null,
          memoColumn: null,
          referenceIdColumn: null,
          payeeColumn: null,
          categoryColumn: null,
          dateFormat: null,
        },
      });
  });

  it("loads filename and CSV contents when a file is chosen", async () => {
    const user = userEvent.setup();
    const onImportStatementRows = vi.fn().mockResolvedValue(undefined);

    render(
      <CsvImportSetup
        workspaceRootPath={workspaceRootPath}
        onImportStatementRows={onImportStatementRows}
      />,
    );

    const csvFile = new File([CSV_CONTENTS], "checking.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, csvFile);

    expect(screen.getByLabelText("Source file name")).toHaveValue("checking.csv");
    expect(screen.getByLabelText("CSV contents")).toHaveValue(CSV_CONTENTS);
  });

  it("auto-detects Capital One column mapping when a file is chosen", async () => {
    const user = userEvent.setup();
    const onImportStatementRows = vi.fn().mockResolvedValue(undefined);

    render(
      <CsvImportSetup
        workspaceRootPath={workspaceRootPath}
        onImportStatementRows={onImportStatementRows}
      />,
    );

    const capitalOneCsv =
      '"Account Number","Transaction Description","Transaction Date","Transaction Type","Transaction Amount","Balance"\n' +
      '"0000","Software subscription","2026-05-04","Debit","29.99","1000.00"\n' +
      '"0000","Client payment","2026-05-05","Credit","500.00","1500.00"\n';

    const csvFile = new File([capitalOneCsv], "capital-one.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, csvFile);

    await waitFor(() =>
      expect(screen.getByLabelText("Posted date column")).toHaveValue("Transaction Date"),
    );
    expect(screen.getByLabelText("Description column")).toHaveValue("Transaction Description");
    expect(screen.getByLabelText("Amount column")).toHaveValue("Transaction Amount");
    expect(screen.getByLabelText("Transaction type column")).toHaveValue("Transaction Type");
    expect(screen.getByLabelText("Debit type value")).toHaveValue("Debit");
  });
});
