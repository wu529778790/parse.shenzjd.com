export default function Footer() {
  return (
    <footer className="border-t border-border-subtle mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {/* Copyright */}
        <p className="text-center text-xs text-muted/60">
          &copy; {new Date().getFullYear()} ParseShort · shenzjd.com
        </p>
      </div>
    </footer>
  );
}
