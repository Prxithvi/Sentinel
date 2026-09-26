"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Map,
  Network,
  BriefcaseBusiness,
  Trophy,
  Globe2,
  Flag,
  ClipboardCheck,
  SlidersHorizontal,
  BarChart3,
  Ban,
  HeartPulse,
  LogOut,
  Languages,
  ShieldCheck,
} from "lucide-react";

const navigation = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "India Map",
    href: "/map",
    icon: Map,
  },
  {
    label: "Vendor Graph",
    href: "/graph",
    icon: Network,
  },
  {
    label: "Cases",
    href: "/cases",
    icon: BriefcaseBusiness,
  },
  {
    label: "Leaderboard",
    href: "/leaderboard",
    icon: Trophy,
  },
  {
    label: "Transparency",
    href: "/transparency",
    icon: Globe2,
  },
  {
    label: "Report Fraud",
    href: "/report-fraud",
    icon: Flag,
  },
  {
    label: "Field Verify",
    href: "/field-verification",
    icon: ClipboardCheck,
  },
  {
    label: "Scoring Config",
    href: "/scoring-config",
    icon: SlidersHorizontal,
  },
  {
    label: "Model Metrics",
    href: "/model-metrics",
    icon: BarChart3,
  },
  {
    label: "Blacklist",
    href: "/blacklist",
    icon: Ban,
  },
  {
    label: "System Health",
    href: "/system-health",
    icon: HeartPulse,
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[244px] flex-col border-r bg-white">
      {/* ─────────────────────────────────────────────
          BRAND
      ───────────────────────────────────────────── */}

      <div className="flex h-[86px] items-center border-b px-4">
        <Link
          href="/"
          className="flex items-center gap-3"
          aria-label="Sentinel Dashboard"
        >
          {/* Logo */}
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl">
            <Image
              src="/logo.png"
              alt="Sentinel"
              fill
              priority
              sizes="44px"
              className="object-contain"
            />
          </div>

          {/* Brand text */}
          <div className="min-w-0">
            <div className="text-[18px] font-bold leading-tight text-gray-900">
              Sentinel
            </div>

            <div className="mt-1 text-[11px] leading-tight text-gray-500">
              SIH26102 — Fraud Detection Platform
            </div>
          </div>
        </Link>
      </div>

      {/* ─────────────────────────────────────────────
          NAVIGATION
      ───────────────────────────────────────────── */}

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;

            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "group flex h-10 items-center gap-3 rounded-md px-3",
                  "text-[14px] font-medium transition-all duration-150",
                  isActive
                    ? "bg-emerald-100 text-emerald-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                ].join(" ")}
              >
                <Icon
                  className={[
                    "h-[18px] w-[18px] shrink-0 transition-colors",
                    isActive
                      ? "text-emerald-700"
                      : "text-gray-500 group-hover:text-gray-700",
                  ].join(" ")}
                  strokeWidth={1.8}
                />

                <span className="truncate">{item.label}</span>

                {item.label === "Transparency" ||
                item.label === "Report Fraud" ? (
                  <Globe2
                    className="ml-auto h-3.5 w-3.5 text-gray-400"
                    strokeWidth={1.7}
                  />
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ─────────────────────────────────────────────
          BOTTOM INFORMATION
      ───────────────────────────────────────────── */}

      <div className="border-t px-3 py-4">
        <div className="rounded-lg bg-gray-50 p-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />

            <span className="text-xs font-semibold text-gray-700">
              Sentinel
            </span>
          </div>

          <p className="mt-2 text-[11px] leading-4 text-gray-500">
            Fraud detection and investigation platform for MPLAD monitoring.
          </p>
        </div>
      </div>
    </aside>
  );
}