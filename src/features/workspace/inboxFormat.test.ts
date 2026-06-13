// src/features/workspace/inboxFormat.test.ts
import { describe, expect, it } from "vitest";
import { formatInboxAmount, formatInboxDate, invertAmount } from "./inboxFormat";

describe("formatInboxDate", () => {
  it("formats an ISO date as short month + day in UTC", () => {
    expect(formatInboxDate("2026-05-08")).toBe("May 8");
  });

  it("returns the raw value when unparseable", () => {
    expect(formatInboxDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatInboxAmount", () => {
  it("renders negative amounts with a minus sign", () => {
    expect(formatInboxAmount("-20.00")).toBe("−$20.00");
  });

  it("renders positive amounts with a plus sign", () => {
    expect(formatInboxAmount("3240")).toBe("+$3240.00");
  });
});

describe("invertAmount", () => {
  it("flips the sign", () => {
    expect(invertAmount("-20.00")).toBe("20.00");
  });
});
