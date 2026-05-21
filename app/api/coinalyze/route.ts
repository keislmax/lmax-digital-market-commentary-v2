import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function GET() {
  try {
    const cached = await redis.get('coinalyze:data');
    if (cached) {
      const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: 'cache_empty' }, { status: 503 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
