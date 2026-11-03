import { LOGO_SRC } from '../config';

export default function Logo({ className = '' }: { className?: string }) {
  return <img src={LOGO_SRC} alt="AI Motion" className={`logo ${className}`} />;
}
