"use client";
import Link from "@/components/action-link";
import { usePathname } from "next/navigation";
export const sections = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/exit", label: "Exit", icon: "exit" },
  { href: "/passport", label: "Passport", icon: "passport" },
  { href: "/documents", label: "Documents", icon: "documents" },
  { href: "/profile", label: "Profile", icon: "profile" },
];
const paths: Record<string, React.ReactNode> = {
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
    </>
  ),
  exit: (
    <>
      <path d="M10 4H4v16h6M10 12h11m-5-5 5 5-5 5" />
    </>
  ),
  passport: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="10" r="3" />
      <path d="M8 17h8M12 7v6M9 10h6" />
    </>
  ),
  documents: (
    <>
      <path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h6" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
};
export function Navigation() {
  const path = usePathname();
  return (
    <nav className="navigation" aria-label="Primary">
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          aria-current={
            path === section.href ||
            (section.href === "/documents" && path.startsWith("/documents/")) ||
            (section.href === "/exit" && path.startsWith("/exit/")) ||
            (section.href === "/passport" && path.startsWith("/passport/")) ||
            (section.href === "/" &&
              (path.startsWith("/employments/") || path === "/reminders"))
              ? "page"
              : undefined
          }
        >
          <span className="nav-icon" aria-hidden="true">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {paths[section.icon]}
            </svg>
          </span>
          <span>{section.label}</span>
        </Link>
      ))}
    </nav>
  );
}
