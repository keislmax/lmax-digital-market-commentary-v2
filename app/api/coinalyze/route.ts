import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint') || 'open-interest';
  const symbols = searchParams.get('symbols') || '';
  const extra = searchParams.get('extra') || '';

  const API_KEY = process.env.COINALYZE_API_KEY;
  const url = `https://api.coinalyze.net/v1/${endpoint}?symbols=${symbols}&${extra}&api_key=${API_KEY}`;

  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
