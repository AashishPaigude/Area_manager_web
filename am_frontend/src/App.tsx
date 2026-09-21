import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import LiveTracking from "./pages/LiveTracking";
import Reports from "./pages/Reports";
import RouteHistory from "./pages/RouteHistory";
import TrackHistoryControl from "./pages/TrackHistoryControl";
import Attendance from "./pages/Attendance";
import Analytics from "./pages/Analytics";
import PlanVisits from "./pages/PlanVisits";
import PlannedVisits from "./pages/PlannedVisits";
import ReportEmailAccess from "./pages/ReportEmailAccess";
import FieldOfficerCombinedReport from "./pages/FieldOfficerCombinedReport";
import { getStoredUserIdentity, ROLE_ADMIN } from "@/lib/auth";

const queryClient = new QueryClient();

const AdminRouteGuard = ({ children }: { children: React.ReactNode }) => {
  const user = getStoredUserIdentity();
  if (user?.app_role !== ROLE_ADMIN) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

const ProtectedRouteGuard = ({ children }: { children: React.ReactNode }) => {
  const user = getStoredUserIdentity();
  if (!user || !user.user_id) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRouteGuard>
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/live-tracking" element={<LiveTracking />} />
                    <Route path="/visits" element={<Reports />} />
                    <Route path="/reports/combined/:officerId" element={<FieldOfficerCombinedReport />} />
                    <Route path="/routes" element={<RouteHistory />} />
                    <Route path="/tracking-control" element={<TrackHistoryControl />} />
                    <Route path="/attendance" element={<Attendance />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/visit-planning/plan" element={<PlanVisits />} />
                    <Route path="/visit-planning/planned" element={<PlannedVisits />} />
                    <Route
                      path="/email-access"
                      element={
                        <AdminRouteGuard>
                          <ReportEmailAccess />
                        </AdminRouteGuard>
                      }
                    />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </AppLayout>
              </ProtectedRouteGuard>
            }
          />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;