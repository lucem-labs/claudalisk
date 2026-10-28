import { describe, expect, it } from "vitest"

import {
  fieldErrors,
  isProblemDetails,
  ProblemError,
  problemOf,
  unmatchedFieldErrors,
} from "@/shared/lib/problem-details"

const validation = new ProblemError({
  type: "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  title: "One or more validation errors occurred.",
  status: 400,
  errors: { Name: ["Name is required."], "Lines[0].Quantity": ["Quantity must be positive."] },
})

describe("problem details", () => {
  it("finds a field's errors whatever the case of its key", () => {
    expect(fieldErrors(validation, "name")).toEqual(["Name is required."])
  })

  it("returns no errors for a field the problem does not name", () => {
    expect(fieldErrors(validation, "email")).toEqual([])
  })

  it("lists the errors that no shown field covers", () => {
    expect(unmatchedFieldErrors(validation, ["name"])).toEqual(["Quantity must be positive."])
  })

  it("reads the problem from a ProblemError or a plain Problem Details object", () => {
    expect(problemOf(validation)?.status).toBe(400)
    expect(problemOf({ title: "Conflict", status: 409 })?.title).toBe("Conflict")
  })

  it("does not treat an ordinary error as a problem", () => {
    expect(problemOf(new Error("network down"))).toBeUndefined()
    expect(isProblemDetails("text")).toBe(false)
  })

  it("uses the detail as the error message", () => {
    expect(new ProblemError({ title: "Conflict", detail: "The order has shipped." }).message).toBe(
      "The order has shipped."
    )
  })
})
