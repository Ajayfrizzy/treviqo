import { z } from "zod";
export const statusLabels = {
  active: "Active",
  exiting: "Exiting",
  closed: "Closed",
} as const;
export const typeLabels = {
  permanent: "Permanent",
  contract: "Contract",
  temporary: "Temporary",
  internship: "Internship",
  other: "Other",
} as const;
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      value >= "0001-01-01" &&
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Enter a real calendar date.");
export const employmentSchema = z
  .object({
    employerName: z
      .string()
      .trim()
      .min(1, "Enter the employer name.")
      .max(160, "Use 160 characters or fewer."),
    roleTitle: z
      .string()
      .trim()
      .min(1, "Enter your role or title.")
      .max(160, "Use 160 characters or fewer."),
    startDate: calendarDate,
    endDate: calendarDate.nullable().default(null),
    employmentType: z
      .enum(["permanent", "contract", "temporary", "internship", "other"])
      .nullable()
      .default(null),
    status: z.enum(["active", "exiting", "closed"]).default("active"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endDate && value.endDate < value.startDate)
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date cannot be before the start date.",
      });
    if (value.status === "active" && value.endDate)
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message:
          "Use Exiting for a planned end date, or Closed for a previous job.",
      });
  });
export type EmploymentInput = z.output<typeof employmentSchema>;
export type EmploymentRecord = EmploymentInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
export function formatEmploymentDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
export function groupEmployments<
  T extends { status: EmploymentInput["status"] },
>(records: T[]) {
  return {
    current: records.filter((record) => record.status !== "closed"),
    previous: records.filter((record) => record.status === "closed"),
  };
}
