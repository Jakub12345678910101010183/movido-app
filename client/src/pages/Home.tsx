/**
 * Movido Landing Page - Terminal Noir Design
 * Bloomberg-inspired dark interface with cyan accents
 * High-density professional fleet management aesthetic
 */

import { useAuthContext } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Truck,
  MapPin,
  Zap,
  Shield,
  Clock,
  Bell,
  FileCheck,
  ArrowRight,
  Globe,
  ChevronRight,
  Smartphone,
  Camera,
  Navigation,
  Fuel,
  CheckCircle2,
  Download,
  MessageSquare,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AIRouteDemo from "@/components/AIRouteDemo";

// Product facts only — no performance or savings claims.
const stats = [
  { value: "14 days", label: "Free trial" },
  { value: "£19", label: "Per vehicle / month, from" },
  { value: "~15 s", label: "Driver position updates" },
  { value: "0", label: "Apps to install" },
];

const features = [
  {
    icon: MapPin,
    title: "Live Driver Tracking",
    description: "Drivers share their phone's GPS from the MOViDO driver screen. Positions update about every 15 seconds on your dispatch map while sharing is on."
  },
  {
    icon: Zap,
    title: "Route Planner",
    description: "Orders your stops for the shortest drive, then calculates a truck route with TomTom using live traffic and your vehicle's height and weight."
  },
  {
    icon: Shield,
    title: "Arrival & Departure Detection",
    description: "MOViDO records when a driver arrives at or leaves a pickup, stop or delivery point, using the positions their phone reports."
  },
  {
    icon: Clock,
    title: "Customer Tracking Links",
    description: "Every job gets a private tracking link. Your customer sees the delivery status and driver position — never the driver's phone number."
  },
  {
    icon: Bell,
    title: "Driver Messaging",
    description: "Two-way messages between dispatch and each driver, plus broadcasts to the whole fleet."
  },
  {
    icon: FileCheck,
    title: "Digital POD",
    description: "Drivers capture a photo, the recipient's signature and name. Stored privately for your company and viewable by dispatch."
  },
];

