const navLinks = [
  { name: "Alist", href: "https://alist.shenzjd.com" },
  { name: "网盘搜索", href: "https://panhub.shenzjd.com" },
  { name: "视频解析", href: "https://parse.shenzjd.com" },
  { name: "热点聚合", href: "https://newshub.shenzjd.com" },
  { name: "个人导航", href: "https://navhub.shenzjd.com" },
  { name: "必应壁纸", href: "https://bing.shenzjd.com" },
];

export default function Footer() {
  return (
    <footer className="border-t border-border-subtle mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {/* Nav Links */}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-4">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted hover:text-primary transition-colors duration-300"
            >
              {link.name}
            </a>
          ))}
        </div>

        {/* Copyright */}
        <p className="text-center text-xs text-muted/60">
          &copy; {new Date().getFullYear()} ParseShort · shenzjd.com
        </p>
      </div>
    </footer>
  );
}
