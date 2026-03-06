/**
 * Footer Component - Terminal Noir Design
 * Professional footer with contact info and copyright
 */

import { Link } from "wouter";
import { Truck, Mail, Phone } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-card/30">
      <div className="container py-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          {/* Logo & Copyright */}
          <div className="flex flex-col items-center md:items-start gap-4">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
                  <Truck className="w-4 h-4 text-primary" />
                </div>
                <span className="font-bold text-lg tracking-tight">MOVIDO</span>
              </div>
            </Link>
            <p className="text-sm text-muted-foreground">
              © 2026 Movido Logistics Ltd. Northampton, UK.
            </p>
          </div>

          {/* Contact Info */}
          <div className="flex flex-col sm:flex-row gap-6 text-sm">
            <a 
              href="mailto:movidologistics@gmail.com" 
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Mail className="w-4 h-4 text-primary" />
              <span>movidologistics@gmail.com</span>
            </a>
            <a 
              href="tel:07446377863" 
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Phone className="w-4 h-4 text-primary" />
              <span>07446 377 863</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
