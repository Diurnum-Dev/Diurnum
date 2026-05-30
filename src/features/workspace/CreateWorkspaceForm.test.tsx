import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateWorkspaceForm } from "./CreateWorkspaceForm";

describe("CreateWorkspaceForm", () => {
  it("requires business name, books start date, and parent directory", () => {
    render(
      <CreateWorkspaceForm
        onCancel={vi.fn()}
        onChooseDirectory={async () => null}
        onCreate={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Create Workspace" })).toBeDisabled();
  });

  it("keeps currency fixed to USD", () => {
    render(
      <CreateWorkspaceForm
        onCancel={vi.fn()}
        onChooseDirectory={async () => null}
        onCreate={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Currency")).toHaveValue("USD");
    expect(screen.getByLabelText("Currency")).toHaveAttribute("readonly");
  });

  it("can open with the example template preselected", () => {
    render(
      <CreateWorkspaceForm
        initialTemplate="example"
        onCancel={vi.fn()}
        onChooseDirectory={async () => null}
        onCreate={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Example workspace/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Blank/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("submits the Workspace creation input", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(
      <CreateWorkspaceForm
        onCancel={vi.fn()}
        onChooseDirectory={async () => "/tmp"}
        onCreate={onCreate}
      />,
    );

    await user.type(screen.getByLabelText("Business name"), "Acme Studio");
    await user.clear(screen.getByLabelText("Books start date"));
    await user.type(screen.getByLabelText("Books start date"), "2026-01-01");
    await user.click(screen.getByRole("button", { name: "Choose" }));
    await user.click(screen.getByRole("button", { name: "Create Workspace" }));

    expect(onCreate).toHaveBeenCalledWith({
      businessName: "Acme Studio",
      baseCurrency: "USD",
      booksStartDate: "2026-01-01",
      parentDirectory: "/tmp",
    });
  });

  it("renders Workspace errors", () => {
    render(
      <CreateWorkspaceForm
        onCancel={vi.fn()}
        onChooseDirectory={async () => null}
        onCreate={vi.fn()}
        error="A Workspace folder already exists at this location."
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "A Workspace folder already exists at this location.",
    );
  });
});
