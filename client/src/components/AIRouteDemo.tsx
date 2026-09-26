/**
 * AI Route Demo Component - Terminal Noir Design
 * Interactive demo: sequencing an 8-drop multi-stop route out of Northampton.
 *
 * The demo is illustrative, but its numbers are not invented: distances are
 * great-circle legs between the real coordinates below, scaled by a typical
 * UK road-to-crow-flies factor, and the "optimised" order is computed in the
 * browser (nearest neighbour + 2-opt). The product itself is not limited to
 * eight stops — this is simply the demo route.
 */

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Zap,
  MapPin,
  TrendingDown,
  Play,
  RotateCcw,
  CheckCircle2
} from "lucide-react";

type Drop = { id: number; name: string; address: string; lat: number; lng: number };

const DEPOT: Drop = {
  id: 0,
  name: "Movido Depot, Northampton",
  address: "Brackmills Industrial Estate, Northampton, NN4 7PB",
  lat: 52.2213,
  lng: -0.8573,
};

// Eight real distribution sites, listed in the order a customer sent them.
const sampleDrops: Drop[] = [
  { id: 1, name: "DHL Supply Chain, Daventry", address: "DIRFT, Daventry, NN6 7GX", lat: 52.3308, lng: -1.1805 },
  { id: 2, name: "Tesco DC, Milton Keynes", address: "Magna Park, Milton Keynes, MK17 8EW", lat: 52.0100, lng: -0.6720 },
  { id: 3, name: "Screwfix DC, Wellingborough", address: "Park Farm, Wellingborough, NN8 6UW", lat: 52.3196, lng: -0.6598 },
  { id: 4, name: "Amazon BHX4, Coventry", address: "Ansty Park, Coventry, CV7 9RE", lat: 52.4300, lng: -1.4000 },
  { id: 5, name: "Boots DC, Kettering", address: "Telford Way, Kettering, NN16 8UN", lat: 52.4080, lng: -0.7390 },
  { id: 6, name: "Asda DC, Lutterworth", address: "Magna Park, Lutterworth, LE17 4XT", lat: 52.4400, lng: -1.2300 },
  { id: 7, name: "Sainsbury's DC, Rugby", address: "Swift Valley, Rugby, CV21 1QN", lat: 52.3930, lng: -1.2650 },
  { id: 8, name: "Royal Mail, Northampton", address: "Crossley Park, Northampton, NN4 7RE", lat: 52.2240, lng: -0.8660 },
];

const ROAD_FACTOR = 1.25; // typical UK road distance vs straight line
const AVG_HGV_MPH = 45;

function legMiles(a: Drop, b: Drop): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h)) * ROAD_FACTOR;
}

/** Depot → drops in the given order → back to depot. */
function routeMiles(order: Drop[]): number {
  const path = [DEPOT, ...order, DEPOT];
  let total = 0;
  for (let i = 1; i < path.length; i++) total += legMiles(path[i - 1], path[i]);
  return total;
}

function optimise(drops: Drop[]): Drop[] {
  // Nearest neighbour from the depot…
  const remaining = [...drops];
  const order: Drop[] = [];
  let current = DEPOT;
  while (remaining.length) {
    let best = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (legMiles(current, remaining[i]) < legMiles(current, remaining[best])) best = i;
    }
    current = remaining.splice(best, 1)[0];
    order.push(current);
  }
  // …then 2-opt until no reversal shortens the tour.
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let k = i + 1; k < order.length; k++) {
        const candidate = [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)];
        if (routeMiles(candidate) + 1e-9 < routeMiles(order)) {
          order.splice(0, order.length, ...candidate);
          improved = true;
        }
      }
    }
  }
  return order;
}

