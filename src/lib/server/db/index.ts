import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '$env/dynamic/private';
import { schema } from './schema';

export const databaseUrl = env.DATABASE_URL || env.POSTGRES_URL || '';
export const neonClient = databaseUrl ? neon(databaseUrl) : null;
export const db = neonClient ? drizzle(neonClient, { schema }) : null;

export function databaseConfigured() {
  return Boolean(db);
}
