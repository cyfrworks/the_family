export type UserTier = 'godfather' | 'boss' | 'associate';

export interface CatalogModel {
  id: string;
  provider: Provider;
  alias: string;
  model: string;
  min_tier: 'boss' | 'associate';
  is_active: boolean;
  sort_order: number;
  added_by: string;
  created_at: string;
}

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  tier: UserTier;
  created_at: string;
}

export type MemberType = 'consul' | 'informant' | 'caporegime' | 'soldier' | 'bookkeeper';

export interface Member {
  id: string;
  owner_id: string;
  name: string;
  catalog_model_id: string | null;
  system_prompt: string;
  avatar_url: string | null;
  created_at: string;
  member_type?: MemberType;
  caporegime_id?: string | null;
  token_prefix?: string;
  last_used_at?: string | null;
  catalog_model?: CatalogModel;
}

export interface Operation {
  id: string;
  member_id: string;
  owner_id: string;
  sit_down_id: string | null;
  trigger_message_id: string | null;
  status: 'running' | 'completed' | 'failed';
  task_summary: string | null;
  result_content: string | null;
  turns_used: number;
  tool_calls: unknown[];
  usage: Record<string, unknown>;
  cron_job_id: string | null;
  started_at: string;
  completed_at: string | null;
  member?: Member;
}

export interface BookkeeperEntry {
  id: string;
  bookkeeper_id: string;
  owner_id: string;
  title: string;
  content: string;
  tags: string[];
  source_member_id: string | null;
  source_operation_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SitDown {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  is_commission: boolean;
  created_at: string;
  unread_count?: number;
}

export interface SitDownParticipant {
  id: string;
  sit_down_id: string;
  user_id: string | null;
  member_id: string | null;
  added_by: string;
  added_at: string;
  is_admin?: boolean;
  profile?: Profile;
  member?: Member;
}

export interface Message {
  id: string;
  sit_down_id: string;
  sender_type: 'don' | 'member';
  sender_user_id: string | null;
  sender_member_id: string | null;
  content: string;
  mentions: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  profile?: Profile;
  member?: Member;
}

export type Provider = 'claude' | 'openai' | 'gemini' | 'grok' | 'openrouter';

export type ContactStatus = 'pending' | 'accepted' | 'declined';

export interface CommissionContact {
  id: string;
  user_id: string;
  contact_user_id: string;
  status: ContactStatus;
  created_at: string;
  responded_at: string | null;
  profile?: Profile;
  contact_profile?: Profile;
}

export interface MemberTemplate {
  name: string;
  slug: string;
  system_prompt: string;
  avatar_emoji: string;
  description: string;
}

export interface CyfrResponse {
  jsonrpc: '2.0';
  id: number;
  result?: {
    content: Array<{ type: string; text: string }>;
  };
  error?: {
    code: number;
    message: string;
    data: unknown;
  };
}
