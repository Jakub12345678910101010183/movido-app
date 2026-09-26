import { Button } from "@/components/ui/button";
import { Compass, Home } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-terminal px-4">
      <div className="card-terminal w-full max-w-md p-8 text-center">
        <Compass className="mx-auto mb-6 h-12 w-12 text-primary" aria-hidden="true" />
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <h2 className="text-lg font-semibold mb-3">Page not found</h2>
        <p className="text-sm text-muted-foreground mb-8">
          The page you are looking for doesn't exist or has moved.
        </p>
        <Button asChild>
          <Link href="/"><Home className="w-4 h-4 mr-2" />Go to the home page</Link>
        </Button>
      </div>
    </div>
  );
}
