import { notFound } from "next/navigation";
import { employmentPageUser } from "@/modules/employments/page-user";
import { passportService } from "@/modules/passport/service";
import { DocumentError } from "@/modules/documents/validation";
import { PassportEntry } from "@/components/passport-entry";
export default async function PassportDetailPage({params}:{params:Promise<{id:string}>}) {
  const user=await employmentPageUser(); const {id}=await params;
  let initial;
  try { initial = await passportService().read(user.id,id); }
  catch(error) { if(error instanceof DocumentError && error.status===404)notFound();throw error; }
  return <PassportEntry initial={initial} />;
}
