import React from "react";
import {
  ArrowRight,
  BarChart3,
  ChevronRight,
  GitBranch,
  Leaf,
  Route,
  ShieldCheck,
  Trash2,
} from "lucide-react";

interface LandingPageProps {
  onContinueAsGuest?: () => void;
  onTryNow?: () => void;
  onSignIn?: () => void;
}

const workflow = [
  {
    number: "01",
    title: "Choose your campus",
    description:
      "Find the campus boundary and bring the real venue into the plan.",
  },
  {
    number: "02",
    title: "Shape the event",
    description:
      "Add zones, activities, daily footfall, duration, and the entry gate.",
  },
  {
    number: "03",
    title: "Plan the response",
    description:
      "Review waste, bins, routes, and corridor priorities on one map.",
  },
];

const capabilities = [
  {
    icon: BarChart3,
    title: "Waste prediction",
    description:
      "Predict total and category-wise waste using activity profiles and CPCB baselines.",
    tone: "bg-[#EAF5E6] text-[#004B20]",
  },
  {
    icon: Trash2,
    title: "Bin placement",
    description:
      "Convert waste volume into bin counts, streams, emptying turns, and map coordinates.",
    tone: "bg-[#EEF5FB] text-[#2365A6]",
  },
  {
    icon: Route,
    title: "Movement intelligence",
    description:
      "Score pedestrian corridors and guide roadside-bin placement by route demand.",
    tone: "bg-[#FDF7EC] text-[#A15C16]",
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onContinueAsGuest,
  onTryNow,
  onSignIn,
}) => {
  const handleTryNow = onTryNow || onContinueAsGuest;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F7F9F5] text-[#202820] font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-40 w-full border-b border-[#E1E8DE]/80 bg-[#F7F9F5]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8 lg:px-10">
          <div className="flex items-center gap-8">
            <img
              src="/bunbetsu-logo.png"
              alt="Bunbetsu"
              className="h-7 w-auto object-contain cursor-pointer"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            />
            <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-[#667267]">
              <a href="#how-it-works" className="transition hover:text-[#004B20]">
                How it works
              </a>
              <a href="#capabilities" className="transition hover:text-[#004B20]">
                Capabilities
              </a>
              <a href="#methodology" className="transition hover:text-[#004B20]">
                Methodology
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSignIn}
              className="rounded-lg px-3.5 py-2 text-xs font-bold text-[#004B20] transition hover:bg-[#EAF5E6] cursor-pointer"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={handleTryNow}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#004B20] px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#003818] cursor-pointer"
            >
              Try now
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-[#F7F9F5]">
          <div
            className="absolute -right-24 -top-28 h-96 w-96 rounded-full border-[36px] border-[#EAF5E6] opacity-80"
            aria-hidden="true"
          />
          <div
            className="absolute -bottom-28 left-[38%] h-64 w-[44rem] rounded-[50%] border border-[#DDECD5]"
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-7xl px-5 pb-14 pt-8 sm:px-8 sm:pb-20 sm:pt-10 lg:px-10 lg:pb-24 lg:pt-12">
            <div className="flex flex-col items-center">
              <img
                src="/bunbetsu-logo.png"
                alt="Bunbetsu"
                className="mb-10 h-auto w-[min(66vw,640px)] min-w-[240px] sm:mb-12"
              />
              <p className="mb-8 max-w-2xl text-center text-base font-normal leading-7 text-[#667267] sm:text-lg">
                Predict waste, place bins intelligently, and plan cleaner campus
                events before the crowd arrives.
              </p>
              <div className="w-full max-w-5xl rotate-[-1deg] overflow-hidden rounded-2xl border border-[#D6E4D1] bg-white p-2 shadow-[0_26px_70px_rgba(0,75,32,.22)] sm:p-3">
                <img
                  src="/demo.jpg"
                  alt="Bunbetsu campus map dashboard showing waste heatmaps, pedestrian routes, and bin recommendations"
                  className="h-auto w-full rounded-xl object-cover"
                />
              </div>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-md">
                <button
                  type="button"
                  onClick={handleTryNow}
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl border-2 border-[#004B20] bg-[#004B20] px-8 py-4 text-base sm:text-lg font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-[#073618] hover:border-[#073618] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#70D000] focus:ring-offset-2 cursor-pointer"
                >
                  Try now
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={onSignIn}
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl border-2 border-[#004B20] bg-white px-8 py-4 text-base sm:text-lg font-bold text-[#004B20] shadow-md transition hover:-translate-y-0.5 hover:bg-[#EAF5E6] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#70D000] focus:ring-offset-2 cursor-pointer"
                >
                  Sign in
                </button>
              </div>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="mx-auto max-w-7xl scroll-mt-20 px-5 py-16 sm:px-8 lg:px-10 lg:py-24"
        >
          <div className="max-w-2xl">
            <div className="mb-3 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#004B20]">
              A simple planning loop
            </div>
            <h2 className="font-heading text-3xl font-extrabold tracking-[-.035em] text-[#202820] sm:text-4xl">
              From campus boundary to event-ready map.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#667267]">
              Three steps turn a campus and event brief into an actionable waste
              plan.
            </p>
          </div>
          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {workflow.map((step, index) => (
              <div
                key={step.number}
                className="relative border-t-2 border-[#70D000] bg-white p-5 shadow-sm md:min-h-[190px]"
              >
                {index < workflow.length - 1 && (
                  <ChevronRight
                    className="absolute -right-3 top-5 z-10 hidden h-6 w-6 rounded-full bg-[#F7F9F5] text-[#004B20] md:block"
                    aria-hidden="true"
                  />
                )}
                <span className="font-heading text-3xl font-extrabold text-[#B9DDA9]">
                  {step.number}
                </span>
                <h3 className="mt-3 font-heading text-lg font-bold text-[#202820]">
                  {step.title}
                </h3>
                <p className="mt-2 text-xs leading-6 text-[#667267]">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="capabilities"
          className="border-y border-[#E1E8DE] bg-white scroll-mt-20"
        >
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-24">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div className="max-w-2xl">
                <div className="mb-3 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#004B20]">
                  The planning surface
                </div>
                <h2 className="font-heading text-3xl font-extrabold tracking-[-.035em] text-[#202820] sm:text-4xl">
                  A better answer than “put bins everywhere.”
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-[#667267]">
                Waste, space, and movement are connected. Bunbetsu keeps those
                decisions together.
              </p>
            </div>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {capabilities.map(({ icon: Icon, title, description, tone }) => (
                <article
                  key={title}
                  className="border border-[#E1E8DE] bg-[#F7F9F5] p-5 transition hover:-translate-y-1 hover:shadow-md"
                >
                  <div
                    className={`mb-7 flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="font-heading text-xl font-bold text-[#202820]">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[#667267]">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="methodology"
          className="mx-auto grid max-w-7xl scroll-mt-20 gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[.8fr_1.2fr] lg:px-10 lg:py-24"
        >
          <div>
            <div className="mb-3 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#004B20]">
              Built for honest decisions
            </div>
            <h2 className="font-heading text-3xl font-extrabold tracking-[-.035em] text-[#202820] sm:text-4xl">
              Explainable by design.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#667267]">
              A transparent mathematical baseline makes predictions useful while
              festival-specific data is still limited.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border border-[#E1E8DE] bg-white p-5 shadow-sm">
              <ShieldCheck className="h-5 w-5 text-[#004B20]" />
              <h3 className="mt-4 font-heading text-base font-bold">
                CPCB reference baselines
              </h3>
              <p className="mt-2 text-xs leading-6 text-[#667267]">
                State and Union Territory benchmarks provide an auditable
                starting point.
              </p>
            </div>
            <div className="border border-[#E1E8DE] bg-white p-5 shadow-sm">
              <BarChart3 className="h-5 w-5 text-[#E66D27]" />
              <h3 className="mt-4 font-heading text-base font-bold">
                Low / central / high
              </h3>
              <p className="mt-2 text-xs leading-6 text-[#667267]">
                Ranges help teams plan for variation rather than false
                precision.
              </p>
            </div>
            <div className="border border-[#E1E8DE] bg-white p-5 shadow-sm">
              <GitBranch className="h-5 w-5 text-[#2365A6]" />
              <h3 className="mt-4 font-heading text-base font-bold">
                Mapped movement
              </h3>
              <p className="mt-2 text-xs leading-6 text-[#667267]">
                OpenStreetMap paths are processed into a campus-specific
                pedestrian graph.
              </p>
            </div>
            <div className="border border-[#E1E8DE] bg-white p-5 shadow-sm">
              <Leaf className="h-5 w-5 text-[#004B20]" />
              <h3 className="mt-4 font-heading text-base font-bold">
                Improve with use
              </h3>
              <p className="mt-2 text-xs leading-6 text-[#667267]">
                Actual event data can calibrate future campus-specific
                predictions.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-5 mb-16 overflow-hidden rounded-2xl bg-[#004B20] sm:mx-8 lg:mx-auto lg:mb-24 lg:max-w-7xl lg:px-10">
          <div className="relative px-6 py-12 sm:px-10 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:py-16">
            <div
              className="absolute -right-20 -top-28 h-72 w-72 rounded-full border-[28px] border-[#70D000]/20"
              aria-hidden="true"
            />
            <div className="relative max-w-2xl">
              <div className="mb-3 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#B9E769]">
                Make the first move count
              </div>
              <h2 className="font-heading text-3xl font-extrabold tracking-[-.035em] text-white sm:text-4xl">
                Give your next festival a plan before it gets crowded.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[#D6EAD3]">
                Start with a campus, shape the event, and see where waste
                infrastructure belongs.
              </p>
            </div>
            <div className="relative mt-8 flex flex-wrap items-center gap-3 shrink-0 lg:mt-0">
              <button
                type="button"
                onClick={handleTryNow}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#70D000] px-5 py-3 text-sm font-extrabold text-[#004B20] transition hover:bg-[#8BE51E] focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#004B20] cursor-pointer"
              >
                Try now <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onSignIn}
                className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-white/80 bg-transparent px-5 py-3 text-sm font-extrabold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#004B20] cursor-pointer"
              >
                Sign in
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E1E8DE] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-7 text-xs text-[#667267] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <img
              src="/bunbetsu-logo.png"
              alt="Bunbetsu"
              className="h-6 w-auto"
            />
            <span>Campus event waste planning, made spatial.</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#summary" className="transition hover:text-[#004B20]">
              About
            </a>
            <a href="#methodology" className="transition hover:text-[#004B20]">
              Methodology
            </a>
            <span>Build Bharat · Waste & Energy</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
