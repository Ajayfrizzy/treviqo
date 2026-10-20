"use client";
import Link from "@/components/action-link";
import { UiIcon } from "./ui-icon";
import { useEffect, useRef, useState } from "react";
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
  const dialog = useRef<HTMLDialogElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const active = (href: string) =>
    path === href ||
    path.startsWith(href + "/") ||
    (href === "/home" && path.startsWith("/employments/"));
  const moreActive = sections.slice(4).some(({ href }) => active(href));

  useEffect(() => {
    const sheet = dialog.current;
    const tablet = window.matchMedia("(min-width: 600px)");
    const closeOnResize = () => {
      if (tablet.matches) sheet?.close();
    };
    tablet.addEventListener("change", closeOnResize);
    return () => tablet.removeEventListener("change", closeOnResize);
  }, []);
  useEffect(() => {
    dialog.current?.close();
  }, [path]);

  const renderLink = (section: (typeof sections)[number], inSheet = false) => (
    <Link
      key={section.href}
      href={section.href}
      prefetch={true}
      className={
        !inSheet && sections.indexOf(section) >= 4 ? "nav-secondary" : undefined
      }
      aria-current={active(section.href) ? "page" : undefined}
      onClick={inSheet ? () => dialog.current?.close() : undefined}
    >
      <span className="nav-icon" aria-hidden="true">
        <UiIcon name={section.icon} />
      </span>
      <span>{section.label}</span>
    </Link>
  );

  return (
    <>
      <nav className="navigation" aria-label="Primary">
        {sections.map((section) => renderLink(section))}
        <button
          ref={more}
          type="button"
          className="nav-more"
          aria-expanded={open}
          aria-controls="navigation-more"
          aria-haspopup="dialog"
          aria-current={moreActive ? "location" : undefined}
          onClick={() => {
            dialog.current?.showModal();
            setOpen(true);
          }}
        >
          <span className="nav-icon">
            <UiIcon name="more" />
          </span>
          <span>More</span>
        </button>
      </nav>
      <dialog
        ref={dialog}
        id="navigation-more"
        className="navigation-sheet"
        aria-labelledby="navigation-more-title"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls =
            event.currentTarget.querySelectorAll<HTMLElement>(
              "button, a[href]",
            );
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClose={() => {
          setOpen(false);
          more.current?.focus();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            dialog.current?.close();
        }}
      >
        <header>
          <h2 id="navigation-more-title">More</h2>
          <button
            type="button"
            className="secondary"
            onClick={() => dialog.current?.close()}
          >
            Close
          </button>
        </header>
        <nav aria-label="More destinations">
          {sections.slice(4).map((section) => renderLink(section, true))}
        </nav>
      </dialog>
    </>
  );
}
