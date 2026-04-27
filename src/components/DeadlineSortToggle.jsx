export default function DeadlineSortToggle({ checked, onChange }) {
  return (
    <label className="deadline-sort">
      <span>Sort</span>
      <span className="deadline-sort-control">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>By deadline</span>
      </span>
    </label>
  );
}
