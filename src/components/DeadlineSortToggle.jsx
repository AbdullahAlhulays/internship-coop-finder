export default function DeadlineSortToggle({ checked, onChange, messages }) {
  return (
    <label className="deadline-sort">
      <span>{messages.filters.sort}</span>
      <span className="deadline-sort-control">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{messages.filters.byDeadline}</span>
      </span>
    </label>
  );
}
