/**
 * Outbound SMS delivery.
 *
 * Twilio is used when its credentials are present; the older generic
 * `SMS_PROVIDER_URL`/`SMS_PROVIDER_KEY` webhook stays as a fallback so an
 * existing gateway keeps working.
 */
export function smsConfigured(): boolean {
  const twilio =
    Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) &&
    Boolean(process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID);
  return twilio || Boolean(process.env.SMS_PROVIDER_URL && process.env.SMS_PROVIDER_KEY);
}

async function sendWithTwilio(to: string, message: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;
  const body = new URLSearchParams({ To: to, Body: message });
  const messagingService = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (messagingService) body.set('MessagingServiceSid', messagingService);
  else body.set('From', process.env.TWILIO_FROM_NUMBER as string);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Twilio rejected the message (${response.status}): ${detail.slice(0, 200)}`);
  }
}

async function sendWithWebhook(to: string, message: string): Promise<void> {
  const response = await fetch(process.env.SMS_PROVIDER_URL as string, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.SMS_PROVIDER_KEY as string}`,
    },
    body: JSON.stringify({ to, message }),
  });
  if (!response.ok) throw new Error(`SMS gateway rejected the message (${response.status})`);
}

export async function sendSms(to: string, message: string): Promise<void> {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    await sendWithTwilio(to, message);
    return;
  }
  if (process.env.SMS_PROVIDER_URL && process.env.SMS_PROVIDER_KEY) {
    await sendWithWebhook(to, message);
    return;
  }
  throw new Error('No SMS provider configured');
}
