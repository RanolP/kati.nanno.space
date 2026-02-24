export function hasStatusCode(
  error: unknown,
  statusCode: number,
): error is Error & { status: number } {
  return (
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status === statusCode
  );
}