function formatDuration(miles: number): string {
  const minutes = Math.round((miles / AVG_HGV_MPH) * 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export default function AIRouteDemo() {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isOptimized, setIsOptimized] = useState(false);
  const [progress, setProgress] = useState(0);
  const [optimizedOrder, setOptimizedOrder] = useState<number[]>([]);

  const optimisedRoute = useMemo(() => optimise(sampleDrops), []);
  const originalDistance = Math.round(routeMiles(sampleDrops));
  const optimizedDistance = Math.round(routeMiles(optimisedRoute));
  const originalTime = formatDuration(originalDistance);
  const optimizedTime = formatDuration(optimizedDistance);
  const savings = Math.round(((originalDistance - optimizedDistance) / originalDistance) * 100);
  const minutesSaved = Math.round(((originalDistance - optimizedDistance) / AVG_HGV_MPH) * 60);

  const runOptimization = () => {
    setIsOptimizing(true);
    setIsOptimized(false);
    setProgress(0);
    setOptimizedOrder([]);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsOptimizing(false);
          setIsOptimized(true);
          setOptimizedOrder(optimisedRoute.map((d) => d.id));
          return 100;
        }
        return prev + 5;
      });
    }, 100);
  };

  const reset = () => {
    setIsOptimizing(false);
    setIsOptimized(false);
    setProgress(0);
    setOptimizedOrder([]);
  };

  return (
    <section className="py-24 relative overflow-hidden" id="ai-demo">
      <div className="absolute inset-0 scanline pointer-events-none" />
      <div className="container relative">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full border border-primary/30 bg-primary/5">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Live AI Demo</span>
          </div>
          <h2 className="text-4xl font-bold mb-4">Route Sequencing AI</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Watch MOViDO sequence an 8-drop multi-stop route out of Northampton — distances are calculated from the real drop locations.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* Left: Drop List */}
          <div className="card-terminal p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Delivery Drops ({sampleDrops.length})
              </h3>
              <span className="text-xs text-muted-foreground font-mono">START: NORTHAMPTON</span>
            </div>
            
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {sampleDrops.map((drop, index) => {
                const optimizedIndex = optimizedOrder.indexOf(drop.id);
                const isReordered = isOptimized && optimizedIndex !== -1;
                
                return (
                  <div 
                    key={drop.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-500 ${
                      isReordered 
                        ? 'border-primary/50 bg-primary/5' 
                        : 'border-border bg-card/50'
                    }`}
                    style={{
                      order: isReordered ? optimizedIndex : index,
                    }}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm ${
                      isReordered 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {isReordered ? optimizedIndex + 1 : index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{drop.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {drop.address}
                      </p>
                    </div>
                    {isReordered && (
                      <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Results & Controls */}
          <div className="space-y-6">
            {/* Progress / Status */}
            <div className="card-terminal p-6">
              <h3 className="font-semibold mb-4">Optimization Status</h3>
              
              {!isOptimizing && !isOptimized && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-6">
                    Click to optimize the route sequence using AI
                  </p>
                  <Button onClick={runOptimization} className="glow-cyan group">
                    <Play className="w-4 h-4 mr-2" />
                    Run AI Optimization
                  </Button>
                </div>
              )}

              {isOptimizing && (
                <div className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Analyzing routes...</span>
                    <span className="font-mono text-primary">{progress}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-100 glow-cyan-sm"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-4 space-y-2 text-xs text-muted-foreground font-mono">
                    {progress > 20 && <p className="animate-pulse">→ Calculating distances between drops...</p>}
                    {progress > 50 && <p className="animate-pulse">→ Building nearest-neighbour sequence...</p>}
                    {progress > 80 && <p className="animate-pulse">→ Refining with 2-opt swaps...</p>}
                  </div>
                </div>
              )}

              {isOptimized && (
                <div className="py-4">
                  <div className="flex items-center gap-2 text-green-500 mb-4">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">Optimization Complete</span>
                  </div>
                  <Button variant="outline" onClick={reset} size="sm">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset Demo
                  </Button>
                </div>
              )}
            </div>

            {/* Metrics Comparison */}
            <div className="card-terminal p-6">
              <h3 className="font-semibold mb-4">Route Comparison</h3>
              
              <div className="grid grid-cols-2 gap-4">
                {/* Original */}
                <div className="p-4 rounded-lg bg-muted/30 border border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Original Route</p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-2xl font-mono font-bold text-muted-foreground">{originalDistance} mi</p>
                      <p className="text-xs text-muted-foreground">Total Distance</p>
                    </div>
                    <div>
                      <p className="text-lg font-mono text-muted-foreground">{originalTime}</p>
                      <p className="text-xs text-muted-foreground">Est. Drive Time</p>
                    </div>
                  </div>
                </div>

                {/* Optimized */}
                <div className={`p-4 rounded-lg border transition-all duration-500 ${
                  isOptimized 
                    ? 'bg-primary/10 border-primary/50 glow-cyan-sm' 
                    : 'bg-muted/30 border-border'
                }`}>
                  <p className="text-xs text-primary uppercase tracking-wider mb-3">Optimized Route</p>
                  <div className="space-y-3">
                    <div>
                      <p className={`text-2xl font-mono font-bold ${isOptimized ? 'text-primary' : 'text-muted-foreground'}`}>
                        {isOptimized ? optimizedDistance : '---'} mi
                      </p>
                      <p className="text-xs text-muted-foreground">Total Distance</p>
                    </div>
                    <div>
                      <p className={`text-lg font-mono ${isOptimized ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {isOptimized ? optimizedTime : '--:--'}
                      </p>
                      <p className="text-xs text-muted-foreground">Est. Drive Time</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Savings Summary */}
              {isOptimized && (
                <div className="mt-6 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                  <div className="flex items-center gap-4">
                    <TrendingDown className="w-8 h-8 text-green-500" />
                    <div>
                      <p className="text-2xl font-bold text-green-500">{savings}% Reduction</p>
                      <p className="text-sm text-muted-foreground">
                        Save {originalDistance - optimizedDistance} miles and ~{minutesSaved} minutes on this route
                        (estimated at {AVG_HGV_MPH} mph average)
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
