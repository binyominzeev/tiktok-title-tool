export type ExportJob = {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  filename: string;
  dir: string;
  output: string;
  error?: string;
};

const jobs = new Map<string, ExportJob>();

export function createJob(job: ExportJob) {
  jobs.set(job.id, job);
}

export function getJob(id: string) {
  return jobs.get(id);
}

export function updateJob(id: string, update: Partial<ExportJob>) {
  const job = jobs.get(id);
  if (job) jobs.set(id, { ...job, ...update });
}

export function deleteJob(id: string) {
  jobs.delete(id);
}
