/**
 * Pricing Page - Terminal Noir Design
 * Includes ROI Calculator widget
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Link } from "wouter";
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
import { supabase } from "@/lib/supabase";

const plans = [
  {
    name: "Starter",
    description: "Perfect for small fleets getting started with digital dispatch",
    price: 19,
    icon: Truck,
    stripePriceMonthly: "price_1T4QFJ0gB9FXYr87He7OG4q2",
    stripePriceAnnual: "price_1T4QFL0gB9FXYr87umjzOVby",
    features: [
      "Live Fleet Tracking & Map",
      "Basic Job Dispatch",
      "ETA Dashboard",
      "Driver Mobile App Access",
      "Email Support",
    ],
  },
  {
    name: "Professional",
    description: "Advanced tools for growing logistics operations",
    price: 35,
    icon: Zap,
    popular: true,
    stripePriceMonthly: "price_1T4QFN0gB9FXYr87EWm1IP4e",
    stripePriceAnnual: "price_1T4QFP0gB9FXYr87xoe5Q76D",
    features: [
      "Everything in Starter, plus:",
      "AI Route Optimizer with TomTom Navigation",
      "Low Bridge Alerts & Vehicle Constraints (3.5t - 44t)",
      "Digital POD (Proof of Delivery)",
      "One-tap Driver Check-in",
      "Predictive ETA with Traffic",
      "Priority Support",
    ],
  },
  {
    name: "Enterprise",
    description: "Custom solutions for large-scale fleet operations",
    price: null,
    icon: Building2,
    features: [
      "Everything in Professional, plus:",
      "Customer Tracking Portal",
      "Advanced Fuel & Cost Analytics",
      "24/7 Technical Support",
      "Unlimited Route History",
      "Custom Integrations",
      "Dedicated Account Manager",
    ],
  },
];

const faqs = [
  {
    question: "How is pricing calculated?",
    answer: "Pricing is per vehicle in your active fleet. You only pay for vehicles that are actively tracked and dispatched."
  },
  {
    question: "Can I switch plans anytime?",
    answer: "Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle."
  },
  {
    question: "Is there a free trial?",
    answer: "Yes, all plans come with a 14-day free trial. No credit card required to start."
  },
  {
    question: "Do you support UK-specific requirements?",
    answer: "Absolutely. Our platform is optimised for British roads, including low bridge alerts, weight restrictions, and compliance with UK transport regulations."
  },
];

export default function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);

  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  // Handle plan selection — call Stripe Edge Function for paid plans, mailto for enterprise
  const handleCheckout = useCallback(async (plan: typeof plans[0]) => {
    if (!plan.price) {
      window.location.href = "mailto:movidologistics@gmail.com?subject=Enterprise%20Plan%20Enquiry%20-%20Movido%20Logistics";
      return;
    }

    // Check if user is logged in
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // Not logged in — redirect to login first
      window.location.href = "/login?redirect=pricing";
      return;
    }

    setCheckoutLoading(plan.name);
    try {
      const priceId = isAnnual ? plan.stripePriceAnnual : plan.stripePriceMonthly;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            priceId,
            customerEmail: session.user.email,
            successUrl: `${window.location.origin}/dashboard?checkout=success`,
            cancelUrl: `${window.location.origin}/pricing?checkout=cancelled`,
          }),
        }
      );
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("Stripe checkout error:", data.error);
        alert("Failed to start checkout. Please try again.");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Failed to start checkout. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  }, [isAnnual]);
  
  // ROI Calculator state
  const [fleetSize, setFleetSize] = useState(10);
  const [avgMilesPerDay, setAvgMilesPerDay] = useState(150);
  const [fuelCostPerMile, setFuelCostPerMile] = useState(0.45);
  const [dispatchHoursPerDay, setDispatchHoursPerDay] = useState(4);
  const [hourlyDispatchCost, setHourlyDispatchCost] = useState(18);

  // ROI Calculations
  const fuelSavingsPercent = 0.15; // 15% fuel savings
  const timeSavingsPercent = 0.30; // 30% dispatch time savings
  
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
              <span className="text-sm font-medium text-primary">Serving fleets across the United Kingdom</span>
            </div>
            <h1 className="text-5xl font-bold mb-4">Simple, Transparent Pricing</h1>
            <p className="text-xl text-muted-foreground mb-8">
              Choose the plan that fits your fleet. Scale as you grow with no hidden fees.
            </p>
            <p className="text-primary text-sm">Personalised onboarding for fleets across the United Kingdom</p>
            
            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-4 mt-8">
              <span className={`text-sm ${!isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>Monthly</span>
              <Switch checked={isAnnual} onCheckedChange={setIsAnnual} />
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
                  className={`w-full mb-6 ${plan.popular ? 'glow-cyan-sm' : ''}`}
                  variant="default"
                  onClick={() => handleCheckout(plan)}
                  disabled={checkoutLoading === plan.name}
                >
                  {checkoutLoading === plan.name ? 'Redirecting...' : (plan.price ? 'Get Started' : 'Contact Sales')}
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
              See how much you could save with Movido's AI-powered route optimization
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
                  max={100}
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
                  min={20}
                  max={100}
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
            </div>

            {/* Results */}
            <div className="space-y-6">
              <div className="card-terminal p-6">
                <h3 className="font-semibold text-lg mb-6">Monthly Savings Breakdown</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Fuel className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium">Fuel Savings</p>
                        <p className="text-xs text-muted-foreground">15% reduction in fuel costs</p>
                      </div>
                    </div>
                    <span className="font-mono text-lg text-green-500">+£{monthlyFuelSavings.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</span>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium">Time Savings</p>
                        <p className="text-xs text-muted-foreground">30% faster dispatch planning</p>
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
            <p className="text-muted-foreground">Our UK-based team is ready to assist you with any questions about our plans or features.</p>
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
            <p className="text-muted-foreground">Next-generation fleet management for the United Kingdom</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="card-terminal p-6">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <MapPin className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">UK-Based Operations</h3>
              <p className="text-sm text-muted-foreground">
                Located in the heart of British logistics, Movido is a next-generation AI platform serving fleets across the United Kingdom. Our central location gives us unique insight into the challenges facing UK transport operators.
              </p>
            </div>
            
            <div className="card-terminal p-6">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Globe className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">TomTom Partnership</h3>
              <p className="text-sm text-muted-foreground">
                Powered by TomTom's industry-leading navigation technology, our platform delivers accurate routing optimised for British roads, regulations, and vehicle restrictions including low bridges and weight limits.
              </p>
            </div>
            
            <div className="card-terminal p-6 md:col-span-2 lg:col-span-1">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Bloomberg-Inspired Interface</h3>
              <p className="text-sm text-muted-foreground">
                Our dispatcher interface is inspired by professional trading terminals, delivering high-density information displays that allow operators to monitor multiple data points simultaneously. Built for dispatchers who demand precision and efficiency.
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
            <h2 className="text-4xl font-bold mb-4">Ready to optimise your fleet?</h2>
            <p className="text-muted-foreground text-lg mb-8">
              Start your 14-day free trial today. No credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/login">
                <Button size="lg" className="glow-cyan">
                  Start Free Trial
                </Button>
              </Link>
              <a href="mailto:movidologistics@gmail.com?subject=Sales%20Enquiry%20-%20Movido%20Logistics">
                <Button size="lg" variant="outline">
                  Contact Sales
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
