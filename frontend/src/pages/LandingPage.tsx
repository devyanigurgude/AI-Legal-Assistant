import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

function Shell({ children }: { children: ReactNode }) {
  return <div className="w-full h-screen overflow-hidden bg-background text-foreground">{children}</div>;
}

function TopNav() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/55">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border bg-gradient-to-br from-primary/10 via-background to-accent/10">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg tracking-tight">Contract AI</div>
            <div className="text-xs text-muted-foreground">AI-powered contract analysis</div>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/register">
              Create account
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export default function LandingPage() {
  return (
    <Shell>
      <TopNav />

      <main className="relative w-full h-full flex flex-col justify-center items-center overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 -z-20">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/20 via-background to-background" />
          <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(hsl(var(--foreground)/0.1)_2px,transparent_2px)] [background-size:25px_25px]" />
          <div className="absolute left-1/2 top-[-220px] h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-gradient-to-br from-accent/40 to-primary/30 blur-3xl" />
        </div>

        {/* AI Legal Assistant Section */}
        <div className="max-w-5xl text-center relative z-10 px-4 sm:px-6 lg:px-8 animate-fade-in-up">
          <div className="inline-flex items-center gap-3 rounded-full border bg-background/80 px-4 py-2 text-sm sm:text-base text-muted-foreground shadow-lg backdrop-blur">
            <Sparkles className="h-5 w-5 text-accent animate-pulse" />
            <span>Make contract review faster, clearer, safer.</span>
          </div>

          <h1 className="mt-8 text-5xl sm:text-7xl font-extrabold tracking-tight leading-tight sm:leading-snug">
            AI Legal{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent animate-gradient-x">
              Assistant
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-2xl text-muted-foreground max-w-3xl mx-auto">
            Upload a contract, spot risks, and share clear summaries in minutes — effortless and reliable.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-5 sm:flex-row">
            <Button size="lg" asChild className="shadow-2xl transform hover:scale-105 transition-all duration-300">
              <Link to="/register">
                Create account
                <ArrowRight className="h-5 w-5 ml-1" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="bg-background/80 backdrop-blur border border-primary transform hover:scale-105 transition-all duration-300"
            >
              <Link to="/login">
                Sign in
                <ArrowRight className="h-5 w-5 ml-1" />
              </Link>
            </Button>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-base text-muted-foreground">
            <div className="inline-flex items-center gap-3 rounded-full border px-4 py-2 bg-background/85 shadow-lg transform hover:scale-105 transition-all duration-300">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <span>Risk highlights</span>
            </div>
            <div className="inline-flex items-center gap-3 rounded-full border px-4 py-2 bg-background/85 shadow-lg transform hover:scale-105 transition-all duration-300">
              <Sparkles className="h-5 w-5 text-primary" />
              <span>Clause summaries</span>
            </div>
            <div className="inline-flex items-center gap-3 rounded-full border px-4 py-2 bg-background/85 shadow-lg transform hover:scale-105 transition-all duration-300">
              <ArrowRight className="h-5 w-5 text-primary" />
              <span>Downloadable reports</span>
            </div>
          </div>
        </div>
      </main>
    </Shell>
  );
}