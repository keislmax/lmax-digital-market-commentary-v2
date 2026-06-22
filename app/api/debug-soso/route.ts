// TEMPORARY DEBUG ENDPOINT - delete after AUM is confirmed working
// Deploy to app/api/debug-soso/route.ts, hit it once, then delete.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const key = process.env.SOSOVALUE_API_KEY;
  const keyCleaned = (key || '').trim();
  const url = 'https://openapi.sosovalue.com/openapi/v1/etfs/summary-history?symbol=BTC&country_code=US&limit=5';

  const diagnostics: any = {
    keyPresent: !!key,
    keyLength: keyCleaned.length,
    keyPrefix: keyCleaned.slice(0, 8),
    url,
  };

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'x-soso-api-key': keyCleaned, Accept: 'application/json' },
      cache: 'no-store',
    });
    diagnostics.httpStatus = res.status;
    diagnostics.httpOk = res.ok;
    const text = await res.text();
    diagnostics.rawResponseFirst300 = text.slice(0, 300);
    try {
      const json = JSON.parse(text);
      diagnostics.jsonCode = json?.code;
      diagnostics.jsonMessage = json?.message;
      diagnostics.dataIsArray = Array.isArray(json?.data);
      diagnostics.dataLength = Array.isArray(json?.data) ? json.data.length : null;
      diagnostics.firstRow = Array.isArray(json?.data) ? json.data[0] : null;
    } catch (e: any) {
      diagnostics.jsonParseError = e?.message;
    }
  } catch (e: any) {
    diagnostics.fetchError = e?.message;
  }

  return NextResponse.json(diagnostics);
}
