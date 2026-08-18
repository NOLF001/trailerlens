// Types shared by client components for API payloads.

export interface ExplorerComment {
  id: string;
  isReply: boolean;
  author: string;
  text: string;
  likeCount: number;
  publishedAt: string;
  language: string | null;
  sentiment: string | null;
  topics: string[];
  emotions: string[];
  timestamps: number[];
  isDuplicate: boolean;
  isSpam: boolean;
  analysisStatus: string;
  impressiveReason: string | null;
  concernReason: string | null;
}

export interface ExplorerResponse {
  total: number;
  page: number;
  pageSize: number;
  comments: ExplorerComment[];
}

export interface CategoryGroup {
  topic: string;
  count: number;
  share: number;
  comments: ExplorerComment[];
}

export interface CategoryResponse {
  totalAnalyzed: number;
  groups: CategoryGroup[];
}

export interface SettingsStatus {
  youtubeApiConfigured: boolean;
  anthropicConfigured: boolean;
  googleOAuthConfigured: boolean;
  nextAuthSecretConfigured: boolean;
  mockMode: boolean;
  mockClaude: boolean;
  ytdlpEnabled: boolean;
  anthropicModel: string;
  databaseProvider: string;
  counts: { videos: number; comments: number; analyses: number };
}
