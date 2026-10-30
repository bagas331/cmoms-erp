// ============================================================
// CMOS - Indonesian Official Holidays API Route
// Strictly READ & SYNC. Exposes live Indonesian official holidays
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { fetchOfficialIndonesianHolidays } from '@/lib/indonesian-holidays';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const yearParam = url.searchParams.get('year');
    
    let targetYears: number[] | undefined = undefined;
    if (yearParam) {
      const parsedYear = parseInt(yearParam, 10);
      if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= 2040) {
        targetYears = [parsedYear];
      }
    }

    const result = await fetchOfficialIndonesianHolidays(targetYears);

    return NextResponse.json({
      success: true,
      source: result.source,
      count: result.holidays.length,
      data: result.holidays,
    });
  } catch (error: any) {
    console.error('Failed to fetch official holidays API:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Gagal memuat kalender hari libur resmi Indonesia.',
        error: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const yearParam = url.searchParams.get('year');
    let targetYears: number[] | undefined = undefined;
    if (yearParam) {
      const parsedYear = parseInt(yearParam, 10);
      if (!isNaN(parsedYear)) {
        targetYears = [parsedYear];
      }
    }

    const result = await fetchOfficialIndonesianHolidays(targetYears);

    return NextResponse.json({
      success: true,
      message: `Sinkronisasi kalender hari libur resmi berhasil (${result.holidays.length} hari libur terverifikasi).`,
      source: result.source,
      count: result.holidays.length,
      data: result.holidays,
      syncedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to sync official holidays API:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Gagal melakukan sinkronisasi kalender hari libur resmi.',
        error: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
