import { useCallback, useMemo, useState } from 'react';
import type { Member } from '../lib/types';
import { getMentionCandidates, getMentionText } from '../lib/mention-parser';

interface MentionState {
  isOpen: boolean;
  query: string;
  candidates: Member[];
  selectedIndex: number;
  triggerPosition: number;
}

const INITIAL_STATE: MentionState = {
  isOpen: false,
  query: '',
  candidates: [],
  selectedIndex: 0,
  triggerPosition: -1,
};

export function useMention(members: Member[], memberOwnerMap?: Map<string, string>) {
  // Filter out informants (push-only) and soldiers (invoked only by their caporegime)
  const mentionableMembers = useMemo(() => members.filter((m) => m.member_type !== 'informant' && m.member_type !== 'soldier'), [members]);
  const [state, setState] = useState<MentionState>(INITIAL_STATE);

  const handleInput = useCallback(
    (text: string, cursorPosition: number) => {
      const beforeCursor = text.slice(0, cursorPosition);
      const atIndex = beforeCursor.lastIndexOf('@');

      if (atIndex === -1 || (atIndex > 0 && beforeCursor[atIndex - 1] !== ' ' && beforeCursor[atIndex - 1] !== '\n')) {
        setState(INITIAL_STATE);
        return;
      }

      const query = beforeCursor.slice(atIndex + 1);
      if (query.includes('  ')) {
        setState(INITIAL_STATE);
        return;
      }

      const candidates = [
        ...getMentionCandidates(query, mentionableMembers),
        ...(query === '' || 'all'.startsWith(query.toLowerCase())
          ? [{ id: 'all', name: 'All Members', catalog_model_id: '', system_prompt: '', owner_id: '', avatar_url: null, created_at: '' } as Member]
          : []),
      ];

      if (candidates.length === 0) {
        setState(INITIAL_STATE);
        return;
      }

      setState({
        isOpen: true,
        query,
        candidates,
        selectedIndex: 0,
        triggerPosition: atIndex,
      });
    },
    [mentionableMembers]
  );

  const selectCandidate = useCallback(
    (index: number, currentText: string): string => {
      const candidate = state.candidates[index];
      if (!candidate) return currentText;

      const before = currentText.slice(0, state.triggerPosition);
      const after = currentText.slice(state.triggerPosition + state.query.length + 1);
      const mentionText = candidate.id === 'all'
        ? '@all'
        : `@${getMentionText(candidate, memberOwnerMap)}`;
      const newText = `${before}${mentionText} ${after}`;

      setState(INITIAL_STATE);
      return newText;
    },
    [state, memberOwnerMap]
  );

  const moveSelection = useCallback(
    (direction: 'up' | 'down') => {
      setState((prev) => {
        if (!prev.isOpen) return prev;
        const newIndex =
          direction === 'down'
            ? (prev.selectedIndex + 1) % prev.candidates.length
            : (prev.selectedIndex - 1 + prev.candidates.length) % prev.candidates.length;
        return { ...prev, selectedIndex: newIndex };
      });
    },
    []
  );

  const close = useCallback(() => setState(INITIAL_STATE), []);

  return {
    ...state,
    handleInput,
    selectCandidate,
    moveSelection,
    close,
  };
}
