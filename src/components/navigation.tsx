"use client";
import Link from "@/components/action-link";
import { UiIcon } from "./ui-icon";
import { usePathname } from "next/navigation";
export const sections = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/exit", label: "Exit", icon: "exit" },
  { href: "/reminders", label: "Reminders", icon: "reminders" },
  { href: "/passport", label: "Passport", icon: "passport" },
  { href: "/documents", label: "Documents", icon: "documents" },
  { href: "/profile", label: "Profile", icon: "profile" },
];
export function Navigation() {
  const path = usePathname();
  return (
    <nav className="navigation" aria-label="Primary">
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          prefetch={true}
          aria-current={
            path === section.href ||
            (section.href === "/documents" && path.startsWith("/documents/")) ||
            (section.href === "/exit" && path.startsWith("/exit/")) ||
            (section.href === "/passport" && path.startsWith("/passport/")) ||
            (section.href === "/home" && path.startsWith("/employments/"))
              ? "page"
              : undefined
          }
        >
          <span className="nav-icon" aria-hidden="true">
            <UiIcon name={section.icon} />
          </span>
          <span>{section.label}</span>
        </Link>
      ))}
    </nav>
  );
}
