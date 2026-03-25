import { FOCUS_OPTIONS } from "@/lib/constants";

function OptionButton({ active, children, onClick }) {
  return (
    <button type="button" className="option-card" data-active={active} onClick={onClick}>
      {children}
    </button>
  );
}

export function GuessPicker({ round, value, onChange, onSubmit, isSubmitting }) {
  return (
    <div className="space-y-5">
      <section className="panel p-5 md:p-6">
        <h3 className="text-lg font-semibold">你先猜一个，这张画更像在说什么？</h3>
        <div className="option-grid mt-4 sm:grid-cols-2">
          {FOCUS_OPTIONS.map((option) => (
            <OptionButton
              key={option}
              active={value.focusChoice === option}
              onClick={() => onChange({ ...value, focusChoice: option })}
            >
              {option}
            </OptionButton>
          ))}
        </div>
      </section>

      <section className="panel p-5 md:p-6">
        <h3 className="text-lg font-semibold">再猜一种感觉</h3>
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

      <button type="button" className="btn-primary w-full" onClick={onSubmit} disabled={isSubmitting}>
        {isSubmitting ? "提交中..." : "交卷看看"}
      </button>
    </div>
  );
}
