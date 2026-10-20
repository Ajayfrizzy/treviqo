import Link from "@/components/action-link";
import { exitTypes } from "@/modules/exits/shared";
import type { ExitTypeDiscrepancy } from "@/modules/exits/discrepancy";

export function ExitTypeNotice({
  id,
  savedType,
  discrepancies = [],
}: {
  id: string;
  savedType: keyof typeof exitTypes;
  discrepancies?: ExitTypeDiscrepancy[];
}) {
  if (!discrepancies.length) return null;
  return (
    <aside className="form-message" aria-label="Exit type needs review">
      <p>
        Your saved exit type is {exitTypes[savedType]}. Document details differ.
        Your saved answers have not been changed.
      </p>
      <ul>
        {discrepancies.map((item) => (
          <li key={`${item.documentId}-${item.type}`}>
            {exitTypes[item.type]} —{" "}
            {item.reviewed
              ? "reviewed document detail"
              : "unconfirmed extracted detail"}
            .{" "}
            <Link
              className="touch-link"
              href={`/documents/${item.documentId}/review`}
            >
              Review source detail
            </Link>
          </li>
        ))}
      </ul>
      <Link className="touch-link" href={`/exit/${id}/edit`}>
        Review and correct exit details
      </Link>
      <p>
        Compare the original document before changing your answers. This is a
        consistency check, not a legal determination.
      </p>
    </aside>
  );
}
