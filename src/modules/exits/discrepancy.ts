import { exitTypes } from "./shared";

export interface ExitTypeDiscrepancy {
  documentId: string;
  type: keyof typeof exitTypes;
  reviewed: boolean;
}
// Compare explicit document facts only; a termination document category does not
// establish a particular exit type. Never infer an exit type from a filename.
export function documentExitType(key: string, value: string) {
  const text = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\.$/, "");
  if (key === "exit_type") {
    return Object.entries(exitTypes).find(
      ([code, label]) => text === code || text === label.toLowerCase(),
    )?.[0] as keyof typeof exitTypes | undefined;
  }
  if (
    key === "reason" &&
    /^(?:role )?redundancy(?: following [^.]+)?$/.test(text)
  )
    return "redundancy";
}
