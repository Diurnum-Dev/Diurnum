import { describe, expect, it } from "vitest";
import { isEditableTarget, isSelectableTextTarget } from "./native";

describe("isEditableTarget", () => {
  it("treats inputs, textareas, and contenteditable as editable", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    editable.appendChild(child);
    document.body.append(input, textarea, select, editable);

    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(textarea)).toBe(true);
    expect(isEditableTarget(select)).toBe(true);
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

describe("isSelectableTextTarget", () => {
  it("treats selectable read-only text surfaces as selectable", () => {
    const pre = document.createElement("pre");
    const codeChild = document.createElement("span");
    const code = document.createElement("code");
    code.appendChild(codeChild);
    const banner = document.createElement("div");
    banner.className = "error-banner";
    document.body.append(pre, code, banner);

    expect(isSelectableTextTarget(pre)).toBe(true);
    expect(isSelectableTextTarget(codeChild)).toBe(true);
    expect(isSelectableTextTarget(banner)).toBe(true);
  });

  it("treats chrome elements and null as not selectable text", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);

    expect(isSelectableTextTarget(button)).toBe(false);
    expect(isSelectableTextTarget(null)).toBe(false);
  });
});
