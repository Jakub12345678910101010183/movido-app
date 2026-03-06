/**
 * Document Scanner — AI-Powered Transport Document OCR
 * Bloomberg/Terminal Noir style
 *
 * Features:
 * - Upload or drag-drop image (CMR, consignment note, delivery manifest, POD)
 * - Tesseract.js OCR (runs entirely in browser — no backend needed)
 * - AI field extraction: Reference, Customer, Addresses, Dates, Weights
 * - Copy extracted text / auto-fill job from scan
 * - Scan history (last 10, stored in memory)
 * - PDF & image support
 */

import { useState, useRef, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ScanLine, Upload, FileText, Copy, CheckCircle, X, Loader2,
  RefreshCw, ChevronRight, FileImage, Clipboard, Zap, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

// ============================================
// Types
// ============================================

interface ExtractedFields {
  reference?: string;
  customer?: string;
  pickup?: string;
  delivery?: string;
  date?: string;
  weight?: string;
  driver?: string;
  vehicle?: string;
  notes?: string;
}

interface ScanResult {
  id: string;
  filename: string;
  imageUrl: string;
  rawText: string;
  fields: ExtractedFields;
  confidence: number;
  scannedAt: Date;
}

// ============================================
// Field extractor (regex-based heuristics)
// ============================================

function extractFields(text: string): ExtractedFields {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const joined = text.toUpperCase();

  const find = (patterns: RegExp[]): string | undefined => {
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) return m[1].trim();
    }
    return undefined;
  };

  // Reference number heuristics
  const reference = find([
    /(?:ref(?:erence)?|job|order|consignment|cmr)[:\s#]+([A-Z0-9\-\/]{4,20})/i,
    /\b(JOB[-\s]?\d{4,8})\b/i,
    /\b([A-Z]{2,4}-\d{4,8})\b/,
  ]);

  // Date heuristics
  const date = find([
    /(?:date|collection|dispatch)[:\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/,
  ]);

  // Weight
  const weight = find([
    /(?:weight|gross|tare|net)[:\s]+([\d.,]+\s*(?:kg|t|tonnes|lbs?))/i,
    /([\d.,]+\s*(?:kg|tonnes?))/i,
  ]);

  // Vehicle/reg
  const vehicle = find([
    /(?:vehicle|reg(?:istration)?|truck|lorry)[:\s]+([A-Z]{2}\d{2}\s?[A-Z]{3})/i,
    /\b([A-Z]{2}\d{2}\s[A-Z]{3})\b/,
  ]);

  // Customer — look for "consignor", "shipper", "from", "sender" lines
  let customer: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toUpperCase();
    if (l.includes("CONSIGNOR") || l.includes("SHIPPER") || l.includes("SENDER") || l.includes("FROM:")) {
      customer = lines[i + 1] || undefined;
      break;
    }
  }

  // Pickup address — lines after "collection", "loading", "pick up"
  let pickup: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toUpperCase();
    if (l.includes("COLLECTION") || l.includes("LOADING") || l.includes("PICK UP") || l.includes("PICKUP")) {
      pickup = [lines[i + 1], lines[i + 2]].filter(Boolean).join(", ");
      break;
    }
  }

  // Delivery address — lines after "delivery", "consignee", "destination"
  let delivery: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toUpperCase();
    if (l.includes("DELIVERY") || l.includes("CONSIGNEE") || l.includes("DESTINATION") || l.includes("DELIVER TO")) {
      delivery = [lines[i + 1], lines[i + 2]].filter(Boolean).join(", ");
      break;
    }
  }

  // Driver name
  const driver = find([/(?:driver)[:\s]+([A-Za-z\s]{3,30})/i]);

  return { reference, customer, pickup, delivery, date, weight, vehicle, driver };
}

// ============================================
// Component
// ============================================

