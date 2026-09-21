import { Camera, Video, FileText, MessageSquare, ClipboardList } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface ComposerItem {
  question_id: number;
  text: string;
  response_type?: string;
  is_critical: boolean;
  requires_photo: boolean;
  requires_video: boolean;
  requires_doc: boolean;
  requires_comment: boolean;
}

interface ChecklistPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: ComposerItem[];
  industry?: string | null;
  companyName?: string | null;
  clientName?: string | null;
  siteName?: string | null;
  checkpointName?: string | null;
  roles?: string[];
  loopType?: string;
  description?: string | null;
  createdBy?: string;
  updatedAt?: string | null;
  createdAt?: string | null;
}

const formatJustDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export default function ChecklistPreviewModal({
  open,
  onOpenChange,
  title,
  items,
  industry,
  companyName,
  clientName,
  siteName,
  checkpointName,
  roles,
  loopType,
  description,
  createdBy,
  updatedAt,
  createdAt,
}: ChecklistPreviewModalProps) {
  const completedCount = Math.floor(items.length * 0.3);
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  const MetaField = ({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) => (
    <div className="flex justify-between items-center py-1.5 border-b border-border/50 last:border-b-0">
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span
        className={`text-xs font-semibold leading-tight break-words text-right max-w-[60%] ${
          accent ? "text-blue-600 dark:text-blue-400" : "text-foreground/90"
        }`}
      >
        {value || "—"}
      </span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] md:w-full p-0 gap-0 max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl border border-border flex flex-col">

        {/* ── Header Banner ── */}
        <DialogHeader className="p-0 flex-shrink-0">
          <div className="bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 px-5 py-3 relative overflow-hidden">
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/5" />
            <div className="flex items-center gap-2.5 relative">
              <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-white/15 flex items-center justify-center">
                <ClipboardList className="h-4 w-4 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white text-base font-bold tracking-tight leading-tight">
                  {title || "Untitled Checklist"}
                </DialogTitle>
                <p className="text-white/70 text-[9px] uppercase tracking-widest font-semibold mt-0.5">
                  Checklist Sheet Preview
                </p>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* ── Split Layout Container ── */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden bg-background">
          
          {/* ── Left Sidebar (Metadata Details) ── */}
          <div className="w-full md:w-80 flex-shrink-0 border-b md:border-b-0 md:border-r border-border bg-card p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
            
            {/* Info Fields */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border pb-1">
                Checklist Info
              </h4>
              <div className="flex flex-col">
                <MetaField label="Client" value={clientName || "—"} />
                <MetaField label="Company" value={companyName || "—"} />
                <MetaField label="Site" value={siteName || "—"} accent />
                <MetaField label="Checkpoint" value={checkpointName || "—"} />
                <MetaField
                  label="Required Roles"
                  value={Array.isArray(roles) && roles.length > 0 ? roles.join(", ") : "All Roles"}
                />
                <MetaField label="Loop Type" value={loopType || "Return Patrol"} accent />
                <MetaField label="Industry" value={industry || "—"} />
                <MetaField label="Created By" value={createdBy || "Administrator"} />
                {(updatedAt || createdAt) && (
                  <MetaField
                    label="Updated Date"
                    value={
                      updatedAt
                        ? formatJustDate(updatedAt)
                        : createdAt
                        ? formatJustDate(createdAt)
                        : "—"
                    }
                  />
                )}
              </div>
            </div>

            {/* Description */}
            {description && (
              <div className="pt-3 border-t border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">
                  Description
                </span>
                <p className="text-xs text-foreground/80 leading-relaxed break-words">{description}</p>
              </div>
            )}
          </div>

          {/* ── Right Panel (Questions List) ── */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-muted/10 custom-scrollbar">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
              Checklist Questions ({items.length})
            </h4>
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2 bg-card border border-border rounded-xl">
                <ClipboardList className="h-10 w-10 opacity-30" />
                <span className="text-sm">No questions added yet</span>
              </div>
            ) : (
              <div className="divide-y divide-border bg-card p-4 rounded-xl border border-border">
                {items.map((item, index) => (
                  <div
                    key={item.question_id}
                    className="py-3.5 first:pt-0 last:pb-0 space-y-2.5"
                  >
                    {/* Question Header */}
                    <div className="flex items-start gap-2.5">
                      <span className="text-xs font-bold text-muted-foreground mt-0.5">
                        {index + 1}.
                      </span>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-bold text-foreground leading-snug">{item.text}</p>
                          {item.is_critical && (
                            <Badge
                              variant="destructive"
                              className="text-[8px] uppercase font-extrabold tracking-wider px-1.5 py-0 h-4"
                            >
                              Critical
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Response Buttons */}
                    <div className="flex gap-1.5 max-w-[200px] ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 border-status-active/40 text-status-active text-xs font-semibold py-0"
                        disabled
                      >
                        Yes
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 border-destructive/40 text-destructive text-xs font-semibold py-0"
                        disabled
                      >
                        No
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 border-border text-muted-foreground text-xs font-semibold py-0"
                        disabled
                      >
                        N/A
                      </Button>
                    </div>

                    {/* Remark Field */}
                    {index === 0 && (
                      <div className="pt-1.5 ml-4">
                        <span className="text-[10px] font-bold text-muted-foreground block">
                          Remark <span className="text-destructive/70">(Required for NO)</span>
                        </span>
                      </div>
                    )}

                    {/* Evidence Requirements */}
                    {(item.requires_photo || item.requires_video || item.requires_doc || item.requires_comment) && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5 ml-4">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Evidence:</span>
                        {item.requires_photo && (
                          <Badge variant="outline" className="text-[9px] gap-1 px-1.5 py-0 h-4.5 rounded-full bg-accent/10 text-accent border-accent/20">
                            <Camera className="h-2.5 w-2.5" /> Photo
                          </Badge>
                        )}
                        {item.requires_video && (
                          <Badge variant="outline" className="text-[9px] gap-1 px-1.5 py-0 h-4.5 rounded-full bg-accent/10 text-accent border-accent/20">
                            <Video className="h-2.5 w-2.5" /> Video
                          </Badge>
                        )}
                        {item.requires_doc && (
                          <Badge variant="outline" className="text-[9px] gap-1 px-1.5 py-0 h-4.5 rounded-full bg-accent/10 text-accent border-accent/20">
                            <FileText className="h-2.5 w-2.5" /> Doc
                          </Badge>
                        )}
                        {item.requires_comment && (
                          <Badge variant="outline" className="text-[9px] gap-1 px-1.5 py-0 h-4.5 rounded-full bg-accent/10 text-accent border-accent/20">
                            <MessageSquare className="h-2.5 w-2.5" /> Comment
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
