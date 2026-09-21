import { useNavigate } from "react-router-dom";
import { Edit, Trash2, MoreHorizontal, FileText, Eye, CheckCircle, XCircle, ArrowDownToLine } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Checklist {
  id: number;
  title: string;
  industry: string | null;
  company_name: string | null;
  is_active: boolean;
  status: string;
  question_count: number;
  created_at: string | null;
}

interface ChecklistCardProps {
  checklist: Checklist;
  onToggleActive: (id: number) => void;
  onDelete: (checklist: Checklist) => void;
  onPublish: (id: number) => void;
  onDownload: (checklist: Checklist) => void;
  onView: (checklist: Checklist) => void;
  canManage: boolean;
}

const formatJustDate = (dateStr: string | null) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export default function ChecklistCard({
  checklist,
  onToggleActive,
  onDelete,
  onPublish,
  onDownload,
  onView,
  canManage,
}: ChecklistCardProps) {
  const navigate = useNavigate();

  const getStatusBadge = (status: string) => {
    const normalized = (status || "INACTIVE").toUpperCase();
    switch (normalized) {
      case "DRAFT":
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-600 border-yellow-200 font-medium dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20">
            Draft
          </Badge>
        );
      case "ACTIVE":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200 font-medium dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20">
            Active
          </Badge>
        );
      case "INACTIVE":
      default:
        return (
          <Badge variant="outline" className="bg-accent/10 text-accent border-accent/30 font-medium dark:bg-accent/10 dark:text-accent dark:border-accent/30">
            Inactive
          </Badge>
        );
    }
  };

  const isDraft = checklist.status === "DRAFT";
  const isActive = checklist.status === "ACTIVE";

  return (
    <Card className={`border-border transition-all ${checklist.status !== "ACTIVE" ? "opacity-75" : ""}`}>
      <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base leading-tight">{checklist.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {checklist.question_count} questions
            </p>
          </div>
        </div>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onView(checklist)}>
                <Eye className="h-4 w-4 mr-2" />
                View
              </DropdownMenuItem>
              
              {isDraft && (
                <>
                  <DropdownMenuItem onClick={() => navigate(`/composer?edit=${checklist.id}`)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onPublish(checklist.id)}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Publish
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDelete(checklist)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}

              {checklist.status === "INACTIVE" && (
                <>
                  <DropdownMenuItem onClick={() => navigate(`/composer?edit=${checklist.id}`)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDownload(checklist)}>
                    <ArrowDownToLine className="h-4 w-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                </>
              )}

              {isActive && (
                <>
                  <DropdownMenuItem onClick={() => onDownload(checklist)}>
                    <ArrowDownToLine className="h-4 w-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent className="pt-2">
        <div className="flex flex-wrap gap-2 mb-4">
          {getStatusBadge(checklist.status)}
          {checklist.industry && (
            <Badge variant="secondary" className="text-xs">
              {checklist.industry}
            </Badge>
          )}
          {checklist.company_name && (
            <Badge variant="outline" className="text-xs">
              {checklist.company_name}
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            {checklist.created_at
              ? formatJustDate(checklist.created_at)
              : ""}
          </span>
          <div className="flex items-center gap-2">
            {isDraft ? (
              <span className="text-[10px] text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded font-medium border border-yellow-100">
                Draft
              </span>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">
                  {isActive ? "Active" : "Inactive"}
                </span>
                {canManage ? (
                  <Switch
                    checked={isActive}
                    onCheckedChange={() => onToggleActive(checklist.id)}
                  />
                ) : (
                  <Badge variant={isActive ? "default" : "secondary"} className="text-[10px]">
                    {isActive ? "Enabled" : "Disabled"}
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
