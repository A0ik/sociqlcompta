import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const clientId = searchParams.get('clientId');

  const docs = await prisma.document.findMany({
    where: {
      ...(type && { type }),
      ...(clientId && { clientId }),
    },
    include: { client: true, lignes: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ documents: docs });
}
