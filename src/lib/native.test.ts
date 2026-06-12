import { describe, expect, it } from "vitest";
import { isEditableTarget } from "./native";

describe("isEditableTarget", () => {
  it("treats inputs, textareas, and contenteditable as editable", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    editable.appendChild(child);
    document.body.append(input, textarea, editable);

    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(textarea)).toBe(true);
    expect(isEditableTarget(child)).toBe(true);
  });

  it("treats CodeMirror content as editable", () => {
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    const line = document.createElement("div");
    editor.appendChild(line);
    document.body.appendChild(editor);

    expect(isEditableTarget(line)).toBe(true);
  });

  it("treats chrome elements and null as not editable", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);

    expect(isEditableTarget(button)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
