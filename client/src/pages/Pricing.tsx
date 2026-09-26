/**
 * Pricing Page - Terminal Noir Design
 * Includes ROI Calculator widget
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Link, useLocation } from "wouter"
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { 
  Check, 
  Globe, 
  Zap,
  Building2,
  Calculator,
  TrendingUp,
  Fuel,
  Clock,
  PoundSterling,
  Mail,
  Phone,
  MapPin,
  Truck
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const plans = [
  {
    name: "Starter",
    description: "Digital dispatch for small fleets",
    price: 19,
    icon: Truck,
    stripePriceMonthly: import.meta.env.VITE_STRIPE_PRICE_STARTER_MONTHLY as string,
    stripePriceAnnual: import.meta.env.VITE_STRIPE_PRICE_STARTER_ANNUAL as string,
    features: [
      "Jobs with multiple stops and dispatch",
      "Live driver map",
      "Driver screen in the phone's browser",
      "Proof of delivery (photo + signature)",
      "Customer tracking links",
      "Email support",
    ],
  },
  {
    name: "Professional",
    description: "Planning and reporting for growing operations",
    price: 35,
    icon: Zap,
    popular: true,
    stripePriceMonthly: import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY as string,
    stripePriceAnnual: import.meta.env.VITE_STRIPE_PRICE_PRO_ANNUAL as string,
    features: [
      "Everything in Starter, plus:",
      "Route planner with TomTom truck routing and live traffic",
      "Automatic arrival and departure records",
      "Analytics, reports and CSV export",
      "Incidents, fuel logs and maintenance",
      "Document scanner",
      "Priority email support",
    ],
  },
  {
    name: "Enterprise",
    description: "For larger fleets with specific requirements",
    price: null,
    icon: Building2,
    features: [
      "Everything in Professional, plus:",
      "Volume pricing",
      "Help moving your data in",
      "Integrations quoted on request",
      "Support terms agreed with you",
    ],
  },
];

const faqs = [
  {
    question: "How is pricing calculated?",
    answer: "Pricing is per vehicle per month. At checkout the quantity starts at the number of vehicles in your account, and you can adjust it."
  },
  {
    question: "Can I change plans later?",
    answer: "Yes. Contact us and we will move your subscription to the plan you need."
  },
  {
    question: "Is there a free trial?",
    answer: "Yes. Every new company account gets a 14-day free trial with all features. No card is needed to start — you subscribe when you are ready."
  },
  {
    question: "Do you support UK-specific requirements?",
    answer: "MOViDO uses miles and UK time, calculates truck routes with TomTom using your vehicle's height and weight, marks UK Clean Air Zones, and records working-time hours per driver. It is not a tachograph and does not replace your legal records."
  },
];

export default function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { session } = useAuth();

  // Stripe Checkout — redirects to Stripe-hosted payment page
  const handleCheckout = async (plan: typeof plans[0]) => {
    if (!plan.price) {
      window.location.href = "mailto:movidologistics@gmail.com?subject=Enterprise%20Plan%20Enquiry";
      return;
    }

    // Require authentication before checkout
        if (!session) {
      setLocation("/login?redirect=/pricing");
      return;
    }

    const priceId = isAnnual ? plan.stripePriceAnnual : plan.stripePriceMonthly;
    if (!priceId) {
      toast.error("Online checkout is not available for this plan yet — please contact sales.");
      return;
    }

    setLoadingPlan(plan.name);

    try {
      // The function binds the subscription to the caller's organisation and
      // fixes the success/cancel URLs server-side.
      const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(
        "create-checkout-session",
        { body: { priceId } },
      );
      if (error || !data?.url) {
        let code = data?.error;
        const context = (error as { context?: Response } | null)?.context;
        if (!code && context && typeof context.json === "function") {
          code = await context.json().then((b: { error?: string }) => b.error).catch(() => undefined);
        }
        toast.error(
          code === "ADMIN_ONLY"
            ? "Only your company's administrator can start a subscription."
            : code === "BILLING_NOT_CONFIGURED" || code === "PRICE_UNAVAILABLE" || code === "PRICE_INACTIVE"
              ? "Online checkout is temporarily unavailable — please contact sales."
              : "Checkout could not be started. Please try again.",
        );
        return;
      }
      window.location.href = data.url;
    } finally {
      setLoadingPlan(null);
    }
  };
  
  // ROI Calculator state
  const [fleetSize, setFleetSize] = useState(10);
  const [avgMilesPerDay, setAvgMilesPerDay] = useState(150);
  const [fuelCostPerMile, setFuelCostPerMile] = useState(1.05);
  const [dispatchHoursPerDay, setDispatchHoursPerDay] = useState(4);
  const [hourlyDispatchCost, setHourlyDispatchCost] = useState(18);
  const [fuelSavingPct, setFuelSavingPct] = useState(5);
  const [timeSavingPct, setTimeSavingPct] = useState(10);

  // ROI Calculations
  // The visitor's own estimates — MOViDO makes no savings claim.
  const fuelSavingsPercent = fuelSavingPct / 100;
  const timeSavingsPercent = timeSavingPct / 100;
  
  const monthlyFuelCost = fleetSize * avgMilesPerDay * fuelCostPerMile * 22; // 22 working days
  const monthlyFuelSavings = monthlyFuelCost * fuelSavingsPercent;
  
  const monthlyDispatchCost = dispatchHoursPerDay * hourlyDispatchCost * 22;
  const monthlyTimeSavings = monthlyDispatchCost * timeSavingsPercent;
  
  const subscriptionCost = fleetSize * 35; // Professional plan
  const netMonthlySavings = monthlyFuelSavings + monthlyTimeSavings - subscriptionCost;
  const annualSavings = netMonthlySavings * 12;
  const roi = subscriptionCost > 0 ? ((netMonthlySavings / subscriptionCost) * 100) : 0;

  return (
    <div className="min-h-screen bg-terminal">
      <Navbar />
      
      {/* Hero */}
      <section className="pt-32 pb-16 relative">
        <div className="absolute inset-0 grid-pattern opacity-50" />
        <div className="container relative">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full border border-primary/30 bg-primary/5">
              <Globe className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Built for UK fleets</span>
            </div>
            <h1 className="text-5xl font-bold mb-4">Simple, Transparent Pricing</h1>
            <p className="text-xl text-muted-foreground mb-8">
              Per vehicle, per month. Start with a 14-day free trial.
            </p>
            
            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-4 mt-8">
              <span className={`text-sm ${!isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>Monthly</span>
              <Switch checked={isAnnual} onCheckedChange={setIsAnnual} aria-label="Annual billing" />
              <span className={`text-sm ${isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>Annual</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-24">
        <div className="container">
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {plans.map((plan, index) => (
              <div 
                key={index}
                className={`card-terminal p-6 relative ${
                  plan.popular ? 'border-primary/50 glow-cyan-sm' : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                    BEST VALUE
                  </div>
                )}
                
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <plan.icon className="w-6 h-6 text-primary" />
                </div>
                
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mb-6">{plan.description}</p>
                
                <div className="mb-6">
                  {plan.price ? (
                    <>
                      <span className="text-4xl font-bold font-mono text-cyan">£{isAnnual ? Math.round(plan.price * 0.8) : plan.price}</span>
                      <span className="text-muted-foreground">/ vehicle / month</span>
                      <p className="text-xs text-muted-foreground mt-1">
                        Billed {isAnnual ? 'annually' : 'monthly'}
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="text-4xl font-bold">Custom</span>
                      <p className="text-xs text-muted-foreground mt-1">Tailored to your needs</p>
                    </>
                  )}
                </div>
                
                <Button 
                  className={`w-full mb-6 cursor-pointer ${plan.popular ? 'glow-cyan-sm' : ''}`}
                  variant={plan.popular ? 'default' : 'outline'}
        onClick={(e) => { e.preventDefault(); handleCheckout(plan); }}                  disabled={loadingPlan === plan.name}
                
                          type="button">
                  {loadingPlan === plan.name ? 'Redirecting...' : plan.price ? 'Get Started' : 'Contact Sales'}
                </Button>
                
                <ul className="space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROI Calculator */}
      <section className="py-24 bg-card/30" id="roi-calculator">
        <div className="container">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full border border-primary/30 bg-primary/5">
              <Calculator className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">ROI Calculator</span>
            </div>
            <h2 className="text-4xl font-bold mb-4">Calculate Your Savings</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              An illustration using your own figures. Savings depend on your operation and are not guaranteed.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Inputs */}
            <div className="card-terminal p-6 space-y-6">
              <h3 className="font-semibold text-lg mb-4">Your Fleet Details</h3>
              
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm text-muted-foreground">Fleet Size</label>
                  <span className="font-mono text-primary">{fleetSize} vehicles</span>
                </div>
                <Slider
                  value={[fleetSize]}
                  onValueChange={(v) => setFleetSize(v[0])}
                  min={1}
                  max={1500}
                  step={1}
                  className="py-2"
                />
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm text-muted-foreground">Avg. Miles per Vehicle/Day</label>
                  <span className="font-mono text-primary">{avgMilesPerDay} mi</span>
                </div>
                <Slider
                  value={[avgMilesPerDay]}
                  onValueChange={(v) => setAvgMilesPerDay(v[0])}
                  min={50}
                  max={500}
                  step={10}
                  className="py-2"
                />
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm text-muted-foreground">Fuel Cost per Mile</label>
                  <span className="font-mono text-primary">£{fuelCostPerMile.toFixed(2)}</span>
                </div>
                <Slider
                  value={[fuelCostPerMile * 100]}
                  onValueChange={(v) => setFuelCostPerMile(v[0] / 100)}
                  min={30}
                  max={200}
                  step={5}
                  className="py-2"
                />
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm text-muted-foreground">Dispatch Hours per Day</label>
                  <span className="font-mono text-primary">{dispatchHoursPerDay}h</span>
                </div>
                <Slider
                  value={[dispatchHoursPerDay]}
                  onValueChange={(v) => setDispatchHoursPerDay(v[0])}
                  min={1}
                  max={12}
                  step={1}
                  className="py-2"
                />
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm text-muted-foreground">Dispatcher Hourly Rate</label>
                  <span className="font-mono text-primary">£{hourlyDispatchCost}</span>
                </div>
                <Slider
                  value={[hourlyDispatchCost]}
                  onValueChange={(v) => setHourlyDispatchCost(v[0])}
                  min={10}
                  max={40}
                  step={1}
                  className="py-2"
                />
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm text-muted-foreground">Your expected fuel saving</label>
                  <span className="font-mono text-primary">{fuelSavingPct}%</span>
                </div>
                <Slider value={[fuelSavingPct]} onValueChange={(v) => setFuelSavingPct(v[0])} min={0} max={20} step={1} className="py-2" aria-label="Expected fuel saving" />
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm text-muted-foreground">Your expected planning time saving</label>
                  <span className="font-mono text-primary">{timeSavingPct}%</span>
                </div>
                <Slider value={[timeSavingPct]} onValueChange={(v) => setTimeSavingPct(v[0])} min={0} max={50} step={1} className="py-2" aria-label="Expected planning time saving" />
              </div>
            </div>

            {/* Results */}
            <div className="space-y-6">
              <div className="card-terminal p-6">
                <h3 className="font-semibold text-lg mb-6">Illustrative monthly figures</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Fuel className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium">Fuel Savings</p>
                        <p className="text-xs text-muted-foreground">{fuelSavingPct}% of fuel cost (your estimate)</p>
                      </div>
                    </div>
                    <span className="font-mono text-lg text-green-500">+£{monthlyFuelSavings.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</span>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium">Time Savings</p>
                        <p className="text-xs text-muted-foreground">{timeSavingPct}% of planning time (your estimate)</p>
                      </div>
                    </div>
                    <span className="font-mono text-lg text-green-500">+£{monthlyTimeSavings.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</span>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <PoundSterling className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium">Subscription Cost</p>
                        <p className="text-xs text-muted-foreground">Professional plan @ £35/vehicle</p>
                      </div>
                    </div>
                    <span className="font-mono text-lg text-red-400">-£{subscriptionCost.toLocaleString('en-GB')}</span>
                  </div>
                </div>
              </div>

              <div className={`card-terminal p-6 ${netMonthlySavings > 0 ? 'border-green-500/50' : 'border-red-500/50'}`}>
                <div className="flex items-center gap-4">
                  <TrendingUp className={`w-10 h-10 ${netMonthlySavings > 0 ? 'text-green-500' : 'text-red-400'}`} />
                  <div>
                    <p className="text-sm text-muted-foreground">Net Monthly Savings</p>
                    <p className={`text-3xl font-bold font-mono ${netMonthlySavings > 0 ? 'text-green-500' : 'text-red-400'}`}>
                      £{netMonthlySavings.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">Annual Savings</p>
                    <p className="text-xl font-mono font-bold text-cyan">
                      £{annualSavings.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ROI</p>
                    <p className="text-xl font-mono font-bold text-cyan">
                      {roi.toFixed(0)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-16 border-t border-border">
        <div className="container">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">Questions? We're here to help</h2>
            <p className="text-muted-foreground">Get in touch about plans, features or a walkthrough.</p>
          </div>
          <div className="flex flex-col sm:flex-row justify-center gap-6">
            <a href="mailto:movidologistics@gmail.com" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <Mail className="w-4 h-4 text-primary" />
              <span>movidologistics@gmail.com</span>
            </a>
            <a href="tel:07446377863" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <Phone className="w-4 h-4 text-primary" />
              <span>07446 377 863</span>
            </a>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-24 bg-card/30">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">About Movido</h2>
            <p className="text-muted-foreground">Dispatch software for UK transport operators</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="card-terminal p-6">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <MapPin className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">UK-Based Operations</h3>
              <p className="text-sm text-muted-foreground">
                MOViDO is based in Northampton and built around how UK transport offices work: jobs, drivers, vehicles, proof of delivery and working-time hours in one place.
              </p>
            </div>
            
            <div className="card-terminal p-6">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Globe className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Maps and routing by TomTom</h3>
              <p className="text-sm text-muted-foreground">
                Maps, live traffic and truck routes come from TomTom. Routes take your vehicle's height and weight into account.
              </p>
            </div>
            
            <div className="card-terminal p-6 md:col-span-2 lg:col-span-1">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Office and drivers, one system</h3>
              <p className="text-sm text-muted-foreground">
                Dispatch works on a desktop; drivers use the same system in their phone's browser. Every company's data is kept separate from every other company's.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {faqs.map((faq, index) => (
              <div key={index} className="card-terminal p-6">
                <h3 className="font-semibold mb-2">{faq.question}</h3>
                <p className="text-sm text-muted-foreground">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 grid-pattern opacity-30" />
        <div className="container relative">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl font-bold mb-4">Try MOViDO with your own fleet</h2>
            <p className="text-muted-foreground text-lg mb-8">
              Start your 14-day free trial today. No card needed.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="glow-cyan w-full">
                  <Link href="/login?mode=register">
                  Start Free Trial
                  </Link>
                </Button>
              <Button size="lg" variant="outline" onClick={() => window.location.href = 'mailto:movidologistics@gmail.com?subject=Sales%20Enquiry'}>
                Contact Sales
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
