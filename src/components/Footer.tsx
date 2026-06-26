import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border-subtle mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col items-center gap-2">
          {/* Legal Links */}
          <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted/60">
            <Link
              href="/legal/terms"
              className="hover:text-primary transition-colors duration-200">
              用户协议
            </Link>
            <span className="text-muted/30">·</span>
            <Link
              href="/legal/privacy"
              className="hover:text-primary transition-colors duration-200">
              隐私政策
            </Link>
            <span className="text-muted/30">·</span>
            <Link
              href="/legal/dmca"
              className="hover:text-primary transition-colors duration-200">
              权利通知
            </Link>
          </nav>

          {/* Copyright */}
          <p className="text-center text-xs text-muted/60">
            &copy; {new Date().getFullYear()} ParseShort · shenzjd.com
          </p>
        </div>
      </div>
    </footer>
  );
}
