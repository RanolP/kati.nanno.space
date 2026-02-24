export const WorkflowEnv = {
  get AI_KEY_GEMINI(): string {
    return getEnv("AI_KEY_GEMINI");
  },
  get PG_URL(): string {
    return getEnv("PG_URL");
  },
  get RETTIWT_API_KEY(): string {
    return getEnv("RETTIWT_API_KEY");
  },
};

function getEnv(key: string): string {
  const value = process.env[key];
  if (value !== undefined) return value;

  throw new Error(`Missing required env: ${key}`);
}
