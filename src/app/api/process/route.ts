import { NextResponse, type NextRequest } from 'next/server';
import { createJob, getJob, workerUrl } from '@/lib/server/jobStore';
import { getProject } from '@/lib/server/projectStore';

export const dynamic = 'force-dynamic';

/** POST /api/process { projectId, imageUrls[] } -> enqueue reconstruction job */
export async function POST(req: NextRequest) {
  try {
    const { projectId, imageUrls } = (await req.json()) as { projectId?: string; imageUrls?: string[] };
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    if (!(await getProject(projectId))) return NextResponse.json({ error: 'project not found' }, { status: 404 });
    const urls = Array.isArray(imageUrls) ? imageUrls.filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 2000) : [];
    if (workerUrl && urls.length < 2) {
      return NextResponse.json({ error: 'Worker mode needs at least two uploaded image URLs (configure Supabase storage).' }, { status: 400 });
    }
    const job = await createJob(projectId, urls);
    return NextResponse.json(job, { status: 202 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** GET /api/process?jobId=... -> job status */
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ mode: workerUrl ? 'worker' : 'demo' });
  const job = await getJob(jobId);
  return job ? NextResponse.json(job) : NextResponse.json({ error: 'job not found' }, { status: 404 });
}
