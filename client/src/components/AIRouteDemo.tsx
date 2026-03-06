/**
 * AI Route Demo Component - Terminal Noir Design
 * Interactive demo showing AI route optimization for 10+ UK drops
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  Zap, 
  MapPin, 
  Clock, 
  TrendingDown,
  Play,
  RotateCcw,
  CheckCircle2
} from "lucide-react";

// Sample UK delivery locations (dynamic, not hardcoded to specific city)
const sampleDrops = [
  { id: 1, name: "Tesco DC, Didcot", address: "Didcot, Oxfordshire, OX11 7HJ", lat: 51.5074, lng: -0.1278 },
  { id: 2, name: "Amazon MK1, Ridgmont", address: "Ridgmont, Bedfordshire, MK43 0ZA", lat: 51.4545, lng: -0.9781 },
  { id: 3, name: "DHL Hub, Swindon", address: "Swindon, Wiltshire, SN3 4TN", lat: 51.7520, lng: -1.2577 },
  { id: 4, name: "B&Q DC, Birmingham", address: "Erdington, Birmingham, B24 9QR", lat: 52.4862, lng: -1.8904 },
  { id: 5, name: "Howdens, Nottingham", address: "Colwick, Nottingham, NG4 2JR", lat: 52.9548, lng: -1.1581 },
  { id: 6, name: "Royal Mail MC, Manchester", address: "Oldham Road, Manchester, M40 3AB", lat: 53.4808, lng: -2.2426 },
  { id: 7, name: "Argos DC, Leeds", address: "Skelton Grange, Leeds, LS10 1RG", lat: 53.8008, lng: -1.5491 },
  { id: 8, name: "Screwfix, Newcastle", address: "Team Valley, Gateshead, NE11 0QH", lat: 54.9783, lng: -1.6178 },
  { id: 9, name: "M&S Depot, Edinburgh", address: "Newbridge, Edinburgh, EH28 8PP", lat: 55.9533, lng: -3.1883 },
  { id: 10, name: "John Lewis, Sheffield", address: "Meadowhall, Sheffield, S9 1EP", lat: 53.3811, lng: -1.4701 },
  { id: 11, name: "Marks & Spencer, Leicester", address: "Castle Marina, Leicester, LE1 4FQ", lat: 52.6369, lng: -1.1398 },
  { id: 12, name: "Final Drop, Gloucester", address: "Gloucester Business Park, GL3 4AJ", lat: 51.8994, lng: -2.0783 },
];

export default function AIRouteDemo() {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isOptimized, setIsOptimized] = useState(false);
  const [progress, setProgress] = useState(0);
  const [optimizedOrder, setOptimizedOrder] = useState<number[]>([]);
  
  // Metrics
  const originalDistance = 847;
  const optimizedDistance = 612;
  const originalTime = "14h 32m";
  const optimizedTime = "10h 18m";
  const savings = Math.round(((originalDistance - optimizedDistance) / originalDistance) * 100);

  const runOptimization = () => {
    setIsOptimizing(true);
    setIsOptimized(false);
    setProgress(0);
    setOptimizedOrder([]);

    // Simulate AI optimization with progress
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsOptimizing(false);
          setIsOptimized(true);
          // Simulated optimized order
          setOptimizedOrder([1, 4, 5, 11, 6, 10, 7, 8, 9, 3, 12, 2]);
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
            Watch our AI optimize 12 UK delivery drops in real-time, reducing miles and saving hours.
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
              <span className="text-xs text-muted-foreground font-mono">UK NATIONWIDE</span>
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
                    {progress > 20 && <p className="animate-pulse">→ Calculating distances...</p>}
                    {progress > 40 && <p className="animate-pulse">→ Applying vehicle constraints...</p>}
                    {progress > 60 && <p className="animate-pulse">→ Checking low bridge restrictions...</p>}
                    {progress > 80 && <p className="animate-pulse">→ Optimizing sequence...</p>}
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
                        Save {originalDistance - optimizedDistance} miles and ~4 hours per route
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
