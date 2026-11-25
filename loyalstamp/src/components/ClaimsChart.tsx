"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { day: string; claims: number; points: number };

export default function ClaimsChart({ data }: { data: Point[] }) {
  const total = data.reduce((s, d) => s + d.claims, 0);

  return (
    <figure aria-label={`Coupon claims per day for the last ${data.length} days. ${total} claims in total.`}>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d8dce6" />
            <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} interval="preserveStartEnd" minTickGap={24} tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value: number, name: string) => [value, name === "claims" ? "Claims" : "Points"]}
              labelFormatter={(d: string) => `${d} (UTC)`}
            />
            <Bar dataKey="claims" fill="#2f4bdb" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer underline" style={{ color: "var(--stamp-dark)" }}>
          View as a table
        </summary>
        <div className="mt-2 max-h-56 overflow-auto rounded border" style={{ borderColor: "var(--line)" }}>
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-slate-100">
              <tr>
                <th className="px-3 py-1.5">Day (UTC)</th>
                <th className="px-3 py-1.5">Claims</th>
                <th className="px-3 py-1.5">Points issued</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.day} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="px-3 py-1.5">{d.day}</td>
                  <td className="px-3 py-1.5">{d.claims}</td>
                  <td className="px-3 py-1.5">{d.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
