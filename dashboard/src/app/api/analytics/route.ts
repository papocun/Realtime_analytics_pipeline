import { NextRequest, NextResponse } from 'next/server';
import { fetchDashboardData, InvalidFilterError } from '@/lib/data';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  try {
    const data = await fetchDashboardData({
      eventType: searchParams.get('event_type') || undefined,
      device: searchParams.get('device') || undefined,
      country: searchParams.get('country') || undefined,
      bypassCache: searchParams.get('refresh') === 'true',
    });
    return NextResponse.json(data);
  } catch (error: unknown) {
    if (error instanceof InvalidFilterError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // Next.js signals an interrupted prerender by throwing; it must propagate, not become a 500.
    if ((error as { digest?: string })?.digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    console.error('API Error in /api/analytics:', error);
    return NextResponse.json({ error: 'Failed to retrieve analytics data' }, { status: 500 });
  }
}
