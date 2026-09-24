// Projeção da timeline (Tarefa 6): mapeia repositórios GitHub para o contrato público,
// ordena por criação e agrega o resumo anual em UTC (CA-1, CA-4, CA-5, CA-6).
import type { GithubRepo } from './github.js';

export interface TimelineRepo {
  name: string;
  description: string | null;
  createdAt: string;
  url: string;
  isFork: boolean;
}

export interface YearSummary {
  year: number;
  count: number;
}

export interface Timeline {
  username: string;
  total: number;
  repositories: TimelineRepo[];
  summaryByYear: YearSummary[];
}

function toTimelineRepo(repo: GithubRepo): TimelineRepo {
  return {
    name: repo.name,
    description: repo.description,
    createdAt: repo.created_at,
    url: repo.html_url,
    isFork: repo.fork,
  };
}

function compareByCreatedAtThenName(a: GithubRepo, b: GithubRepo): number {
  const createdAtDiff = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function buildSummaryByYear(repos: GithubRepo[]): YearSummary[] {
  const countsByYear = new Map<number, number>();
  for (const repo of repos) {
    const year = new Date(repo.created_at).getUTCFullYear();
    countsByYear.set(year, (countsByYear.get(year) ?? 0) + 1);
  }

  return [...countsByYear.entries()]
    .sort(([yearA], [yearB]) => yearA - yearB)
    .map(([year, count]) => ({ year, count }));
}

export function buildTimeline(username: string, repos: GithubRepo[]): Timeline {
  const sortedRepos = [...repos].sort(compareByCreatedAtThenName);

  return {
    username,
    total: sortedRepos.length,
    repositories: sortedRepos.map(toTimelineRepo),
    summaryByYear: buildSummaryByYear(sortedRepos),
  };
}
