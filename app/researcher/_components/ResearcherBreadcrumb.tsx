"use client";
import Link from "next/link";

interface Props {
  current: string;
}

export function ResearcherBreadcrumb({ current }: Props) {
  return (
    <nav className="flex items-center gap-2 text-xs text-[#64748B]">
      <Link href="/researcher/dashboard" className="hover:text-[#F37021] transition-colors">
        Researcher Dashboard
      </Link>
      <svg className="w-3.5 h-3.5 text-[#CBD5E1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
      <span className="font-semibold text-[#0F172A]">{current}</span>
    </nav>
  );
}
