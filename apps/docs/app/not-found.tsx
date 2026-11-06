import { House } from "lucide-react";
import Link from "next/link";

// Every URL goes through the docs catch-all, so this always renders inside the docs layout.
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-24 text-center">
      <p className="text-6xl font-bold text-fd-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">This page doesn&apos;t exist</h1>
      <p className="max-w-md text-fd-muted-foreground">
        It may have moved when the docs were reorganized. Use the search in the sidebar, or start from the introduction.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-fd-primary px-3 py-2 text-sm font-medium text-fd-primary-foreground hover:opacity-90"
      >
        <House className="size-4" />
        Docs home
      </Link>
    </div>
  );
}
