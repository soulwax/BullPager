import { json } from '@sveltejs/kit';
import { databaseHealthy, persistenceEnabled } from '$lib/server/persistence';

export async function GET() {
  if (!persistenceEnabled()) return json({ status: 'degraded', database: false, reason: 'DATABASE_URL is not set.' }, { status: 503 });
  const database = await databaseHealthy();
  return json({ status: database ? 'ok' : 'degraded', database }, { status: database ? 200 : 503 });
}
