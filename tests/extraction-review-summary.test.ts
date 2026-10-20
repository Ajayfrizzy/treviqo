import { expect, it } from "vitest";
import {
  reviewedFieldCounts,
  type ExtractionRecord,
} from "@/modules/extractions/shared";
it("counts confirmed, corrected, rejected and unknown independently, excluding category and proposals", () => {
  const record = {
    documentType: "payslip",
    fields: [
      { key: "document_type", reviewState: "confirmed" },
      { key: "employer", reviewState: "confirmed" },
      { key: "employee", reviewState: "corrected" },
      { key: "gross_pay", reviewState: "rejected" },
      { key: "net_pay", reviewState: "unknown" },
      { key: "pay_period", reviewState: "proposed" },
      { key: "pension_deduction", reviewState: "proposed" },
      { key: "unsupported_key", reviewState: "confirmed" },
    ],
  } as ExtractionRecord;
  expect(reviewedFieldCounts(record)).toEqual({
    confirmed: 1,
    corrected: 1,
    rejected: 1,
    unknown: 1,
  });
});
