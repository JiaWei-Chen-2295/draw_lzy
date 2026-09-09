function OptionButton({ active, children, onClick }) {
  return (
    <button type="button" className="option-card" data-active={active} onClick={onClick}>
      {children}
    </button>
  );
}

export function IntentPicker({ round, value, onChange, onSubmit, isSubmitting }) {
  const isComplete = Boolean(value.vibeChoice);

  return (
    <div className="space-y-5">
      <section className="panel p-5 md:p-6">
        <h3 className="text-lg font-semibold">选一个最接近的感觉</h3>
        <div className="option-grid mt-4 sm:grid-cols-2">
          {round.vibeOptions.map((option) => (
            <OptionButton
              key={option}
              active={value.vibeChoice === option}
              onClick={() => onChange({ ...value, vibeChoice: option })}
            >
              {option}
            </OptionButton>
          ))}
        </div>
      </section>

      <button type="button" className="btn-primary w-full" onClick={onSubmit} disabled={isSubmitting || !isComplete}>
        {isSubmitting ? "先记一下..." : "选好了，开始画"}
      </button>
    </div>
  );
}
