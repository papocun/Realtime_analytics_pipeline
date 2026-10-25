import { NextRequest, NextResponse } from 'next/server';
import { fetchDashboardData } from '@/lib/data';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const eventType = searchParams.get('event_type') || undefined;
    const device = searchParams.get('device') || undefined;
    const country = searchParams.get('country') || undefined;
    const bypassCache = searchParams.get('refresh') === 'true';

    const data = await fetchDashboardData({ eventType, device, country, bypassCache });
    return NextResponse.json(data);
  } catch (error: unknown) {
    if ((error as { digest?: string })?.digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    console.error('API Error in /api/analytics:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve gold analytics data from Snowflake' },
      { status: 500 }
    );
  }
}
