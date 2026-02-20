interface RunYourFamilyButtonProps {
  compact?: boolean;
  className?: string;
}

export function RunYourFamilyButton({ compact, className = '' }: RunYourFamilyButtonProps) {
  return (
    <a
      href="https://github.com/cyfrworks/the_family"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center rounded-lg font-serif font-bold text-stone-950 transition-colors hover:brightness-110 ${
        compact ? 'px-3 py-1.5 text-xs' : 'px-5 py-2.5 text-sm'
      } ${className}`}
      style={{
        background: 'linear-gradient(110deg, #d97706 0%, #f59e0b 30%, #fde68a 50%, #f59e0b 70%, #d97706 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 3s linear infinite',
      }}
    >
      Run Your Family
    </a>
  );
}
