import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p,
});

export const IconLock = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
export const IconGlobe = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>;
export const IconPlus = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>;
export const IconShare = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>;
export const IconBack = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M15 18l-6-6 6-6" /></svg>;
export const IconEye = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>;
export const IconEyeOff = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.8C3.8 8.6 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>;
export const IconChevron = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M9 6l6 6-6 6" /></svg>;
export const IconCrown = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" /></svg>;
export const IconSend = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" /></svg>;
