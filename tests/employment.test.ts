import { describe, expect, it } from "vitest";
import {
  employmentSchema,
  formatEmploymentDate,
  groupEmployments,
} from "@/modules/employments/validation";
const base = {
  employerName: " Example Ltd ",
  roleTitle: " Engineer ",
  startDate: "2024-02-29",
};
describe("employment facts", () => {
  it("requires only the essentials and normalizes names", () => {
    expect(employmentSchema.parse(base)).toEqual({
      employerName: "Example Ltd",
      roleTitle: "Engineer",
      startDate: "2024-02-29",
      endDate: null,
      employmentType: null,
      status: "active",
    });
  });
  it.each([
    "2023-02-29",
    "2024-02-30",
    "2024-13-01",
    "0000-01-01",
    "",
    "2024-01-01T00:00:00Z",
    "01/02/2024",
  ])("rejects invalid date %s", (startDate) => {
    expect(employmentSchema.safeParse({ ...base, startDate }).success).toBe(
      false,
    );
  });
  it("rejects missing, blank and excessive fields", () => {
    expect(employmentSchema.safeParse({}).success).toBe(false);
    expect(
      employmentSchema.safeParse({ ...base, employerName: "  " }).success,
    ).toBe(false);
    expect(
      employmentSchema.safeParse({ ...base, roleTitle: "x".repeat(161) })
        .success,
    ).toBe(false);
  });
  it("rejects ownership and unsupported enums", () => {
    for (const extra of [
      { userId: "other" },
      { id: "replacement" },
      { status: "terminated" },
      { employmentType: "unknown" },
    ])
      expect(employmentSchema.safeParse({ ...base, ...extra }).success).toBe(
        false,
      );
  });
  it("compares calendar dates and permits a one-day employment", () => {
    expect(
      employmentSchema.safeParse({
        ...base,
        status: "closed",
        endDate: "2024-02-28",
      }).success,
    ).toBe(false);
    expect(
      employmentSchema.safeParse({
        ...base,
        status: "closed",
        endDate: "2024-02-29",
      }).success,
    ).toBe(true);
  });
  it("requires an appropriate status for an end date but permits unknown dates", () => {
    expect(
      employmentSchema.safeParse({ ...base, endDate: "2024-03-01" }).success,
    ).toBe(false);
    for (const status of ["exiting", "closed"])
      expect(
        employmentSchema.safeParse({ ...base, status, endDate: null }).success,
      ).toBe(true);
  });
  it("groups exiting with current without inventing an exit case", () => {
    const records = [
      { status: "active" },
      { status: "closed" },
      { status: "exiting" },
    ] as const;
    expect(groupEmployments([...records])).toEqual({
      current: [records[0], records[2]],
      previous: [records[1]],
    });
    expect(formatEmploymentDate("2024-02-29")).toContain("29");
  });
});
