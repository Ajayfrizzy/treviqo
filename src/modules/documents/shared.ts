export const documentTypes = {
  employment_contract: "Employment contract",
  payslip: "Payslip",
  resignation_letter: "Resignation letter",
  termination_letter: "Termination letter",
  exit_letter: "Exit letter",
  pension_statement: "Pension statement",
  final_settlement: "Final-settlement document",
  reimbursement_evidence: "Reimbursement / expense evidence",
  benefit_document: "Benefit document",
  other: "Other",
} as const;
export type DocumentType = keyof typeof documentTypes;
export const documentStatusLabels = {
  uploaded: "Upload interrupted — remove and retry",
  processing: "Processing",
  ready: "Ready",
  failed: "Upload failed — remove and retry",
  deleting: "Deletion pending — retry",
  deleted: "Deleted",
} as const;
export function fileSizeLabel(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
export type DocumentRecord = {
  id: string;
  employmentId: string;
  documentType: DocumentType;
  originalFilename: string;
  sanitizedFilename: string;
  mimeType: string;
  fileSize: number;
  status: keyof typeof documentStatusLabels;
  createdAt: string;
  employment: { employerName: string; roleTitle: string };
};
