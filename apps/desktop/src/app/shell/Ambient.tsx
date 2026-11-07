/**
 * Cover glow behind the top of every page. Until a cover is in focus it is the
 * seed's ambient colour as soft light; the cover sampler (#33) will lay the
 * blurred cover itself on top. Hidden with data-ambient="off".
 */
export function Ambient() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[760px] overflow-hidden [:root[data-ambient=off]_&]:hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(75%_85%_at_70%_-5%,var(--ambient),transparent_72%),radial-gradient(55%_65%_at_15%_-15%,oklch(0.42_var(--accent-c)_calc(var(--seed-h)-28)/calc(0.38*var(--strength))),transparent_70%),radial-gradient(35%_40%_at_92%_30%,oklch(0.5_calc(var(--accent-c)*0.8)_calc(var(--seed-h)+70)/calc(0.16*var(--strength))),transparent_70%)] transition-[background] duration-theme ease-theme" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,oklch(0.13_var(--tint)_var(--seed-h)/0.35)_40%,var(--ink-0)_95%)]" />
    </div>
  );
}
