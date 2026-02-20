export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface Member {
  id: string;
  owner_id: string;
  name: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  avatar_url: string | null;
  is_template: boolean;
  template_slug: string | null;
  created_at: string;
}

export interface SitDown {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  is_commission: boolean;
  created_at: string;
}

export interface SitDownParticipant {
  id: string;
  sit_down_id: string;
  user_id: string | null;
  member_id: string | null;
  added_by: string;
  added_at: string;
  // Joined data
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
  // Joined data
  profile?: Profile;
  member?: Member;
}

export type Provider = 'claude' | 'openai' | 'gemini';

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
  provider: Provider;
  model: string;
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

export interface AgentOutput {
  provider: string;
  model: string;
  content: string;
  stream: boolean;
  component_ref: string;
}
