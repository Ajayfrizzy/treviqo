import Link from "@/components/action-link";
import { notFound } from "next/navigation";
import { employmentPageUser } from "@/modules/employments/page-user";
import { financeService } from "@/modules/finance/service";
import { DocumentError } from "@/modules/documents/validation";
import { FinanceReview } from "@/components/finance-review";
export default async function FinancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await employmentPageUser();
  const { id } = await params;
  let initial;
  try {
    initial = await financeService().read(user.id, id);
  } catch (error) {
    if (error instanceof DocumentError && error.status === 404) notFound();
    throw error;
  }
  return (
    <>
      <Link className="touch-link" href={`/exit/${id}`}>
        ← Exit checklist
      </Link>
      <h1>Settlement and pension</h1>
      <p className="intro exit-intro">{initial.employerName}</p>
      <FinanceReview initial={initial} />
    </>
  );
}
