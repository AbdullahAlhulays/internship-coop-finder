export default function LetterRequirementToggle({ checked, onChange }) {
  return (
    <label className="letter-filter">
      <span className="deadline-sort-control">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>No letter required</span>
      </span>
    </label>
  );
}
