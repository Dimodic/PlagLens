/**
 * BrandIcon — small resolver returning the right brand logo for a provider id.
 *
 * Used by /admin/login-providers (Google / Yandex / GitHub / Telegram) and
 * /admin/integrations OAuth list (Yandex.Contest / Stepik / Google Sheets).
 *
 * Icons inherit ``currentColor`` (NOT full brand colours — those clash with
 * the dark theme). Pass through ``className`` for size/colour:
 *
 *   <BrandIcon provider="google" className="h-5 w-5 text-foreground/80" />
 *
 * Availability notes (react-icons 5.6.0, lucide-react 1.14.0):
 *   • FaGoogle, FaGithub, FaTelegramPlane — present in react-icons/fa.
 *   • SiGooglesheets — present in react-icons/si.
 *   • SiYandex, SiStepik — NOT present (verified at install). For Yandex we
 *     inline the canonical "Я-in-circle" mark used elsewhere in the app
 *     (see ProviderIcon.tsx). For Stepik we fall back to lucide
 *     ``GraduationCap`` (Stepik is a learning platform — semantically apt).
 *   • lucide-react 1.14.0 has no ``Github`` glyph, so we always use
 *     ``FaGithub`` for github.
 */
import { GraduationCap } from 'lucide-react';
import { FaGithub, FaGoogle, FaTelegramPlane } from 'react-icons/fa';
import { SiGooglesheets } from 'react-icons/si';

interface BrandIconProps {
  provider: string;
  className?: string;
}

/** "Я-in-circle" Yandex mark — same path used by ProviderIcon for
 *  yandex_contest. Inlined here because react-icons 5.6.0 has no
 *  ``SiYandex`` (only ``SiYandexcloud``, which is the cloud product mark
 *  and visually distinct). currentColor for theme conformance. */
function YandexMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.04 12c0-5.523 4.476-10 10-10 5.522 0 10 4.477 10 10s-4.478 10-10 10c-5.524 0-10-4.477-10-10zm11.28-4.334h-.924c-1.694 0-2.585.858-2.585 2.123 0 1.43.616 2.1 1.881 2.959l1.045.704-3.003 4.487H7.49l2.695-4.014c-1.55-1.111-2.42-2.19-2.42-4.015 0-2.288 1.595-3.85 4.62-3.85h3.003v11.868H13.32V7.666z"
      />
    </svg>
  );
}

export function BrandIcon({ provider, className }: BrandIconProps) {
  switch (provider) {
    case 'google':
      return <FaGoogle className={className} aria-hidden />;
    case 'yandex':
    case 'yandex_contest':
      return <YandexMark className={className} />;
    case 'github':
      return <FaGithub className={className} aria-hidden />;
    case 'telegram':
      return <FaTelegramPlane className={className} aria-hidden />;
    case 'stepik':
      // Lucide fallback — no SiStepik in react-icons 5.6.0.
      return <GraduationCap className={className} aria-hidden />;
    case 'google_sheets':
      return <SiGooglesheets className={className} aria-hidden />;
    default:
      // Neutral dot for unknown providers — keeps row layout stable.
      return (
        <span
          className={className}
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          •
        </span>
      );
  }
}

export default BrandIcon;
