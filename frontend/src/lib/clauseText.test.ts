import { describe, expect, it } from "vitest";
import { formatClauseDisplayText, looksCollapsedClauseText } from "@/lib/clauseText";

describe("formatClauseDisplayText", () => {
  it("restores spacing in collapsed clause text", () => {
    const raw =
      "TheTenantshallmaintaintheDemisedPremisesingoodandtenableconditionandalltheminorrepairssuchasleakageinthesanitaryfittings,watertapsandelectricalusageetc.shallbecarriedoutbytheTenant.";

    const formatted = formatClauseDisplayText(raw);

    expect(formatted).toContain("The Tenant shall maintain the Demised Premises in good and tenable condition");
    expect(formatted).toContain("such as leakage in the sanitary fittings, water taps and electrical usage etc.");
  });

  it("keeps already readable text stable", () => {
    const readable =
      "The Tenant shall maintain the Demised Premises in good and tenable condition, subject to natural wear and tear.";

    expect(formatClauseDisplayText(readable)).toBe(readable);
  });

  it("detects suspicious collapsed tokens", () => {
    expect(looksCollapsedClauseText("TheTenantshallmaintaintheDemisedPremises")).toBe(true);
    expect(looksCollapsedClauseText("The Tenant shall maintain the premises")).toBe(false);
  });
});
