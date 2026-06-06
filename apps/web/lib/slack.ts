// Post a message to Slack via an incoming webhook (SLACK_WEBHOOK_URL). Returns
// false (without throwing) when unconfigured or on failure, so callers can report
// an honest "not sent" rather than crashing.
export async function postSlack(text: string): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export function slackConfigured(): boolean {
  return Boolean(process.env.SLACK_WEBHOOK_URL);
}
