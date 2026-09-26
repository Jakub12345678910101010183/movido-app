/**
 * Navbar Component - Terminal Noir Design
 * Fixed navigation with cyan accents and glass effect
 */

import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Truck, Menu, X } from "lucide-react";
import { useState } from "react";

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it Works" },
  { href: "/#driver-app", label: "For drivers" },
  { href: "/pricing", label: "Pricing" },
];

export default function Navbar() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container">
        <nav className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/">
            <div className="flex items-center gap-2 group cursor-pointer">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center group-hover:glow-cyan-sm transition-all">
                <Truck className="w-4 h-4 text-primary" />
              </div>
              <span className="font-bold text-lg tracking-tight">MOVIDO</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4">
            <Button asChild variant="ghost" size="sm">
                <Link href="/login">
                Sign In
                </Link>
              </Button>
            <Button asChild size="sm" className="glow-cyan-sm">
                <Link href="/login?mode=register">
                Start free trial
                </Link>
              </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </nav>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border">
            <div className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <div className="flex flex-col gap-2 pt-4 border-t border-border">
                <Button asChild variant="ghost" size="sm" className="w-full justify-start">
                    <Link href="/login">
                    Sign In
                    </Link>
                  </Button>
                <Button asChild size="sm" className="w-full">
                    <Link href="/login?mode=register">
                    Start free trial
                    </Link>
                  </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
