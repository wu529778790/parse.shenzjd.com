import Image from "next/image";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative border-t border-border-subtle mt-auto">
      {/* Ambient Glow Line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-0.5 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 blur-sm opacity-0 group-hover:opacity-50 transition-opacity duration-300" />
              <Image
                src="/logo.jpg"
                alt="ParseShort"
                width={32}
                height={32}
                className="relative rounded-full transition-transform duration-300 group-hover:scale-105"
                priority={false}
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-primary group-hover:text-accent transition-colors duration-300">
                ParseShort
              </span>
              <span className="w-px h-3 bg-border-medium" />
              <span className="text-muted">parse.shenzjd.com</span>
            </div>
          </div>

          {/* GitHub Link */}
          <a
            href="https://github.com/wu529778790/parse.shenzjd.com"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-glass-2 border border-border-subtle hover:border-accent/30 hover:bg-glass-3 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-0.5">
            <svg
              className="w-5 h-5 text-muted group-hover:text-accent transition-colors duration-300 group-hover:scale-110 transform"
              fill="currentColor"
              viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.112.82-.262.82-.582 0-.288-.01-1.05-.016-2.06-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.744.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.42-1.305.763-1.606-2.665-.304-5.466-1.333-5.466-5.93 0-1.31.47-2.382 1.236-3.222-.124-.303-.536-1.524.117-3.176 0 0 1.008-.323 3.3 1.23a11.5 11.5 0 0 1 3.003-.404c1.02.005 2.047.138 3.003.404 2.29-1.553 3.297-1.23 3.297-1.23.655 1.652.243 2.873.12 3.176.77.84 1.235 1.912 1.235 3.222 0 4.61-2.805 5.624-5.477 5.92.431.372.815 1.103.815 2.222 0 1.604-.015 2.896-.015 3.29 0 .322.216.699.825.58C20.565 21.796 24 17.297 24 12c0-6.63-5.37-12-12-12Z" />
            </svg>
            <span className="text-sm font-medium text-muted group-hover:text-primary transition-colors duration-300">
              Star on GitHub
            </span>
            <svg
              className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
        </div>

        {/* Bottom Bar */}
        <div className="mt-6 pt-6 border-t border-border-subtle text-center">
          <p className="text-xs text-muted">
            © {currentYear} ParseShort. Made with{" "}
            <span className="inline-block animate-pulse">♥</span> for the community
          </p>
        </div>
      </div>
    </footer>
  );
}
