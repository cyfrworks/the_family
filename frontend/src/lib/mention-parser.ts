/**
 * Client-side mention utilities for UI autocomplete and display only.
 *
 * Authoritative mention parsing for message sending is handled server-side
 * by reagent:local.mention-parser:0.1.0 — these functions are NOT used
 * for determining which members to trigger AI responses for.
 */
import type { Member } from './types';

/**
 * Build a map of memberId -> owner Don name for members with duplicate names.
 * Only members whose name appears more than once get an entry.
 */
export function buildMemberOwnerMap(
  members: Member[],
  dons: Array<{ userId: string; displayName: string }>
): Map<string, string> {
  const map = new Map<string, string>();

  // Count occurrences of each name
  const nameCounts = new Map<string, number>();
  for (const m of members) {
    nameCounts.set(m.name, (nameCounts.get(m.name) ?? 0) + 1);
  }

  // Only disambiguate names that appear more than once
  for (const m of members) {
    if ((nameCounts.get(m.name) ?? 0) > 1) {
      const owner = dons.find((d) => d.userId === m.owner_id);
      if (owner) {
        map.set(m.id, owner.displayName);
      }
    }
  }

  return map;
}

/**
 * Get the disambiguated mention text for a member.
 * Returns e.g. "Tom Hagen (Don Mike's)" for duplicates, or just "Tom Hagen" otherwise.
 */
export function getMentionText(member: Member, memberOwnerMap?: Map<string, string>): string {
  const owner = memberOwnerMap?.get(member.id);
  return owner ? `${member.name} (Don ${owner}'s)` : member.name;
}

export function getMentionCandidates(query: string, members: Member[]): Member[] {
  if (!query) return members;
  const q = query.toLowerCase();
  return members.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      m.name.toLowerCase().replace(/^the\s+/, '').includes(q)
  );
}
