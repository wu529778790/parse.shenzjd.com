"use client";

import { useState } from "react";

const navLinks = [
  { name: "首页", href: "https://shenzjd.com", icon: "🏠" },
  { name: "Alist", href: "https://alist.shenzjd.com", icon: "📁" },
  { name: "网盘搜索", href: "https://panhub.shenzjd.com", icon: "🔍" },
  { name: "视频解析", href: "https://parse.shenzjd.com", icon: "🎬", active: true },
  { name: "热点聚合", href: "https://newshub.shenzjd.com", icon: "📰" },
  { name: "个人导航", href: "https://navhub.shenzjd.com", icon: "🧭" },
  { name: "必应壁纸", href: "https://bing.shenzjd.com", icon: "🖼️" },
];

const socialLinks = [
  {
    name: "Telegram",
    href: "https://t.me/shenzjd_com",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    name: "GitHub",
    href: "https://github.com/wu529778790",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.112.82-.262.82-.582 0-.288-.01-1.05-.016-2.06-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.744.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.42-1.305.763-1.606-2.665-.304-5.466-1.333-5.466-5.93 0-1.31.47-2.382 1.236-3.222-.124-.303-.536-1.524.117-3.176 0 0 1.008-.323 3.3 1.23a11.5 11.5 0 0 1 3.003-.404c1.02.005 2.047.138 3.003.404 2.29-1.553 3.297-1.23 3.297-1.23.655 1.652.243 2.873.12 3.176.77.84 1.235 1.912 1.235 3.222 0 4.61-2.805 5.624-5.477 5.92.431.372.815 1.103.815 2.222 0 1.604-.015 2.896-.015 3.29 0 .322.216.699.825.58C20.565 21.796 24 17.297 24 12c0-6.63-5.37-12-12-12Z" />
      </svg>
    ),
  },
  {
    name: "X (Twitter)",
    href: "https://x.com/shenzujiudi",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border-subtle backdrop-blur-xl bg-background/70">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center">
          {/* Left: Logo */}
          <a
            href="https://parse.shenzjd.com"
            className="flex items-center gap-2 text-primary hover:text-accent transition-colors duration-300 shrink-0"
          >
            <span className="text-lg font-bold gradient-text">ParseShort</span>
          </a>

          {/* Center: Desktop Nav */}
          <div className="hidden md:flex items-center justify-center gap-1 flex-1">
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

          {/* Right: Social Links */}
          <div className="hidden md:flex items-center gap-1 shrink-0">
            {socialLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.name}
                className="flex items-center justify-center w-8 h-8 rounded-full text-muted hover:text-primary hover:bg-glass-2 transition-all duration-300"
              >
                {link.icon}
              </a>
            ))}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden ml-auto p-2 rounded-lg text-secondary hover:text-primary hover:bg-glass-2 transition-all duration-300"
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
            {/* Mobile Social Links */}
            <div className="flex justify-center gap-3 mt-3 pt-3 border-t border-border-subtle">
              {socialLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.name}
                  className="flex items-center justify-center w-9 h-9 rounded-full text-muted hover:text-primary hover:bg-glass-2 transition-all duration-300"
                >
                  {link.icon}
                </a>
              ))}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
