import { useEffect, useState } from 'react';
import { MessageContent } from './MessageContent';

interface TypewriterTextProps {
  content: string;
  speed?: number;
  onComplete?: () => void;
}

export function TypewriterText({ content, speed = 15, onComplete }: TypewriterTextProps) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let index = 0;
    setDisplayed('');
    setDone(false);

    const interval = setInterval(() => {
      if (index < content.length) {
        // Add characters in chunks for smoother feel
        const chunk = content.slice(index, index + 3);
        setDisplayed((prev) => prev + chunk);
        index += 3;
      } else {
        clearInterval(interval);
        setDisplayed(content);
        setDone(true);
        onComplete?.();
      }
    }, speed);

    return () => clearInterval(interval);
  }, [content, speed, onComplete]);

  return (
    <div className={done ? '' : 'typewriter-cursor'}>
      <MessageContent content={displayed} />
    </div>
  );
}
