import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Alternative.me Fear & Greed — no key required
    const res = await fetch('https://api.alternative.me/fng/?limit=30&format=json', {
      next: { revalidate: 3600 }, // updates once daily, cache 1h
    });
    if (!res.ok) throw new Error(`Fear & Greed fetch failed: ${res.status}`);
    const json = await res.json();

    const data = json.data as Array<{ value: string; value_classification: string; timestamp: string }>;

    const current = data[0];
    const yesterday = data[1];
    const weekAgo = data[7];
    const monthAgo = data[29];

    // Build 30-day chart
    const chart = data
      .slice(0, 30)
      .reverse()
      .map((d) => ({
        t: Number(d.timestamp),
        v: Number(d.value),
        label: d.value_classification,
      }));

    return NextResponse.json({
      current: {
        value: Number(current.value),
        label: current.value_classification,
      },
      changes: {
        yesterday: yesterday ? Number(current.value) - Number(yesterday.value) : null,
        weekAgo: weekAgo ? Number(current.value) - Number(weekAgo.value) : null,
        monthAgo: monthAgo ? Number(current.value) - Number(monthAgo.value) : null,
      },
      chart,
      updatedAt: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
