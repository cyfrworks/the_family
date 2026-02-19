import type { Role } from './types';

export interface ParsedMention {
  roleId: string;
  roleName: string;
  startIndex: number;
  endIndex: number;
}

export function parseMentions(text: string, roles: Role[]): ParsedMention[] {
  const mentions: ParsedMention[] = [];
  const lowerText = text.toLowerCase();

  // Sort roles by name length (longest first) so "Tom Hagen Jr" matches before "Tom Hagen"
  const sorted = [...roles].sort((a, b) => b.name.length - a.name.length);

  for (const role of sorted) {
    const names = [role.name.toLowerCase()];
    // Also try without leading "The "
    const stripped = role.name.toLowerCase().replace(/^the\s+/, '');
    if (stripped !== names[0]) names.push(stripped);

    for (const name of names) {
      const needle = `@${name}`;
      let pos = 0;
      while ((pos = lowerText.indexOf(needle, pos)) !== -1) {
        const endIndex = pos + needle.length;
        // Ensure it's a word boundary after the name (not part of a longer word)
        const charAfter = text[endIndex];
        if (!charAfter || /[\s,.:;!?$]/.test(charAfter)) {
          // Avoid duplicate mentions of the same role at the same position
          if (!mentions.some((m) => m.roleId === role.id && m.startIndex === pos)) {
            mentions.push({
              roleId: role.id,
              roleName: role.name,
              startIndex: pos,
              endIndex,
            });
          }
        }
        pos = endIndex;
      }
    }
  }

  mentions.sort((a, b) => a.startIndex - b.startIndex);
  return mentions;
}

export function hasAllMention(text: string): boolean {
  return /@all\b/i.test(text);
}

export function extractMentionedRoleIds(text: string, roles: Role[]): string[] {
  if (hasAllMention(text)) {
    return roles.map((r) => r.id);
  }
  return parseMentions(text, roles).map((m) => m.roleId);
}

export function getMentionCandidates(query: string, roles: Role[]): Role[] {
  if (!query) return roles;
  const q = query.toLowerCase();
  return roles.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.name.toLowerCase().replace(/^the\s+/, '').includes(q)
  );
}