const steps = [
  {
    number: "01",
    title: "Add Your Fleet",
    description: "Create your company, add vehicles and drivers, and invite drivers by email."
  },
  {
    number: "02",
    title: "Create Jobs",
    description: "Enter pickup, stops and delivery, assign a driver, and plan the route."
  },
  {
    number: "03",
    title: "Track & Deliver",
    description: "Drivers work through stops on their phone and finish with a photo and signature. You follow along on the map."
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-terminal">
      <Navbar />
      
      {/* Hero Section with Background Image */}
      <section className="relative pt-32 pb-20 overflow-hidden min-h-[90vh] flex items-center">
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/images/hero-fleet.jpg)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/75 via-background/50 to-background/80" />
        <div className="absolute inset-0 grid-pattern opacity-30" />
        
        <div className="container relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-8 rounded-full border border-primary/30 bg-primary/5 backdrop-blur-sm">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Dispatch software for UK haulage</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
              <span className="text-foreground">Dispatch Center for </span>
              <span className="text-cyan">Modern Logistics</span>
            </h1>
            
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Plan jobs, dispatch drivers, follow them live on the map and collect proof of delivery — in one web app for your office and your drivers' phones.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="glow-cyan-sm group">
                  <Link href="/login?mode=register">
                  Start Free Trial
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              <Button asChild size="lg" variant="outline" className="border-border hover:border-primary/50 hover:bg-primary/5">
                  <a href="#how-it-works">
                  See how it works
                  </a>
                </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-border bg-card/50">
        <div className="container py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="stat-value animate-count">{stat.value}</div>
                <div className="data-label mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dashboard Preview Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full border border-primary/30 bg-primary/5">
                <Globe className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">Dispatch Center</span>
              </div>
              <h2 className="text-4xl font-bold mb-6">Your whole operation on one screen</h2>
              <p className="text-muted-foreground text-lg mb-8">
                Jobs, drivers and vehicles side by side with a live map, so dispatchers see what is happening without switching tools.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ChevronRight className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Live map</p>
                    <p className="text-sm text-muted-foreground">Driver positions with the time of the last update, plus TomTom traffic</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ChevronRight className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Truck routing</p>
                    <p className="text-sm text-muted-foreground">TomTom truck routes using vehicle height and weight, with UK Clean Air Zones marked</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ChevronRight className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Arrivals and departures</p>
                    <p className="text-sm text-muted-foreground">Recorded automatically at each pickup, stop and delivery from the driver's shared position</p>
                  </div>
                </li>
              </ul>
              <div className="mt-8">
                <Button asChild className="glow-cyan-sm group">
                    <Link href="/pricing">
                    Start your free trial
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
              </div>
            </div>
            <figure className="relative">
              <div className="absolute -inset-4 bg-primary/10 rounded-2xl blur-xl" aria-hidden="true" />
              <div className="relative card-terminal overflow-hidden shadow-2xl" aria-hidden="true">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <span className="text-sm font-semibold">Dispatch Center</span>
                  <span className="flex items-center gap-1.5 text-xs text-green-500"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Live</span>
                </div>
                <div className="grid sm:grid-cols-[1fr_1.1fr]">
                  <div className="p-3 space-y-2 border-b sm:border-b-0 sm:border-r border-border">
                    {[
                      { ref: "JOB-2026-014", route: "Northampton → Leicester", status: "In progress", tone: "text-green-500", stops: "2/4 stops" },
                      { ref: "JOB-2026-015", route: "Wellingborough → Kettering", status: "Assigned", tone: "text-blue-400", stops: "0/3 stops" },
                      { ref: "JOB-2026-013", route: "Daventry → Milton Keynes", status: "Delivered", tone: "text-muted-foreground", stops: "POD signed" },
                    ].map((j) => (
                      <div key={j.ref} className="rounded-lg border border-border bg-muted/20 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-primary">{j.ref}</span>
                          <span className={`text-[11px] ${j.tone}`}>{j.status}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate">{j.route}</p>
                        <p className="text-[11px] text-muted-foreground/80 mt-0.5">{j.stops}</p>
                      </div>
                    ))}
                  </div>
                  <div className="relative min-h-[220px] bg-[#0d1117]">
                    <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "repeating-linear-gradient(0deg, #00FFD420 0px, transparent 1px, transparent 24px), repeating-linear-gradient(90deg, #00FFD420 0px, transparent 1px, transparent 24px)" }} />
                    <svg viewBox="0 0 200 160" className="absolute inset-0 w-full h-full">
                      <path d="M30 130 C 60 100, 80 110, 100 80 S 150 40, 175 30" fill="none" stroke="#00FFD4" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="4 4" />
                      <circle cx="30" cy="130" r="4" fill="#22c55e" />
                      <circle cx="100" cy="80" r="4" fill="#6366f1" />
                      <circle cx="175" cy="30" r="4" fill="#f59e0b" />
                      <circle cx="72" cy="104" r="6" fill="#00FFD4" />
                    </svg>
                    <div className="absolute left-3 bottom-3 rounded-md border border-border bg-background/90 px-2 py-1">
                      <p className="text-[11px] font-medium">HGV-07 · Sam</p>
                      <p className="text-[10px] text-muted-foreground">Updated 1 min ago</p>
                    </div>
                  </div>
                </div>
              </div>
              <figcaption className="relative mt-3 text-center text-xs text-muted-foreground">Illustration of the dispatch screen</figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-card/30" id="features">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Everything You Need to Manage Your Fleet</h2>
            <p className="text-muted-foreground text-lg">The tools a transport office uses every day, in one place</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="card-terminal p-6 hover:border-primary/30 transition-all duration-300 group"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:glow-cyan-sm transition-all">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Route Demo Section */}
      <AIRouteDemo />

      {/* Truck Image Section */}
      <section className="py-24 relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/images/truck-route.jpg)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-transparent" />
        
        <div className="container relative">
          <div className="max-w-xl">
            <h2 className="text-4xl font-bold mb-6">Built for British Roads</h2>
            <p className="text-muted-foreground text-lg mb-8">
              Based in Northampton, MOViDO is built for UK operators: miles by default, UK time, truck routing through TomTom with your vehicle's height and weight, UK Clean Air Zones marked on the map, and working-time hours recorded per driver.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="card-terminal p-4">
                <p className="text-2xl font-mono font-bold text-cyan">Up to 44t</p>
                <p className="text-sm text-muted-foreground">Vehicle weight in truck routing</p>
              </div>
              <div className="card-terminal p-4">
                <p className="text-2xl font-mono font-bold text-cyan">8</p>
                <p className="text-sm text-muted-foreground">UK Clean Air Zones marked</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 bg-card/30" id="how-it-works">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">How Movido Works</h2>
            <p className="text-muted-foreground text-lg">From sign-up to your first delivery</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {steps.map((step, index) => (
              <div key={index} className="text-center relative">
                <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center mx-auto mb-6 glow-cyan">
                  <span className="font-mono font-bold text-primary-foreground">{step.number}</span>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-px bg-gradient-to-r from-primary/50 to-transparent" />
                )}
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Driver App Section */}
      <section className="py-24 relative overflow-hidden" id="driver-app">
        <div className="absolute inset-0 grid-pattern opacity-20" />
        <div className="container relative">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left — Text */}
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full border border-primary/30 bg-primary/5">
                <Smartphone className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">Driver screen</span>
              </div>
              <h2 className="text-4xl font-bold mb-6">
                Everything your drivers need, in their phone's browser
              </h2>
              <p className="text-muted-foreground text-lg mb-8">
                Drivers sign in at movidologistics.uk/driver — no app store, no install. They see their jobs, work through stops and capture proof of delivery.
              </p>

              <ul className="space-y-4 mb-10">
                {[
                  { icon: Navigation, text: "One tap opens the route in the phone's maps app" },
                  { icon: Camera, text: "Proof of delivery — photo, signature and recipient name" },
                  { icon: MapPin, text: "Location sharing while the MOViDO screen is open (phones pause it when the screen is off)" },
                  { icon: Fuel, text: "Fuel fills and incident reports straight from the cab" },
                  { icon: MessageSquare, text: "Messages with dispatch" },
                  { icon: CheckCircle2, text: "Retries automatically when the signal drops" },
                ].map(({ icon: Icon, text }, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
                  </li>
                ))}
              </ul>

              {/* Download Buttons */}
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-3 px-5 py-3 rounded-xl border border-border bg-card/60 cursor-not-allowed opacity-70">
                  <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current text-foreground" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  <div>
                    <p className="text-xs text-muted-foreground leading-none mb-0.5">Coming Soon</p>
                    <p className="text-sm font-semibold leading-none">App Store</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-5 py-3 rounded-xl border border-border bg-card/60 cursor-not-allowed opacity-70">
                  <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3.18 23.76c.3.17.64.22.97.15L13.64 12 3.56.27c-.46.08-.8.44-.8.93v21.6c0 .38.16.73.42.96zM16.72 8.9L5.67.14 17.4 6.8l-0.68 2.1zM20.04 10.5c.39.22.63.63.63 1.07 0 .44-.24.84-.62 1.06l-2.45 1.4-2.2-2.45 2.2-2.45 2.44 1.37zM5.67 23.86l11.05-8.77-1.72-1.9-9.33 10.67z" fill="#00C853"/>
                  </svg>
                  <div>
                    <p className="text-xs text-muted-foreground leading-none mb-0.5">Coming Soon</p>
                    <p className="text-sm font-semibold leading-none">Google Play</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                <Download className="w-3 h-3" />
                Drivers use MOViDO in their phone's browser today at movidologistics.uk/driver — no install needed
              </p>
            </div>

            {/* Right — Phone Mockup */}
            <div className="flex justify-center lg:justify-end">
              <div className="relative">
                {/* Glow */}
                <div className="absolute -inset-8 bg-primary/10 rounded-3xl blur-2xl" />

                {/* Phone shell */}
                <div className="relative w-64 bg-[#0a0a0f] rounded-[2.5rem] border-4 border-[#1a1a2e] shadow-2xl overflow-hidden" style={{ height: 520 }}>
                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-[#0a0a0f] rounded-b-2xl z-10 border-b-4 border-[#1a1a2e]" />

                  {/* Screen content */}
                  <div className="pt-10 px-4 pb-4 h-full flex flex-col bg-[#0a0a0f]">
                    {/* Top bar */}
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] text-[#00FFD4] font-mono">MOVIDO</span>
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                        <div className="w-2 h-2 rounded-full bg-[#00FFD4]" />
                      </div>
                    </div>

                    {/* Job card */}
                    <div className="bg-[#111118] rounded-xl p-3 border border-[#1a1a24] mb-3">
                      <div className="text-[9px] text-[#666] uppercase tracking-wider mb-1">Current Job</div>
                      <div className="text-[12px] font-bold text-white">JOB-2026-014</div>
                      <div className="text-[10px] text-[#aaa] mt-1">Northampton → Leicester</div>
                      <div className="flex items-center gap-1 mt-2">
                        <div className="flex-1 h-1 bg-[#1a1a24] rounded-full">
                          <div className="w-3/4 h-1 bg-[#00FFD4] rounded-full" />
                        </div>
                        <span className="text-[9px] text-[#00FFD4] font-mono">3/4 stops</span>
                      </div>
                    </div>

                    {/* Map placeholder */}
                    <div className="flex-1 bg-[#0d1117] rounded-xl border border-[#1a1a24] flex items-center justify-center mb-3 relative overflow-hidden">
                      <div className="absolute inset-0 opacity-20" style={{
                        backgroundImage: 'repeating-linear-gradient(0deg, #00FFD420 0px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, #00FFD420 0px, transparent 1px, transparent 20px)'
                      }} />
                      <div className="relative flex flex-col items-center gap-1">
                        <Navigation className="w-6 h-6 text-[#00FFD4]" />
                        <span className="text-[9px] text-[#00FFD4] font-mono">NEXT STOP</span>
                        <span className="text-[8px] text-[#666]">Tap to navigate</span>
                      </div>
                      {/* Route line */}
                      <div className="absolute bottom-4 left-6 right-6 h-px bg-[#00FFD4] opacity-40" />
                      <div className="absolute bottom-3 right-5 w-2 h-2 rounded-full bg-[#EF4444]" />
                    </div>

                    {/* Action buttons */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { icon: "📷", label: "POD" },
                        { icon: "⛽", label: "Fuel" },
                        { icon: "💬", label: "Messages" },
                      ].map((btn) => (
                        <div key={btn.label} className="bg-[#111118] rounded-lg p-2 text-center border border-[#1a1a24]">
                          <div className="text-sm mb-1">{btn.icon}</div>
                          <div className="text-[9px] text-[#666]">{btn.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* HGV Badge */}
                <div className="absolute -right-4 top-56 bg-[#111118] border border-[#00FFD430] rounded-xl px-3 py-2 shadow-lg">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-[#00FFD4]" />
                    <div>
                      <p className="text-[10px] text-[#00FFD4] font-mono font-bold">Live location</p>
                      <p className="text-[9px] text-[#666]">Shared with dispatch</p>
                    </div>
                  </div>
                </div>

                {/* POD Badge */}
                <div className="absolute -left-4 bottom-32 bg-[#111118] border border-[#22C55E30] rounded-xl px-3 py-2 shadow-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                    <div>
                      <p className="text-[10px] text-[#22C55E] font-mono font-bold">POD Signed</p>
                      <p className="text-[9px] text-[#666]">Digital signature</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 grid-pattern opacity-30" />
        <div className="container relative">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl font-bold mb-4">Try MOViDO with your own fleet</h2>
            <p className="text-muted-foreground text-lg mb-8">
              Create your company account and run real jobs free for 14 days.
            </p>
            <Button asChild size="lg" className="glow-cyan group">
                <Link href="/login?mode=register">
                Start Free Trial
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
