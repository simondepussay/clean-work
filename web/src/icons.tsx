/**
 * Icônes de l'interface (à la place des emoji) : un seul style, trait de 1,8 px, couleur du texte.
 * Dessinées à la main sur une grille de 24 × 24, sans bibliothèque.
 */
import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const UserIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></Icon>;
export const CalendarIcon = (p: IconProps) => <Icon {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Icon>;
export const PlusIcon = (p: IconProps) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const MicIcon = (p: IconProps) => <Icon {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></Icon>;
export const StopIcon = (p: IconProps) => <Icon {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></Icon>;
export const SpeakerIcon = (p: IconProps) => <Icon {...p}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></Icon>;
export const ClockIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>;
export const FlagIcon = (p: IconProps) => <Icon {...p}><path d="M5.5 21V4M5.5 4h11l-2.2 4 2.2 4h-11" /></Icon>;
export const CheckIcon = (p: IconProps) => <Icon {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const CloseIcon = (p: IconProps) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const ChevronLeftIcon = (p: IconProps) => <Icon {...p}><path d="M14.5 6l-6 6 6 6" /></Icon>;
export const ChevronRightIcon = (p: IconProps) => <Icon {...p}><path d="M9.5 6l6 6-6 6" /></Icon>;
export const SearchIcon = (p: IconProps) => <Icon {...p}><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></Icon>;
export const ArrowRightIcon = (p: IconProps) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const PenIcon = (p: IconProps) => <Icon {...p}><path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20z" /><path d="M13.5 7l3 3" /></Icon>;
export const LightIcon = (p: IconProps) => <Icon {...p}><path d="M9 17.5h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></Icon>;
export const DocIcon = (p: IconProps) => <Icon {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Icon>;
export const BriefcaseIcon = (p: IconProps) => <Icon {...p}><rect x="3.5" y="7" width="17" height="12.5" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17" /></Icon>;
export const ChatIcon = (p: IconProps) => <Icon {...p}><path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.4A7.5 7.5 0 1 1 20 12z" /></Icon>;
export const TrashIcon = (p: IconProps) => <Icon {...p}><path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-12.5M9.5 7V4.5h5V7" /></Icon>;
export const HomeIcon = (p: IconProps) => <Icon {...p}><path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5" /></Icon>;
export const GlobeIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5S9.7 5.9 12 3.5z" /></Icon>;

// Météo du jour de l'entretien (Open-Meteo) et fiche entreprise (gBizINFO).
export const SunIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></Icon>;
export const CloudIcon = (p: IconProps) => <Icon {...p}><path d="M7 18.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 7 18.5z" /></Icon>;
export const RainIcon = (p: IconProps) => <Icon {...p}><path d="M7 14.5h10a3.6 3.6 0 0 0 .4-7.2 5 5 0 0 0-9.7 1.2A3 3 0 0 0 7 14.5z" /><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5" /></Icon>;
export const SnowIcon = (p: IconProps) => <Icon {...p}><path d="M7 14.5h10a3.6 3.6 0 0 0 .4-7.2 5 5 0 0 0-9.7 1.2A3 3 0 0 0 7 14.5z" /><path d="M8.5 18.5h.01M12 20h.01M15.5 18.5h.01" strokeWidth={2.6} /></Icon>;
export const StormIcon = (p: IconProps) => <Icon {...p}><path d="M7 14.5h10a3.6 3.6 0 0 0 .4-7.2 5 5 0 0 0-9.7 1.2A3 3 0 0 0 7 14.5z" /><path d="M12.5 15.5l-2 3.5h3l-2 3.5" /></Icon>;
export const FogIcon = (p: IconProps) => <Icon {...p}><path d="M7 12.5h10a3.4 3.4 0 0 0 .4-6.8 4.8 4.8 0 0 0-9.3 1.1A2.9 2.9 0 0 0 7 12.5z" /><path d="M4.5 16h15M6.5 19.5h11" /></Icon>;
export const ShieldIcon = (p: IconProps) => <Icon {...p}><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" /><path d="M8.8 12l2.3 2.3 4.2-4.6" /></Icon>;
export const BuildingIcon = (p: IconProps) => <Icon {...p}><path d="M4.5 20.5h15M6.5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 17.5 5v15.5" /><path d="M9.5 7.5h1.5M13 7.5h1.5M9.5 11h1.5M13 11h1.5M9.5 14.5h1.5M13 14.5h1.5M11 20.5v-3h2v3" /></Icon>;
export const PinIcon = (p: IconProps) => <Icon {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></Icon>;
export const LinkIcon = (p: IconProps) => <Icon {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2" /></Icon>;
export const PhoneIcon = (p: IconProps) => <Icon {...p}><path d="M5 4.5h3.2l1.6 4-2.1 1.4a10.5 10.5 0 0 0 6.4 6.4l1.4-2.1 4 1.6V19a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 3.5 6.1 1.5 1.5 0 0 1 5 4.5z" /></Icon>;
export const BookIcon = (p: IconProps) => <Icon {...p}><path d="M12 6.5C10.3 5 7.8 4.5 4 4.5v13c3.8 0 6.3.5 8 2 1.7-1.5 4.2-2 8-2v-13c-3.8 0-6.3.5-8 2z" /><path d="M12 6.5v13" /></Icon>;
export const HeartIcon = (p: IconProps) => <Icon {...p}><path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z" /></Icon>;
