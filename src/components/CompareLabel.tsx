import type { SceneDate } from "../lib/stacInfo";
import { formatDate } from "../utils/format";

function dateOptionLabel(d: SceneDate, totalTiles: number): string {
  const cloud = d.cloudCover == null ? "…" : `${d.cloudCover.toFixed(0)}%`;
  const partial = totalTiles > 1 && d.tileCount < totalTiles ? " (partiel)" : "";
  return `${formatDate(d.date)} · ${cloud} ☁${partial}`;
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
  onOpenPicker: () => void;
}

// One "Avant"/"Après" label: text + spinner + an optional date picker,
// shown only when the STAC lookup found more than one distinct day nearby
// (lets the user pick a specific day when the view spans multiple grid
// tiles imaged on different days — see lib/stacInfo.ts).
export function CompareLabel({ side, text, title, loading, dates, totalTiles, selectedDate, onSelectDate, onOpenPicker }: Props) {
  const showPicker = dates.length >= 2;
  const currentDay = selectedDate?.slice(0, 10);

  return (
    <div id={`label-${side}`} className={`compare-label label-${side}`} title={title}>
      <span className={`label-spinner${loading ? "" : " hidden"}`} />
      <span className="label-text">{text}</span>
      <select
        id={`date-picker-${side}`}
        className={`date-picker${showPicker ? "" : " hidden"}`}
        title="Choisir une autre date disponible"
        value={currentDay ?? ""}
        onMouseDown={onOpenPicker}
        onFocus={onOpenPicker}
        onChange={(e) => onSelectDate(e.target.value)}
      >
        {dates.map((d) => (
          <option key={d.date} value={d.date}>
            {dateOptionLabel(d, totalTiles)}
          </option>
        ))}
      </select>
    </div>
  );
}
