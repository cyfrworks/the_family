import type { Member } from './types';

export function buildMemberOwnerMap(
  members: Member[],
  dons: Array<{ userId: string; displayName: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  const nameCounts = new Map<string, number>();
  for (const m of members) {
    nameCounts.set(m.name, (nameCounts.get(m.name) ?? 0) + 1);
  }
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
