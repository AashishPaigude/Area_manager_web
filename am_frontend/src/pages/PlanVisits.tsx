import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { 
  ChevronRight, 
  Calendar, 
  Sparkles, 
  MapPin, 
  Plus, 
  Trash2, 
  Eye, 
  CheckCircle,
  Edit,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  FieldOfficer,
  Branch,
  Client,
  SiteItem,
  ConfiguredSiteItem,
  CustomVisitResponse,
  CreateCustomVisitPayload,
  getFieldOfficers,
  getBranches,
  getClients,
  getSites,
  createPlan,
  updatePlanHeader,
  addSiteToPlan,
  updateSiteFrequency,
  removeSiteFromPlan,
  publishPlan,
  unpublishPlan,
  deletePlan,
  addCustomVisitToPlan,
  getCustomVisitsForPlan,
  removeCustomVisitFromPlan,
  getPlanDetails,
} from "@/services/visitService";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Dynamic date calculation helpers
const formatLocalDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const getCurrentWeekBounds = () => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday
  const distanceToMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - distanceToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: formatLocalDate(monday),
    end: formatLocalDate(sunday),
  };
};

const getCurrentMonthName = () => {
  return MONTH_NAMES[new Date().getMonth()] || "January";
};

const getCurrentYearStr = () => {
  return new Date().getFullYear().toString();
};

const getTodayDateStr = () => {
  return formatLocalDate(new Date());
};

