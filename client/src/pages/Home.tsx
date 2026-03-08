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
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AIRouteDemo from "@/components/AIRouteDemo";

const stats = [
  { value: "99.9%", label: "Uptime" },
  { value: "< 2s", label: "Location Update" },
  { value: "15%", label: "Fuel Savings" },
  { value: "24/7", label: "Support" },
];

const features = [
  {
    icon: MapPin,
    title: "Live Fleet Tracking",
    description: "Real-time GPS tracking with TomTom integration. Monitor all vehicles on a single dashboard with instant location updates."
  },
  {
    icon: Zap,
    title: "AI Route Optimizer",
    description: "Intelligent route planning that considers vehicle constraints, traffic, and delivery windows to minimize empty miles."
  },
  {
    icon: Shield,
    title: "Safety Alerts",
    description: "Automatic low bridge and narrow street warnings. Protect your fleet from costly accidents with proactive alerts."
  },
  {
    icon: Clock,
    title: "Predictive ETA",
    description: "Machine learning-powered arrival predictions that learn from historical data and real-time conditions."
  },
  {
    icon: Bell,
    title: "Real-time Notifications",
    description: "Instant alerts for route changes, delays, and delivery completions. Keep customers informed automatically."
  },
  {
    icon: FileCheck,
    title: "Digital POD",
    description: "Electronic proof of delivery with signature capture, photos, and GPS verification for complete accountability."
  },
];

const steps = [
  {
    number: "01",
    title: "Add Your Fleet",
    description: "Register your vehicles with their specifications including height, weight, and type constraints."
  },
  {
    number: "02",
    title: "Create Jobs",
    description: "Enter delivery details and let our AI optimize routes automatically based on all constraints."
  },
  {
    number: "03",
    title: "Track & Deliver",
    description: "Monitor progress in real-time, receive alerts, and collect digital proof of delivery."
  },
];

