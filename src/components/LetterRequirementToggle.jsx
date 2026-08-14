export default function LetterRequirementToggle({ checked, onChange, messages }) {
  return (
    <label className="letter-filter">
      <span>{messages.filters.filter}</span>
      <span className="deadline-sort-control">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{messages.filters.noLetterRequired}</span>
      </span>
    </label>
  );
}
