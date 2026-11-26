import { NextResponse, type NextRequest } from 'next/server';
import { deleteProject, getProject, listProjects, patchProject, storageBackend, upsertProject } from '@/lib/server/projectStore';
import type { Project, ProjectKind } from '@/types';

export const dynamic = 'force-dynamic';

const KINDS: ProjectKind[] = ['interior', 'exterior', 'land'];
const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/** GET /api/projects            -> list
 *  GET /api/projects?id=...     -> one */
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      const p = await getProject(id);
      return p ? NextResponse.json(p) : NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ storage: storageBackend, projects: await listProjects() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST /api/projects -> create (or re-seed from a client cache) */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Project>;
    const now = new Date().toISOString();
    const id = body.id && ID_RE.test(body.id) ? body.id : `p_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const project: Project = {
      id,
      name: String(body.name ?? 'Untitled property').slice(0, 120),
      kind: KINDS.includes(body.kind as ProjectKind) ? (body.kind as ProjectKind) : 'interior',
      status: body.status ?? 'draft',
      createdAt: body.createdAt ?? now,
      updatedAt: now,
      splatUrl: body.splatUrl ?? null,
      splatFormat: body.splatFormat ?? null,
      flipY: Boolean(body.flipY),
      imageCount: Number(body.imageCount ?? 0),
      jobId: body.jobId ?? null,
      heightmapUrl: typeof body.heightmapUrl === 'string' && body.heightmapUrl.length < 300_000 ? body.heightmapUrl : null,
      staged: Array.isArray(body.staged) ? body.staged.slice(0, 500) : [],
    };
    return NextResponse.json(await upsertProject(project), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** PATCH /api/projects?id=... -> partial update (name, staged furniture, flipY, status) */
export async function PATCH(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const body = (await req.json()) as Partial<Project>;
    const allowed: Partial<Project> = {};
    if (typeof body.name === 'string') allowed.name = body.name.slice(0, 120);
    if (typeof body.flipY === 'boolean') allowed.flipY = body.flipY;
    if (Array.isArray(body.staged)) allowed.staged = body.staged.slice(0, 500);
    if (typeof body.splatUrl === 'string') allowed.splatUrl = body.splatUrl;
    const p = await patchProject(id, allowed);
    return p ? NextResponse.json(p) : NextResponse.json({ error: 'not found' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  return NextResponse.json({ deleted: await deleteProject(id) });
}
