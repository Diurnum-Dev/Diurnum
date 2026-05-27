import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CsvImportSetup } from "./CsvImportSetup";

const CSV_CONTENTS = "Date,Description,Amount\n2026-01-03,Client payment,1500.00";

describe("CsvImportSetup", () => {
  it("submits CSV import mapping details", async () => {
    const user = userEvent.setup();
    const onImportStatementRows = vi.fn().mockResolvedValue(undefined);

    render(<CsvImportSetup onImportStatementRows={onImportStatementRows} />);

    await user.type(screen.getByLabelText("Source Account"), "Assets:Bank:Operating-Checking");
    await user.type(screen.getByLabelText("Source file name"), "checking.csv");
    await user.type(screen.getByLabelText("CSV contents"), CSV_CONTENTS);
    await user.click(screen.getByRole("button", { name: "Import Statement Rows" }));

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
        memoColumn: null,
        referenceIdColumn: null,
        payeeColumn: null,
        categoryColumn: null,
      },
    });
  });

  it("submits debit and credit columns when no amount column is mapped", async () => {
    const user = userEvent.setup();
    const onImportStatementRows = vi.fn().mockResolvedValue(undefined);

    render(<CsvImportSetup onImportStatementRows={onImportStatementRows} />);

    await user.type(screen.getByLabelText("Source Account"), "Assets:Bank:Operating-Checking");
    await user.type(screen.getByLabelText("Source file name"), "checking.csv");
    await user.type(
      screen.getByLabelText("CSV contents"),
      "Date,Description,Debit,Credit\n2026-01-03,Client payment,,1500.00",
    );
    await user.clear(screen.getByLabelText("Amount column"));
    await user.type(screen.getByLabelText("Debit column"), "Debit");
    await user.type(screen.getByLabelText("Credit column"), "Credit");
    await user.click(screen.getByRole("button", { name: "Import Statement Rows" }));

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
        memoColumn: null,
        referenceIdColumn: null,
        payeeColumn: null,
        categoryColumn: null,
      },
    });
  });

  it("loads filename and CSV contents when a file is chosen", async () => {
    const user = userEvent.setup();
    const onImportStatementRows = vi.fn().mockResolvedValue(undefined);

    render(<CsvImportSetup onImportStatementRows={onImportStatementRows} />);

    const csvFile = new File([CSV_CONTENTS], "checking.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, csvFile);

    expect(screen.getByLabelText("Source file name")).toHaveValue("checking.csv");
    expect(screen.getByLabelText("CSV contents")).toHaveValue(CSV_CONTENTS);
  });

  it("auto-detects Capital One column mapping when a file is chosen", async () => {
    const user = userEvent.setup();
    const onImportStatementRows = vi.fn().mockResolvedValue(undefined);

    render(<CsvImportSetup onImportStatementRows={onImportStatementRows} />);

    const capitalOneCsv =
      '"Account Number","Transaction Description","Transaction Date","Transaction Type","Transaction Amount","Balance"\n' +
      '"0000","Software subscription","2026-05-04","Debit","29.99","1000.00"\n' +
      '"0000","Client payment","2026-05-05","Credit","500.00","1500.00"\n';

    const csvFile = new File([capitalOneCsv], "capital-one.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, csvFile);

    expect(screen.getByLabelText("Posted date column")).toHaveValue("Transaction Date");
    expect(screen.getByLabelText("Description column")).toHaveValue("Transaction Description");
    expect(screen.getByLabelText("Amount column")).toHaveValue("Transaction Amount");
    expect(screen.getByLabelText("Transaction type column")).toHaveValue("Transaction Type");
    expect(screen.getByLabelText("Debit type value")).toHaveValue("Debit");
  });
});
