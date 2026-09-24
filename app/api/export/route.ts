import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createJob, deleteJob, getJob, updateJob } from './store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getVideoDuration(input: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-i', input]);

    let stderr = '';

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      const match = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (match) {
        resolve(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]));
      } else {
        reject(new Error(stderr.slice(-4000) || `FFmpeg exited with ${code}`));
      }
    });

    child.on('error', reject);
  });
}

function runFfmpeg(args: string[], duration: number, jobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-progress', 'pipe:1', '-nostats', ...args]);
    let stderr = '';
    let output = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
      const lines = output.split('\n');
      output = lines.pop() ?? '';
      for (const line of lines) {
        const [key, value] = line.trim().split('=');
        if (key === 'out_time_ms') {
          const progress = Math.min(99, Math.max(1, Math.round((Number(value) / 1_000_000 / duration) * 100)));
          updateJob(jobId, { progress });
        }
      }
    });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-4000) || `FFmpeg exited with ${code}`));
    });
  });
}

async function processExport(jobId: string, input: string, overlay: string, output: string) {
  const job = getJob(jobId);
  if (!job) return;

  try {
    const duration = await getVideoDuration(input);
    await runFfmpeg([
      '-y',
      '-i',
      input,
      '-i',
      overlay,

      '-filter_complex',
      '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black[base];[1:v]scale=1080:1920[ov];[base][ov]overlay=0:0:format=auto[v]',

      '-map',
      '[v]',

      '-map',
      '0:a?',

      '-c:v',
      'libx264',

      '-profile:v',
      'high',

      '-level',
      '4.1',

      '-pix_fmt',
      'yuv420p',

      '-preset',
      'medium',

      '-crf',
      '23',

      '-c:a',
      'aac',

      '-b:a',
      '128k',

      '-ar',
      '48000',

      '-movflags',
      '+faststart',

      output
    ], duration, jobId);
    updateJob(jobId, { status: 'completed', progress: 100 });
  } catch (error) {
    console.error(error);
    await fs.rm(job.dir, { recursive: true, force: true }).catch(() => undefined);
    updateJob(jobId, {
      status: 'failed',
      progress: 0,
      error: error instanceof Error ? error.message : 'Export failed.'
    });
  }
}

export async function POST(request: Request) {
  const form = await request.formData();
  const video = form.get('video');
  const svg = form.get('svg');

  if (!(video instanceof File) || typeof svg !== 'string') {
    return new NextResponse('Missing video or SVG.', { status: 400 });
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiktok-title-'));
  const input = path.join(dir, 'input.mp4');
  const overlay = path.join(dir, 'overlay.png');
  const output = path.join(dir, 'output.mp4');
  const id = randomUUID();
  const filename = video.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '') + '-titled.mp4';

  try {
    await fs.writeFile(input, Buffer.from(await video.arrayBuffer()));
    await sharp(Buffer.from(svg)).png().toFile(overlay);
    createJob({ id, status: 'processing', progress: 1, filename, dir, output });
    void processExport(id, input, overlay, output);
    return NextResponse.json({ id });
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    return new NextResponse(error instanceof Error ? error.message : 'Export failed.', { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const download = url.searchParams.get('download') === '1';
  if (!id) return new NextResponse('Missing export id.', { status: 400 });

  const job = getJob(id);
  if (!job) return new NextResponse('Export not found.', { status: 404 });
  if (job.status === 'failed') return NextResponse.json({ status: job.status, error: job.error }, { status: 500 });
  if (job.status !== 'completed' || !download) {
    return NextResponse.json({ status: job.status, progress: job.progress });
  }

  const data = await fs.readFile(job.output);
  await fs.rm(job.dir, { recursive: true, force: true }).catch(() => undefined);
  deleteJob(id);
  return new NextResponse(data, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${job.filename}"`
    }
  });
}