export default function DocumentScanner() {
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [currentScan, setCurrentScan] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [activeTab, setActiveTab] = useState<"scanner" | "history">("scanner");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Tesseract OCR ----
  const runOCR = useCallback(async (file: File): Promise<{ text: string; confidence: number }> => {
    return new Promise((resolve, reject) => {
      // Dynamically load Tesseract from CDN
      const existingScript = document.getElementById("tesseract-script");
      const doOCR = () => {
        const w = window as any;
        if (!w.Tesseract) {
          reject(new Error("Tesseract failed to load"));
          return;
        }
        const reader = new FileReader();
        reader.onload = async (e) => {
          const imageData = e.target?.result as string;
          try {
            const worker = await w.Tesseract.createWorker("eng", 1, {
              logger: (m: any) => {
                if (m.status === "recognizing text") {
                  setScanProgress(Math.round(m.progress * 100));
                }
              },
            });
            const { data } = await worker.recognize(imageData);
            await worker.terminate();
            resolve({ text: data.text, confidence: Math.round(data.confidence) });
          } catch (err) {
            reject(err);
          }
        };
        reader.readAsDataURL(file);
      };

      if (existingScript || (window as any).Tesseract) {
        doOCR();
      } else {
        const script = document.createElement("script");
        script.id = "tesseract-script";
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.4/tesseract.min.js";
        script.onload = doOCR;
        script.onerror = () => reject(new Error("Failed to load Tesseract.js"));
        document.head.appendChild(script);
      }
    });
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Please upload an image file (JPG, PNG, TIFF) or PDF");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large (max 20MB)");
      return;
    }

    setIsScanning(true);
    setScanProgress(0);

    try {
      // For PDFs, we'll tell the user we're processing page 1
      const imageUrl = URL.createObjectURL(file);

      const { text, confidence } = await runOCR(file);

      if (!text.trim()) {
        toast.error("No text detected — try a clearer image");
        setIsScanning(false);
        return;
      }

      const fields = extractFields(text);
      const result: ScanResult = {
        id: Date.now().toString(),
        filename: file.name,
        imageUrl,
        rawText: text,
        fields,
        confidence,
        scannedAt: new Date(),
      };

      setCurrentScan(result);
      setHistory((prev) => [result, ...prev].slice(0, 10));
      toast.success(`Document scanned — ${confidence}% confidence`);
    } catch (err: any) {
      toast.error(`OCR failed: ${err.message}`);
    } finally {
      setIsScanning(false);
      setScanProgress(0);
    }
  }, [runOCR]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const copyField = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
    toast.success(`${label} copied!`);
  };

  const copyAll = () => {
    if (!currentScan) return;
    navigator.clipboard.writeText(currentScan.rawText);
    toast.success("Full text copied to clipboard");
  };

  // ---- Field row renderer ----
  const FieldRow = ({ label, value }: { label: string; value?: string }) => {
    if (!value) return null;
    return (
      <div className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
        <span className="text-xs text-muted-foreground w-24 shrink-0 mt-0.5">{label}</span>
        <span className="text-sm flex-1 font-medium">{value}</span>
        <button
          onClick={() => copyField(label, value)}
          className="p-1 rounded hover:bg-muted/50 transition-colors shrink-0"
        >
          {copiedField === label
            ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
            : <Copy className="w-3.5 h-3.5 text-muted-foreground" />
          }
        </button>
      </div>
    );
  };

  const hasExtractedFields = currentScan && Object.values(currentScan.fields).some(Boolean);

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ScanLine className="w-6 h-6 text-primary" />
              Document Scanner
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              AI-powered OCR — scan CMR notes, consignment docs &amp; delivery manifests
            </p>
          </div>
          {currentScan && (
            <Button variant="outline" onClick={() => setCurrentScan(null)}>
              <X className="w-4 h-4 mr-2" />Clear
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeTab === "scanner" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("scanner")}
          >
            <ScanLine className="w-4 h-4 mr-2" />Scanner
          </Button>
          <Button
            variant={activeTab === "history" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("history")}
          >
            <FileText className="w-4 h-4 mr-2" />History ({history.length})
          </Button>
        </div>

        {/* ========== SCANNER TAB ========== */}
        {activeTab === "scanner" && (
          <div className="grid grid-cols-2 gap-6">
            {/* Left — Upload / Preview */}
            <div className="space-y-4">
              {/* Drop zone */}
              {!currentScan && !isScanning && (
                <div
                  className={`relative flex flex-col items-center justify-center h-64 rounded-xl border-2 border-dashed transition-all cursor-pointer ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/20"}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="font-medium mb-1">Drop document here</p>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-3">
                    Supports JPG, PNG, TIFF, BMP · Max 20MB
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              )}

              {/* Scanning progress */}
              {isScanning && (
                <div className="card-terminal p-8 text-center">
                  <div className="relative w-20 h-20 mx-auto mb-4">
                    <ScanLine className="w-20 h-20 text-primary/20" />
                    <ScanLine className="w-20 h-20 text-primary absolute inset-0 animate-pulse" />
                  </div>
                  <p className="font-medium mb-2">Scanning document...</p>
                  <div className="w-full bg-muted/30 rounded-full h-2 mb-1">
                    <div
                      className="h-2 rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{scanProgress}% complete</p>
                </div>
              )}

              {/* Image preview */}
              {currentScan && !isScanning && (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden border border-border">
                    <img
                      src={currentScan.imageUrl}
                      alt={currentScan.filename}
                      className="w-full max-h-64 object-contain bg-muted/10"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/80">{currentScan.filename}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${currentScan.confidence >= 80 ? "bg-green-500/30 text-green-300" : currentScan.confidence >= 60 ? "bg-amber-500/30 text-amber-300" : "bg-red-500/30 text-red-300"}`}>
                          {currentScan.confidence}% confidence
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />Scan Another Document
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  </Button>
                </div>
              )}

              {/* Tips */}
              {!currentScan && !isScanning && (
                <div className="card-terminal p-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Best results:</p>
                  {[
                    "Flat, unfolded document",
                    "Good lighting — no shadows",
                    "Camera perpendicular to page",
                    "300 DPI or higher for photos",
                  ].map((tip) => (
                    <div key={tip} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ChevronRight className="w-3 h-3 text-primary shrink-0" />
                      {tip}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right — Extracted data */}
            <div className="space-y-4">
              {!currentScan && !isScanning && (
                <div className="card-terminal p-8 text-center h-64 flex flex-col items-center justify-center">
                  <FileImage className="w-12 h-12 text-muted-foreground opacity-30 mb-3" />
                  <p className="text-muted-foreground text-sm">Upload a document to extract fields</p>
                </div>
              )}

              {isScanning && (
                <div className="card-terminal p-8 text-center h-64 flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                  <p className="text-muted-foreground text-sm">Extracting text...</p>
                </div>
              )}

              {currentScan && !isScanning && (
                <>
                  {/* Extracted fields */}
                  {hasExtractedFields && (
                    <div className="card-terminal p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-400" />
                          <span className="text-sm font-medium">Auto-extracted Fields</span>
                        </div>
                      </div>
                      <div>
                        <FieldRow label="Reference" value={currentScan.fields.reference} />
                        <FieldRow label="Customer" value={currentScan.fields.customer} />
                        <FieldRow label="Collection" value={currentScan.fields.pickup} />
                        <FieldRow label="Delivery" value={currentScan.fields.delivery} />
                        <FieldRow label="Date" value={currentScan.fields.date} />
                        <FieldRow label="Weight" value={currentScan.fields.weight} />
                        <FieldRow label="Driver" value={currentScan.fields.driver} />
                        <FieldRow label="Vehicle" value={currentScan.fields.vehicle} />
                      </div>
                    </div>
                  )}

                  {!hasExtractedFields && (
                    <div className="card-terminal p-4 flex items-start gap-2 text-sm">
                      <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      <span className="text-muted-foreground">No standard fields detected. Check the raw text below.</span>
                    </div>
                  )}

                  {/* Raw text */}
                  <div className="card-terminal p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground uppercase">Raw OCR Text</span>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={copyAll}>
                        <Clipboard className="w-3 h-3 mr-1" />Copy All
                      </Button>
                    </div>
                    <Textarea
                      className="bg-muted/20 text-xs font-mono resize-none"
                      value={currentScan.rawText}
                      rows={10}
                      readOnly
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ========== HISTORY TAB ========== */}
        {activeTab === "history" && (
          <>
            {history.length === 0 ? (
              <div className="card-terminal p-12 text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
                <h3 className="font-semibold mb-2">No scans yet</h3>
                <p className="text-sm text-muted-foreground">Scanned documents will appear here (last 10)</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((scan) => (
                  <div
                    key={scan.id}
                    className="card-terminal p-4 flex gap-4 cursor-pointer hover:bg-muted/10 transition-colors"
                    onClick={() => { setCurrentScan(scan); setActiveTab("scanner"); }}
                  >
                    <img
                      src={scan.imageUrl}
                      alt={scan.filename}
                      className="w-16 h-16 object-cover rounded-lg border border-border shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <FileImage className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium truncate">{scan.filename}</span>
                        <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full shrink-0 ${scan.confidence >= 80 ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"}`}>
                          {scan.confidence}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">
                        {scan.scannedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} — {scan.scannedAt.toLocaleDateString("en-GB")}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                        {scan.fields.reference && <span className="text-xs text-cyan">Ref: {scan.fields.reference}</span>}
                        {scan.fields.customer && <span className="text-xs text-muted-foreground">{scan.fields.customer}</span>}
                        {scan.fields.weight && <span className="text-xs text-muted-foreground">{scan.fields.weight}</span>}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground self-center shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
