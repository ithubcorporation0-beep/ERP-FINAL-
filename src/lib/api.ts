import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/lib/tenant";

/** Wraps a route handler so thrown HttpError / ZodError become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof ZodError) return NextResponse.json({ error: "Validation failed", issues: err.issues }, { status: 422 });
      console.error(err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
