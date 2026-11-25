import { useState } from 'react';
import { Disc3 } from 'lucide-react';
import { useNocturne } from '../context/NocturneContext';

interface CoverImageProps {
  src: string;
  thumbSrc?: string;
  alt: string;
  className?: string;
  roundedClass?: string;
  eager?: boolean;
}

export function CoverImage({
  src,
  thumbSrc,
  alt,
  className = 'w-12 h-12',
  roundedClass = 'rounded-xl',
  eager = false,
}: CoverImageProps) {
  const { dataSaver } = useNocturne();
  const [failed, setFailed] = useState(false);

  const chosenSrc = dataSaver && thumbSrc ? thumbSrc : src;

  if (failed || !chosenSrc) {
    return (
      <div
        aria-label={alt}
        className={`${className} ${roundedClass} shrink-0 bg-gradient-to-br from-[#1C1629] via-[#13131D] to-[#0D0D14] border border-white/10 flex items-center justify-center text-purple-400/70`}
      >
        <Disc3 className="w-5 h-5" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={chosenSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} ${roundedClass} shrink-0 object-cover bg-[#14141E] border border-white/8`}
      loading={eager ? 'eager' : 'lazy'}
    />
  );
}
