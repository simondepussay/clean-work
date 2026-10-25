import type { DayWeather, WeatherKind } from "../api";
import { CloudIcon, FogIcon, RainIcon, SnowIcon, StormIcon, SunIcon } from "../icons";
import { useTr, type T3 } from "../i18n";

const ICONS = { sun: SunIcon, cloud: CloudIcon, rain: RainIcon, snow: SnowIcon, storm: StormIcon, fog: FogIcon };
export const WEATHER_NAMES: Record<WeatherKind, T3> = {
  sun: { ja: "晴れ", en: "Sunny", fr: "Soleil" },
  cloud: { ja: "くもり", en: "Cloudy", fr: "Nuageux" },
  rain: { ja: "雨", en: "Rain", fr: "Pluie" },
  snow: { ja: "雪", en: "Snow", fr: "Neige" },
  storm: { ja: "雷雨", en: "Thunderstorm", fr: "Orage" },
  fog: { ja: "霧", en: "Fog", fr: "Brouillard" },
};

/** Le temps du jour de l'entretien : icône, températures, risque de pluie (et un conseil s'il pleut). */
export function WeatherChip({ weather, label }: { weather: DayWeather; label?: string }) {
  const tr = useTr();
  const Icon = ICONS[weather.kind];
  const wet = weather.kind === "rain" || weather.kind === "storm" || (weather.rainChance ?? 0) >= 50;
  const temps = weather.tMax !== null && weather.tMin !== null ? `${weather.tMax}° / ${weather.tMin}°` : "";
  return (
    <span className={`weather ${weather.kind}`} title={`${weather.place ?? weather.prefecture} · Open-Meteo`}>
      {label && <b>{label}</b>}
      <Icon size={16} />
      <span>{tr(WEATHER_NAMES[weather.kind])}{temps && ` · ${temps}`}{weather.rainChance !== null && weather.rainChance >= 30 && ` · ${weather.rainChance}%`}</span>
      {wet && <em>{tr({ ja: "傘を忘れずに", en: "Take an umbrella", fr: "Pensez au parapluie" })}</em>}
    </span>
  );
}
