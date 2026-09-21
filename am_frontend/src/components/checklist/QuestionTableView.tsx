import { Edit, Trash2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Question {
  id: number;
  text: string;
  response_type: string;
  industry: string | null;
  region: string | null;
  category: string | null;
  company_id: number | null;
  company_name: string | null;
  tags: string[] | null;
  options: string[] | null;
}

interface QuestionTableViewProps {
  questions: Question[];
  onEdit: (question: Question) => void;
  onDelete: (question: Question) => void;
}

export default function QuestionTableView({ questions, onEdit, onDelete }: QuestionTableViewProps) {
  return (
    <div className="border border-border/80 rounded-lg bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50/70 dark:bg-slate-900/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[55%] font-bold text-slate-700 dark:text-slate-200">Question</TableHead>
            <TableHead className="font-bold text-slate-700 dark:text-slate-200">Industry</TableHead>
            <TableHead className="font-bold text-slate-700 dark:text-slate-200">Category</TableHead>
            <TableHead className="w-[80px] font-bold text-slate-700 dark:text-slate-200">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-muted-foreground bg-white dark:bg-slate-950">
                No questions found
              </TableCell>
            </TableRow>
          ) : (
            questions.map((q) => (
              <TableRow key={q.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40 bg-white dark:bg-slate-950">
                <TableCell className="font-medium">
                  <p className="line-clamp-2">{q.text}</p>
                  <span className="text-xs text-muted-foreground">{q.response_type}</span>
                </TableCell>
                <TableCell>
                  {q.industry && (
                    <Badge variant="outline" className="text-xs">
                      {q.industry}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {q.category && (
                    <Badge variant="secondary" className="text-xs">
                      {q.category}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg"
                      onClick={() => onEdit(q)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg"
                      onClick={() => onDelete(q)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
