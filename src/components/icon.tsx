import type { CSSProperties } from "react";

const paths = {
  rocket: "M12 16l-4-4m4 4c5-2 8-7 8-12-5 0-10 3-12 8m4 4-4 1-3-3 1-4m6 6-1 5 4-4m-9-5-5 1 4-4m1 11-2 2m4-1-2 2",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3a4 4 0 0 1 0 8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  chart: "M4 3v17h17M8 15l4-5 4 2 5-7",
  upload: "M12 16V3m-5 5 5-5 5 5M3 15v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  clock: "M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  file: "M14 2H5v20h14V7l-5-5v5h5M8 12h8m-8 4h5",
  target: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0m-5 0a5 5 0 1 1-10 0 5 5 0 0 1 10 0m-5-1v2",
  shield: "M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4m-4 10 3 3 5-6",
  ball: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 7l5 4-2 6H9l-2-6 5-4Zm0-5v5m10 5-5-1m1 9-3-3m-9 3 3-3m-7-5 5-1",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3",
  download: "M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4",
  check: "m5 12 4 4L19 6",
  info: "M12 11v6m0-10v.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  chevron: "m9 5 7 7-7 7",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0m-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  close: "m6 6 12 12M6 18 18 6",
  bolt: "m13 2-9 12h7l-1 8 10-13h-7l1-7",
  help: "M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 4v.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, className = "", style }: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" className={className} style={style}>
      <path d={paths[name]} />
    </svg>
  );
}
