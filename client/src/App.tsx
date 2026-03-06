import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, RequireAuth } from "./contexts/AuthContext";
import Home from "./pages/Home";
import Pricing from "./pages/Pricing";
import Login from "./pages/Login";
import Tracking from "./pages/Tracking";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Jobs from "./pages/Jobs";
import Fleet from "./pages/Fleet";
import Drivers from "./pages/Drivers";
import Routes from "./pages/Routes";
import Messenger from "./pages/Messenger";
import Maintenance from "./pages/Maintenance";
import POD from "./pages/POD";
import Alerts from "./pages/Alerts";
import Analytics from "./pages/Analytics";
import Reports from "./pages/Reports";
import Incidents from "./pages/Incidents";
import FuelReports from "./pages/FuelReports";
import DocumentScanner from "./pages/DocumentScanner";
import WTD from "./pages/WTD";
import AuthCallback from "./pages/AuthCallback";

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Home} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/login" component={Login} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/track/:token" component={Tracking} />

      {/* Protected routes */}
      <Route path="/dashboard">
        <RequireAuth fallback={<Login />}><Dashboard /></RequireAuth>
      </Route>
      <Route path="/jobs">
        <RequireAuth fallback={<Login />}><Jobs /></RequireAuth>
      </Route>
      <Route path="/fleet">
        <RequireAuth fallback={<Login />}><Fleet /></RequireAuth>
      </Route>
      <Route path="/drivers">
        <RequireAuth fallback={<Login />}><Drivers /></RequireAuth>
      </Route>
      <Route path="/routes">
        <RequireAuth fallback={<Login />}><Routes /></RequireAuth>
      </Route>
      <Route path="/messenger">
        <RequireAuth fallback={<Login />}><Messenger /></RequireAuth>
      </Route>
      <Route path="/maintenance">
        <RequireAuth fallback={<Login />}><Maintenance /></RequireAuth>
      </Route>
      <Route path="/pod">
        <RequireAuth fallback={<Login />}><POD /></RequireAuth>
      </Route>
      <Route path="/alerts">
        <RequireAuth fallback={<Login />}><Alerts /></RequireAuth>
      </Route>
      <Route path="/analytics">
        <RequireAuth fallback={<Login />}><Analytics /></RequireAuth>
      </Route>
      <Route path="/reports">
        <RequireAuth fallback={<Login />}><Reports /></RequireAuth>
      </Route>
      <Route path="/settings">
        <RequireAuth fallback={<Login />}><Settings /></RequireAuth>
      </Route>
      <Route path="/incidents">
        <RequireAuth fallback={<Login />}><Incidents /></RequireAuth>
      </Route>
      <Route path="/fuel-reports">
        <RequireAuth fallback={<Login />}><FuelReports /></RequireAuth>
      </Route>
      <Route path="/document-scanner">
        <RequireAuth fallback={<Login />}><DocumentScanner /></RequireAuth>
      </Route>
      <Route path="/wtd">
        <RequireAuth fallback={<Login />}><WTD /></RequireAuth>
      </Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
