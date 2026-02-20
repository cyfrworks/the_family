interface TypingIndicatorProps {
  memberName: string;
}

export function TypingIndicator({ memberName }: TypingIndicatorProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex items-center gap-1">
        <div className="typing-dot h-1.5 w-1.5 rounded-full bg-gold-500" />
        <div className="typing-dot h-1.5 w-1.5 rounded-full bg-gold-500" />
        <div className="typing-dot h-1.5 w-1.5 rounded-full bg-gold-500" />
      </div>
      <span className="text-xs text-stone-500 italic">{memberName} is deliberating...</span>
    </div>
  );
}