export default function PlanVisits() {
  const location = useLocation();
  const copiedPlan = location.state?.copiedPlan;

  // Master Data States
  const [officersList, setOfficersList] = useState<FieldOfficer[]>([]);
  const [branchesList, setBranchesList] = useState<Branch[]>([]);
  const [clientsList, setClientsList] = useState<Client[]>([]);
  const [sitesList, setSitesList] = useState<SiteItem[]>([]);

  const navigate = useNavigate();

  const [loadingOfficers, setLoadingOfficers] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingSites, setLoadingSites] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Period scope selection ("weekly" | "monthly" | "single")
  const [planningPeriod, setPlanningPeriod] = useState<"weekly" | "monthly" | "single">(() => {
    if (copiedPlan) {
      const typeLower = (copiedPlan.planning_type || copiedPlan.planningType || "").toLowerCase();
      if (typeLower === "single") return "single";
      if (typeLower === "monthly") return "monthly";
      if (typeLower === "weekly") return "weekly";
    }
    return "weekly";
  });
  const [selectedMethod, setSelectedMethod] = useState<"manual" | "auto">("manual");

  // Period Details States
  // Weekly
  const [weekStartDate, setWeekStartDate] = useState<string>(() => copiedPlan?.week_start_date || getCurrentWeekBounds().start);
  const [weekEndDate, setWeekEndDate] = useState<string>(() => copiedPlan?.week_end_date || getCurrentWeekBounds().end);
  
  // Monthly
  const [month, setMonth] = useState<string>(() => {
    if (copiedPlan?.planning_month) {
      return MONTH_NAMES[copiedPlan.planning_month - 1] || getCurrentMonthName();
    }
    return getCurrentMonthName();
  });
  const [year, setYear] = useState<string>(() => (copiedPlan?.planning_year ? copiedPlan.planning_year.toString() : getCurrentYearStr()));

  // Single
  const [visitDate, setVisitDate] = useState<string>(() => copiedPlan?.visit_date || getTodayDateStr());

  // Selected Officer OID & Plan state
  const [selectedOfficerOid, setSelectedOfficerOid] = useState<number | null>(() => copiedPlan?.employee_oid || null);
  const [currentPlanOid, setCurrentPlanOid] = useState<number | null>(() => copiedPlan?.oid || null);
  const [planCode, setPlanCode] = useState<string | null>(() => copiedPlan?.plan_code || null);
  const [planStatus, setPlanStatus] = useState<"DRAFT" | "PUBLISHED" | null>(() => (copiedPlan?.status as any) || null);

  // Configured Sites list state
  const [siteVisits, setSiteVisits] = useState<ConfiguredSiteItem[]>(() => copiedPlan?.sites || []);
  const [customVisits, setCustomVisits] = useState<CustomVisitResponse[]>(() => copiedPlan?.custom_visits || []);

  // Inline Site Add/Edit form state
  const [showAddCard, setShowAddCard] = useState(false);
  const [editingFrequencyOid, setEditingFrequencyOid] = useState<number | null>(null);
  
  // Form Card States (Dropdown selections)
  const [formBranchOid, setFormBranchOid] = useState<number | null>(null);
  const [formClientOid, setFormClientOid] = useState<number | null>(null);
  const [formSiteOid, setFormSiteOid] = useState<number | null>(null);
  const [formSiteFrequency, setFormSiteFrequency] = useState("3");

  // Custom Location Form States
  const [showCustomLocationCard, setShowCustomLocationCard] = useState(false);
  const [customBranchOid, setCustomBranchOid] = useState<number | null>(null);
  const [customClientName, setCustomClientName] = useState("");
  const [customSiteName, setCustomSiteName] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [customLatitude, setCustomLatitude] = useState("");
  const [customLongitude, setCustomLongitude] = useState("");
  const [customFrequency, setCustomFrequency] = useState("3");
  const [isAddingCustomLocation, setIsAddingCustomLocation] = useState(false);

  // Preview Modal
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Synchronize state if copiedPlan is passed via router location state
  useEffect(() => {
    if (copiedPlan) {
      const typeLower = (copiedPlan.planning_type || copiedPlan.planningType || "").toLowerCase();
      if (typeLower === "single") setPlanningPeriod("single");
      else if (typeLower === "monthly") setPlanningPeriod("monthly");
      else if (typeLower === "weekly") setPlanningPeriod("weekly");

      if (copiedPlan.week_start_date) setWeekStartDate(copiedPlan.week_start_date);
      if (copiedPlan.week_end_date) setWeekEndDate(copiedPlan.week_end_date);
      if (copiedPlan.planning_month) setMonth(MONTH_NAMES[copiedPlan.planning_month - 1] || "August");
      if (copiedPlan.planning_year) setYear(copiedPlan.planning_year.toString());
      if (copiedPlan.visit_date) setVisitDate(copiedPlan.visit_date);
      if (copiedPlan.employee_oid) setSelectedOfficerOid(copiedPlan.employee_oid);
      if (copiedPlan.oid) setCurrentPlanOid(copiedPlan.oid);
      if (copiedPlan.plan_code) setPlanCode(copiedPlan.plan_code);
      if (copiedPlan.status) setPlanStatus(copiedPlan.status as "DRAFT" | "PUBLISHED");
      if (copiedPlan.sites && Array.isArray(copiedPlan.sites)) setSiteVisits(copiedPlan.sites);
      if (copiedPlan.custom_visits && Array.isArray(copiedPlan.custom_visits)) setCustomVisits(copiedPlan.custom_visits);
    }
  }, [copiedPlan]);

  // Load Field Officers, Branches, Clients on Mount
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        setLoadingOfficers(true);
        const officers = await getFieldOfficers();
        setOfficersList(officers);
        if (officers.length > 0 && !selectedOfficerOid) {
          setSelectedOfficerOid(officers[0].oid);
        }
      } catch (err: any) {
        toast.error(`Failed to load Field Officers: ${err.message}`);
      } finally {
        setLoadingOfficers(false);
      }

      try {
        setLoadingBranches(true);
        const branches = await getBranches();
        setBranchesList(branches);
        if (branches.length === 1) {
          setFormBranchOid(branches[0].oid);
        }
      } catch (err: any) {
        toast.error(`Failed to load Branches: ${err.message}`);
      } finally {
        setLoadingBranches(false);
      }

      try {
        setLoadingClients(true);
        const clients = await getClients();
        setClientsList(clients);
      } catch (err: any) {
        toast.error(`Failed to load Clients: ${err.message}`);
      } finally {
        setLoadingClients(false);
      }
    };

    fetchMasterData();
  }, []);

  // Auto-sync formBranchOid when selected officer or branchesList changes
  useEffect(() => {
    const selectedOfficer = officersList.find(o => o.oid === selectedOfficerOid);
    if (selectedOfficer?.branch_oid) {
      setFormBranchOid(selectedOfficer.branch_oid);
    } else if (branchesList.length === 1) {
      setFormBranchOid(branchesList[0].oid);
    }
  }, [selectedOfficerOid, officersList, branchesList]);

  // Fetch Sites when Branch or Client changes
  useEffect(() => {
    if (!formBranchOid && !formClientOid) {
      setSitesList([]);
      return;
    }

    const fetchSitesData = async () => {
      try {
        setLoadingSites(true);
        const sites = await getSites(formBranchOid, formClientOid);
        setSitesList(sites);
      } catch (err: any) {
        toast.error(`Failed to load Sites: ${err.message}`);
      } finally {
        setLoadingSites(false);
      }
    };

    fetchSitesData();
  }, [formBranchOid, formClientOid]);

  // Handle Planning Period Switch (Reset inactive fields)
  const handlePeriodSwitch = (period: "weekly" | "monthly" | "single") => {
    setPlanningPeriod(period);

    if (period === "weekly") {
      setMonth("");
      setYear("");
      setVisitDate("");
      if (!weekStartDate) setWeekStartDate(getCurrentWeekBounds().start);
      if (!weekEndDate) setWeekEndDate(getCurrentWeekBounds().end);
    } else if (period === "monthly") {
      setWeekStartDate("");
      setWeekEndDate("");
      setVisitDate("");
      if (!month) setMonth(getCurrentMonthName());
      if (!year) setYear(getCurrentYearStr());
    } else if (period === "single") {
      setWeekStartDate("");
      setWeekEndDate("");
      setMonth("");
      setYear("");
      if (!visitDate) setVisitDate(getTodayDateStr());
    }
  };

  // Helper to ensure a DRAFT plan is created or updated on backend
  const ensureDraftPlanCreated = async (): Promise<number> => {
    if (!selectedOfficerOid) {
      throw new Error("Please select a primary Field Officer");
    }

    if (planningPeriod === "weekly") {
      if (!weekStartDate || !weekEndDate) {
        throw new Error("Please select both Week Start Date and Week End Date");
      }
      if (weekStartDate > weekEndDate) {
        throw new Error("Week Start Date must be on or before Week End Date");
      }
    } else if (planningPeriod === "monthly") {
      if (!month || !year) {
        throw new Error("Please select both Month and Year");
      }
    } else if (planningPeriod === "single") {
      if (!visitDate) {
        throw new Error("Please select a Visit Date for Single Visit");
      }
    }

    const monthIndex = MONTH_NAMES.indexOf(month) + 1;
    const payload = {
      planning_type: (planningPeriod.toUpperCase()) as "WEEKLY" | "MONTHLY" | "SINGLE",
      week_start_date: planningPeriod === "weekly" ? weekStartDate : undefined,
      week_end_date: planningPeriod === "weekly" ? weekEndDate : undefined,
      planning_month: planningPeriod === "monthly" ? (monthIndex > 0 ? monthIndex : (new Date().getMonth() + 1)) : undefined,
      planning_year: planningPeriod === "monthly" ? parseInt(year) || new Date().getFullYear() : undefined,
      visit_date: planningPeriod === "single" ? visitDate : undefined,
      employee_oid: selectedOfficerOid,
      planning_method: "MANUAL" as const,
    };

    if (currentPlanOid) {
      const updatedPlan = await updatePlanHeader(currentPlanOid, payload);
      setPlanCode(updatedPlan.plan_code);
      setPlanStatus(updatedPlan.status as "DRAFT" | "PUBLISHED");
      return updatedPlan.oid;
    } else {
      const newPlan = await createPlan(payload);
      setCurrentPlanOid(newPlan.oid);
      setPlanCode(newPlan.plan_code);
      setPlanStatus(newPlan.status as "DRAFT" | "PUBLISHED");
      return newPlan.oid;
    }
  };

  // Save changes from Add/Edit Inline Form Card
  const handleSaveSiteCard = () => {
    if (!formBranchOid) {
      toast.error("Please select a Branch");
      return;
    }
    if (!formClientOid) {
      toast.error("Please select a Client");
      return;
    }
    if (!formSiteOid) {
      toast.error("Please select a Site");
      return;
    }

    const freq = planningPeriod === "single" ? 1 : (parseInt(formSiteFrequency) || 1);
    if (freq <= 0) {
      toast.error("Visit frequency must be a positive number greater than 0");
      return;
    }

    if (editingFrequencyOid) {
      // Edit Mode
      setSiteVisits(prev => prev.map(item => item.frequency_oid === editingFrequencyOid ? { ...item, visit_frequency: freq } : item));
      setEditingFrequencyOid(null);
      toast.success("Site visit frequency updated");
    } else {
      // Add Mode
      if (siteVisits.some(item => item.site_oid === formSiteOid)) {
        toast.error("This site is already in the planned list");
        return;
      }
      const siteObj = sitesList.find(s => s.oid === formSiteOid);
      const branchObj = branchesList.find(b => b.oid === formBranchOid);
      const clientObj = clientsList.find(c => c.oid === formClientOid);

      const newItem: ConfiguredSiteItem = {
        frequency_oid: Date.now(),
        site_oid: formSiteOid,
        site_name: siteObj?.name || `Site ${formSiteOid}`,
        branch_oid: formBranchOid,
        branch_name: branchObj?.name || null,
        client_oid: formClientOid,
        client_name: clientObj?.name || null,
        visit_frequency: freq,
        visits_done: 0,
      };
      setSiteVisits(prev => [...prev, newItem]);
      setShowAddCard(false);
      toast.success(`Site '${newItem.site_name}' added to list`);
    }

    // Reset inputs
    setFormSiteOid(null);
    setFormSiteFrequency("3");
  };

  // Remove Site Card
  const handleRemoveSite = async (frequencyOid: number) => {
    if (currentPlanOid && frequencyOid < 1000000000000) {
      try {
        setIsSubmitting(true);
        await removeSiteFromPlan(currentPlanOid, frequencyOid);
      } catch (err: any) {
        toast.error(err.message || "Failed to remove site from database");
      } finally {
        setIsSubmitting(false);
      }
    }
    setSiteVisits(prev => prev.filter(item => item.frequency_oid !== frequencyOid));
    toast.success("Site removed from list");
  };

  // Real-time duplicate & similarity search for custom visit inputs against registered data
  const existingMasterMatch = useMemo(() => {
    const branchToUse = customBranchOid || formBranchOid;
    if (!customClientName.trim() || !customSiteName.trim()) {
      return null;
    }
    const normClient = customClientName.trim().toLowerCase();
    const normSite = customSiteName.trim().toLowerCase();

    // Check exact client match in loaded clients
    const matchingClient = clientsList.find(c => c.name.trim().toLowerCase() === normClient);
    if (matchingClient) {
      // Check if site matches in sitesList for this branch
      const matchingSite = sitesList.find(s => 
        s.name.trim().toLowerCase() === normSite &&
        (!branchToUse || s.branch_oid === branchToUse || s.branch_oid === null)
      );
      if (matchingSite) {
        return {
          exact: true,
          client: matchingClient,
          site: matchingSite,
        };
      }

      // Check similar site name under this client
      const similarSite = sitesList.find(s =>
        s.name.trim().toLowerCase().includes(normSite) || normSite.includes(s.name.trim().toLowerCase())
      );
      if (similarSite) {
        return {
          exact: false,
          client: matchingClient,
          site: similarSite,
        };
      }
    } else {
      // Check if client name is similar
      const similarClient = clientsList.find(c =>
        c.name.trim().toLowerCase().includes(normClient) || normClient.includes(c.name.trim().toLowerCase())
      );
      const similarSite = sitesList.find(s =>
        s.name.trim().toLowerCase().includes(normSite) || normSite.includes(s.name.trim().toLowerCase())
      );
      if (similarClient && similarSite) {
        return {
          exact: false,
          client: similarClient,
          site: similarSite,
        };
      }
    }

    return null;
  }, [customClientName, customSiteName, clientsList, sitesList, customBranchOid, formBranchOid]);

  // Handler to switch from custom location form to existing registered site selection
  const handleSelectExistingMatch = (clientOid: number, siteOid: number) => {
    setFormClientOid(clientOid);
    setFormSiteOid(siteOid);
    setFormSiteFrequency(planningPeriod === "single" ? "1" : (customFrequency || "3"));
    setShowCustomLocationCard(false);
    setShowAddCard(true);
    toast.info("Switched to existing registered site selection");
  };

  // Save New Custom Location
  const handleSaveCustomLocation = () => {
    const branchToUse = customBranchOid || formBranchOid;
    if (!branchToUse) {
      toast.error("Please select a Branch for the new visit location");
      return;
    }

    const trimmedClient = customClientName.trim();
    const trimmedSite = customSiteName.trim();
    const trimmedAddress = customAddress.trim();
    const trimmedLat = customLatitude.trim();
    const trimmedLon = customLongitude.trim();

    if (!trimmedClient) {
      toast.error("Client name cannot be empty or contain only whitespace");
      return;
    }
    if (trimmedClient.length > 100) {
      toast.error("Client name must be at most 100 characters");
      return;
    }
    if (!trimmedSite) {
      toast.error("Site/Location name cannot be empty or contain only whitespace");
      return;
    }
    if (trimmedSite.length > 100) {
      toast.error("Site/Location name must be at most 100 characters");
      return;
    }
    if (trimmedAddress.length > 255) {
      toast.error("Visit address must be at most 255 characters");
      return;
    }

    // Coordinates validation
    let parsedLat: number | null = null;
    let parsedLon: number | null = null;
    if ((trimmedLat && !trimmedLon) || (!trimmedLat && trimmedLon)) {
      toast.error("Both latitude and longitude must be entered together, or both left blank");
      return;
    }
    if (trimmedLat && trimmedLon) {
      const lat = parseFloat(trimmedLat);
      const lon = parseFloat(trimmedLon);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        toast.error("Latitude must be a valid number between -90 and 90");
        return;
      }
      if (isNaN(lon) || lon < -180 || lon > 180) {
        toast.error("Longitude must be a valid number between -180 and 180");
        return;
      }
      parsedLat = lat;
      parsedLon = lon;
    }

    const freq = planningPeriod === "single" ? 1 : (parseInt(customFrequency) || 1);
    if (freq <= 0) {
      toast.error("Visit frequency must be a positive number greater than 0");
      return;
    }

    // Check duplicate in customVisits list
    if (customVisits.some(cv => cv.client_name.toLowerCase() === trimmedClient.toLowerCase() && cv.site_name.toLowerCase() === trimmedSite.toLowerCase())) {
      toast.error("This new location is already in the planned list");
      return;
    }

    const branchObj = branchesList.find(b => b.oid === branchToUse);
    const newCustom: CustomVisitResponse = {
      oid: Date.now(),
      plan_oid: currentPlanOid || 0,
      branch_oid: branchToUse,
      branch_name: branchObj?.name || null,
      client_name: trimmedClient,
      site_name: trimmedSite,
      address: trimmedAddress || null,
      latitude: parsedLat,
      longitude: parsedLon,
      visit_frequency: freq,
      is_custom_location: true,
    };

    setCustomVisits(prev => [...prev, newCustom]);

    // Reset form
    setShowCustomLocationCard(false);
    setCustomClientName("");
    setCustomSiteName("");
    setCustomAddress("");
    setCustomLatitude("");
    setCustomLongitude("");
    setCustomFrequency("3");
    toast.success(`New location '${newCustom.site_name}' added to list`);
  };

  // Remove Custom Location
  const handleRemoveCustomVisit = async (customOid: number) => {
    if (currentPlanOid && customOid < 1000000000000) {
      try {
        setIsSubmitting(true);
        await removeCustomVisitFromPlan(currentPlanOid, customOid);
      } catch (err: any) {
        toast.error(err.message || "Failed to remove new location from database");
      } finally {
        setIsSubmitting(false);
      }
    }
    setCustomVisits(prev => prev.filter(item => item.oid !== customOid));
    toast.success("New location removed from list");
  };

  // Formatted date range for weekly period
  const formattedWeekRange = useMemo(() => {
    if (!weekStartDate || !weekEndDate) return "";
    try {
      const start = new Date(weekStartDate);
      const end = new Date(weekEndDate);
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${start.getDate()} ${months[start.getMonth()]} – ${end.getDate()} ${months[end.getMonth()]}`;
    } catch {
      return `${weekStartDate} – ${weekEndDate}`;
    }
  }, [weekStartDate, weekEndDate]);

  // Formatted Single Visit Date
  const formattedSingleDate = useMemo(() => {
    if (!visitDate) return "";
    try {
      const d = new Date(visitDate);
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      return visitDate;
    }
  }, [visitDate]);

  // Save Draft Plan (creates draft on backend and persists all staged items)
  const handleSaveDraftPlan = async (showToast: boolean = true): Promise<number | null> => {
    if (!selectedOfficerOid) {
      toast.error("Please assign a primary Field Officer");
      return null;
    }
    const totalConfigured = siteVisits.length + customVisits.length;
    if (totalConfigured === 0) {
      toast.error("Please add at least one planned site or new location to the list before saving draft");
      return null;
    }

    try {
      setIsSubmitting(true);
      const planOid = await ensureDraftPlanCreated();

      // Persist newly staged registered sites (temp frequency_oid > 1000000000000)
      for (const site of siteVisits) {
        if (site.frequency_oid > 1000000000000) {
          await addSiteToPlan(planOid, {
            site_oid: site.site_oid,
            visit_frequency: site.visit_frequency,
          });
        }
      }

      // Persist newly staged custom locations (temp oid > 1000000000000)
      for (const cv of customVisits) {
        if (cv.oid > 1000000000000) {
          await addCustomVisitToPlan(planOid, {
            branch_oid: cv.branch_oid,
            client_name: cv.client_name,
            site_name: cv.site_name,
            address: cv.address || null,
            latitude: cv.latitude !== null && cv.latitude !== undefined && cv.latitude !== "" ? Number(cv.latitude) : null,
            longitude: cv.longitude !== null && cv.longitude !== undefined && cv.longitude !== "" ? Number(cv.longitude) : null,
            visit_frequency: cv.visit_frequency,
          });
        }
      }

      // Refresh authoritative plan details from backend
      const freshDetails = await getPlanDetails(planOid);
      setSiteVisits(freshDetails.sites || []);
      setCustomVisits(freshDetails.custom_visits || []);
      setPlanCode(freshDetails.plan_code);
      setPlanStatus(freshDetails.status as any);

      if (showToast) {
        toast.success(`Draft plan ${freshDetails.plan_code} saved successfully!`);
      }
      return planOid;
    } catch (err: any) {
      if (err.response?.status === 409) {
        toast.error(
          err.response?.data?.detail || 
          "A site or location in this plan already exists in master data.",
          { duration: 6000 }
        );
      } else {
        toast.error(err.response?.data?.detail || err.message || "Failed to save draft plan");
      }
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Form Publish Validation & Action
  const handlePublishPlan = async () => {
    if (!selectedOfficerOid) {
      toast.error("Please assign a primary Field Officer");
      return;
    }
    const totalConfigured = siteVisits.length + customVisits.length;
    if (totalConfigured === 0) {
      toast.error("Please configure at least one planned site visit or new location requirement");
      return;
    }

    try {
      setIsSubmitting(true);
      // Save staged items without flashing intermediate draft toast
      const planOid = await handleSaveDraftPlan(false);
      if (!planOid) return;

      const published = await publishPlan(planOid);
      setPlanStatus("PUBLISHED");
      setShowPreviewModal(false);
      toast.success(`Visit Plan ${published.plan_code} published and broadcasted to officer!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to publish visit plan");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle plan deletion when in edit/draft phase
  const handleDeleteCurrentPlan = async () => {
    if (!currentPlanOid) return;
    if (confirm(`Are you sure you want to delete planned visit schedule ${planCode || ""}?`)) {
      try {
        setIsSubmitting(true);
        await deletePlan(currentPlanOid);
        toast.success(`Visit plan ${planCode || ""} deleted successfully`);
        navigate("/visit-planning/planned");
      } catch (err: any) {
        toast.error(err.message || "Failed to delete visit plan");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const selectedOfficerName = useMemo(() => {
    const found = officersList.find(o => o.oid === selectedOfficerOid);
    return found ? found.name : "Unassigned";
  }, [officersList, selectedOfficerOid]);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-16">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
        <span className="flex items-center gap-1 text-muted-foreground/80">
          <Calendar className="h-3.5 w-3.5" /> Visit Planning
        </span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-semibold">Plan Visits</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-border/60 pb-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Plan Visits</h1>
          {planCode && (
            <Badge variant="outline" className="text-xs font-bold px-3 py-1 bg-primary/5 text-primary border-primary/20">
              {planCode} ({planStatus})
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">Create weekly, monthly, and single visit schedules for your assigned field officers.</p>
      </div>

      {/* 1. Plan Configurations */}
      <Card className="border border-border/80 bg-white dark:bg-card shadow-sm">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="text-base font-semibold text-primary">1. Plan Configurations</CardTitle>
          <CardDescription className="text-xs">Define plan metadata, scheduling scope, and assign officer responsibilities.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Row 1: Planning Period Selection & Details (Grid) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground/85">Planning Period *</Label>
              <div className="inline-flex p-1 bg-muted/60 dark:bg-muted/30 rounded-xl border border-border/60 w-full">
                <button 
                  type="button"
                  disabled={planStatus === "PUBLISHED"}
                  onClick={() => handlePeriodSwitch("weekly")}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    planningPeriod === "weekly" 
                      ? "bg-[#3B82F6]/10 text-[#3B82F6] shadow-sm font-extrabold" 
                      : "text-muted-foreground hover:text-foreground font-semibold"
                  }`}
                >
                  Weekly Plan
                </button>
                <button 
                  type="button"
                  disabled={planStatus === "PUBLISHED"}
                  onClick={() => handlePeriodSwitch("monthly")}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    planningPeriod === "monthly" 
                      ? "bg-[#3B82F6]/10 text-[#3B82F6] shadow-sm font-extrabold" 
                      : "text-muted-foreground hover:text-foreground font-semibold"
                  }`}
                >
                  Monthly Plan
                </button>
                <button 
                  type="button"
                  disabled={planStatus === "PUBLISHED"}
                  onClick={() => handlePeriodSwitch("single")}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    planningPeriod === "single" 
                      ? "bg-[#3B82F6]/10 text-[#3B82F6] shadow-sm font-extrabold" 
                      : "text-muted-foreground hover:text-foreground font-semibold"
                  }`}
                >
                  Single Visit
                </button>
              </div>
            </div>

            {/* Dynamic Period details */}
            <div className="space-y-1.5">
              {planningPeriod === "weekly" ? (
                <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-100">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Week Start Date *</Label>
                    <Input 
                      type="date" 
                      value={weekStartDate} 
                      disabled={planStatus === "PUBLISHED"}
                      onChange={(e) => setWeekStartDate(e.target.value)} 
                      className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Week End Date *</Label>
                    <Input 
                      type="date" 
                      value={weekEndDate} 
                      disabled={planStatus === "PUBLISHED"}
                      onChange={(e) => setWeekEndDate(e.target.value)} 
                      className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium" 
                    />
                  </div>
                </div>
              ) : planningPeriod === "monthly" ? (
                <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-100">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Month *</Label>
                    <Select value={month} onValueChange={setMonth} disabled={planStatus === "PUBLISHED"}>
                      <SelectTrigger className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium">
                        <SelectValue placeholder="Select Month" />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-popover">
                        {MONTH_NAMES.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Year *</Label>
                    <Select value={year} onValueChange={setYear} disabled={planStatus === "PUBLISHED"}>
                      <SelectTrigger className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium">
                        <SelectValue placeholder="Select Year" />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-popover">
                        {(() => {
                          const curr = new Date().getFullYear();
                          return [curr - 1, curr, curr + 1, curr + 2].map(String);
                        })().map(y => (
                          <SelectItem key={y} value={y}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 animate-in fade-in duration-100">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Visit Date *</Label>
                    <Input 
                      type="date" 
                      value={visitDate} 
                      disabled={planStatus === "PUBLISHED"}
                      onChange={(e) => setVisitDate(e.target.value)} 
                      className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium" 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Staff Assignment & Method selector */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border/20 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="officer" className="text-xs font-bold text-foreground/85">Primary Field Officer *</Label>
              <Select 
                value={selectedOfficerOid ? selectedOfficerOid.toString() : ""} 
                onValueChange={(val) => setSelectedOfficerOid(parseInt(val))}
                disabled={loadingOfficers || planStatus === "PUBLISHED"}
              >
                <SelectTrigger id="officer" className="h-9 text-sm bg-white dark:bg-muted/40 border-input shadow-xs font-medium">
                  <SelectValue placeholder={loadingOfficers ? "Loading Field Officers..." : "Select Field Officer"} />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-popover">
                  {officersList.map(o => (
                    <SelectItem key={o.oid} value={o.oid.toString()}>
                      {o.name} {o.emp_code ? `(${o.emp_code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground/85">Planning Method *</Label>
              <div className="inline-flex p-1 bg-muted/60 dark:bg-muted/30 rounded-xl border border-border/60 w-full">
                <button 
                  type="button"
                  onClick={() => setSelectedMethod("manual")} 
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    selectedMethod === "manual" 
                      ? "bg-[#3B82F6]/10 text-[#3B82F6] shadow-sm font-extrabold" 
                      : "text-muted-foreground hover:text-foreground font-semibold"
                  }`}
                >
                  Manual Planning
                </button>
                <button 
                  type="button"
                  onClick={() => setSelectedMethod("auto")} 
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    selectedMethod === "auto" 
                      ? "bg-[#3B82F6]/10 text-[#3B82F6] shadow-sm font-extrabold" 
                      : "text-muted-foreground hover:text-foreground font-semibold"
                  }`}
                >
                  Auto Generate
                </button>
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Conditionally Display Panel based on selection */}
      {selectedMethod === "auto" ? (
        <Card className="border border-border/80 bg-white dark:bg-card shadow-sm p-6 overflow-hidden relative animate-in fade-in">
          <div className="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 opacity-10 pointer-events-none">
            <Sparkles className="h-64 w-64 text-accent" />
          </div>
          <div className="flex gap-4 items-start">
            <div className="p-3 bg-accent/10 rounded-xl">
              <Sparkles className="h-6 w-6 text-accent" />
            </div>
            <div className="space-y-3 flex-1">
              <div className="space-y-1">
                <h3 className="text-lg font-bold tracking-tight text-primary">AI Visit Planner</h3>
                <p className="text-sm text-muted-foreground">
                  Automatic schedule generation will be available in a future update.
                </p>
              </div>
              <div className="pt-3 border-t border-border/50">
                <p className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-2">
                  Future capabilities:
                </p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                  <li className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="text-accent">•</span> Intelligent officer allocation
                  </li>
                  <li className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="text-accent">•</span> Route optimization
                  </li>
                  <li className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="text-accent">•</span> Workload balancing
                  </li>
                  <li className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="text-accent">•</span> Conflict detection
                  </li>
                  <li className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="text-accent">•</span> Smart scheduling
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-6 transition-all duration-300">

          {/* Section 2: Planned Site Visits */}
          <Card className="border border-border/80 bg-white dark:bg-card shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base font-semibold text-primary">2. Planned Site Visits</CardTitle>
              <CardDescription className="text-xs">Configure branch, client, site, and visit frequency details.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 px-6 pb-6">
              
              {/* Add Site / New Location Buttons */}
              {planStatus !== "PUBLISHED" && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled={isSubmitting}
                    className="h-9 text-xs border-[#3B82F6]/30 text-[#3B82F6] hover:bg-[#3B82F6]/5 font-semibold"
                    onClick={() => {
                      setEditingFrequencyOid(null);
                      setFormSiteOid(null);
                      setFormSiteFrequency(planningPeriod === "single" ? "1" : "3");
                      setShowAddCard(!showAddCard);
                      setShowCustomLocationCard(false);
                    }}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Existing Client Visit
                  </Button>

                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled={isSubmitting}
                    className="h-9 text-xs border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 font-semibold"
                    onClick={() => {
                      setShowCustomLocationCard(!showCustomLocationCard);
                      setShowAddCard(false);
                      setEditingFrequencyOid(null);
                      setCustomFrequency(planningPeriod === "single" ? "1" : "3");
                    }}
                  >
                    <MapPin className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> New Client Visit
                  </Button>
                </div>
              )}

              {/* Inline Add Registered Site Form Card */}
              {showAddCard && planStatus !== "PUBLISHED" && (
                <Card className="border border-border/80 bg-white dark:bg-card p-5 rounded-xl space-y-4 shadow-md animate-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h4 className="text-xs font-bold text-primary uppercase flex items-center gap-1.5">
                      <span>✨</span> Existing Client Visit
                    </h4>
                  </div>
                  <div className={`grid grid-cols-1 sm:grid-cols-2 ${branchesList.length > 1 ? "md:grid-cols-4" : "md:grid-cols-3"} gap-4`}>
                    {branchesList.length > 1 && (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase">Branch *</Label>
                        <Select 
                          value={formBranchOid ? formBranchOid.toString() : ""} 
                          onValueChange={(val) => {
                            setFormBranchOid(parseInt(val));
                            setFormSiteOid(null);
                          }}
                          disabled={loadingBranches}
                        >
                          <SelectTrigger className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium">
                            <SelectValue placeholder={loadingBranches ? "Loading..." : "Select Branch"} />
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-popover">
                            {branchesList.map(b => (
                              <SelectItem key={b.oid} value={b.oid.toString()}>{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Client *</Label>
                      <Select 
                        value={formClientOid ? formClientOid.toString() : ""} 
                        onValueChange={(val) => {
                          setFormClientOid(parseInt(val));
                          setFormSiteOid(null);
                        }}
                        disabled={loadingClients}
                      >
                        <SelectTrigger className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium">
                          <SelectValue placeholder={loadingClients ? "Loading..." : "Select Client"} />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-popover">
                          {clientsList.map(c => (
                            <SelectItem key={c.oid} value={c.oid.toString()}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Site *</Label>
                      <Select 
                        value={formSiteOid ? formSiteOid.toString() : ""} 
                        onValueChange={(val) => setFormSiteOid(parseInt(val))}
                        disabled={loadingSites || sitesList.length === 0}
                      >
                        <SelectTrigger className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium">
                          <SelectValue placeholder={
                            loadingSites 
                              ? "Loading Sites..." 
                              : (!formBranchOid || !formClientOid)
                              ? "Select Branch & Client"
                              : sitesList.length === 0
                              ? "No Sites Found"
                              : "Select Site"
                          } />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-popover">
                          {sitesList.map(s => (
                            <SelectItem key={s.oid} value={s.oid.toString()}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Visit Frequency</Label>
                      {planningPeriod === "single" ? (
                        <Input 
                          value="1 Visit" 
                          disabled 
                          className="h-9 text-xs bg-muted/40 font-bold text-primary"
                        />
                      ) : (
                        <Input 
                          type="number" 
                          min="1" 
                          value={formSiteFrequency} 
                          onChange={(e) => setFormSiteFrequency(e.target.value)} 
                          className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-semibold text-foreground"
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      disabled={isSubmitting}
                      onClick={() => setShowAddCard(false)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      size="sm" 
                      disabled={isSubmitting}
                      onClick={handleSaveSiteCard}
                      className="bg-[#3B82F6] hover:bg-[#2563EB] text-white"
                    >
                      {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Add to List
                    </Button>
                  </div>
                </Card>
              )}

              {/* Inline Add Custom Location Form Card */}
              {showCustomLocationCard && planStatus !== "PUBLISHED" && (
                <Card className="border border-emerald-500/30 bg-white dark:bg-card p-5 rounded-xl space-y-4 shadow-md animate-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" /> New Client Visit
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        Enter details for a new client or site. These details are associated only with this planned visit.
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                      New Client Visit
                    </Badge>
                  </div>

                  {/* Duplicate or Similarity warning banner if match found */}
                  {existingMasterMatch && (
                    <div className={`p-3 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                      existingMasterMatch.exact 
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200" 
                        : "bg-blue-500/10 border-blue-500/30 text-blue-900 dark:text-blue-200"
                    }`}>
                      <div className="space-y-0.5">
                        <span className="font-bold flex items-center gap-1">
                          {existingMasterMatch.exact ? "⚠️ Existing Registered Site Match Found:" : "💡 Similar Registered Site Detected:"}
                        </span>
                        <p className="text-[11px]">
                          <strong>{existingMasterMatch.site.name}</strong> under client <strong>{existingMasterMatch.client.name}</strong> is already registered.
                          {existingMasterMatch.exact ? " Select this site instead to use permanent records." : " Verify if this is the location you intended."}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0 h-8 text-xs font-semibold bg-white dark:bg-card border-amber-500/40 hover:bg-amber-50 text-amber-900 dark:text-amber-100"
                        onClick={() => handleSelectExistingMatch(existingMasterMatch.client.oid, existingMasterMatch.site.oid)}
                      >
                        Use Registered Site Instead
                      </Button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {branchesList.length > 1 && (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase">Branch *</Label>
                        <Select 
                          value={(customBranchOid || formBranchOid) ? (customBranchOid || formBranchOid)!.toString() : ""} 
                          onValueChange={(val) => setCustomBranchOid(parseInt(val))}
                          disabled={loadingBranches}
                        >
                          <SelectTrigger className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium">
                            <SelectValue placeholder={loadingBranches ? "Loading..." : "Select Branch"} />
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-popover">
                            {branchesList.map(b => (
                              <SelectItem key={b.oid} value={b.oid.toString()}>{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Client Name *</Label>
                      <Input 
                        placeholder="e.g. Acme Tech Solutions"
                        value={customClientName}
                        maxLength={100}
                        onChange={(e) => setCustomClientName(e.target.value)}
                        className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Site / Location Name *</Label>
                      <Input 
                        placeholder="e.g. North Distribution Hub"
                        value={customSiteName}
                        maxLength={100}
                        onChange={(e) => setCustomSiteName(e.target.value)}
                        className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium"
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Visit Address (Optional)</Label>
                      <Input 
                        placeholder="e.g. Plot 45, Sector 62, Noida, UP"
                        value={customAddress}
                        maxLength={255}
                        onChange={(e) => setCustomAddress(e.target.value)}
                        className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Visit Frequency *</Label>
                      {planningPeriod === "single" ? (
                        <Input 
                          value="1 Visit" 
                          disabled 
                          className="h-9 text-xs bg-muted/40 font-bold text-primary"
                        />
                      ) : (
                        <Input 
                          type="number" 
                          min="1" 
                          value={customFrequency} 
                          onChange={(e) => setCustomFrequency(e.target.value)} 
                          className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-semibold text-foreground"
                        />
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Latitude (Optional)</Label>
                      <Input 
                        type="number"
                        step="any"
                        placeholder="e.g. 28.6139 (-90 to 90)"
                        value={customLatitude}
                        onChange={(e) => setCustomLatitude(e.target.value)}
                        className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Longitude (Optional)</Label>
                      <Input 
                        type="number"
                        step="any"
                        placeholder="e.g. 77.2090 (-180 to 180)"
                        value={customLongitude}
                        onChange={(e) => setCustomLongitude(e.target.value)}
                        className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/40">
                    <span className="text-[11px] text-muted-foreground">
                      Coordinates must both be entered or both left blank.
                    </span>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        disabled={isSubmitting || isAddingCustomLocation}
                        onClick={() => setShowCustomLocationCard(false)}
                      >
                        Cancel
                      </Button>
                      <Button 
                        size="sm" 
                        disabled={isSubmitting || isAddingCustomLocation}
                        onClick={handleSaveCustomLocation}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                      >
                        {(isSubmitting || isAddingCustomLocation) ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Add to List
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* List of Configured Site Cards & Custom Location Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {siteVisits.length === 0 && customVisits.length === 0 ? (
                  <div className="col-span-full text-center text-muted-foreground py-8 text-sm border border-dashed rounded-xl bg-muted/10">
                    No planned visits configured. Click "Existing Client Visit" or "New Client Visit" to define requirements.
                  </div>
                ) : (
                  <>
                    {/* Registered Sites */}
                    {siteVisits.map((item) => {
                      const isEditing = editingFrequencyOid === item.frequency_oid;
                      
                      return isEditing ? (
                        /* Inline Edit Form Card replacing the site card */
                        <Card key={item.frequency_oid} className="border border-border/80 bg-white dark:bg-card p-4 rounded-xl space-y-4 col-span-1 shadow-md animate-in fade-in duration-200">
                          <div className="flex items-center justify-between border-b pb-1.5">
                            <h4 className="text-xs font-bold text-primary uppercase flex items-center gap-1.5">
                              <span>✏</span> Edit Site Frequency
                            </h4>
                          </div>
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <Label className="text-[9px] font-bold text-muted-foreground uppercase">Site Name</Label>
                              <Input value={item.site_name} disabled className="h-8 text-xs bg-muted/30 font-medium" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[9px] font-bold text-muted-foreground uppercase">Visit Frequency *</Label>
                              {planningPeriod === "single" ? (
                                <Input value="1 Visit" disabled className="h-8 text-xs bg-muted/40 font-bold text-primary" />
                              ) : (
                                <Input 
                                  type="number" 
                                  min="1" 
                                  value={formSiteFrequency} 
                                  onChange={(e) => setFormSiteFrequency(e.target.value)} 
                                  className="h-8 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-semibold text-foreground"
                                />
                              )}
                            </div>
                          </div>
                          <div className="flex justify-end gap-1.5 pt-1">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              disabled={isSubmitting}
                              className="h-7 text-xs px-2.5"
                              onClick={() => setEditingFrequencyOid(null)}
                            >
                              Cancel
                            </Button>
                            <Button 
                              size="sm" 
                              disabled={isSubmitting}
                              className="h-7 text-xs px-2.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white"
                              onClick={handleSaveSiteCard}
                            >
                              {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Save
                            </Button>
                          </div>
                        </Card>
                      ) : (
                        /* Standard Registered Site Card */
                        <Card key={item.frequency_oid} className="border border-border/80 bg-white dark:bg-card p-4 rounded-xl flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow relative col-span-1">
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-bold text-sm text-primary flex items-center gap-1.5 leading-tight">
                                <MapPin className="h-4 w-4 text-accent/80 shrink-0" />
                                {item.site_name}
                              </span>
                            </div>

                            <div className="text-[11px] text-muted-foreground space-y-0.5 pl-5">
                              <div className="truncate">Client: <span className="font-medium text-foreground/80">{item.client_name || "N/A"}</span></div>
                              <div className="truncate">Branch: <span className="font-medium text-foreground/80">{item.branch_name || "N/A"}</span></div>
                            </div>
                            
                            <div className="flex items-center gap-1.5 mt-2 pl-5">
                              <Badge variant="outline" className="bg-[#3B82F6]/5 border-[#3B82F6]/20 text-[#3B82F6] font-bold text-[10px] px-2 py-0.5">
                                {item.visit_frequency} Visit{item.visit_frequency !== 1 ? "s" : ""}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                                {planningPeriod === "weekly" ? "Per Week" : planningPeriod === "monthly" ? "Per Month" : "Single Visit"}
                              </span>
                            </div>

                            {planStatus !== "PUBLISHED" && (
                              <div className="pt-2 border-t border-border/30 flex items-center justify-end text-xs text-muted-foreground mt-3">
                                {/* Actions */}
                                <div className="flex items-center gap-1">
                                  {planningPeriod !== "single" && (
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      disabled={isSubmitting}
                                      className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-muted"
                                      onClick={() => {
                                        setEditingFrequencyOid(item.frequency_oid);
                                        setFormBranchOid(item.branch_oid || null);
                                        setFormClientOid(item.client_oid || null);
                                        setFormSiteOid(item.site_oid);
                                        setFormSiteFrequency(item.visit_frequency.toString());
                                        setShowAddCard(false);
                                        setShowCustomLocationCard(false);
                                      }}
                                      title="Edit Frequency"
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    disabled={isSubmitting}
                                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                    onClick={() => handleRemoveSite(item.frequency_oid)}
                                    title="Delete"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </Card>
                      );
                    })}

                    {/* Custom Location Visits */}
                    {customVisits.map((cv) => (
                      <Card key={`custom-${cv.oid}`} className="border border-emerald-500/25 bg-emerald-500/[0.02] dark:bg-emerald-950/[0.05] p-4 rounded-xl flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow relative col-span-1">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-sm text-primary flex items-center gap-1.5 leading-tight">
                              <MapPin className="h-4 w-4 text-emerald-600 shrink-0" />
                              {cv.site_name}
                            </span>
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800 text-[9px] font-bold px-1.5 py-0.5 shrink-0">
                              New Client Visit
                            </Badge>
                          </div>

                          <div className="text-[11px] text-muted-foreground space-y-0.5 pl-5">
                            <div className="truncate">Client: <span className="font-medium text-foreground/80">{cv.client_name}</span></div>
                            <div className="truncate">Branch: <span className="font-medium text-foreground/80">{cv.branch_name || branchesList.find(b => b.oid === cv.branch_oid)?.name || "N/A"}</span></div>
                            {cv.address && (
                              <div className="truncate text-foreground/70" title={cv.address}>
                                Address: <span className="font-normal">{cv.address}</span>
                              </div>
                            )}
                            {cv.latitude !== null && cv.latitude !== undefined && cv.longitude !== null && cv.longitude !== undefined && (
                              <div className="text-[10px] text-muted-foreground font-mono">
                                GPS: {cv.latitude}, {cv.longitude}
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1.5 mt-2 pl-5">
                            <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold text-[10px] px-2 py-0.5">
                              {cv.visit_frequency} Visit{cv.visit_frequency !== 1 ? "s" : ""}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                              {planningPeriod === "weekly" ? "Per Week" : planningPeriod === "monthly" ? "Per Month" : "Single Visit"}
                            </span>
                          </div>

                          {planStatus !== "PUBLISHED" && (
                            <div className="pt-2 border-t border-border/30 flex items-center justify-end text-xs text-muted-foreground mt-3">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                disabled={isSubmitting}
                                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                onClick={() => handleRemoveCustomVisit(cv.oid)}
                                title="Remove Location"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Action Controls Footer */}
          <div className="border-t border-border/60 pt-6 flex items-center justify-between gap-3">
            <div>
              {/* Delete Option — ONLY available in Edit / Draft phase */}
              {currentPlanOid && planStatus !== "PUBLISHED" && (
                <Button 
                  variant="destructive" 
                  disabled={isSubmitting}
                  className="h-9 text-xs font-semibold rounded-full px-4"
                  onClick={handleDeleteCurrentPlan}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete Plan
                </Button>
              )}

              {/* Edit Plan Option — available when plan is in Published view mode */}
              {currentPlanOid && planStatus === "PUBLISHED" && (
                <Button 
                  variant="outline" 
                  disabled={isSubmitting}
                  className="h-9 text-xs font-semibold rounded-full px-4 border-blue-500/30 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                  onClick={async () => {
                    try {
                      setIsSubmitting(true);
                      await unpublishPlan(currentPlanOid);
                      setPlanStatus("DRAFT");
                      toast.info("Plan switched to editing phase");
                    } catch (err: any) {
                      toast.error(err.message || "Failed to switch plan to edit phase");
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                >
                  <Edit className="mr-1.5 h-3.5 w-3.5" /> Edit Plan
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                disabled={isSubmitting || planStatus === "PUBLISHED" || (siteVisits.length === 0 && customVisits.length === 0)}
                className="h-9 text-xs font-semibold rounded-full px-4 bg-white dark:bg-card border-border shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                onClick={handleSaveDraftPlan}
              >
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Save Draft
              </Button>
              <Button 
                variant="outline" 
                disabled={siteVisits.length === 0 && customVisits.length === 0}
                className="h-9 text-xs font-semibold rounded-full px-4 bg-white dark:bg-card border-border shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 text-foreground"
                onClick={() => setShowPreviewModal(true)}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview Plan
              </Button>
              <Button 
                disabled={isSubmitting || planStatus === "PUBLISHED" || (siteVisits.length === 0 && customVisits.length === 0)}
                className="h-9 text-xs font-semibold rounded-full px-4 bg-[#3B82F6] hover:bg-[#2563EB] text-white shadow-glow-secondary"
                onClick={handlePublishPlan}
              >
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} {planStatus === "PUBLISHED" ? "Plan Published" : "Publish Plan"}
              </Button>
            </div>
          </div>

        </div>
      )}

      {/* Plan Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-[750px] max-h-[85vh] overflow-y-auto custom-scrollbar">
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="text-lg font-bold text-primary flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" /> Plan Preview {planCode ? `(${planCode})` : ""}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Verify your configurations before publishing the visit plan.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-5">
            {/* Header info */}
            <div className="grid grid-cols-2 gap-4 bg-muted/20 p-4 rounded-xl border">
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Planning Scope</span>
                <p className="text-sm font-semibold text-primary">
                  {planningPeriod === "weekly" 
                    ? `Weekly: (${formattedWeekRange})` 
                    : planningPeriod === "monthly"
                    ? `Monthly: ${month} ${year}`
                    : `Single Visit: ${formattedSingleDate}`}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Assigned Staff</span>
                <p className="text-sm font-semibold text-primary">
                  {selectedOfficerName}
                </p>
              </div>
            </div>

            {/* Planned sites */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase block">
                Planned Visits ({siteVisits.length + customVisits.length})
              </span>
              <div className="border rounded-xl overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="text-xs font-bold">Site Location</TableHead>
                      <TableHead className="text-xs font-bold text-center">Visit Frequency</TableHead>
                      <TableHead className="text-xs font-bold">Planning Period</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {siteVisits.map((item) => (
                      <TableRow key={`preview-reg-${item.frequency_oid}`}>
                        <TableCell className="text-xs">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-primary flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 text-accent/80" /> {item.site_name}
                            </span>
                            <span className="text-[10px] text-muted-foreground pl-4.5">
                              {item.client_name || "N/A"} — {item.branch_name || "N/A"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-bold text-center text-foreground/80">
                          {item.visit_frequency} Visit{item.visit_frequency !== 1 ? "s" : ""}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-medium">
                          {planningPeriod === "weekly" ? "Per Week" : planningPeriod === "monthly" ? "Per Month" : "Single Visit"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {customVisits.map((cv) => (
                      <TableRow key={`preview-custom-${cv.oid}`}>
                        <TableCell className="text-xs">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-primary flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 text-emerald-600" /> {cv.site_name}
                              <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800 ml-1 py-0 px-1.5 font-bold">
                                New Client Visit
                              </Badge>
                            </span>
                            <span className="text-[10px] text-muted-foreground pl-4.5">
                              {cv.client_name} {cv.branch_name ? `— ${cv.branch_name}` : ""}
                              {cv.address ? ` • ${cv.address}` : ""}
                              {cv.latitude !== null && cv.latitude !== undefined && cv.longitude !== null && cv.longitude !== undefined ? ` • GPS: ${cv.latitude}, ${cv.longitude}` : ""}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-bold text-center text-foreground/80">
                          {cv.visit_frequency} Visit{cv.visit_frequency !== 1 ? "s" : ""}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-medium">
                          {planningPeriod === "weekly" ? "Per Week" : planningPeriod === "monthly" ? "Per Month" : "Single Visit"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

          </div>

          <DialogFooter className="border-t pt-3">
            <Button variant="outline" size="sm" onClick={() => setShowPreviewModal(false)}>Close Preview</Button>
            {planStatus !== "PUBLISHED" && (
              <Button 
                size="sm" 
                disabled={isSubmitting}
                className="bg-[#3B82F6] hover:bg-[#2563EB] text-white shadow-glow-secondary font-semibold"
                onClick={handlePublishPlan}
              >
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Publish Directly
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
