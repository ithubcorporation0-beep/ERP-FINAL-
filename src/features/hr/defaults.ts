import type { EmployeeInput, LeaveInput } from "@/lib/validation";

/** Form defaults, outside "use client" modules so server pages can spread them. */
export function emptyEmployee(today: string): EmployeeInput {
  return {
    name: "",
    email: "",
    phone: "",
    identificationNumber: "",
    departmentId: "",
    position: "",
    joiningDate: today,
    userId: "",
    emergencyContactName: "",
    emergencyContactRelation: "",
    emergencyContactPhone: "",
    notes: "",
    status: "ACTIVE",
  };
}

export function emptyLeave(today: string): LeaveInput {
  return { employeeId: "", type: "ANNUAL", startDate: today, endDate: today, reason: "" };
}
