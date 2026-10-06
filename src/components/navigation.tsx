"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export const sections = [
  { href: "/", label: "Home", icon: "⌂" }, { href: "/exit", label: "Exit", icon: "↗" },
  { href: "/passport", label: "Passport", icon: "▣" }, { href: "/documents", label: "Documents", icon: "▤" },
  { href: "/profile", label: "Profile", icon: "○" },
];
export function Navigation() {
  const path = usePathname();
  return <nav className="navigation" aria-label="Primary">{sections.map(section => <Link key={section.href} href={section.href} aria-current={(path === section.href || (section.href === "/documents" && path.startsWith("/documents/")) || (section.href === "/exit" && path.startsWith("/exit/")) || (section.href === "/passport" && path.startsWith("/passport/")) || (section.href === "/" && (path.startsWith("/employments/") || path === "/reminders"))) ? "page" : undefined}><span className="nav-icon" aria-hidden="true">{section.icon}</span><span>{section.label}</span></Link>)}</nav>;
}
