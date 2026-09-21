import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TagInput from "./TagInput";
import MultipleChoiceOptions from "./MultipleChoiceOptions";

interface Question {
  id: number;
  text: string;
  response_type: string;
  industry: string | null;
  region: string | null;
  category: string | null;
  company_id: number | null;
  tags: string[] | null;
  options: string[] | null;
}

interface Company {
  id: number;
  name: string;
}

interface QuestionEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: Question | null;
  companies: Company[];
  onSave: (data: Partial<Question>) => void;
}

const INDUSTRIES = [
  "Pharmaceutical Industry (Pharma)",
  "Educational Institute / School / College",
  "Warehouse & Logistics",
  "Automobile Industry",
  "Manufacturing Industry",
  "Food & FMCG Industry",
  "Hotel & Hospitality",
  "IT / BPO / Corporate Office",
  "Residential Society / Housing Complex"
];
const CATEGORIES = ["Security", "Safety & health"];
const RESPONSE_TYPES = ["Yes / No / NA", "Multiple Choice", "Free Text"];

export default function QuestionEditModal({
  open,
  onOpenChange,
  question,
  companies,
  onSave,
}: QuestionEditModalProps) {
  const [text, setText] = useState("");
  const [responseType, setResponseType] = useState("Yes / No / NA");
  const [industry, setIndustry] = useState("");
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    if (question) {
      setText(question.text);
      setResponseType(question.response_type);
      setIndustry(question.industry || "");
      setRegion(question.region || "");
      setCategory(question.category || "");
      setCompanyId(question.company_id);
      setTags(question.tags || []);
      setOptions(question.options || []);
    }
  }, [question]);

  const handleSave = () => {
    onSave({
      text,
      response_type: responseType,
      industry: industry || null,
      region: region || null,
      category: category || null,
      company_id: companyId,
      tags: tags.length > 0 ? tags : null,
      options: responseType === "Multiple Choice" && options.length > 0 ? options : null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Question</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Question Text</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter the question text..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Response Type</Label>
              <Select value={responseType} onValueChange={setResponseType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESPONSE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category || "none"} onValueChange={(v) => setCategory(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {responseType === "Multiple Choice" && (
            <MultipleChoiceOptions options={options} onOptionsChange={setOptions} />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Industry</Label>
              <Select value={industry || "none"} onValueChange={(v) => setIndustry(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind} value={ind}>
                      {ind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Region</Label>
              <Input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="e.g., Global"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Company</Label>
            <Select
              value={companyId?.toString() || "none"}
              onValueChange={(v) => setCompanyId(v === "none" ? null : parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select company (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id.toString()}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <TagInput tags={tags} onTagsChange={setTags} placeholder="Add tags..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
