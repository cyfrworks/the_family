import type { Member } from './types';

export interface ParsedMention {
  memberId: string;
  memberName: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Build a map of memberId → owner Don name for members with duplicate names.
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

export function parseMentions(
  text: string,
  members: Member[],
  memberOwnerMap?: Map<string, string>
): ParsedMention[] {
  const mentions: ParsedMention[] = [];
  const lowerText = text.toLowerCase();

  // Build name variants for each member, sorted longest-first so disambiguated
  // forms like "@Tom Hagen (Don Mike's)" match before plain "@Tom Hagen"
  const candidates: Array<{ member: Member; needle: string }>  = [];
  for (const member of members) {
    const baseName = member.name.toLowerCase();
    const stripped = baseName.replace(/^the\s+/, '');

    // Disambiguated form first (longer, so it matches before the plain name)
    const owner = memberOwnerMap?.get(member.id);
    if (owner) {
      candidates.push({ member, needle: `@${baseName} (don ${owner.toLowerCase()}'s)` });
      if (stripped !== baseName) {
        candidates.push({ member, needle: `@${stripped} (don ${owner.toLowerCase()}'s)` });
      }
    }

    // Plain name
    candidates.push({ member, needle: `@${baseName}` });
    if (stripped !== baseName) {
      candidates.push({ member, needle: `@${stripped}` });
    }
  }

  // Sort by needle length descending so longer (disambiguated) forms match first
  candidates.sort((a, b) => b.needle.length - a.needle.length);

  // Track which character positions are already claimed to avoid overlapping matches
  const claimed = new Set<number>();

  for (const { member, needle } of candidates) {
    let pos = 0;
    while ((pos = lowerText.indexOf(needle, pos)) !== -1) {
      const endIndex = pos + needle.length;
      // Ensure it's a word boundary after the name
      const charAfter = text[endIndex];
      if (!charAfter || /[\s,.:;!?$]/.test(charAfter)) {
        // Skip if this position is already claimed by a longer match
        if (!claimed.has(pos)) {
          // Avoid duplicate mentions of the same member
          if (!mentions.some((m) => m.memberId === member.id && m.startIndex === pos)) {
            mentions.push({
              memberId: member.id,
              memberName: member.name,
              startIndex: pos,
              endIndex,
            });
            // Claim all positions in this range
            for (let i = pos; i < endIndex; i++) claimed.add(i);
          }
        }
      }
      pos = endIndex;
    }
  }

  mentions.sort((a, b) => a.startIndex - b.startIndex);
  return mentions;
}

export function hasAllMention(text: string): boolean {
  return /@all\b/i.test(text);
}

export function extractMentionedMemberIds(
  text: string,
  members: Member[],
  memberOwnerMap?: Map<string, string>
): string[] {
  if (hasAllMention(text)) {
    return members.map((m) => m.id);
  }
  return parseMentions(text, members, memberOwnerMap).map((m) => m.memberId);
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
