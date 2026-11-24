import Link from "next/link";
import Wordmark from "@/components/Wordmark";

const STEPS = [
  { title: "Buy and keep the invoice", text: "Your invoice lists every box you bought. The invoice number is the first half of your proof." },
  { title: "Open the box", text: "A coupon code is inside each box. It belongs to that one box and works once." },
  { title: "Enter both and collect", text: "Type the invoice number and the coupon. The points go straight to your account." },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Wordmark />
        <nav className="flex items-center gap-5 text-sm font-medium">
          <Link href="/login" className="underline-offset-4 hover:underline">
            Log in
          </Link>
          <Link href="/register" className="btn-primary">
            Create account
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-5xl items-center gap-12 px-6 pb-20 pt-10 md:grid-cols-2 md:pt-16">
          <div>
            <h1 className="font-display text-4xl font-bold leading-tight md:text-5xl">Every box you open is worth points.</h1>
            <p className="mt-5 max-w-md text-lg" style={{ color: "var(--ink-soft)" }}>
              Enter the invoice number and the coupon inside the box. Collect points and trade them for rewards from the factory.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="btn-primary">
                Start collecting
              </Link>
              <Link href="/login" className="btn-secondary">
                I already have an account
              </Link>
            </div>
          </div>

          {/* A sample claim, drawn as a stamp with a postmark. */}
          <div className="relative mx-auto w-full max-w-xs rotate-2" aria-hidden="true">
            <div className="stamp-wrap">
              <div className="stamp">
                <div className="stamp-inner">
                  <p className="font-display text-xl font-bold">Green Tea 250g</p>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between gap-4 border-b pb-2" style={{ borderColor: "var(--line)" }}>
                      <dt style={{ color: "var(--ink-soft)" }}>Invoice</dt>
                      <dd className="font-medium">INV-1001</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b pb-2" style={{ borderColor: "var(--line)" }}>
                      <dt style={{ color: "var(--ink-soft)" }}>Coupon</dt>
                      <dd className="font-medium tracking-wider">•••• •••• 0001</dd>
                    </div>
                  </dl>
                  <p className="mt-5 font-display text-5xl font-bold" style={{ color: "var(--stamp)" }}>
                    +10
                  </p>
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    points added to your account
                  </p>
                </div>
              </div>
            </div>

            <svg
              className="absolute -bottom-8 -right-6 -rotate-12"
              width="140"
              height="140"
              viewBox="0 0 140 140"
              fill="none"
              stroke="var(--postmark)"
              strokeWidth="2.5"
              style={{ opacity: 0.85 }}
            >
              <circle cx="70" cy="70" r="52" />
              <circle cx="70" cy="70" r="44" strokeWidth="1.5" />
              <path id="pm-arc" d="M30 70a40 40 0 0 1 80 0" stroke="none" />
              <text fill="var(--postmark)" stroke="none" fontSize="13" fontWeight="700" letterSpacing="3">
                <textPath href="#pm-arc" startOffset="50%" textAnchor="middle">
                  CLAIMED
                </textPath>
              </text>
              <text x="70" y="92" textAnchor="middle" fill="var(--postmark)" stroke="none" fontSize="12" fontWeight="700">
                ONCE ONLY
              </text>
            </svg>
          </div>
        </section>

        <section className="border-t bg-white" style={{ borderColor: "var(--line)" }}>
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="font-display text-2xl font-bold md:text-3xl">How it works</h2>
            <ol className="mt-8 grid gap-8 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full font-display text-lg font-bold text-white"
                    style={{ background: "var(--stamp)" }}
                  >
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 max-w-xs" style={{ color: "var(--ink-soft)" }}>
                    {s.text}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-5xl px-6 py-8 text-sm" style={{ color: "var(--ink-soft)" }}>
        LoyalStamp. Each coupon works once, and only for a box listed on your invoice.
      </footer>
    </div>
  );
}
