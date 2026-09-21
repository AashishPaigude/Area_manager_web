import React, { useState, useEffect, useMemo } from "react";
import { 
  Users, 
  CheckCircle2, 
  Search, 
  Shield, 
  ChevronRight, 
  XCircle,
  Loader2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  getReportEmailAccessBranches, 
  updateBranchEmailAccess, 
  BranchEmailAccessItem 
} from "@/services/reportService";

export default function ReportEmailAccess() {
  const [branches, setBranches] = useState<BranchEmailAccessItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [updatingOid, setUpdatingOid] = useState<number | null>(null);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [accessFilter, setAccessFilter] = useState("ALL");

  // Fetch branches from real backend API on mount
  const fetchBranches = async () => {
    try {
      setLoading(true);
      const data = await getReportEmailAccessBranches();
      setBranches(data.branches || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load branch email access data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  // Derived KPI metrics directly from real branch data
  const enabledCount = useMemo(() => branches.filter(b => b.email_access).length, [branches]);
  const disabledCount = useMemo(() => branches.filter(b => !b.email_access).length, [branches]);
  const totalCount = branches.length;

  // Filtering Logic
  const filteredBranches = useMemo(() => {
    return branches.filter(b => {
      const codeStr = b.short_name || "";
      const searchMatch = b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          codeStr.toLowerCase().includes(searchTerm.toLowerCase());
      const accessMatch = accessFilter === "ALL" || 
                          (accessFilter === "Enabled" && b.email_access) || 
                          (accessFilter === "Disabled" && !b.email_access);

      return searchMatch && accessMatch;
    });
  }, [branches, searchTerm, accessFilter]);

  // Toggle Email Access state via backend API
  const handleToggleEmailAccess = async (oid: number, val: boolean) => {
    const targetBranch = branches.find(b => b.oid === oid);
    if (!targetBranch || targetBranch.email_access === val) return;

    try {
      setUpdatingOid(oid);
      // Optimistically update state
      setBranches(prev => prev.map(b => b.oid === oid ? { ...b, email_access: val } : b));

      const response = await updateBranchEmailAccess(oid, val);
      const statusMsg = val ? "enabled" : "disabled";
      toast.success(response.message || `Email access for ${targetBranch.name} set to ${statusMsg}.`);
    } catch (err: any) {
      // Revert state on failure
      setBranches(prev => prev.map(b => b.oid === oid ? { ...b, email_access: targetBranch.email_access } : b));
      toast.error(err.message || "Failed to update email access");
    } finally {
      setUpdatingOid(null);
    }
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-16">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
        <span className="flex items-center gap-1 text-muted-foreground/80">
          <Shield className="h-3.5 w-3.5" /> Field Officer Monitoring
        </span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-semibold">Report Email Access</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-border/60 pb-5">
        <h1 className="text-2xl font-bold tracking-tight">Report Email Access</h1>
        <p className="text-sm text-muted-foreground">Manage which branches are allowed to send generated reports directly to clients via email.</p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 lg:grid-cols-3">
        {[
          { label: "Email Enabled", value: enabledCount, color: "kpi-card-green", icon: CheckCircle2, dot: "bg-status-active", glow: "0 0 8px rgba(34, 197, 94, 0.8)", iconBg: "bg-green-500/10 text-green-600" },
          { label: "Email Disabled", value: disabledCount, color: "kpi-card-red", icon: XCircle, dot: "bg-status-critical", glow: "0 0 8px rgba(239, 68, 68, 0.8)", iconBg: "bg-red-500/10 text-red-600" },
          { label: "Total Branches", value: totalCount, color: "kpi-card-blue", icon: Users, dot: "bg-status-info", glow: "0 0 8px rgba(59, 130, 246, 0.8)", iconBg: "bg-blue-500/10 text-blue-600" }
        ].map(c => (
          <Card key={c.label} className={`kpi-card ${c.color} border-border/60 bg-card/45 shadow-sm`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full animate-pulse ${c.dot}`} style={{ boxShadow: c.glow }} />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 leading-normal">{c.label}</p>
                  </div>
                  <p className="text-3xl font-extrabold font-mono-data tracking-tight">{c.value}</p>
                </div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl shrink-0 ${c.iconBg}`}>
                  <c.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Access Management Console Directory */}
      <Card className="border border-border/60 overflow-hidden shadow-sm">
        {/* Card Header */}
        <div className="p-4 bg-muted/40 border-b flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>Branch Authorization Control Center</span>
          <span>{filteredBranches.length} Branches Managed</span>
        </div>

        {/* Filters inside card */}
        <div className="px-4 py-3 border-b border-border/40 bg-card/60">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search branch name, code..."
                className="pl-8 h-7 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 shadow-sm min-w-[200px] max-w-[260px]"
              />
            </div>
            {/* Email Access Status filter */}
            <select
              value={accessFilter}
              onChange={(e) => setAccessFilter(e.target.value)}
              className="bg-card border border-input text-foreground text-xs h-9 px-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary shadow-sm min-w-[160px] max-w-[200px]"
            >
              <option value="ALL">All Access Status</option>
              <option value="Enabled">Enabled</option>
              <option value="Disabled">Disabled</option>
            </select>
            {/* Clear Filters */}
            {(searchTerm || accessFilter !== "ALL") && (
              <div className="flex items-center gap-3 text-xs ml-auto">
                <span className="text-muted-foreground">
                  Showing <span className="font-bold text-primary">{filteredBranches.length}</span> of {branches.length}
                </span>
                <Button
                  variant="link"
                  className="h-auto p-0 text-accent font-bold hover:no-underline text-xs"
                  onClick={() => { setSearchTerm(""); setAccessFilter("ALL"); }}
                >
                  Reset
                </Button>
              </div>
            )}
          </div>
        </div>
        
        <div className="divide-y divide-border/45 bg-card/5">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span>Loading branch email access settings...</span>
            </div>
          ) : filteredBranches.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              No Branches match the selected filters.
            </div>
          ) : (
            filteredBranches.map((branch) => (
              <div 
                key={branch.oid} 
                className={`flex flex-col sm:flex-row sm:items-center justify-between py-6 px-6 hover:bg-muted/10 transition-all duration-200 gap-4 ${
                  branch.email_access ? "bg-emerald-500/[0.01]" : ""
                }`}
              >
                {/* Left: Branch Info */}
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-extrabold text-base text-primary tracking-tight">{branch.name}</span>
                    {branch.short_name && (
                      <span className="text-[10px] text-muted-foreground font-mono-data bg-muted px-1.5 py-0.5 rounded font-semibold uppercase">{branch.short_name}</span>
                    )}
                  </div>
                  <div className="flex items-center text-xs text-muted-foreground font-semibold pl-0">
                    <span>Field Officers: <strong className="text-foreground font-bold font-mono-data">{branch.field_officer_count}</strong></span>
                  </div>
                </div>

                {/* Right: Enable / Disable Toggle */}
                <div className="relative grid grid-cols-2 w-32 h-8 p-1 rounded-full border border-border bg-muted/60 overflow-hidden shrink-0 self-start sm:self-center">

                  {/* Sliding Background */}
                  <div
                    className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full transition-all duration-300 ease-in-out ${
                      branch.email_access
                        ? "left-1 bg-emerald-500/10 border border-emerald-500/30"
                        : "left-[calc(50%+2px)] bg-red-500/10 border border-red-500/30"
                    }`}
                  />

                  {/* Enable Button */}
                  <button
                    disabled={updatingOid === branch.oid}
                    onClick={() => handleToggleEmailAccess(branch.oid, true)}
                    className={`relative z-10 flex items-center justify-center text-xs font-semibold transition-colors duration-300 ${
                      branch.email_access
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    Enable
                  </button>

                  {/* Disable Button */}
                  <button
                    disabled={updatingOid === branch.oid}
                    onClick={() => handleToggleEmailAccess(branch.oid, false)}
                    className={`relative z-10 flex items-center justify-center text-xs font-semibold transition-colors duration-300 ${
                      !branch.email_access
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    Disable
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
