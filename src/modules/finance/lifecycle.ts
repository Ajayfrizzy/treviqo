import "server-only";
import type { Prisma } from "@prisma/client";
// Called inside the employment/exit save transaction. No timer or notification is scheduled.
export async function ensurePensionFollowup(
  tx: Prisma.TransactionClient,
  userId: string,
  employmentId: string,
) {
  const record = await tx.exitCase.findFirst({
    where: {
      userId,
      employmentId,
      pension: "yes",
      employment: { userId, status: "closed" },
    },
    include: { employment: { select: { endDate: true } } },
  });
  if (!record) return;
  const end = record.employment.endDate ?? record.lastWorkingDate;
  const followUp = new Date(end);
  followUp.setUTCDate(followUp.getUTCDate() + 30);
  const result = await tx.pensionVerification.createMany({
    data: [
      {
        exitCaseId: record.id,
        userId,
        targetPeriod: end.toISOString().slice(0, 7),
        followUpDate: followUp.getUTCFullYear() <= 9999 ? followUp : null,
      },
    ],
    skipDuplicates: true,
  });
  if (result.count)
    await tx.auditEvent.create({
      data: {
        userId,
        employmentId,
        exitCaseId: record.id,
        action: "pension_started",
      },
    });
}
