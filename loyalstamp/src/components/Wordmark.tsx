import Link from "next/link";

export default function Wordmark() {
  return (
    <Link href="/" className="inline-flex items-center gap-2 font-display text-xl font-bold" aria-label="LoyalStamp home">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <rect x="2" y="2" width="22" height="22" rx="2" fill="var(--stamp)" />
        <path d="M13 6l2 4.5 4.9.5-3.7 3.3 1.1 4.8L13 16.6 8.7 19.1l1.1-4.8L6.1 11l4.9-.5z" fill="#fff" />
      </svg>
      LoyalStamp
    </Link>
  );
}
