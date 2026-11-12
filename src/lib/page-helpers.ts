// Helpers for Server Components (pages). Kept separate from API helpers because
// notFound() is a Next.js navigation primitive, not an HTTP response.
import { notFound } from "next/navigation";
import { AppError } from "./errors";

/** Awaits a service call; an owned-resource miss (AppError 404) becomes Next's 404 page. */
export async function orNotFound<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}
