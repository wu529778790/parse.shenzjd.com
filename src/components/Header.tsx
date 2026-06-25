"use client";

import { useState } from "react";

const navLinks = [
  { name: "Alist", href: "https://alist.shenzjd.com", icon: "📁" },
  { name: "网盘搜索", href: "https://panhub.shenzjd.com", icon: "🔍" },
  { name: "视频解析", href: "https://parse.shenzjd.com", icon: "🎬", active: true },
  { name: "热点聚合", href: "https://newshub.shenzjd.com", icon: "📰" },
  { name: "个人导航", href: "https://navhub.shenzjd.com", icon: "🧭" },
  { name: "必应壁纸", href: "https://bing.shenzjd.com", icon: "🖼️" },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <a
            href="https://parse.shenzjd.com"
            className="flex items-center gap-2 text-primary hover:text-accent transition-colors duration-300"
          >
            <span className="text-lg font-bold gradient-text">ParseShort</span>
          </a>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 hover:bg-glass-2 ${
                  link.active
                    ? "text-accent bg-glass-2"
                    : "text-secondary hover:text-primary"
                }`}
              >
                <span className="mr-1.5">{link.icon}</span>
                {link.name}
              </a>
            ))}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-lg text-secondary hover:text-primary hover:bg-glass-2 transition-all duration-300"
            aria-label="菜单"
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden pb-4 border-t border-border-subtle mt-2 pt-3">
            <div className="grid grid-cols-2 gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 hover:bg-glass-2 ${
                    link.active
                      ? "text-accent bg-glass-2"
                      : "text-secondary hover:text-primary"
                  }`}
                >
                  <span>{link.icon}</span>
                  {link.name}
                </a>
              ))}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