export default function Home() {
  // Auth is available if needed for protected features
  // const { user, isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-terminal">
      <Navbar />
      
      {/* Hero Section with Background Image */}
      <section className="relative pt-32 pb-20 overflow-hidden min-h-[90vh] flex items-center">
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(https://images.pexels.com/photos/2199293/pexels-photo-2199293.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/75 via-background/50 to-background/80" />
        <div className="absolute inset-0 grid-pattern opacity-30" />
        
        <div className="container relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-8 rounded-full border border-primary/30 bg-primary/5 backdrop-blur-sm">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">AI-Powered Fleet Management</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
              <span className="text-foreground">Dispatch Center for </span>
              <span className="text-cyan">Modern Logistics</span>
            </h1>
            
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Professional fleet management platform with real-time tracking, AI route optimization, and predictive ETA. Built for dispatchers who demand precision.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/pricing">
                <Button size="lg" className="glow-cyan-sm group">
                  Start Free Trial
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button size="lg" variant="outline" className="border-border hover:border-primary/50 hover:bg-primary/5">
                  View Dashboard Demo
                </Button>
              </Link>
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
                <span className="text-sm font-medium text-primary">Bloomberg-Inspired Interface</span>
              </div>
              <h2 className="text-4xl font-bold mb-6">Professional Dispatch Center</h2>
              <p className="text-muted-foreground text-lg mb-8">
                Our high-density interface is designed for professional dispatchers who need to monitor multiple data points simultaneously. Inspired by trading terminals, every pixel is optimized for efficiency.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ChevronRight className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Real-time Fleet Visualization</p>
                    <p className="text-sm text-muted-foreground">Track all vehicles on an interactive map with live position updates</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ChevronRight className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">HGV-Specific Layers</p>
                    <p className="text-sm text-muted-foreground">Low bridge alerts, weight restrictions, and Clean Air Zone overlays</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ChevronRight className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Live Driver Tracking</p>
                    <p className="text-sm text-muted-foreground">Real-time GPS positions, speed, heading and automatic geofence arrival alerts</p>
                  </div>
                </li>
              </ul>
              <div className="mt-8">
                <Link href="/dashboard">
                  <Button className="glow-cyan-sm group">
                    Try Dashboard Demo
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-primary/10 rounded-2xl blur-xl" />
              <img 
                src="/images/dashboard-preview.jpg" 
                alt="Movido Dispatch Center Dashboard" 
                className="relative rounded-xl border border-border shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-card/30" id="features">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Everything You Need to Manage Your Fleet</h2>
            <p className="text-muted-foreground text-lg">Professional-grade tools designed for high-volume logistics operations</p>
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
          style={{ backgroundImage: 'url(https://images.pexels.com/photos/3642618/pexels-photo-3642618.jpeg?auto=compress&cs=tinysrgb&w=1920&h=800&fit=crop)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-transparent" />
        
        <div className="container relative">
          <div className="max-w-xl">
            <h2 className="text-4xl font-bold mb-6">Built for British Roads</h2>
            <p className="text-muted-foreground text-lg mb-8">
              Based in Northampton Ã¢ÂÂ the heart of UK logistics Ã¢ÂÂ Movido is built for British roads. Our platform handles HGV-specific routing, low bridge warnings, weight restrictions, Clean Air Zones, and DVSA compliance. From the M1 corridor to nationwide distribution, we understand UK transport.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="card-terminal p-4">
                <p className="text-2xl font-mono font-bold text-cyan">3.5t - 44t</p>
                <p className="text-sm text-muted-foreground">Vehicle Weight Support</p>
              </div>
              <div className="card-terminal p-4">
                <p className="text-2xl font-mono font-bold text-cyan">UK Wide</p>
                <p className="text-sm text-muted-foreground">Low Bridge Database</p>
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
            <p className="text-muted-foreground text-lg">Get started in minutes with our streamlined workflow</p>
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
            {/* Left Ã¢ÂÂ Text */}
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full border border-primary/30 bg-primary/5">
                <Smartphone className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">Movido Driver App</span>
              </div>
              <h2 className="text-4xl font-bold mb-6">
                Everything Your Drivers Need Ã¢ÂÂ In Their Pocket
              </h2>
              <p className="text-muted-foreground text-lg mb-8">
                The Movido Driver App puts professional-grade logistics tools right in your drivers' hands. HGV-aware navigation, digital POD capture, fuel logging, and real-time job updates Ã¢ÂÂ all offline-capable.
              </p>

              <ul className="space-y-4 mb-10">
                {[
                  { icon: Navigation, text: "HGV Navigation via TomTom Ã¢ÂÂ truck-safe routes with bridge & weight alerts" },
                  { icon: Camera, text: "Digital POD Ã¢ÂÂ photo capture + customer signature, no paperwork" },
                  { icon: Clock, text: "WTD Hours tracker Ã¢ÂÂ EU driving regulations built-in" },
                  { icon: Fuel, text: "Fuel log Ã¢ÂÂ record every stop with GPS location auto-fill" },
                  { icon: Bell, text: "Push notifications Ã¢ÂÂ instant job assignments & status updates" },
                  { icon: CheckCircle2, text: "Offline-capable Ã¢ÂÂ works in areas with poor signal" },
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
                Available as an Expo/React Native build for beta testers Ã¢ÂÂ contact us to join
              </p>
            </div>

            {/* Right Ã¢ÂÂ Phone Mockup */}
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
                      <div className="text-[12px] font-bold text-white">MV-2847</div>
                      <div className="text-[10px] text-[#aaa] mt-1">Northampton Ã¢ÂÂ Leicester</div>
                      <div className="flex items-center gap-1 mt-2">
                        <div className="flex-1 h-1 bg-[#1a1a24] rounded-full">
                          <div className="w-3/4 h-1 bg-[#00FFD4] rounded-full" />
                        </div>
                        <span className="text-[9px] text-[#00FFD4] font-mono">75%</span>
                      </div>
                    </div>

                    {/* Map placeholder */}
                    <div className="flex-1 bg-[#0d1117] rounded-xl border border-[#1a1a24] flex items-center justify-center mb-3 relative overflow-hidden">
                      <div className="absolute inset-0 opacity-20" style={{
                        backgroundImage: 'repeating-linear-gradient(0deg, #00FFD420 0px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, #00FFD420 0px, transparent 1px, transparent 20px)'
                      }} />
                      <div className="relative flex flex-col items-center gap-1">
                        <Navigation className="w-6 h-6 text-[#00FFD4]" />
                        <span className="text-[9px] text-[#00FFD4] font-mono">HGV ROUTE</span>
                        <span className="text-[8px] text-[#666]">TomTom Navigation</span>
                      </div>
                      {/* Route line */}
                      <div className="absolute bottom-4 left-6 right-6 h-px bg-[#00FFD4] opacity-40" />
                      <div className="absolute bottom-3 right-5 w-2 h-2 rounded-full bg-[#EF4444]" />
                    </div>

                    {/* Action buttons */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { icon: "Ã°ÂÂÂ·", label: "POD" },
                        { icon: "Ã¢ÂÂ½", label: "Fuel" },
                        { icon: "Ã°ÂÂÂ¡Ã¯Â¸Â", label: "WTD" },
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
                <div className="absolute -right-4 top-24 bg-[#111118] border border-[#00FFD430] rounded-xl px-3 py-2 shadow-lg">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-[#00FFD4]" />
                    <div>
                      <p className="text-[10px] text-[#00FFD4] font-mono font-bold">HGV Safe</p>
                      <p className="text-[9px] text-[#666]">TomTom routing</p>
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
            <img 
              src="/images/ai-optimization.jpg" 
              alt="AI Route Optimization" 
              className="w-48 h-48 mx-auto mb-8 rounded-xl border border-primary/30"
            />
            <h2 className="text-4xl font-bold mb-4">Ready to Optimize Your Fleet?</h2>
            <p className="text-muted-foreground text-lg mb-8">
              Join logistics companies that trust Movido for their dispatch operations. Start your free trial today.
            </p>
            <Link href="/pricing">
              <Button size="lg" className="glow-cyan group">
                Start Free Trial
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
