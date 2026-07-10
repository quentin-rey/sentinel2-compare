import type { SceneDate } from "../lib/earthSearch";
import { formatDate } from "../utils/format";
import { useTranslation, type TFunction } from "../hooks/useLanguage";
import type { Lang } from "../i18n/translations";

function dateOptionLabel(d: SceneDate, totalTiles: number, t: TFunction, lang: Lang): string {
  const cloud = d.cloudCover == null ? "…" : `${d.cloudCover.toFixed(0)}%`;
  const partial = totalTiles > 1 && d.tileCount < totalTiles ? t("partialSuffix") : "";
  return `${formatDate(d.date, lang)} · ${cloud} ☁${partial}`;
}

interface Props {
  side: "a" | "b";
  text: string;
  title: string;
  loading: boolean;
  dates: SceneDate[];
  totalTiles: number;
  selectedDate?: string;
  onSelectDate: (date: string) => void;
}

// One "Avant"/"Après" label: text + spinner + an optional date picker,
// shown only when the STAC lookup found more than one distinct day nearby
// (lets the user pick a specific day when the view spans multiple grid
// tiles imaged on different days — see lib/earthSearch.ts).
export function CompareLabel({ side, text, title, loading, dates, totalTiles, selectedDate, onSelectDate }: Props) {
  const { t, lang } = useTranslation();
  const showPicker = dates.length >= 2;
  const currentDay = selectedDate?.slice(0, 10);

  return (
    <div id={`label-${side}`} className={`compare-label label-${side}`} title={title}>
      <span className={`label-spinner${loading ? "" : " hidden"}`} />
      <span className="label-text">{text}</span>
      <select
        id={`date-picker-${side}`}
        className={`date-picker${showPicker ? "" : " hidden"}`}
        title={t("datePickerTooltip")}
        value={currentDay ?? ""}
        onChange={(e) => onSelectDate(e.target.value)}
      >
        {dates.map((d) => (
          <option key={d.date} value={d.date}>
            {dateOptionLabel(d, totalTiles, t, lang)}
          </option>
        ))}
      </select>
    </div>
  );
}
